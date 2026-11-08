// Muse Wonder award memos (Meta Model API).
//
// After negotiation, Wonder drafts the approver-facing brief: recommendation,
// deal, terms kept, risks and assumptions. Grounded ONLY in the session's
// synthetic facts — the output must echo the exact total and savings figures
// or it is rejected in favor of the deterministic template. No model output
// ever moves money; the human approval below it does that.
export const WONDER_CHAT_URL = "https://api.meta.ai/v1/chat/completions";
export const WONDER_MODEL = "muse-wonder-1.0";
const API_KEY_ENV_VAR = "META_MODEL_API_KEY";

export type WonderConfig = { apiKey: string };

export function wonderConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WonderConfig | null {
  const apiKey = env[API_KEY_ENV_VAR] ?? "";
  return apiKey ? { apiKey } : null;
}

export type MemoContext = {
  item: string;
  qty: number;
  supplierName: string;
  currency: string;
  listUnitMinor: number;
  finalUnitMinor: number;
  totalMinor: number;
  savingsMinor: number;
  deliveryDate: string;
  warrantyMonths: number;
  rounds: number;
  maxUnitMinor: number;
  latestDelivery: string;
  minWarrantyMonths: number;
};

export function formatMoney(amountMinor: number, currency: string): string {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`;
}

export function wholeDays(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${from}T00:00:00Z`) - Date.parse(`${to}T00:00:00Z`)) / 86400000,
  );
}

export function buildTemplateMemo(ctx: MemoContext): string {
  return [
    `RECOMMENDATION: Approve ${ctx.qty}x ${ctx.item} from ${ctx.supplierName}.`,
    `DEAL: ${formatMoney(ctx.finalUnitMinor, ctx.currency)}/unit (list ${formatMoney(ctx.listUnitMinor, ctx.currency)}), total ${formatMoney(ctx.totalMinor, ctx.currency)}, saving ${formatMoney(ctx.savingsMinor, ctx.currency)} vs list in ${ctx.rounds} rounds.`,
    `TERMS KEPT: delivery ${ctx.deliveryDate} (required by ${ctx.latestDelivery}); warranty ${ctx.warrantyMonths}mo (min ${ctx.minWarrantyMonths}mo); ceiling ${formatMoney(ctx.maxUnitMinor, ctx.currency)}/unit respected.`,
    `HEADROOM: ${formatMoney(ctx.maxUnitMinor - ctx.finalUnitMinor, ctx.currency)}/unit under ceiling; ${wholeDays(ctx.latestDelivery, ctx.deliveryDate)} days before deadline; +${ctx.warrantyMonths - ctx.minWarrantyMonths}mo warranty margin.`,
    "RISKS & ASSUMPTIONS: list price, ask, delivery, and warranty offered are supplier claims (unverified); ceiling, deadline, and minimums are human-set facts. Synthetic demo supplier; no live performance history. Human approval required before any payment.",
  ].join("\n");
}

export function buildMemoPrompt(ctx: MemoContext): string {
  return [
    "Draft a procurement award memo for a human approver. Plain text, four",
    "sections exactly: RECOMMENDATION, DEAL, TERMS KEPT, RISKS & ASSUMPTIONS.",
    "At most 1200 characters. Use ONLY these facts; echo the total and savings",
    "figures verbatim; never invent prices, dates, terms, or supplier history.",
    `Item: ${ctx.qty}x ${ctx.item}. Supplier: ${ctx.supplierName} (synthetic demo).`,
    `List: ${formatMoney(ctx.listUnitMinor, ctx.currency)}/unit. Final: ${formatMoney(ctx.finalUnitMinor, ctx.currency)}/unit.`,
    `Total: ${formatMoney(ctx.totalMinor, ctx.currency)}. Savings vs list: ${formatMoney(ctx.savingsMinor, ctx.currency)}. Rounds: ${ctx.rounds}.`,
    `Delivery ${ctx.deliveryDate} (required by ${ctx.latestDelivery}). Warranty ${ctx.warrantyMonths}mo (min ${ctx.minWarrantyMonths}mo). Ceiling ${formatMoney(ctx.maxUnitMinor, ctx.currency)}/unit respected.`,
    `Headroom: ${formatMoney(ctx.maxUnitMinor - ctx.finalUnitMinor, ctx.currency)}/unit, ${wholeDays(ctx.latestDelivery, ctx.deliveryDate)} days, +${ctx.warrantyMonths - ctx.minWarrantyMonths}mo.`,
    "Tag each figure's provenance: ceiling/deadline/minimums are human-set; list/ask/delivery/warranty offered are supplier claims.",
  ].join("\n");
}

/** The bar every model memo must clear: exact key figures present, sane size. */
export function memoMeetsBar(text: string, ctx: MemoContext): boolean {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 2000) return false;
  return (
    trimmed.includes(formatMoney(ctx.totalMinor, ctx.currency)) &&
    trimmed.includes(formatMoney(ctx.savingsMinor, ctx.currency))
  );
}

export type MemoSource = "muse-wonder" | "template";

export async function generateMemo(
  cfg: WonderConfig | null,
  ctx: MemoContext,
): Promise<{ text: string; source: MemoSource }> {
  const fallback = { text: buildTemplateMemo(ctx), source: "template" as const };
  if (!cfg) return fallback;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(WONDER_CHAT_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${cfg.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: WONDER_MODEL,
          messages: [{ role: "user", content: buildMemoPrompt(ctx) }],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !memoMeetsBar(content, ctx)) continue;
      return { text: content.trim(), source: "muse-wonder" };
    } catch {
      // Fall through to retry, then the template.
    }
  }
  return fallback;
}
