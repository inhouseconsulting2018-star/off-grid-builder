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
  /** How precise the result is: exact street address, ZIP/city approximation, manual, or failed. */
  accuracy: "exact_address" | "approximate_zip" | "approximate_city";
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  residential?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  state_code?: string;
  postcode?: string;
}

interface NominatimRow {
  lat?: string;
  lon?: string;
  address?: NominatimAddress;
  importance?: number;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(street|st)\b/g, "st")
    .replace(/\b(avenue|ave)\b/g, "ave")
    .replace(/\b(road|rd)\b/g, "rd")
    .replace(/\b(drive|dr)\b/g, "dr")
    .replace(/\b(lane|ln)\b/g, "ln")
    .replace(/\b(court|ct)\b/g, "ct")
    .replace(/\s+/g, " ")
    .trim();
}

function rowScore(row: NominatimRow, opts: { address: string; city: string; state: string; zip: string }): number {
  const addr = row.address;
  if (!addr) return 0;
  let score = 0;
  const inputStreet = normalize(opts.address);
  const rowStreet = normalize([addr.house_number, addr.road ?? addr.pedestrian ?? addr.residential].filter(Boolean).join(" "));
  const rowCity = normalize(addr.city ?? addr.town ?? addr.village ?? "");
  const rowState = normalize(addr.state_code ?? addr.state ?? "");
  const rowZip = (addr.postcode ?? "").slice(0, 5);

  if (addr.house_number && inputStreet.startsWith(normalize(addr.house_number))) score += 4;
  if (rowStreet && inputStreet && (rowStreet === inputStreet || inputStreet.includes(rowStreet) || rowStreet.includes(inputStreet))) score += 5;
  if (opts.city && rowCity === normalize(opts.city)) score += 2;
  if (opts.state && rowState.includes(normalize(opts.state))) score += 2;
  if (opts.zip && rowZip === opts.zip.slice(0, 5)) score += 3;
  return score + (row.importance ?? 0);
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

  const trySearch = async (
    params: Record<string, string>,
    requireStreetMatch = false,
  ): Promise<{ lat: number; lon: number } | null> => {
    try {
      const rows = (await nominatimSearch(params)) as NominatimRow[];
      const ranked = rows
        .filter((row) => row.lat && row.lon)
        .map((row) => ({ row, score: rowScore(row, { address, city, state, zip }) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (best && (!requireStreetMatch || best.score >= 9)) {
        return { lat: parseFloat(best.row.lat!), lon: parseFloat(best.row.lon!) };
      }
    } catch { /* try next level */ }
    return null;
  };

  // 1. Structured query — most accurate, avoids cross-state false matches
  if (address && city && state) {
    const r = await trySearch({ street: address, city, state, ...(zip ? { postalcode: zip } : {}), limit: "5" }, true);
    if (r) return { ...r, accuracy: "exact_address" };
  }

  // 2. Free-form full address string
  if (address && city && state) {
    const q = `${address}, ${city}, ${state}${zip ? " " + zip : ""}, USA`;
    const r = await trySearch({ q, limit: "5" }, true);
    if (r) return { ...r, accuracy: "exact_address" };
  }

  // 3. City + state + ZIP (ZIP centroid)
  if (city && state && zip) {
    const r = await trySearch({ q: `${city}, ${state} ${zip}, USA`, limit: "1" });
    if (r) return { ...r, accuracy: "approximate_zip" };
  }

  // 4. City + state only (least precise)
  if (city && state) {
    const r = await trySearch({ q: `${city}, ${state}, USA`, limit: "1" });
    if (r) return { ...r, accuracy: "approximate_city" };
  }

  return null;
}
