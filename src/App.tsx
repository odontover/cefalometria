import React, { useMemo, useRef, useState, useEffect } from "react";
import { jsPDF } from "jspdf"; // ← NUEVA importación para PDF real

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
function zScore(v: number, mean: number, sd: number): number {
  if (isNaN(v) || isNaN(mean) || isNaN(sd) || sd <= 0) return NaN;
  return (v - mean) / sd;
}
function arcPath(v: Pt, p1: Pt, p2: Pt, r = 35) {
  const a1 = Math.atan2(p1.y - v.y, p1.x - v.x), a2 = Math.atan2(p2.y - v.y, p2.x - v.x); let da = a2 - a1;
  while (da <= -Math.PI) da += 2 * Math.PI; while (da > Math.PI) da -= 2 * Math.PI; const s = { x: v.x + r * Math.cos(a1), y: v.y + r * Math.sin(a1) }, e = { x: v.x + r * Math.cos(a2), y: v.y + r * Math.sin(a2) };
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${Math.abs(da) > Math.PI ? 1 : 0} ${da > 0 ? 1 : 0} ${e.x} ${e.y}`;
}
function todayISO() { const d = new Date(); const m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0"); return `${d.getFullYear()}-${m}-${day}`; }

// === Tolerancias clínicas ===
function toleranceForUnits(units: string): number | null {
  if (units.includes("°")) return 2;
  if (units.includes("mm")) return 1;
  if (units.includes("%")) return 2;
  return null;
}
function interpWithTolerance(val: number, mean: number, units: string, enabled = true) {
  if (!enabled || Number.isNaN(val)) return "—";
  const tol = toleranceForUnits(units); if (tol == null) return "—";
  const d = val - mean; if (Math.abs(d) <= tol) return "normal"; return d > 0 ? "mayor" : "menor";
}

// Types
type Pt = { x: number; y: number };
type LandmarkKey =
  "S"|"N"|"A"|"B"|"Po"|"Or"|"Go"|"Me"|"Pg"|"Gn"|"Ar"|"U1T"|"U1A"|"L1T"|"L1A"|"Prn"|"PgS"|"Li"|"Ba"|"Pt"|"Co"|"Oc1"|"Oc2";

const LANDMARKS = [
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
  { key: "Prn", label: "Prn – Pronasale", desc: "Punto más anterior del dorso nasal" },
  { key: "PgS", label: "Pg' – Pogonion blando", desc: "Pogonion de tejidos blandos" },
  { key: "Li", label: "Li – Labrale inferius", desc: "Punto más anterior del labio inferior" },
  { key: "Ba", label: "Ba – Basion", desc: "Punto más inferior del foramen magno" },
  { key: "Pt", label: "Pt – Pterigoideo", desc: "Punto más posterior del contorno pterigoideo" },
  { key: "Co", label: "Co – Condylion", desc: "Punto más posterosuperior del cóndilo mandibular" },
  { key: "Oc1", label: "Oc1 – Oclusal anterior", desc: "Punto anterior sobre el plano oclusal (contacto incisivo)" },
  { key: "Oc2", label: "Oc2 – Oclusal posterior", desc: "Punto posterior sobre el plano oclusal (contacto molar)" },
] as const;

const DEFAULT_NORMS = {
  steiner: { SNA:{mean:82,sd:3}, SNB:{mean:80,sd:3}, ANB:{mean:2,sd:2}, SN_GoGn:{mean:32,sd:5}, U1_NA_deg:{mean:22,sd:6}, U1_NA_mm:{mean:4,sd:2}, L1_NB_deg:{mean:25,sd:6}, L1_NB_mm:{mean:4,sd:2}, Interincisal:{mean:131,sd:6}, Pg_NB_mm:{mean:0,sd:2} },
  bjork:   { Saddle_NSAr:{mean:123,sd:5}, Articular_SArGo:{mean:143,sd:6}, Gonial_ArGoMe:{mean:130,sd:7}, Sum_Bjork:{mean:396,sd:6}, Jarabak_Ratio:{mean:65,sd:3} },
  soft:    { ELine_Li_mm:{mean:-2,sd:2} },
  extended: {
    IMPA: { mean: 90, sd: 5 },
    Wits: { mean: 0, sd: 1 },           // Aproximación centrada (ver nota Wits abajo)
    Ocl_SN: { mean: 14, sd: 4 },
    Facial_Angle: { mean: 87, sd: 3 },  // Downs/Ricketts
    U1_SN: { mean: 104, sd: 5 }
  }
};

export default function App() {
  // SEO meta y JSON-LD (una sola vez)
  useEffect(() => {
    const title = "Cefalometría | Trazos cefalométricos con calibración — Dr. Fernando Juárez (Ortodoncia en Veracruz)";
    const desc = "Herramienta gratuita para trazos cefalométricos (Steiner, Björk–Jarabak, E-line), calibración con regla y exportación PNG/PDF/CSV. Autor: Fernando Juárez, Especialista en Ortodoncia en Veracruz.";

    document.title = title;
    const upsert = (attr: "name"|"property", key: string, content: string) => {
      let m = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!m) { m = document.createElement("meta"); m.setAttribute(attr, key); document.head.appendChild(m); }
      m.setAttribute("content", content);
    };

    // Meta básicas
    upsert("name", "description", desc);
    upsert("name", "author", "Fernando Juárez");
    upsert("name", "robots", "index,follow");

    // Open Graph / Twitter
    upsert("property", "og:title", title);
    upsert("property", "og:description", desc);
    upsert("property", "og:type", "website");
    upsert("property", "og:url", window.location.href);
    upsert("name", "twitter:card", "summary_large_image");
    upsert("name", "twitter:title", title);
    upsert("name", "twitter:description", desc);

    // JSON-LD (Person + WebApplication)
    const ldId = "ld-json-cefalo";
    let script = document.getElementById(ldId) as HTMLScriptElement | null;
    if (!script) { script = document.createElement("script"); script.type = "application/ld+json"; script.id = ldId; document.head.appendChild(script); }
    const ld = [
      {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": "Fernando Juárez",
        "jobTitle": "Especialista en Ortodoncia",
        "url": "https://www.odontover.com/dentista-veracruz/dr-fernando-juárez-ortodoncia",
        "sameAs": ["https://www.instagram.com/dr.juarez"]
      },
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "Cefalometría",
        "applicationCategory": "MedicalApplication",
        "operatingSystem": "Any",
        "url": window.location.href,
        "author": {"@type":"Person","name":"Fernando Juárez"}
      }
    ];
    script.text = JSON.stringify(ld);
  }, []);

  // Ko-fi floating overlay (donation button)
  useEffect(() => {
    const id = 'ko-fi-overlay-script';
    const draw = () => {
      try {
        (window as any).kofiWidgetOverlay?.draw?.('drjuarez', {
          'type': 'floating-chat',
          'floating-chat.donateButton.text': 'Donate',
          'floating-chat.donateButton.background-color': '#00b9fe',
          'floating-chat.donateButton.text-color': '#fff'
        });
      } catch {}
    };
    if (!document.getElementById(id)) {
      const s = document.createElement('script');
      s.src = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js';
      s.async = true;
      s.id = id;
      s.onload = draw;
      document.head.appendChild(s);
    } else {
      draw();
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Cefalometría</h1>
        <p className="text-slate-300 mt-0.5 mb-4 text-sm">
          <a href="https://www.instagram.com/dr.juarez" target="_blank" rel="noopener" className="underline/50 hover:underline">by @dr.juarez</a>
        </p>
        <CephTracer />
        <footer className="mt-8 text-xs text-slate-400">
          Realizado por Fernando Juárez{" "}
          <a href="https://www.instagram.com/dr.juarez" target="_blank" rel="noopener" className="underline">@dr.juarez</a>{" "}
          - Especialista en Ortodoncia, Ortodoncista en Veracruz ( {" "}
          <a href="https://www.odontover.com/dentista-veracruz/dr-fernando-juárez-ortodoncia" target="_blank" rel="noopener" className="underline">odontover.com</a>
          )
        </footer>
      </div>
    </div>
  );
}

function CephTracer() {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [calibClicks, setCalibClicks] = useState<Pt[]>([]);
  const [mmKnown, setMmKnown] = useState<number>(20);
  const [mmPerPx, setMmPerPx] = useState<number | null>(null); // mm por px (en tamaño renderizado)
  const [calibMode, setCalibMode] = useState<boolean>(false);
  const [points, setPoints] = useState<Partial<Record<LandmarkKey, Pt>>>({});
  const [activeKey, setActiveKey] = useState<LandmarkKey | null>("S");
  const [placingMode, setPlacingMode] = useState<boolean>(true);
  const [showOverlay, setShowOverlay] = useState<boolean>(true);
  const [useSteiner, setUseSteiner] = useState<boolean>(true);
  const [useBjork, setUseBjork] = useState<boolean>(true);
  const [useExtended, setUseExtended] = useState<boolean>(true);
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
  const [fixedScale, setFixedScale] = useState<{ sx: number; sy: number } | null>(null);

  useEffect(() => {
    if (!imgSrc) return; const i = new Image(); i.onload = () => setImgSize({ w: i.naturalWidth, h: i.naturalHeight }); i.src = imgSrc;
  }, [imgSrc]);
  // Fijar escala real solo una vez, al cargar la imagen
useEffect(() => {
  if (imgRef.current && imgSrc) {
    const i = imgRef.current;
    const rect = i.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setFixedScale({
        sx: i.naturalWidth / rect.width,
        sy: i.naturalHeight / rect.height,
      });
    }
  }
}, [imgSrc]);
  useEffect(() => () => { window.removeEventListener("mousemove", onMove as any); window.removeEventListener("mouseup", onUp as any); if (rafId.current) cancelAnimationFrame(rafId.current); if (downloadHint?.url?.startsWith("blob:")) URL.revokeObjectURL(downloadHint.url); }, [downloadHint]);

  // "Tests" mínimos en runtime (no cambian comportamiento)
  useEffect(() => { try {
    console.assert(Math.abs(distance({x:0,y:0},{x:3,y:4})-5)<1e-6, "dist 3-4-5");
    const right90 = angleBetween({x:0,y:0},{x:1,y:0},{x:1,y:1}); console.assert(Math.abs(right90-90)<1e-6, "ang 90");
    const lineAng = angleBetweenLines({x:0,y:0},{x:1,y:0},{x:0,y:0},{x:0,y:1}); console.assert(Math.abs(lineAng-90)<1e-6, "angL 90");
    const dSigned = pointLineDistanceSigned({x:0,y:1},{x:0,y:0},{x:2,y:0}); console.assert(Math.abs(dSigned + 1) < 1e-6, "pldist sign");
    const ap = arcPath({x:0,y:0},{x:1,y:0},{x:0,y:1}); console.assert(ap.startsWith("M "), "arcPath svg");
    // tolerancia: 1 mm normal, 2 mm -> "mayor"
    console.assert(interpWithTolerance(5, 4, "mm") === "normal", "tol mm normal");
    console.assert(interpWithTolerance(6.1, 4, "mm") === "mayor", "tol mm mayor");
  } catch {} }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setImgSrc(String(r.result)); r.readAsDataURL(f); }
  function resetAll() { setPoints({}); setCalibClicks([]); setMmPerPx(null); }

  function nextUnsetKey(current: LandmarkKey | null, tempPts: Partial<Record<LandmarkKey, Pt>>) {
  if (!current) return null;

  // Buscar el siguiente punto no marcado
  const idx = LANDMARKS.findIndex(l => l.key === current);
  for (let k = 1; k <= LANDMARKS.length; k++) {
    const j = (idx + k) % LANDMARKS.length;
    const key = LANDMARKS[j].key;
    if (!tempPts[key]) return key; // aún queda por marcar
  }

  // Si llegamos aquí, todos los puntos están marcados
  return null;
}

  function onCanvasClick(e: React.MouseEvent) {
    if (!imgRef.current) return; const rect = (e.target as HTMLElement).getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top; const pt = {x,y};
    if (calibMode) { const next = [...calibClicks, pt].slice(-2); setCalibClicks(next); if (next.length===2) { const px = distance(next[0], next[1]); if (mmKnown>0 && px>0){ setMmPerPx(mmKnown/px); setCalibMode(false);} } return; }
    if (placingMode && activeKey) {
      const temp = { ...points, [activeKey]: pt } as Partial<Record<LandmarkKey, Pt>>;
      setPoints(temp);
      const nxt = nextUnsetKey(activeKey, temp);
      setActiveKey(nxt);
    }
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
  const mm = (px: number) => (mmPerPx ? px * mmPerPx : NaN);

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
  // Ricketts – línea estética (E-line)  (signo: + delante / - detrás)
  const ELine_Li_mm = useMemo(() => (has("Li")&&has("Prn")&&has("PgS"))? mm(pointLineDistanceSigned(points.Li!, points.Prn!, points.PgS!)) : NaN, [points, mmPerPx]);
// === Odontover Extended ===
const IMPA = useMemo(() =>
  (has("L1T") && has("L1A") && has("Go") && has("Gn"))
    ? angleBetweenLines(points.L1T!, points.L1A!, points.Go!, points.Gn!)
    : NaN,
  [points]
);

// === Wits appraisal — distancia entre proyecciones AO y BO sobre el plano oclusal ===
const Wits = useMemo(() => {
  if (!(has("A") && has("B") && has("Oc1") && has("Oc2"))) return NaN;

  // Proyección perpendicular de un punto (p) sobre una línea (a-b)
  const projectPointOntoLine = (p: Pt, a: Pt, b: Pt): Pt => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return a;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    return { x: a.x + t * dx, y: a.y + t * dy };
  };

  // 1️⃣ Proyectar A y B sobre el plano oclusal
  const AO = projectPointOntoLine(points.A!, points.Oc1!, points.Oc2!);
  const BO = projectPointOntoLine(points.B!, points.Oc1!, points.Oc2!);

  // 2️⃣ Calcular el vector del plano oclusal (de Oc1 → Oc2)
  const vx = points.Oc2!.x - points.Oc1!.x;
  const vy = points.Oc2!.y - points.Oc1!.y;
  const vlen = Math.hypot(vx, vy);
  if (vlen === 0) return NaN;

  // 3️⃣ Vector AO→BO proyectado sobre el plano oclusal
  const proj = ((BO.x - AO.x) * vx + (BO.y - AO.y) * vy) / vlen;

  // 4️⃣ Determinar el signo:
  // Si BO está más "a la derecha" (en dirección de Oc2), Wits es positivo
  // Si está a la izquierda (en dirección contraria), es negativo
  const sign = proj >= 0 ? 1 : -1;

  // 5️⃣ Convertir distancia en milímetros (usa mmPerPx si lo tienes)
  const distPx = Math.abs(proj);
  const distMm = mmPerPx ? distPx * mmPerPx : distPx;

  return sign * distMm;
}, [points, mmPerPx]);

const Ocl_SN = useMemo(() => {
  const hasOcclusal = has("Oc1") && has("Oc2");
  const P1 = hasOcclusal ? points.Oc1! : has("Po") ? points.Po! : null;
  const P2 = hasOcclusal ? points.Oc2! : has("Or") ? points.Or! : null;
  if (!(P1 && P2 && has("S") && has("N"))) return NaN;
  return angleBetweenLines(P1, P2, points.S!, points.N!);
}, [points]);

// === Eje facial (Downs / Ricketts) — ángulo inferior (suplementario) ===
const Facial_Angle = useMemo(() =>
  (has("Ba") && has("N") && has("Pt") && has("Gn"))
    ? 180 - angleBetweenLines(points.Ba!, points.N!, points.Pt!, points.Gn!)
    : NaN,
  [points]
);

const U1_SN = useMemo(() =>
  (has("U1T") && has("U1A") && has("S") && has("N"))
    ? angleBetweenLines(points.U1T!, points.U1A!, points.S!, points.N!)
    : NaN,
  [points]
);
  const scaleLabel = mmPerPx ? `Escala (vista): ${(1 / mmPerPx).toFixed(2)} px/mm · ${mmPerPx.toFixed(4)} mm/px` : "Sin calibrar";

  function setManualLink(url: string, name: string) { if (downloadHint?.url?.startsWith("blob:")) URL.revokeObjectURL(downloadHint.url); setDownloadHint({ url, name }); }
  function exportJSON(){ const blob = new Blob([JSON.stringify({ points, mmPerPx }, null, 2)], { type: "application/json" }); triggerDownload(blob, "cefalo_trazado.json"); }
  function importJSON(e: React.ChangeEvent<HTMLInputElement>){ const f = e.target.files?.[0]; if(!f) return; const r = new FileReader(); r.onload = () => { try { const data = JSON.parse(String(r.result)); if (data.points) setPoints(data.points); if (typeof data.mmPerPx === "number") setMmPerPx(data.mmPerPx); } catch { alert("JSON inválido"); } }; r.readAsText(f); }

  function exportCSV() {
  const rows: string[][] = [
    ["Medida", "Valor", "Norma", mmPerPx ? "Unidades" : "Unidades (px)", "z-score", "Interpretación"]
  ];
  const interp = (val: number, mean: number, units: string, enabled = true) =>
    interpWithTolerance(val, mean, units, enabled);

  // === STEINER ===
  if (useSteiner)
    rows.push(
      ["— Steiner —", "", "", "", "", ""],
      ["SNA", toFixedOrDash(SNA), toFixedOrDash(DEFAULT_NORMS.steiner.SNA.mean), "°",
        toFixedOrDash(zScore(SNA, DEFAULT_NORMS.steiner.SNA.mean, DEFAULT_NORMS.steiner.SNA.sd)),
        interp(SNA, DEFAULT_NORMS.steiner.SNA.mean, "°")],
      ["SNB", toFixedOrDash(SNB), toFixedOrDash(DEFAULT_NORMS.steiner.SNB.mean), "°",
        toFixedOrDash(zScore(SNB, DEFAULT_NORMS.steiner.SNB.mean, DEFAULT_NORMS.steiner.SNB.sd)),
        interp(SNB, DEFAULT_NORMS.steiner.SNB.mean, "°")],
      ["ANB", toFixedOrDash(ANB), toFixedOrDash(DEFAULT_NORMS.steiner.ANB.mean), "°",
        toFixedOrDash(zScore(ANB, DEFAULT_NORMS.steiner.ANB.mean, DEFAULT_NORMS.steiner.ANB.sd)),
        interp(ANB, DEFAULT_NORMS.steiner.ANB.mean, "°")],
      ["SN–GoGn", toFixedOrDash(SN_GoGn), toFixedOrDash(DEFAULT_NORMS.steiner.SN_GoGn.mean), "°",
        toFixedOrDash(zScore(SN_GoGn, DEFAULT_NORMS.steiner.SN_GoGn.mean, DEFAULT_NORMS.steiner.SN_GoGn.sd)),
        interp(SN_GoGn, DEFAULT_NORMS.steiner.SN_GoGn.mean, "°")],
      ["U1–NA (°)", toFixedOrDash(U1_NA_deg), toFixedOrDash(DEFAULT_NORMS.steiner.U1_NA_deg.mean), "°",
        toFixedOrDash(zScore(U1_NA_deg, DEFAULT_NORMS.steiner.U1_NA_deg.mean, DEFAULT_NORMS.steiner.U1_NA_deg.sd)),
        interp(U1_NA_deg, DEFAULT_NORMS.steiner.U1_NA_deg.mean, "°")],
      ["U1–NA (mm)", toFixedOrDash(U1_NA_mm), toFixedOrDash(DEFAULT_NORMS.steiner.U1_NA_mm.mean),
        mmPerPx ? "mm" : "px",
        mmPerPx
          ? toFixedOrDash(zScore(U1_NA_mm, DEFAULT_NORMS.steiner.U1_NA_mm.mean, DEFAULT_NORMS.steiner.U1_NA_mm.sd))
          : "—",
        mmPerPx
          ? interp(U1_NA_mm, DEFAULT_NORMS.steiner.U1_NA_mm.mean, "mm", true)
          : "—"],
      ["L1–NB (°)", toFixedOrDash(L1_NB_deg), toFixedOrDash(DEFAULT_NORMS.steiner.L1_NB_deg.mean), "°",
        toFixedOrDash(zScore(L1_NB_deg, DEFAULT_NORMS.steiner.L1_NB_deg.mean, DEFAULT_NORMS.steiner.L1_NB_deg.sd)),
        interp(L1_NB_deg, DEFAULT_NORMS.steiner.L1_NB_deg.mean, "°")],
      ["L1–NB (mm)", toFixedOrDash(L1_NB_mm), toFixedOrDash(DEFAULT_NORMS.steiner.L1_NB_mm.mean),
        mmPerPx ? "mm" : "px",
        mmPerPx
          ? toFixedOrDash(zScore(L1_NB_mm, DEFAULT_NORMS.steiner.L1_NB_mm.mean, DEFAULT_NORMS.steiner.L1_NB_mm.sd))
          : "—",
        mmPerPx
          ? interp(L1_NB_mm, DEFAULT_NORMS.steiner.L1_NB_mm.mean, "mm", true)
          : "—"],
      ["Interincisal", toFixedOrDash(Interincisal), toFixedOrDash(DEFAULT_NORMS.steiner.Interincisal.mean), "°",
        toFixedOrDash(zScore(Interincisal, DEFAULT_NORMS.steiner.Interincisal.mean, DEFAULT_NORMS.steiner.Interincisal.sd)),
        interp(Interincisal, DEFAULT_NORMS.steiner.Interincisal.mean, "°")],
      ["Pg–NB (±)", toFixedOrDash(Pg_NB_mm), toFixedOrDash(DEFAULT_NORMS.steiner.Pg_NB_mm.mean),
        mmPerPx ? "mm" : "px",
        mmPerPx
          ? toFixedOrDash(zScore(Pg_NB_mm, DEFAULT_NORMS.steiner.Pg_NB_mm.mean, DEFAULT_NORMS.steiner.Pg_NB_mm.sd))
          : "—",
        mmPerPx
          ? interp(Pg_NB_mm, DEFAULT_NORMS.steiner.Pg_NB_mm.mean, "mm", true)
          : "—"]
    );

  // === BJÖRK–JARABAK ===
  if (useBjork)
    rows.push(
      ["— Björk–Jarabak —", "", "", "", "", ""],
      ["Silla (N–S–Ar)", toFixedOrDash(Saddle_NSAr), toFixedOrDash(DEFAULT_NORMS.bjork.Saddle_NSAr.mean), "°",
        toFixedOrDash(zScore(Saddle_NSAr, DEFAULT_NORMS.bjork.Saddle_NSAr.mean, DEFAULT_NORMS.bjork.Saddle_NSAr.sd)),
        interp(Saddle_NSAr, DEFAULT_NORMS.bjork.Saddle_NSAr.mean, "°")],
      ["Articular (S–Ar–Go)", toFixedOrDash(Articular_SArGo), toFixedOrDash(DEFAULT_NORMS.bjork.Articular_SArGo.mean), "°",
        toFixedOrDash(zScore(Articular_SArGo, DEFAULT_NORMS.bjork.Articular_SArGo.mean, DEFAULT_NORMS.bjork.Articular_SArGo.sd)),
        interp(Articular_SArGo, DEFAULT_NORMS.bjork.Articular_SArGo.mean, "°")],
      ["Gonial (Ar–Go–Me)", toFixedOrDash(Gonial_ArGoMe), toFixedOrDash(DEFAULT_NORMS.bjork.Gonial_ArGoMe.mean), "°",
        toFixedOrDash(zScore(Gonial_ArGoMe, DEFAULT_NORMS.bjork.Gonial_ArGoMe.mean, DEFAULT_NORMS.bjork.Gonial_ArGoMe.sd)),
        interp(Gonial_ArGoMe, DEFAULT_NORMS.bjork.Gonial_ArGoMe.mean, "°")],
      ["Suma Björk", toFixedOrDash(Sum_Bjork), toFixedOrDash(DEFAULT_NORMS.bjork.Sum_Bjork.mean), "°",
        toFixedOrDash(zScore(Sum_Bjork, DEFAULT_NORMS.bjork.Sum_Bjork.mean, DEFAULT_NORMS.bjork.Sum_Bjork.sd)),
        interp(Sum_Bjork, DEFAULT_NORMS.bjork.Sum_Bjork.mean, "°")],
      ["Jarabak % (S–Go/N–Me)", toFixedOrDash(Jarabak_Ratio), toFixedOrDash(DEFAULT_NORMS.bjork.Jarabak_Ratio.mean), "%",
        toFixedOrDash(zScore(Jarabak_Ratio, DEFAULT_NORMS.bjork.Jarabak_Ratio.mean, DEFAULT_NORMS.bjork.Jarabak_Ratio.sd)),
        interp(Jarabak_Ratio, DEFAULT_NORMS.bjork.Jarabak_Ratio.mean, "%")]
    );

  // === TEJIDOS BLANDOS ===
  rows.push(
    ["— Tejidos blandos —", "", "", "", "", ""],
    ["Labio inf – E-line (±)", toFixedOrDash(ELine_Li_mm), toFixedOrDash(DEFAULT_NORMS.soft.ELine_Li_mm.mean),
      mmPerPx ? "mm" : "px",
      mmPerPx
        ? toFixedOrDash(zScore(ELine_Li_mm, DEFAULT_NORMS.soft.ELine_Li_mm.mean, DEFAULT_NORMS.soft.ELine_Li_mm.sd))
        : "—",
      mmPerPx
        ? interp(ELine_Li_mm, DEFAULT_NORMS.soft.ELine_Li_mm.mean, "mm", true)
        : "—"]
  );

  const csv = rows.map(r => r.join(",")).join("\r\n");
  setLastCSV(csv);
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), "cefalo_resultados.csv");
}
  function triggerDownload(blob: Blob, filename: string){ const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.rel="noopener"; try{ document.body.appendChild(a); a.click(); a.remove(); }catch{} setManualLink(url, filename); }



// === Render export (Odontover Pro v2.3 — versión alineada 1 sola hoja) ===
async function renderSheetCanvas(): Promise<HTMLCanvasElement | null> {
  if (!imgRef.current) {
    alert("Primero sube una radiografía.");
    return null;
  }

  const imgEl = imgRef.current;
  if (!imgEl.complete) {
    try { await (imgEl as any).decode?.(); } catch {}
  }

  const natW = imgEl.naturalWidth;
  const natH = imgEl.naturalHeight;
  const renW = imgEl.width || imgEl.getBoundingClientRect().width;
  const renH = imgEl.height || imgEl.getBoundingClientRect().height;
  if (!natW || !natH || !renW || !renH) {
    alert("La imagen aún no está lista para exportar.");
    return null;
  }

  // === Escalado y dimensiones del canvas ===
  const sx = fixedScale?.sx ?? (natW / renW);
  const sy = fixedScale?.sy ?? (natH / renH);
  const scaleFactor = Math.min(Math.max(natW / 1200, 1.2), 3);
  const pad = 24;

  // Usamos las dimensiones reales sin sidebar
  const W = natW;
  const H = natH;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // === Fondo blanco limpio (sin gris) ===
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // === Radiografía ===
  ctx.drawImage(imgEl, 0, 0, W, H);

  // === Copiar puntos en escala real ===
  const P: Partial<Record<LandmarkKey, Pt>> = {};
  LANDMARKS.forEach(({ key }) => {
    const p = points[key];
    if (p) {
      // Solo multiplicamos por sx/sy para escalar a tamaño natural
      P[key] = { x: p.x * sx, y: p.y * sy };
    }
  });

  // === Funciones de dibujo ===
  const drawLine = (a?: Pt, b?: Pt, color = "#38bdf8", dash = false) => {
    if (!a || !b) return;
    ctx.save();
    if (dash) ctx.setLineDash([5, 4]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  };

  const drawPoint = (p?: Pt) => {
    if (!p) return;
    ctx.save();
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2 * scaleFactor, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

// === Líneas base (Odontover visual v3 — completo) ===
const line = (a?: Pt, b?: Pt, color = "#38bdf8", width = 3, dash = false) => {
  if (!a || !b) return;
  ctx.save();
  if (dash) ctx.setLineDash([6, 4]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
};

// === Líneas estructurales principales (Odontover visual v4 — colorido) ===
line(P.S, P.N, "#00b5ff", 5);           // Base craneal SN – azul cielo brillante
line(P.N, P.A, "#00ff85", 5);           // Maxila – verde neón
line(P.N, P.B, "#ff7300", 5);           // Mandíbula – naranja intenso
line(P.Po, P.Or, "#cc33ff", 5, true);   // Plano Frankfort – violeta neón
line(P.Go, P.Me, "#ff3d9a", 5, true);   // Plano mandibular – fucsia vibrante
line(P.Go, P.Gn, "#00ffe1", 5);         // Rama + sínfisis – turquesa
line(P.Prn, P.PgS, "#0077ff", 5, true); // E-line – azul eléctrico
line(P.Oc1, P.Oc2, "#ffd500", 5, true); // Plano oclusal – amarillo dorado

// === Ejes dentales ===
line(P.U1T, P.U1A, "#ffcc00", 4.5);     // Incisivo superior – amarillo cálido
line(P.L1T, P.L1A, "#00fff7", 4.5);     // Incisivo inferior – cian claro
line(P.N, P.B, "#ff006e", 4);           // Línea NB – rosa fuerte
line(P.N, P.A, "#ffb703", 4, true);     // Línea NA – naranja claro

// === Eje facial ===
line(P.Ba, P.N, "#3b82f6", 5, true);    // Base posterior (Ba–N) – azul medio
line(P.Pt, P.Gn, "#22d3ee", 5);         // Línea Pt–Gn – cian brillante

// === Arcos angulares (Björk–Jarabak visuales) ===
const drawArc = (v: Pt, p1: Pt, p2: Pt, color: string, width = 5) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  const path = new Path2D(arcPath(v, p1, p2, 40));
  ctx.stroke(path);
  ctx.restore();
};

// === Arcos cefalométricos ===
if (P.N && P.S && P.Ar) drawArc(P.S, P.N, P.Ar, "#00ff99", 5);   // Silla – verde lima
if (P.S && P.Ar && P.Go) drawArc(P.Ar, P.S, P.Go, "#ff4bfb", 5); // Articular – magenta fluorescente
if (P.Ar && P.Go && P.Me) drawArc(P.Go, P.Ar, P.Me, "#ff1744", 5); // Gonial – rojo vivo

// === Puntos ===
Object.values(P).forEach((p) => {
  if (!p) return;
  ctx.save();
  ctx.fillStyle = "#ef4444"; // rojo intenso
  ctx.beginPath();
  ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
});
// === Función para colocar etiquetas de ángulos dinámicamente ===
function labelAngle(v: Pt, p1: Pt, p2: Pt, text: string, color = "#1e293b") {
  const a1 = Math.atan2(p1.y - v.y, p1.x - v.x);
  const a2 = Math.atan2(p2.y - v.y, p2.x - v.x);
  let aMid = (a1 + a2) / 2;

  // Corrige casos donde el ángulo cruza ±π (para evitar ubicaciones invertidas)
  if (Math.abs(a1 - a2) > Math.PI) aMid += Math.PI;

  const dist = 65; // distancia más amplia para evitar traslape
  const x = v.x + dist * Math.cos(aMid);
  const y = v.y + dist * Math.sin(aMid);

  ctx.save();
  ctx.font = `${11 * scaleFactor}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255,255,255,0.6)";
  ctx.shadowBlur = 4;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// === Etiquetas Björk–Jarabak ===
