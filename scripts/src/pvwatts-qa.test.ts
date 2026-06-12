import assert from "node:assert/strict";

process.env.NREL_API_KEY = "qa-test-key";
process.env.LOG_LEVEL = "silent";

const { runCalculationsWithPVWatts } = await import("../../artifacts/api-server/src/services/solar/calculationEngine");
const { geocodeAddress } = await import("../../artifacts/api-server/src/services/geocoding/geocodingService");

type Scenario = {
  name: string;
  geocodeRows: unknown[];
  pvwattsStatus?: number;
};

let scenario: Scenario = {
  name: "default",
  geocodeRows: [],
};
let lastPvwattsUrl: URL | null = null;

globalThis.fetch = async (input: string | URL | Request) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);

  if (url.hostname.includes("nominatim.openstreetmap.org")) {
    return Response.json(scenario.geocodeRows);
  }

  if (url.hostname === "developer.nrel.gov") {
    lastPvwattsUrl = url;
    if (scenario.pvwattsStatus && scenario.pvwattsStatus >= 400) {
      return new Response(JSON.stringify({ errors: ["forced failure"] }), { status: scenario.pvwattsStatus });
    }

    return Response.json({
      errors: [],
      warnings: [],
      outputs: {
        ac_monthly: [520, 610, 760, 830, 900, 940, 960, 910, 790, 680, 540, 500],
        ac_annual: 8940,
        solrad_monthly: [3.9, 4.6, 5.5, 6.1, 6.5, 6.8, 7.0, 6.6, 5.8, 5.0, 4.1, 3.7],
        solrad_annual: 5.47,
        capacity_factor: 18.5,
      },
    });
  }

  throw new Error(`Unexpected fetch URL: ${url.toString()}`);
};

const settings = {
  id: 1,
  panelWattage: 440,
  baseSystemLossPct: 14,
  inverterLossPct: 4,
  wireLossPct: 2,
  dirtLossPct: 3,
  tempLossPct: 5,
  batteryRoundTripLossPct: 8,
  batteryDod: 80,
  defaultUtilityRate: 0.35,
  economyDiyPerWatt: 1.25,
  economyInstalledPerWatt: 2.75,
  midRangeDiyPerWatt: 1.75,
  midRangeInstalledPerWatt: 3.25,
  premiumDiyPerWatt: 2.25,
  premiumInstalledPerWatt: 4,
  inverterCostPerKw: 300,
  mountingCostPerPanel: 125,
  updatedAt: new Date(),
};

const exactCaliforniaRows = [
  {
    lat: "34.052235",
    lon: "-118.243683",
    importance: 1,
    address: {
      house_number: "100",
      road: "Main St",
      city: "Los Angeles",
      state: "California",
      state_code: "CA",
      postcode: "90012",
    },
  },
];

function baseProject(overrides: Record<string, unknown> = {}) {
  return {
    address: "100 Main St",
    city: "Los Angeles",
    annualKwh: 11000,
    systemType: "grid-tied",
    shadeLevel: "light",
    backupHours: 0,
    customBackupHours: null,
    batteryChemistry: "none",
    hasGenerator: false,
    wantsGenerator: false,
    generatorKw: null,
    highWindArea: false,
    snowArea: false,
    availableSqft: 900,
    budgetTier: "mid-range",
    utilityRatePerKwh: 0.35,
    state: "CA",
    zip: "90012",
    installationType: "roof",
    roofPitch: "20",
    roofDirection: "South",
    arrayLat: null,
    arrayLon: null,
    ...overrides,
  };
}

async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

await run("California residential property uses PVWatts roof mount production", async () => {
  scenario = { name: "california", geocodeRows: exactCaliforniaRows };
  lastPvwattsUrl = null;

  const result = await runCalculationsWithPVWatts(baseProject(), settings);

  assert.equal(result.pvwattsSource, "pvwatts");
  assert.equal(result.peakSunHoursSource, "api");
  assert.equal(result.peakSunHours, 5.47);
  assert.equal(result.panelWattage, 440);
  assert.equal(result.numPanels, 17);
  assert.equal(result.adjustedArraySizeKw, 7.48);
  assert.equal(result.yearlyProductionKwh, 11648.67);
  assert.equal(result.pvwattsMonthlyKwh?.length, 12);
  assert.equal(result.pvwattsMonthlyKwh?.reduce((sum, value) => sum + value, 0), 11649);
  assert.equal(result.estimatedYearlySavings, 3850);
  assert.equal(lastPvwattsUrl?.searchParams.get("array_type"), "1");
  assert.equal(lastPvwattsUrl?.searchParams.get("system_capacity"), "1.00");
  assert.equal(lastPvwattsUrl?.searchParams.get("azimuth") != null, true);
});

await run("Off-grid cabin uses PVWatts and keeps battery recommendation fields", async () => {
  scenario = { name: "off-grid", geocodeRows: exactCaliforniaRows };

  const result = await runCalculationsWithPVWatts(
    baseProject({
      systemType: "off-grid",
      annualKwh: 4800,
      backupHours: 48,
      batteryChemistry: "lifepo4",
      installationType: "ground",
      roofPitch: "fixed",
    }),
    settings,
  );

  assert.equal(result.pvwattsSource, "pvwatts");
  assert.equal(lastPvwattsUrl?.searchParams.get("array_type"), "0");
  assert.ok(result.batteryUsableKwh > 0);
  assert.ok(result.totalBatteryBankKwh >= result.batteryUsableKwh);
  assert.equal(result.paybackYears, null);
});

await run("Hybrid system uses PVWatts production in savings and ROI", async () => {
  scenario = { name: "hybrid", geocodeRows: exactCaliforniaRows };

  const result = await runCalculationsWithPVWatts(
    baseProject({
      systemType: "hybrid",
      backupHours: 24,
      batteryChemistry: "lifepo4",
      annualKwh: 14000,
    }),
    settings,
  );

  assert.equal(result.pvwattsSource, "pvwatts");
  assert.equal(result.estimatedYearlySavings, 4900);
  assert.ok(result.paybackYears && result.paybackYears > 0);
});

await run("Invalid geocode falls back to approximate state assumptions without crashing", async () => {
  scenario = { name: "invalid-geocode", geocodeRows: [] };

  const result = await runCalculationsWithPVWatts(
    baseProject({
      address: "not a real address",
      city: "",
      state: "",
      zip: "",
    }),
    settings,
  );

  assert.equal(result.pvwattsSource, "fallback");
  assert.equal(result.peakSunHoursSource, "fallback");
  assert.ok(Array.isArray(result.notes));
});

await run("API failure uses approximate fallback and labels report estimates", async () => {
  scenario = { name: "api-failure", geocodeRows: exactCaliforniaRows, pvwattsStatus: 500 };

  const result = await runCalculationsWithPVWatts(baseProject(), settings);

  assert.equal(result.pvwattsSource, "fallback");
  assert.equal(result.pvwattsAnnualKwh, result.yearlyProductionKwh);
  assert.ok(Array.isArray(result.notes));
});

await run("Street-level geocode matching rejects city-only rows as exact", async () => {
  scenario = {
    name: "city-only",
    geocodeRows: [
      {
        lat: "34.0522",
        lon: "-118.2437",
        importance: 1,
        address: { city: "Los Angeles", state: "California", state_code: "CA", postcode: "90012" },
      },
    ],
  };

  const result = await geocodeAddress({
    address: "100 Main St",
    city: "Los Angeles",
    state: "CA",
    zip: "90012",
  });

  assert.equal(result?.accuracy, "approximate_zip");
});
