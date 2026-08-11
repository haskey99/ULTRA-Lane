import { useEffect, useRef, useState, useCallback } from "react";

// BUILD 6 - EXCELLENT v2 - SHARP SVG SIGNS + GPU SMOOTH 60FPS
// If you see "BUILD 6 SHARP" green badge, you have the NEW version!

export default function App() {
  const [lane, setLane] = useState(1);
  const [speed, setSpeed] = useState(50);
  const [streak, setStreak] = useState(1);
  const [best] = useState(6);
  const signsRef = useRef([]);
  const rafRef = useRef(null);
  const lastSpawnRef = useRef(0);
  const gameRef = useRef(null);
  const laneRef = useRef(1);
  const speedRef = useRef(50);

  useEffect(() => { laneRef.current = lane; }, [lane]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  const spawnSign = useCallback(() => {
    const values = [30, 50, 70, 90];
    const value = values[Math.floor(Math.random() * values.length)];
    signsRef.current.push({
      id: Date.now() + Math.random(),
      lane: Math.floor(Math.random() * 3),
      value,
      y: -120,
      passed: false,
    });
  }, []);

  useEffect(() => {
    spawnSign();
    const id = setTimeout(() => spawnSign(), 800);
    return () => clearTimeout(id);
  }, [spawnSign]);

  useEffect(() => {
    let lastTime = performance.now();
    const animate = (now) => {
      const delta = Math.min(33, now - lastTime);
      lastTime = now;

      if (now - lastSpawnRef.current > 1100) {
        spawnSign();
        lastSpawnRef.current = now;
      }

      const laneW = window.innerWidth / 3;
      signsRef.current.forEach((s) => {
        s.y += delta * 0.32;
        const el = document.getElementById(`sign-${s.id}`);
        if (el) {
          const scale = s.y < 120? 0.5 : 1;
          el.style.transform = `translate3d(${s.lane * laneW + laneW/2 - 32}px, ${s.y}px, 0) scale(${scale})`;
          el.style.willChange = "transform";
        }
        if (!s.passed && s.y > window.innerHeight - 360 && s.y < window.innerHeight - 220) {
          if (s.lane === laneRef.current) {
            if (s.value!== speedRef.current) {
              setSpeed(s.value);
              speedRef.current = s.value;
            } else {
              setStreak(st => st + 1);
            }
            s.passed = true;
          }
        }
      });
      signsRef.current = signsRef.current.filter(s => s.y < window.innerHeight + 150);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [spawnSign]);

  const handleLane = (dir) => {
    setLane(p => {
      if (dir === "left") return Math.max(0, p - 1);
      if (dir === "right") return Math.min(2, p + 1);
      return p;
    });
  };

  return (
    <div ref={gameRef} style={{ width: "100vw", height: "100dvh", background: "#23165E", overflow: "hidden", position: "relative", fontFamily: "Inter, system-ui, sans-serif", touchAction: "none", userSelect: "none" }}>
      <div style={{ height: 62, background: "#2B1D6E", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", zIndex: 100, position: "relative", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", gap: 18 }}>
          <div><div style={{ fontSize: 10, color: "#9B8ED1", letterSpacing: 2 }}>STREAK</div><div style={{ fontSize: 26, fontWeight: 800, color: "#FFD60A" }}>{streak}</div></div>
          <div style={{ color: "white", fontSize: 24, fontWeight: 700, marginTop: 6 }}>07:39</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ background: "#00FF88", color: "black", fontWeight: 900, fontSize: 10, padding: "3px 7px", borderRadius: 5 }}>BUILD 6 SHARP ✓</div>
          <div><div style={{ fontSize: 10, color: "#9B8ED1", letterSpacing: 2, textAlign: "right" }}>BEST</div><div style={{ fontSize: 26, fontWeight: 800, color: "#FFD60A", textAlign: "right" }}>{best}</div></div>
        </div>
      </div>

      <div style={{ position: "relative", width: "100%", height: "calc(100% - 62px)" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex" }}>
          {[0,1,2].map(i => (<div key={i} style={{ flex: 1, position: "relative" }}>{i < 2 && <div style={{ position: "absolute", right: -2, top: 0, bottom: 0, width: 4, background: "repeating-linear-gradient(0deg, #FFC94A 0 28px, transparent 28px 56px)", opacity: 0.95 }} />}</div>))}
        </div>

        <div id="signs-layer" style={{ position: "absolute", inset: 0, transform: "translateZ(0)" }}>
          {signsRef.current.map(s => (
            <div key={s.id} id={`sign-${s.id}`} style={{ position: "absolute", left: 0, top: 0, willChange: "transform" }}>
              <svg width="64" height="80" viewBox="0 0 64 80" style={{ display: "block", filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.45))" }}>
                <rect x="29" y="56" width="6" height="24" rx="3" fill="#B8A6FF" />
                <circle cx="32" cy="32" r="28" fill="white" stroke="#FF2D55" strokeWidth="6" />
                <text x="32" y="41" textAnchor="middle" fontWeight="900" fontSize="24" fontFamily="Inter, sans-serif" fill="black">{s.value}</text>
              </svg>
            </div>
          ))}
        </div>

        <div style={{ position: "absolute", bottom: 110, left: `${(lane * 100) / 3 + 100/6}%`, transform: "translate3d(-50%,0,0)", transition: "left 0.20s cubic-bezier(0.22, 1, 0.36, 1)", willChange: "left", zIndex: 30 }}>
          <div style={{ background: "#FFD60A", color: "#23165E", fontWeight: 900, fontSize: 20, padding: "5px 16px", borderRadius: 10, textAlign: "center", boxShadow: "0 0 24px rgba(255,214,10,0.7)", margin: "0 auto 10px", width: 62 }}>{speed}</div>
          <svg width="78" height="116" viewBox="0 0 78 116" style={{ display: "block", filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.5))" }}>
            <rect x="10" y="6" width="58" height="104" rx="14" fill="#00D1B2" />
            <rect x="18" y="50" width="42" height="38" rx="8" fill="#0D1B3E" />
            <rect x="8" y="22" width="12" height="16" rx="5" fill="#111" />
            <rect x="58" y="22" width="12" height="16" rx="5" fill="#111" />
            <rect x="8" y="78" width="12" height="16" rx="5" fill="#111" />
            <rect x="58" y="78" width="12" height="16" rx="5" fill="#111" />
          </svg>
        </div>

        <div style={{ position: "absolute", inset: 0, display: "flex", zIndex: 10 }}>
          <div onClick={() => handleLane("left")} style={{ flex: 1 }} />
          <div style={{ flex: 1 }} />
          <div onClick={() => handleLane("right")} style={{ flex: 1 }} />
        </div>
      </div>
    </div>
  );
}
