// PayPal Sandbox client for the Chime Negotiator prototype.
//
// Sandbox ONLY (https://api-m.sandbox.paypal.com). No live credentials, no
// real funds. Fails closed: every function throws when credentials are absent
// or PayPal answers non-2xx. Only 2-decimal currencies (USD/PHP) in the demo.

import { randomUUID } from "node:crypto";

const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  webhookId?: string;
};

export function paypalConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PayPalConfig | null {
  const clientId = env["PAYPAL_CLIENT_ID"] ?? "";
  const clientSecret = env["PAYPAL_CLIENT_SECRET"] ?? "";
  if (!clientId || !clientSecret) return null;
  const webhookId = env["PAYPAL_WEBHOOK_ID"] || undefined;
  return { clientId, clientSecret, webhookId };
}

/** Minor units -> PayPal decimal string, e.g. 27200 -> "272.00". */
export function minorToDecimal(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new TypeError("amount must be a positive integer");
  }
  return (amountMinor / 100).toFixed(2);
}

async function paypalFailure(res: Response, op: string): Promise<never> {
  let name = "";
  try {
    const data = (await res.json()) as { name?: string };
    if (typeof data.name === "string" && data.name) name = `:${data.name}`;
  } catch {
    // Non-JSON error body: status alone must do.
  }
  throw new Error(`${op}:${res.status}${name}`);
}

async function accessToken(cfg: PayPalConfig): Promise<string> {
  const res = await fetch(`${SANDBOX_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`paypal_auth_failed:${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("paypal_auth_failed:empty");
  return data.access_token;
}

export type PayPalOrder = { orderId: string; approveUrl: string | null };

export async function createAuthorizeOrder(
  cfg: PayPalConfig,
  args: { invoiceRef: string; amountMinor: number; currency: string },
): Promise<PayPalOrder> {
  const token = await accessToken(cfg);
  const res = await fetch(`${SANDBOX_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      intent: "AUTHORIZE",
      purchase_units: [
        {
          invoice_id: args.invoiceRef,
          custom_id: args.invoiceRef,
          amount: {
            currency_code: args.currency,
            value: minorToDecimal(args.amountMinor),
          },
        },
      ],
    }),
  });
  if (!res.ok) await paypalFailure(res, "paypal_order_failed");
  const data = (await res.json()) as {
    id: string;
    links?: Array<{ rel?: string; href?: string }>;
  };
  const approveUrl =
    data.links?.find((link) => link.rel === "approve")?.href ?? null;
  return { orderId: data.id, approveUrl };
}

export type PayPalAuthorization = { authorizationId: string; status: string };

export async function authorizeOrder(
  cfg: PayPalConfig,
  orderId: string,
  requestId?: string,
): Promise<PayPalAuthorization> {
  const token = await accessToken(cfg);
  const res = await fetch(
    `${SANDBOX_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "PayPal-Request-Id": requestId ?? randomUUID(),
      },
      body: "{}",
    },
  );
  if (!res.ok) await paypalFailure(res, "paypal_authorize_failed");
  const data = (await res.json()) as {
    purchase_units?: Array<{
      payments?: { authorizations?: Array<{ id?: string; status?: string }> };
    }>;
  };
  const auth = data.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth?.id) throw new Error("paypal_authorize_failed:empty");
  return { authorizationId: auth.id, status: auth.status ?? "CREATED" };
}

export async function getOrder(
  cfg: PayPalConfig,
  orderId: string,
): Promise<{ status: string; authorizationId: string | null }> {
  const token = await accessToken(cfg);
  const res = await fetch(
    `${SANDBOX_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) await paypalFailure(res, "paypal_order_get_failed");
  const data = (await res.json()) as {
    status?: string;
    purchase_units?: Array<{
      payments?: { authorizations?: Array<{ id?: string }> };
    }>;
  };
  return {
    status: data.status ?? "UNKNOWN",
    authorizationId:
      data.purchase_units?.[0]?.payments?.authorizations?.[0]?.id ?? null,
  };
}

export type PayPalCapture = { captureId: string; status: string };

export async function captureAuthorization(
  cfg: PayPalConfig,
  authorizationId: string,
  args?: { amountMinor?: number; currency?: string; requestId?: string },
): Promise<PayPalCapture> {
  const token = await accessToken(cfg);
  const body =
    args?.amountMinor !== undefined && args.currency
      ? {
          amount: {
            currency_code: args.currency,
            value: minorToDecimal(args.amountMinor),
          },
        }
      : {};
  const res = await fetch(
    `${SANDBOX_BASE}/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "PayPal-Request-Id": args?.requestId ?? randomUUID(),
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) await paypalFailure(res, "paypal_capture_failed");
  const data = (await res.json()) as { id?: string; status?: string };
  if (!data.id) throw new Error("paypal_capture_failed:empty");
  return { captureId: data.id, status: data.status ?? "COMPLETED" };
}

export type WebhookHeaders = {
  "paypal-auth-algo": string;
  "paypal-cert-url": string;
  "paypal-transmission-id": string;
  "paypal-transmission-sig": string;
  "paypal-transmission-time": string;
};

export async function verifyWebhookSignature(
  cfg: PayPalConfig,
  headers: Partial<Record<string, string | undefined>>,
  event: unknown,
): Promise<boolean> {
  if (!cfg.webhookId) return false;
  const get = (name: keyof WebhookHeaders): string | undefined =>
    headers[name] ?? headers[name.toUpperCase()];
  const payload = {
    auth_algo: get("paypal-auth-algo"),
    cert_url: get("paypal-cert-url"),
    transmission_id: get("paypal-transmission-id"),
    transmission_sig: get("paypal-transmission-sig"),
    transmission_time: get("paypal-transmission-time"),
    webhook_id: cfg.webhookId,
    webhook_event: event,
  };
  if (Object.values(payload).some((value) => value === undefined)) return false;
  const token = await accessToken(cfg);
  const res = await fetch(
    `${SANDBOX_BASE}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) return false;
  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}

export type LedgerStatus =
  | "accepted"
  | "processing"
  | "settled"
  | "failed"
  | "reversed";

/** PayPal event -> staging ledger status. Unknown events map to null (drop). */
export function mapPayPalEvent(eventType: string): LedgerStatus | null {
  switch (eventType) {
    case "CHECKOUT.ORDER.APPROVED":
    case "PAYMENT.AUTHORIZATION.CREATED":
      return "accepted";
    case "PAYMENT.AUTHORIZATION.VOIDED":
      return "failed";
    case "PAYMENT.CAPTURE.PENDING":
      return "processing";
    case "PAYMENT.CAPTURE.COMPLETED":
      return "settled";
    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.FAILED":
      return "failed";
    case "PAYMENT.CAPTURE.REFUNDED":
    case "PAYMENT.CAPTURE.REVERSED":
      return "reversed";
    default:
      return null;
  }
}
