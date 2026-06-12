import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useGetProject } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Sun, Info, AlertTriangle, CheckCircle2, LayoutGrid } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const PANEL_W_PORTRAIT = 3.75; // ft (typical 440W-class panel is about 45" wide)
const PANEL_H_PORTRAIT = 5.75; // ft (about 69" tall)
const DIAGRAM_W = 560;
const DIAGRAM_H = 440;
const MARGIN = 44;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parsePitchDeg(pitch: string | null | undefined): number {
  if (!pitch || pitch === "fixed" || pitch === "flat") return 10;
  if (pitch === "single-axis") return 0;
  if (pitch.includes("/")) {
    const [rise, run] = pitch.split("/").map(Number);
    return Math.round(Math.atan((rise || 4) / (run || 12)) * (180 / Math.PI));
  }
  const n = parseFloat(pitch);
  return isNaN(n) ? 20 : Math.min(60, Math.max(0, n));
}

function sunExposurePct(azimuth: number, pitchDeg: number): number {
  const azRad = ((azimuth - 180) * Math.PI) / 180;
  const azFactor = (1 + Math.cos(azRad)) / 2; // 1.0 = south, 0 = north
  const pitchOpt = 25; // ~optimal for most US latitudes
  const pitchFactor = 1 - Math.min(0.2, Math.abs(pitchDeg - pitchOpt) / 120);
  return Math.round((0.45 + 0.55 * azFactor) * pitchFactor * 100);
}

function exposureLabel(pct: number): { label: string; color: string; stars: number } {
  if (pct >= 90) return { label: "Excellent",  color: "text-green-600",  stars: 5 };
  if (pct >= 78) return { label: "Good",        color: "text-lime-600",   stars: 4 };
  if (pct >= 65) return { label: "Fair",         color: "text-yellow-600", stars: 3 };
  if (pct >= 52) return { label: "Poor",         color: "text-orange-600", stars: 2 };
  return           { label: "Not Recommended", color: "text-red-600",    stars: 1 };
}

function azimuthLabel(az: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(az / 22.5) % 16];
}

// ─── Compass Rose SVG ─────────────────────────────────────────────────────────
function CompassRose({ azimuth, size = 80 }: { azimuth: number; size?: number }) {
  const r = size / 2;
  const azRad = (azimuth * Math.PI) / 180;
  const arrowTip = { x: r + (r - 8) * Math.sin(azRad), y: r - (r - 8) * Math.cos(azRad) };
  const arrowBase = { x: r + 4 * Math.cos(azRad), y: r + 4 * Math.sin(azRad) };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background */}
      <circle cx={r} cy={r} r={r - 2} fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      {/* Tick marks */}
      {Array.from({ length: 16 }).map((_, i) => {
        const ang = (i * 22.5 * Math.PI) / 180;
        const isMajor = i % 4 === 0;
        const inner = r - (isMajor ? 10 : 6);
        const outer = r - 2;
        return (
          <line key={i}
            x1={r + inner * Math.sin(ang)} y1={r - inner * Math.cos(ang)}
            x2={r + outer * Math.sin(ang)} y2={r - outer * Math.cos(ang)}
            stroke={isMajor ? "#475569" : "#cbd5e1"} strokeWidth={isMajor ? 1.5 : 0.75}
          />
        );
      })}
      {/* Cardinal labels */}
      {[["N", 0, "#ef4444"], ["E", 90, "#64748b"], ["S", 180, "#64748b"], ["W", 270, "#64748b"]].map(
        ([label, deg, color]) => {
          const a = (Number(deg) * Math.PI) / 180;
          const lr = r - 18;
          return (
            <text key={label as string}
              x={r + lr * Math.sin(a)} y={r - lr * Math.cos(a) + 3.5}
              textAnchor="middle" fontSize={10} fontWeight="700" fill={color as string}
            >{label}</text>
          );
        }
      )}
      {/* Azimuth direction arrow (where panels face) */}
      <line
        x1={r - 5 * Math.sin(azRad)} y1={r + 5 * Math.cos(azRad)}
        x2={arrowTip.x} y2={arrowTip.y}
        stroke="#f97316" strokeWidth={2.5} strokeLinecap="round"
      />
      <polygon
        points={`${arrowTip.x},${arrowTip.y} ${arrowBase.x - 4 * Math.sin(azRad + Math.PI / 2)},${arrowBase.y + 4 * Math.cos(azRad + Math.PI / 2)} ${arrowBase.x + 4 * Math.sin(azRad + Math.PI / 2)},${arrowBase.y - 4 * Math.cos(azRad + Math.PI / 2)}`}
        fill="#f97316"
      />
      {/* Center dot */}
      <circle cx={r} cy={r} r={3} fill="#f97316" />
    </svg>
  );
}

