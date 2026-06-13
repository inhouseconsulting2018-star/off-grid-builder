/**
 * Calculation engine unit tests — verifies the canonical rule-of-thumb sizing
 * model is applied exactly:
 *   RequiredSizeKW   = AnnualUsage ÷ PSH ÷ 365 ÷ 0.78
 *   PanelCount       = ceil(RequiredSizeKW × 1000 ÷ panelWattage)
 *   FinalSizeKW      = PanelCount × panelWattage ÷ 1000
 *   EstAnnualProdKWh = FinalSizeKW × PSH × 365 × 0.78
 *
 * Run (from repo root):
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runCalculations, type ProjectData } from "../services/solar/calculationEngine";
import type { Settings } from "@workspace/db";

const baseSettings: Settings = {
  id: 1,
  panelWattage: 440,
  baseSystemLossPct: 14,
  inverterLossPct: 4,
  wireLossPct: 2,
  dirtLossPct: 3,
  tempLossPct: 5,
  batteryRoundTripLossPct: 8,
  batteryDod: 80,
  defaultUtilityRate: 0.17,
  economyDiyPerWatt: 1.25,
  economyInstalledPerWatt: 2.75,
  midRangeDiyPerWatt: 1.75,
  midRangeInstalledPerWatt: 3.25,
  premiumDiyPerWatt: 2.25,
  premiumInstalledPerWatt: 4.0,
  inverterCostPerKw: 300,
  mountingCostPerPanel: 125,
  updatedAt: new Date(),
};

const baseProject: ProjectData = {
  annualKwh: 12000,
  systemType: "grid-tied",
  shadeLevel: "none",
  backupHours: 0,
  budgetTier: "mid-range",
  utilityRatePerKwh: 0.25,
  state: "CA",
  installationType: "roof",
  roofPitch: "20",
  roofDirection: "South",
};

const DERATE = 0.78;

function approx(actual: number, expected: number, tol = 0.5) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `expected ${actual} to be within ${tol} of ${expected}`,
  );
}

describe("calculationEngine — canonical rule-of-thumb formula", () => {
  it("uses CA fallback PSH of 5.5 and the exact formula for 12,000 kWh / 440W", () => {
    const r = runCalculations({ ...baseProject, annualKwh: 12000, state: "CA" }, baseSettings);

    assert.equal(r.peakSunHours, 5.5, "CA fallback PSH must be 5.5");
    assert.equal(r.solarDataSource, "fallback");
    assert.equal(r.panelWattage, 440);
    assert.equal(r.derateFactor, DERATE);

    // RequiredSize = 12000/5.5/365/0.78 = 7.6636 kW
    // PanelCount   = ceil(7663.6/440) = 18
    // FinalSize    = 18*440/1000 = 7.92 kW
    assert.equal(r.numPanels, 18, "panel count must round UP to 18");
    approx(r.adjustedArraySizeKw, 7.92, 0.01);
    approx(r.finalArraySizeKw, 7.92, 0.01);

    // EstAnnualProd = 7.92 × 5.5 × 365 × 0.78 = 12,401.53 kWh
    approx(r.yearlyProductionKwh, 12401.53, 0.5);

    // Headline loss reflects the flat 0.78 derate (22%)
    approx(r.totalSystemLossPct, 22, 0.01);
  });

  it("prefers API peak sun hours over the state fallback when provided", () => {
    const r = runCalculations({ ...baseProject, annualKwh: 12000, state: "CA" }, baseSettings, 6.0);

    assert.equal(r.peakSunHours, 6.0);
    assert.equal(r.solarDataSource, "api");

    // RequiredSize = 12000/6/365/0.78 = 7.0265 → ceil(7026.5/440)=16 → 7.04 kW
    assert.equal(r.numPanels, 16);
    approx(r.adjustedArraySizeKw, 7.04, 0.01);
    // EstAnnualProd = 7.04 × 6 × 365 × 0.78 = 12,025.73 kWh
    approx(r.yearlyProductionKwh, 12025.73, 0.5);
  });

  it("rounds the panel count UP and the final size matches whole panels", () => {
    const r = runCalculations({ ...baseProject, annualKwh: 9000, state: "AZ" }, baseSettings);
    // AZ PSH 6.5: required = 9000/6.5/365/0.78 = 4.862 kW → ceil(4862/440)=12 → 5.28 kW
    assert.equal(r.peakSunHours, 6.5);
    assert.equal(r.numPanels, 12);
    approx(r.finalArraySizeKw, 5.28, 0.01);
    // final size must be >= required size (rounded up, never down)
    assert.ok(r.finalArraySizeKw >= r.requiredArraySizeKw);
    assert.equal(r.numPanels, Math.ceil((r.requiredArraySizeKw * 1000) / r.panelWattage));
  });

  it("honors an admin-configured panel wattage", () => {
    const r = runCalculations(
      { ...baseProject, annualKwh: 12000, state: "CA" },
      { ...baseSettings, panelWattage: 400 },
    );
    assert.equal(r.panelWattage, 400);
    // required 7.6636 kW → ceil(7663.6/400)=20 → 8.0 kW
    assert.equal(r.numPanels, 20);
    approx(r.adjustedArraySizeKw, 8.0, 0.01);
  });

  it("treats monthly usage as annual × 12 (same result via the formula)", () => {
    const monthlyKwh = 1000;
    const annualFromMonthly = monthlyKwh * 12; // 12,000
    const r = runCalculations(
      { ...baseProject, annualKwh: annualFromMonthly, state: "CA" },
      baseSettings,
    );
    assert.equal(r.numPanels, 18);
    approx(r.yearlyProductionKwh, 12401.53, 0.5);
  });

  it("sizes off-grid arrays with the canonical formula and surfaces winter sizing as advisory", () => {
    const grid = runCalculations({ ...baseProject, annualKwh: 12000, state: "CA" }, baseSettings);
    const off = runCalculations(
      { ...baseProject, annualKwh: 12000, state: "CA", systemType: "off-grid", backupHours: 48 },
      baseSettings,
    );

    // Off-grid array is sized identically to grid-tied for the same annual usage/PSH
    assert.equal(off.numPanels, grid.numPanels);
    approx(off.adjustedArraySizeKw, grid.adjustedArraySizeKw, 0.01);

    // Winter recommendation is advisory only and larger than the formula size
    assert.ok(off.offGridWinterRecommendedArrayKw != null);
    assert.ok((off.offGridWinterRecommendedArrayKw as number) > off.finalArraySizeKw);
    assert.ok(off.notes.some((n: string) => /rule-of-thumb/i.test(n)));
  });
});
