// Chime Negotiator engine — deterministic, bounded, rule-driven.
//
// Prototype note: this is NOT a model. It plays a buyer strategy against a
// scripted supplier inside human-set guardrails so the hackathon demo is
// reproducible. The UI must label it as rule-driven assistance. Chime
// prepares; the human approver decides. No PayPal call happens here.

export type Guardrails = {
  /** Hard ceiling per unit, minor units (e.g. centavos). Never exceeded. */
  maxUnitPriceMinor: number;
  /** ISO 4217 code, e.g. "PHP". */
  currency: string;
  /** Latest acceptable delivery, YYYY-MM-DD. */
  latestDelivery: string;
  /** Minimum acceptable warranty, months. */
  minWarrantyMonths: number;
  /** Negotiation rounds before walk-away, 1..10. */
  maxRounds: number;
};

export type SupplierProfile = {
  id: string;
  name: string;
  /** Opening ask per unit, minor units. */
  listUnitPriceMinor: number;
  /** Walk-away floor per unit, minor units. Never conceded below. */
  floorUnitPriceMinor: number;
  /** Offered delivery, YYYY-MM-DD. */
  deliveryDate: string;
  warrantyMonths: number;
};

export type Offer = {
  unitPriceMinor: number;
  deliveryDate: string;
  warrantyMonths: number;
  message: string;
};

export type Turn = {
  round: number;
  actor: "chime" | "supplier";
  offer: Offer;
};

export type NegotiationResult = {
  accepted: boolean;
  rounds: number;
  transcript: Turn[];
  finalOffer: Offer | null;
  /** Accepted total for qty, minor units. 0 when rejected. */
  totalMinor: number;
  /** (list - final) * qty, minor units. 0 when rejected. */
  savingsMinor: number;
  reason: string;
  headroom: Headroom | null;
};

export type Provenance = "human-set" | "supplier-claim";

export type Headroom = {
  /** Ceiling minus final ask per unit, minor units. >= 0 when accepted. */
  unitHeadroomMinor: number;
  /** latestDelivery minus offered delivery, whole days. >= 0 when accepted. */
  daysBeforeDeadline: number;
  /** Offered minus minimum warranty, months. >= 0 when accepted. */
  warrantyMarginMonths: number;
};

/**
 * Distance-to-death: how far each bound can move before the deal breaks.
 * Guardrail-side inputs are human-set facts; supplier-side inputs are
 * supplier claims — the UI labels each figure accordingly.
 */
export function computeHeadroom(finalOffer: Offer, guardrails: Guardrails): Headroom {
  const msPerDay = 24 * 60 * 60 * 1000;
  const latest = Date.parse(`${guardrails.latestDelivery}T00:00:00Z`);
  const offered = Date.parse(`${finalOffer.deliveryDate}T00:00:00Z`);
  return {
    unitHeadroomMinor: guardrails.maxUnitPriceMinor - finalOffer.unitPriceMinor,
    daysBeforeDeadline: Math.round((latest - offered) / msPerDay),
    warrantyMarginMonths: finalOffer.warrantyMonths - guardrails.minWarrantyMonths,
  };
}

function isValidDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
  );
}

