/**
 * Promo / trial code redemption tests — integration tests against the running
 * dev server. Verifies every server-validated state and that a redeemed code
 * unlocks the paid PDF report without any Stripe payment.
 *
 * Run (server must be running on :8080):
 *   pnpm --filter @workspace/api-server test
 *
 * States covered: valid, invalid, inactive, expired, limit-reached, used
 * (double-submit), plus token enforcement and the already-unlocked short-circuit.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { pool } from "@workspace/db";

const BASE = process.env.API_BASE_URL ?? "http://localhost:8080/api";
const SUFFIX = randomUUID().slice(0, 8).toUpperCase();

const EXPIRED_CODE = `E2EEXP_${SUFFIX}`;
const INACTIVE_CODE = `E2EINACT_${SUFFIX}`;
const LIMIT1_CODE = `E2ELIMIT_${SUFFIX}`;

const createdProjectIds: number[] = [];
let fixtureCodeIds: number[] = [];

function email(): string {
  return `e2e+${randomUUID().slice(0, 12)}@example.com`;
}

async function createProject(): Promise<{ id: number; accessToken: string }> {
  const res = await fetch(`${BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name:              `Promo Test ${randomUUID().slice(0, 8)}`,
      address:           "123 Test St",
      city:              "Sacramento",
      state:             "CA",
      zip:               "95814",
      installationType:  "roof",
      systemType:        "grid-tied",
      annualKwh:         12000,
      monthlyBill:       180,
      utilityRatePerKwh: 0.25,
      backupHours:       0,
      batteryChemistry:  "lifepo4",
      hasGenerator:      false,
      wantsGenerator:    false,
      shadeLevel:        "none",
      roofPitch:         "20",
      roofDirection:     "South",
      availableSqft:     600,
      snowArea:          false,
      highWindArea:      false,
      budgetTier:        "mid-range",
    }),
  });
  assert.equal(res.status, 201, "POST /projects must return 201");
  const body = await res.json() as { id: number; accessToken: string };
  createdProjectIds.push(body.id);
  return { id: body.id, accessToken: body.accessToken };
}

async function calculate(id: number, accessToken: string): Promise<void> {
  const res = await fetch(`${BASE}/projects/${id}/calculate`, {
    method: "POST",
    headers: { "x-access-token": accessToken },
  });
  assert.equal(res.status, 200, "calculate must persist a calculationResult");
}

async function redeem(id: number, accessToken: string | null, code: string, mail: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["x-access-token"] = accessToken;
  const res = await fetch(`${BASE}/projects/${id}/redeem-code`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code, email: mail }),
  });
  const body = await res.json().catch(() => ({})) as { state?: string; unlocked?: boolean; message?: string };
  return { status: res.status, body };
}

describe("Promo code redemption", () => {
  before(async () => {
    const rows = await pool.query(
      `INSERT INTO promo_codes (code, description, entitlement_type, granted_plan, max_redemptions, redemption_count, active, expires_at)
       VALUES
         ($1, 'e2e expired',  'promo_trial', 'homeowner_report', NULL, 0, true,  now() - interval '1 day'),
         ($2, 'e2e inactive', 'promo_trial', 'homeowner_report', NULL, 0, false, NULL),
         ($3, 'e2e limited',  'promo_trial', 'homeowner_report', 1,    0, true,  NULL)
       RETURNING id`,
      [EXPIRED_CODE, INACTIVE_CODE, LIMIT1_CODE],
    );
    fixtureCodeIds = rows.rows.map((r: { id: number }) => r.id);
  });

  after(async () => {
    if (createdProjectIds.length) {
      await pool.query(`DELETE FROM promo_redemptions WHERE project_id = ANY($1::int[])`, [createdProjectIds]);
      await pool.query(`DELETE FROM projects WHERE id = ANY($1::int[])`, [createdProjectIds]);
    }
    if (fixtureCodeIds.length) {
      await pool.query(`DELETE FROM promo_redemptions WHERE promo_code_id = ANY($1::int[])`, [fixtureCodeIds]);
      await pool.query(`DELETE FROM promo_codes WHERE id = ANY($1::int[])`, [fixtureCodeIds]);
    }
    await pool.end();
  });

  it("requires a valid accessToken (404 without one)", async () => {
    const { id } = await createProject();
    const { status } = await redeem(id, null, "SOLARTRIAL", email());
    assert.equal(status, 404, "redeem without token must 404");
  });

  it("rejects missing code/email with 400", async () => {
    const { id, accessToken } = await createProject();
    const res = await fetch(`${BASE}/projects/${id}/redeem-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-token": accessToken },
      body: JSON.stringify({ code: "", email: "" }),
    });
    assert.equal(res.status, 400);
  });

  it("rejects an unknown code as invalid", async () => {
    const { id, accessToken } = await createProject();
    const { status, body } = await redeem(id, accessToken, `NOPE_${SUFFIX}`, email());
    assert.equal(status, 422);
    assert.equal(body.state, "invalid");
    assert.equal(body.unlocked, false);
  });

  it("rejects a malformed email as invalid", async () => {
    const { id, accessToken } = await createProject();
    const { status, body } = await redeem(id, accessToken, "SOLARTRIAL", "not-an-email");
    assert.equal(status, 422);
    assert.equal(body.state, "invalid");
  });

  it("rejects an inactive code", async () => {
    const { id, accessToken } = await createProject();
    const { status, body } = await redeem(id, accessToken, INACTIVE_CODE, email());
    assert.equal(status, 422);
    assert.equal(body.state, "inactive");
  });

  it("rejects an expired code", async () => {
    const { id, accessToken } = await createProject();
    const { status, body } = await redeem(id, accessToken, EXPIRED_CODE, email());
    assert.equal(status, 422);
    assert.equal(body.state, "expired");
  });

  it("redeems SOLARTRIAL and unlocks the paid PDF without Stripe", async () => {
    const { id, accessToken } = await createProject();
    await calculate(id, accessToken);

    const sharedEmail = email();
    const { status, body } = await redeem(id, accessToken, "solartrial", sharedEmail); // lowercase -> normalized
    assert.equal(status, 200);
    assert.equal(body.state, "valid");
    assert.equal(body.unlocked, true);

    // The paid PDF gate must now pass purely from the promo entitlement.
    const pdf = await fetch(`${BASE}/projects/${id}/report.pdf?accessToken=${encodeURIComponent(accessToken)}`);
    assert.equal(pdf.status, 200, "report.pdf must unlock after promo redemption");
    assert.equal(pdf.headers.get("content-type"), "application/pdf");

    // Double-submit on the same already-unlocked project short-circuits to valid.
    const again = await redeem(id, accessToken, "SOLARTRIAL", email());
    assert.equal(again.status, 200);
    assert.equal(again.body.unlocked, true);

    // Same email on a DIFFERENT project is rejected as already used (anti-abuse).
    const other = await createProject();
    const reused = await redeem(other.id, other.accessToken, "SOLARTRIAL", sharedEmail);
    assert.equal(reused.status, 422);
    assert.equal(reused.body.state, "used");
  });

  it("enforces a total redemption limit across users", async () => {
    const a = await createProject();
    const first = await redeem(a.id, a.accessToken, LIMIT1_CODE, email());
    assert.equal(first.status, 200);
    assert.equal(first.body.state, "valid");

    const b = await createProject();
    const second = await redeem(b.id, b.accessToken, LIMIT1_CODE, email());
    assert.equal(second.status, 422);
    assert.equal(second.body.state, "limit-reached");
  });
});
