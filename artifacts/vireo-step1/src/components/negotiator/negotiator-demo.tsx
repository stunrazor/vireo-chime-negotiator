// Chime Negotiator demo page — PayPal AI Hackathon prototype.
//
// DEMO ONLY: synthetic suppliers, rule-driven negotiation (no model), PayPal
// Sandbox money, isolated staging ledger. Deliberately outside the
// authenticated workspace so the hackathon demo runs without sign-in.
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, BadgeCheck, CheckCircle2, Handshake, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  approveSession,
  authorizeSession,
  captureSession,
  decimalToMinor,
  getDemoSuppliers,
  minorToDecimal,
  startNegotiation,
  type ApprovalResult,
  type DemoSession,
  type DemoSupplier,
} from "@/lib/negotiator-api";
import { ChimeOrb, type ChimeWorkspaceCue } from "./chime-orb";

type Phase =
  | "setup"
  | "negotiating"
  | "deal"
  | "no-deal"
  | "approving"
  | "approved"
  | "authorizing"
  | "authorized"
  | "capturing"
  | "settled";

const phaseLabel: Record<Phase, string> = {
  setup: "Set guardrails",
  negotiating: "Negotiating",
  deal: "Deal ready",
  "no-deal": "No deal",
  approving: "Approving",
  approved: "Order created",
  authorizing: "Authorizing",
  authorized: "Authorized",
  capturing: "Capturing",
  settled: "Settled",
};

const BUSY_PHASES: Phase[] = ["negotiating", "approving", "authorizing", "capturing"];

function StageStatus({ phase }: { phase: Phase }) {
  const busy = BUSY_PHASES.includes(phase);
  return (
    <span className="font-sans text-2xl font-bold text-foreground">
      {phaseLabel[phase]}
      {busy && (
        <>
          <span aria-hidden="true" className="chime-stage-dots" />
          <span className="sr-only"> (in progress)</span>
        </>
      )}
    </span>
  );
}

const CHIME_PRESENCE: Record<
  Phase,
  { cue: ChimeWorkspaceCue; animate: boolean; speaking: boolean; caption: string }
> = {
  setup: { cue: "monitoring", animate: false, speaking: false, caption: "Set your limits, then start." },
  negotiating: { cue: "monitoring", animate: true, speaking: true, caption: "Haggling inside your limits." },
  deal: { cue: "review", animate: false, speaking: false, caption: "Deal ready — your call." },
  "no-deal": { cue: "blocker", animate: false, speaking: false, caption: "No deal inside your limits." },
  approving: { cue: "monitoring", animate: true, speaking: false, caption: "Creating your PayPal order." },
  approved: { cue: "review", animate: false, speaking: false, caption: "Order created — approve it in PayPal." },
  authorizing: { cue: "monitoring", animate: true, speaking: false, caption: "Holding funds with PayPal." },
  authorized: { cue: "review", animate: false, speaking: false, caption: "Funds held — capture on receipt." },
  capturing: { cue: "monitoring", animate: true, speaking: false, caption: "Capturing on receipt." },
  settled: { cue: "monitoring", animate: false, speaking: false, caption: "Settled and recorded." },
};

