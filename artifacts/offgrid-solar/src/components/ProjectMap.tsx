import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// Fix default marker icons broken by bundlers
const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

interface GeoCoords {
  lat: number;
  lng: number;
}

interface ProjectMapProps {
  address: string;
  city: string;
  state: string;
  zip: string;
  projectName: string;
  systemType: string;
  arraySizeKw?: number;
  batteryUsableKwh?: number;
}

// US state center fallbacks (lat, lng)
const STATE_CENTERS: Record<string, GeoCoords> = {
  AL: { lat: 32.8, lng: -86.8 }, AK: { lat: 64.2, lng: -153.4 },
  AZ: { lat: 34.3, lng: -111.1 }, AR: { lat: 34.8, lng: -92.2 },
  CA: { lat: 36.8, lng: -119.4 }, CO: { lat: 39.1, lng: -105.4 },
  CT: { lat: 41.6, lng: -72.7 }, DE: { lat: 39.0, lng: -75.5 },
  FL: { lat: 27.8, lng: -81.6 }, GA: { lat: 32.2, lng: -83.4 },
  HI: { lat: 20.3, lng: -156.4 }, ID: { lat: 44.4, lng: -114.5 },
  IL: { lat: 40.0, lng: -89.2 }, IN: { lat: 40.0, lng: -86.3 },
  IA: { lat: 42.0, lng: -93.2 }, KS: { lat: 38.5, lng: -98.4 },
  KY: { lat: 37.7, lng: -84.9 }, LA: { lat: 31.2, lng: -91.8 },
  ME: { lat: 45.4, lng: -69.0 }, MD: { lat: 39.1, lng: -76.8 },
  MA: { lat: 42.2, lng: -71.5 }, MI: { lat: 44.3, lng: -85.4 },
  MN: { lat: 46.4, lng: -93.1 }, MS: { lat: 32.7, lng: -89.7 },
  MO: { lat: 38.5, lng: -92.5 }, MT: { lat: 46.9, lng: -110.5 },
  NE: { lat: 41.5, lng: -99.9 }, NV: { lat: 38.5, lng: -117.1 },
  NH: { lat: 44.0, lng: -71.6 }, NJ: { lat: 40.1, lng: -74.4 },
  NM: { lat: 34.5, lng: -106.2 }, NY: { lat: 43.0, lng: -75.5 },
  NC: { lat: 35.6, lng: -79.8 }, ND: { lat: 47.5, lng: -100.5 },
  OH: { lat: 40.4, lng: -82.8 }, OK: { lat: 35.6, lng: -96.9 },
  OR: { lat: 44.1, lng: -120.5 }, PA: { lat: 41.2, lng: -77.2 },
  RI: { lat: 41.7, lng: -71.5 }, SC: { lat: 33.9, lng: -80.9 },
  SD: { lat: 44.4, lng: -100.2 }, TN: { lat: 35.9, lng: -86.7 },
  TX: { lat: 31.5, lng: -99.3 }, UT: { lat: 39.3, lng: -111.1 },
  VT: { lat: 44.1, lng: -72.7 }, VA: { lat: 37.8, lng: -78.2 },
  WA: { lat: 47.4, lng: -120.5 }, WV: { lat: 38.6, lng: -80.6 },
  WI: { lat: 44.3, lng: -89.6 }, WY: { lat: 43.0, lng: -107.6 },
};

async function geocodeAddress(
  address: string,
  city: string,
  state: string,
  zip: string,
): Promise<GeoCoords | null> {
  const queries = [
    `${address}, ${city}, ${state} ${zip}, USA`,
    `${city}, ${state} ${zip}, USA`,
    `${city}, ${state}, USA`,
  ];

  for (const q of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`;
      const res = await fetch(url, {
        headers: { "Accept-Language": "en", "User-Agent": "OffGridSolarBuilder/1.0" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch {
      // Try next query
    }
  }
  return null;
}

function RecenterMap({ coords }: { coords: GeoCoords }) {
  const map = useMap();
  useEffect(() => {
    map.setView([coords.lat, coords.lng], 13);
  }, [coords, map]);
  return null;
}

type GeoStatus = "loading" | "success" | "fallback" | "error";

export function ProjectMap({
  address, city, state, zip,
  projectName, systemType, arraySizeKw, batteryUsableKwh,
}: ProjectMapProps) {
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [status, setStatus] = useState<GeoStatus>("loading");
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    let cancelled = false;

    geocodeAddress(address, city, state, zip).then((result) => {
      if (cancelled) return;
      if (result) {
        setCoords(result);
        setStatus("success");
      } else {
        const stateKey = state?.toUpperCase();
        const fallback = STATE_CENTERS[stateKey];
        if (fallback) {
          setCoords(fallback);
          setStatus("fallback");
        } else {
          setStatus("error");
        }
      }
    });

    return () => { cancelled = true; };
  }, [address, city, state, zip]);

  if (status === "error") {
    return (
      <div className="h-64 rounded-lg border bg-muted/30 flex items-center justify-center text-muted-foreground text-sm">
        Map location unavailable for this address.
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="h-64 rounded-lg border bg-muted/30 flex items-center justify-center text-muted-foreground text-sm animate-pulse">
        Locating address on map...
      </div>
    );
  }

  if (!coords) return null;

  const popupLines = [
    `<strong>${projectName}</strong>`,
    `${address}, ${city}, ${state} ${zip}`,
    `Type: ${systemType}`,
    arraySizeKw ? `Array: ${arraySizeKw.toFixed(2)} kW` : null,
    batteryUsableKwh && batteryUsableKwh > 0 ? `Battery: ${batteryUsableKwh.toFixed(1)} kWh` : null,
  ].filter(Boolean).join("<br/>");

  return (
    <div className="relative">
      {status === "fallback" && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-amber-50 border border-amber-300 text-amber-800 text-xs rounded px-3 py-1 shadow">
          Showing approximate {city}, {state} location
        </div>
      )}
      <MapContainer
        center={[coords.lat, coords.lng]}
        zoom={status === "fallback" ? 10 : 14}
        style={{ height: "320px", width: "100%", borderRadius: "0.5rem" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterMap coords={coords} />
        <Marker position={[coords.lat, coords.lng]}>
          <Popup>
            <div
              style={{ lineHeight: 1.6, minWidth: 180 }}
              dangerouslySetInnerHTML={{ __html: popupLines }}
            />
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
