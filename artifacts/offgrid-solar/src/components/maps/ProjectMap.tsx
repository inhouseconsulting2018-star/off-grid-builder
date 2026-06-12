import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { geocodeAddress as fetchGeocodeAddress } from "@/services/geocodingService";

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
  installationType?: string;
  arraySizeKw?: number;
  numPanels?: number;
  batteryUsableKwh?: number;
  /** Optional: separate coordinates for the solar array (if different from property) */
  arrayLat?: number | null;
  arrayLon?: number | null;
  arrayLocationNote?: string | null;
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

/**
 * Geocode an address by calling our backend proxy.
 * No external geocoding API is called from this file —
 * the provider (Nominatim, Google Maps, etc.) is hidden server-side.
 */
async function geocodeAddress(address: string, city: string, state: string, zip: string): Promise<GeoCoords | null> {
  try {
    const data = await fetchGeocodeAddress({ address, city, state, zip });
    return { lat: data.lat, lng: data.lon };
  } catch { /* fall through to state centroid fallback */ }
  return null;
}

// ─── Solar Math ────────────────────────────────────────────────────────────
function solsticeRiseAzimuth(latDeg: number, declDeg: number): number {
  const lat = (latDeg * Math.PI) / 180;
  const decl = (declDeg * Math.PI) / 180;
  const cosAz = Math.sin(decl) / Math.cos(lat);
  return (Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180) / Math.PI;
}

function offsetLatLng(lat: number, lng: number, azimuthDeg: number, distanceM: number): [number, number] {
  const az = (azimuthDeg * Math.PI) / 180;
  const dy = distanceM * Math.cos(az);
  const dx = distanceM * Math.sin(az);
  const newLat = lat + dy / 111320;
  const newLng = lng + dx / (111320 * Math.cos((lat * Math.PI) / 180));
  return [newLat, newLng];
}

/** Optimal fixed tilt = latitude × 0.87 + 3.1 (NREL approximation) */
function optimalTiltDeg(latDeg: number): number {
  return Math.round(latDeg * 0.87 + 3.1);
}

// ─── Sun Path Overlay ──────────────────────────────────────────────────────
const ARROW_DISTANCE = 300;

function SunPathOverlay({ coords, visible }: { coords: GeoCoords; visible: boolean }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    if (!visible) return;

    const { lat, lng } = coords;
    const group = L.layerGroup();
    const center: [number, number] = [lat, lng];

    const summerRiseAz = solsticeRiseAzimuth(lat, 23.45);
    const summerSetAz = 360 - summerRiseAz;
    const winterRiseAz = solsticeRiseAzimuth(lat, -23.45);
    const winterSetAz = 360 - winterRiseAz;

    const addRay = (azimuth: number, color: string, label: string, dashed: boolean) => {
      const endpoint = offsetLatLng(lat, lng, azimuth, ARROW_DISTANCE);
      L.polyline([center, endpoint], { color, weight: dashed ? 2 : 3, dashArray: dashed ? "10 6" : undefined, opacity: 0.85 }).addTo(group);
      L.circleMarker(endpoint, { radius: 5, color, fillColor: color, fillOpacity: 1, weight: 2 })
        .bindTooltip(label, { permanent: true, direction: "center", className: "sun-path-label", offset: [0, -22] })
        .openTooltip().addTo(group);
    };

    // True South
    const southEndpoint = offsetLatLng(lat, lng, 180, ARROW_DISTANCE);
    L.polyline([center, southEndpoint], { color: "#ef4444", weight: 3, opacity: 0.9 }).addTo(group);
    L.circleMarker(southEndpoint, { radius: 6, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1, weight: 2 })
      .bindTooltip("⊙ True South\n(Optimal panel\ndirection)", { permanent: true, direction: "bottom", className: "sun-path-label", offset: [0, 4] })
      .openTooltip().addTo(group);

    addRay(summerRiseAz, "#f97316", `☀ Summer Rise\n${Math.round(summerRiseAz)}°`, true);
    addRay(summerSetAz, "#f97316", `☀ Summer Set\n${Math.round(summerSetAz)}°`, true);
    addRay(winterRiseAz, "#3b82f6", `❄ Winter Rise\n${Math.round(winterRiseAz)}°`, true);
    addRay(winterSetAz, "#3b82f6", `❄ Winter Set\n${Math.round(winterSetAz)}°`, true);

    L.circleMarker(center, { radius: 7, color: "#fff", fillColor: "#374151", fillOpacity: 1, weight: 2 }).addTo(group);

    group.addTo(map);
    layerRef.current = group;
    return () => { map.removeLayer(group); };
  }, [coords, visible, map]);

  return null;
}

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

