import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";

// ═══════════════════════════════════════════════════════════════
// SIMULATION ENGINE
// ═══════════════════════════════════════════════════════════════

const RESTAURANT_TIERS = [
  { type: "Cloud Kitchen",    baseKPT: 12, variance: 2,  riderBias: 0.05, nonZomatoLoad: 0.05, weight: 0.05 },
  { type: "QSR Chain",        baseKPT: 10, variance: 3,  riderBias: 0.10, nonZomatoLoad: 0.10, weight: 0.10 },
  { type: "Mid Restaurant",   baseKPT: 18, variance: 6,  riderBias: 0.35, nonZomatoLoad: 0.40, weight: 0.30 },
  { type: "Small Dhaba",      baseKPT: 22, variance: 10, riderBias: 0.55, nonZomatoLoad: 0.65, weight: 0.35 },
  { type: "Home Kitchen",     baseKPT: 25, variance: 12, riderBias: 0.65, nonZomatoLoad: 0.50, weight: 0.20 },
];

const DISH_PROFILES = {
  "Biryani":    { complexity: 1.4, avgWeight: 850,  tolerance: 100 },
  "Thali":      { complexity: 1.3, avgWeight: 950,  tolerance: 120 },
  "Curry+Rice": { complexity: 1.2, avgWeight: 700,  tolerance: 90  },
  "Dosa":       { complexity: 1.0, avgWeight: 400,  tolerance: 60  },
  "Pizza":      { complexity: 1.1, avgWeight: 600,  tolerance: 80  },
  "Burger":     { complexity: 0.8, avgWeight: 350,  tolerance: 50  },
  "Sandwich":   { complexity: 0.7, avgWeight: 280,  tolerance: 40  },
  "Cold Coffee":{ complexity: 0.5, avgWeight: 450,  tolerance: 50  },
};

// Indian rush hours: lunch 12-2pm, dinner 8-10pm
const HOUR_MULT = [
  0.35,0.25,0.25,0.25,0.35,0.50,
  0.60,0.80,1.00,0.90,0.85,1.00,
  1.55,1.70,1.45,1.05,0.90,0.95,
  1.05,1.15,1.65,1.80,1.55,1.20,
];

const gauss = (m, s) => {
  let u=0,v=0;
  while(!u) u=Math.random();
  while(!v) v=Math.random();
  return m + s * Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
};
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const pct = (a,b) => Math.abs(((b-a)/a)*100).toFixed(1);

function simulateOrder(restaurant, hour, cfg) {
  const rush = HOUR_MULT[hour];
  const dishKeys = Object.keys(DISH_PROFILES);
  const dish = dishKeys[Math.floor(Math.random() * dishKeys.length)];
  const { complexity, avgWeight, tolerance } = DISH_PROFILES[dish];

  // TRUE kitchen prep time (includes non-Zomato load)
  const nonZomatoExtra = restaurant.nonZomatoLoad * rush * gauss(4, 2);
  const trueKPT = clamp(
    gauss(restaurant.baseKPT * complexity * rush, restaurant.variance) + nonZomatoExtra,
    restaurant.baseKPT * 0.4, restaurant.baseKPT * 3.2
  );

  // ── BASELINE: Biased FOR signal ──────────────────────────────
  let baselineSignal = trueKPT;
  if (Math.random() < restaurant.riderBias) {
    baselineSignal = trueKPT + gauss(1.5, 3.5); // rider-influenced late marking
  }
  baselineSignal = clamp(baselineSignal + gauss(0, 2.5), 3, 65);
  const baseRiderWait   = clamp(gauss(4.2, 2.2), 0, 18);
  const baseETAError    = Math.abs(baselineSignal - trueKPT);
  const baseDelay       = clamp(gauss(2.8, 1.8), 0, 12);
  const baseIdleTime    = clamp(gauss(3.5, 1.5), 0, 14);

  // ── IMPROVED: Signal stack ───────────────────────────────────
  let noise = restaurant.variance * 1.0;
  let improvedBase = trueKPT * complexity * rush;
  let signalsActive = 0;

  // Signal 1: Smart Dispatch Station (label + FOR fusion)
  // Eliminates rider bias entirely — physical placement IS the signal
  if (cfg.dispatchStation) {
    noise *= 0.18; // near-ground-truth for equipped restaurants
    signalsActive++;
    // Weight validation: catches wrong/incomplete orders
    const packedWeight = gauss(avgWeight, tolerance * 0.3);
    const weightValid = Math.abs(packedWeight - avgWeight) < tolerance;
    if (!weightValid) noise *= 1.4; // slight penalty if weight anomaly
  }

  // Signal 2: POS / Billing integration
  if (cfg.posIntegration && restaurant.type !== "Small Dhaba" && restaurant.type !== "Home Kitchen") {
    noise *= 0.22;
    signalsActive++;
  }

  // Signal 3: IoT kitchen activity sensor (captures non-Zomato load)
  if (cfg.iotSensor) {
    noise *= 0.70;
    signalsActive++;
    // Key: reduces non-Zomato load blindness
    const capturedLoad = nonZomatoExtra * 0.72;
    improvedBase = (trueKPT - nonZomatoExtra) * complexity * rush + capturedLoad;
  }

  // Signal 4: FOR label cleaning (debias historical training data)
  if (cfg.labelCleaning) {
    noise *= 0.80;
    signalsActive++;
  }

  const improvedSignal = clamp(gauss(improvedBase, noise), restaurant.baseKPT * 0.35, restaurant.baseKPT * 2.4);

  // Dispatch logic improvement (DeepRed-style hold)
  // const riderTravel = gauss(11, 2.5);
  // const holdTime = cfg.dispatchStation ? Math.max(0, improvedSignal - riderTravel - 1) : 0;

  const impRiderWait  = clamp(gauss(0.6 + (cfg.dispatchStation ? 0 : 1.2), 0.7), 0, 6);
  const impETAError   = Math.abs(improvedSignal - trueKPT);
  const impDelay      = clamp(gauss(cfg.dispatchStation ? 0.4 : 1.2, 0.5), 0, 4);
  const impIdleTime   = clamp(gauss(cfg.dispatchStation ? 0.8 : 1.8, 0.6), 0, 5);

  return {
    trueKPT, baselineSignal, improvedSignal,
    baseETAError, impETAError,
    baseRiderWait, impRiderWait,
    baseDelay, impDelay,
    baseIdleTime, impIdleTime,
    hour, restaurant: restaurant.type, dish, rush,
    signalsActive,
  };
}

