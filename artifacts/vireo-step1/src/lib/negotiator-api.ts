// Client for the Chime Negotiator prototype API (api-server, staging only).
// Same-origin by default; point at the api-server in dev with
// VITE_NEGOTIATOR_API="http://localhost:5000". All demo data is synthetic.
const base = (import.meta.env.VITE_NEGOTIATOR_API as string | undefined) ?? "";

export type DemoSupplier = {
  id: string;
  name: string;
  listUnitPriceMinor: number;
  floorUnitPriceMinor: number;
  deliveryDate: string;
  warrantyMonths: number;
  demo: boolean;
};

export type DemoTurn = {
  round: number;
  actor: "chime" | "supplier";
  offer: {
    unitPriceMinor: number;
    deliveryDate: string;
    warrantyMonths: number;
    message: string;
  };
};

export type DemoSession = {
  id: string;
  item: string;
  qty: number;
  guardrails: {
    maxUnitPriceMinor: number;
    currency: string;
    latestDelivery: string;
    minWarrantyMonths: number;
    maxRounds: number;
  };
  supplier: DemoSupplier;
  dialogueSource: "muse-spark" | "template";
  memo: { text: string; source: "muse-wonder" | "template" } | null;
  result: {
    accepted: boolean;
    rounds: number;
    transcript: DemoTurn[];
    finalOffer: DemoTurn["offer"] | null;
    totalMinor: number;
    savingsMinor: number;
    reason: string;
    headroom: {
      unitHeadroomMinor: number;
      daysBeforeDeadline: number;
      warrantyMarginMonths: number;
    } | null;
  };
};

export type ApprovalResult = {
  transferId: string;
  demoRef: string;
  orderId: string;
  approveUrl: string | null;
  approvedBy: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}/api${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string };
  if (!res.ok) {
    const detail = typeof data.detail === "string" && data.detail ? `: ${data.detail}` : "";
    throw new Error(`${data.error ?? `request_failed:${res.status}`}${detail}`);
  }
  return data;
}

export function getDemoSuppliers(): Promise<{ synthetic: boolean; suppliers: DemoSupplier[] }> {
  return request("/negotiator/suppliers");
}

export function startNegotiation(args: {
  item: string;
  qty: number;
  supplierId: string;
  guardrails: DemoSession["guardrails"];
}): Promise<{ session: DemoSession }> {
  return request("/negotiator/sessions", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function approveSession(sessionId: string, approvedBy: string): Promise<ApprovalResult> {
  return request(`/negotiator/sessions/${sessionId}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvedBy }),
  });
}

export function authorizeSession(sessionId: string): Promise<{
  authorizationId: string;
  status: string;
}> {
  return request(`/negotiator/sessions/${sessionId}/authorize`, { method: "POST" });
}

export function captureSession(sessionId: string): Promise<{
  captureId: string;
  status: string;
}> {
  return request(`/negotiator/sessions/${sessionId}/capture`, { method: "POST" });
}

export function minorToDecimal(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

export function decimalToMinor(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  return Math.round(Number.parseFloat(value.trim()) * 100);
}
