import { useState, useEffect, useRef, useCallback } from "react";

const LANE_COUNT = 3;
const LANE_W = 100 / LANE_COUNT;
const CAR_BOTTOM = 14;
const HIT_ZONE_Y = 0.83;
const SPEEDS = [20,30,40,50,60,70,80,90,100,110,120,130];

// Pace stays fixed for the whole run — full challenge from the very first sign,
// no ramp-up. Consistency, not escalation, is what makes it demanding.
const TRAVEL_TIME = 1.8;
const SPAWN_INTERVAL = 1.2;
function getTravelTime() { return TRAVEL_TIME; }
function getSpawnInterval() { return SPAWN_INTERVAL; }
function pickCarSpeed(exclude) { const pool = SPEEDS.filter(s => s !== exclude); return pool[Math.floor(Math.random() * pool.length)]; }

// In-memory high score (localStorage is not available in the artifact sandbox).
// This resets when the artifact is reloaded, but persists across rounds in a session.
const HS_KEY = "speedlane:highscore";

let _ctx = null;
function ac() { if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)(); if (_ctx.state === "suspended") _ctx.resume(); return _ctx; }
function tone(f, type, dur, vol = 0.25, delay = 0) { try { const c = ac(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.001, c.currentTime + delay); g.gain.linearRampToValueAtTime(vol, c.currentTime + delay + 0.012); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur); o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur + 0.06); } catch(e) {} }

// WHISTLE LOGO — a shared 4-note motif (C5-D5-E5-G5) layered into all three sounds
// below so they share one recognizable signature. Sine wave, 5.5Hz vibrato at depth 8,
// 0.03s attack to 0.55 gain, 0.04s release, each note 0.11s long.
const WHISTLE_NOTES = [523.25, 587.33, 659.25, 783.99]; // C5 D5 E5 G5
function whistleNote(freq, startTime, dur) {
  try {
    const c = ac();
    const osc = c.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);
    const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 5.5;
    const lfoGain = c.createGain(); lfoGain.gain.value = 8;
    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.linearRampToValueAtTime(0.55, startTime + 0.03);
    g.gain.setValueAtTime(0.55, startTime + Math.max(0.03, dur - 0.04));
    g.gain.linearRampToValueAtTime(0.0001, startTime + dur);
    osc.connect(g); g.connect(c.destination);
    lfo.start(startTime); lfo.stop(startTime + dur + 0.05);
    osc.start(startTime); osc.stop(startTime + dur + 0.05);
  } catch(e) {}
}
function playWhistle(startDelay, spacing) {
  const c = ac();
  const t0 = c.currentTime + startDelay;
  WHISTLE_NOTES.forEach((f, i) => whistleNote(f, t0 + i * spacing, 0.11));
}