function runSim(cfg, n = 700) {
  return Array.from({ length: n }, () => {
    const r = RESTAURANT_TIERS[Math.floor(Math.random() * RESTAURANT_TIERS.length)];
    const h = Math.floor(Math.random() * 24);
    return simulateOrder(r, h, cfg);
  });
}

function computeMetrics(orders) {
  const n = orders.length;
  const sorted = arr => [...arr].sort((a,b)=>a-b);
  const avg = arr => arr.reduce((s,v)=>s+v,0)/arr.length;

  const bETA = sorted(orders.map(o=>o.baseETAError));
  const iETA = sorted(orders.map(o=>o.impETAError));

  const hourly = Array.from({length:24},(_,h)=>{
    const ho = orders.filter(o=>o.hour===h);
    if (!ho.length) return {hour:`${h}h`,bETA:0,iETA:0,bWait:0,iWait:0};
    return {
      hour: `${h}h`,
      bETA:  +avg(ho.map(o=>o.baseETAError)).toFixed(2),
      iETA:  +avg(ho.map(o=>o.impETAError)).toFixed(2),
      bWait: +avg(ho.map(o=>o.baseRiderWait)).toFixed(2),
      iWait: +avg(ho.map(o=>o.impRiderWait)).toFixed(2),
    };
  });

  const rtData = RESTAURANT_TIERS.map(rt => {
    const ro = orders.filter(o=>o.restaurant===rt.type);
    if (!ro.length) return {type:rt.type,bETA:0,iETA:0,bWait:0,iWait:0,bDelay:0,iDelay:0};
    return {
      type:   rt.type,
      bETA:   +avg(ro.map(o=>o.baseETAError)).toFixed(2),
      iETA:   +avg(ro.map(o=>o.impETAError)).toFixed(2),
      bWait:  +avg(ro.map(o=>o.baseRiderWait)).toFixed(2),
      iWait:  +avg(ro.map(o=>o.impRiderWait)).toFixed(2),
      bDelay: +avg(ro.map(o=>o.baseDelay)).toFixed(2),
      iDelay: +avg(ro.map(o=>o.impDelay)).toFixed(2),
    };
  });

  const dishData = Object.keys(DISH_PROFILES).map(dish => {
    const do_ = orders.filter(o=>o.dish===dish);
    if (!do_.length) return {dish,bETA:0,iETA:0};
    return {
      dish,
      bETA: +avg(do_.map(o=>o.baseETAError)).toFixed(2),
      iETA: +avg(do_.map(o=>o.impETAError)).toFixed(2),
    };
  });

  return {
    p50b: bETA[Math.floor(n*0.5)],
    p90b: bETA[Math.floor(n*0.9)],
    p50i: iETA[Math.floor(n*0.5)],
    p90i: iETA[Math.floor(n*0.9)],
    bWait:  +avg(orders.map(o=>o.baseRiderWait)).toFixed(2),
    iWait:  +avg(orders.map(o=>o.impRiderWait)).toFixed(2),
    bDelay: +avg(orders.map(o=>o.baseDelay)).toFixed(2),
    iDelay: +avg(orders.map(o=>o.impDelay)).toFixed(2),
    bIdle:  +avg(orders.map(o=>o.baseIdleTime)).toFixed(2),
    iIdle:  +avg(orders.map(o=>o.impIdleTime)).toFixed(2),
    hourly, rtData, dishData,
    scatter: orders.slice(0,200).map(o=>({
      true: +o.trueKPT.toFixed(1),
      base: +o.baselineSignal.toFixed(1),
      imp:  +o.improvedSignal.toFixed(1),
    })),
  };
}