function formatMinor(amountMinor: number, currency: string): string {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`;
}

export function runNegotiation(
  item: string,
  qty: number,
  guardrails: Guardrails,
  supplier: SupplierProfile,
): NegotiationResult {
  if (!item || !item.trim()) throw new TypeError("item is required");
  if (!Number.isSafeInteger(qty) || qty <= 0) {
    throw new TypeError("qty must be a positive integer");
  }
  if (
    !Number.isSafeInteger(guardrails.maxUnitPriceMinor) ||
    guardrails.maxUnitPriceMinor <= 0
  ) {
    throw new TypeError("guardrails.maxUnitPriceMinor must be positive");
  }
  if (!/^[A-Z]{3}$/.test(guardrails.currency)) {
    throw new TypeError("guardrails.currency must be ISO 4217");
  }
  if (!isValidDate(guardrails.latestDelivery)) {
    throw new TypeError("guardrails.latestDelivery must be YYYY-MM-DD");
  }
  if (
    !Number.isSafeInteger(guardrails.minWarrantyMonths) ||
    guardrails.minWarrantyMonths < 0
  ) {
    throw new TypeError("guardrails.minWarrantyMonths must be >= 0");
  }
  if (
    !Number.isSafeInteger(guardrails.maxRounds) ||
    guardrails.maxRounds < 1 ||
    guardrails.maxRounds > 10
  ) {
    throw new TypeError("guardrails.maxRounds must be 1..10");
  }
  if (
    !Number.isSafeInteger(supplier.listUnitPriceMinor) ||
    supplier.listUnitPriceMinor <= 0 ||
    !Number.isSafeInteger(supplier.floorUnitPriceMinor) ||
    supplier.floorUnitPriceMinor <= 0 ||
    supplier.floorUnitPriceMinor > supplier.listUnitPriceMinor
  ) {
    throw new TypeError("supplier list/floor prices are invalid");
  }
  if (!isValidDate(supplier.deliveryDate)) {
    throw new TypeError("supplier.deliveryDate must be YYYY-MM-DD");
  }

  const transcript: Turn[] = [];
  const { maxUnitPriceMinor, currency, latestDelivery, minWarrantyMonths, maxRounds } =
    guardrails;

  // Terms gate first: price haggling is pointless when terms already fail.
  if (
    supplier.deliveryDate > latestDelivery ||
    supplier.warrantyMonths < minWarrantyMonths
  ) {
    const offer: Offer = {
      unitPriceMinor: supplier.listUnitPriceMinor,
      deliveryDate: supplier.deliveryDate,
      warrantyMonths: supplier.warrantyMonths,
      message: `${supplier.name} cannot meet terms (delivery ${supplier.deliveryDate}, warranty ${supplier.warrantyMonths}mo). Required: by ${latestDelivery}, ${minWarrantyMonths}mo+. Escalating to human.`,
    };
    transcript.push({ round: 0, actor: "chime", offer });
    return {
      accepted: false,
      rounds: 0,
      transcript,
      finalOffer: null,
      totalMinor: 0,
      savingsMinor: 0,
      reason: "terms_outside_bounds",
      headroom: null,
    };
  }

  // Supplier concedes linearly from list toward floor across the rounds.
  // Chime accepts the first ask at or under the ceiling, stating its bound.
  const spread = supplier.listUnitPriceMinor - supplier.floorUnitPriceMinor;
  for (let round = 1; round <= maxRounds; round += 1) {
    const ask = Math.round(
      supplier.listUnitPriceMinor - (spread * round) / maxRounds,
    );
    transcript.push({
      round,
      actor: "supplier",
      offer: {
        unitPriceMinor: ask,
        deliveryDate: supplier.deliveryDate,
        warrantyMonths: supplier.warrantyMonths,
        message: `${supplier.name} offers ${formatMinor(ask, currency)}/unit for ${qty}x ${item} (round ${round}/${maxRounds}).`,
      },
    });
    if (ask <= maxUnitPriceMinor) {
      const finalOffer: Offer = {
        unitPriceMinor: ask,
        deliveryDate: supplier.deliveryDate,
        warrantyMonths: supplier.warrantyMonths,
        message: `Chime accepts ${formatMinor(ask, currency)}/unit — inside the human-set ceiling of ${formatMinor(maxUnitPriceMinor, currency)}. Ready for human approval.`,
      };
      transcript.push({ round, actor: "chime", offer: finalOffer });
      return {
        accepted: true,
        rounds: round,
        transcript,
        finalOffer,
        totalMinor: ask * qty,
        savingsMinor: (supplier.listUnitPriceMinor - ask) * qty,
        reason: "accepted_within_bounds",
        headroom: computeHeadroom(finalOffer, guardrails),
      };
    }
    transcript.push({
      round,
      actor: "chime",
      offer: {
        unitPriceMinor: ask,
        deliveryDate: supplier.deliveryDate,
        warrantyMonths: supplier.warrantyMonths,
        message: `Chime counters: ${formatMinor(ask, currency)} is over the ceiling of ${formatMinor(maxUnitPriceMinor, currency)}. Can you do better?`,
      },
    });
  }

  const lastAsk = transcript[transcript.length - 1].offer.unitPriceMinor;
  transcript.push({
    round: maxRounds,
    actor: "chime",
    offer: {
      unitPriceMinor: lastAsk,
      deliveryDate: supplier.deliveryDate,
      warrantyMonths: supplier.warrantyMonths,
      message: `No deal after ${maxRounds} rounds — best ask ${formatMinor(lastAsk, currency)} is over the ceiling. Walking away and escalating to human.`,
    },
  });
  return {
    accepted: false,
    rounds: maxRounds,
    transcript,
    finalOffer: null,
    totalMinor: 0,
    savingsMinor: 0,
    reason: "floor_above_maximum",
    headroom: null,
  };
}
