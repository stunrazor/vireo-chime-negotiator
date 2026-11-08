// Maintained test for the Chime Negotiator engine.
// Runner: plain Node test runner, no framework.
//   node --test src/lib/negotiator.test.ts
// (from artifacts/api-server with Node 24+)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runNegotiation } from "./negotiator.ts";

const base = {
  item: "laptop",
  qty: 20,
  guardrails: {
    maxUnitPriceMinor: 140000,
    currency: "PHP",
    latestDelivery: "2026-11-20",
    minWarrantyMonths: 12,
    maxRounds: 3,
  },
  supplier: {
    id: "demo-alpha",
    name: "Demo Supplier Alpha",
    listUnitPriceMinor: 150000,
    floorUnitPriceMinor: 130000,
    deliveryDate: "2026-11-15",
    warrantyMonths: 12,
  },
};

describe("runNegotiation", () => {
  it("accepts the first ask at or under the ceiling", () => {
    const result = runNegotiation(
      base.item,
      base.qty,
      base.guardrails,
      base.supplier,
    );
    assert.equal(result.accepted, true);
    assert.equal(result.reason, "accepted_within_bounds");
    assert.ok(result.finalOffer);
    assert.ok(result.finalOffer.unitPriceMinor <= base.guardrails.maxUnitPriceMinor);
    assert.equal(result.totalMinor, result.finalOffer.unitPriceMinor * base.qty);
    assert.equal(
      result.savingsMinor,
      (base.supplier.listUnitPriceMinor - result.finalOffer.unitPriceMinor) * base.qty,
    );
  });

  it("rejects when the supplier floor is above the ceiling", () => {
    const result = runNegotiation(base.item, base.qty, base.guardrails, {
      ...base.supplier,
      floorUnitPriceMinor: 145000,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "floor_above_maximum");
    assert.equal(result.finalOffer, null);
    assert.equal(result.totalMinor, 0);
    const last = result.transcript[result.transcript.length - 1];
    assert.equal(last.actor, "chime");
  });

  it("rejects up front when terms fail the bounds", () => {
    const late = runNegotiation(base.item, base.qty, base.guardrails, {
      ...base.supplier,
      deliveryDate: "2026-12-01",
    });
    assert.equal(late.accepted, false);
    assert.equal(late.reason, "terms_outside_bounds");
    assert.equal(late.rounds, 0);
  });

  it("never exceeds the ceiling across a sweep of bounds", () => {
    for (const max of [120000, 130000, 135000, 140000, 150000]) {
      for (const rounds of [1, 3, 5]) {
        const result = runNegotiation(base.item, base.qty, {
          ...base.guardrails,
          maxUnitPriceMinor: max,
          maxRounds: rounds,
        }, base.supplier);
        if (result.accepted) {
          assert.ok(
            result.finalOffer!.unitPriceMinor <= max,
            `final ${result.finalOffer!.unitPriceMinor} over ceiling ${max}`,
          );
        }
      }
    }
  });

  it("alternates supplier and chime turns every round", () => {
    const result = runNegotiation(
      base.item,
      base.qty,
      base.guardrails,
      base.supplier,
    );
    assert.ok(result.transcript.length >= 2);
    for (let index = 0; index < result.transcript.length - 1; index += 2) {
      assert.equal(result.transcript[index].actor, "supplier");
      assert.equal(result.transcript[index + 1].actor, "chime");
    }
  });

  it("throws on invalid input", () => {
    assert.throws(() => runNegotiation("", base.qty, base.guardrails, base.supplier));
    assert.throws(() => runNegotiation(base.item, 0, base.guardrails, base.supplier));
    assert.throws(() =>
      runNegotiation(base.item, base.qty, { ...base.guardrails, currency: "php" }, base.supplier),
    );
    assert.throws(() =>
      runNegotiation(base.item, base.qty, { ...base.guardrails, maxRounds: 0 }, base.supplier),
    );
  });

  describe("headroom", () => {
    it("reports distance-to-death on accepted deals", () => {
      const result = runNegotiation(base.item, base.qty, base.guardrails, base.supplier);
      assert.ok(result.headroom);
      assert.equal(
        result.headroom.unitHeadroomMinor,
        base.guardrails.maxUnitPriceMinor - result.finalOffer!.unitPriceMinor,
      );
      assert.equal(result.headroom.daysBeforeDeadline, 5);
      assert.equal(result.headroom.warrantyMarginMonths, 0);
    });

    it("is null when there is no deal", () => {
      const rejected = runNegotiation(base.item, base.qty, base.guardrails, {
        ...base.supplier,
        floorUnitPriceMinor: 145000,
      });
      assert.equal(rejected.headroom, null);
    });
  });
});