// Lane-change sound — a bandpass noise whoosh with the whistle logo layered inside it.
function gearShift() {
  const DUR = 0.3;
  try {
    const c = ac();
    const t0 = c.currentTime;

    // Whoosh: white noise -> bandpass, swept 900Hz -> 3200Hz over 0.3s
    const n = Math.floor(c.sampleRate * DUR);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const bd = buf.getChannelData(0);
    for (let i = 0; i < n; i++) bd[i] = Math.random() * 2 - 1;
    const noiseSrc = c.createBufferSource(); noiseSrc.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1;
    bp.frequency.setValueAtTime(900, t0);
    bp.frequency.linearRampToValueAtTime(3200, t0 + DUR);
    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t0);
    noiseGain.gain.linearRampToValueAtTime(0.7, t0 + 0.03);
    noiseGain.gain.setValueAtTime(0.7, t0 + DUR - 0.05);
    noiseGain.gain.linearRampToValueAtTime(0.0001, t0 + DUR);
    noiseSrc.connect(bp); bp.connect(noiseGain); noiseGain.connect(c.destination);
    noiseSrc.start(t0); noiseSrc.stop(t0 + DUR);
  } catch(e) {}
  // Whistle logo, offset 0.06s inside the whoosh
  playWhistle(0.06, 0.13);
}
const SFX = { correct() {
    const DUR = 0.35;
    try {
      const c = ac();
      const t0 = c.currentTime;
      const V = 125;      // 450 km/h in m/s
      const C_SOUND = 343;
      const N = 64;

      // Doppler curve per the flyby formula: d(t)=sqrt((v*t)^2+16), vr=v*(v*t)/d,
      // doppler=343/(343-vr) clamped 0.6-2.8 — same geometry used before, now driving
      // a single bandpass "wind" layer centered around 2800Hz instead of two noise beds.
      const bpFreqCurve = new Float32Array(N);
      const windGainCurve = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = -DUR / 2 + (DUR * i) / (N - 1);
        const d = Math.sqrt((V * t) * (V * t) + 16);
        const vr = (V * (V * t)) / d;
        let doppler = C_SOUND / (C_SOUND - vr);
        doppler = Math.max(0.6, Math.min(2.8, doppler));
        bpFreqCurve[i] = 2800 * doppler;
        windGainCurve[i] = 0.9 * (4 / d);
      }

      // Doppler wind: white noise -> bandpass riding the shifted center frequency
      const n = Math.floor(c.sampleRate * DUR);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const bd = buf.getChannelData(0);
      for (let i = 0; i < n; i++) bd[i] = Math.random() * 2 - 1;
      const windSrc = c.createBufferSource(); windSrc.buffer = buf;
      const windBP = c.createBiquadFilter(); windBP.type = "bandpass"; windBP.Q.value = 1.4;
      windBP.frequency.setValueCurveAtTime(bpFreqCurve, t0, DUR);
      const windGain = c.createGain();
      windGain.gain.setValueCurveAtTime(windGainCurve, t0, DUR);
      windSrc.connect(windBP); windBP.connect(windGain); windGain.connect(c.destination);
      windSrc.start(t0); windSrc.stop(t0 + DUR);

      // 48Hz thump at center, 0.12s decay
      const centerT = t0 + DUR / 2;
      const thumpOsc = c.createOscillator(); thumpOsc.type = "sine"; thumpOsc.frequency.value = 48;
      const thumpGain = c.createGain();
      thumpGain.gain.setValueAtTime(0.0001, centerT);
      thumpGain.gain.linearRampToValueAtTime(0.8, centerT + 0.005);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, centerT + 0.12);
      thumpOsc.connect(thumpGain); thumpGain.connect(c.destination);
      thumpOsc.start(centerT); thumpOsc.stop(centerT + 0.14);
    } catch(e) {}
    // Whistle logo, super quick 0.07s spacing, right at the closest-approach moment
    playWhistle(DUR / 2, 0.07);
  }, wrong() { tone(180,"sawtooth",0.18,0.32); tone(120,"sawtooth",0.22,0.28,0.13); }, pass() { tone(440,"sine",0.04,0.05); }, gearShift() { gearShift(); }, speedChange() { tone(660,"sine",0.06,0.14); tone(880,"sine",0.08,0.12,0.08); }, over() {
    try {
      const c = ac();
      const t0 = c.currentTime;

      // Final long whistle: G5 (783.99Hz) sweeping down to 196Hz over 0.7s, starting
      // right after the motif below finishes (motif ends around 0.66+0.11=0.77s).
      const finalStart = t0 + 0.8;
      const finalDur = 0.7;
      const osc = c.createOscillator(); osc.type = "sine";
      osc.frequency.setValueAtTime(783.99, finalStart);
      osc.frequency.exponentialRampToValueAtTime(196, finalStart + finalDur);
      const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 5.5;
      const lfoGain = c.createGain(); lfoGain.gain.value = 8;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, finalStart);
      g.gain.linearRampToValueAtTime(0.55, finalStart + 0.03);
      g.gain.setValueAtTime(0.5, finalStart + finalDur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, finalStart + finalDur);
      osc.connect(g); g.connect(c.destination);
      lfo.start(finalStart); lfo.stop(finalStart + finalDur + 0.05);
      osc.start(finalStart); osc.stop(finalStart + finalDur + 0.05);

      // Wind tail: noise, lowpass 1000Hz, trailing under/after the final whistle
      const tailDur = 0.9;
      const n = Math.floor(c.sampleRate * tailDur);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const bd = buf.getChannelData(0);
      for (let i = 0; i < n; i++) bd[i] = Math.random() * 2 - 1;
      const noiseSrc = c.createBufferSource(); noiseSrc.buffer = buf;
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1000;
      const windGain = c.createGain();
      windGain.gain.setValueAtTime(0.0001, finalStart);
      windGain.gain.linearRampToValueAtTime(0.3, finalStart + 0.1);
      windGain.gain.linearRampToValueAtTime(0.0001, finalStart + tailDur);
      noiseSrc.connect(lp); lp.connect(windGain); windGain.connect(c.destination);
      noiseSrc.start(finalStart); noiseSrc.stop(finalStart + tailDur);
    } catch(e) {}
    // Whistle motif, slow 0.22s spacing, right at the start
    playWhistle(0, 0.22);
  }, };

