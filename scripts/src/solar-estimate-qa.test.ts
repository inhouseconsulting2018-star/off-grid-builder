import assert from "node:assert/strict";
import {
  EFFICIENCY_FACTOR,
  calcAnnualProduction,
  calcFinalSystemKw,
  calcPanelCount,
  calcRequiredSystemKw,
  runProposalCalc,
  verifyTestScenario,
} from "../../artifacts/api-server/src/services/proposals/proposalCalculator";

assert.equal(EFFICIENCY_FACTOR, 0.78);

const requiredKw = calcRequiredSystemKw(12000, 5.5);
const panelCount = calcPanelCount(requiredKw, 440);
const finalKw = calcFinalSystemKw(panelCount, 440);
const annualProduction = calcAnnualProduction(finalKw, 5.5);

assert.ok(Math.abs(requiredKw - 7.6635693074) < 0.000001);
assert.equal(panelCount, 18);
assert.equal(finalKw, 7.92);
assert.equal(annualProduction, 12402);

const proposal = runProposalCalc(12000, 5.5);
assert.equal(proposal.panel.wattage, 440);
assert.equal(proposal.panelCount, 18);
assert.equal(proposal.finalSystemKw, 7.92);
assert.equal(proposal.estimatedAnnualKwh, 12402);
assert.equal(verifyTestScenario().pass, true);

console.log("ok - canonical solar estimate formulas and defaults");
