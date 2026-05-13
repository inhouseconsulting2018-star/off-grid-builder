import { logger } from "./logger";

export interface PVWattsParams {
  systemCapacityKw: number;
  losses: number;
  installationType: string;
  roofPitch: string;
  roofDirection: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface PVWattsResult {
  acMonthly: number[];       // 12 values, monthly AC production kWh
  acAnnual: number;          // annual AC production kWh
  solradMonthly: number[];   // 12 values, monthly solar irradiance kWh/m²/day
  solradAnnual: number;      // annual average solar irradiance kWh/m²/day (= peak sun hours)
  capacityFactor: number;    // capacity factor %
  source: "pvwatts";
}

/** Map roof pitch string to tilt angle in degrees */
function pitchToTilt(pitch: string): number {
  if (!pitch) return 20;
  // Numeric string in degrees
  const num = parseFloat(pitch);
  if (!isNaN(num) && num > 0 && num <= 90) return num;
  // Fraction like "4/12"
  const fracMatch = pitch.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const rise = parseFloat(fracMatch[1]);
    const run = parseFloat(fracMatch[2]);
    return Math.round((Math.atan(rise / run) * 180) / Math.PI);
  }
  // Named values
  const named: Record<string, number> = {
    flat: 5, low: 10, medium: 20, steep: 30, fixed: 20,
    "single-axis": 20, "dual-axis": 20,
  };
  return named[pitch.toLowerCase()] ?? 20;
}

/** Map roof direction string to azimuth degrees (0=N, 180=S) */
function directionToAzimuth(dir: string): number {
  const map: Record<string, number> = {
    North: 0, NE: 45, East: 90, SE: 135,
    South: 180, SW: 225, West: 270, NW: 315,
  };
  return map[dir] ?? 180;
}

/**
 * Map installation/tracking type to PVWatts array_type:
 * 0 = fixed open rack, 1 = fixed roof mount, 2 = 1-axis, 3 = 1-axis backtracking, 4 = 2-axis
 */
function installToArrayType(installationType: string, roofPitch: string): number {
  if (installationType === "roof") return 1;
  if (roofPitch === "single-axis") return 2;
  if (roofPitch === "dual-axis") return 4;
  return 0; // ground, pole, carport → open rack
}

/**
 * Call NREL PVWatts v8 API and return production estimates.
 * Returns null if the API key is missing or the call fails — callers should fall back to state estimates.
 */
export async function fetchPVWatts(params: PVWattsParams): Promise<PVWattsResult | null> {
  const apiKey = process.env["PVWATTS_API_KEY"];
  if (!apiKey) {
    logger.info("PVWatts API key not configured — using state-based fallback");
    return null;
  }

  const tilt = pitchToTilt(params.roofPitch);
  const azimuth = directionToAzimuth(params.roofDirection);
  const arrayType = installToArrayType(params.installationType, params.roofPitch);

  // Build location string: prefer ZIP, fall back to city+state
  const location = params.zip
    ? params.zip
    : `${params.city}, ${params.state}`;

  const url = new URL("https://developer.nrel.gov/api/pvwatts/v8.json");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("system_capacity", params.systemCapacityKw.toFixed(2));
  url.searchParams.set("module_type", "0");
  url.searchParams.set("losses", Math.min(params.losses, 99).toFixed(1));
  url.searchParams.set("array_type", arrayType.toString());
  url.searchParams.set("tilt", tilt.toString());
  url.searchParams.set("azimuth", azimuth.toString());
  url.searchParams.set("address", location);
  url.searchParams.set("timeframe", "monthly");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const resp = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      logger.warn({ status: resp.status, body }, "PVWatts API returned non-200 — using fallback");
      return null;
    }

    const json = await resp.json() as Record<string, unknown>;

    const outputs = json["outputs"] as Record<string, unknown> | undefined;
    if (!outputs) {
      logger.warn({ json }, "PVWatts response missing outputs — using fallback");
      return null;
    }

    const acMonthly = outputs["ac_monthly"] as number[] | undefined;
    const acAnnual = outputs["ac_annual"] as number | undefined;
    const solradMonthly = outputs["solrad_monthly"] as number[] | undefined;
    const solradAnnual = outputs["solrad_annual"] as number | undefined;
    const capacityFactor = outputs["capacity_factor"] as number | undefined;

    if (
      !acMonthly || acMonthly.length !== 12 ||
      acAnnual == null || solradAnnual == null || capacityFactor == null
    ) {
      logger.warn({ outputs }, "PVWatts response incomplete — using fallback");
      return null;
    }

    return {
      acMonthly: acMonthly.map((v) => Math.round(v)),
      acAnnual: Math.round(acAnnual),
      solradMonthly: (solradMonthly ?? []).map((v) => Math.round(v * 100) / 100),
      solradAnnual: Math.round(solradAnnual * 100) / 100,
      capacityFactor: Math.round(capacityFactor * 100) / 100,
      source: "pvwatts",
    };
  } catch (err) {
    logger.warn({ err }, "PVWatts API call failed — using fallback");
    return null;
  }
}