if (P.S && P.N && P.Ar)
  labelAngle(P.S, P.N, P.Ar, `Silla ${toFixedOrDash(Saddle_NSAr)}°`);
if (P.S && P.Ar && P.Go)
  labelAngle(P.Ar, P.S, P.Go, `Articular ${toFixedOrDash(Articular_SArGo)}°`);
if (P.Ar && P.Go && P.Me)
  labelAngle(P.Go, P.Ar, P.Me, `Gonial ${toFixedOrDash(Gonial_ArGoMe)}°`);

// === Líneas extendidas (Odontover Extended v3 — con arcos clínicos elegantes) ===
if (useExtended) {

// === IMPA — eje del incisivo inferior proyectado hasta el plano mandibular (Go–Gn) ===
if (P.L1T && P.L1A && P.Go && P.Gn) {
  // Función auxiliar: intersección entre dos rectas (L1T–L1A y Go–Gn)
  const intersectLines = (A1: Pt, A2: Pt, B1: Pt, B2: Pt): Pt | null => {
    const a1 = A2.y - A1.y;
    const b1 = A1.x - A2.x;
    const c1 = a1 * A1.x + b1 * A1.y;
    const a2 = B2.y - B1.y;
    const b2 = B1.x - B2.x;
    const c2 = a2 * B1.x + b2 * B1.y;
    const det = a1 * b2 - a2 * b1;
    if (Math.abs(det) < 1e-8) return null; // paralelas o casi
    return {
      x: (b2 * c1 - b1 * c2) / det,
      y: (a1 * c2 - a2 * c1) / det,
    };
  };

  // 1️⃣ Calcular intersección entre el eje del incisivo inferior y el plano mandibular
  const inter = intersectLines(P.L1T, P.L1A, P.Go, P.Gn);

  // 2️⃣ Dibujar el eje del incisivo extendido hasta la intersección
  ctx.save();
  ctx.strokeStyle = "#fcd34d"; // amarillo pastel
  ctx.lineWidth = 4.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(P.L1A.x, P.L1A.y);
  if (inter) ctx.lineTo(inter.x, inter.y);
  else ctx.lineTo(P.L1T.x, P.L1T.y); // fallback si no hay intersección
  ctx.stroke();
  ctx.restore();

  // 3️⃣ Dibujar la etiqueta justo en la intersección
  const labelPt = inter || P.Gn;
  ctx.save();
  ctx.font = `${11 * scaleFactor}px system-ui, sans-serif`;
  ctx.fillStyle = "#1e293b";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(255,255,255,0.6)";
  ctx.shadowBlur = 4;
  ctx.fillText(`IMPA ${toFixedOrDash(IMPA)}°`, labelPt.x, labelPt.y - 10);
  ctx.restore();

  // 4️⃣ (Opcional) marcar el punto de intersección
  if (inter) {
    ctx.save();
    ctx.fillStyle = "#facc15"; // amarillo intenso
    ctx.beginPath();
    ctx.arc(inter.x, inter.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// === Wits appraisal — proyecciones perpendiculares desde A y B al plano oclusal ===
if (P.A && P.B && P.Oc1 && P.Oc2) {
  // Función auxiliar: proyección perpendicular de un punto sobre una recta
  const projectPointOntoLine = (p: Pt, a: Pt, b: Pt): Pt => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return a;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    return { x: a.x + t * dx, y: a.y + t * dy };
  };

  // 1️⃣ Obtener las proyecciones perpendiculares de A y B sobre el plano oclusal
  const AO = projectPointOntoLine(P.A, P.Oc1, P.Oc2);
  const BO = projectPointOntoLine(P.B, P.Oc1, P.Oc2);

  // 2️⃣ Dibujar el plano oclusal
  ctx.save();
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 3.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(P.Oc1.x, P.Oc1.y);
  ctx.lineTo(P.Oc2.x, P.Oc2.y);
  ctx.stroke();
  ctx.restore();

  // 3️⃣ Dibujar las proyecciones perpendiculares (líneas A–AO y B–BO)
  ctx.save();
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(P.A.x, P.A.y);
  ctx.lineTo(AO.x, AO.y);
  ctx.moveTo(P.B.x, P.B.y);
  ctx.lineTo(BO.x, BO.y);
  ctx.stroke();
  ctx.restore();

  // 4️⃣ Marcar los puntos proyectados AO y BO
  [AO, BO].forEach((p, i) => {
    ctx.save();
    ctx.fillStyle = i === 0 ? "#f59e0b" : "#fbbf24";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // 5️⃣ Dibujar línea AO–BO sobre el plano oclusal
  ctx.save();
  ctx.strokeStyle = "#eab308";
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(AO.x, AO.y);
  ctx.lineTo(BO.x, BO.y);
  ctx.stroke();
  ctx.restore();

  // 6️⃣ Etiqueta del valor Wits (en el centro)
  const midX = (AO.x + BO.x) / 2;
  const midY = (AO.y + BO.y) / 2;
  ctx.save();
  ctx.font = `${11 * scaleFactor}px system-ui, sans-serif`;
  ctx.fillStyle = "#1e293b";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(255,255,255,0.6)";
  ctx.shadowBlur = 4;
  ctx.fillText(`Wits ${toFixedOrDash(Wits)} mm`, midX, midY - 8);
  ctx.restore();
}

  // === Ocl–SN — ángulo entre el plano oclusal y base craneal ===
  if (P.Oc1 && P.Oc2 && P.S && P.N) {
    const v = P.N;
    const path = new Path2D(arcPath(v, P.Oc1, P.S, 45));
    ctx.save();
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 4;
    ctx.setLineDash([5, 4]);
    ctx.stroke(path);
    ctx.restore();

    labelAngle(v, P.Oc1, P.S, `Ocl–SN ${toFixedOrDash(Ocl_SN)}°`, "#1e293b");
  }

// === Eje facial — Ángulo clínico verdadero: Ba – (intersección) – Gn ===
if (P.Ba && P.N && P.Pt && P.Gn) {
  const intersectLines = (A1: Pt, A2: Pt, B1: Pt, B2: Pt): Pt | null => {
    const a1 = A2.y - A1.y;
    const b1 = A1.x - A2.x;
    const c1 = a1 * A1.x + b1 * A1.y;
    const a2 = B2.y - B1.y;
    const b2 = B1.x - B2.x;
    const c2 = a2 * B1.x + b2 * B1.y;
    const det = a1 * b2 - a2 * b1;
    if (Math.abs(det) < 1e-8) return null;
    return { x: (b2 * c1 - b1 * c2) / det, y: (a1 * c2 - a2 * c1) / det };
  };

  const v = intersectLines(P.Ba, P.N, P.Pt, P.Gn);
  if (v) {
    // Dibujar líneas de referencia
    ctx.save();
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(P.Ba.x, P.Ba.y);
    ctx.lineTo(P.N.x, P.N.y);
    ctx.moveTo(P.Pt.x, P.Pt.y);
    ctx.lineTo(P.Gn.x, P.Gn.y);
    ctx.stroke();
    ctx.restore();

    // Calcular ángulos relativos al vértice
    const a1 = Math.atan2(P.Ba.y - v.y, P.Ba.x - v.x);
    const a2 = Math.atan2(P.Gn.y - v.y, P.Gn.x - v.x);
    let start = a1, end = a2;

    // Ajuste de sentido: queremos el arco que pasa por debajo (menor recorrido)
    let diff = end - start;
    if (diff > Math.PI) { end -= 2 * Math.PI; }
    if (diff < -Math.PI) { end += 2 * Math.PI; }

    // Determinar si el arco está arriba o abajo: queremos el inferior
    const clockwise = (v.y < (P.Ba.y + P.Gn.y) / 2);

    // Dibujar solo el arco entre Ba y Gn
    ctx.save();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 4.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(v.x, v.y, 55, start, end, clockwise);
    ctx.stroke();
    ctx.restore();

    // Vértice
    ctx.save();
    ctx.fillStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.arc(v.x, v.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Etiqueta centrada debajo del vértice
    ctx.save();
    ctx.font = `${11 * scaleFactor}px system-ui, sans-serif`;
    ctx.fillStyle = "#1e293b";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(255,255,255,0.7)";
    ctx.shadowBlur = 4;
    ctx.fillText(`Eje facial ${toFixedOrDash(Facial_Angle)}°`, v.x, v.y + 26);
    ctx.restore();
  }
}

// === U1–SN — eje del incisivo superior proyectado hasta plano S–N ===
if (P.U1T && P.U1A && P.S && P.N) {
  // Función auxiliar: intersección entre dos rectas (U1T–U1A y S–N)
  const intersectLines = (A1: Pt, A2: Pt, B1: Pt, B2: Pt): Pt | null => {
    const a1 = A2.y - A1.y;
    const b1 = A1.x - A2.x;
    const c1 = a1 * A1.x + b1 * A1.y;
    const a2 = B2.y - B1.y;
    const b2 = B1.x - B2.x;
    const c2 = a2 * B1.x + b2 * B1.y;
    const det = a1 * b2 - a2 * b1;
    if (Math.abs(det) < 1e-8) return null; // paralelas o casi
    return {
      x: (b2 * c1 - b1 * c2) / det,
      y: (a1 * c2 - a2 * c1) / det,
    };
  };

  // 1️⃣ Calcular la intersección
  const inter = intersectLines(P.U1T, P.U1A, P.S, P.N);

  // 2️⃣ Dibujar el eje del incisivo extendido hasta la intersección
  ctx.save();
  ctx.strokeStyle = "#fde047"; // amarillo cálido
  ctx.lineWidth = 4;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(P.U1A.x, P.U1A.y);
  if (inter) ctx.lineTo(inter.x, inter.y);
  else ctx.lineTo(P.U1T.x, P.U1T.y); // fallback si no hay intersección
  ctx.stroke();
  ctx.restore();

  // 3️⃣ Dibujar la etiqueta justo en la intersección
  const labelPt = inter || P.N;
  ctx.save();
  ctx.font = `${11 * scaleFactor}px system-ui, sans-serif`;
  ctx.fillStyle = "#1e293b";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(255,255,255,0.6)";
  ctx.shadowBlur = 4;
  ctx.fillText(`U1–SN ${toFixedOrDash(U1_SN)}°`, labelPt.x, labelPt.y - 10);
  ctx.restore();

  // 4️⃣ (Opcional) marcar la intersección con un pequeño punto
  if (inter) {
    ctx.save();
    ctx.fillStyle = "#facc15"; // amarillo intenso
    ctx.beginPath();
    ctx.arc(inter.x, inter.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
}

  return canvas;
}


  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number){
    const words = text.split(/\s+/); const lines: string[] = []; let line = "";
    for (let i=0;i<words.length;i++){ const test = line ? line+" "+words[i] : words[i]; const w = ctx.measureText(test).width; if (w > maxWidth && line){ lines.push(line); line = words[i]; } else { line = test; } }
    if (line) lines.push(line); return lines;
  }

  async function exportSheetPNG(){ const c = await renderSheetCanvas(); if(!c) return; const blob: Blob | null = await new Promise(res=>c.toBlob(res,"image/png")); if(!blob){ const url = c.toDataURL("image/png"); setManualLink(url, "cefalometria.png"); try{ const a=document.createElement("a"); a.href=url; a.download="cefalometria.png"; a.rel="noopener"; a.target="_blank"; document.body.appendChild(a); a.click(); a.remove(); }catch{} return;} triggerDownload(blob, "cefalometria.png"); }
  
// 💾 Versión completa de exportSheetPDF con columna "Norma"
async function exportSheetPDF() {
  const c = await renderSheetCanvas();
  if (!c) return;

  // === Convierte canvas a imagen ===
  const dataUrl = c.toDataURL("image/png");

  // === Crea PDF A4 ===
  const pdf = new jsPDF({
    orientation: c.width > c.height ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const headerH = 18;

  // === Encabezado Odontover ===
  pdf.setFillColor(30, 41, 59);
  pdf.rect(0, 0, pageWidth, headerH, "F");

  try {
    const logoImg = new Image();
    logoImg.src = "/logo-odontover.png";
    await new Promise((r) => {
      logoImg.onload = r;
      logoImg.onerror = r;
    });
    const maxH = headerH * 0.7;
    const aspect = logoImg.width / logoImg.height;
    const logoH = maxH;
    const logoW = logoH * aspect;
    const yLogo = (headerH - logoH) / 2;
    pdf.addImage(logoImg, "PNG", 10, yLogo, logoW, logoH);
  } catch {
    console.warn("⚠️ Logo no cargado");
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(226, 232, 240);
  pdf.text("Cefalometría", 34, 11);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(147, 197, 253);
  pdf.text("by Odontover.com", 34, 16);
  pdf.setTextColor(203, 213, 225);
  pdf.text(`${pFecha || todayISO()}`, pageWidth - 10, 11, { align: "right" });

  // === Radiografía ===
  const imgAspect = c.width / c.height;
  let renderWidth = pageWidth * 0.58;
  let renderHeight = renderWidth / imgAspect;
  const margin = 10;
  const imgX = margin;
  const imgY = headerH + 5;
  pdf.addImage(dataUrl, "PNG", imgX, imgY, renderWidth, renderHeight);

  // === Sidebar (datos + medidas + resumen) ===
  let x0 = imgX + renderWidth + 8;
  let y = headerH + 5;

  const sectionTitle = (t: string) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(0, 0, 0);
    pdf.text(t, x0, y);
    y += 5;
  };

// === Línea con norma basada en z-score (desviación estándar) ===
const lineKVN = (k: string, vRaw: any, nRaw?: any, sdRaw?: any) => {
  const v = parseFloat(vRaw);
  const n = parseFloat(nRaw);
  const sd = parseFloat(sdRaw);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(50);

  // Si no hay datos válidos
  if (isNaN(v) || isNaN(n) || isNaN(sd)) {
    pdf.text(k, x0, y);
    pdf.text(vRaw || "—", x0 + 45, y, { align: "right" });
    if (nRaw) {
      pdf.setTextColor(100, 180, 255);
      pdf.text(nRaw, x0 + 63, y, { align: "right" });
    }
    pdf.setTextColor(50);
    y += 3.2;
    return;
  }

  // Calcular z-score
  const z = zScore(v, n, sd);
  const absZ = Math.abs(z);

  // Asignar color y símbolo
  let color: [number, number, number];
  let sign = "";
  let mark = "";

  if (absZ <= 1) {
    color = [0, 0, 0];       // dentro de 1σ → normal
    mark = "(OK)";
  } else if (z > 0) {
    color = [220, 38, 38];   // > +1σ → aumentado
    sign = "(+)";
  } else {
    color = [37, 99, 235];   // < –1σ → disminuido
    sign = "(–)";
  }

  // Nombre
  pdf.setTextColor(0);
  pdf.text(k, x0, y);

  // Valor coloreado
  pdf.setTextColor(...color);
  pdf.text(`${toFixedOrDash(v)} ${sign || mark}`, x0 + 45, y, { align: "right" });

  // Norma (azul claro)
  pdf.setTextColor(60);
  pdf.text(toFixedOrDash(n), x0 + 63, y, { align: "right" });

  // (Opcional) z-score numérico
  pdf.setTextColor(100);
  pdf.text(`${z >= 0 ? "+" : ""}${z.toFixed(2)}`, x0 + 75, y, { align: "right" });

  // Restaurar color y avanzar
  pdf.setTextColor(50);
  y += 3.2;
};

// === Línea divisoria reutilizable (estilo encabezado) ===
const divider = (space = 4, width = 78, color = 160) => {
  pdf.setDrawColor(color);       // tono gris medio
  pdf.setLineWidth(0.3);         // línea delgada y elegante
  pdf.line(x0, y, x0 + width, y);
  y += space;                    // agrega espacio después de la línea
};

  // Datos del paciente
  sectionTitle("DATOS DEL PACIENTE");
  lineKVN("Nombre", pNombre || "—");
  lineKVN("Edad", pEdad ? `${pEdad} años` : "—");
  lineKVN("Sexo", pSexo || "—");
  lineKVN("Doctor", pDoctor || "—");
  divider(4);

// === Encabezado de columnas ===
pdf.setFont("helvetica", "bold");
pdf.setFontSize(8);
pdf.setTextColor(80);

const headerY = y; // posición actual del cursor vertical
pdf.text("Medida", x0, headerY);
pdf.text("Valor", x0 + 45, headerY, { align: "right" });
pdf.text("Norma", x0 + 63, headerY, { align: "right" });
pdf.text("SD", x0 + 75, headerY, { align: "right" });

// línea divisoria debajo del encabezado
pdf.setDrawColor(160);
pdf.line(x0, headerY + 1.5, x0 + 78, headerY + 1.5);

// avanzar un poco hacia abajo para las filas
y += 5;

  // === Steiner ===
sectionTitle("Steiner");
lineKVN("SNA (°)", toFixedOrDash(SNA),
  toFixedOrDash(DEFAULT_NORMS.steiner.SNA.mean),
  DEFAULT_NORMS.steiner.SNA.sd);
lineKVN("SNB (°)", toFixedOrDash(SNB),
  toFixedOrDash(DEFAULT_NORMS.steiner.SNB.mean),
  DEFAULT_NORMS.steiner.SNB.sd);
lineKVN("ANB (°)", toFixedOrDash(ANB),
  toFixedOrDash(DEFAULT_NORMS.steiner.ANB.mean),
  DEFAULT_NORMS.steiner.ANB.sd);
lineKVN("SN–GoGn (°)", toFixedOrDash(SN_GoGn),
  toFixedOrDash(DEFAULT_NORMS.steiner.SN_GoGn.mean),
  DEFAULT_NORMS.steiner.SN_GoGn.sd);
lineKVN("U1–NA (mm)", toFixedOrDash(U1_NA_mm),
  toFixedOrDash(DEFAULT_NORMS.steiner.U1_NA_mm.mean),
  DEFAULT_NORMS.steiner.U1_NA_mm.sd);
lineKVN("L1–NB (mm)", toFixedOrDash(L1_NB_mm),
  toFixedOrDash(DEFAULT_NORMS.steiner.L1_NB_mm.mean),
  DEFAULT_NORMS.steiner.L1_NB_mm.sd);
divider(4);

// === Björk–Jarabak ===
sectionTitle("Björk–Jarabak");
lineKVN("Silla (°)", toFixedOrDash(Saddle_NSAr),
  toFixedOrDash(DEFAULT_NORMS.bjork.Saddle_NSAr.mean),
  DEFAULT_NORMS.bjork.Saddle_NSAr.sd);
lineKVN("Articular (°)", toFixedOrDash(Articular_SArGo),
  toFixedOrDash(DEFAULT_NORMS.bjork.Articular_SArGo.mean),
  DEFAULT_NORMS.bjork.Articular_SArGo.sd);
lineKVN("Gonial (°)", toFixedOrDash(Gonial_ArGoMe),
  toFixedOrDash(DEFAULT_NORMS.bjork.Gonial_ArGoMe.mean),
  DEFAULT_NORMS.bjork.Gonial_ArGoMe.sd);
lineKVN("Jarabak (%)", toFixedOrDash(Jarabak_Ratio),
  toFixedOrDash(DEFAULT_NORMS.bjork.Jarabak_Ratio.mean),
  DEFAULT_NORMS.bjork.Jarabak_Ratio.sd);
divider(4);

// === Análisis extendido ===
sectionTitle("Análisis extendido");
lineKVN("IMPA (°)", toFixedOrDash(IMPA),
  toFixedOrDash(DEFAULT_NORMS.extended.IMPA.mean),
  DEFAULT_NORMS.extended.IMPA.sd);
lineKVN("Wits (mm)", toFixedOrDash(Wits),
  toFixedOrDash(DEFAULT_NORMS.extended.Wits.mean),
  DEFAULT_NORMS.extended.Wits.sd);
lineKVN("Ocl–SN (°)", toFixedOrDash(Ocl_SN),
  toFixedOrDash(DEFAULT_NORMS.extended.Ocl_SN.mean),
  DEFAULT_NORMS.extended.Ocl_SN.sd);
lineKVN("Eje facial (°)", toFixedOrDash(Facial_Angle),
  toFixedOrDash(DEFAULT_NORMS.extended.Facial_Angle.mean),
  DEFAULT_NORMS.extended.Facial_Angle.sd);
lineKVN("U1–SN (°)", toFixedOrDash(U1_SN),
  toFixedOrDash(DEFAULT_NORMS.extended.U1_SN.mean),
  DEFAULT_NORMS.extended.U1_SN.sd);
divider(5);
  // === Resumen clínico (justificado manual) ===
  sectionTitle("Resumen clínico");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(60);

  const maxWidth = 90;
  const wrapLines = pdf.splitTextToSize(resumenFinal, maxWidth);
  let yPos = y + 2;

  wrapLines.forEach((line) => {
    if (yPos > pageHeight - 15) {
      pdf.addPage();
      yPos = 20;
    }
    pdf.text(line, x0, yPos);
    yPos += 4;
  });

  // === Pie de página ===
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(120);
  pdf.text(
    `Realizado en cefalometria.odontover.com · Cortesía del Dr. Fernando Juárez · ${new Date().toLocaleDateString("es-MX")}`,
    pageWidth / 2,
    pageHeight - 5,
    { align: "center" }
  );

  pdf.save(`Cefalometria_${pNombre || "paciente"}.pdf`);
}

  // Exportar SOLO tabla de medidas (extra)
  function buildMeasuresRows(){
    const rows: {k:string,v:string,norm:string,u:string,z:string,i:string}[] = [];
const push = (k:string, val:number, u:string, m:number, sd:number, zEnabled=true) =>
  rows.push({
    k,
    v: toFixedOrDash(val),
    norm: toFixedOrDash(m),
    u,
    z: zEnabled ? toFixedOrDash(zScore(val, m, sd)) : "—",
    i: interpWithTolerance(val, m, u, zEnabled)
  });
    if (useSteiner){ rows.push({k:"— Steiner —",v:"",u:"",z:"",i:""});
      push("SNA", SNA, "°", DEFAULT_NORMS.steiner.SNA.mean, DEFAULT_NORMS.steiner.SNA.sd);
      push("SNB", SNB, "°", DEFAULT_NORMS.steiner.SNB.mean, DEFAULT_NORMS.steiner.SNB.sd);
      push("ANB", ANB, "°", DEFAULT_NORMS.steiner.ANB.mean, DEFAULT_NORMS.steiner.ANB.sd);
      push("SN–GoGn", SN_GoGn, "°", DEFAULT_NORMS.steiner.SN_GoGn.mean, DEFAULT_NORMS.steiner.SN_GoGn.sd);
      push("U1–NA (°)", U1_NA_deg, "°", DEFAULT_NORMS.steiner.U1_NA_deg.mean, DEFAULT_NORMS.steiner.U1_NA_deg.sd);
      push("U1–NA (mm)", U1_NA_mm, mmPerPx?"mm":"px", DEFAULT_NORMS.steiner.U1_NA_mm.mean, DEFAULT_NORMS.steiner.U1_NA_mm.sd, Boolean(mmPerPx));
      push("L1–NB (°)", L1_NB_deg, "°", DEFAULT_NORMS.steiner.L1_NB_deg.mean, DEFAULT_NORMS.steiner.L1_NB_deg.sd);
      push("L1–NB (mm)", L1_NB_mm, mmPerPx?"mm":"px", DEFAULT_NORMS.steiner.L1_NB_mm.mean, DEFAULT_NORMS.steiner.L1_NB_mm.sd, Boolean(mmPerPx));
      push("Interincisal", Interincisal, "°", DEFAULT_NORMS.steiner.Interincisal.mean, DEFAULT_NORMS.steiner.Interincisal.sd);
      push("Pg–NB (±)", Pg_NB_mm, mmPerPx?"mm":"px", DEFAULT_NORMS.steiner.Pg_NB_mm.mean, DEFAULT_NORMS.steiner.Pg_NB_mm.sd, Boolean(mmPerPx));
    }
    if (useBjork){ rows.push({k:"— Björk–Jarabak —",v:"",u:"",z:"",i:""});
      push("Silla (N–S–Ar)", Saddle_NSAr, "°", DEFAULT_NORMS.bjork.Saddle_NSAr.mean, DEFAULT_NORMS.bjork.Saddle_NSAr.sd);
      push("Articular (S–Ar–Go)", Articular_SArGo, "°", DEFAULT_NORMS.bjork.Articular_SArGo.mean, DEFAULT_NORMS.bjork.Articular_SArGo.sd);
      push("Gonial (Ar–Go–Me)", Gonial_ArGoMe, "°", DEFAULT_NORMS.bjork.Gonial_ArGoMe.mean, DEFAULT_NORMS.bjork.Gonial_ArGoMe.sd);
      push("Suma Björk", Sum_Bjork, "°", DEFAULT_NORMS.bjork.Sum_Bjork.mean, DEFAULT_NORMS.bjork.Sum_Bjork.sd);
      push("Jarabak % (S–Go/N–Me)", Jarabak_Ratio, "%", DEFAULT_NORMS.bjork.Jarabak_Ratio.mean, DEFAULT_NORMS.bjork.Jarabak_Ratio.sd);
    }
    rows.push({k:"— Odontover Extended —",v:"",u:"",z:"",i:""});
push("IMPA (°)", IMPA, "°", DEFAULT_NORMS.extended.IMPA.mean, DEFAULT_NORMS.extended.IMPA.sd);
push("Wits (mm)", Wits, "mm", DEFAULT_NORMS.extended.Wits.mean, DEFAULT_NORMS.extended.Wits.sd);
push("Plano Oclusal – SN (°)", Ocl_SN, "°", DEFAULT_NORMS.extended.Ocl_SN.mean, DEFAULT_NORMS.extended.Ocl_SN.sd);
push("Eje Facial (°)", Facial_Angle, "°", DEFAULT_NORMS.extended.Facial_Angle.mean, DEFAULT_NORMS.extended.Facial_Angle.sd);
push("U1–SN (°)", U1_SN, "°", DEFAULT_NORMS.extended.U1_SN.mean, DEFAULT_NORMS.extended.U1_SN.sd);
    rows.push({k:"— Tejidos blandos —",v:"",u:"",z:"",i:""});
    push("Labio inf – E-line (±)", ELine_Li_mm, mmPerPx?"mm":"px", DEFAULT_NORMS.soft.ELine_Li_mm.mean, DEFAULT_NORMS.soft.ELine_Li_mm.sd, Boolean(mmPerPx));
    return rows;
  }

async function exportTablePNG() {
  const rows = buildMeasuresRows();
  const pad = 24,
    W = 720,
    colW = [200, 80, 80, 60, 80, 120];
  const titleH = 60;
  const rowH = 22;
  const H = titleH + pad + rows.length * rowH + pad;

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, W, H);

  let y = pad;
  ctx.fillStyle = "#e2e8f0";
  ctx.font =
    "bold 20px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif";
  ctx.fillText(
    "Tabla de medidas (con normas de referencia)",
    pad,
    y
  );
  y += 22;
  ctx.font =
    "12px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif";
  ctx.fillStyle = "#93c5fd";
  ctx.fillText("by @dr.juarez", pad, y);
  y += 16;
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(
    `${pNombre || "—"} · ${pEdad ? pEdad + " años" : "—"} · ${
      pSexo || "—"
    } · ${pFecha || "—"} · Dr: ${pDoctor || "—"}`,
    pad,
    y
  );
  y += 16;
  ctx.strokeStyle = "#1f2937";
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  y += 14;

  ctx.fillStyle = "#e2e8f0";
  ctx.font =
    "12px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif";

  // 🔹 Dibuja todas las filas
  for (const r of rows) {
    if (r.u === "" && r.v === "" && r.z === "" && r.i === "") {
      ctx.fillStyle = "#93c5fd";
      ctx.font =
        "bold 13px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif";
      ctx.fillText(r.k, pad, y);
      ctx.font =
        "12px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif";
      ctx.fillStyle = "#e2e8f0";
      y += rowH;
      continue;
    }

    let x = pad;
    ctx.textAlign = "left";
    ctx.fillText(r.k, x, y);
    x += colW[0];

    ctx.textAlign = "right";
    ctx.fillText(r.v, x, y);
    x += colW[1];

    ctx.fillStyle = "#93c5fd"; // norma
    ctx.fillText(r.norm || "—", x, y);
    ctx.fillStyle = "#e2e8f0";

    x += 20;
    ctx.textAlign = "left";
    ctx.fillText(r.u, x, y);
    x += colW[3];
    ctx.fillText(r.z, x, y);
    x += colW[4];
    ctx.fillText(r.i, x, y);

    y += rowH;
  }

  // 🔹 Exportar a PNG
  const blob: Blob | null = await new Promise((res) =>
    c.toBlob(res, "image/png")
  );
  if (blob) triggerDownload(blob, "cefalo_tabla.png");
  else setManualLink(c.toDataURL("image/png"), "cefalo_tabla.png");
}

async function exportTablePDF() {
  const rows = buildMeasuresRows();

  // 🔹 Construcción de las filas HTML (con columna "Norma")
  const htmlRows = rows
    .map((r) =>
      r.u === "" && r.v === "" && r.z === "" && r.i === ""
        ? `<tr><td colspan="6" style="padding-top:6px;color:#60a5fa;font-weight:600">${r.k}</td></tr>`
        : `<tr>
             <td>${r.k}</td>
             <td style="text-align:right">${r.v}</td>
             <td style="text-align:right;color:#60a5fa">${r.norm || "—"}</td>
             <td>${r.u}</td>
             <td>${r.z}</td>
             <td>${r.i}</td>
           </tr>`
    )
    .join("");

  // 🔹 HTML completo del PDF
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Tabla de medidas</title>
<style>
  @page { size: A4; margin: 16mm; }
  body {
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif;
    color: #0b1220;
    margin: 0;
  }
  h1 {
    font-size: 20px;
    margin: 0 0 6px 0;
  }
  .sub {
    color: #2563eb;
    font-size: 12px;
    margin-bottom: 10px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    padding: 6px 8px;
    border-bottom: 1px solid #e5e7eb;
    font-size: 12px;
  }
  thead th {
    color: #334155;
    text-align: left;
  }
</style>
</head>
<body>
  <h1>Tabla de medidas (con normas de referencia)</h1>
  <div class="sub">by @dr.juarez</div>
  <div style="font-size:12px;color:#334155;margin-bottom:8px">
    ${pNombre || "—"} · ${pEdad ? pEdad + " años" : "—"} · ${pSexo || "—"} · ${
    pFecha || "—"
  } · Dr: ${pDoctor || "—"}
  </div>

  <table>
    <thead>
      <tr>
        <th>Medida</th>
        <th style="text-align:right">Valor</th>
        <th style="text-align:right;color:#60a5fa">Norma</th>
        <th>Unid</th>
        <th>z</th>
        <th>Interpretación</th>
      </tr>
    </thead>
    <tbody>${htmlRows}</tbody>
  </table>

  <div style="margin-top:24px;font-size:11px;color:#475569;text-align:center">
    Cefalometría — <b>cefalometria.odontover.com</b><br/>
    ${new Date().toLocaleDateString("es-MX")} · 
    ${window.location.hostname}
  </div>

  <script>
    // Autoimprimir o guardar como PDF
    window.onload = () => {
      setTimeout(() => window.print(), 500);
    };
  </script>
</body>
</html>`;

  // 🔹 Crear y abrir el archivo en una nueva pestaña
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) setManualLink(url, "cefalo_tabla.pdf.html");
}

function interpretacionExtendida() {
  const parts: string[] = [];

  // IMPA (ángulo del incisivo inferior con el plano mandibular)
  const impaState = interpWithTolerance(IMPA, DEFAULT_NORMS.extended.IMPA.mean, "°");
  if (impaState === "menor")
    parts.push("Los incisivos inferiores están retroinclinados respecto al plano mandibular (IMPA disminuido).");
  else if (impaState === "mayor")
    parts.push("Los incisivos inferiores presentan proinclinación (IMPA aumentado), sugiriendo compensación dental anterior.");
  else if (impaState === "normal")
    parts.push("El eje de los incisivos inferiores (IMPA) se encuentra dentro de los valores normales.");

  // Wits appraisal
  const witsState = interpWithTolerance(Wits, DEFAULT_NORMS.extended.Wits.mean, "mm");
  if (witsState === "menor")
    parts.push("El valor de Wits negativo indica una tendencia a relación Clase III esquelética.");
  else if (witsState === "mayor")
    parts.push("El valor de Wits positivo sugiere una tendencia a relación Clase II esquelética.");
  else if (witsState === "normal")
    parts.push("El valor de Wits se encuentra dentro del rango normal, compatible con una relación esquelética Clase I.");

  // Plano oclusal – SN
  const oclsnState = interpWithTolerance(Ocl_SN, DEFAULT_NORMS.extended.Ocl_SN.mean, "°");
  if (oclsnState === "menor")
    parts.push("El plano oclusal se encuentra más plano respecto a la base craneal, asociado con patrones hipodivergentes.");
  else if (oclsnState === "mayor")
    parts.push("El plano oclusal se muestra más inclinado respecto a la base craneal, común en pacientes hiperdivergentes.");
  else if (oclsnState === "normal")
    parts.push("El plano oclusal presenta una inclinación dentro de los límites normales respecto a la base craneal.");

  // Eje Facial
  const facialState = interpWithTolerance(Facial_Angle, DEFAULT_NORMS.extended.Facial_Angle.mean, "°");
  if (facialState === "menor")
    parts.push("El eje facial disminuido refleja un patrón de crecimiento más vertical o tendencia dolicofacial.");
  else if (facialState === "mayor")
    parts.push("El eje facial aumentado indica un patrón de crecimiento más horizontal o tendencia braquifacial.");
  else if (facialState === "normal")
    parts.push("El eje facial se mantiene dentro del rango normal de crecimiento craneofacial.");

  // U1–SN
  const u1snState = interpWithTolerance(U1_SN, DEFAULT_NORMS.extended.U1_SN.mean, "°");
  if (u1snState === "menor")
    parts.push("Los incisivos superiores están retroinclinados respecto al plano SN.");
  else if (u1snState === "mayor")
    parts.push("Los incisivos superiores se encuentran proinclinados respecto al plano SN.");
  else if (u1snState === "normal")
    parts.push("La inclinación de los incisivos superiores respecto al plano SN es adecuada.");

  return parts.join(" ");
}

  // ===== Resumen clínico =====
  const sexLabel = pSexo==="M"?"masculino":(pSexo==="F"?"femenino":"");
  const tolWord = (val:number, mean:number, units:string, hi:string, mid:string, lo:string) => { const i = interpWithTolerance(val, mean, units, true); if (i==="mayor") return hi; if (i==="menor") return lo; if (i==="normal") return mid; return "indeterminado"; };
  const snaTxt = tolWord(SNA, DEFAULT_NORMS.steiner.SNA.mean, "°", "protruido", "normal", "retruido");
  const snbTxt = tolWord(SNB, DEFAULT_NORMS.steiner.SNB.mean, "°", "protruida", "normal", "retruida");
  const anbClass = (()=>{ const i = interpWithTolerance(ANB, DEFAULT_NORMS.steiner.ANB.mean, "°", true); if (i==="mayor") return "Clase II"; if (i==="menor") return "Clase III"; if (i==="normal") return "Clase I"; return "indeterminado"; })();
  const growthTxt = tolWord(SN_GoGn, DEFAULT_NORMS.steiner.SN_GoGn.mean, "°", "hiperdivergente", "normodivergente", "hipodivergente");
  const u1degTxt = tolWord(U1_NA_deg, DEFAULT_NORMS.steiner.U1_NA_deg.mean, "°", "proinclinados", "normales", "retroinclinados");
  const u1mmTxt  = mmPerPx ? tolWord(U1_NA_mm, DEFAULT_NORMS.steiner.U1_NA_mm.mean, "mm", "protrusión", "normal", "retrusión") : "indeterminado";
  const l1degTxt = tolWord(L1_NB_deg, DEFAULT_NORMS.steiner.L1_NB_deg.mean, "°", "proinclinados", "normales", "retroinclinados");
  const l1mmTxt  = mmPerPx ? tolWord(L1_NB_mm, DEFAULT_NORMS.steiner.L1_NB_mm.mean, "mm", "protruidos", "normales", "retruídos") : "indeterminado";
  const interTxt = tolWord(Interincisal, DEFAULT_NORMS.steiner.Interincisal.mean, "°", "retroinclinación incisiva", "normal", "biprotrusión incisiva");
  const lipsTxt  = mmPerPx ? tolWord(ELine_Li_mm, DEFAULT_NORMS.soft.ELine_Li_mm.mean, "mm", "protrusión labial", "normal", "retrusión labial") : "indeterminado";
  const resumen = `Paciente ${sexLabel?`(${sexLabel}) `:""}de ${pEdad||"—"} años, presenta maxilar superior: ${snaTxt}, y la mandíbula: ${snbTxt}. Presenta una relación esqueletal de tipo: ${anbClass}. El paciente tiene un crecimiento craneofacial de tipo: ${growthTxt}. Dentalmente encontramos a los incisivos superiores con una angulación: ${u1degTxt}, y una posición: ${u1mmTxt}. Los incisivos inferiores con una angulación: ${l1degTxt}, y una posición: ${l1mmTxt}. La relación interincisal: ${interTxt} y los labios en posición: ${lipsTxt}.`;
  const resumenExtendido = interpretacionExtendida();
  const resumenFinal = resumen + " " + resumenExtendido;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-4 space-y-4">
       <section className="rounded-2xl border border-slate-800 p-4 bg-slate-900/50">
  <h2 className="font-semibold mb-2">1) Radiografía</h2>
  <input
    type="file"
    accept="image/*"
    onChange={handleFile}
    className="block w-full text-sm"
  />
  <div className="text-xs text-slate-400 mt-2">
    Formatos soportados: JPG/PNG. Usa la mayor resolución posible.
  </div>

  <div className="mt-3">
    <button
      onClick={resetAll}
      className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-100"
    >
      Reiniciar trazado
    </button>
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
          <label className="inline-flex items-center gap-2">
  <input type="checkbox" checked={useExtended} onChange={e=>setUseExtended(e.target.checked)} /> Análisis Extendido
</label>
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

<thead>
  <tr className="text-slate-300">
    <th className="text-left font-medium py-1 pr-4">Medida</th>
    <th className="text-right font-medium py-1 pr-4">Valor</th>
    <th className="text-right font-medium py-1 pr-4 text-sky-300">Norma</th>
    <th className="text-left font-medium py-1 text-center">°/mm</th>
    <th className="text-left font-medium py-1 text-center">Z</th>
    <th className="text-left font-medium py-1 text-center">Sig.</th>
  </tr>
</thead>

              <tbody className="text-slate-200">
                {useSteiner && (<>
                  <tr><td colSpan={5} className="pt-2 text-sky-300">— Steiner —</td></tr>
                  <RowZInt name="SNA" value={SNA} units="°" norm={DEFAULT_NORMS.steiner.SNA} />
                  <RowZInt name="SNB" value={SNB} units="°" norm={DEFAULT_NORMS.steiner.SNB} />
                  <RowZInt name="ANB" value={ANB} units="°" norm={DEFAULT_NORMS.steiner.ANB} />
                  <RowZInt name="SN–GoGn" value={SN_GoGn} units="°" norm={DEFAULT_NORMS.steiner.SN_GoGn} />
                  <RowZInt name="U1–NA (°)" value={U1_NA_deg} units="°" norm={DEFAULT_NORMS.steiner.U1_NA_deg} />
                  <RowZInt name="U1–NA (mm)" value={U1_NA_mm} units={mmPerPx?"mm":"px"} norm={DEFAULT_NORMS.steiner.U1_NA_mm} zEnabled={Boolean(mmPerPx)} />
                  <RowZInt name="L1–NB (°)" value={L1_NB_deg} units="°" norm={DEFAULT_NORMS.steiner.L1_NB_deg} />
                  <RowZInt name="L1–NB (mm)" value={L1_NB_mm} units={mmPerPx?"mm":"px"} norm={DEFAULT_NORMS.steiner.L1_NB_mm} zEnabled={Boolean(mmPerPx)} />
                  <RowZInt name="Interincisal" value={Interincisal} units="°" norm={DEFAULT_NORMS.steiner.Interincisal} />
                  <RowZInt name="Pg–NB (±)" value={Pg_NB_mm} units={mmPerPx?"mm":"px"} norm={DEFAULT_NORMS.steiner.Pg_NB_mm} zEnabled={Boolean(mmPerPx)} />
                </>)}
                {useBjork && (<>
                  <tr><td colSpan={5} className="pt-2 text-sky-300">— Björk–Jarabak —</td></tr>
                  <RowZInt name="Silla (N–S–Ar)" value={Saddle_NSAr} units="°" norm={DEFAULT_NORMS.bjork.Saddle_NSAr} />
                  <RowZInt name="Articular (S–Ar–Go)" value={Articular_SArGo} units="°" norm={DEFAULT_NORMS.bjork.Articular_SArGo} />
                  <RowZInt name="Gonial (Ar–Go–Me)" value={Gonial_ArGoMe} units="°" norm={DEFAULT_NORMS.bjork.Gonial_ArGoMe} />
                  <RowZInt name="Suma Björk" value={Sum_Bjork} units="°" norm={DEFAULT_NORMS.bjork.Sum_Bjork} />
                  <RowZInt name="Jarabak % (S–Go/N–Me)" value={Jarabak_Ratio} units="%" norm={DEFAULT_NORMS.bjork.Jarabak_Ratio} />
                </>)}
                <tr><td colSpan={5} className="pt-2 text-sky-300">— Análisis Extendido —</td></tr>
<RowZInt name="IMPA (°)" value={IMPA} units="°" norm={DEFAULT_NORMS.extended.IMPA} />
<RowZInt name="Wits (mm)" value={Wits} units="mm" norm={DEFAULT_NORMS.extended.Wits} />
<RowZInt name="Plano Oclusal – SN (°)" value={Ocl_SN} units="°" norm={DEFAULT_NORMS.extended.Ocl_SN} />
<RowZInt name="Eje Facial (°)" value={Facial_Angle} units="°" norm={DEFAULT_NORMS.extended.Facial_Angle} />
<RowZInt name="U1–SN (°)" value={U1_SN} units="°" norm={DEFAULT_NORMS.extended.U1_SN} />
                <tr><td colSpan={5} className="pt-2 text-sky-300">— Tejidos blandos —</td></tr>
                <RowZInt name="Labio inf – E-line (±)" value={ELine_Li_mm} units={mmPerPx?"mm":"px"} norm={DEFAULT_NORMS.soft.ELine_Li_mm} zEnabled={Boolean(mmPerPx)} />
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <button onClick={exportCSV} className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm">Exportar CSV</button>
            <button onClick={exportSheetPNG} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm">Exportar Trazo (PNG)</button>
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
          {/* Indicador superior contextual */}
<div className="mb-2 text-center">
  <div
    className="inline-block px-4 py-2 rounded-xl border text-sm font-medium shadow-md transition-all duration-300"
    style={{
      backgroundColor: !imgSrc
        ? "rgba(71, 85, 105, 0.5)"   // gris-azulado (sin imagen)
        : !mmPerPx
        ? "rgba(8, 47, 73, 0.6)"     // azul oscuro (calibración)
        : placingMode && activeKey
        ? "rgba(7, 89, 133, 0.6)"    // azul medio (marcando puntos)
        : "rgba(22, 101, 52, 0.6)",  // verde (terminado)
      borderColor: !imgSrc
        ? "rgba(148, 163, 184, 0.5)"
        : !mmPerPx
        ? "rgba(56, 189, 248, 0.8)"
        : placingMode && activeKey
        ? "rgba(56, 189, 248, 0.8)"
        : "rgba(74, 222, 128, 0.8)",
      color: "#f1f5f9",
    }}
  >
    {!imgSrc ? (
      <span className="text-sky-300 font-semibold">
        Cargue una radiografía
      </span>
    ) : !mmPerPx ? (
      <span className="text-sky-300 font-semibold">
        Ahora realice la calibración
      </span>
    ) : placingMode && activeKey ? (
      <>
        Marcando punto:{" "}
        <span className="text-sky-300 font-semibold">
          {LANDMARKS.find((l) => l.key === activeKey)?.label || activeKey}
        </span>
      </>
    ) : placingMode && !activeKey ? (
      <span className="text-emerald-300 font-semibold">
        Análisis terminado, ahora puedes exportar los resultados
      </span>
    ) : (
      <span className="text-slate-300">
        Seleccione o mueva puntos para ajustar el trazado
      </span>
    )}
  </div>
</div>
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
                  {has("Ba") && has("N") && (<line x1={points.Ba!.x} y1={points.Ba!.y} x2={points.N!.x} y2={points.N!.y} stroke="#60a5fa" strokeDasharray="6 4" strokeWidth={2} />)}
                  {has("Pt") && has("Gn") && (<line x1={points.Pt!.x} y1={points.Pt!.y} x2={points.Gn!.x} y2={points.Gn!.y} stroke="#60a5fa" strokeDasharray="6 4" strokeWidth={2} />)}
                  {has("Oc1") && has("Oc2") && (<line x1={points.Oc1!.x} y1={points.Oc1!.y} x2={points.Oc2!.x} y2={points.Oc2!.y} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={2} />)}
                  {/* E-line */}
                  {has("Prn") && has("PgS") && (<line x1={points.Prn!.x} y1={points.Prn!.y} x2={points.PgS!.x} y2={points.PgS!.y} stroke="#60a5fa" strokeDasharray="6 4" strokeWidth={2} />)}
                  {LANDMARKS.map(({ key, label }) => { const p = points[key]; if (!p) return null; const isActive = activeKey === key; return (
                    <g key={key} className="cursor-move pointer-events-auto" onMouseDown={(e)=>onPointMouseDown(key, e)}>
                      <circle cx={p.x} cy={p.y} r={6} fill={isActive?"#38bdf8":"#94a3b8"} stroke="#0f172a" strokeWidth={2} />
                      <text x={p.x + 8} y={p.y - 8} fontSize={12} fill="#e2e8f0" stroke="#0f172a" strokeWidth={0.5}>{label.split(" ")[0]}</text>
                    </g>
                  ); })}
                  
                  {calibClicks.length > 0 && (
  <g>
    <circle
      cx={calibClicks[0].x}
      cy={calibClicks[0].y}
      r={5}
      fill="#22c55e"
    />
    {calibClicks[1] && (
      <>
        <circle
          cx={calibClicks[1].x}
          cy={calibClicks[1].y}
          r={5}
          fill="#22c55e"
        />
        <line
          x1={calibClicks[0].x}
          y1={calibClicks[0].y}
          x2={calibClicks[1].x}
          y2={calibClicks[1].y}
          stroke="#22c55e"
          strokeWidth={2}
        />
        {/* Etiqueta opcional con la longitud calibrada */}
        {mmPerPx && (
          <text
            x={(calibClicks[0].x + calibClicks[1].x) / 2}
            y={(calibClicks[0].y + calibClicks[1].y) / 2 - 8}
            fontSize={12}
            fill="#22c55e"
            stroke="#0f172a"
            strokeWidth={0.5}
            textAnchor="middle"
          >
            {mmKnown} mm
          </text>
        )}
      </>
    )}
  </g>
)}

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
                    <AngleLabel p={{ x: points.S!.x + 40, y: points.S!.y - 10 }} text={`Silla ${toFixedOrDash(Saddle_NSAr)}`} />
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
        <section className="rounded-2xl border border-slate-800 p-4 bg-slate-900/50 mt-3">
          <h2 className="font-semibold mb-2">7) Resumen clínico</h2>
         <p className="text-sm text-slate-200 leading-6 whitespace-pre-line lg:text-justify">{resumenFinal}</p>
        </section>
        {/* 8) Donaciones */}
        <section className="rounded-2xl border border-slate-800 p-4 bg-slate-900/50 mt-3">
          <h2 className="font-semibold mb-2">8) Apoya el proyecto</h2>
          <p className="text-sm text-slate-300">
            Da click en el botón flotante <em>Donate!</em> de abajo, o
            <button
              onClick={() => (window as any).kofiWidgetOverlay?.draw?.('drjuarez', {
                'type': 'floating-chat',
                'floating-chat.donateButton.text': 'Donate',
                'floating-chat.donateButton.background-color': '#00b9fe',
                'floating-chat.donateButton.text-color': '#fff'
              })}
              className="underline text-sky-300 ml-1"
            >haz clic aquí para recargarlo</button>.
          </p>
        </section>
        {/* 9) Aviso */}
        <section className="rounded-2xl border border-amber-700/40 p-4 bg-amber-900/20 mt-3">
          <h2 className="font-semibold mb-2">Aviso y responsabilidad</h2>
          <p className="text-xs leading-5 text-amber-100/90">
            Esta herramienta es de apoyo académico/clínico. El usuario es responsable de verificar medidas y resultados antes de cualquier decisión terapéutica. Ni el sitio ni el autor asumen responsabilidad por interpretaciones o usos indebidos. Las imágenes y datos que cargas se procesan localmente en tu navegador y <strong>no se almacenan en ningún servidor</strong>.
          </p>
        </section>
      </div>
    </div>
  );
}

function RowZInt({
  name,
  value,
  units,
  norm,
  zEnabled = true,
}: {
  name: string;
  value: number;
  units: string;
  norm: { mean: number; sd: number };
  zEnabled?: boolean;
}) {
  const ok = !Number.isNaN(value);
  const zz = ok && zEnabled ? zScore(value, norm.mean, norm.sd) : NaN;
  const tol = toleranceForUnits(units);
  const delta = ok ? value - norm.mean : NaN;
  const tolColor =
    !ok || tol == null || !zEnabled
      ? "text-slate-500"
      : Math.abs(delta!) <= tol
      ? "text-emerald-400"
      : Math.abs(delta!) <= tol * 2
      ? "text-amber-400"
      : "text-rose-400";
  const interp = interpWithTolerance(value, norm.mean, units, zEnabled);

  return (
    <tr className="border-t border-slate-800">
      <td className="py-1 pr-4 text-slate-300">{name}</td>
      <td className={`py-1 pr-4 text-right ${ok ? "text-slate-100" : "text-slate-500"}`}>
        {toFixedOrDash(value)}
      </td>
      <td className="py-1 text-sky-300 text-right pr-4">
        {toFixedOrDash(norm.mean)}
      </td>
      <td className="py-1">{units}</td>
      <td className={`py-1 ${tolColor}`}>
        {Number.isNaN(zz) ? "—" : `${zz >= 0 ? "+" : ""}${zz.toFixed(2)}`}
      </td>
      <td className="py-1">{interp}</td>
    </tr>
  );
}

function AngleLabel({ p, text }: { p: Pt; text: string }) { return (<text x={p.x} y={p.y} fontSize={12} fill="#e2e8f0" stroke="#0f172a" strokeWidth={0.5}>{text}</text>); }
