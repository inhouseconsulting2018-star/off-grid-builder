/**
 * Geocode router — backend proxy for address lookup and autocomplete.
 *
 * All external geocoding API calls are made here, server-side.
 * The frontend never calls any geocoding provider directly —
 * it calls these endpoints, making it trivial to swap providers
 * (Nominatim → Google Maps → Mapbox) without touching the frontend.
 *
 * Future: swap the fetch calls below for a Google Maps / Mapbox SDK call.
 * The response shape stays the same so the frontend needs no changes.
 *
 * Endpoints:
 *   GET /api/geocode/suggest?q=<address query>
 *     Returns autocomplete address suggestions (for address search UI).
 *
 *   GET /api/geocode/coords?q=<full address string>
 *     Returns { lat, lon } for a single address (for map pin placement).
 */

import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Shared Nominatim fetch helper ─────────────────────────────────────────────
// TODO: Replace body of this function with Google Maps / Mapbox SDK call
// when upgrading providers. Keep the return shape identical.

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const NOMINATIM_HEADERS = {
  "User-Agent": "OffGridSolarBuilder/2.0 (contact@offgridsolar.app)",
  "Accept-Language": "en",
};

async function nominatimSearch(
  params: Record<string, string>,
): Promise<unknown[]> {
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

// ── GET /api/geocode/suggest?q=<query> ───────────────────────────────────────
// Returns up to 6 structured address suggestions for the autocomplete UI.

router.get("/geocode/suggest", async (req, res): Promise<void> => {
  const q = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";
  if (q.length < 5) {
    res.json({ suggestions: [] });
    return;
  }

  try {
    const raw = await nominatimSearch({ q, limit: "6" });

    interface NominatimAddr {
      house_number?: string;
      road?: string;
      city?: string;
      town?: string;
      village?: string;
      state_code?: string;
      postcode?: string;
    }
    interface NominatimRow {
      display_name?: string;
      lat?: string;
      lon?: string;
      address?: NominatimAddr;
    }

    const suggestions = (raw as NominatimRow[])
      .filter((r) => r.address?.postcode && r.address?.state_code)
      .map((r) => {
        const a = r.address!;
        const streetParts = [a.house_number, a.road].filter(Boolean);
        return {
          displayName: r.display_name ?? "",
          streetAddress: streetParts.join(" "),
          city: a.city ?? a.town ?? a.village ?? "",
          state: (a.state_code ?? "").toUpperCase().slice(0, 2),
          zip: (a.postcode ?? "").slice(0, 5),
          lat: parseFloat(r.lat ?? "0"),
          lon: parseFloat(r.lon ?? "0"),
        };
      })
      .filter(
        (s) =>
          s.streetAddress &&
          s.city &&
          s.state.length === 2 &&
          /^\d{5}$/.test(s.zip),
      );

    res.json({ suggestions });
  } catch (err) {
    logger.warn({ err }, "Geocode suggest error");
    res.json({ suggestions: [] }); // degrade gracefully — autocomplete is optional
  }
});

// ── GET /api/geocode/coords ───────────────────────────────────────────────────
// Returns { lat, lon } for map pin placement.
//
// Strategy (most → least precise):
//   1. Nominatim structured query  — street + city + state + postalcode
//      Most accurate: each field is matched independently, avoids cross-state
//      false matches (e.g. "Myers Dr" hitting the wrong state).
//   2. Free-form full address       — "2365 Myers Dr, Santa Rosa, CA 95401, USA"
//   3. Free-form city+state+zip     — "Santa Rosa, CA 95401, USA"
//   4. Free-form city+state         — "Santa Rosa, CA, USA"

router.get("/geocode/coords", async (req, res): Promise<void> => {
  const address = typeof req.query["address"] === "string" ? req.query["address"].trim() : "";
  const city    = typeof req.query["city"]    === "string" ? req.query["city"].trim()    : "";
  const state   = typeof req.query["state"]   === "string" ? req.query["state"].trim()   : "";
  const zip     = typeof req.query["zip"]     === "string" ? req.query["zip"].trim()     : "";

  if (!city && !state) {
    res.status(400).json({ error: "Provide at least city and state" });
    return;
  }

  interface Row { lat?: string; lon?: string }

  const trySearch = async (params: Record<string, string>): Promise<{ lat: number; lon: number } | null> => {
    try {
      const rows = (await nominatimSearch(params)) as Row[];
      if (rows.length > 0 && rows[0].lat && rows[0].lon) {
        return { lat: parseFloat(rows[0].lat), lon: parseFloat(rows[0].lon) };
      }
    } catch { /* try next */ }
    return null;
  };

  // 1. Structured query — most accurate, pins the result to the correct city/state
  if (address && city && state) {
    const result = await trySearch({
      street: address,
      city,
      state,
      ...(zip ? { postalcode: zip } : {}),
      limit: "1",
    });
    if (result) { res.json(result); return; }
  }

  // 2–4. Progressive free-form fallbacks
  const freeFormQueries = [
    address && city && state ? `${address}, ${city}, ${state}${zip ? " " + zip : ""}, USA` : null,
    city && state && zip     ? `${city}, ${state} ${zip}, USA`                              : null,
    city && state            ? `${city}, ${state}, USA`                                     : null,
  ].filter((q): q is string => Boolean(q));

  for (const q of freeFormQueries) {
    const result = await trySearch({ q, limit: "1" });
    if (result) { res.json(result); return; }
  }

  logger.warn({ address, city, state }, "Geocode coords: no result from any query");
  res.status(404).json({ error: "Could not geocode this address" });
});

export default router;
