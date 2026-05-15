/**
 * Shared geocoding helper — used by both the geocode route and the projects route.
 *
 * Geocodes an address using Nominatim (OpenStreetMap) with a progressive fallback
 * strategy from most-precise (street-level) to least-precise (city centroid).
 *
 * Swap the `nominatimSearch` implementation here to change geocoding providers
 * (e.g. Google Maps, Mapbox) without touching routes.
 */

import { logger } from "../../utils/logger";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const NOMINATIM_HEADERS = {
  "User-Agent": "OffGridSolarBuilder/2.0 (contact@offgridsolar.app)",
  "Accept-Language": "en",
};

export async function nominatimSearch(params: Record<string, string>): Promise<unknown[]> {
  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "us");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
  if (!res.ok) {
    logger.warn({ status: res.status }, "Nominatim request failed");
    return [];
  }
  return res.json() as Promise<unknown[]>;
}

export interface GeoResult {
  lat: number;
  lon: number;
  /** How precise the result is: 'exact' = street-level, 'zip' = ZIP centroid, 'city' = city centroid */
  accuracy: "exact" | "zip" | "city";
}

/**
 * Geocodes a property address with a four-level progressive fallback strategy.
 * Returns null only if all strategies fail (rare — should at least match city+state).
 */
export async function geocodeAddress(opts: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): Promise<GeoResult | null> {
  const { address = "", city = "", state = "", zip = "" } = opts;

  interface Row { lat?: string; lon?: string }

  const trySearch = async (params: Record<string, string>): Promise<{ lat: number; lon: number } | null> => {
    try {
      const rows = (await nominatimSearch(params)) as Row[];
      if (rows.length > 0 && rows[0].lat && rows[0].lon) {
        return { lat: parseFloat(rows[0].lat), lon: parseFloat(rows[0].lon) };
      }
    } catch { /* try next level */ }
    return null;
  };

  // 1. Structured query — most accurate, avoids cross-state false matches
  if (address && city && state) {
    const r = await trySearch({ street: address, city, state, ...(zip ? { postalcode: zip } : {}), limit: "1" });
    if (r) return { ...r, accuracy: "exact" };
  }

  // 2. Free-form full address string
  if (address && city && state) {
    const q = `${address}, ${city}, ${state}${zip ? " " + zip : ""}, USA`;
    const r = await trySearch({ q, limit: "1" });
    if (r) return { ...r, accuracy: "exact" };
  }

  // 3. City + state + ZIP (ZIP centroid)
  if (city && state && zip) {
    const r = await trySearch({ q: `${city}, ${state} ${zip}, USA`, limit: "1" });
    if (r) return { ...r, accuracy: "zip" };
  }

  // 4. City + state only (least precise)
  if (city && state) {
    const r = await trySearch({ q: `${city}, ${state}, USA`, limit: "1" });
    if (r) return { ...r, accuracy: "city" };
  }

  return null;
}
