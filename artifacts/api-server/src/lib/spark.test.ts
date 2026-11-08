// Maintained test for the Spark dialogue layer (offline-capable parts only;
// no network, no key). Runner: node --test src/lib/spark.test.ts (Node 24+).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyDialogueRewrite,
  buildDialoguePrompt,
  extractJsonArray,
  sparkConfigFromEnv,
} from "./spark.ts";

describe("spark dialogue", () => {
  it("builds a grounded prompt carrying only synthetic facts", () => {
    const prompt = buildDialoguePrompt("laptop", 20, [
      { actor: "supplier", draft: "We offer PHP 1500.00/unit." },
      { actor: "chime", draft: "Too high." },
    ]);
    assert.ok(prompt.includes("20x laptop"));
    assert.ok(prompt.includes("exactly 2 strings"));
    assert.ok(prompt.includes("never invent"));
  });

  it("extracts a JSON array from prose-wrapped model output", () => {
    assert.deepEqual(
      extractJsonArray('Here you go: ["a", "b"] thanks'),
      '["a", "b"]',
    );
    assert.throws(() => extractJsonArray("no array here"));
  });

  it("applies rewrites only when shape is exact", () => {
    const transcript = [
      { actor: "supplier", offer: { message: "draft one" } },
      { actor: "chime", offer: { message: "draft two" } },
    ];
    const applied = applyDialogueRewrite(transcript, ["one!", "two!"]);
    assert.ok(applied);
    assert.equal(applied[0].offer.message, "one!");
    assert.equal(applyDialogueRewrite(transcript, ["only-one"]), null);
    assert.equal(applyDialogueRewrite(transcript, ["ok", 42]), null);
    assert.equal(applyDialogueRewrite(transcript, ["ok", ""]), null);
  });

  it("reads config only from the documented env var", () => {
    assert.equal(sparkConfigFromEnv({}), null);
    assert.deepEqual(sparkConfigFromEnv({ META_MODEL_API_KEY: "k" }), {
      apiKey: "k",
    });
  });
});