function CarSVG({ glow, lean = 0 }) {
  const gc = glow === "good" ? "#00e676" : glow === "bad" ? "#ff1744" : null;
  return (
    <svg width="50" height="86" viewBox="0 0 52 90" fill="none" shapeRendering="geometricPrecision" style={{ transition: "transform 0.18s", transform: `rotate(${180 + lean * 4}deg)`, display: "block" }}>
      <ellipse cx="26" cy="86" rx="18" ry="3.8" fill="rgba(20,10,50,0.35)" />
      <path d="M8 18 Q8 10 15 9 L37 9 Q44 10 44 18 L44 73 Q44 80 37 82 L15 82 Q8 80 8 73 Z" fill="#00bfa5" />
      <path d="M8 20 Q8 12 14 10 L14 78 Q8 76 8 71 Z" fill="rgba(255,255,255,0.12)" />
      <path d="M44 20 Q44 12 38 10 L38 78 Q44 76 44 71 Z" fill="rgba(0,0,0,0.12)" />
      <path d="M13 27 Q13 21 18 20 L34 20 Q39 21 39 27 L39 50 Q39 56 34 57 L18 57 Q13 56 13 50 Z" fill="#181233" />
      <path d="M15 28 Q26 23 37 28 L35 48 Q26 51 17 48 Z" fill="#241b4a" />
      <path d="M18 29 L21 28 L20 46 L17 47 Z" fill="rgba(255,255,255,0.14)" />
      <path d="M23 27 L26 26 L25 47 L22 48 Z" fill="rgba(255,255,255,0.07)" />
      <path d="M17 58 Q26 62 35 58 L34 65 Q26 68 18 65 Z" fill="#181233" />
      <path d="M11 9 Q11 5 15 5 L37 5 Q41 5 41 9 L41 13 L11 13 Z" fill="#00806f" />
      <rect x="19" y="5.5" width="14" height="5" rx="1.5" fill="#1a1a1a" />
      <rect x="20" y="6.5" width="5" height="3" rx="0.5" fill="#2a2a2a" />
      <rect x="27" y="6.5" width="5" height="3" rx="0.5" fill="#2a2a2a" />
      <path d="M11 7 Q11 5 14 5 L19 5 L19 12 L11 12 Z" fill="#fffde7" />
      <path d="M41 7 Q41 5 38 5 L33 5 L33 12 L41 12 Z" fill="#fffde7" />
      <ellipse cx="15" cy="8.5" rx="3" ry="2.5" fill="#ffd23f" />
      <ellipse cx="37" cy="8.5" rx="3" ry="2.5" fill="#ffd23f" />
      <ellipse cx="15" cy="8.5" rx="4.5" ry="3.5" fill="#ffe9a3" opacity="0.4" />
      <ellipse cx="37" cy="8.5" rx="4.5" ry="3.5" fill="#ffe9a3" opacity="0.4" />
      <path d="M11 78 L41 78 L41 83 Q41 86 37 86 L15 86 Q11 86 11 83 Z" fill="#00806f" />
      <path d="M11 76 L11 81 L17 81 L17 74 Z" fill="#ff5da2" />
      <path d="M41 76 L41 81 L35 81 L35 74 Z" fill="#ff5da2" />
      <rect x="12" y="76" width="4" height="4.5" rx="1" fill="#ffa8cf" opacity="0.9" />
      <rect x="36" y="76" width="4" height="4.5" rx="1" fill="#ffa8cf" opacity="0.9" />
      <rect x="14" y="83" width="6" height="3" rx="1.5" fill="#555" />
      <rect x="32" y="83" width="6" height="3" rx="1.5" fill="#555" />
      {[[2,13],[40,13],[2,60],[40,60]].map(([wx,wy],i) => (<g key={i}><rect x={wx} y={wy} width="10" height="16" rx="3" fill="#1a1a1a" /><rect x={wx+1.5} y={wy+1.5} width="7" height="13" rx="2" fill="#252525" /><ellipse cx={wx+5} cy={wy+8} rx="3" ry="3" fill="#333" /><ellipse cx={wx+5} cy={wy+8} rx="1.3" ry="1.3" fill="#505050" /><line x1={wx+5} y1={wy+5} x2={wx+5} y2={wy+11} stroke="#444" strokeWidth="1" /><line x1={wx+2} y1={wy+8} x2={wx+8} y2={wy+8} stroke="#444" strokeWidth="1" /></g>))}
      <path d="M19 14 Q26 12 33 14 L32 20 Q26 18 20 20 Z" fill="rgba(0,0,0,0.14)" />
      <rect x="21" y="15" width="4.5" height="2" rx="1" fill="rgba(0,0,0,0.3)" />
      <rect x="27" y="15" width="4.5" height="2" rx="1" fill="rgba(0,0,0,0.3)" />
      <path d="M8 26 L4 28 L4 32 L8 31 Z" fill="#ff5da2" />
      <path d="M44 26 L48 28 L48 32 L44 31 Z" fill="#ff5da2" />
      <rect x="25" y="20" width="1.5" height="7" fill="#555" />
    </svg>
  );
}

