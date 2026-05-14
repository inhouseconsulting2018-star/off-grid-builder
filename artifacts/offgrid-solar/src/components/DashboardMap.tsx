import { useEffect, useState, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";
L.Marker.prototype.options.icon = L.icon({
  iconUrl, iconRetinaUrl, shadowUrl,
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const STATE_CENTERS: Record<string, [number, number]> = {
  AL: [32.8, -86.8], AK: [64.2, -153.4], AZ: [34.3, -111.1], AR: [34.8, -92.2],
  CA: [36.8, -119.4], CO: [39.1, -105.4], CT: [41.6, -72.7], DE: [39.0, -75.5],
  FL: [27.8, -81.6], GA: [32.2, -83.4], HI: [20.3, -156.4], ID: [44.4, -114.5],
  IL: [40.0, -89.2], IN: [40.0, -86.3], IA: [42.0, -93.2], KS: [38.5, -98.4],
  KY: [37.7, -84.9], LA: [31.2, -91.8], ME: [45.4, -69.0], MD: [39.1, -76.8],
  MA: [42.2, -71.5], MI: [44.3, -85.4], MN: [46.4, -93.1], MS: [32.7, -89.7],
  MO: [38.5, -92.5], MT: [46.9, -110.5], NE: [41.5, -99.9], NV: [38.5, -117.1],
  NH: [44.0, -71.6], NJ: [40.1, -74.4], NM: [34.5, -106.2], NY: [43.0, -75.5],
  NC: [35.6, -79.8], ND: [47.5, -100.5], OH: [40.4, -82.8], OK: [35.6, -96.9],
  OR: [44.1, -120.5], PA: [41.2, -77.2], RI: [41.7, -71.5], SC: [33.9, -80.9],
  SD: [44.4, -100.2], TN: [35.9, -86.7], TX: [31.5, -99.3], UT: [39.3, -111.1],
  VT: [44.1, -72.7], VA: [37.8, -78.2], WA: [47.4, -120.5], WV: [38.6, -80.6],
  WI: [44.3, -89.6], WY: [43.0, -107.6],
};

const SYSTEM_COLORS: Record<string, string> = {
  "off-grid": "#f97316",
  "grid-tied": "#3b82f6",
  "hybrid": "#a855f7",
};

export interface DashboardProject {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  systemType: string;
  calculationResult?: {
    adjustedArraySizeKw?: number;
    arraySizeKw?: number;
    batteryUsableKwh?: number;
  } | null;
}

interface ProjectPin {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  systemType: string;
  displayKw?: number;
  batteryKwh?: number;
  lat: number;
  lng: number;
  fallback: boolean;
}

function cacheKey(p: { address: string; city: string; state: string; zip: string }) {
  return `geocode:${p.address}|${p.city}|${p.state}|${p.zip}`.toLowerCase();
}

function readCache(key: string): { lat: number; lng: number; fallback: boolean } | null {
  try {
    const v = sessionStorage.getItem(key);
    return v ? (JSON.parse(v) as { lat: number; lng: number; fallback: boolean }) : null;
  } catch { return null; }
}

function writeCache(key: string, val: { lat: number; lng: number; fallback: boolean }) {
  try { sessionStorage.setItem(key, JSON.stringify(val)); } catch { /* storage full */ }
}

async function geocodeOne(
  p: { address: string; city: string; state: string; zip: string }
): Promise<{ lat: number; lng: number; fallback: boolean } | null> {
  const key = cacheKey(p);
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({ address: p.address, city: p.city, state: p.state, zip: p.zip });
    const base = (import.meta.env.BASE_URL as string) ?? "/";
    const res = await fetch(`${base}api/geocode/coords?${params.toString()}`);
    if (res.ok) {
      const data = await res.json() as { lat?: number; lon?: number };
      if (typeof data.lat === "number" && typeof data.lon === "number") {
        const result = { lat: data.lat, lng: data.lon, fallback: false };
        writeCache(key, result);
        return result;
      }
    }
  } catch { /* fall through */ }

  const center = STATE_CENTERS[p.state?.toUpperCase()];
  if (center) {
    const result = { lat: center[0], lng: center[1], fallback: true };
    writeCache(key, result);
    return result;
  }
  return null;
}

function makeMarkerIcon(color: string, selected: boolean) {
  const size = selected ? 28 : 22;
  const border = selected ? 4 : 3;
  const shadow = selected
    ? "0 0 0 3px rgba(255,255,255,0.7), 0 3px 10px rgba(0,0,0,0.5)"
    : "0 2px 6px rgba(0,0,0,0.35)";
  return L.divIcon({
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:${border}px solid white;box-shadow:${shadow};transition:width 0.2s,height 0.2s;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    className: "",
  });
}

function FitBounds({ pins }: { pins: ProjectPin[] }) {
  const map = useMap();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (pins.length === 0) return;
    if (pins.length === 1) {
      if (!fittedRef.current) { map.setView([pins[0].lat, pins[0].lng], 14); fittedRef.current = true; }
      return;
    }
    const bounds = L.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
  }, [pins.length, map]);
  return null;
}