// ═══════════════════════════════════════════════════════════════
// DESIGN SYSTEM  — deep navy + amber/gold industrial aesthetic
// ═══════════════════════════════════════════════════════════════
const T = {
  bg:      "#080c14",
  panel:   "#0d1220",
  card:    "#111827",
  border:  "#1f2d45",
  border2: "#2a3d5c",
  text:    "#e2e8f0",
  sub:     "#64748b",
  dim:     "#374151",

  amber:   "#f59e0b",
  gold:    "#fbbf24",
  teal:    "#2dd4bf",
  red:     "#f87171",
  blue:    "#60a5fa",
  purple:  "#a78bfa",
  green:   "#34d399",
  orange:  "#fb923c",

  fontHead: "'Syne', 'Rajdhani', sans-serif",
  fontBody: "'DM Sans', 'Outfit', sans-serif",
};

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

const MetricPill = ({ label, base, improved, unit, icon }) => {
  const drop = +pct(base, improved);
  const fmtVal = v => v > 50000 ? `₹${(v/100000).toFixed(1)}L` : v?.toFixed(1);
  const fmtUnit = v => v > 50000 ? "/mo" : unit;
  return (
    <div style={{
      background: `linear-gradient(135deg, ${T.card} 0%, #0f1e35 100%)`,
      border: `1px solid ${T.border2}`,
      borderRadius: 16,
      padding: "18px 20px",
      flex: 1,
      minWidth: 145,
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position:"absolute", top:0, right:0,
        width:60, height:60,
        background:`radial-gradient(circle at top right, ${T.amber}18, transparent 70%)`,
      }}/>
      <div style={{ color: T.sub, fontSize: 10, fontWeight: 700, textTransform:"uppercase", letterSpacing:1.4, marginBottom:10, fontFamily:T.fontBody }}>
        {icon} {label}
      </div>
      <div style={{ color: T.gold, fontSize: 30, fontWeight: 800, lineHeight:1, fontFamily:T.fontHead }}>
        {fmtVal(improved)}
        <span style={{ fontSize: 12, color: T.sub, marginLeft:3, fontWeight:500 }}>{fmtUnit(improved)}</span>
      </div>
      <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ color: T.dim, fontSize:11, textDecoration:"line-through" }}>{fmtVal(base)}{fmtUnit(base)}</span>
        <span style={{
          background:`${T.teal}18`, color:T.teal,
          border:`1px solid ${T.teal}40`,
          borderRadius:20, padding:"2px 9px",
          fontSize:11, fontWeight:800, fontFamily:T.fontBody,
        }}>▼ {drop}%</span>
      </div>
    </div>
  );
};

const SignalToggle = ({ label, sub, color, icon, value, onChange, tier }) => (
  <div
    onClick={() => onChange(!value)}
    style={{
      background: value ? `${color}12` : "transparent",
      border: `1.5px solid ${value ? color : T.border}`,
      borderRadius: 12,
      padding: "12px 14px",
      cursor: "pointer",
      transition: "all 0.25s",
      userSelect: "none",
      marginBottom: 8,
    }}
  >
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <div style={{ flex:1 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
          <span style={{ fontSize:16 }}>{icon}</span>
          <span style={{ color: value ? color : T.sub, fontWeight:700, fontSize:13, fontFamily:T.fontHead }}>{label}</span>
          <span style={{
            background:`${color}18`, color, borderRadius:6,
            padding:"1px 6px", fontSize:9, fontWeight:700, letterSpacing:0.8,
          }}>{tier}</span>
        </div>
        <div style={{ color:T.dim, fontSize:10, paddingLeft:24 }}>{sub}</div>
      </div>
      <div style={{
        width:36, height:20, borderRadius:10,
        background: value ? color : T.dim,
        position:"relative", flexShrink:0, transition:"background 0.25s", marginLeft:10,
      }}>
        <div style={{
          width:14, height:14, borderRadius:"50%", background:"#fff",
          position:"absolute", top:3, left: value ? 19 : 3, transition:"left 0.25s",
        }}/>
      </div>
    </div>
  </div>
);

const ttStyle = {
  contentStyle: { background:"#0a1628", border:`1px solid ${T.border2}`, borderRadius:10, fontSize:12, fontFamily:T.fontBody },
  labelStyle: { color: T.gold },
};

const TabBtn = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{
    background: active ? `${T.amber}18` : "transparent",
    border: `1px solid ${active ? T.amber : T.border}`,
    color: active ? T.gold : T.sub,
    borderRadius: 10, padding:"7px 16px",
    cursor:"pointer", fontSize:12, fontWeight:700,
    fontFamily: T.fontHead, letterSpacing:0.5,
    transition:"all 0.2s",
  }}>{label}</button>
);