function SpeedSign({ speed, state }) {
  const numCol = state === "correct" ? "#00c853" : state === "wrong" ? "#cc0000" : "#111";
  const ringCol = state === "correct" ? "#00e676" : state === "wrong" ? "#ff1744" : "rgba(255,178,64,0.4)";
  const ringW = state ? 5 : 2.5;
  const fs = speed >= 100 ? 26 : 30;
  return (
    <div style={{ position: "relative", width: 66, height: 88 }}>
      <svg width={66} height={88} viewBox="0 0 66 88" fill="none" shapeRendering="geometricPrecision" style={{ position: "absolute", inset: 0 }}>
        <rect x="30.5" y="64" width="5" height="24" rx="2.5" fill="#b09ad9" />
        <rect x="31" y="64" width="2" height="24" rx="1" fill="rgba(255,255,255,0.2)" />
        <circle cx="33" cy="33" r="32" fill="#e0245a" />
        <circle cx="33" cy="33" r="26" fill="#fff8f0" />
        <circle cx="33" cy="33" r="29" fill="none" stroke={ringCol} strokeWidth={ringW} style={{ transition: "stroke 0.15s, stroke-width 0.15s" }} />
        <path d="M13 17 Q33 9 51 19 Q33 13 13 17 Z" fill="rgba(255,255,255,0.25)" />
      </svg>
      {/* Number sits in a flex column spanning the inner circle's actual bounds (cy=33, r=26,
          i.e. y=7..59 of the 88-tall viewBox) so it centers against the real badge geometry,
          instead of a hand-tuned baseline value carried over from the old SVG <text> layout. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: `${((7 / 88) * 100).toFixed(2)}%`, height: `${((52 / 88) * 100).toFixed(2)}%`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: fs, lineHeight: 1, color: numCol, whiteSpace: "nowrap", transition: "color 0.15s", WebkitFontSmoothing: "antialiased", textRendering: "optimizeLegibility" }}>{speed}</div>
      </div>
    </div>
  );
}

function Road({ dashOffset, blur }) {
  const dH = 5.5, dG = 7.5, tot = dH + dG;
  const dashes = [];
  for (let div = 1; div <= LANE_COUNT - 1; div++) { const x = div * LANE_W; for (let i = -1; i < 14; i++) { const y = (i * tot + dashOffset) % (100 + tot) - tot; dashes.push(<rect key={`${div}-${i}`} x={`${x - 0.38}%`} y={`${y}%`} width="0.76%" height={`${dH}%`} fill="rgba(255,210,64,0.85)" rx="1" />); } }
  return (
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <defs><linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2a1c5c" /><stop offset="55%" stopColor="#301f6e" /><stop offset="100%" stopColor="#180f3d" /></linearGradient>{blur && <filter id="sb"><feGaussianBlur stdDeviation="0 2.2" /></filter>}</defs>
      <rect width="100%" height="100%" fill="url(#road)" filter={blur ? "url(#sb)" : undefined} />
      <rect x="0" width="3" height="100%" fill="rgba(0,230,201,0.4)" />
      <rect x="calc(100% - 3px)" width="3" height="100%" fill="rgba(0,230,201,0.4)" />
      {dashes}
    </svg>
  );
}

function Tree({ x, y, s = 1, v = 0 }) {
  const C = ["#12b88f","#ff5da2","#ffd23f","#8f6bff"]; const r = 16 * s;
  return (<g transform={`translate(${x},${y})`}><ellipse cx={3*s} cy={3*s} rx={r*0.85} ry={r*0.32} fill="rgba(20,10,50,0.3)" /><rect x={-3*s} y={-15*s} width={6*s} height={15*s} rx={3*s} fill="#8a5a34" /><circle cx={0} cy={-15*s} r={r} fill={C[v%4]} /><circle cx={-4*s} cy={-19*s} r={r*0.74} fill={C[v%4]} /><circle cx={3*s} cy={-17*s} r={r*0.62} fill={C[(v+1)%4]} /><circle cx={-1*s} cy={-22*s} r={r*0.46} fill={C[(v+2)%4]} /></g>);
}
function Lamppost({ x, y, s = 1 }) {
  const h = 36 * s;
  return (<g transform={`translate(${x},${y})`}><rect x={-2*s} y={-h} width={4*s} height={h} rx={2*s} fill="#8a7bb8" /><path d={`M0 ${-h} Q${8*s} ${-h} ${10*s} ${-h+6*s}`} stroke="#8a7bb8" strokeWidth={3*s} fill="none" /><ellipse cx={10*s} cy={-h+8*s} rx={7*s} ry={4*s} fill="#ffe66d" /><ellipse cx={10*s} cy={-h+8*s} rx={14*s} ry={9*s} fill="#ff5da2" opacity="0.14" /></g>);
}
function Bush({ x, y, s = 1 }) {
  return (<g transform={`translate(${x},${y})`}><ellipse cx={0} cy={0} rx={12*s} ry={7*s} fill="#0d5c52" /><ellipse cx={-4*s} cy={-3*s} rx={8*s} ry={6*s} fill="#128a72" /><ellipse cx={4*s} cy={-2*s} rx={9*s} ry={5*s} fill="#22b393" /><ellipse cx={0} cy={-4*s} rx={6*s} ry={5*s} fill="#5fe0bd" /></g>);
}
function Scenery({ offset, roadW }) {
  if (!roadW) return null;
  const items = [], sp = 120, n = 12;
  for (let i = 0; i < n; i++) {
    const yL = ((i*sp + offset) % (n*sp+sp)) - sp;
    const yR = ((i*sp + sp*0.52 + offset) % (n*sp+sp)) - sp;
    const sc = 0.65 + (i%3)*0.15, v = i%4, tL = i%6, tR = (i+2)%6;
    if (tL===1) items.push(<Lamppost key={`ll${i}`} x={-26} y={yL} s={sc*0.85} />); else if (tL===3) items.push(<Bush key={`lb${i}`} x={-14} y={yL} s={sc} />); else items.push(<Tree key={`lt${i}`} x={-18} y={yL} s={sc*0.86} v={v} />);
    if (tR===2) items.push(<Lamppost key={`rl${i}`} x={roadW+26} y={yR} s={sc*0.85} />); else if (tR===4) items.push(<Bush key={`rb${i}`} x={roadW+14} y={yR} s={sc} />); else items.push(<Tree key={`rt${i}`} x={roadW+18} y={yR} s={sc*0.86} v={(v+2)%4} />);
  }
  return (<svg width="100%" height="100%" style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"visible" }}><rect x={-roadW} y={-30} width={roadW} height="130%" fill="#180f3d" /><rect x={roadW} y={-30} width={roadW} height="130%" fill="#180f3d" />{items}</svg>);
}

export default function UltraLane() {
  const [phase, setPhase] = useState("intro");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [hsLoaded, setHsLoaded] = useState(false);
  const [newHS, setNewHS] = useState(false);
  const [carLane, setCarLane] = useState(1);
  const [carGlow, setCarGlow] = useState(null);
  const [carLean, setCarLean] = useState(0);
  const [carSpeed, setCarSpeed] = useState(70);
  const [signs, setSigns] = useState([]);
  const [dashOff, setDashOff] = useState(0);
  const [scenOff, setScenOff] = useState(0);
  const [speedBlur, setSpeedBlur] = useState(false);
  const [speedFlash, setSpeedFlash] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const roadRef = useRef(null);
  const [roadW, setRoadW] = useState(0);
  const rafRef = useRef(null);
  const lastTRef = useRef(null);
  const signIdRef = useRef(0);
  const scoreRef = useRef(0);
  const carLaneRef = useRef(1);
  const carSpeedRef = useRef(70);
  const travelRef = useRef(6.0);
  const spawnTimerRef = useRef(1.5);
  const spawnIntRef = useRef(2.2);
  const deadRef = useRef(false);
  const signsRef = useRef([]);
  const isDragRef = useRef(false);
  const gestureStartXRef = useRef(0);
  const gestureUsedRef = useRef(false);
  const [carPunch, setCarPunch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get(HS_KEY, false);
        const n = res ? parseInt(res.value, 10) : 0;
        if (!cancelled && Number.isFinite(n)) setHighScore(prev => Math.max(prev, n));
      } catch (e) {
        // no saved score yet, or storage unavailable — start from 0
      } finally {
        if (!cancelled) setHsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { carLaneRef.current = carLane; }, [carLane]);
  useEffect(() => { carSpeedRef.current = carSpeed; }, [carSpeed]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { if (!roadRef.current) return; const ro = new ResizeObserver(e => setRoadW(e[0].contentRect.width)); ro.observe(roadRef.current); return () => ro.disconnect(); }, []);

  // Auto-pause when the tab/app loses focus or visibility (e.g. swiping up to the
  // app switcher, switching browser tabs, or the screen locking). The game freezes
  // exactly where it is and stays frozen — no ticking, no losing, no signs moving —
  // until the player explicitly taps Resume. It does NOT auto-resume just because
  // the tab becomes visible again, since that could yank the player back into a
  // sign about to hit them with no warning.
  useEffect(() => {
    const pauseGame = () => {
      if (phase === "playing" && !deadRef.current && !pausedRef.current) {
        pausedRef.current = true;
        setPaused(true);
      }
    };
    const onVisibility = () => { if (document.hidden) pauseGame(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pauseGame);
    window.addEventListener("pagehide", pauseGame);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pauseGame);
      window.removeEventListener("pagehide", pauseGame);
    };
  }, [phase]);

  const resumeGame = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
  }, []);

  // Swipe-to-step: each hold-and-drag gesture can move the car by at most ONE lane,
  // no matter how far you drag. Reaching a lane two or more away requires releasing
  // and starting a new swipe, OR just tapping — see endDrag below.
  const STEP_PX = Math.max(20, roadW * (LANE_W / 100) * 0.22);

  const shiftToLane = useCallback((targetLane) => {
    const clamped = Math.max(0, Math.min(LANE_COUNT - 1, targetLane));
    if (clamped === carLaneRef.current) return;
    const dir = clamped > carLaneRef.current ? 1 : -1;
    setCarLean(dir); carLaneRef.current = clamped; setCarLane(clamped); SFX.gearShift();
    setCarPunch(true); setTimeout(() => setCarPunch(false), 140);
  }, []);

  const startDrag = useCallback((clientX) => {
    if (phase !== "playing" || deadRef.current || pausedRef.current) return;
    isDragRef.current = true; gestureUsedRef.current = false; gestureStartXRef.current = clientX;
  }, [phase]);
  const moveDrag = useCallback((clientX) => {
    if (!isDragRef.current || gestureUsedRef.current) return;
    const delta = clientX - gestureStartXRef.current;
    if (Math.abs(delta) < STEP_PX) return;
    shiftToLane(carLaneRef.current + (delta > 0 ? 1 : -1));
    gestureUsedRef.current = true; // lock further movement until this gesture ends
  }, [STEP_PX, shiftToLane]);
  const endDrag = useCallback((clientX) => {
    if (!isDragRef.current) return;
    isDragRef.current = false; gestureUsedRef.current = false; setCarLean(0);
  }, []);

  const spawnSign = useCallback(() => {
    const isMatch = Math.random() < 0.48;
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const speed = isMatch ? carSpeedRef.current : SPEEDS.filter(s => s !== carSpeedRef.current)[Math.floor(Math.random() * (SPEEDS.length - 1))];
    const sign = { id: signIdRef.current++, lane, speed, y: -0.08, state: null };
    const next = [...signsRef.current, sign];
    signsRef.current = next; setSigns(next);
  }, []);

  const tick = useCallback((ts) => {
    if (deadRef.current || pausedRef.current) return;
    if (!lastTRef.current) lastTRef.current = ts;
    const dt = Math.min((ts - lastTRef.current) / 1000, 0.05);
    lastTRef.current = ts;
    const spd = 1 / travelRef.current;
    setDashOff(p => (p + spd * dt * 100 * 1.5) % 13);
    setScenOff(p => p + spd * dt * 620);
    spawnTimerRef.current -= dt;
    if (spawnTimerRef.current <= 0) { spawnSign(); spawnTimerRef.current = spawnIntRef.current; }
    const prev = signsRef.current;
    let newDead = false;
    const updated = prev.map(s => {
      if (s.state !== null) return { ...s, y: s.y + spd * dt };
      const ny = s.y + spd * dt;
      const inLane = carLaneRef.current === s.lane;
      const isMatch = s.speed === carSpeedRef.current;
      if (ny >= HIT_ZONE_Y && s.y < HIT_ZONE_Y) {
        if (isMatch && inLane) {
          SFX.correct(); scoreRef.current += 1; setScore(scoreRef.current); setStreak(st => st + 1); setCarGlow("good"); setTimeout(() => setCarGlow(null), 400);
          const ns = pickCarSpeed(carSpeedRef.current); carSpeedRef.current = ns; setCarSpeed(ns); setSpeedFlash(true); SFX.speedChange(); setTimeout(() => setSpeedFlash(false), 600);
          travelRef.current = getTravelTime(); spawnIntRef.current = getSpawnInterval(); setSpeedBlur(travelRef.current <= 3.0);
          return { ...s, y: ny, state: "correct" };
        } else if (isMatch && !inLane) {
          if (!newDead && !deadRef.current) { newDead = true; SFX.wrong(); setCarGlow("bad"); }
          return { ...s, y: ny, state: "wrong" };
        } else if (!isMatch && inLane) {
          if (!newDead && !deadRef.current) { newDead = true; SFX.wrong(); setCarGlow("bad"); }
          return { ...s, y: ny, state: "wrong" };
        } else { SFX.pass(); return { ...s, y: ny, state: "passed" }; }
      }
      return { ...s, y: ny };
    }).filter(s => s.y < 1.3);
    signsRef.current = updated; setSigns(updated);
    if (newDead && !deadRef.current) {
      deadRef.current = true; SFX.over();
      const survived = scoreRef.current;
      setHighScore(prev => {
        if (survived > prev) {
          setNewHS(true);
          window.storage.set(HS_KEY, String(survived), false).catch(() => {});
          return survived;
        }
        return prev;
      });
      setTimeout(() => setPhase("result"), 1800);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [spawnSign]);

  useEffect(() => {
    if (phase === "playing" && !paused) { lastTRef.current = null; rafRef.current = requestAnimationFrame(tick); }
    return () => { cancelAnimationFrame(rafRef.current); lastTRef.current = null; };
  }, [phase, paused, tick]);

  useEffect(() => {
    if (phase === "playing") {
      scoreRef.current = 0; deadRef.current = false; carLaneRef.current = 1;
      carSpeedRef.current = SPEEDS[Math.floor(Math.random() * SPEEDS.length)];
      travelRef.current = TRAVEL_TIME; spawnTimerRef.current = 1.2; spawnIntRef.current = SPAWN_INTERVAL;
      signsRef.current = []; isDragRef.current = false; pausedRef.current = false;
      setScore(0); setStreak(0); setNewHS(false); setCarLane(1); setCarGlow(null); setCarLean(0); setCarPunch(false); setPaused(false);
      setCarSpeed(carSpeedRef.current); setSigns([]); setSpeedBlur(false); setSpeedFlash(false);
    }
    if (phase !== "playing") { cancelAnimationFrame(rafRef.current); setSigns([]); signsRef.current = []; setSpeedBlur(false); }
  }, [phase]);

  const signScale = y => Math.max(0.25, Math.min(1.1, 0.25 + Math.max(0, y) * 0.95));
  const carXPct = carLane * LANE_W + LANE_W / 2;

  const PAGE_BG = "linear-gradient(160deg, #1b1150 0%, #3a1f6b 42%, #7c2f6e 72%, #ff6f61 100%)";

  if (phase === "intro" || phase === "result") {
    return (
      <div style={{ width:"100%", height:"100vh", background:PAGE_BG, display:"flex", flexDirection:"column", alignItems:"center", fontFamily:"'Trebuchet MS',Arial,sans-serif", overflow:"hidden", userSelect:"none", touchAction:"none", position:"relative" }}>
        <div style={{ position:"absolute", inset:0, opacity:0.22, pointerEvents:"none" }}><Road dashOffset={dashOff} /></div>
        <div style={{ position:"relative", zIndex:10, display:"flex", alignItems:"center", justifyContent:"center", width:"100%", height:"100vh", paddingBottom:"18vh" }}>
          <div style={{ background:"rgba(26,17,60,0.92)", border:"1.5px solid rgba(255,111,97,0.4)", borderRadius:22, padding:"24px 22px 22px", maxWidth:340, width:"92%", display:"flex", flexDirection:"column", alignItems:"center", gap:14, boxShadow:"0 14px 60px rgba(20,8,50,0.7), 0 0 44px rgba(255,93,162,0.18)" }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
              <h1 style={{ backgroundImage:"linear-gradient(135deg,#ffd23f,#ff8f5c,#ff5da2)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", fontSize:46, fontWeight:900, textAlign:"center", margin:0, lineHeight:0.96, letterSpacing:10, whiteSpace:"pre-line", fontFamily:"'Arial Black',Arial,sans-serif", filter:"drop-shadow(0 0 22px rgba(255,111,97,0.4))" }}>{"ULTRA\nLANE"}</h1>
            </div>
            {phase === "result" && (<><p style={{ color:"#b6a6e6", fontSize:12, margin:0, letterSpacing:1.5 }}>{newHS ? "🏆 New High Score!" : "Game over."}</p><div style={{ width:"100%", background:"rgba(255,255,255,0.05)", borderRadius:12, padding:"12px 8px", display:"flex", justifyContent:"space-around" }}>{[["STREAK",`${streak}`],["BEST",highScore]].map(([l,v],i)=>(<div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}><span style={{ color:"#9682cf", fontSize:9, letterSpacing:2, fontWeight:700 }}>{l}</span><span style={{ color:i===1?"#ffd23f":"#fff", fontSize:22, fontWeight:900, fontFamily:"'Arial Black',Arial,sans-serif" }}>{v}</span></div>))}</div></>)}
            {phase === "intro" && (<><p style={{ color:"#b6a6e6", fontSize:12, margin:0, letterSpacing:1.5, textAlign:"center" }}>3 lanes. Drag your car. One chance.</p>{highScore > 0 && <div style={{ display:"flex", alignItems:"baseline", gap:8 }}><span style={{ color:"#9682cf", fontSize:11 }}>BEST STREAK</span><span style={{ color:"#ffd23f", fontSize:24, fontWeight:900, fontFamily:"'Arial Black',Arial,sans-serif" }}>{highScore}</span></div>}</>)}
            <button style={{ background:"linear-gradient(135deg,#ffd23f,#ff8f5c,#ff5da2)", color:"#1b1150", border:"none", borderRadius:14, padding:"15px 0", fontSize:16, fontWeight:900, letterSpacing:3, cursor:"pointer", width:"100%", fontFamily:"'Arial Black',Arial,sans-serif", boxShadow:"0 4px 24px rgba(255,111,97,0.4)" }} onClick={() => setPhase("playing")}>{phase === "result" ? "TRY AGAIN" : "GO"}</button>
          </div>
        </div>
        <div style={{ position:"absolute", left:"50%", bottom:`${CAR_BOTTOM}%`, transform:"translateX(-50%)", zIndex:5 }}>
          <div style={{ borderRadius: 16, boxShadow: "0 4px 14px rgba(20,10,50,0.45)" }}>
            <CarSVG />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width:"100%", height:"100vh", background:PAGE_BG, display:"flex", flexDirection:"column", alignItems:"center", fontFamily:"'Trebuchet MS',Arial,sans-serif", overflow:"hidden", userSelect:"none", touchAction:"none", position:"relative" }}>
      <div style={{ width:"100%", maxWidth:440, display:"flex", justifyContent:"space-between", alignItems:"center", padding:"calc(env(safe-area-inset-top, 0px) + 14px) 18px 8px", background:"linear-gradient(180deg, rgba(27,17,80,0.97), rgba(58,31,107,0.97))", borderBottom:"1px solid rgba(255,111,97,0.28)", zIndex:50, flexShrink:0 }}>
        {[["STREAK",`${streak}`],["BEST",highScore]].map(([l,v],i)=>(<div key={i} style={{ display:"flex", flexDirection:"column", alignItems: i===1?"flex-end":"flex-start" }}><span style={{ color:"#9682cf", fontSize:9, letterSpacing:2, fontWeight:700 }}>{l}</span><span style={{ color:"#ffd23f", fontSize:21, fontWeight:900, lineHeight:1.25, fontFamily:"'Arial Black',Arial,sans-serif" }}>{v}</span></div>))}
      </div>
      <div ref={roadRef} style={{ flex:1, width:"100%", maxWidth:440, position:"relative", overflow:"hidden", cursor:"pointer" }}
        onMouseDown={e => startDrag(e.clientX)} onMouseMove={e => moveDrag(e.clientX)} onMouseUp={e => endDrag(e.clientX)} onMouseLeave={e => endDrag(e.clientX)}
        onTouchStart={e => { e.preventDefault(); startDrag(e.touches[0].clientX); }} onTouchMove={e => { e.preventDefault(); moveDrag(e.touches[0].clientX); }} onTouchEnd={e => { e.preventDefault(); endDrag(e.changedTouches[0].clientX); }}>
        <Road dashOffset={dashOff} blur={speedBlur} />
        <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}><Scenery offset={scenOff} roadW={roadW} /></div>
        {speedBlur && <div style={{ position:"absolute", inset:0, zIndex:3, pointerEvents:"none", background:"linear-gradient(to bottom,rgba(58,31,107,0.4) 0%,transparent 28%,transparent 72%,rgba(58,31,107,0.4) 100%)" }} />}
        {signs.map(s => { const cx = s.lane * LANE_W + LANE_W / 2; const sc = signScale(s.y); const opa = s.state === "passed" ? Math.max(0, 1 - (s.y - HIT_ZONE_Y) * 8) : 1; return (<div key={s.id} style={{ position:"absolute", left:`${cx}%`, top:`${s.y * 100}%`, transform:`translate(-50%,-50%) scale(${sc.toFixed(3)})`, transformOrigin:"center bottom", willChange:"transform", pointerEvents:"none", zIndex:10, opacity:opa, transition:"opacity 0.1s", borderRadius:"50%", boxShadow: s.state === "correct" ? "0 0 14px #00e676" : s.state === "wrong" ? "0 0 14px #ff1744" : "0 2px 8px rgba(20,8,50,0.35)" }}><SpeedSign speed={s.speed} state={s.state} /></div>); })}
        <div style={{ position:"absolute", left:`${carXPct}%`, bottom:`${CAR_BOTTOM}%`, transform:`translateX(-50%) scale(${carPunch ? 1.08 : 1})`, transition:"left 0.12s cubic-bezier(.4,0,.2,1), transform 0.14s cubic-bezier(.34,1.56,.64,1)", zIndex:20, display:"flex", flexDirection:"column", alignItems:"center", gap:4, pointerEvents:"none" }}>
          <div style={{ background: speedFlash ? "rgba(255,210,64,0.95)" : "rgba(27,17,60,0.85)", border:`2px solid ${speedFlash ? "#ffd23f" : "rgba(255,111,97,0.35)"}`, borderRadius:10, padding:"3px 10px", display:"flex", flexDirection:"column", alignItems:"center", boxShadow: speedFlash ? "0 0 18px rgba(255,210,64,0.55)" : "0 2px 8px rgba(20,8,50,0.5)", transition:"all 0.2s", pointerEvents:"none" }}>
            <span style={{ color: speedFlash ? "#1b1150" : "#fff", fontSize:22, fontWeight:900, lineHeight:1, fontFamily:"'Arial Black',Arial,sans-serif", transition:"color 0.2s" }}>{carSpeed}</span>
          </div>
          <div style={{ borderRadius: 16, boxShadow: carGlow === "good" ? "0 0 20px #00e676, 0 0 8px #00e676" : carGlow === "bad" ? "0 0 20px #ff1744, 0 0 8px #ff1744" : "0 4px 14px rgba(20,10,50,0.45)", transition: "box-shadow 0.18s" }}>
            <CarSVG glow={carGlow} lean={carLean} />
          </div>
        </div>
        {paused && (
          <div style={{ position:"absolute", inset:0, zIndex:60, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(15,8,40,0.72)", backdropFilter:"blur(2px)" }}>
            <div style={{ background:"rgba(26,17,60,0.95)", border:"1.5px solid rgba(255,111,97,0.4)", borderRadius:20, padding:"26px 28px", display:"flex", flexDirection:"column", alignItems:"center", gap:14, boxShadow:"0 14px 50px rgba(20,8,50,0.7)" }}>
              <div style={{ fontFamily:"'Arial Black',Arial,sans-serif", fontWeight:900, fontSize:26, letterSpacing:4, backgroundImage:"linear-gradient(135deg,#ffd23f,#ff8f5c,#ff5da2)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>PAUSED</div>
              <p style={{ color:"#b6a6e6", fontSize:12, margin:0, letterSpacing:0.5, textAlign:"center", maxWidth:220 }}>Streak {streak} is safe. Tap resume when you're ready.</p>
              <button style={{ background:"linear-gradient(135deg,#ffd23f,#ff8f5c,#ff5da2)", color:"#1b1150", border:"none", borderRadius:14, padding:"13px 30px", fontSize:14, fontWeight:900, letterSpacing:2, cursor:"pointer", fontFamily:"'Arial Black',Arial,sans-serif", boxShadow:"0 4px 24px rgba(255,111,97,0.4)" }} onClick={resumeGame}>RESUME</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