// ─── Panel Placement Guide ─────────────────────────────────────────────────
function PanelPlacementGuide({
  lat, installationType, arraySizeKw, numPanels,
}: { lat: number; installationType?: string; arraySizeKw?: number; numPanels?: number }) {
  const tilt = optimalTiltDeg(lat);
  const isRoof = !installationType || installationType === "roof";
  const isGround = installationType === "ground";
  const isPole = installationType === "pole";

  const winterRiseAz = Math.round(solsticeRiseAzimuth(lat, -23.45));
  const winterSetAz = 360 - winterRiseAz;

  const sqFtPerPanel = 21.5; // ~400W panel footprint
  const totalSqFt = numPanels ? Math.round(numPanels * sqFtPerPanel) : null;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-amber-100 flex items-center justify-center shrink-0">
          <span className="text-sm">☀</span>
        </div>
        <h3 className="font-semibold text-sm">Panel Placement Guide</h3>
        <span className="ml-auto text-xs text-muted-foreground">Based on lat {lat.toFixed(1)}°N</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Direction */}
        <div className="rounded-md bg-red-50 border border-red-100 p-3 text-center">
          <div className="text-2xl font-black text-red-600">South</div>
          <div className="text-xs text-muted-foreground mt-1">Face panels True South for maximum annual output</div>
        </div>
        {/* Tilt */}
        <div className="rounded-md bg-amber-50 border border-amber-100 p-3 text-center">
          <div className="text-2xl font-black text-amber-600">{tilt}°</div>
          <div className="text-xs text-muted-foreground mt-1">Optimal tilt angle for your latitude</div>
        </div>
        {/* Winter sun window */}
        <div className="rounded-md bg-blue-50 border border-blue-100 p-3 text-center">
          <div className="text-lg font-black text-blue-600">{winterRiseAz}°→{winterSetAz}°</div>
          <div className="text-xs text-muted-foreground mt-1">Winter sun arc — keep clear of shade in this window</div>
        </div>
        {/* Area needed */}
        {totalSqFt && (
          <div className="rounded-md bg-green-50 border border-green-100 p-3 text-center">
            <div className="text-2xl font-black text-green-700">~{totalSqFt} ft²</div>
            <div className="text-xs text-muted-foreground mt-1">Roof or ground area needed for {numPanels} panels</div>
          </div>
        )}
      </div>

      {/* Mount-specific tips */}
      <div className="space-y-2">
        {isRoof && (
          <>
            <Tip icon="🏠" color="amber">
              <strong>South-facing roof slope preferred.</strong> Look at the satellite view above — find the roof face that points closest to the True South (red) line. In the US that's typically the back or left side of a home on an east-west street.
            </Tip>
            <Tip icon="📐" color="amber">
              <strong>Tilt = roof pitch matters.</strong> Your roof pitch determines fixed tilt. If it's near {tilt}°, perfect. Flatter roofs need tilt legs; steep roofs lose some output but are still viable.
            </Tip>
            <Tip icon="🌳" color="blue">
              <strong>Check for winter shading.</strong> Anything between the two blue (winter) lines on the map — chimneys, dormers, tall trees to the south — will shade your array in winter. Move panels away from those shadow zones.
            </Tip>
            <Tip icon="📏" color="green">
              <strong>Row spacing on low-slope roofs.</strong> Leave a 3 ft walkway on all sides per fire code. Rows of panels need gap spacing to avoid self-shading — rule of thumb: row gap = panel height × 2.5 at your tilt.
            </Tip>
          </>
        )}
        {isGround && (
          <>
            <Tip icon="🧭" color="amber">
              <strong>Aim the front face exactly south.</strong> Use the satellite view + sun path overlay to pick a spot on your property with an unobstructed view from {winterRiseAz}° to {winterSetAz}° (the blue winter arc). This is your "solar window."
            </Tip>
            <Tip icon="📐" color="amber">
              <strong>Set tilt to {tilt}°.</strong> Ground mount racking lets you dial in the ideal angle — this is the sweet spot for your latitude. Adjust ±5° toward steeper for better winter output, or shallower if wind loads are a concern.
            </Tip>
            <Tip icon="📏" color="green">
              <strong>Clearance from ground.</strong> Bottom of panels should be at least 12–18 inches off the ground for airflow and to prevent snow buildup from covering lower cells. Aim for 2 ft in snow states.
            </Tip>
            <Tip icon="⚡" color="blue">
              <strong>Wire run length.</strong> Every extra foot of DC cable from the array to the inverter adds resistance loss. Try to keep the inverter within 50 ft of the array; size wire accordingly (NEC Article 690).
            </Tip>
          </>
        )}
        {isPole && (
          <>
            <Tip icon="🧭" color="amber">
              <strong>Choose an open, elevated spot.</strong> Pole mounts sit higher than ground mounts — great for avoiding low shrubs and snow. Pick a south-facing open area with the same clear view from {winterRiseAz}° to {winterSetAz}°.
            </Tip>
            <Tip icon="📐" color="amber">
              <strong>Tracking option available.</strong> Pole mounts are the easiest to add single-axis tracking (east→west daily sweep). That can boost output 20–35% vs fixed tilt at your latitude.
            </Tip>
            <Tip icon="🌬️" color="blue">
              <strong>Wind load engineering required.</strong> Pole mounts concentrate the wind load at one point in the ground. A structural engineer or licensed installer must specify the concrete footer depth and pipe diameter for your wind zone.
            </Tip>
          </>
        )}
      </div>

      {arraySizeKw && (
        <p className="text-xs text-muted-foreground border-t pt-3">
          Your <strong>{arraySizeKw.toFixed(2)} kW array</strong> needs approximately {totalSqFt ? `${totalSqFt} ft²` : "space"} of clear, south-facing, unshaded area. Switch to <strong>Satellite</strong> view above and zoom in to evaluate your specific property.
        </p>
      )}
    </div>
  );
}

