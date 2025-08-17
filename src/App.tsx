import React, { useMemo, useRef, useState, useEffect } from "react";

// Helpers mínimos
function distance(a: Pt, b: Pt) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleBetween(p1: Pt, p2: Pt, p3: Pt) {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y }; const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const dot = v1.x * v2.x + v1.y * v2.y; const m1 = Math.hypot(v1.x, v1.y); const m2 = Math.hypot(v2.x, v2.y);
  if (m1 === 0 || m2 === 0) return NaN; let cos = dot / (m1 * m2); cos = Math.max(-1, Math.min(1, cos));
  return Math.acos(cos) * 180 / Math.PI;
}
function angleBetweenLines(pA1: Pt, pA2: Pt, pB1: Pt, pB2: Pt) {
  const v1 = { x: pA2.x - pA1.x, y: pA2.y - pA1.y }; const v2 = { x: pB2.x - pB1.x, y: pB2.y - pB1.y };
  const dot = v1.x * v2.x + v1.y * v2.y; const m1 = Math.hypot(v1.x, v1.y); const m2 = Math.hypot(v2.x, v2.y);
  if (m1 === 0 || m2 === 0) return NaN; let cos = dot / (m1 * m2); cos = Math.max(-1, Math.min(1, cos));
  return Math.acos(cos) * 180 / Math.PI;
}
function pointLineDistanceSigned(p: Pt, a: Pt, b: Pt) {
  const num = (b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y); const den = Math.hypot(b.x - a.x, b.y - a.y);
  return den === 0 ? NaN : num / den;
}
function toFixedOrDash(n: number | undefined | null, d = 2) { return n == null || Number.isNaN(n) ? "—" : n.toFixed(d); }
function zScore(v: number, m: number, sd: number) { return Number.isNaN(v) || sd <= 0 ? NaN : (v - m) / sd; }
function arcPath(v: Pt, p1: Pt, p2: Pt, r = 35) {
  const a1 = Math.atan2(p1.y - v.y, p1.x - v.x), a2 = Math.atan2(p2.y - v.y, p2.x - v.x); let da = a2 - a1;
  while (da <= -Math.PI) da += 2 * Math.PI; while (da > Math.PI) da -= 2 * Math.PI; const s = { x: v.x + r * Math.cos(a1), y: v.y + r * Math.sin(a1) }, e = { x: v.x + r * Math.cos(a2), y: v.y + r * Math.sin(a2) };
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${Math.abs(da) > Math.PI ? 1 : 0} ${da > 0 ? 1 : 0} ${e.x} ${e.y}`;
}
function todayISO() { const d = new Date(); const m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0"); return `${d.getFullYear()}-${m}-${day}`; }

// Types
type Pt = { x: number; y: number };

type LandmarkKey = "S"|"N"|"A"|"B"|"Po"|"Or"|"Go"|"Me"|"Pg"|"Gn"|"Ar"|"U1T"|"U1A"|"L1T"|"L1A";

const LANDMARKS: { key: LandmarkKey; label: string; desc: string }[] = [
  { key: "S", label: "S – Sella", desc: "Centro de la silla turca" },
  { key: "N", label: "N – Nasion", desc: "Sutura frontonasal" },
  { key: "A", label: "A – Punto A", desc: "Subespinal maxilar" },
  { key: "B", label: "B – Punto B", desc: "Supramentoniano" },
  { key: "Po", label: "Po – Porion", desc: "Borde sup. del meato acústico ext." },
  { key: "Or", label: "Or – Orbitale", desc: "Punto más inferior del borde orbitario" },
  { key: "Go", label: "Go – Gonion", desc: "Ángulo mandibular" },
  { key: "Me", label: "Me – Menton", desc: "Punto más inferior de la sínfisis" },
  { key: "Pg", label: "Pg – Pogonion", desc: "Punto más prominente del mentón" },
  { key: "Gn", label: "Gn – Gnathion", desc: "Punto más anterior e inferior de sínfisis" },
  { key: "Ar", label: "Ar – Articulare", desc: "Intersección posterior de rama y base craneal" },
  { key: "U1T", label: "U1T – Incisivo sup. borde", desc: "Borde incisal incisivo superior" },
  { key: "U1A", label: "U1A – Incisivo sup. ápice", desc: "Ápice radicular incisivo superior" },
  { key: "L1T", label: "L1T – Incisivo inf. borde", desc: "Borde incisal incisivo inferior" },
  { key: "L1A", label: "L1A – Incisivo inf. ápice", desc: "Ápice radicular incisivo inferior" },
];

const DEFAULT_NORMS = {
  steiner: { SNA:{mean:82,sd:3}, SNB:{mean:80,sd:3}, ANB:{mean:2,sd:2}, SN_GoGn:{mean:32,sd:5}, U1_NA_deg:{mean:22,sd:6}, U1_NA_mm:{mean:4,sd:2}, L1_NB_deg:{mean:25,sd:6}, L1_NB_mm:{mean:4,sd:2}, Interincisal:{mean:131,sd:6}, Pg_NB_mm:{mean:0,sd:2} },
  bjork: { Saddle_NSAr:{mean:123,sd:5}, Articular_SArGo:{mean:143,sd:6}, Gonial_ArGoMe:{mean:130,sd:7}, Sum_Bjork:{mean:396,sd:6}, Jarabak_Ratio:{mean:65,sd:3} },
};

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Cefalometría</h1>
        <p className="text-slate-300 mt-0.5 mb-4 text-sm">
          <a href="https://www.instagram.com/dr.juarez" target="_blank" rel="noopener" className="underline/50 hover:underline">by @dr.juarez</a>
        </p>
        <CephTracer />
        <footer className="mt-8 text-xs text-slate-400">Realizado por Fernando Juárez – @dr.juarez</footer>
      </div>
    </div>
  );
}

function CephTracer() {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [calibClicks, setCalibClicks] = useState<Pt[]>([]);
  const [mmKnown, setMmKnown] = useState<number>(10);
  const [mmPerPx, setMmPerPx] = useState<number | null>(null); // mm por px (en tamaño renderizado)
  const [calibMode, setCalibMode] = useState<boolean>(false);
  const [points, setPoints] = useState<Partial<Record<LandmarkKey, Pt>>>({});
  const [activeKey, setActiveKey] = useState<LandmarkKey | null>("N");
  const [placingMode, setPlacingMode] = useState<boolean>(true);
  const [showOverlay, setShowOverlay] = useState<boolean>(true);
  const [useSteiner, setUseSteiner] = useState<boolean>(true);
  const [useBjork, setUseBjork] = useState<boolean>(true);
  const [pNombre, setPNombre] = useState("");
  const [pEdad, setPEdad] = useState<string>("");
  const [pSexo, setPSexo] = useState<string>("F");
  const [pFecha, setPFecha] = useState<string>(todayISO());
  const [pDoctor, setPDoctor] = useState<string>("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafId = useRef<number | null>(null);
  const [downloadHint, setDownloadHint] = useState<{ url: string; name: string } | null>(null);
  const [lastCSV, setLastCSV] = useState<string | null>(null);

  useEffect(() => {
    if (!imgSrc) return; const i = new Image(); i.onload = () => setImgSize({ w: i.naturalWidth, h: i.naturalHeight }); i.src = imgSrc;
  }, [imgSrc]);
  useEffect(() => () => { window.removeEventListener("mousemove", onMove as any); window.removeEventListener("mouseup", onUp as any); if (rafId.current) cancelAnimationFrame(rafId.current); if (downloadHint?.url?.startsWith("blob:")) URL.revokeObjectURL(downloadHint.url); }, [downloadHint]);

  useEffect(() => { try {
    console.assert(Math.abs(distance({x:0,y:0},{x:3,y:4})-5)<1e-6, "dist 3-4-5");
    const right90 = angleBetween({x:0,y:0},{x:1,y:0},{x:1,y:1}); console.assert(Math.abs(right90-90)<1e-6, "ang 90");
    const lineAng = angleBetweenLines({x:0,y:0},{x:1,y:0},{x:0,y:0},{x:0,y:1}); console.assert(Math.abs(lineAng-90)<1e-6, "angL 90");
  } catch {} }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setImgSrc(String(r.result)); r.readAsDataURL(f); }
  function resetAll() { setPoints({}); setCalibClicks([]); setMmPerPx(null); }

  function onCanvasClick(e: React.MouseEvent) {
    if (!imgRef.current) return; const rect = (e.target as HTMLElement).getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top; const pt = {x,y};
    if (calibMode) { const next = [...calibClicks, pt].slice(-2); setCalibClicks(next); if (next.length===2) { const px = distance(next[0], next[1]); if (mmKnown>0 && px>0){ setMmPerPx(mmKnown/px); setCalibMode(false);} } return; }
    if (placingMode && activeKey) setPoints(prev=>({ ...prev, [activeKey]: pt }));
  }

  const dragInfo = useRef<{ key: LandmarkKey | null; offset: Pt } | null>(null);
  function onPointMouseDown(k: LandmarkKey, e: React.MouseEvent) {
    e.stopPropagation(); const target = e.target as SVGCircleElement; const rect = target.closest("svg")!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top; const p = points[k]!; dragInfo.current = { key:k, offset:{ x: x - p.x, y: y - p.y } };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  }
  function onMove(e: MouseEvent) {
    if (!dragInfo.current) return; const svg = containerRef.current?.querySelector("svg"); if (!svg) return; const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left - dragInfo.current.offset.x; const y = e.clientY - rect.top - dragInfo.current.offset.y; const k = dragInfo.current.key!;
    if (rafId.current) return; rafId.current = requestAnimationFrame(() => { setPoints(prev => ({ ...prev, [k]: { x, y } })); rafId.current = null; });
  }
  function onUp(){ window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); dragInfo.current=null; }

  const has = (k: LandmarkKey) => Boolean(points[k]);
  const mm = (px: number) => (mmPerPx ? px * mmPerPx : px);

  // Steiner
  const SNA = useMemo(() => (has("S")&&has("N")&&has("A"))? angleBetween(points.S!, points.N!, points.A!) : NaN, [points]);
  const SNB = useMemo(() => (has("S")&&has("N")&&has("B"))? angleBetween(points.S!, points.N!, points.B!) : NaN, [points]);
  const ANB = useMemo(() => (Number.isNaN(SNA)||Number.isNaN(SNB))? NaN : SNA - SNB, [SNA,SNB]);
  const SN_GoGn = useMemo(() => (has("S")&&has("N")&&has("Go")&&has("Gn"))? angleBetweenLines(points.S!, points.N!, points.Go!, points.Gn!) : NaN, [points]);
  const U1_axis = has("U1T")&&has("U1A")? [points.U1T!, points.U1A!] as [Pt,Pt] : null;
  const L1_axis = has("L1T")&&has("L1A")? [points.L1T!, points.L1A!] as [Pt,Pt] : null;
  const U1_NA_deg = useMemo(() => (U1_axis && has("N") && has("A"))? angleBetweenLines(U1_axis[0], U1_axis[1], points.N!, points.A!) : NaN, [points]);
  const U1_NA_mm  = useMemo(() => (has("U1T")&&has("N")&&has("A"))? Math.abs(mm(pointLineDistanceSigned(points.U1T!, points.N!, points.A!))) : NaN, [points, mmPerPx]);
  const L1_NB_deg = useMemo(() => (L1_axis && has("N") && has("B"))? angleBetweenLines(L1_axis[0], L1_axis[1], points.N!, points.B!) : NaN, [points]);
  const L1_NB_mm  = useMemo(() => (has("L1T")&&has("N")&&has("B"))? Math.abs(mm(pointLineDistanceSigned(points.L1T!, points.N!, points.B!))) : NaN, [points, mmPerPx]);
  const Interincisal = useMemo(() => (U1_axis && L1_axis)? angleBetweenLines(U1_axis[0], U1_axis[1], L1_axis[0], L1_axis[1]) : NaN, [points]);
  const Pg_NB_mm = useMemo(() => (has("Pg")&&has("N")&&has("B"))? mm(pointLineDistanceSigned(points.Pg!, points.N!, points.B!)) : NaN, [points, mmPerPx]);
  // Björk–Jarabak
  const Saddle_NSAr = useMemo(() => (has("N")&&has("S")&&has("Ar"))? angleBetween(points.N!, points.S!, points.Ar!) : NaN, [points]);
  const Articular_SArGo = useMemo(() => (has("S")&&has("Ar")&&has("Go"))? angleBetween(points.S!, points.Ar!, points.Go!) : NaN, [points]);
  const Gonial_ArGoMe = useMemo(() => (has("Ar")&&has("Go")&&has("Me"))? angleBetween(points.Ar!, points.Go!, points.Me!) : NaN, [points]);
  const Sum_Bjork = useMemo(() => (Number.isNaN(Saddle_NSAr)||Number.isNaN(Articular_SArGo)||Number.isNaN(Gonial_ArGoMe))? NaN : Saddle_NSAr+Articular_SArGo+Gonial_ArGoMe, [Saddle_NSAr,Articular_SArGo,Gonial_ArGoMe]);
  const Jarabak_Ratio = useMemo(() => (has("S")&&has("Go")&&has("N")&&has("Me"))? (distance(points.S!, points.Go!) / distance(points.N!, points.Me!)) * 100 : NaN, [points]);

  const scaleLabel = mmPerPx ? `Escala (vista): ${(1 / mmPerPx).toFixed(2)} px/mm · ${mmPerPx.toFixed(4)} mm/px` : "Sin calibrar";

  function setManualLink(url: string, name: string) { if (downloadHint?.url?.startsWith("blob:")) URL.revokeObjectURL(downloadHint.url); setDownloadHint({ url, name }); }
  function exportJSON(){ const blob = new Blob([JSON.stringify({ points, mmPerPx }, null, 2)], { type: "application/json" }); triggerDownload(blob, "cefalo_trazado.json"); }
  function importJSON(e: React.ChangeEvent<HTMLInputElement>){ const f = e.target.files?.[0]; if(!f) return; const r = new FileReader(); r.onload = () => { try { const data = JSON.parse(String(r.result)); if (data.points) setPoints(data.points); if (typeof data.mmPerPx === "number") setMmPerPx(data.mmPerPx); } catch { alert("JSON inválido"); } }; r.readAsText(f); }

  function exportCSV(){
    const rows: string[][] = [["Medida","Valor", mmPerPx?"Unidades":"Unidades (px)", "z-score"]];
    if (useSteiner) rows.push(["— Steiner —","","",""],
      ["SNA", toFixedOrDash(SNA), "°", toFixedOrDash(zScore(SNA, DEFAULT_NORMS.steiner.SNA.mean, DEFAULT_NORMS.steiner.SNA.sd))],
      ["SNB", toFixedOrDash(SNB), "°", toFixedOrDash(zScore(SNB, DEFAULT_NORMS.steiner.SNB.mean, DEFAULT_NORMS.steiner.SNB.sd))],
      ["ANB", toFixedOrDash(ANB), "°", toFixedOrDash(zScore(ANB, DEFAULT_NORMS.steiner.ANB.mean, DEFAULT_NORMS.steiner.ANB.sd))],
      ["SN–GoGn", toFixedOrDash(SN_GoGn), "°", toFixedOrDash(zScore(SN_GoGn, DEFAULT_NORMS.steiner.SN_GoGn.mean, DEFAULT_NORMS.steiner.SN_GoGn.sd))],
      ["U1–NA (°)", toFixedOrDash(U1_NA_deg), "°", toFixedOrDash(zScore(U1_NA_deg, DEFAULT_NORMS.steiner.U1_NA_deg.mean, DEFAULT_NORMS.steiner.U1_NA_deg.sd))],
      ["U1–NA (mm)", toFixedOrDash(U1_NA_mm), mmPerPx?"mm":"px", toFixedOrDash(zScore(U1_NA_mm, DEFAULT_NORMS.steiner.U1_NA_mm.mean, DEFAULT_NORMS.steiner.U1_NA_mm.sd))],
      ["L1–NB (°)", toFixedOrDash(L1_NB_deg), "°", toFixedOrDash(zScore(L1_NB_deg, DEFAULT_NORMS.steiner.L1_NB_deg.mean, DEFAULT_NORMS.steiner.L1_NB_deg.sd))],
      ["L1–NB (mm)", toFixedOrDash(L1_NB_mm), mmPerPx?"mm":"px", toFixedOrDash(zScore(L1_NB_mm, DEFAULT_NORMS.steiner.L1_NB_mm.mean, DEFAULT_NORMS.steiner.L1_NB_mm.sd))],
      ["Interincisal", toFixedOrDash(Interincisal), "°", toFixedOrDash(zScore(Interincisal, DEFAULT_NORMS.steiner.Interincisal.mean, DEFAULT_NORMS.steiner.Interincisal.sd))],
      ["Pg–NB (±)", toFixedOrDash(Pg_NB_mm), mmPerPx?"mm":"px", toFixedOrDash(zScore(Pg_NB_mm, DEFAULT_NORMS.steiner.Pg_NB_mm.mean, DEFAULT_NORMS.steiner.Pg_NB_mm.sd))]
    );
    if (useBjork) rows.push(["— Björk–Jarabak —","","",""],
      ["Saddle (N–S–Ar)", toFixedOrDash(Saddle_NSAr), "°", toFixedOrDash(zScore(Saddle_NSAr, DEFAULT_NORMS.bjork.Saddle_NSAr.mean, DEFAULT_NORMS.bjork.Saddle_NSAr.sd))],
      ["Articular (S–Ar–Go)", toFixedOrDash(Articular_SArGo), "°", toFixedOrDash(zScore(Articular_SArGo, DEFAULT_NORMS.bjork.Articular_SArGo.mean, DEFAULT_NORMS.bjork.Articular_SArGo.sd))],
      ["Gonial (Ar–Go–Me)", toFixedOrDash(Gonial_ArGoMe), "°", toFixedOrDash(zScore(Gonial_ArGoMe, DEFAULT_NORMS.bjork.Gonial_ArGoMe.mean, DEFAULT_NORMS.bjork.Gonial_ArGoMe.sd))],
      ["Suma Björk", toFixedOrDash(Sum_Bjork), "°", toFixedOrDash(zScore(Sum_Bjork, DEFAULT_NORMS.bjork.Sum_Bjork.mean, DEFAULT_NORMS.bjork.Sum_Bjork.sd))],
      ["Jarabak % (S–Go / N–Me)", toFixedOrDash(Jarabak_Ratio), "%", toFixedOrDash(zScore(Jarabak_Ratio, DEFAULT_NORMS.bjork.Jarabak_Ratio.mean, DEFAULT_NORMS.bjork.Jarabak_Ratio.sd))]
    );
    const csv = rows.map(r=>r.join(",")).join("\r\n"); setLastCSV(csv); triggerDownload(new Blob([csv], {type:"text/csv;charset=utf-8"}), "cefalo_resultados.csv");
  }
  function triggerDownload(blob: Blob, filename: string){ const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.rel="noopener"; try{ document.body.appendChild(a); a.click(); a.remove(); }catch{} setManualLink(url, filename); }

  // === Render export con coordenadas a tamaño NATURAL ===
  async function renderSheetCanvas(): Promise<HTMLCanvasElement | null> {
    if (!imgRef.current) { alert("Primero sube una radiografía."); return null; }
    const imgEl = imgRef.current; if (!imgEl.complete) { try { await (imgEl as any).decode?.(); } catch {} }
    const natW = imgEl.naturalWidth, natH = imgEl.naturalHeight; const renW = imgEl.width || imgEl.getBoundingClientRect().width; const renH = imgEl.height || imgEl.getBoundingClientRect().height;
    if (!natW || !natH || !renW || !renH) { alert("La imagen aún no está lista para exportar."); return null; }
    const sx = natW / renW, sy = natH / renH; // factor de escala render->natural

    const sidebarW = 420, pad = 24; const W = natW + sidebarW + pad * 2, H = natH + pad * 2;
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H; const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0b1220"; ctx.fillRect(0, 0, W, H); ctx.drawImage(imgEl, pad, pad, natW, natH);

    const P: Partial<Record<LandmarkKey, Pt>> = {};
    (LANDMARKS as any as {key:LandmarkKey}[]).forEach(({key}) => { const p = (points as any)[key] as Pt | undefined; if (p) (P as any)[key] = { x: p.x * sx, y: p.y * sy }; });
    const U1_axisE = P.U1T && P.U1A ? [P.U1T, P.U1A] as [Pt,Pt] : null; const L1_axisE = P.L1T && P.L1A ? [P.L1T, P.L1A] as [Pt,Pt] : null;

    function drawLine(a?: Pt, b?: Pt, style = "#38bdf8", dash = false){ if (!a || !b) return; ctx.save(); if (dash) ctx.setLineDash([6,4]); ctx.strokeStyle = style; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pad + a.x, pad + a.y); ctx.lineTo(pad + b.x, pad + b.y); ctx.stroke(); ctx.restore(); }
    function drawPoint(p?: Pt){ if (!p) return; ctx.save(); ctx.fillStyle = "#94a3b8"; ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pad + p.x, pad + p.y, 5, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.restore(); }
    function drawArc(v?: Pt, p1?: Pt, p2?: Pt, color = "#22c55e"){ if (!v||!p1||!p2||!showOverlay) return; ctx.save(); const a1=Math.atan2(p1.y-v.y,p1.x-v.x), a2=Math.atan2(p2.y-v.y,p2.x-v.x); let da=a2-a1; while(da<=-Math.PI)da+=2*Math.PI; while(da>Math.PI)da-=2*Math.PI; ctx.strokeStyle=color; ctx.lineWidth=2; ctx.setLineDash([4,3]); ctx.beginPath(); ctx.arc(pad+v.x,pad+v.y,35,a1,a2,da<0); ctx.stroke(); ctx.restore(); }

    drawLine(P.S, P.N, "#38bdf8"); drawLine(P.N, P.A, "#22c55e"); drawLine(P.N, P.B, "#f97316"); drawLine(P.Po, P.Or, "#a78bfa", true); drawLine(P.Go, P.Me, "#f472b6", true); drawLine(P.Go, P.Gn, "#94a3b8");
    if (U1_axisE) drawLine(U1_axisE[0], U1_axisE[1], "#eab308"); if (L1_axisE) drawLine(L1_axisE[0], L1_axisE[1], "#22d3ee");
    Object.values(P).forEach(p=>drawPoint(p));
    drawArc(P.N, P.S, P.A, "#22c55e"); drawArc(P.N, P.S, P.B, "#f97316"); drawArc(P.N, P.A, P.B, "#38bdf8"); drawArc(P.S, P.N, P.Ar, "#16a34a"); drawArc(P.Ar, P.S, P.Go, "#d946ef"); drawArc(P.Go, P.Ar, P.Me, "#fb7185");

    const x0 = pad + natW + 16; let y = pad + 8; ctx.fillStyle="#e2e8f0"; ctx.font = "bold 20px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif";
    ctx.fillText("Cefalometría", x0, y); y += 22; ctx.font = "12px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif"; ctx.fillStyle="#93c5fd"; ctx.fillText("by @dr.juarez", x0, y); y += 6;
    const mmPerPxNat = mmPerPx ? (mmPerPx / ((sx+sy)/2)) : null; const scaleLabelExport = mmPerPxNat ? `Escala: ${(1/mmPerPxNat).toFixed(2)} px/mm · ${mmPerPxNat.toFixed(4)} mm/px` : "Sin calibrar";
    ctx.fillStyle="#94a3b8"; ctx.fillText(scaleLabelExport, x0, y + 18); y += 36;
    function lineKV(k: string, v: string, z?: number){ ctx.fillStyle="#e2e8f0"; ctx.fillText(k, x0, y); const vStr = v + (z==null||Number.isNaN(z)?"":`  (z ${z>=0?"+":""}${z.toFixed(2)})`); ctx.textAlign="right"; ctx.fillText(vStr, x0 + sidebarW - 24, y); ctx.textAlign="left"; y += 16; }

    ctx.fillStyle="#93c5fd"; ctx.font = "bold 14px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif"; ctx.fillText("Datos del paciente", x0, y); y += 18; ctx.font = "12px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif";
    lineKV("Nombre", pNombre||"—"); lineKV("Edad", pEdad?`${pEdad} años`:"—"); lineKV("Sexo", pSexo||"—"); lineKV("Fecha", pFecha||"—"); lineKV("Doctor", pDoctor||"—"); y += 6;

    if (useSteiner){ ctx.fillStyle="#93c5fd"; ctx.font = "bold 14px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif"; ctx.fillText("Steiner", x0, y); y+=18; ctx.font = "12px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif";
      lineKV("SNA (°)", toFixedOrDash(SNA), zScore(SNA, DEFAULT_NORMS.steiner.SNA.mean, DEFAULT_NORMS.steiner.SNA.sd));
      lineKV("SNB (°)", toFixedOrDash(SNB), zScore(SNB, DEFAULT_NORMS.steiner.SNB.mean, DEFAULT_NORMS.steiner.SNB.sd));
      lineKV("ANB (°)", toFixedOrDash(ANB), zScore(ANB, DEFAULT_NORMS.steiner.ANB.mean, DEFAULT_NORMS.steiner.ANB.sd));
      lineKV("SN–GoGn (°)", toFixedOrDash(SN_GoGn), zScore(SN_GoGn, DEFAULT_NORMS.steiner.SN_GoGn.mean, DEFAULT_NORMS.steiner.SN_GoGn.sd));
      lineKV("U1–NA (°)", toFixedOrDash(U1_NA_deg), zScore(U1_NA_deg, DEFAULT_NORMS.steiner.U1_NA_deg.mean, DEFAULT_NORMS.steiner.U1_NA_deg.sd));
      lineKV("U1–NA (mm)", toFixedOrDash(U1_NA_mm), zScore(U1_NA_mm, DEFAULT_NORMS.steiner.U1_NA_mm.mean, DEFAULT_NORMS.steiner.U1_NA_mm.sd));
      lineKV("L1–NB (°)", toFixedOrDash(L1_NB_deg), zScore(L1_NB_deg, DEFAULT_NORMS.steiner.L1_NB_deg.mean, DEFAULT_NORMS.steiner.L1_NB_deg.sd));
      lineKV("L1–NB (mm)", toFixedOrDash(L1_NB_mm), zScore(L1_NB_mm, DEFAULT_NORMS.steiner.L1_NB_mm.mean, DEFAULT_NORMS.steiner.L1_NB_mm.sd));
      lineKV("Interincisal (°)", toFixedOrDash(Interincisal), zScore(Interincisal, DEFAULT_NORMS.steiner.Interincisal.mean, DEFAULT_NORMS.steiner.Interincisal.sd));
      lineKV("Pg–NB (mm)", toFixedOrDash(Pg_NB_mm), zScore(Pg_NB_mm, DEFAULT_NORMS.steiner.Pg_NB_mm.mean, DEFAULT_NORMS.steiner.Pg_NB_mm.sd)); y+=6;
    }
    if (useBjork){ ctx.fillStyle="#93c5fd"; ctx.font = "bold 14px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif"; ctx.fillText("Björk–Jarabak", x0, y); y+=18; ctx.font = "12px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif";
      lineKV("Saddle (°)", toFixedOrDash(Saddle_NSAr), zScore(Saddle_NSAr, DEFAULT_NORMS.bjork.Saddle_NSAr.mean, DEFAULT_NORMS.bjork.Saddle_NSAr.sd));
      lineKV("Articular (°)", toFixedOrDash(Articular_SArGo), zScore(Articular_SArGo, DEFAULT_NORMS.bjork.Articular_SArGo.mean, DEFAULT_NORMS.bjork.Articular_SArGo.sd));
      lineKV("Gonial (°)", toFixedOrDash(Gonial_ArGoMe), zScore(Gonial_ArGoMe, DEFAULT_NORMS.bjork.Gonial_ArGoMe.mean, DEFAULT_NORMS.bjork.Gonial_ArGoMe.sd));
      lineKV("Suma (°)", toFixedOrDash(Sum_Bjork), zScore(Sum_Bjork, DEFAULT_NORMS.bjork.Sum_Bjork.mean, DEFAULT_NORMS.bjork.Sum_Bjork.sd));
      lineKV("Jarabak (%)", toFixedOrDash(Jarabak_Ratio), zScore(Jarabak_Ratio, DEFAULT_NORMS.bjork.Jarabak_Ratio.mean, DEFAULT_NORMS.bjork.Jarabak_Ratio.sd));
    }
    return canvas;
  }

  async function exportSheetPNG(){ const c = await renderSheetCanvas(); if(!c) return; const blob: Blob | null = await new Promise(res=>c.toBlob(res,"image/png")); if(!blob){ const url = c.toDataURL("image/png"); setManualLink(url, "cefalometria.png"); try{ const a=document.createElement("a"); a.href=url; a.download="cefalometria.png"; a.rel="noopener"; a.target="_blank"; document.body.appendChild(a); a.click(); a.remove(); }catch{} return;} triggerDownload(blob, "cefalometria.png"); }
  async function exportSheetPDF(){ const c = await renderSheetCanvas(); if(!c) return; const dataUrl = c.toDataURL("image/png"); const html = `<!doctype html><html><head><meta charset=\"utf-8\"/><title>Cefalometría – PDF</title><style>@page{size:A4;margin:16mm}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;color:#0b1220;margin:0}.hdr{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px}.brand{font-size:12px;color:#2563eb}.meta{font-size:12px;color:#334155;margin-bottom:12px}.img{width:100%;max-width:100%}a{color:#2563eb;text-decoration:underline}</style></head><body><div class=\"hdr\"><h1 style=\"margin:0;font-size:20px\">Cefalometría</h1><div class=\"brand\"><a href=\"https://www.instagram.com/dr.juarez\" target=\"_blank\" rel=\"noopener\">by @dr.juarez</a></div></div><div class=\"meta\"><div><strong>Paciente:</strong> ${pNombre || "—"}</div><div><strong>Edad:</strong> ${pEdad ? pEdad+" años" : "—"} &nbsp; <strong>Sexo:</strong> ${pSexo || "—"}</div><div><strong>Fecha:</strong> ${pFecha || "—"} &nbsp; <strong>Doctor:</strong> ${pDoctor || "—"}</div></div><img class=\"img\" src=\"${dataUrl}\" alt=\"Lámina cefalométrica\"/><script>window.onload=()=>{setTimeout(()=>window.print(),400)}</script></body></html>`; const blob = new Blob([html], {type:"text/html;charset=utf-8"}); const url = URL.createObjectURL(blob); const w = window.open(url, "_blank"); if(!w) setManualLink(url, "cefalometria.pdf.html"); }

  // Exportar SOLO tabla de medidas (extra)
  function buildMeasuresRows(){
    const rows: {k:string,v:string,u:string,z:string}[] = [];
    const push = (k:string, val:number, u:string, m:number, sd:number) => rows.push({k, v: toFixedOrDash(val), u, z: toFixedOrDash(zScore(val, m, sd))});
    if (useSteiner){ rows.push({k:"— Steiner —",v:"",u:"",z:""});
      push("SNA", SNA, "°", DEFAULT_NORMS.steiner.SNA.mean, DEFAULT_NORMS.steiner.SNA.sd);
      push("SNB", SNB, "°", DEFAULT_NORMS.steiner.SNB.mean, DEFAULT_NORMS.steiner.SNB.sd);
      push("ANB", ANB, "°", DEFAULT_NORMS.steiner.ANB.mean, DEFAULT_NORMS.steiner.ANB.sd);
      push("SN–GoGn", SN_GoGn, "°", DEFAULT_NORMS.steiner.SN_GoGn.mean, DEFAULT_NORMS.steiner.SN_GoGn.sd);
      push("U1–NA (°)", U1_NA_deg, "°", DEFAULT_NORMS.steiner.U1_NA_deg.mean, DEFAULT_NORMS.steiner.U1_NA_deg.sd);
      push("U1–NA (mm)", U1_NA_mm, mmPerPx?"mm":"px", DEFAULT_NORMS.steiner.U1_NA_mm.mean, DEFAULT_NORMS.steiner.U1_NA_mm.sd);
      push("L1–NB (°)", L1_NB_deg, "°", DEFAULT_NORMS.steiner.L1_NB_deg.mean, DEFAULT_NORMS.steiner.L1_NB_deg.sd);
      push("L1–NB (mm)", L1_NB_mm, mmPerPx?"mm":"px", DEFAULT_NORMS.steiner.L1_NB_mm.mean, DEFAULT_NORMS.steiner.L1_NB_mm.sd);
      push("Interincisal", Interincisal, "°", DEFAULT_NORMS.steiner.Interincisal.mean, DEFAULT_NORMS.steiner.Interincisal.sd);
      push("Pg–NB (±)", Pg_NB_mm, mmPerPx?"mm":"px", DEFAULT_NORMS.steiner.Pg_NB_mm.mean, DEFAULT_NORMS.steiner.Pg_NB_mm.sd);
    }
    if (useBjork){ rows.push({k:"— Björk–Jarabak —",v:"",u:"",z:""});
      push("Saddle (N–S–Ar)", Saddle_NSAr, "°", DEFAULT_NORMS.bjork.Saddle_NSAr.mean, DEFAULT_NORMS.bjork.Saddle_NSAr.sd);
      push("Articular (S–Ar–Go)", Articular_SArGo, "°", DEFAULT_NORMS.bjork.Articular_SArGo.mean, DEFAULT_NORMS.bjork.Articular_SArGo.sd);
      push("Gonial (Ar–Go–Me)", Gonial_ArGoMe, "°", DEFAULT_NORMS.bjork.Gonial_ArGoMe.mean, DEFAULT_NORMS.bjork.Gonial_ArGoMe.sd);
      push("Suma Björk", Sum_Bjork, "°", DEFAULT_NORMS.bjork.Sum_Bjork.mean, DEFAULT_NORMS.bjork.Sum_Bjork.sd);
      push("Jarabak % (S–Go/N–Me)", Jarabak_Ratio, "%", DEFAULT_NORMS.bjork.Jarabak_Ratio.mean, DEFAULT_NORMS.bjork.Jarabak_Ratio.sd);
    }
    return rows;
  }

  async function exportTablePNG(){
    const rows = buildMeasuresRows(); const pad=24, W=600, colW = [260,110,80,90]; const titleH=60; const rowH=22; const H = titleH + pad + rows.length*rowH + pad;
    const c = document.createElement("canvas"); c.width=W; c.height=H; const ctx=c.getContext("2d")!; ctx.fillStyle="#0b1220"; ctx.fillRect(0,0,W,H);
    let y = pad; ctx.fillStyle="#e2e8f0"; ctx.font="bold 20px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif"; ctx.fillText("Tabla de medidas", pad, y); y+=22; ctx.font="12px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif"; ctx.fillStyle="#93c5fd"; ctx.fillText("by @dr.juarez", pad, y); y+=16; ctx.fillStyle="#94a3b8"; ctx.fillText(`${pNombre||"—"} · ${pEdad? pEdad+" años":"—"} · ${pSexo||"—"} · ${pFecha||"—"} · Dr: ${pDoctor||"—"}`, pad, y); y+=16; ctx.strokeStyle="#1f2937"; ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-pad,y); ctx.stroke(); y+=14;
    ctx.fillStyle="#e2e8f0"; ctx.font="12px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif";
    rows.forEach(r=>{ if(r.u==="" && r.v==="" && r.z===""){ ctx.fillStyle="#93c5fd"; ctx.font="bold 13px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif"; ctx.fillText(r.k, pad, y); ctx.font="12px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif"; ctx.fillStyle="#e2e8f0"; y+=rowH; return; }
      let x=pad; ctx.fillText(r.k, x, y); x+=colW[0]; ctx.textAlign="right"; ctx.fillText(r.v, x, y); ctx.textAlign="left"; x+=20; ctx.fillText(r.u, x, y); x+=colW[2]; ctx.fillText(r.z, x, y); y+=rowH; });
    const blob: Blob | null = await new Promise(res=>c.toBlob(res, "image/png")); if (blob) triggerDownload(blob, "cefalo_tabla.png"); else setManualLink(c.toDataURL("image/png"), "cefalo_tabla.png");
  }
  async function exportTablePDF(){ const rows = buildMeasuresRows(); const htmlRows = rows.map(r=>r.u===""&&r.v===""&&r.z===""?`<tr><td colspan=4 style=\"padding-top:6px;color:#60a5fa;font-weight:600\">${r.k}</td></tr>`:`<tr><td>${r.k}</td><td style=\"text-align:right\">${r.v}</td><td>${r.u}</td><td>${r.z}</td></tr>`).join(""); const html = `<!doctype html><html><head><meta charset=\"utf-8\"/><title>Tabla de medidas</title><style>@page{size:A4;margin:16mm}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;color:#0b1220;margin:0}h1{font-size:20px;margin:0 0 6px 0}.sub{color:#2563eb;font-size:12px;margin-bottom:10px}table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px}thead th{color:#334155;text-align:left}</style></head><body><h1>Tabla de medidas</h1><div class=\"sub\">by @dr.juarez</div><div style=\"font-size:12px;color:#334155;margin-bottom:8px\">${pNombre||"—"} · ${pEdad? pEdad+" años":"—"} · ${pSexo||"—"} · ${pFecha||"—"} · Dr: ${pDoctor||"—"}</div><table><thead><tr><th>Medida</th><th style=\"text-align:right\">Valor</th><th>Unid</th><th>z</th></tr></thead><tbody>${htmlRows}</tbody></table><script>window.onload=()=>{setTimeout(()=>window.print(),400)}</script></body></html>`; const blob = new Blob([html], {type:"text/html;charset=utf-8"}); const url = URL.createObjectURL(blob); const w = window.open(url, "_blank"); if(!w) setManualLink(url, "cefalo_tabla.pdf.html"); }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-4 space-y-4">
        <section className="rounded-2xl border border-slate-800 p-4 bg-slate-900/50">
          <h2 className="font-semibold mb-2">1) Radiografía</h2>
          <input type="file" accept="image/*" onChange={handleFile} className="block w-full text-sm" />
          <div className="text-xs text-slate-400 mt-2">Formatos soportados: JPG/PNG. Usa la mayor resolución.</div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <button onClick={resetAll} className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm">Reiniciar trazado</button>
            <label className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm cursor-pointer">Importar JSON<input type="file" accept="application/json" onChange={importJSON} className="hidden" /></label>
            <button onClick={exportJSON} className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm">Exportar JSON</button>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-800 p-4 bg-slate-900/50">
          <h2 className="font-semibold mb-2">2) Calibración</h2>
          <p className="text-xs text-slate-400 mb-2">Haz <span className="text-sky-300">dos clics</span> sobre la regla y escribe la longitud real (mm).</p>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={()=>{ setCalibMode(true); setCalibClicks([]); }} className={`px-3 py-1.5 rounded-xl text-sm ${calibMode?"bg-emerald-600":"bg-slate-800 hover:bg-slate-700"}`}>{calibMode?"Calibrando… (haz dos clics)":"Iniciar calibración"}</button>
            <label className="text-xs text-slate-400">Longitud real (mm)</label>
            <input type="number" value={mmKnown} min={0.1} step={0.1} onChange={(e)=>setMmKnown(Number(e.target.value))} className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm" />
          </div>
          <div className="text-xs text-slate-400 mt-2">{scaleLabel}</div>
          {calibClicks.length===2 && (<div className="text-xs text-slate-400 mt-1">Distancia de referencia: {toFixedOrDash(distance(calibClicks[0], calibClicks[1]))} px</div>)}
        </section>
        <section className="rounded-2xl border border-slate-800 p-4 bg-slate-900/50">
          <h2 className="font-semibold mb-2">3) Plantillas de análisis</h2>
          <div className="flex flex-col gap-2 text-sm">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={useSteiner} onChange={e=>setUseSteiner(e.target.checked)} /> Steiner</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={useBjork} onChange={e=>setUseBjork(e.target.checked)} /> Björk–Jarabak</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={showOverlay} onChange={e=>setShowOverlay(e.target.checked)} /> Mostrar overlay</label>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-800 p-4 bg-slate-900/50">
          <h2 className="font-semibold mb-2">4) Datos del paciente</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="col-span-2">Nombre<input value={pNombre} onChange={e=>setPNombre(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1"/></label>
            <label>Edad<input type="number" min={0} max={120} value={pEdad} onChange={e=>setPEdad(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1"/></label>
            <label>Sexo<select value={pSexo} onChange={e=>setPSexo(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1"><option value="F">Femenino</option><option value="M">Masculino</option><option value="X">Otro</option></select></label>
            <label>Fecha<input type="date" value={pFecha} onChange={e=>setPFecha(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1"/></label>
            <label className="col-span-2">Doctor<input value={pDoctor} onChange={e=>setPDoctor(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1"/></label>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-800 p-4 bg-slate-900/50">
          <h2 className="font-semibold mb-2">5) Puntos cefalométricos</h2>
          <div className="flex items-center gap-2 mb-2"><label className="text-xs text-slate-400">Modo de colocación</label><input type="checkbox" checked={placingMode} onChange={e=>setPlacingMode(e.target.checked)} /><span className="text-xs text-slate-400">(Click para colocar / arrastrar para ajustar)</span></div>
          <ul className="space-y-1 max-h-64 overflow-auto pr-1">
            {LANDMARKS.map(lm=>{ const selected = activeKey===lm.key; const isSet = Boolean(points[lm.key]); return (
              <li key={lm.key} className="flex items-center justify-between gap-2">
                <button onClick={()=>setActiveKey(lm.key)} className={`text-left flex-1 px-2 py-1 rounded-lg text-sm ${selected?"bg-sky-600":"bg-slate-800 hover:bg-slate-700"}`} title={lm.desc}>{lm.label}</button>
                <span className={`text-xs ${isSet?"text-emerald-400":"text-slate-500"}`}>{isSet?"●":"○"}</span>
              </li>
            ); })}
          </ul>
        </section>
        <section className="rounded-2xl border border-slate-800 p-4 bg-slate-900/50">
          <h2 className="font-semibold mb-2">6) Resultados</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="text-slate-300"><th className="text-left font-medium py-1 pr-4">Medida</th><th className="text-right font-medium py-1 pr-4">Valor</th><th className="text-left font-medium py-1">Unid</th><th className="text-left font-medium py-1">z</th></tr></thead>
              <tbody className="text-slate-200">
                {useSteiner && (<>
                  <tr><td colSpan={4} className="pt-2 text-sky-300">— Steiner —</td></tr>
                  <RowZ name="SNA" value={SNA} units="°" norm={DEFAULT_NORMS.steiner.SNA} />
                  <RowZ name="SNB" value={SNB} units="°" norm={DEFAULT_NORMS.steiner.SNB} />
                  <RowZ name="ANB" value={ANB} units="°" norm={DEFAULT_NORMS.steiner.ANB} />
                  <RowZ name="SN–GoGn" value={SN_GoGn} units="°" norm={DEFAULT_NORMS.steiner.SN_GoGn} />
                  <RowZ name="U1–NA (°)" value={U1_NA_deg} units="°" norm={DEFAULT_NORMS.steiner.U1_NA_deg} />
                  <RowZ name="U1–NA (mm)" value={U1_NA_mm} units={mmPerPx?"mm":"px"} norm={DEFAULT_NORMS.steiner.U1_NA_mm} />
                  <RowZ name="L1–NB (°)" value={L1_NB_deg} units="°" norm={DEFAULT_NORMS.steiner.L1_NB_deg} />
                  <RowZ name="L1–NB (mm)" value={L1_NB_mm} units={mmPerPx?"mm":"px"} norm={DEFAULT_NORMS.steiner.L1_NB_mm} />
                  <RowZ name="Interincisal" value={Interincisal} units="°" norm={DEFAULT_NORMS.steiner.Interincisal} />
                  <RowZ name="Pg–NB (±)" value={Pg_NB_mm} units={mmPerPx?"mm":"px"} norm={DEFAULT_NORMS.steiner.Pg_NB_mm} />
                </>)}
                {useBjork && (<>
                  <tr><td colSpan={4} className="pt-2 text-sky-300">— Björk–Jarabak —</td></tr>
                  <RowZ name="Saddle (N–S–Ar)" value={Saddle_NSAr} units="°" norm={DEFAULT_NORMS.bjork.Saddle_NSAr} />
                  <RowZ name="Articular (S–Ar–Go)" value={Articular_SArGo} units="°" norm={DEFAULT_NORMS.bjork.Articular_SArGo} />
                  <RowZ name="Gonial (Ar–Go–Me)" value={Gonial_ArGoMe} units="°" norm={DEFAULT_NORMS.bjork.Gonial_ArGoMe} />
                  <RowZ name="Suma Björk" value={Sum_Bjork} units="°" norm={DEFAULT_NORMS.bjork.Sum_Bjork} />
                  <RowZ name="Jarabak % (S–Go/N–Me)" value={Jarabak_Ratio} units="%" norm={DEFAULT_NORMS.bjork.Jarabak_Ratio} />
                </>)}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <button onClick={exportCSV} className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm">Exportar CSV</button>
            <button onClick={exportSheetPNG} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm">Exportar lámina (PNG)</button>
            <button onClick={exportSheetPDF} className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-sm">Exportar PDF (A4)</button>
            <button onClick={exportTablePNG} className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm">Tabla (PNG)</button>
            <button onClick={exportTablePDF} className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm">Tabla (PDF)</button>
          </div>
          {downloadHint && (
            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
              <div className="mb-1">Compatibilidad: si una descarga o ventana fue bloqueada, usa este enlace manual:</div>
              <div className="flex items-center gap-2 flex-wrap">
                <a href={downloadHint.url} download={downloadHint.name} target="_blank" rel="noopener" className="underline text-sky-300 break-all">{downloadHint.name}</a>
                {lastCSV && (<button onClick={async()=>{ try{ await navigator.clipboard.writeText(lastCSV); alert("CSV copiado al portapapeles"); }catch{ alert("No se pudo copiar. Abre el enlace y guarda el archivo."); } }} className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700">Copiar CSV</button>)}
                <button onClick={()=>{ if(downloadHint.url.startsWith("blob:")) URL.revokeObjectURL(downloadHint.url); setDownloadHint(null); }} className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700">Ocultar</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Lienzo */}
      <div className="lg:col-span-8">
        <section className="rounded-2xl border border-slate-800 p-2 bg-slate-900/50">
          <div className="relative w-full overflow-auto rounded-xl" ref={containerRef}>
            {imgSrc ? (
              <div className="relative inline-block" onClick={onCanvasClick}>
                <img ref={imgRef} src={imgSrc} alt="Radiografía" className="block max-w-full h-auto select-none" />
                <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                  {has("S") && has("N") && (<line x1={points.S!.x} y1={points.S!.y} x2={points.N!.x} y2={points.N!.y} stroke="#38bdf8" strokeWidth={2} />)}
                  {has("N") && has("A") && (<line x1={points.N!.x} y1={points.N!.y} x2={points.A!.x} y2={points.A!.y} stroke="#22c55e" strokeWidth={2} />)}
                  {has("N") && has("B") && (<line x1={points.N!.x} y1={points.N!.y} x2={points.B!.x} y2={points.B!.y} stroke="#f97316" strokeWidth={2} />)}
                  {has("Po") && has("Or") && (<line x1={points.Po!.x} y1={points.Po!.y} x2={points.Or!.x} y2={points.Or!.y} stroke="#a78bfa" strokeDasharray="6 4" strokeWidth={2} />)}
                  {has("Go") && has("Me") && (<line x1={points.Go!.x} y1={points.Go!.y} x2={points.Me!.x} y2={points.Me!.y} stroke="#f472b6" strokeDasharray="6 4" strokeWidth={2} />)}
                  {has("Go") && has("Gn") && (<line x1={points.Go!.x} y1={points.Go!.y} x2={points.Gn!.x} y2={points.Gn!.y} stroke="#94a3b8" strokeWidth={2} />)}
                  {has("U1T") && has("U1A") && (<line x1={points.U1T!.x} y1={points.U1T!.y} x2={points.U1A!.x} y2={points.U1A!.y} stroke="#eab308" strokeWidth={2} />)}
                  {has("L1T") && has("L1A") && (<line x1={points.L1T!.x} y1={points.L1T!.y} x2={points.L1A!.x} y2={points.L1A!.y} stroke="#22d3ee" strokeWidth={2} />)}
                  {LANDMARKS.map(({ key, label }) => { const p = points[key]; if (!p) return null; const isActive = activeKey === key; return (
                    <g key={key} className="cursor-move pointer-events-auto" onMouseDown={(e)=>onPointMouseDown(key, e)}>
                      <circle cx={p.x} cy={p.y} r={6} fill={isActive?"#38bdf8":"#94a3b8"} stroke="#0f172a" strokeWidth={2} />
                      <text x={p.x + 8} y={p.y - 8} fontSize={12} fill="#e2e8f0" stroke="#0f172a" strokeWidth={0.5}>{label.split(" ")[0]}</text>
                    </g>
                  ); })}
                  {calibMode && calibClicks.length>0 && (<g>
                    <circle cx={calibClicks[0].x} cy={calibClicks[0].y} r={5} fill="#22c55e" />
                    {calibClicks[1] && (<>
                      <circle cx={calibClicks[1].x} cy={calibClicks[1].y} r={5} fill="#22c55e" />
                      <line x1={calibClicks[0].x} y1={calibClicks[0].y} x2={calibClicks[1].x} y2={calibClicks[1].y} stroke="#22c55e" strokeWidth={2} />
                    </>)}
                  </g>)}
                  {showOverlay && has("S") && has("N") && has("A") && (<g>
                    <path d={arcPath(points.N!, points.S!, points.A!)} stroke="#22c55e" strokeWidth={2} fill="none" strokeDasharray="4 3" />
                    <AngleLabel p={{ x: points.N!.x + 40, y: points.N!.y - 10 }} text={`SNA ${toFixedOrDash(SNA)}`} />
                  </g>)}
                  {showOverlay && has("S") && has("N") && has("B") && (<g>
                    <path d={arcPath(points.N!, points.S!, points.B!)} stroke="#f97316" strokeWidth={2} fill="none" strokeDasharray="4 3" />
                    <AngleLabel p={{ x: points.N!.x + 40, y: points.N!.y + 12 }} text={`SNB ${toFixedOrDash(SNB)}`} />
                  </g>)}
                  {showOverlay && has("N") && has("A") && has("B") && (<g>
                    <path d={arcPath(points.N!, points.A!, points.B!)} stroke="#38bdf8" strokeWidth={2} fill="none" strokeDasharray="4 3" />
                    <AngleLabel p={{ x: points.N!.x - 60, y: points.N!.y - 12 }} text={`ANB ${toFixedOrDash(ANB)}`} />
                  </g>)}
                  {showOverlay && has("N") && has("S") && has("Ar") && (<g>
                    <path d={arcPath(points.S!, points.N!, points.Ar!)} stroke="#16a34a" strokeWidth={2} fill="none" strokeDasharray="4 3" />
                    <AngleLabel p={{ x: points.S!.x + 40, y: points.S!.y - 10 }} text={`Saddle ${toFixedOrDash(Saddle_NSAr)}`} />
                  </g>)}
                  {showOverlay && has("S") && has("Ar") && has("Go") && (<g>
                    <path d={arcPath(points.Ar!, points.S!, points.Go!)} stroke="#d946ef" strokeWidth={2} fill="none" strokeDasharray="4 3" />
                    <AngleLabel p={{ x: points.Ar!.x + 40, y: points.Ar!.y - 10 }} text={`Articular ${toFixedOrDash(Articular_SArGo)}`} />
                  </g>)}
                  {showOverlay && has("Ar") && has("Go") && has("Me") && (<g>
                    <path d={arcPath(points.Go!, points.Ar!, points.Me!)} stroke="#fb7185" strokeWidth={2} fill="none" strokeDasharray="4 3" />
                    <AngleLabel p={{ x: points.Go!.x + 40, y: points.Go!.y - 10 }} text={`Gonial ${toFixedOrDash(Gonial_ArGoMe)}`} />
                  </g>)}
                </svg>
              </div>
            ) : (<div className="aspect-video w-full grid place-items-center text-slate-400"><p>Sube una radiografía para comenzar.</p></div>)}
          </div>
        </section>
      </div>
    </div>
  );
}

function RowZ({ name, value, units, norm }: { name: string; value: number; units: string; norm: { mean: number; sd: number } }) {
  const ok = !Number.isNaN(value); const zz = ok ? zScore(value, norm.mean, norm.sd) : NaN;
  const color = Number.isNaN(zz) ? "text-slate-500" : Math.abs(zz) < 1 ? "text-emerald-400" : Math.abs(zz) < 2 ? "text-amber-400" : "text-rose-400";
  return (
    <tr className="border-t border-slate-800">
      <td className="py-1 pr-4 text-slate-300">{name}</td>
      <td className={`py-1 pr-4 text-right ${ok?"text-slate-100":"text-slate-500"}`}>{toFixedOrDash(value)}</td>
      <td className="py-1">{units}</td>
      <td className={`py-1 ${color}`}>{Number.isNaN(zz) ? "—" : `${zz >= 0 ? "+" : ""}${zz.toFixed(2)}`}</td>
    </tr>
  );
}
function AngleLabel({ p, text }: { p: Pt; text: string }) { return (<text x={p.x} y={p.y} fontSize={12} fill="#e2e8f0" stroke="#0f172a" strokeWidth={0.5}>{text}</text>); }
