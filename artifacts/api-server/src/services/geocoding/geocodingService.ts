/**
 * Shared geocoding helper — used by both the geocode route and the projects route.
 *
 * Uses Nominatim (OpenStreetMap) with a progressive fallback strategy.
 * Rural and unmapped roads fall back gracefully to ZIP centroid.
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url.toString(), {
      headers: NOMINATIM_HEADERS,
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Nominatim request failed");
      return [];
    }
    return await res.json() as unknown[];
  } catch (err) {
    logger.warn({ err }, "Nominatim request unavailable");
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export interface GeoResult {
  lat: number;
  lon: number;
  /** How precise the result is: street address, ZIP/city approximation, manual, or failed. */
  accuracy: "exact_address" | "approximate_zip" | "approximate_city";
}

/**
 * Geocodes a property address with a multi-level progressive fallback strategy.
 * Handles rural and unmapped roads gracefully.
 */
export async function geocodeAddress(opts: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): Promise<GeoResult | null> {
  const { address = "", city = "", state = "", zip = "" } = opts;

  // Normalize address — strip trailing punctuation, extra spaces
  const cleanAddress = address.replace(/[.,]+$/, "").trim();

  interface Row { lat?: string; lon?: string; address?: { house_number?: string; road?: string; street?: string } }

  const trySearch = async (params: Record<string, string>, options: { requireStreet?: boolean } = {}): Promise<{ lat: number; lon: number } | null> => {
    try {
      const rows = (await nominatimSearch(params)) as Row[];
      if (rows.length > 0 && rows[0].lat && rows[0].lon) {
        if (options.requireStreet && !rows[0].address?.house_number && !rows[0].address?.road && !rows[0].address?.street) {
          return null;
        }
        return { lat: parseFloat(rows[0].lat), lon: parseFloat(rows[0].lon) };
      }
    } catch { /* try next level */ }
    return null;
  };

  // 1. Structured query — street + city + state + zip (most accurate)
  if (cleanAddress && city && state) {
    const r = await trySearch({ street: cleanAddress, city, state, ...(zip ? { postalcode: zip } : {}), limit: "1" }, { requireStreet: true });
    if (r) return { ...r, accuracy: "exact_address" };
  }

  // 2. Free-form full address string
  if (cleanAddress && city && state) {
    const q = `${cleanAddress}, ${city}, ${state}${zip ? " " + zip : ""}, USA`;
    const r = await trySearch({ q, limit: "1" }, { requireStreet: true });
    if (r) return { ...r, accuracy: "exact_address" };
  }

  // 3. Street + ZIP only (handles cases where city name is off/misspelled)
  if (cleanAddress && zip) {
    const r = await trySearch({ street: cleanAddress, postalcode: zip, limit: "1" }, { requireStreet: true });
    if (r) return { ...r, accuracy: "exact_address" };
  }

  // 4. Free-form: street + zip (no city — catches rural addresses where city name varies)
  if (cleanAddress && zip) {
    const q = `${cleanAddress}, ${zip}, USA`;
    const r = await trySearch({ q, limit: "1" }, { requireStreet: true });
    if (r) return { ...r, accuracy: "exact_address" };
  }

  // 5. Street number + zip only (strip road type for very rural roads)
  if (cleanAddress && zip) {
    const streetNumber = cleanAddress.match(/^(\d+)/)?.[1];
    if (streetNumber) {
      const q = `${streetNumber}, ${zip}, USA`;
      const r = await trySearch({ q, limit: "1" });
      if (r) return { ...r, accuracy: "approximate_zip" };
    }
  }

  // 6. City + state + ZIP centroid
  if (city && state && zip) {
    const r = await trySearch({ q: `${city}, ${state} ${zip}, USA`, limit: "1" });
    if (r) return { ...r, accuracy: "approximate_zip" };
  }

  // 7. ZIP code only
  if (zip) {
    const r = await trySearch({ postalcode: zip, limit: "1" });
    if (r) return { ...r, accuracy: "approximate_zip" };
  }

  // 8. City + state only (least precise)
  if (city && state) {
    const r = await trySearch({ q: `${city}, ${state}, USA`, limit: "1" });
    if (r) return { ...r, accuracy: "approximate_city" };
  }

  return null;
}