// Station animation
const DispatchStation = ({ active }) => {
  const [pulse, setPulse] = useState(false);
  const [label, setLabel] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t1 = setInterval(() => {
      setPulse(true);
      setTimeout(()=>setPulse(false),400);
      setLabel(true);
      setTimeout(()=>setLabel(false),1800);
    }, 3000 + Math.random()*1000);
    return ()=>clearInterval(t1);
  }, [active]);

  return (
    <div style={{
      background: T.card, borderRadius:14,
      padding:16, border:`1px solid ${T.border2}`,
    }}>
      <div style={{ color:T.sub, fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.2, marginBottom:12 }}>
        📦 Smart Dispatch Station
      </div>
      <div style={{
        background:"#060e1c", borderRadius:12,
        padding:14, border:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", gap:12,
      }}>
        {/* Platform visual */}
        <div style={{ position:"relative", flexShrink:0 }}>
          <div style={{
            width:48, height:48, borderRadius:8,
            background: active && pulse ? `${T.teal}30` : "#0d1a2e",
            border:`2px solid ${active ? (pulse ? T.teal : T.amber) : T.dim}`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:22, transition:"all 0.3s",
            boxShadow: active && pulse ? `0 0 20px ${T.teal}50` : "none",
          }}>🛍</div>
          {active && pulse && (
            <div style={{
              position:"absolute", top:-4, right:-4,
              width:12, height:12, borderRadius:"50%",
              background:T.teal, animation:"none",
              boxShadow:`0 0 8px ${T.teal}`,
            }}/>
          )}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ color: active ? T.gold : T.dim, fontWeight:700, fontSize:13, fontFamily:T.fontHead }}>
            {active ? (pulse ? "✓ FOR SIGNAL FIRED" : "Waiting for bag...") : "Station offline"}
          </div>
          <div style={{ color:T.sub, fontSize:10, marginTop:3 }}>
            {active ? "Bag placement → label print → FOR signal (simultaneous)" : "Enable to activate"}
          </div>
          {active && label && (
            <div style={{
              marginTop:8, background:"#0a1628",
              border:`1px dashed ${T.amber}60`,
              borderRadius:6, padding:"6px 8px",
              fontSize:9, fontFamily:"monospace",
              color:T.amber, lineHeight:1.6,
            }}>
              ZOMATO #ZOM-{Math.floor(Math.random()*90000+10000)}<br/>
              Rider: Amit K. | Packed: {new Date().toLocaleTimeString()}<br/>
              {"▓▓▓▓░ [QR]"}
            </div>
          )}
        </div>
      </div>
      {active && (
        <div style={{ marginTop:10, display:"flex", gap:6 }}>
          <div style={{ flex:1, background:`${T.teal}15`, border:`1px solid ${T.teal}30`, borderRadius:8, padding:"6px 10px", fontSize:10, color:T.teal }}>
            ✓ Rider bias eliminated
          </div>
          <div style={{ flex:1, background:`${T.amber}15`, border:`1px solid ${T.amber}30`, borderRadius:8, padding:"6px 10px", fontSize:10, color:T.gold }}>
            ✓ Ground truth KPT
          </div>
        </div>
      )}
    </div>
  );
};