// ─── Tilt Side-View SVG ───────────────────────────────────────────────────────
function TiltSideView({ pitchDeg }: { pitchDeg: number }) {
  const W = 180; const H = 110;
  const gY = H - 20; // ground line Y
  const sX = 20;     // start X
  const eX = W - 30; // end X
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const runPx = eX - sX;
  const risePx = Math.min(runPx * Math.tan(pitchRad), H - 30);
  const ridgeX = sX;
  const ridgeY = gY - risePx;
  const eaveX = eX;
  const eaveY = gY;

  // Sun position (upper left for south-facing = sun in south)
  const sunX = W - 30;
  const sunY = 20;

  // Panel (offset slightly above roof surface)
  const panelLen = Math.min(runPx * 0.6, 60);
  const midX = (ridgeX + eaveX) / 2 - panelLen / 2;
  const midY = gY - risePx * 0.45;
  const panelAngle = -pitchDeg;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {/* Ground */}
      <line x1={sX - 10} y1={gY} x2={eX + 20} y2={gY} stroke="#94a3b8" strokeWidth={1.5} />
      <text x={eX + 22} y={gY + 4} fontSize={9} fill="#94a3b8">Ground</text>

      {/* Roof structure */}
      <polygon
        points={`${ridgeX},${ridgeY} ${eaveX},${eaveY} ${eaveX},${gY} ${ridgeX},${gY}`}
        fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={1}
      />
      <line x1={ridgeX} y1={ridgeY} x2={eaveX} y2={eaveY} stroke="#64748b" strokeWidth={2} strokeLinecap="round" />

      {/* Solar panel on roof */}
      <g transform={`translate(${midX}, ${midY}) rotate(${panelAngle} 0 0)`}>
        <rect x={0} y={-3} width={panelLen} height={6} rx={1} fill="#3b82f6" opacity={0.85} />
        {Array.from({ length: Math.floor(panelLen / 12) + 1 }).map((_, i) => (
          <line key={i} x1={i * 12} y1={-3} x2={i * 12} y2={3} stroke="#60a5fa" strokeWidth={0.5} />
        ))}
      </g>

      {/* Pitch angle arc */}
      <path
        d={`M ${eaveX - 30},${eaveY} A 30,30 0 0,0 ${eaveX - 30 + 30 * Math.cos(Math.PI - pitchRad)},${eaveY - 30 * Math.sin(Math.PI - pitchRad)}`}
        fill="none" stroke="#f97316" strokeWidth={1.2} strokeDasharray="3,2"
      />
      <text x={eaveX - 28} y={eaveY - 10} fontSize={9} fill="#f97316" fontWeight="700">{pitchDeg}°</text>

      {/* Sun with rays */}
      <circle cx={sunX} cy={sunY} r={9} fill="#fbbf24" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * 45 * Math.PI) / 180;
        return (
          <line key={i}
            x1={sunX + 11 * Math.cos(a)} y1={sunY + 11 * Math.sin(a)}
            x2={sunX + 15 * Math.cos(a)} y2={sunY + 15 * Math.sin(a)}
            stroke="#fbbf24" strokeWidth={1.5} strokeLinecap="round"
          />
        );
      })}
      {/* Sun rays toward panel */}
      {[0, 1, 2].map(i => (
        <line key={`r${i}`}
          x1={sunX - 6 + i * 4} y1={sunY + 10}
          x2={midX + panelLen * 0.3 + i * 8} y2={midY - 4}
          stroke="#fbbf24" strokeWidth={0.8} strokeDasharray="3,2" opacity={0.6}
        />
      ))}
    </svg>
  );
}

// ─── Top-Down Roof + Panel Diagram ────────────────────────────────────────────
interface DiagramProps {
  roofWidth: number;
  roofLength: number;
  azimuth: number;
  pitchDeg: number;
  panelOrientation: "portrait" | "landscape";
  setbackFt: number;
  ridgeSetbackFt: number;
  rowSpacingFt: number;
  numPanelsNeeded: number;
}