export function NegotiatorDemoPage() {
  const [suppliers, setSuppliers] = useState<DemoSupplier[]>([]);
  const [item, setItem] = useState("tablet");
  const [qty, setQty] = useState("8");
  const [supplierId, setSupplierId] = useState("");
  const [maxUnit, setMaxUnit] = useState("900.00");
  const [currency, setCurrency] = useState("USD");
  const [latestDelivery, setLatestDelivery] = useState("2026-11-20");
  const [warranty, setWarranty] = useState("12");
  const [rounds, setRounds] = useState("3");
  const [approver, setApprover] = useState("");
  const [session, setSession] = useState<DemoSession | null>(null);
  const [approval, setApproval] = useState<ApprovalResult | null>(null);
  const [authorizationId, setAuthorizationId] = useState<string | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDemoSuppliers()
      .then(({ suppliers: list }) => {
        setSuppliers(list);
        if (list.length > 0 && !supplierId) setSupplierId(list[0].id);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "suppliers_failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = phase === "negotiating" || phase === "approving" || phase === "authorizing" || phase === "capturing";

  async function onNegotiate() {
    setError(null);
    const qtyValue = Number.parseInt(qty, 10);
    const maxMinor = decimalToMinor(maxUnit);
    const warrantyValue = Number.parseInt(warranty, 10);
    const roundsValue = Number.parseInt(rounds, 10);
    if (!item.trim() || !Number.isSafeInteger(qtyValue) || qtyValue <= 0 || maxMinor === null ||
        !Number.isSafeInteger(warrantyValue) || warrantyValue < 0 ||
        !Number.isSafeInteger(roundsValue) || roundsValue < 1 || roundsValue > 10 || !supplierId) {
      setError("Check the form: item, positive qty, max price like 900.00, warranty, 1-10 rounds, supplier.");
      return;
    }
    setPhase("negotiating");
    try {
      const { session: created } = await startNegotiation({
        item: item.trim(),
        qty: qtyValue,
        supplierId,
        guardrails: {
          maxUnitPriceMinor: maxMinor,
          currency,
          latestDelivery,
          minWarrantyMonths: warrantyValue,
          maxRounds: roundsValue,
        },
      });
      setSession(created);
      setApproval(null);
      setAuthorizationId(null);
      setCaptureId(null);
      setPhase(created.result.accepted ? "deal" : "no-deal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "negotiation_failed");
      setPhase("setup");
    }
  }

  async function onApprove() {
    if (!session || !approver.trim()) {
      setError("Enter the approver name — a recorded human approval is required.");
      return;
    }
    setError(null);
    setPhase("approving");
    try {
      const result = await approveSession(session.id, approver.trim());
      setApproval(result);
      setPhase("approved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "approval_failed");
      setPhase("deal");
    }
  }

  async function onAuthorize() {
    if (!session) return;
    setError(null);
    setPhase("authorizing");
    try {
      const result = await authorizeSession(session.id);
      setAuthorizationId(result.authorizationId);
      setPhase("authorized");
    } catch (err) {
      setError(err instanceof Error ? err.message : "authorize_failed");
      setPhase("approved");
    }
  }

  async function onCapture() {
    if (!session) return;
    setError(null);
    setPhase("capturing");
    try {
      const result = await captureSession(session.id);
      setCaptureId(result.captureId);
      setPhase("settled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "capture_failed");
      setPhase("authorized");
    }
  }

  function reset() {
    setSession(null);
    setApproval(null);
    setAuthorizationId(null);
    setCaptureId(null);
    setError(null);
    setPhase("setup");
  }

  const presence = CHIME_PRESENCE[phase];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center">
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
                alt="Vireo"
                className="h-12 w-auto"
              />
              <span className="mt-1 font-sans text-2xl font-extrabold tracking-tight text-foreground">
                Vireo
              </span>
            </div>
            <p className="text-sm font-semibold text-muted-foreground">
              Smart from Request to Payment
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-sans text-xl font-bold">Chime Negotiator</h1>
            <Badge variant="destructive">DEMO ONLY</Badge>
            <Badge variant="secondary">SYNTHETIC DATA</Badge>
            <Badge variant="secondary">AI DIALOGUE + DETERMINISTIC BOUNDS</Badge>
            <Badge variant="secondary">PAYPAL SANDBOX</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-base text-foreground">
            A buyer sets the limits. Agents haggle. The buyer pays — settled on
            PayPal.
          </p>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            The human&apos;s Approve click is the payment-initiation event — no
            approval, no PayPal call.
          </p>
          <div className="mt-4 flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <ChimeOrb
              state={presence.cue}
              animate={presence.animate}
              speaking={presence.speaking}
              className="size-32"
            />
            <div>
              <p className="font-sans text-lg font-bold">Chime</p>
              <p className="text-sm text-muted-foreground">
                Vireo&apos;s Workspace Agent
              </p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm">
            <span className="font-semibold text-muted-foreground">Current stage:</span>
            <StageStatus phase={phase} />
          </p>
        </header>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Something needs attention</AlertTitle>
            <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Handshake className="h-5 w-5" /> 1. Guardrails &amp; request
              </CardTitle>
              <CardDescription>
                Human-set bounds. The agents cannot exceed them — anything outside
                returns to a human.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="neg-item">Item</Label>
                  <Input id="neg-item" value={item} onChange={(event) => setItem(event.target.value)} disabled={busy} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="neg-qty">Quantity</Label>
                  <Input id="neg-qty" inputMode="numeric" value={qty} onChange={(event) => setQty(event.target.value)} disabled={busy} />
                </div>
                <div className="grid gap-2">
                  <Label>Supplier (synthetic)</Label>
                  <Select value={supplierId} onValueChange={setSupplierId} disabled={busy || suppliers.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a demo supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name} — list {minorToDecimal(supplier.listUnitPriceMinor)} (claim)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="neg-max">Max unit price <span className="font-normal text-muted-foreground">(human-set)</span></Label>
                  <Input id="neg-max" inputMode="decimal" value={maxUnit} onChange={(event) => setMaxUnit(event.target.value)} disabled={busy} />
                </div>
                <div className="grid gap-2">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency} disabled={busy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PHP">PHP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="neg-date">Latest delivery <span className="font-normal text-muted-foreground">(human-set)</span></Label>
                  <Input id="neg-date" type="date" value={latestDelivery} onChange={(event) => setLatestDelivery(event.target.value)} disabled={busy} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="neg-warranty">Min warranty (months) <span className="font-normal text-muted-foreground">(human-set)</span></Label>
                  <Input id="neg-warranty" inputMode="numeric" value={warranty} onChange={(event) => setWarranty(event.target.value)} disabled={busy} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="neg-rounds">Max rounds (1-10)</Label>
                  <Input id="neg-rounds" inputMode="numeric" value={rounds} onChange={(event) => setRounds(event.target.value)} disabled={busy} />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={onNegotiate} disabled={busy}>
                  Start negotiation <ArrowRight className="h-4 w-4" />
                </Button>
                {session && (
                  <Button variant="secondary" onClick={reset} disabled={busy}>
                    Reset demo
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {session && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">2. Negotiation transcript</CardTitle>
                <CardDescription>
                  {session.supplier.name} vs Chime · {session.qty}x {session.item} ·{" "}
                  {session.result.accepted
                    ? `deal in round ${session.result.rounds}`
                    : `no deal (${session.result.reason})`}
                  {" "}· dialogue: {session.dialogueSource === "muse-spark" ? "Muse Spark" : "templates (offline)"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="grid gap-3">
                  {session.result.transcript.map((turn, index) => (
                    <li key={index} className="rounded-md border border-border bg-muted/40 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant={turn.actor === "chime" ? "default" : "secondary"}>
                          {turn.actor === "chime" ? "Chime (buyer)" : `${session.supplier.name} (supplier)`}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          round {turn.round} · {session.guardrails.currency} {minorToDecimal(turn.offer.unitPriceMinor)}/unit · supplier claim
                        </span>
                      </div>
                      <p className="text-sm">{turn.offer.message}</p>
                    </li>
                  ))}
                </ol>
                <Separator className="my-4" />
                {session.result.accepted && session.result.finalOffer ? (
                  <>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      <BadgeCheck className="h-5 w-5" /> Deal ready for human approval
                    </span>
                    <span>
                      Unit: <span className="font-mono font-semibold">{session.guardrails.currency} {minorToDecimal(session.result.finalOffer.unitPriceMinor)}</span>
                    </span>
                    <span>
                      Total: <span className="font-mono font-semibold">{session.guardrails.currency} {minorToDecimal(session.result.totalMinor)}</span>
                    </span>
                    <span>
                      Saved vs list: <span className="font-mono font-semibold">{session.guardrails.currency} {minorToDecimal(session.result.savingsMinor)}</span>
                    </span>
                    {session.result.headroom && (
                      <span>
                        Headroom:{" "}
                        <span className="font-mono font-semibold">
                          {session.guardrails.currency} {minorToDecimal(session.result.headroom.unitHeadroomMinor)}/unit ·{" "}
                          {session.result.headroom.daysBeforeDeadline}d · +{session.result.headroom.warrantyMarginMonths}mo
                        </span>
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Ceiling, deadline, minimums: human-set. List, ask, delivery, warranty offered: supplier claims (unverified in demo).
                  </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Walked away within bounds. The agents cannot exceed the ceiling —
                    a human decides what happens next.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {session?.result.accepted && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5" /> 3. Human approval → PayPal Sandbox
                </CardTitle>
                <CardDescription>
                  The Approve click is the payment-initiation event. It creates the
                  PayPal order and the staging transfer together.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {session.memo && (
                  <div className="rounded-md border border-border bg-muted/40 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="default">Award memo</Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {session.memo.source === "muse-wonder" ? "Muse Wonder" : "template (offline)"}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{session.memo.text}</p>
                  </div>
                )}
                {!approval ? (
                  <div className="grid gap-2 sm:max-w-sm">
                    <Label htmlFor="neg-approver">Approver name</Label>
                    <div className="flex gap-2">
                      <Input
                        id="neg-approver"
                        placeholder="e.g. Maria Santos"
                        value={approver}
                        onChange={(event) => setApprover(event.target.value)}
                        disabled={busy}
                      />
                      <Button onClick={onApprove} disabled={busy}>
                        Approve <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <dl className="grid gap-2 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <dt className="text-muted-foreground">Approved by:</dt>
                      <dd className="font-semibold">{approval.approvedBy}</dd>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <dt className="text-muted-foreground">Demo ref:</dt>
                      <dd className="font-mono">{approval.demoRef}</dd>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <dt className="text-muted-foreground">PayPal order:</dt>
                      <dd className="font-mono">{approval.orderId}</dd>
                    </div>
                    {approval.approveUrl && (
                      <div className="flex flex-wrap items-center gap-2">
                        <dt className="text-muted-foreground">Buyer approval:</dt>
                        <dd>
                          <a
                            className="font-semibold underline"
                            href={approval.approveUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open PayPal Sandbox approval
                          </a>{" "}
                          <span className="text-muted-foreground">(sandbox buyer account, then come back)</span>
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </CardContent>
            </Card>
          )}

          {approval && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5" /> 4. Authorize → capture → settled
                </CardTitle>
                <CardDescription>
                  Each step writes to the staging ledger. Webhooks may follow — the
                  ledger dedupes and never regresses.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={onAuthorize} disabled={busy || !!authorizationId}>
                    Mark buyer-approved &amp; authorize
                  </Button>
                  {authorizationId && (
                    <span className="font-mono text-xs">auth {authorizationId}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={onCapture} disabled={busy || !authorizationId || !!captureId}>
                    Capture on receipt
                  </Button>
                  {captureId && <span className="font-mono text-xs">capture {captureId}</span>}
                </div>
                {captureId && (
                  <p className="text-sm font-semibold">
                    Settled in Sandbox. Transfer {approval.demoRef} reconciled in the
                    staging ledger — agents talked, humans paid.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
