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
  /** Optional: override geocoded coords with the actual array location */
  arrayLat?: number | null;
  arrayLon?: number | null;
}

export interface PVWattsResult {
  acMonthly: number[];
  acAnnual: number;
  solradMonthly: number[];
  solradAnnual: number;
  capacityFactor: number;
  source: "pvwatts";
}

// State centroid coordinates — fallback when Nominatim geocoding fails
const STATE_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  AL: { lat: 32.8, lon: -86.8 }, AK: { lat: 64.2, lon: -153.4 },
  AZ: { lat: 34.3, lon: -111.1 }, AR: { lat: 34.8, lon: -92.2 },
  CA: { lat: 36.8, lon: -119.4 }, CO: { lat: 39.1, lon: -105.4 },
  CT: { lat: 41.6, lon: -72.7 },  DE: { lat: 39.0, lon: -75.5 },
  FL: { lat: 27.8, lon: -81.6 },  GA: { lat: 32.2, lon: -83.4 },
  HI: { lat: 20.3, lon: -156.4 }, ID: { lat: 44.4, lon: -114.5 },
  IL: { lat: 40.0, lon: -89.2 },  IN: { lat: 40.0, lon: -86.3 },
  IA: { lat: 42.0, lon: -93.2 },  KS: { lat: 38.5, lon: -98.4 },
  KY: { lat: 37.7, lon: -84.9 },  LA: { lat: 31.2, lon: -91.8 },
  ME: { lat: 45.4, lon: -69.0 },  MD: { lat: 39.1, lon: -76.8 },
  MA: { lat: 42.2, lon: -71.5 },  MI: { lat: 44.3, lon: -85.4 },
  MN: { lat: 46.4, lon: -93.1 },  MS: { lat: 32.7, lon: -89.7 },
  MO: { lat: 38.5, lon: -92.5 },  MT: { lat: 46.9, lon: -110.5 },
  NE: { lat: 41.5, lon: -99.9 },  NV: { lat: 38.5, lon: -117.1 },
  NH: { lat: 44.0, lon: -71.6 },  NJ: { lat: 40.1, lon: -74.4 },
  NM: { lat: 34.5, lon: -106.2 }, NY: { lat: 43.0, lon: -75.5 },
  NC: { lat: 35.6, lon: -79.8 },  ND: { lat: 47.5, lon: -100.5 },
  OH: { lat: 40.4, lon: -82.8 },  OK: { lat: 35.6, lon: -96.9 },
  OR: { lat: 44.1, lon: -120.5 }, PA: { lat: 41.2, lon: -77.2 },
  RI: { lat: 41.7, lon: -71.5 },  SC: { lat: 33.9, lon: -80.9 },
  SD: { lat: 44.4, lon: -100.2 }, TN: { lat: 35.9, lon: -86.7 },
  TX: { lat: 31.5, lon: -99.3 },  UT: { lat: 39.3, lon: -111.1 },
  VT: { lat: 44.1, lon: -72.7 },  VA: { lat: 37.8, lon: -78.2 },
  WA: { lat: 47.4, lon: -120.5 }, WV: { lat: 38.6, lon: -80.6 },
  WI: { lat: 44.3, lon: -89.6 },  WY: { lat: 43.0, lon: -107.6 },
};

/** Geocode ZIP/address to lat/lon via Nominatim. Returns null on failure. */
async function geocode(zip: string, city: string, state: string): Promise<{ lat: number; lon: number } | null> {
  // Try ZIP code first (most precise), then city+state
  const queries = zip ? [`${zip}, US`, `${city}, ${state}, US`] : [`${city}, ${state}, US`];

  for (const q of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6_000);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "OffGridSolarBuilder/1.0" },
      });
      clearTimeout(timeout);

      if (!resp.ok) continue;
      const data = await resp.json() as Array<{ lat: string; lon: string }>;
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      }
    } catch {
      // continue to next query or fall through to state centroid
    }
  }
  return null;
}

