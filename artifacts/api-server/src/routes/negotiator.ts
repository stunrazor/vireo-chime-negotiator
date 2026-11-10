// Chime Negotiator prototype routes (PayPal Sandbox, staging only).
//
// Flow: negotiate (rule-driven, no money) -> human approve (creates the
// PayPal order AND the staging transfer) -> buyer approval in PayPal ->
// authorize -> capture on synthetic receipt -> webhook reconciliation.
//
// Doctrine, enforced structurally: no PayPal call and no transfer row can
// exist without an accepted deal plus a recorded human approval. Sessions
// live in process memory (prototype limitation: restart loses them and
// webhooks for lost sessions are rejected, never guessed).
import { createHash, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  runNegotiation,
  type Guardrails,
  type NegotiationResult,
  type SupplierProfile,
} from "../lib/negotiator";
import {
  authorizeOrder,
  captureAuthorization,
  createAuthorizeOrder,
  getOrder,
  mapPayPalEvent,
  paypalConfigFromEnv,
  verifyWebhookSignature,
} from "../lib/paypal";
import { callStagingRpc, stagingConfigFromEnv } from "../lib/staging";
import { rewriteDialogue, sparkConfigFromEnv } from "../lib/spark";
import { generateMemo, wonderConfigFromEnv } from "../lib/wonder";
import { decodeAudioB64, transcribeAudio, voiceConfigFromEnv } from "../lib/voice";

const router: IRouter = Router();

// Synthetic demo suppliers. Clearly marked; no real supplier data.
const DEMO_SUPPLIERS: SupplierProfile[] = [
  {
    id: "demo-alpha",
    name: "Demo Supplier Alpha",
    listUnitPriceMinor: 95000,
    floorUnitPriceMinor: 81860,
    deliveryDate: "2026-11-15",
    warrantyMonths: 12,
  },
  {
    id: "demo-beta",
    name: "Demo Supplier Beta",
    listUnitPriceMinor: 92000,
    floorUnitPriceMinor: 87000,
    deliveryDate: "2026-11-13",
    warrantyMonths: 24,
  },
  {
    id: "demo-stubborn",
    name: "Demo Supplier Stubborn",
    listUnitPriceMinor: 96000,
    floorUnitPriceMinor: 94000,
    deliveryDate: "2026-11-14",
    warrantyMonths: 12,
  },
];

type Session = {
  id: string;
  item: string;
  qty: number;
  guardrails: Guardrails;
  supplier: SupplierProfile;
  result: NegotiationResult;
  dialogueSource: "muse-spark" | "template";
  memo: { text: string; source: "muse-wonder" | "template" } | null;
  approvedBy: string | null;
  demoRef: string | null;
  transferId: string | null;
  paypalOrderId: string | null;
  approveUrl: string | null;
  authorizationId: string | null;
  captureId: string | null;
};

const sessions = new Map<string, Session>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseGuardrails(value: unknown): Guardrails | null {
  if (!isRecord(value)) return null;
  const { maxUnitPriceMinor, currency, latestDelivery, minWarrantyMonths, maxRounds } = value;
  if (
    !Number.isSafeInteger(maxUnitPriceMinor) ||
    (maxUnitPriceMinor as number) <= 0 ||
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/.test(currency) ||
    (currency !== "PHP" && currency !== "USD") ||
    typeof latestDelivery !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(latestDelivery) ||
    !Number.isSafeInteger(minWarrantyMonths) ||
    (minWarrantyMonths as number) < 0 ||
    !Number.isSafeInteger(maxRounds) ||
    (maxRounds as number) < 1 ||
    (maxRounds as number) > 10
  ) {
    return null;
  }
  return {
    maxUnitPriceMinor: maxUnitPriceMinor as number,
    currency,
    latestDelivery,
    minWarrantyMonths: minWarrantyMonths as number,
    maxRounds: maxRounds as number,
  };
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

router.get("/negotiator/suppliers", (_req, res) => {
  res.json({
    synthetic: true,
    suppliers: DEMO_SUPPLIERS.map((supplier) => ({
      ...supplier,
      demo: true,
    })),
  });
});

// Voice transcription for the approver name (Muse Voice Transcribe).
// JSON keeps the endpoint dependency-free (app-wide 10mb body cap covers
// base64 clips). Only 400s for a missing/oversize/undecodable upload;
// voice API failures return source "setup-required"/"unavailable" with
// HTTP 200, like the other advisory model calls.
router.post("/negotiator/transcribe", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const filename =
    typeof body["filename"] === "string" && body["filename"].trim()
      ? body["filename"].trim().slice(0, 100)
      : "clip.wav";
  let audio: Buffer;
  try {
    audio = decodeAudioB64(typeof body["audio_b64"] === "string" ? body["audio_b64"] : "");
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "voice_audio_invalid" });
    return;
  }
  res.json(await transcribeAudio(voiceConfigFromEnv(), audio, filename));
});

