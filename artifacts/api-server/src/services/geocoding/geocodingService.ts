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

  interface Row {
    lat?: string;
    lon?: string;
    address?: {
      house_number?: string;
      road?: string;
      street?: string;
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
      state?: string;
      state_code?: string;
      postcode?: string;
      "ISO3166-2-lvl4"?: string;
    };
  }

  const normalized = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const roadCore = (value: string) =>
    normalized(value)
      .replace(/\b(street|st|road|rd|drive|dr|avenue|ave|lane|ln|boulevard|blvd|court|ct|way|highway|hwy|place|pl|parkway|pkwy|circle|cir|terrace|ter|trail|trl|plaza|plz)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const requestedHouseNumber = cleanAddress.match(/^\s*(\d+[a-z]?)\b/i)?.[1]?.toLowerCase() ?? "";
  const requestedRoad = cleanAddress.replace(/^\s*\d+[a-z]?\s*/i, "");
  const requestedState = state.toUpperCase();
  const requestedZip = zip.slice(0, 5);

  const stateCodeOf = (row: Row): string => {
    const address = row.address;
    const iso = address?.["ISO3166-2-lvl4"];
    const fromIso = iso ? (iso.split("-").pop() ?? "") : "";
    return (address?.state_code ?? fromIso).toUpperCase().replace(/^US-/, "").slice(-2);
  };

  const matchesRequestedContext = (row: Row, requireStreet: boolean): boolean => {
    const address = row.address;
    if (!address) return false;

    if (requestedState && stateCodeOf(row) !== requestedState) return false;
    if (requestedZip && address.postcode?.slice(0, 5) !== requestedZip) return false;

    if (!requestedZip && city) {
      const resultCity = address.city ?? address.town ?? address.village ?? address.municipality ?? "";
      if (!resultCity || normalized(resultCity) !== normalized(city)) return false;
    }

    if (!requireStreet) return true;
    const resultRoad = address.road ?? address.street ?? "";
    if (!resultRoad) return false;
    if (requestedHouseNumber && address.house_number?.toLowerCase() !== requestedHouseNumber) return false;
    if (requestedRoad && roadCore(resultRoad) !== roadCore(requestedRoad)) return false;
    return true;
  };

  const trySearch = async (
    params: Record<string, string>,
    options: { requireStreet?: boolean; requireContext?: boolean } = {},
  ): Promise<{ lat: number; lon: number } | null> => {
    try {
      const rows = (await nominatimSearch(params)) as Row[];
      for (const row of rows) {
        if (!row.lat || !row.lon) continue;
        if (
          (options.requireStreet || options.requireContext) &&
          !matchesRequestedContext(row, Boolean(options.requireStreet))
        ) {
          continue;
        }
        const lat = parseFloat(row.lat);
        const lon = parseFloat(row.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
      }
    } catch { /* try next level */ }
    return null;
  };

  // 1. Structured query — street + city + state + zip (most accurate)
  if (cleanAddress && city && state) {
    const r = await trySearch({ street: cleanAddress, city, state, ...(zip ? { postalcode: zip } : {}), limit: "6" }, { requireStreet: true });
    if (r) return { ...r, accuracy: "exact_address" };
  }

  // 2. Free-form full address string
  if (cleanAddress && city && state) {
    const q = `${cleanAddress}, ${city}, ${state}${zip ? " " + zip : ""}, USA`;
    const r = await trySearch({ q, limit: "6" }, { requireStreet: true });
    if (r) return { ...r, accuracy: "exact_address" };
  }

  // 3. Street + ZIP only (handles cases where city name is off/misspelled)
  if (cleanAddress && zip) {
    const r = await trySearch({ street: cleanAddress, postalcode: zip, limit: "6" }, { requireStreet: true });
    if (r) return { ...r, accuracy: "exact_address" };
  }

  // 4. Free-form: street + zip (no city — catches rural addresses where city name varies)
  if (cleanAddress && zip) {
    const q = `${cleanAddress}, ${zip}, USA`;
    const r = await trySearch({ q, limit: "6" }, { requireStreet: true });
    if (r) return { ...r, accuracy: "exact_address" };
  }

  // 5. Street number + zip only (strip road type for very rural roads)
  if (cleanAddress && zip) {
    const streetNumber = cleanAddress.match(/^(\d+)/)?.[1];
    if (streetNumber) {
      const q = `${streetNumber}, ${zip}, USA`;
      const r = await trySearch({ q, limit: "6" }, { requireContext: true });
      if (r) return { ...r, accuracy: "approximate_zip" };
    }
  }

  // 6. City + state + ZIP centroid
  if (city && state && zip) {
    const r = await trySearch({ q: `${city}, ${state} ${zip}, USA`, limit: "6" }, { requireContext: true });
    if (r) return { ...r, accuracy: "approximate_zip" };
  }

  // 7. ZIP code only
  if (zip) {
    const r = await trySearch({ postalcode: zip, limit: "6" }, { requireContext: true });
    if (r) return { ...r, accuracy: "approximate_zip" };
  }

  // 8. City + state only (least precise)
  if (city && state) {
    const r = await trySearch({ q: `${city}, ${state}, USA`, limit: "6" }, { requireContext: true });
    if (r) return { ...r, accuracy: "approximate_city" };
  }

  return null;
}