function FlyToPin({ pins, selectedId }: { pins: ProjectPin[]; selectedId: number | null }) {
  const map = useMap();
  const prevRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedId == null || selectedId === prevRef.current) return;
    prevRef.current = selectedId;
    const pin = pins.find(p => p.id === selectedId);
    if (pin) map.flyTo([pin.lat, pin.lng], Math.max(map.getZoom(), 14), { duration: 0.7 });
  }, [selectedId, pins, map]);
  return null;
}

interface DashboardMapProps {
  projects: DashboardProject[];
  selectedId: number | null;
  onPinClick?: (id: number) => void;
}

export function DashboardMap({ projects, selectedId, onPinClick }: DashboardMapProps) {
  const [pins, setPins] = useState<ProjectPin[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const markerRefs = useRef<Map<number, L.Marker>>(new Map());

  useEffect(() => {
    if (projects.length === 0) { setDoneCount(projects.length); return; }
    let cancelled = false;
    setPins([]);
    setDoneCount(0);

    const run = async () => {
      for (let i = 0; i < projects.length; i++) {
        if (cancelled) return;
        const p = projects[i];
        // Only delay when result is NOT cached (avoid hammering Nominatim)
        const key = cacheKey(p);
        const isCached = readCache(key) !== null;
        if (!isCached && i > 0) await new Promise(r => setTimeout(r, 350));
        if (cancelled) return;

        const coords = await geocodeOne(p);
        if (!cancelled && coords) {
          const pin: ProjectPin = {
            id: p.id, name: p.name, address: p.address, city: p.city, state: p.state,
            systemType: p.systemType,
            displayKw: p.calculationResult?.adjustedArraySizeKw ?? p.calculationResult?.arraySizeKw,
            batteryKwh: p.calculationResult?.batteryUsableKwh,
            ...coords,
          };
          setPins(prev => [...prev, pin]);
        }
        if (!cancelled) setDoneCount(i + 1);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [projects]);

  // Open popup when selectedId changes
  const prevSelectedRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedId == null || selectedId === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedId;
    const m = markerRefs.current.get(selectedId);
    if (m) setTimeout(() => m.openPopup(), 750);
  }, [selectedId]);

  const allDone = doneCount >= projects.length;

  if (pins.length === 0 && !allDone) {
    return (
      <div className="h-72 rounded-lg border bg-muted/30 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Locating {projects.length} project{projects.length > 1 ? "s" : ""} on the map…</span>
        </div>
        <span className="text-xs">{doneCount} of {projects.length} done</span>
      </div>
    );
  }
  if (pins.length === 0 && allDone) return null;

  return (
    <div className="space-y-1">
      {!allDone && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Locating remaining projects… ({doneCount}/{projects.length})
        </div>
      )}
      <div className="rounded-lg overflow-hidden border">
        <MapContainer
          center={[pins[0].lat, pins[0].lng]}
          zoom={5}
          style={{ height: "360px", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds pins={pins} />
          <FlyToPin pins={pins} selectedId={selectedId} />
          {pins.map(pin => {
            const color = SYSTEM_COLORS[pin.systemType] ?? "#6b7280";
            const isSelected = pin.id === selectedId;
            const icon = makeMarkerIcon(color, isSelected);
            return (
              <Marker
                key={`${pin.id}-${isSelected}`}
                position={[pin.lat, pin.lng]}
                icon={icon}
                ref={m => {
                  if (m) markerRefs.current.set(pin.id, m as unknown as L.Marker);
                  else markerRefs.current.delete(pin.id);
                }}
                eventHandlers={{ click: () => onPinClick?.(pin.id) }}
              >
                <Popup>
                  <div style={{ lineHeight: 1.7, minWidth: 190 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{pin.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                      {pin.address}, {pin.city}, {pin.state}
                    </div>
                    <div style={{ marginBottom: 4 }}>
                      <span style={{
                        display: "inline-block", background: color, color: "white",
                        borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 600,
                        textTransform: "capitalize",
                      }}>{pin.systemType}</span>
                    </div>
                    {pin.displayKw != null && (
                      <div style={{ fontSize: 12 }}>Array: <strong>{pin.displayKw.toFixed(2)} kW</strong></div>
                    )}
                    {pin.batteryKwh != null && pin.batteryKwh > 0 && (
                      <div style={{ fontSize: 12 }}>Battery: <strong>{pin.batteryKwh.toFixed(1)} kWh</strong></div>
                    )}
                    {pin.fallback && (
                      <div style={{ fontSize: 11, color: "#d97706", marginTop: 2 }}>
                        ⚠ Approximate location ({pin.city}, {pin.state})
                      </div>
                    )}
                    <a
                      href={`/results/${pin.id}`}
                      style={{ display: "block", marginTop: 6, color: "#f97316", fontWeight: 600, fontSize: 12 }}
                    >
                      View Full Report →
                    </a>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