router.post("/negotiator/sessions", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const item = typeof body["item"] === "string" ? body["item"].trim() : "";
  const qty = body["qty"];
  const supplierId = body["supplierId"];
  const guardrails = parseGuardrails(body["guardrails"]);
  const supplier = DEMO_SUPPLIERS.find((entry) => entry.id === supplierId);
  if (!item || !Number.isSafeInteger(qty) || (qty as number) <= 0 || !guardrails || !supplier) {
    res.status(400).json({ error: "invalid_negotiation_request" });
    return;
  }
  let result: NegotiationResult;
  try {
    result = runNegotiation(item, qty as number, guardrails, supplier);
  } catch {
    res.status(400).json({ error: "invalid_negotiation_request" });
    return;
  }
  // AI voices the lines (Muse Spark when keyed, templates offline). Numbers
  // and outcome stay deterministic; the session records which source voiced it.
  const voiced = await rewriteDialogue(
    sparkConfigFromEnv(),
    item,
    qty as number,
    result.transcript,
  );
  result = { ...result, transcript: voiced.transcript };
  // Award memo (Wonder when keyed, template offline). Accepted deals get the
  // full brief; walk-aways get a deterministic escalation note, no model call.
  const finalOffer = result.finalOffer;
  const memo =
    result.accepted && finalOffer
      ? await generateMemo(wonderConfigFromEnv(), {
          item,
          qty: qty as number,
          supplierName: supplier.name,
          currency: guardrails.currency,
          listUnitMinor: supplier.listUnitPriceMinor,
          finalUnitMinor: finalOffer.unitPriceMinor,
          totalMinor: result.totalMinor,
          savingsMinor: result.savingsMinor,
          deliveryDate: finalOffer.deliveryDate,
          warrantyMonths: finalOffer.warrantyMonths,
          rounds: result.rounds,
          maxUnitMinor: guardrails.maxUnitPriceMinor,
          latestDelivery: guardrails.latestDelivery,
          minWarrantyMonths: guardrails.minWarrantyMonths,
        })
      : {
          text: `No deal for ${qty as number}x ${item}: ${result.reason}. The agents stayed inside human-set bounds and walked away. A human decides what happens next.`,
          source: "template" as const,
        };
  const session: Session = {
    id: randomUUID(),
    item,
    qty: qty as number,
    guardrails,
    supplier,
    result,
    dialogueSource: voiced.source,
    memo,
    approvedBy: null,
    demoRef: null,
    transferId: null,
    paypalOrderId: null,
    approveUrl: null,
    authorizationId: null,
    captureId: null,
  };
  sessions.set(session.id, session);
  res.status(201).json({ session });
});