/** Map roof pitch string to tilt angle in degrees */
function pitchToTilt(pitch: string): number {
  if (!pitch) return 20;
  const num = parseFloat(pitch);
  if (!isNaN(num) && num > 0 && num <= 90) return num;
  const fracMatch = pitch.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const rise = parseFloat(fracMatch[1]);
    const run = parseFloat(fracMatch[2]);
    return Math.round((Math.atan(rise / run) * 180) / Math.PI);
  }
  const named: Record<string, number> = {
    flat: 5, low: 10, medium: 20, steep: 30, fixed: 20,
    "single-axis": 20, "dual-axis": 20,
  };
  return named[pitch.toLowerCase()] ?? 20;
}

/** Map roof direction to azimuth degrees (0=N, 180=S) */
function directionToAzimuth(dir: string): number {
  const map: Record<string, number> = {
    North: 0, NE: 45, East: 90, SE: 135,
    South: 180, SW: 225, West: 270, NW: 315,
  };
  return map[dir] ?? 180;
}

/**
 * Map installation/tracking type to PVWatts array_type:
 * 0=fixed open rack, 1=fixed roof mount, 2=1-axis, 3=1-axis backtracking, 4=2-axis
 */
function installToArrayType(installationType: string, roofPitch: string): number {
  if (installationType === "roof") return 1;
  if (roofPitch === "single-axis") return 2;
  if (roofPitch === "dual-axis") return 4;
  return 0;
}

/**
 * Call NREL PVWatts v8 API and return production estimates.
 * Returns null if the API key is missing or the call fails — callers fall back to state estimates.
 */
export async function fetchPVWatts(params: PVWattsParams): Promise<PVWattsResult | null> {
  const apiKey = process.env["PVWATTS_API_KEY"];
  if (!apiKey) {
    logger.info("PVWatts API key not configured — using state-based fallback");
    return null;
  }

  // Resolve lat/lon — PVWatts v8 no longer accepts 'address' parameter (deprecated 2025-02-25)
  // If the user specified a separate array location, use it directly (skips geocoding).
  let coords: { lat: number; lon: number } | null =
    (typeof params.arrayLat === "number" && typeof params.arrayLon === "number")
      ? { lat: params.arrayLat, lon: params.arrayLon }
      : null;
  if (!coords) {
    coords = await geocode(params.zip, params.city, params.state);
  }
  if (!coords) {
    const centroid = STATE_CENTROIDS[params.state?.toUpperCase()];
    if (centroid) {
      logger.info({ state: params.state }, "Nominatim geocoding failed — using state centroid");
      coords = centroid;
    } else {
      logger.warn({ state: params.state }, "No coordinates available for PVWatts — using fallback");
      return null;
    }
  }

  const tilt = pitchToTilt(params.roofPitch);
  const azimuth = directionToAzimuth(params.roofDirection);
  const arrayType = installToArrayType(params.installationType, params.roofPitch);

  const url = new URL("https://developer.nrel.gov/api/pvwatts/v8.json");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("system_capacity", params.systemCapacityKw.toFixed(2));
  url.searchParams.set("module_type", "0");
  url.searchParams.set("losses", Math.min(params.losses, 99).toFixed(1));
  url.searchParams.set("array_type", arrayType.toString());
  url.searchParams.set("tilt", tilt.toString());
  url.searchParams.set("azimuth", azimuth.toString());
  url.searchParams.set("lat", coords.lat.toFixed(4));
  url.searchParams.set("lon", coords.lon.toFixed(4));
  url.searchParams.set("timeframe", "monthly");

  logger.info(
    { lat: coords.lat, lon: coords.lon, tilt, azimuth, arrayType, system_capacity: params.systemCapacityKw },
    "Calling PVWatts v8 API"
  );

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const resp = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      logger.warn({ status: resp.status, body }, "PVWatts API returned non-200 — using fallback");
      return null;
    }

    const json = await resp.json() as Record<string, unknown>;
    const errors = json["errors"] as string[] | undefined;
    if (errors && errors.length > 0) {
      logger.warn({ errors }, "PVWatts API returned errors — using fallback");
      return null;
    }

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

    logger.info(
      { acAnnual, solradAnnual, capacityFactor },
      "PVWatts API success"
    );

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