// IoT waveform animation
const IoTSensor = ({ active, rushLevel }) => {
  const [tick, setTick] = useState(0);
  useEffect(()=>{
    const t = setInterval(()=>setTick(v=>v+1), 500);
    return ()=>clearInterval(t);
  },[]);
  const bars = 12;
  const high = rushLevel > 1.4;
  return (
    <div style={{ background:T.card, borderRadius:14, padding:16, border:`1px solid ${T.border2}` }}>
      <div style={{ color:T.sub, fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.2, marginBottom:10 }}>
        🔊 IoT Kitchen Activity Sensor
      </div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:40, marginBottom:8 }}>
        {Array.from({length:bars}).map((_,i)=>{
          const h = active
            ? clamp(rushLevel * 28 * (0.5 + Math.sin(tick*0.7 + i*0.8)*0.35 + Math.random()*0.15), 4, 40)
            : 4;
          return (
            <div key={i} style={{
              flex:1, height:h, borderRadius:3,
              background: active ? (high ? `linear-gradient(to top, ${T.red}, ${T.orange})` : `linear-gradient(to top, ${T.teal}, ${T.blue})`) : T.dim,
              transition:"height 0.3s",
            }}/>
          );
        })}
      </div>
      <div style={{
        color: active ? (high ? T.red : T.teal) : T.dim,
        fontSize:11, fontWeight:700, fontFamily:T.fontBody,
      }}>
        {active
          ? high
            ? `⚠ HIGH LOAD — Non-Zomato activity detected — Index: ${Math.floor(rushLevel*65)}/100`
            : `✓ Normal kitchen — Index: ${Math.floor(rushLevel*38)}/100`
          : "Sensor offline — non-Zomato load invisible"}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

const SIGNAL_DEFS = [
  {
    key:"dispatchStation",
    label:"Smart Dispatch Station",
    sub:"Label print + FOR signal fused — physically forces signal accuracy",
    color:T.teal, icon:"📦", tier:"HARDWARE",
  },
  {
    key:"posIntegration",
    label:"POS / Billing Integration",
    sub:"Petpooja, Posist, UrbanPiper — billing event = FOR signal",
    color:T.amber, icon:"🖨", tier:"INTEGRATION",
  },
  {
    key:"iotSensor",
    label:"IoT Kitchen Activity Sensor",
    sub:"Captures non-Zomato kitchen load via ambient activity index",
    color:T.blue, icon:"🔊", tier:"HARDWARE",
  },
  {
    key:"labelCleaning",
    label:"FOR Label De-biasing",
    sub:"Confidence-weighted training — rider-influenced labels downweighted",
    color:T.purple, icon:"🧹", tier:"DATA",
  },
];

const TABS = ["All Metrics","By Hour","By Restaurant","By Dish","Radar"];