// THE initiation gate. Human approval + accepted deal are both mandatory.
// Creates the PayPal Sandbox order first, then the staging transfer row.
router.post("/negotiator/sessions/:id/approve", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "session_not_found" });
    return;
  }
  if (!session.result.accepted || !session.result.finalOffer) {
    res.status(400).json({ error: "no_accepted_deal" });
    return;
  }
  if (session.transferId) {
    res.status(409).json({ error: "already_approved" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const approvedBy = typeof body["approvedBy"] === "string" ? body["approvedBy"].trim() : "";
  if (!approvedBy || approvedBy.length > 200) {
    res.status(400).json({ error: "approver_required" });
    return;
  }
  const paypal = paypalConfigFromEnv();
  const staging = stagingConfigFromEnv();
  if (!paypal || !staging) {
    res.status(503).json({ error: "negotiator_not_configured" });
    return;
  }
  try {
    const demoRef = `DEMO-NEG-${randomUUID().slice(0, 8).toUpperCase()}`;
    const order = await createAuthorizeOrder(paypal, {
      invoiceRef: demoRef,
      amountMinor: session.result.totalMinor,
      currency: session.guardrails.currency,
    });
    const transferId = await callStagingRpc<string>(staging, "vireo_create_negotiator_transfer", {
      p_demo_ref: demoRef,
      p_provider_payment_id: demoRef,
      p_paypal_order_id: order.orderId,
      p_amount_minor: session.result.totalMinor,
      p_currency_code: session.guardrails.currency,
      p_approved_by_label: approvedBy,
    });
    session.approvedBy = approvedBy;
    session.demoRef = demoRef;
    session.transferId = transferId;
    session.paypalOrderId = order.orderId;
    session.approveUrl = order.approveUrl;
    res.status(201).json({
      transferId,
      demoRef,
      orderId: order.orderId,
      approveUrl: order.approveUrl,
      approvedBy,
    });
  } catch (error) {
    res.status(502).json({
      error: "approval_failed",
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
});

// After the buyer approves the order in PayPal (Sandbox buyer account).
router.post("/negotiator/sessions/:id/authorize", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.paypalOrderId || !session.transferId || !session.demoRef) {
    res.status(404).json({ error: "session_not_approved" });
    return;
  }
  const paypal = paypalConfigFromEnv();
  const staging = stagingConfigFromEnv();
  if (!paypal || !staging) {
    res.status(503).json({ error: "negotiator_not_configured" });
    return;
  }
  if (session.authorizationId) {
    // Idempotent replay: same ledger event id, dedupe makes it safe.
    const replayed = await callStagingRpc<unknown>(staging, "vireo_apply_negotiator_event", {
      p_transfer_id: session.transferId,
      p_provider_event_id: `api-authorize-${session.paypalOrderId}`,
      p_provider_payment_id: session.demoRef,
      p_status: "accepted",
      p_currency_code: session.guardrails.currency,
      p_amount_minor: session.result.totalMinor,
      p_occurred_at: new Date().toISOString(),
      p_payload_sha256: sha256Hex(session.paypalOrderId),
    });
    res.json({
      authorizationId: session.authorizationId,
      status: "AUTHORIZED",
      replay: true,
      ledger: replayed,
    });
    return;
  }
  try {
    let auth: { authorizationId: string; status: string };
    try {
      auth = await authorizeOrder(paypal, session.paypalOrderId, `neg-${session.id}-authorize`);
    } catch (error) {
      // Authorized out-of-band already (double click, retry): recover the
      // existing authorization instead of failing.
      if (!String((error as Error)?.message ?? "").includes("ORDER_ALREADY_AUTHORIZED")) throw error;
      const existing = await getOrder(paypal, session.paypalOrderId);
      if (!existing.authorizationId) throw error;
      auth = { authorizationId: existing.authorizationId, status: "AUTHORIZED" };
    }
    session.authorizationId = auth.authorizationId;
    // Direct ledger write for demo reliability (webhooks may follow; the
    // ledger dedupes by event id and never regresses state).
    const applied = await callStagingRpc<unknown>(staging, "vireo_apply_negotiator_event", {
      p_transfer_id: session.transferId,
      p_provider_event_id: `api-authorize-${session.paypalOrderId}`,
      p_provider_payment_id: session.demoRef,
      p_status: "accepted",
      p_currency_code: session.guardrails.currency,
      p_amount_minor: session.result.totalMinor,
      p_occurred_at: new Date().toISOString(),
      p_payload_sha256: sha256Hex(session.paypalOrderId),
    });
    res.json({ authorizationId: auth.authorizationId, status: auth.status, ledger: applied });
  } catch (error) {
    res.status(502).json({
      error: "authorize_failed",
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
});

// Capture on synthetic goods receipt. Full amount only in the prototype:
// partial capture needs amount-match rules that are not built yet.
router.post("/negotiator/sessions/:id/capture", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.authorizationId || !session.transferId || !session.demoRef) {
    res.status(404).json({ error: "session_not_authorized" });
    return;
  }
  const paypal = paypalConfigFromEnv();
  const staging = stagingConfigFromEnv();
  if (!paypal || !staging) {
    res.status(503).json({ error: "negotiator_not_configured" });
    return;
  }
  if (session.captureId) {
    res.status(409).json({ error: "already_captured", captureId: session.captureId });
    return;
  }
  try {
    const capture = await captureAuthorization(paypal, session.authorizationId, {
      requestId: `neg-${session.id}-capture`,
    });
    session.captureId = capture.captureId;
    const applied = await callStagingRpc<unknown>(staging, "vireo_apply_negotiator_event", {
      p_transfer_id: session.transferId,
      p_provider_event_id: `api-capture-${capture.captureId}`,
      p_provider_payment_id: session.demoRef,
      p_status: "settled",
      p_currency_code: session.guardrails.currency,
      p_amount_minor: session.result.totalMinor,
      p_occurred_at: new Date().toISOString(),
      p_payload_sha256: sha256Hex(capture.captureId),
    });
    res.json({ captureId: capture.captureId, status: capture.status, ledger: applied });
  } catch (error) {
    res.status(502).json({
      error: "capture_failed",
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
});

router.get("/negotiator/sessions/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "session_not_found" });
    return;
  }
  res.json({ session });
});

// PayPal Sandbox webhook receiver. Verifies PayPal's own signature, maps the
// event to the ledger contract, resolves the transfer via the in-memory
// session index (same-process prototype limitation), and applies it.
router.post("/paypal/webhook", async (req, res) => {
  const paypal = paypalConfigFromEnv();
  const staging = stagingConfigFromEnv();
  if (!paypal || !staging) {
    res.status(503).json({ error: "negotiator_not_configured" });
    return;
  }
  const event = req.body as Record<string, unknown>;
  const verified = await verifyWebhookSignature(
    paypal,
    req.headers as Record<string, string>,
    event,
  ).catch(() => false);
  if (!verified) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }
  const eventType = typeof event["event_type"] === "string" ? (event["event_type"] as string) : "";
  const status = mapPayPalEvent(eventType);
  const eventId = typeof event["id"] === "string" ? (event["id"] as string) : "";
  const resource = isRecord(event["resource"]) ? event["resource"] : null;
  const amount = resource && isRecord(resource["amount"]) ? resource["amount"] : null;
  const value = amount && typeof amount["value"] === "string" ? amount["value"] : "";
  const currency = amount && typeof amount["currency_code"] === "string" ? amount["currency_code"] : "";
  const createTime = typeof event["create_time"] === "string" ? (event["create_time"] as string) : "";
  if (!status || !eventId || !resource || !value || !currency || !createTime) {
    res.status(400).json({ error: "unsupported_event" });
    return;
  }
  // Resolve the session: order-approval events carry the demo ref in
  // custom_id; later events resolve via stored PayPal ids (same process).
  const customId =
    resource["custom_id"] ??
    (Array.isArray(resource["purchase_units"])
      ? (resource["purchase_units"] as Array<Record<string, unknown>>)[0]?.["custom_id"]
      : undefined);
  const resourceId = typeof resource["id"] === "string" ? (resource["id"] as string) : "";
  let session: Session | undefined;
  for (const entry of sessions.values()) {
    if (
      (typeof customId === "string" && entry.demoRef === customId) ||
      (resourceId && (entry.paypalOrderId === resourceId || entry.authorizationId === resourceId || entry.captureId === resourceId))
    ) {
      session = entry;
      break;
    }
  }
  if (!session?.transferId || !session.demoRef) {
    res.status(409).json({ error: "transfer_not_found" });
    return;
  }
  const amountMinor = Math.round(Number.parseFloat(value) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    res.status(400).json({ error: "invalid_amount" });
    return;
  }
  try {
    const applied = await callStagingRpc<unknown>(staging, "vireo_apply_negotiator_event", {
      p_transfer_id: session.transferId,
      p_provider_event_id: eventId,
      p_provider_payment_id: session.demoRef,
      p_status: status,
      p_currency_code: currency,
      p_amount_minor: amountMinor,
      p_occurred_at: createTime,
      p_payload_sha256: sha256Hex(JSON.stringify(event)),
    });
    res.json({ ok: true, ledger: applied });
  } catch {
    res.status(409).json({ error: "payment_event_rejected" });
  }
});

export default router;