function Tip({ icon, color, children }: { icon: string; color: "amber" | "blue" | "green"; children: React.ReactNode }) {
  const bg = color === "amber" ? "bg-amber-50 border-amber-200" : color === "blue" ? "bg-blue-50 border-blue-200" : "bg-green-50 border-green-200";
  return (
    <div className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs ${bg}`}>
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span className="text-muted-foreground leading-relaxed">{children}</span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
const arrayIcon = L.divIcon({
  html: `<div style="background:#f97316;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:10px;">☀</div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  className: "",
});

/** Force Leaflet to recompute its size after mount/layout — prevents gray
 *  tiles when the map renders inside an animated dialog or a resized panel. */
function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const timers = [80, 250, 600].map((ms) => window.setTimeout(() => map.invalidateSize(), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [map]);
  return null;
}

export function ProjectMap({
  address, city, state, zip,
  projectName, systemType, installationType,
  arraySizeKw, numPanels, batteryUsableKwh,
  arrayLat, arrayLon, arrayLocationNote,
}: ProjectMapProps) {
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [status, setStatus] = useState<GeoStatus>("loading");
  const [satellite, setSatellite] = useState(false);
  const [showSunPath, setShowSunPath] = useState(true);
  const [showPlacement, setShowPlacement] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    let cancelled = false;
    geocodeAddress(address, city, state, zip).then((result) => {
      if (cancelled) return;
      if (result) { setCoords(result); setStatus("success"); }
      else {
        const fallback = STATE_CENTERS[state?.toUpperCase()];
        if (fallback) { setCoords(fallback); setStatus("fallback"); }
        else setStatus("error");
      }
    });
    return () => { cancelled = true; };
  }, [address, city, state, zip]);

  if (status === "error") return (
    <div className="h-64 rounded-lg border bg-muted/30 flex items-center justify-center text-muted-foreground text-sm">
      Map location unavailable for this address.
    </div>
  );
  if (status === "loading") return (
    <div className="h-64 rounded-lg border bg-muted/30 flex items-center justify-center text-muted-foreground text-sm animate-pulse">
      Locating address on map...
    </div>
  );
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
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
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
        <button
          onClick={() => setShowSunPath(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${showSunPath ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          <span>☀</span>
          {showSunPath ? "Hide Sun Paths" : "Show Sun Paths"}
        </button>
        <button
          onClick={() => setShowPlacement(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${showPlacement ? "bg-green-50 border-green-300 text-green-800" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          <span>📐</span>
          {showPlacement ? "Hide Placement Guide" : "Show Placement Guide"}
        </button>
        {status === "fallback" && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Approximate {city}, {state} location
          </span>
        )}
        <button
          onClick={() => setExpanded(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium bg-background text-foreground hover:bg-muted transition-colors"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Expand Map
        </button>
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
          <InvalidateSize />
          <Marker position={[coords.lat, coords.lng]}>
            <Popup>
              <div style={{ lineHeight: 1.6, minWidth: 180 }} dangerouslySetInnerHTML={{ __html: popupLines }} />
            </Popup>
          </Marker>
          {typeof arrayLat === "number" && typeof arrayLon === "number" && (
            <Marker position={[arrayLat, arrayLon]} icon={arrayIcon}>
              <Popup>
                <div style={{ lineHeight: 1.6, minWidth: 160 }}>
                  <strong>☀ Solar Array Location</strong><br />
                  {arrayLocationNote || "Separate array site"}<br />
                  {arraySizeKw ? `${arraySizeKw.toFixed(2)} kW` : ""}
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Sun path legend */}
      {showSunPath && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-xs font-semibold mb-2 text-foreground">Sun Path Legend</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="inline-block w-8 h-0.5 bg-red-500 rounded shrink-0" />
              <span><strong className="text-foreground">True South</strong> — optimal panel facing direction</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-8 h-px shrink-0" style={{ backgroundImage: "repeating-linear-gradient(to right, #f97316 0, #f97316 6px, transparent 6px, transparent 10px)" }} />
              <span><strong className="text-foreground">Summer solstice</strong> — longest day arc (Jun 21)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-8 h-px shrink-0" style={{ backgroundImage: "repeating-linear-gradient(to right, #3b82f6 0, #3b82f6 6px, transparent 6px, transparent 10px)" }} />
              <span><strong className="text-foreground">Winter solstice</strong> — shortest day, worst-case (Dec 21)</span>
            </div>
          </div>
        </div>
      )}

      {/* Panel Placement Guide */}
      {showPlacement && (
        <PanelPlacementGuide
          lat={coords.lat}
          installationType={installationType}
          arraySizeKw={arraySizeKw}
          numPanels={numPanels}
        />
      )}

      {/* Expanded fullscreen map */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[96vw] w-[96vw] h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 pr-12">
            <DialogTitle className="text-sm font-semibold mr-1">{projectName} — Property Map</DialogTitle>
            <DialogDescription className="sr-only">
              Interactive satellite and street map of {address}, {city}, {state} {zip} with sun-path overlay.
            </DialogDescription>
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
            <button
              onClick={() => setShowSunPath(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${showSunPath ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              <span>☀</span>
              {showSunPath ? "Hide Sun Paths" : "Show Sun Paths"}
            </button>
          </div>
          <div className="flex-1 min-h-0 relative">
            {expanded && (
              <MapContainer
                center={[coords.lat, coords.lng]}
                zoom={defaultZoom}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom
              >
                <ActiveTileLayer satellite={satellite} />
                <RecenterMap coords={coords} zoom={defaultZoom} />
                <SunPathOverlay coords={coords} visible={showSunPath} />
                <InvalidateSize />
                <Marker position={[coords.lat, coords.lng]}>
                  <Popup>
                    <div style={{ lineHeight: 1.6, minWidth: 180 }} dangerouslySetInnerHTML={{ __html: popupLines }} />
                  </Popup>
                </Marker>
                {typeof arrayLat === "number" && typeof arrayLon === "number" && (
                  <Marker position={[arrayLat, arrayLon]} icon={arrayIcon}>
                    <Popup>
                      <div style={{ lineHeight: 1.6, minWidth: 160 }}>
                        <strong>☀ Solar Array Location</strong><br />
                        {arrayLocationNote || "Separate array site"}<br />
                        {arraySizeKw ? `${arraySizeKw.toFixed(2)} kW` : ""}
                      </div>
                    </Popup>
                  </Marker>
                )}
              </MapContainer>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