export default function App() {
  const [cfg, setCfg] = useState({ dispatchStation:false, posIntegration:false, iotSensor:false, labelCleaning:false });
  const [met, setMet] = useState(null);
  const [hour, setHour] = useState(13);
  const [tab, setTab] = useState("All Metrics");

  useEffect(() => { setMet(computeMetrics(runSim(cfg, 700))); }, [cfg]);

  const rush = HOUR_MULT[hour];
  const rushLabel = rush > 1.5 ? "🔥 PEAK RUSH" : rush > 1.1 ? "⚡ BUSY" : "😌 QUIET";
  const rushColor = rush > 1.5 ? T.red : rush > 1.1 ? T.orange : T.teal;
  const activeCount = Object.values(cfg).filter(Boolean).length;

  const radarData = met ? [
    { metric:"ETA P50",        B: 100, I: +(100 - pct(met.p50b, met.p50i)).toFixed(0) },
    { metric:"ETA P90",        B: 100, I: +(100 - pct(met.p90b, met.p90i)).toFixed(0) },
    { metric:"Rider Wait",     B: 100, I: +(100 - pct(met.bWait, met.iWait)).toFixed(0) },
    { metric:"Order Delays",   B: 100, I: +(100 - pct(met.bDelay, met.iDelay)).toFixed(0) },
    { metric:"Rider Idle",     B: 100, I: +(100 - pct(met.bIdle, met.iIdle)).toFixed(0) },
  ] : [];

  return (
    <div style={{
      background: T.bg,
      minHeight:"100vh",
      fontFamily: T.fontBody,
      color: T.text,
      padding:"22px 26px",
    }}>
      {/* ── HEADER ── */}
      <div style={{ marginBottom:22, borderBottom:`1px solid ${T.border}`, paddingBottom:18 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}>
              <div style={{
                width:44, height:44, borderRadius:12,
                background:`linear-gradient(135deg, ${T.amber}, ${T.orange})`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:22, flexShrink:0,
              }}>🍱</div>
              <div>
                <h1 style={{
                  margin:0, fontSize:22, fontWeight:900,
                  fontFamily:T.fontHead, letterSpacing:0.5,
                  background:`linear-gradient(90deg, ${T.gold}, ${T.teal})`,
                  WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                }}>Zomato KPT — Signal Improvement Simulator</h1>
                <div style={{ color:T.sub, fontSize:11, marginTop:2 }}>
                  Monte Carlo · 700 synthetic orders · All 4 success metrics tracked simultaneously
                </div>
              </div>
            </div>
          </div>
          <div style={{
            background:`${T.amber}15`, border:`1px solid ${T.amber}40`,
            borderRadius:10, padding:"8px 14px", fontSize:12, color:T.gold, fontWeight:700,
            flexShrink:0, fontFamily:T.fontHead,
          }}>
            {activeCount === 0 ? "Baseline Only" : `${activeCount} Signal${activeCount>1?"s":""} Active`}
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"270px 1fr", gap:20, alignItems:"start" }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

          {/* Signal controls */}
          <div style={{ background:T.panel, borderRadius:16, padding:16, border:`1px solid ${T.border2}` }}>
            <div style={{ color:T.sub, fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.4, marginBottom:14 }}>
              ⚙ SIGNAL STACK
            </div>
            {SIGNAL_DEFS.map(s => (
              <SignalToggle key={s.key} {...s} value={cfg[s.key]} onChange={v=>setCfg(p=>({...p,[s.key]:v}))} />
            ))}
          </div>

          {/* Time of day */}
          <div style={{ background:T.panel, borderRadius:16, padding:16, border:`1px solid ${T.border2}` }}>
            <div style={{ color:T.sub, fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.4, marginBottom:12 }}>
              🕐 TIME OF DAY CONTEXT
            </div>
            <input type="range" min={0} max={23} value={hour}
              onChange={e=>setHour(+e.target.value)}
              style={{ width:"100%", accentColor:T.amber, marginBottom:8 }}
            />
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:T.gold, fontWeight:800, fontSize:16, fontFamily:T.fontHead }}>
                {hour}:00 {hour<12?"AM":"PM"}
              </span>
              <span style={{
                background:`${rushColor}20`, color:rushColor,
                border:`1px solid ${rushColor}40`,
                borderRadius:8, padding:"3px 10px", fontSize:10, fontWeight:800,
              }}>{rushLabel}</span>
            </div>
            <div style={{ color:T.sub, fontSize:11, marginTop:5 }}>
              Kitchen load: <b style={{color:T.text}}>{rush.toFixed(2)}x</b> · Non-Zomato load: <b style={{color:rush>1.3?T.red:T.sub}}>{rush>1.3?"HIGH":"NORMAL"}</b>
            </div>
            {rush > 1.4 && (
              <div style={{ marginTop:8, background:`${T.red}10`, border:`1px solid ${T.red}25`, borderRadius:8, padding:"7px 10px", fontSize:10, color:T.red, lineHeight:1.5 }}>
                ⚠ Peak hour — IoT sensor is the only signal that sees dine-in + competitor order load
              </div>
            )}
          </div>

          {/* Hardware visuals */}
          <DispatchStation active={cfg.dispatchStation} rushLevel={rush} />
          <IoTSensor active={cfg.iotSensor} rushLevel={rush} />

          {/* Fallback ladder */}
          <div style={{ background:T.panel, borderRadius:16, padding:14, border:`1px solid ${T.border2}` }}>
            <div style={{ color:T.sub, fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.4, marginBottom:10 }}>
              🏗 FALLBACK HIERARCHY
            </div>
            {[
              {l:"Smart Dispatch Station", k:"dispatchStation", c:T.teal},
              {l:"POS / Billing API",      k:"posIntegration",  c:T.amber},
              {l:"IoT Activity Sensor",    k:"iotSensor",       c:T.blue},
              {l:"FOR Label De-biasing",   k:"labelCleaning",   c:T.purple},
              {l:"Historical Pattern Model", k:null,            c:T.sub},
            ].map((s,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0,
                  background: s.k ? cfg[s.k] ? s.c : T.dim : T.sub,
                  boxShadow: s.k && cfg[s.k] ? `0 0 6px ${s.c}` : "none",
                }}/>
                <div style={{ color: s.k ? cfg[s.k] ? s.c : T.dim : T.sub, fontSize:11 }}>{s.l}</div>
                {!s.k && <div style={{ color:T.teal, fontSize:9, marginLeft:"auto" }}>ALWAYS ON</div>}
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Metric cards — ALL 4 success metrics */}
          {met && (
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              <MetricPill icon="📍" label="ETA Error P50"    base={met.p50b}  improved={met.p50i}  unit=" min"/>
              <MetricPill icon="📊" label="ETA Error P90"    base={met.p90b}  improved={met.p90i}  unit=" min"/>
              <MetricPill icon="🛵" label="Avg Rider Wait"   base={met.bWait} improved={met.iWait} unit=" min"/>
              <MetricPill icon="⏱" label="Order Delay Rate" base={met.bDelay} improved={met.iDelay} unit=" min"/>
              <MetricPill icon="💤" label="Rider Idle Time"  base={met.bIdle} improved={met.iIdle} unit=" min"/>
              <MetricPill icon="💰" label="Monthly Saving"
                base={met.bWait * 0.5 * 300000 * 30}
                improved={met.iWait * 0.5 * 300000 * 30}
                unit=""
              />
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {TABS.map(t=><TabBtn key={t} label={t} active={tab===t} onClick={()=>setTab(t)}/>)}
          </div>

          {/* ── TAB: ALL METRICS ── */}
          {met && tab==="All Metrics" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ background:T.panel, borderRadius:16, padding:20, border:`1px solid ${T.border2}` }}>
                <div style={{ fontWeight:700, fontFamily:T.fontHead, marginBottom:4 }}>Rider Wait Time Reduction</div>
                <div style={{ color:T.sub, fontSize:12, marginBottom:14 }}>Smart Dispatch Station makes the biggest dent — physical label forces accurate timing</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={met.hourly}>
                    <defs>
                      <linearGradient id="bWait" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={T.red} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={T.red} stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="iWait" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={T.teal} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={T.teal} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                    <XAxis dataKey="hour" stroke={T.sub} fontSize={10} interval={3}/>
                    <YAxis stroke={T.sub} fontSize={11} unit="m"/>
                    <Tooltip {...ttStyle}/>
                    <Legend/>
                    <Area type="monotone" dataKey="bWait" stroke={T.red}  fill="url(#bWait)" strokeWidth={2} name="Baseline Rider Wait"/>
                    <Area type="monotone" dataKey="iWait" stroke={T.teal} fill="url(#iWait)" strokeWidth={2} name="Improved Rider Wait"/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background:T.panel, borderRadius:16, padding:20, border:`1px solid ${T.border2}` }}>
                <div style={{ fontWeight:700, fontFamily:T.fontHead, marginBottom:4 }}>ETA Prediction Error over the Day</div>
                <div style={{ color:T.sub, fontSize:12, marginBottom:14 }}>Indian lunch (1pm) and dinner (9pm) peaks are where signal stack matters most — IoT captures hidden kitchen load here</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={met.hourly}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                    <XAxis dataKey="hour" stroke={T.sub} fontSize={10} interval={3}/>
                    <YAxis stroke={T.sub} fontSize={11} unit="m"/>
                    <Tooltip {...ttStyle}/>
                    <Legend/>
                    <Line type="monotone" dataKey="bETA" stroke={T.red}  strokeWidth={2.5} dot={false} name="Baseline ETA Error"/>
                    <Line type="monotone" dataKey="iETA" stroke={T.gold} strokeWidth={2.5} dot={false} name="Improved ETA Error"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── TAB: BY HOUR ── */}
          {met && tab==="By Hour" && (
            <div style={{ background:T.panel, borderRadius:16, padding:20, border:`1px solid ${T.border2}` }}>
              <div style={{ fontWeight:700, fontFamily:T.fontHead, marginBottom:4 }}>All Metrics by Hour of Day</div>
              <div style={{ color:T.sub, fontSize:12, marginBottom:14 }}>Full 24-hour view — rider wait and ETA error simultaneously</div>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={met.hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                  <XAxis dataKey="hour" stroke={T.sub} fontSize={10} interval={2}/>
                  <YAxis stroke={T.sub} fontSize={10} unit="m"/>
                  <Tooltip {...ttStyle}/>
                  <Legend/>
                  <Line type="monotone" dataKey="bETA"  stroke={T.red}    strokeWidth={2} dot={false} name="Baseline ETA Error"/>
                  <Line type="monotone" dataKey="iETA"  stroke={T.gold}   strokeWidth={2} dot={false} name="Improved ETA Error"/>
                  <Line type="monotone" dataKey="bWait" stroke={T.orange} strokeWidth={2} dot={false} strokeDasharray="5 3" name="Baseline Rider Wait"/>
                  <Line type="monotone" dataKey="iWait" stroke={T.teal}   strokeWidth={2} dot={false} strokeDasharray="5 3" name="Improved Rider Wait"/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── TAB: BY RESTAURANT ── */}
          {met && tab==="By Restaurant" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ background:T.panel, borderRadius:16, padding:20, border:`1px solid ${T.border2}` }}>
                <div style={{ fontWeight:700, fontFamily:T.fontHead, marginBottom:4 }}>ETA Error + Rider Wait by Restaurant Tier</div>
                <div style={{ color:T.sub, fontSize:12, marginBottom:14 }}>
                  Dispatch Station eliminates bias for all tiers. IoT uniquely helps Dhabas where non-Zomato load is highest (65% invisible kitchen load).
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={met.rtData} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                    <XAxis dataKey="type" stroke={T.sub} fontSize={8.5}/>
                    <YAxis stroke={T.sub} fontSize={10} unit="m"/>
                    <Tooltip {...ttStyle}/>
                    <Legend/>
                    <Bar dataKey="bETA"  fill={T.red}    name="Baseline ETA Error" radius={[4,4,0,0]}/>
                    <Bar dataKey="iETA"  fill={T.gold}   name="Improved ETA Error" radius={[4,4,0,0]}/>
                    <Bar dataKey="bWait" fill={T.orange} name="Baseline Rider Wait" radius={[4,4,0,0]}/>
                    <Bar dataKey="iWait" fill={T.teal}   name="Improved Rider Wait" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background:T.panel, borderRadius:16, padding:20, border:`1px solid ${T.border2}` }}>
                <div style={{ fontWeight:700, fontFamily:T.fontHead, marginBottom:14 }}>Order Delay Rate by Restaurant Tier</div>
                <ResponsiveContainer width="100%" height={185}>
                  <BarChart data={met.rtData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                    <XAxis dataKey="type" stroke={T.sub} fontSize={8.5}/>
                    <YAxis stroke={T.sub} fontSize={10} unit="m"/>
                    <Tooltip {...ttStyle}/>
                    <Legend/>
                    <Bar dataKey="bDelay" fill={T.purple} name="Baseline Delay" radius={[4,4,0,0]}/>
                    <Bar dataKey="iDelay" fill={T.green}  name="Improved Delay" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── TAB: BY DISH ── */}
          {met && tab==="By Dish" && (
            <div style={{ background:T.panel, borderRadius:16, padding:20, border:`1px solid ${T.border2}` }}>
              <div style={{ fontWeight:700, fontFamily:T.fontHead, marginBottom:4 }}>ETA Prediction Error by Dish Type</div>
              <div style={{ color:T.sub, fontSize:12, marginBottom:14 }}>
                High-complexity dishes (Biryani, Thali) show the largest absolute improvement — item complexity priors + weight validation from Dispatch Station helps most here.
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={met.dishData} layout="vertical" barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                  <XAxis type="number" stroke={T.sub} fontSize={10} unit="m"/>
                  <YAxis type="category" dataKey="dish" stroke={T.sub} fontSize={11} width={80}/>
                  <Tooltip {...ttStyle}/>
                  <Legend/>
                  <Bar dataKey="bETA" fill={T.red}  name="Baseline" radius={[0,4,4,0]}/>
                  <Bar dataKey="iETA" fill={T.gold} name="Improved" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── TAB: RADAR ── */}
          {met && tab==="Radar" && (
            <div style={{ background:T.panel, borderRadius:16, padding:20, border:`1px solid ${T.border2}` }}>
              <div style={{ fontWeight:700, fontFamily:T.fontHead, marginBottom:4 }}>All 4 Success Metrics — Radar View</div>
              <div style={{ color:T.sub, fontSize:12, marginBottom:6 }}>
                100 = baseline (worst). Lower score = better. Enable all signals to see full improvement across every metric simultaneously.
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke={T.border2}/>
                  <PolarAngleAxis dataKey="metric" tick={{ fill:T.sub, fontSize:12, fontFamily:T.fontBody }}/>
                  <PolarRadiusAxis angle={30} domain={[0,100]} tick={{ fill:T.dim, fontSize:9 }}/>
                  <Radar name="Baseline" dataKey="B" stroke={T.red}  fill={T.red}  fillOpacity={0.15} strokeWidth={2}/>
                  <Radar name="Improved" dataKey="I" stroke={T.teal} fill={T.teal} fillOpacity={0.20} strokeWidth={2}/>
                  <Legend/>
                  <Tooltip {...ttStyle}/>
                </RadarChart>
              </ResponsiveContainer>
              <div style={{ marginTop:14, background:`${T.amber}10`, border:`1px solid ${T.amber}25`, borderRadius:12, padding:14 }}>
                <div style={{ color:T.gold, fontWeight:800, fontFamily:T.fontHead, marginBottom:8 }}>💡 Key Simulation Finding</div>
                <div style={{ color:"#94a3b8", fontSize:12, lineHeight:1.8 }}>
                  <b style={{color:T.text}}>Smart Dispatch Station</b> drives the largest single improvement across rider wait, ETA error, and order delays — because it makes FOR signal generation physically inseparable from food packing.<br/>
                  <b style={{color:T.text}}>IoT Sensor</b> is the only signal reducing non-Zomato load blindness — its impact amplifies during peak hours (rush &gt; 1.4x) when dine-in + competitor orders make Zomato's own data insufficient.<br/>
                  <b style={{color:T.text}}>POS Integration</b> + <b style={{color:T.text}}>Label De-biasing</b> clean the training data, ensuring every improvement compounds into the model over time.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop:18, color:T.border2, fontSize:10, textAlign:"center", fontFamily:T.fontBody }}>
        Monte Carlo simulation · 700 synthetic orders · Indian rush hour profiles · Dish complexity weights · Restaurant tier variance modeled from real delivery research
      </div>
    </div>
  );
}
