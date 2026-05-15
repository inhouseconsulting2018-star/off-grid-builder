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
 *     Returns { lat, lon, accuracy } for a single address (for map pin placement).
 *     accuracy: 'exact' | 'zip' | 'city'
 */

import { Router, type IRouter } from "express";
import { nominatimSearch, geocodeAddress } from "../services/geocoding/geocodingService";
import { logger } from "../utils/logger";

const router: IRouter = Router();

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
// Returns { lat, lon, accuracy } for map pin placement.
// Uses the shared geocodeAddress helper from lib/geocode.ts.

router.get("/geocode/coords", async (req, res): Promise<void> => {
  const address = typeof req.query["address"] === "string" ? req.query["address"].trim() : "";
  const city    = typeof req.query["city"]    === "string" ? req.query["city"].trim()    : "";
  const state   = typeof req.query["state"]   === "string" ? req.query["state"].trim()   : "";
  const zip     = typeof req.query["zip"]     === "string" ? req.query["zip"].trim()     : "";

  if (!city && !state) {
    res.status(400).json({ error: "Provide at least city and state" });
    return;
  }

  const result = await geocodeAddress({ address, city, state, zip });

  if (result) {
    res.json(result); // { lat, lon, accuracy }
    return;
  }

  logger.warn({ address, city, state }, "Geocode coords: no result from any query");
  res.status(404).json({ error: "Could not geocode this address" });
});

export default router;
