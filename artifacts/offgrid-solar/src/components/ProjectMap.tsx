import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// Fix default marker icons broken by bundlers
const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconUrl, iconRetinaUrl, shadowUrl,
  iconSize: [25, 41], iconAnchor: [12, 41],
  popupAnchor: [1, -34], shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

interface GeoCoords { lat: number; lng: number; }

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

async function geocodeAddress(address: string, city: string, state: string, zip: string): Promise<GeoCoords | null> {
  const queries = [
    `${address}, ${city}, ${state} ${zip}, USA`,
    `${city}, ${state} ${zip}, USA`,
    `${city}, ${state}, USA`,
  ];
  for (const q of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`;
      const res = await fetch(url, { headers: { "Accept-Language": "en", "User-Agent": "OffGridSolarBuilder/1.0" } });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch { /* try next */ }
  }
  return null;
}

// ─── Solar Math ────────────────────────────────────────────────────────────
// Returns sunrise azimuth in degrees from North (clockwise).
// Sunset azimuth = 360 - sunrise azimuth.
// declination: +23.45° summer solstice, -23.45° winter solstice
function solsticeRiseAzimuth(latDeg: number, declDeg: number): number {
  const lat = (latDeg * Math.PI) / 180;
  const decl = (declDeg * Math.PI) / 180;
  const cosAz = Math.sin(decl) / Math.cos(lat);
  const clamped = Math.max(-1, Math.min(1, cosAz));
  return (Math.acos(clamped) * 180) / Math.PI;
}

// Offset a lat/lng point by distance (m) in a given azimuth (deg from North, clockwise)
function offsetLatLng(lat: number, lng: number, azimuthDeg: number, distanceM: number): [number, number] {
  const az = (azimuthDeg * Math.PI) / 180;
  const dy = distanceM * Math.cos(az);
  const dx = distanceM * Math.sin(az);
  const newLat = lat + dy / 111320;
  const newLng = lng + dx / (111320 * Math.cos((lat * Math.PI) / 180));
  return [newLat, newLng];
}

// ─── Sun Path Overlay (imperative Leaflet) ─────────────────────────────────
interface SunOverlayProps {
  coords: GeoCoords;
  visible: boolean;
}

const ARROW_DISTANCE = 300; // meters from center

function SunPathOverlay({ coords, visible }: SunOverlayProps) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!visible) return;

    const { lat, lng } = coords;
    const group = L.layerGroup();

    const summerDecl = 23.45;
    const winterDecl = -23.45;

    const summerRiseAz = solsticeRiseAzimuth(lat, summerDecl);
    const summerSetAz = 360 - summerRiseAz;
    const winterRiseAz = solsticeRiseAzimuth(lat, winterDecl);
    const winterSetAz = 360 - winterRiseAz;

    const center: [number, number] = [lat, lng];

    // Helper: draw a dashed ray with a tooltip label
    const addRay = (azimuth: number, color: string, label: string, dashed: boolean) => {
      const endpoint = offsetLatLng(lat, lng, azimuth, ARROW_DISTANCE);
      L.polyline([center, endpoint], {
        color,
        weight: dashed ? 2 : 3,
        dashArray: dashed ? "10 6" : undefined,
        opacity: 0.85,
      }).addTo(group);

      // Small circle at endpoint with permanent label
      const marker = L.circleMarker(endpoint, {
        radius: 5,
        color,
        fillColor: color,
        fillOpacity: 1,
        weight: 2,
      }).addTo(group);
      marker.bindTooltip(label, {
        permanent: true,
        direction: "center",
        className: "sun-path-label",
        offset: [0, -22],
      }).openTooltip();
    };

    // True South line (optimal panel direction in US)
    const southEndpoint = offsetLatLng(lat, lng, 180, ARROW_DISTANCE);
    L.polyline([center, southEndpoint], {
      color: "#ef4444",
      weight: 3,
      opacity: 0.9,
    }).addTo(group);
    L.circleMarker(southEndpoint, {
      radius: 6, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1, weight: 2,
    }).bindTooltip("⊙ True South\n(Optimal panel\ndirection)", {
      permanent: true, direction: "bottom",
      className: "sun-path-label",
      offset: [0, 4],
    }).openTooltip().addTo(group);

    // Summer solstice rays (orange)
    addRay(summerRiseAz, "#f97316", `☀ Summer Rise\n${Math.round(summerRiseAz)}° NE`, true);
    addRay(summerSetAz, "#f97316", `☀ Summer Set\n${Math.round(summerSetAz)}° NW`, true);

    // Winter solstice rays (blue)
    addRay(winterRiseAz, "#3b82f6", `❄ Winter Rise\n${Math.round(winterRiseAz)}° SE`, true);
    addRay(winterSetAz, "#3b82f6", `❄ Winter Set\n${Math.round(winterSetAz)}° SW`, true);

    // Central dot
    L.circleMarker(center, {
      radius: 7, color: "#fff", fillColor: "#374151", fillOpacity: 1, weight: 2,
    }).addTo(group);

    group.addTo(map);
    layerRef.current = group;

    return () => {
      map.removeLayer(group);
    };
  }, [coords, visible, map]);

  return null;
}

// ─── Tile layer switcher ───────────────────────────────────────────────────
function ActiveTileLayer({ satellite }: { satellite: boolean }) {
  if (satellite) {
    return (
      <TileLayer
        key="satellite"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri &mdash; Esri, USGS, GeoEye, Getmapping, Aerogrid, IGN, and the GIS User Community"
        maxZoom={19}
      />
    );
  }
  return (
    <TileLayer
      key="street"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
  );
}

function RecenterMap({ coords, zoom }: { coords: GeoCoords; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.setView([coords.lat, coords.lng], zoom); }, [coords, zoom, map]);
  return null;
}

type GeoStatus = "loading" | "success" | "fallback" | "error";

// ─── Main component ────────────────────────────────────────────────────────
export function ProjectMap({
  address, city, state, zip,
  projectName, systemType, arraySizeKw, batteryUsableKwh,
}: ProjectMapProps) {
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [status, setStatus] = useState<GeoStatus>("loading");
  const [satellite, setSatellite] = useState(false);
  const [showSunPath, setShowSunPath] = useState(true);
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
        const fallback = STATE_CENTERS[state?.toUpperCase()];
        if (fallback) { setCoords(fallback); setStatus("fallback"); }
        else setStatus("error");
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

  const defaultZoom = status === "fallback" ? 10 : 17;

  const popupLines = [
    `<strong>${projectName}</strong>`,
    `${address}, ${city}, ${state} ${zip}`,
    `System: ${systemType}`,
    arraySizeKw ? `Array: ${arraySizeKw.toFixed(2)} kW` : null,
    batteryUsableKwh && batteryUsableKwh > 0 ? `Battery: ${batteryUsableKwh.toFixed(1)} kWh` : null,
  ].filter(Boolean).join("<br/>");

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Tile toggle */}
        <div className="flex rounded-md border overflow-hidden text-xs font-medium">
          <button
            onClick={() => setSatellite(false)}
            className={`px-3 py-1.5 transition-colors ${!satellite ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            Street
          </button>
          <button
            onClick={() => setSatellite(true)}
            className={`px-3 py-1.5 transition-colors ${satellite ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            Satellite
          </button>
        </div>

        {/* Sun path toggle */}
        <button
          onClick={() => setShowSunPath(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${showSunPath ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          <span>☀</span>
          {showSunPath ? "Hide Sun Paths" : "Show Sun Paths"}
        </button>

        {status === "fallback" && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Approximate {city}, {state} location
          </span>
        )}
      </div>

      {/* Map */}
      <div className="relative rounded-lg overflow-hidden border">
        <MapContainer
          center={[coords.lat, coords.lng]}
          zoom={defaultZoom}
          style={{ height: "380px", width: "100%" }}
          scrollWheelZoom={false}
        >
          <ActiveTileLayer satellite={satellite} />
          <RecenterMap coords={coords} zoom={defaultZoom} />
          <SunPathOverlay coords={coords} visible={showSunPath} />
          <Marker position={[coords.lat, coords.lng]}>
            <Popup>
              <div style={{ lineHeight: 1.6, minWidth: 180 }} dangerouslySetInnerHTML={{ __html: popupLines }} />
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      {/* Sun path legend */}
      {showSunPath && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-xs font-semibold mb-2 text-foreground">Sun Path Legend</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="inline-block w-8 h-0.5 bg-red-500 rounded shrink-0" />
              <span><strong className="text-foreground">True South</strong> — optimal panel facing direction (US)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-8 h-0.5 bg-orange-400 rounded shrink-0" style={{ backgroundImage: "repeating-linear-gradient(to right, #f97316 0, #f97316 6px, transparent 6px, transparent 10px)" }} />
              <span><strong className="text-foreground">Summer solstice</strong> — sun travels high &amp; wide (Jun 21). Longer days, more energy.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-8 h-0.5 bg-blue-400 rounded shrink-0" style={{ backgroundImage: "repeating-linear-gradient(to right, #3b82f6 0, #3b82f6 6px, transparent 6px, transparent 10px)" }} />
              <span><strong className="text-foreground">Winter solstice</strong> — sun stays low &amp; close to south (Dec 21). Shortest days, design for this worst case.</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Switch to <strong className="text-foreground">Satellite</strong> view and zoom in to see your roof, trees, and neighboring structures. Anything that falls between the winter sunrise/sunset lines and the True South arrow will cast shade on your array in winter — the most critical season to check.
          </p>
        </div>
      )}

      {/* Inline style for sun-path tooltip labels */}
      <style>{`
        .sun-path-label {
          background: rgba(255,255,255,0.92) !important;
          border: 1px solid rgba(0,0,0,0.15) !important;
          border-radius: 4px !important;
          font-size: 10px !important;
          line-height: 1.3 !important;
          padding: 3px 6px !important;
          font-weight: 600 !important;
          white-space: pre-line !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15) !important;
          pointer-events: none !important;
        }
        .sun-path-label::before { display: none !important; }
      `}</style>
    </div>
  );
}
