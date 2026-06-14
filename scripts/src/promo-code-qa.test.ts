import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://localhost/promo_code_qa";

const {
  evaluatePromoCode,
  isValidPromoEmail,
  normalizePromoCode,
  normalizePromoEmail,
  promoRejectionMessage,
} = await import("../../artifacts/api-server/src/services/payments/promoCodes");

const future = new Date("2027-01-01T00:00:00.000Z");
const past = new Date("2025-01-01T00:00:00.000Z");
const now = new Date("2026-06-14T12:00:00.000Z");

const activePromo = {
  active: true,
  expiresAt: future,
  maxRedemptions: null,
  maxRedemptionsPerEmail: 1,
};

assert.equal(normalizePromoCode(" solar trial "), "SOLARTRIAL");
assert.equal(normalizePromoEmail(" Customer@Example.COM "), "customer@example.com");
assert.equal(isValidPromoEmail("customer@example.com"), true);
assert.equal(isValidPromoEmail("not-an-email"), false);

assert.deepEqual(evaluatePromoCode({
  promo: activePromo,
  totalRedemptions: 0,
  emailRedemptions: 0,
  projectAlreadyRedeemed: false,
  now,
}), { ok: true });

assert.deepEqual(evaluatePromoCode({
  promo: null,
  totalRedemptions: 0,
  emailRedemptions: 0,
  projectAlreadyRedeemed: false,
  now,
}), { ok: false, reason: "invalid" });

assert.deepEqual(evaluatePromoCode({
  promo: { ...activePromo, active: false },
  totalRedemptions: 0,
  emailRedemptions: 0,
  projectAlreadyRedeemed: false,
  now,
}), { ok: false, reason: "inactive" });

assert.deepEqual(evaluatePromoCode({
  promo: { ...activePromo, expiresAt: past },
  totalRedemptions: 0,
  emailRedemptions: 0,
  projectAlreadyRedeemed: false,
  now,
}), { ok: false, reason: "expired" });

assert.deepEqual(evaluatePromoCode({
  promo: activePromo,
  totalRedemptions: 1,
  emailRedemptions: 1,
  projectAlreadyRedeemed: false,
  now,
}), { ok: false, reason: "already_used" });

assert.deepEqual(evaluatePromoCode({
  promo: activePromo,
  totalRedemptions: 1,
  emailRedemptions: 0,
  projectAlreadyRedeemed: true,
  now,
}), { ok: false, reason: "already_used" });

assert.deepEqual(evaluatePromoCode({
  promo: { ...activePromo, maxRedemptions: 2 },
  totalRedemptions: 2,
  emailRedemptions: 0,
  projectAlreadyRedeemed: false,
  now,
}), { ok: false, reason: "usage_limit_reached" });

assert.match(promoRejectionMessage("invalid"), /Invalid/);
assert.match(promoRejectionMessage("inactive"), /inactive/);
assert.match(promoRejectionMessage("expired"), /expired/);
assert.match(promoRejectionMessage("already_used"), /already been used/);
assert.match(promoRejectionMessage("usage_limit_reached"), /usage limit/);

console.log("ok - promo code validation, expiration, reuse, and usage limits");
