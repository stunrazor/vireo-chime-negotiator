// Maintained test for the Wonder memo layer (offline parts only; no network,
// no key). Runner: node --test src/lib/wonder.test.ts (Node 24+).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMemoPrompt,
  buildTemplateMemo,
  memoMeetsBar,
  wonderConfigFromEnv,
  type MemoContext,
} from "./wonder.ts";

const ctx: MemoContext = {
  item: "laptop",
  qty: 20,
  supplierName: "Demo Supplier Alpha",
  currency: "PHP",
  listUnitMinor: 150000,
  finalUnitMinor: 136667,
  totalMinor: 2733340,
  savingsMinor: 266660,
  deliveryDate: "2026-11-15",
  warrantyMonths: 12,
  rounds: 2,
  maxUnitMinor: 140000,
  latestDelivery: "2026-11-20",
  minWarrantyMonths: 12,
};

describe("wonder memo", () => {
  it("builds a template memo carrying exact figures and sections", () => {
    const memo = buildTemplateMemo(ctx);
    assert.ok(memo.includes("RECOMMENDATION"));
    assert.ok(memo.includes("RISKS & ASSUMPTIONS"));
    assert.ok(memo.includes("HEADROOM"));
    assert.ok(memo.includes("supplier claims"));
    assert.ok(memo.includes("PHP 27333.40"));
    assert.ok(memo.includes("PHP 2666.60"));
  });

  it("grounds the prompt in synthetic facts only", () => {
    const prompt = buildMemoPrompt(ctx);
    assert.ok(prompt.includes("20x laptop"));
    assert.ok(prompt.includes("Demo Supplier Alpha"));
    assert.ok(prompt.includes("Use ONLY these facts"));
    assert.ok(prompt.includes("never invent"));
  });

  it("accepts model memos only when key figures echo verbatim", () => {
    assert.equal(
      memoMeetsBar("Deal total PHP 27333.40 with savings PHP 2666.60 bh.", ctx),
      true,
    );
    assert.equal(memoMeetsBar("A fine deal with no figures.", ctx), false);
    assert.equal(memoMeetsBar("", ctx), false);
    assert.equal(memoMeetsBar(`ok PHP 27333.40 PHP 2666.60 ${"x".repeat(3000)}`, ctx), false);
  });

  it("reads config only from the documented env var", () => {
    assert.equal(wonderConfigFromEnv({}), null);
    assert.deepEqual(wonderConfigFromEnv({ META_MODEL_API_KEY: "k" }), {
      apiKey: "k",
    });
  });
});