function RoofDiagram(props: DiagramProps) {
  const {
    roofWidth, roofLength, azimuth, pitchDeg,
    panelOrientation, setbackFt, ridgeSetbackFt, rowSpacingFt, numPanelsNeeded
  } = props;

  const pW = panelOrientation === "portrait" ? PANEL_W_PORTRAIT : PANEL_H_PORTRAIT;
  const pH = panelOrientation === "portrait" ? PANEL_H_PORTRAIT : PANEL_W_PORTRAIT;

  const usableW = Math.max(0, roofWidth - 2 * setbackFt);
  const usableL = Math.max(0, roofLength - ridgeSetbackFt - setbackFt);
  const cols = Math.max(0, Math.floor(usableW / pW));
  const rows = Math.max(0, Math.floor(usableL / (pH + rowSpacingFt)));
  const placed = cols * rows;

  // Scale roof to fit diagram area with margin
  const scaleX = (DIAGRAM_W - 2 * MARGIN) / roofWidth;
  const scaleY = (DIAGRAM_H - 2 * MARGIN) / roofLength;
  const scale = Math.min(scaleX, scaleY);

  const rW = roofWidth * scale;
  const rH = roofLength * scale;
  const rX = (DIAGRAM_W - rW) / 2;
  const rY = MARGIN + (DIAGRAM_H - 2 * MARGIN - rH) / 2;

  // Setback zone
  const sbX = rX + setbackFt * scale;
  const sbY = rY + ridgeSetbackFt * scale;
  const sbW = usableW * scale;
  const sbH = usableL * scale;

  // Panel positions
  const panelRects: { x: number; y: number; w: number; h: number; idx: number }[] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      panelRects.push({
        x: sbX + c * pW * scale,
        y: sbY + r * (pH + rowSpacingFt) * scale,
        w: pW * scale - 1,
        h: pH * scale - 1,
        idx: idx++,
      });
    }
  }

  // Sun indicator position (on the edge in the azimuth direction)
  const azRad = (azimuth * Math.PI) / 180;
  const cx = rX + rW / 2;
  const cy = rY + rH / 2;
  const edgeR = Math.max(rW, rH) * 0.65;
  const sunX = cx + edgeR * Math.sin(azRad);
  const sunY = cy - edgeR * Math.cos(azRad);

  // Arrow from sun to roof edge
  const arrowEndX = cx + (rW / 2 + 10) * Math.sin(azRad);
  const arrowEndY = cy - (rH / 2 + 10) * Math.cos(azRad);

  // Sun exposure color gradient
  const exposure = sunExposurePct(azimuth, pitchDeg);
  const roofFill = exposure >= 85 ? "#fef9c3" : exposure >= 70 ? "#fefce8" : exposure >= 55 ? "#fff7ed" : "#f1f5f9";

  // Ridge label position (top of roof)
  const ridgeLabel = { x: rX + rW / 2, y: rY - 8 };

  return (
    <svg
      viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`}
      className="w-full h-full"
      aria-label="Solar panel placement diagram"
    >
      <defs>
        <pattern id="roofHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#e2e8f0" strokeWidth="0.5" />
        </pattern>
      </defs>

      {/* ─ Roof outline ─ */}
      <rect x={rX} y={rY} width={rW} height={rH} rx={3} fill={roofFill} stroke="#94a3b8" strokeWidth={1.5} />

      {/* ─ Ridge line (high edge) ─ */}
      <line x1={rX + 4} y1={rY + 4} x2={rX + rW - 4} y2={rY + 4} stroke="#64748b" strokeWidth={3} strokeLinecap="round" />
      <text x={ridgeLabel.x} y={ridgeLabel.y} textAnchor="middle" fontSize={10} fill="#64748b" fontWeight="600">▲ Ridge</text>

      {/* ─ Dimension labels ─ */}
      {/* Width label (bottom) */}
      <line x1={rX} y1={rY + rH + 16} x2={rX + rW} y2={rY + rH + 16} stroke="#94a3b8" strokeWidth={1} markerEnd="url(#arrowEnd)" />
      <text x={rX + rW / 2} y={rY + rH + 28} textAnchor="middle" fontSize={10} fill="#64748b">{roofWidth} ft wide</text>
      {/* Length label (right) */}
      <text x={rX + rW + 10} y={rY + rH / 2 + 4} textAnchor="start" fontSize={10} fill="#64748b">{roofLength} ft</text>

      {/* ─ Setback zone (dashed) ─ */}
      {sbW > 0 && sbH > 0 && (
        <rect
          x={sbX} y={sbY} width={sbW} height={sbH}
          fill="none" stroke="#f97316" strokeWidth={1.2} strokeDasharray="5,3" rx={2}
        />
      )}
      {sbW > 0 && sbH > 0 && (
        <text x={sbX + 4} y={sbY + 10} fontSize={8} fill="#f97316" opacity={0.8}>
          ← usable area →
        </text>
      )}

      {/* ─ Solar panels ─ */}
      {panelRects.map(pr => (
        <g key={pr.idx}>
          <rect
            x={pr.x} y={pr.y} width={pr.w} height={pr.h}
            rx={1}
            fill={pr.idx < numPanelsNeeded ? "#3b82f6" : "#93c5fd"}
            opacity={pr.idx < numPanelsNeeded ? 0.85 : 0.4}
            stroke={pr.idx < numPanelsNeeded ? "#1d4ed8" : "#60a5fa"}
            strokeWidth={0.5}
          />
          {/* Panel cell lines (portrait) */}
          {pr.w > 12 && Array.from({ length: 3 }).map((_, ci) => (
            <line key={ci}
              x1={pr.x + (ci + 1) * (pr.w / 4)} y1={pr.y + 1}
              x2={pr.x + (ci + 1) * (pr.w / 4)} y2={pr.y + pr.h - 1}
              stroke="rgba(255,255,255,0.3)" strokeWidth={0.5}
            />
          ))}
          {pr.h > 20 && Array.from({ length: 5 }).map((_, ri) => (
            <line key={ri}
              x1={pr.x + 1} y1={pr.y + (ri + 1) * (pr.h / 6)}
              x2={pr.x + pr.w - 1} y2={pr.y + (ri + 1) * (pr.h / 6)}
              stroke="rgba(255,255,255,0.2)" strokeWidth={0.5}
            />
          ))}
        </g>
      ))}

      {/* ─ Row spacing labels (if multiple rows) ─ */}
      {rows > 1 && panelRects.length >= cols + 1 && (
        <g>
          <line
            x1={sbX + sbW + 4}
            y1={panelRects[0].y + panelRects[0].h}
            x2={sbX + sbW + 4}
            y2={panelRects[cols].y}
            stroke="#f97316" strokeWidth={1} strokeDasharray="2,1"
          />
          {(panelRects[cols].y - panelRects[0].y - panelRects[0].h) > 4 && (
            <text
              x={sbX + sbW + 12}
              y={(panelRects[0].y + panelRects[0].h + panelRects[cols].y) / 2 + 3}
              fontSize={8} fill="#f97316"
            >{rowSpacingFt}′ gap</text>
          )}
        </g>
      )}

      {/* ─ Sun direction indicator ─ */}
      {/* Dashed line from sun to roof */}
      <line
        x1={sunX} y1={sunY}
        x2={arrowEndX} y2={arrowEndY}
        stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="6,3" opacity={0.7}
      />
      {/* Sun symbol */}
      <circle cx={sunX} cy={sunY} r={10} fill="#fbbf24" opacity={0.9} />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * 45 * Math.PI) / 180;
        return (
          <line key={i}
            x1={sunX + 12 * Math.cos(a)} y1={sunY + 12 * Math.sin(a)}
            x2={sunX + 17 * Math.cos(a)} y2={sunY + 17 * Math.sin(a)}
            stroke="#fbbf24" strokeWidth={1.5} strokeLinecap="round" opacity={0.9}
          />
        );
      })}
      <text x={sunX} y={sunY + 26} textAnchor="middle" fontSize={8} fill="#92400e" fontWeight="600">Sun</text>

      {/* ─ Compass rose (top-right corner) ─ */}
      <foreignObject x={DIAGRAM_W - 90} y={4} width={86} height={86}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CompassRose azimuth={azimuth} size={80} />
        </div>
      </foreignObject>

      {/* ─ Panel count label ─ */}
      {placed > 0 && (
        <text x={sbX + sbW / 2} y={sbY + sbH + (setbackFt * scale / 2)} textAnchor="middle" fontSize={9} fill="#1d4ed8" fontWeight="600">
          {placed} panel{placed !== 1 ? "s" : ""} fit ({cols} col × {rows} row)
        </text>
      )}
      {placed === 0 && usableW > 0 && usableL > 0 && (
        <text x={rX + rW / 2} y={rY + rH / 2} textAnchor="middle" fontSize={11} fill="#ef4444" fontWeight="600">
          Roof too small for selected panel size
        </text>
      )}
    </svg>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PlacementPage() {
  const { id } = useParams();
  const projectId = parseInt(id || "0", 10);

  const { data: project, isLoading, error } = useGetProject(projectId);

  // ── Local state (visualization inputs)
  const [roofWidth, setRoofWidth] = useState(28);
  const [roofLength, setRoofLength] = useState(40);
  const [azimuth, setAzimuth] = useState(180);
  const [panelOrientation, setPanelOrientation] = useState<"portrait" | "landscape">("portrait");
  const [setbackType, setSetbackType] = useState<"minimum" | "standard" | "generous">("standard");
  const [rowSpacingType, setRowSpacingType] = useState<"tight" | "standard" | "wide">("standard");

  const setbackFt = setbackType === "minimum" ? 1.5 : setbackType === "generous" ? 4 : 3;
  const ridgeSetbackFt = setbackType === "minimum" ? 1.5 : setbackType === "generous" ? 4 : 3;
  const rowSpacingFt = rowSpacingType === "tight" ? 1 : rowSpacingType === "wide" ? 2.5 : 1.5;

  const pitchDeg = useMemo(
    () => parsePitchDeg(project?.roofPitch),
    [project?.roofPitch]
  );

  const numPanelsNeeded = project?.calculationResult?.numPanels ?? 0;
  const exposure = sunExposurePct(azimuth, pitchDeg);
  const expInfo = exposureLabel(exposure);

  // Panel layout calc (mirrored from diagram for stats)
  const pW = panelOrientation === "portrait" ? PANEL_W_PORTRAIT : PANEL_H_PORTRAIT;
  const pH = panelOrientation === "portrait" ? PANEL_H_PORTRAIT : PANEL_W_PORTRAIT;
  const usableW = Math.max(0, roofWidth - 2 * setbackFt);
  const usableL = Math.max(0, roofLength - ridgeSetbackFt - setbackFt);
  const cols = Math.max(0, Math.floor(usableW / pW));
  const rows = Math.max(0, Math.floor(usableL / (pH + rowSpacingFt)));
  const panelsPlaced = cols * rows;
  const roofCoverage = roofWidth > 0 && roofLength > 0
    ? Math.round((panelsPlaced * pW * pH) / (roofWidth * roofLength) * 100)
    : 0;

  const hasEnough = panelsPlaced >= numPanelsNeeded;

  if (isLoading) return (
    <AppLayout>
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </AppLayout>
  );

  if (error || !project) return (
    <AppLayout>
      <div className="max-w-2xl mx-auto mt-12 text-center">
        <p className="text-muted-foreground">Project not found.</p>
        <Link href="/projects"><Button variant="outline" className="mt-4">Back to Projects</Button></Link>
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto flex flex-col gap-6">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link href={`/results/${projectId}`}>
              <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-1 transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to report
              </button>
            </Link>
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-primary" />
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Solar Placement</h1>
              <Badge variant="outline" className="text-xs">Visual Estimate</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{project.name} · {project.city}, {project.state}</p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <Sun className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">{numPanelsNeeded} panels needed</span>
          </div>
        </div>

        {/* ── Info banner ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
          <span>
            This is a simplified top-down layout estimator using your roof dimensions and orientation.
            It does not model shading from trees, chimneys, or neighbors.{" "}
            <strong>Google Solar API integration planned</strong> — will add satellite imagery and automated shading analysis.
          </span>
        </div>

        {/* ── Main layout: inputs + diagram ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">

          {/* ─ Inputs ─ */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Roof Section</CardTitle>
                <CardDescription className="text-xs">Adjust to match your usable roof area</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">

                {/* Roof Width */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Width</label>
                    <span className="text-sm font-semibold">{roofWidth} ft</span>
                  </div>
                  <input type="range" min={10} max={80} value={roofWidth}
                    onChange={e => setRoofWidth(Number(e.target.value))}
                    className="w-full accent-primary h-2 rounded cursor-pointer" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>10 ft</span><span>80 ft</span>
                  </div>
                </div>

                {/* Roof Length */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Length (ridge to eave)</label>
                    <span className="text-sm font-semibold">{roofLength} ft</span>
                  </div>
                  <input type="range" min={10} max={80} value={roofLength}
                    onChange={e => setRoofLength(Number(e.target.value))}
                    className="w-full accent-primary h-2 rounded cursor-pointer" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>10 ft</span><span>80 ft</span>
                  </div>
                </div>

                {/* Azimuth */}
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Panel Azimuth</label>
                    <span className="text-sm font-semibold">{azimuth}° {azimuthLabel(azimuth)}</span>
                  </div>
                  <input type="range" min={0} max={359} value={azimuth}
                    onChange={e => setAzimuth(Number(e.target.value))}
                    className="w-full accent-primary h-2 rounded cursor-pointer" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>N (0°)</span><span>E (90°)</span><span>S (180°)</span><span>W (270°)</span>
                  </div>
                  {/* Compass */}
                  <div className="flex justify-center mt-3">
                    <CompassRose azimuth={azimuth} size={88} />
                  </div>
                  <div className="flex justify-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-orange-400" /> Facing direction</span>
                    <span className="flex items-center gap-1"><span className="text-red-500 font-bold text-[10px]">N</span> North</span>
                  </div>
                </div>

                {/* Preset azimuths */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Quick select:</p>
                  <div className="grid grid-cols-4 gap-1">
                    {[["S", 180], ["SW", 225], ["SE", 135], ["W", 270]].map(([label, deg]) => (
                      <button key={label}
                        onClick={() => setAzimuth(Number(deg))}
                        className={`text-xs py-1.5 rounded border transition-colors ${
                          Math.abs(azimuth - Number(deg)) < 5
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:border-primary hover:text-primary"
                        }`}
                      >{label} {deg}°</button>
                    ))}
                  </div>
                </div>

              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Layout Options</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">

                {/* Panel orientation */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Panel Orientation</label>
                  <div className="grid grid-cols-2 gap-1">
                    {(["portrait", "landscape"] as const).map(o => (
                      <button key={o}
                        onClick={() => setPanelOrientation(o)}
                        className={`text-xs py-2 rounded border capitalize transition-colors ${
                          panelOrientation === o
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:border-primary hover:text-primary"
                        }`}
                      >
                        {o === "portrait" ? "⬜ Portrait" : "▭ Landscape"}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {panelOrientation === "portrait"
                      ? `${PANEL_W_PORTRAIT}ft × ${PANEL_H_PORTRAIT}ft per panel`
                      : `${PANEL_H_PORTRAIT}ft × ${PANEL_W_PORTRAIT}ft per panel`}
                  </p>
                </div>

                {/* Setbacks */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Perimeter Setback</label>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      ["minimum", "18″ min"], ["standard", "3 ft"], ["generous", "4 ft"]
                    ] as const).map(([key, label]) => (
                      <button key={key}
                        onClick={() => setSetbackType(key)}
                        className={`text-xs py-1.5 rounded border transition-colors ${
                          setbackType === key
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:border-primary hover:text-primary"
                        }`}
                      >{label}</button>
                    ))}
                  </div>
                </div>

                {/* Row spacing */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Row Spacing</label>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      ["tight", "1 ft"], ["standard", "1.5 ft"], ["wide", "2.5 ft"]
                    ] as const).map(([key, label]) => (
                      <button key={key}
                        onClick={() => setRowSpacingType(key)}
                        className={`text-xs py-1.5 rounded border transition-colors ${
                          rowSpacingType === key
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:border-primary hover:text-primary"
                        }`}
                      >{label}</button>
                    ))}
                  </div>
                </div>

              </CardContent>
            </Card>
          </div>

          {/* ─ Diagram ─ */}
          <div className="flex flex-col gap-4">
            <Card className="flex-1">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Top-Down Placement Diagram</CardTitle>
                <CardDescription className="text-xs">North is up · Orange arrow = panel facing direction · Blue = panels needed · Light blue = extra capacity</CardDescription>
              </CardHeader>
              <CardContent className="p-2 sm:p-4">
                <div className="aspect-[4/3] w-full border rounded-lg bg-slate-50 dark:bg-slate-900/20 overflow-hidden">
                  <RoofDiagram
                    roofWidth={roofWidth}
                    roofLength={roofLength}
                    azimuth={azimuth}
                    pitchDeg={pitchDeg}
                    panelOrientation={panelOrientation}
                    setbackFt={setbackFt}
                    ridgeSetbackFt={ridgeSetbackFt}
                    rowSpacingFt={rowSpacingFt}
                    numPanelsNeeded={numPanelsNeeded}
                  />
                </div>
              </CardContent>
            </Card>

            {/* ─ Stats row ─ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

              {/* Panel count */}
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Panels</p>
                  <div className={`text-2xl font-extrabold ${hasEnough ? "text-green-600" : "text-red-500"}`}>
                    {panelsPlaced} <span className="text-base font-normal text-muted-foreground">fit</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {numPanelsNeeded} needed ·{" "}
                    {hasEnough
                      ? <span className="text-green-600 font-medium">✓ enough space</span>
                      : <span className="text-red-500 font-medium">need {numPanelsNeeded - panelsPlaced} more</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{cols} col × {rows} row · {roofCoverage}% roof coverage</div>
                </CardContent>
              </Card>

              {/* Sun exposure */}
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Sun Exposure</p>
                  <div className={`text-2xl font-extrabold ${expInfo.color}`}>{exposure}%</div>
                  <div className={`text-xs font-semibold mt-0.5 ${expInfo.color}`}>
                    {"★".repeat(expInfo.stars)}{"☆".repeat(5 - expInfo.stars)} {expInfo.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {azimuthLabel(azimuth)} · Pitch {pitchDeg}°
                  </div>
                </CardContent>
              </Card>

              {/* Tilt angle */}
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Roof Tilt</p>
                  <div className="mt-1">
                    <TiltSideView pitchDeg={pitchDeg} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {pitchDeg < 10 ? "Flat/low — ballast mount required" :
                     pitchDeg < 20 ? "Shallow — standard racking" :
                     pitchDeg < 35 ? "Ideal tilt range" :
                     "Steep — special hardware needed"}
                  </div>
                </CardContent>
              </Card>
            </div>

          </div>
        </div>

        {/* ── Assumptions & NEC Notes ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-500" /> Sun Exposure Model
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1.5">
              <p>• Based on panel azimuth (facing direction) and roof tilt angle</p>
              <p>• South (180°) = peak exposure for US locations</p>
              <p>• East/West (90°/270°) ≈ 72% relative exposure</p>
              <p>• North-facing (&lt;315° or &gt;45°) ≈ 45% — generally not recommended in the US</p>
              <p>• Pitch optimal range: 15°–35° for most US latitudes</p>
              <p className="italic text-muted-foreground/70 pt-1">Does not model tree shading, chimney shadows, or horizon obstruction</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> NEC 690 Setback Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1.5">
              <p>• <strong>Perimeter setback:</strong> 3 ft from all roof edges (NEC 690.12 / IFC)</p>
              <p>• <strong>Ridge setback:</strong> 3 ft minimum from ridge line</p>
              <p>• <strong>Hip/valley:</strong> 18" clear on each side of hip/valley</p>
              <p>• <strong>Fire access:</strong> Continuous 3-ft pathway from eave to ridge required on at least one side</p>
              <p>• Some AHJs allow 18" minimum — confirm with local building department</p>
              <p className="italic text-muted-foreground/70 pt-1">"Minimum" setback option uses 18" — verify locally before permit submittal</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" /> Layout Best Practices
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1.5">
              <p>• <strong>Portrait orientation</strong> usually fits more panels on narrow roofs</p>
              <p>• <strong>Landscape</strong> may reduce shading row-to-row on low-pitched roofs</p>
              <p>• <strong>Row spacing</strong> &gt; 1.5 ft recommended for maintenance access and racking clearance</p>
              <p>• Keep all panels in one string within the same azimuth plane to avoid mismatch losses</p>
              <p>• Split arrays east + west viable for hybrid systems (morning + afternoon coverage)</p>
              <p className="italic text-muted-foreground/70 pt-1">
                Google Solar API integration planned — will add automated panel placement from satellite imagery
              </p>
            </CardContent>
          </Card>

        </div>

      </div>
    </AppLayout>
  );
}
