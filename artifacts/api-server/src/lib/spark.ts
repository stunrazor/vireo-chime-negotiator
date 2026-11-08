// Muse Spark dialogue for negotiation transcripts (Meta Model API).
//
// The model ONLY voices lines. Prices, rounds, delivery, warranty, and the
// accept/walk-away outcome stay deterministic (see negotiator.ts). The prompt
// carries synthetic demo context only — never live procurement records.
// Any failure (no key, network, bad payload) falls back to the deterministic
// templates, and the session records which source voiced it.
export const SPARK_CHAT_URL = "https://api.meta.ai/v1/chat/completions";
export const SPARK_MODEL = "muse-spark-1.3";
const API_KEY_ENV_VAR = "META_MODEL_API_KEY";

export type SparkConfig = { apiKey: string };

export function sparkConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SparkConfig | null {
  const apiKey = env[API_KEY_ENV_VAR] ?? "";
  return apiKey ? { apiKey } : null;
}

export type DialogueTurn = { actor: "chime" | "supplier"; draft: string };

export function buildDialoguePrompt(
  item: string,
  qty: number,
  turns: DialogueTurn[],
): string {
  const lines = [
    "Rewrite each draft negotiation line below. Return ONLY a JSON array of",
    `exactly ${turns.length} strings, same order, one per draft.`,
    "Voice: Chime is a warm professional buyer agent; the supplier is a concise seller.",
    "Rules: at most 240 characters per line; keep every number, price, date,",
    "and warranty exactly as drafted; never invent prices, dates, terms, or facts.",
    "Synthetic demo data for procurement haggling over:",
    `${qty}x ${item}.`,
    "Drafts:",
  ];
  turns.forEach((turn, index) => {
    lines.push(`${index + 1}. [${turn.actor}] ${turn.draft}`);
  });
  return lines.join("\n");
}

export function extractJsonArray(text: string): string {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("spark_dialogue_no_array");
  return text.slice(start, end + 1);
}

export function applyDialogueRewrite<T extends { offer: { message: string } }>(
  transcript: T[],
  texts: unknown,
): T[] | null {
  if (!Array.isArray(texts) || texts.length !== transcript.length) return null;
  for (const text of texts) {
    if (typeof text !== "string" || !text.trim() || text.length > 600) return null;
  }
  return transcript.map((turn, index) => ({
    ...turn,
    offer: { ...turn.offer, message: (texts[index] as string).trim() },
  }));
}

export type DialogueSource = "muse-spark" | "template";

export async function rewriteDialogue<T extends { offer: { message: string } }>(
  cfg: SparkConfig | null,
  item: string,
  qty: number,
  transcript: Array<T & { actor: "chime" | "supplier" }>,
): Promise<{
  transcript: Array<T & { actor: "chime" | "supplier" }>;
  source: DialogueSource;
}> {
  if (!cfg || transcript.length === 0) return { transcript, source: "template" };
  // Two attempts: model output shape is stochastic; validation stays strict
  // and anything less than exact still falls back to templates.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(SPARK_CHAT_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${cfg.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: SPARK_MODEL,
          messages: [
            {
              role: "user",
              content: buildDialoguePrompt(
                item,
                qty,
                transcript.map((turn) => ({ actor: turn.actor, draft: turn.offer.message })),
              ),
            },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") continue;
      const applied = applyDialogueRewrite(
        transcript,
        JSON.parse(extractJsonArray(content)),
      );
      if (!applied) continue;
      return { transcript: applied, source: "muse-spark" };
    } catch {
      // Fall through to retry, then templates.
    }
  }
  return { transcript, source: "template" };
}
