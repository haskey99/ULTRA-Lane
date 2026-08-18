import { useState, useEffect, useRef, useCallback } from "react";
import { initAds, onPlayerDied } from "./ads.js";

const LANE_COUNT = 3;
const LANE_W = 100 / LANE_COUNT;
const CAR_BOTTOM = 14;
const HIT_ZONE_Y = 0.83;
const SPEEDS = [20,30,40,50,60,70,80,90,100,110,120,130];
const TRAVEL_TIME = 1.5;
const SPAWN_INTERVAL = 1.0;
const LEARN_TIME = 13.5;
const MEDIUM_TRAVEL_TIME = TRAVEL_TIME * 1.07;
const MEDIUM_SPAWN_INTERVAL = SPAWN_INTERVAL * 1.07;
const EASY_TRAVEL_TIME = MEDIUM_TRAVEL_TIME * 1.30;
const EASY_SPAWN_INTERVAL = MEDIUM_SPAWN_INTERVAL * 1.40;
function getTravelTime(isLearn){return isLearn?EASY_TRAVEL_TIME:MEDIUM_TRAVEL_TIME;}
function getSpawnInterval(isLearn){return isLearn?EASY_SPAWN_INTERVAL:MEDIUM_SPAWN_INTERVAL;}

function pickCarSpeed(ex){const pool=SPEEDS.filter(s=>s!==ex);return pool[Math.floor(Math.random()*pool.length)];}
const HS_KEY="speedlane:highscore-v2";
let _ctx=null;
function ac(){if(!_ctx)_ctx=new(window.AudioContext||window.webkitAudioContext)();if(_ctx.state==="suspended")_ctx.resume();return _ctx;}
function tone(f,type,dur,vol=0.25,delay=0){try{const c=ac(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type=type;o.frequency.value=f;g.gain.setValueAtTime(0.001,c.currentTime+delay);g.gain.linearRampToValueAtTime(vol,c.currentTime+delay+0.012);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+delay+dur);o.start(c.currentTime+delay);o.stop(c.currentTime+delay+dur+0.06);}catch(e){}}
const WHISTLE_NOTES=[523.25,587.33,659.25,783.99];
function whistleNote(freq,startTime,dur){try{const c=ac();const osc=c.createOscillator();osc.type="sine";osc.frequency.setValueAtTime(freq,startTime);const lfo=c.createOscillator();lfo.type="sine";lfo.frequency.value=5.5;const lfoGain=c.createGain();lfoGain.gain.value=8;lfo.connect(lfoGain);lfoGain.connect(osc.frequency);const g=c.createGain();g.gain.setValueAtTime(0.0001,startTime);g.gain.linearRampToValueAtTime(0.55,startTime+0.03);g.gain.setValueAtTime(0.55,startTime+Math.max(0.03,dur-0.04));g.gain.linearRampToValueAtTime(0.0001,startTime+dur);osc.connect(g);g.connect(c.destination);lfo.start(startTime);lfo.stop(startTime+dur+0.05);osc.start(startTime);osc.stop(startTime+dur+0.05);}catch(e){}}
function playWhistle(sd,sp){const c=ac();const t0=c.currentTime+sd;WHISTLE_NOTES.forEach((f,i)=>whistleNote(f,t0+i*sp,0.11));}
function gearShift(){const DUR=0.3;try{const c=ac();const t0=c.currentTime;const n=Math.floor(c.sampleRate*DUR);const buf=c.createBuffer(1,n,c.sampleRate);const bd=buf.getChannelData(0);for(let i=0;i<n;i++)bd[i]=Math.random()*2-1;const ns=c.createBufferSource();ns.buffer=buf;const bp=c.createBiquadFilter();bp.type="bandpass";bp.Q.value=1;bp.frequency.setValueAtTime(900,t0);bp.frequency.linearRampToValueAtTime(3200,t0+DUR);const ng=c.createGain();ng.gain.setValueAtTime(0.0001,t0);ng.gain.linearRampToValueAtTime(0.7,t0+0.03);ng.gain.setValueAtTime(0.7,t0+DUR-0.05);ng.gain.linearRampToValueAtTime(0.0001,t0+DUR);ns.connect(bp);bp.connect(ng);ng.connect(c.destination);ns.start(t0);ns.stop(t0+DUR);}catch(e){}playWhistle(0.06,0.13);}
const SFX={correct(){const DUR=0.35;try{const c=ac();const t0=c.currentTime;const V=125;const C_SOUND=343;const N=64;const bpF=new Float32Array(N);const wG=new Float32Array(N);for(let i=0;i<N;i++){const t=-DUR/2+(DUR*i)/(N-1);const d=Math.sqrt((V*t)*(V*t)+16);const vr=(V*(V*t))/d;let dop=C_SOUND/(C_SOUND-vr);dop=Math.max(0.6,Math.min(2.8,dop));bpF[i]=2800*dop;wG[i]=0.9*(4/d);}const n=Math.floor(c.sampleRate*DUR);const buf=c.createBuffer(1,n,c.sampleRate);const bd=buf.getChannelData(0);for(let i=0;i<n;i++)bd[i]=Math.random()*2-1;const ws=c.createBufferSource();ws.buffer=buf;const wBP=c.createBiquadFilter();wBP.type="bandpass";wBP.Q.value=1.4;wBP.frequency.setValueCurveAtTime(bpF,t0,DUR);const wGain=c.createGain();wGain.gain.setValueCurveAtTime(wG,t0,DUR);ws.connect(wBP);wBP.connect(wGain);wGain.connect(c.destination);ws.start(t0);ws.stop(t0+DUR);const ct=t0+DUR/2;const th=c.createOscillator();th.type="sine";th.frequency.value=48;const thG=c.createGain();thG.gain.setValueAtTime(0.0001,ct);thG.gain.linearRampToValueAtTime(0.8,ct+0.005);thG.gain.exponentialRampToValueAtTime(0.0001,ct+0.12);th.connect(thG);thG.connect(c.destination);th.start(ct);th.stop(ct+0.14);}catch(e){}playWhistle(DUR/2,0.07);},wrong(){tone(180,"sawtooth",0.18,0.32);tone(120,"sawtooth",0.22,0.28,0.13);},pass(){tone(440,"sine",0.04,0.05);},gearShift(){gearShift();},speedChange(){tone(660,"sine",0.06,0.14);tone(880,"sine",0.08,0.12,0.08);},over(){try{const c=ac();const t0=c.currentTime;const fs=t0+0.8;const fd=0.7;const osc=c.createOscillator();osc.type="sine";osc.frequency.setValueAtTime(783.99,fs);osc.frequency.exponentialRampToValueAtTime(196,fs+fd);const lfo=c.createOscillator();lfo.type="sine";lfo.frequency.value=5.5;const lfoG=c.createGain();lfoG.gain.value=8;lfo.connect(lfoG);lfoG.connect(osc.frequency);const g=c.createGain();g.gain.setValueAtTime(0.0001,fs);g.gain.linearRampToValueAtTime(0.55,fs+0.03);g.gain.setValueAtTime(0.5,fs+fd*0.55);g.gain.exponentialRampToValueAtTime(0.0001,fs+fd);osc.connect(g);g.connect(c.destination);lfo.start(fs);lfo.stop(fs+fd+0.05);osc.start(fs);osc.stop(fs+fd+0.05);}catch(e){}playWhistle(0,0.22);},};
function CarSVG({lean=0}){return(<svg xmlns="http://www.w3.org/2000/svg" width="52" height="90" viewBox="0 0 52 90" fill="none" shapeRendering="geometricPrecision" style={{transform:`rotate(${180+lean*3}deg)`,display:"block"}}><ellipse cx="26" cy="86" rx="18" ry="3.8" fill="rgba(20,10,50,0.35)" /><path d="M8 18 Q8 10 15 9 L37 9 Q44 10 44 18 L44 73 Q44 80 37 82 L15 82 Q8 80 8 73 Z" fill="#00bfa5" /><path d="M8 20 Q8 12 14 10 L14 78 Q8 76 8 71 Z" fill="rgba(255,255,255,0.12)" /><path d="M44 20 Q44 12 38 10 L38 78 Q44 76 44 71 Z" fill="rgba(0,0,0,0.12)" /><path d="M13 27 Q13 21 18 20 L34 20 Q39 21 39 27 L39 50 Q39 56 34 57 L18 57 Q13 56 13 50 Z" fill="#181233" /><path d="M15 28 Q26 23 37 28 L35 48 Q26 51 17 48 Z" fill="#241b4a" /><path d="M18 29 L21 28 L20 46 L17 47 Z" fill="rgba(255,255,255,0.14)" /><path d="M23 27 L26 26 L25 47 L22 48 Z" fill="rgba(255,255,255,0.07)" /><path d="M17 58 Q26 62 35 58 L34 65 Q26 68 18 65 Z" fill="#181233" /><path d="M11 9 Q11 5 15 5 L37 5 Q41 5 41 9 L41 13 L11 13 Z" fill="#00806f" /><rect x="19" y="5.5" width="14" height="5" rx="1.5" fill="#1a1a1a" /><rect x="20" y="6.5" width="5" height="3" rx="0.5" fill="#2a2a2a" /><rect x="27" y="6.5" width="5" height="3" rx="0.5" fill="#2a2a2a" /><path d="M11 7 Q11 5 14 5 L19 5 L19 12 L11 12 Z" fill="#fffde7" /><path d="M41 7 Q41 5 38 5 L33 5 L33 12 L41 12 Z" fill="#fffde7" /><ellipse cx="15" cy="8.5" rx="3" ry="2.5" fill="#ffd23f" /><ellipse cx="37" cy="8.5" rx="3" ry="2.5" fill="#ffd23f" /><ellipse cx="15" cy="8.5" rx="4.5" ry="3.5" fill="#ffe9a3" opacity="0.4" /><ellipse cx="37" cy="8.5" rx="4.5" ry="3.5" fill="#ffe9a3" opacity="0.4" /><path d="M11 78 L41 78 L41 83 Q41 86 37 86 L15 86 Q11 86 11 83 Z" fill="#00806f" /><path d="M11 76 L11 81 L17 81 L17 74 Z" fill="#ff5da2" /><path d="M41 76 L41 81 L35 81 L35 74 Z" fill="#ff5da2" /><rect x="12" y="76" width="4" height="4.5" rx="1" fill="#ffa8cf" opacity="0.9" /><rect x="36" y="76" width="4" height="4.5" rx="1" fill="#ffa8cf" opacity="0.9" /><rect x="14" y="83" width="6" height="3" rx="1.5" fill="#555" /><rect x="32" y="83" width="6" height="3" rx="1.5" fill="#555" /><g><rect x="2" y="13" width="10" height="16" rx="3" fill="#1a1a1a" /><rect x="3.5" y="14.5" width="7" height="13" rx="2" fill="#252525" /><ellipse cx="7" cy="21" rx="3" ry="3" fill="#333" /><ellipse cx="7" cy="21" rx="1.3" ry="1.3" fill="#505050" /><line x1="7" y1="18" x2="7" y2="24" stroke="#444" strokeWidth="1" /><line x1="4" y1="21" x2="10" y2="21" stroke="#444" strokeWidth="1" /></g><g><rect x="40" y="13" width="10" height="16" rx="3" fill="#1a1a1a" /><rect x="41.5" y="14.5" width="7" height="13" rx="2" fill="#252525" /><ellipse cx="45" cy="21" rx="3" ry="3" fill="#333" /><ellipse cx="45" cy="21" rx="1.3" ry="1.3" fill="#505050" /><line x1="45" y1="18" x2="45" y2="24" stroke="#444" strokeWidth="1" /><line x1="42" y1="21" x2="48" y2="21" stroke="#444" strokeWidth="1" /></g><g><rect x="2" y="60" width="10" height="16" rx="3" fill="#1a1a1a" /><rect x="3.5" y="61.5" width="7" height="13" rx="2" fill="#252525" /><ellipse cx="7" cy="68" rx="3" ry="3" fill="#333" /><ellipse cx="7" cy="68" rx="1.3" ry="1.3" fill="#505050" /><line x1="7" y1="65" x2="7" y2="71" stroke="#444" strokeWidth="1" /><line x1="4" y1="68" x2="10" y2="68" stroke="#444" strokeWidth="1" /></g><g><rect x="40" y="60" width="10" height="16" rx="3" fill="#1a1a1a" /><rect x="41.5" y="61.5" width="7" height="13" rx="2" fill="#252525" /><ellipse cx="45" cy="68" rx="3" ry="3" fill="#333" /><ellipse cx="45" cy="68" rx="1.3" ry="1.3" fill="#505050" /><line x1="45" y1="65" x2="45" y2="71" stroke="#444" strokeWidth="1" /><line x1="42" y1="68" x2="48" y2="68" stroke="#444" strokeWidth="1" /></g><path d="M19 14 Q26 12 33 14 L32 20 Q26 18 20 20 Z" fill="rgba(0,0,0,0.14)" /><rect x="21" y="15" width="4.5" height="2" rx="1" fill="rgba(0,0,0,0.3)" /><rect x="27" y="15" width="4.5" height="2" rx="1" fill="rgba(0,0,0,0.3)" /><path d="M8 26 L4 28 L4 32 L8 31 Z" fill="#ff5da2" /><path d="M44 26 L48 28 L48 32 L44 31 Z" fill="#ff5da2" /><rect x="25" y="20" width="1.5" height="7" fill="#555" /></svg>);}

// CRISP FIX: number is SVG text, not HTML, so it never blurs
function SpeedSign({speed,state}){
  const numCol=state==="correct"?"#00c853":state==="wrong"?"#cc0000":"#111";
  const ringCol=state==="correct"?"#00e676":state==="wrong"?"#ff1744":"rgba(255,178,64,0.4)";
  const ringW=state?5:2.5;
  const fs=speed>=100?26:30;
  return(
    <svg width="100%" height="100%" viewBox="0 0 66 88" fill="none" shapeRendering="geometricPrecision" textRendering="geometricPrecision" style={{display:"block"}}>
      <rect x="30.5" y="64" width="5" height="24" rx="2.5" fill="#b09ad9"/>
      <circle cx="33" cy="33" r="32" fill="#e0245a"/>
      <circle cx="33" cy="33" r="26" fill="#fff8f0"/>
      <circle cx="33" cy="33" r="29" fill="none" stroke={ringCol} strokeWidth={ringW}/>
      <text x="33" y="36" textAnchor="middle" dominantBaseline="middle" fontFamily="'Arial Black', Arial, sans-serif" fontWeight="900" fontSize={fs} fill={numCol} style={{WebkitFontSmoothing:"antialiased"}}>{speed}</text>
    </svg>
  );
}

function Road({dashOffset,blur}){const dH=5.5,dG=7.5,tot=dH+dG;const dashes=[];for(let div=1;div<=LANE_COUNT-1;div++){const x=div*LANE_W;for(let i=-1;i<14;i++){const y=(i*tot+dashOffset)%(100+tot)-tot;dashes.push(<rect key={`${div}-${i}`} x={`${x-0.38}%`} y={`${y}%`} width="0.76%" height={`${dH}%`} fill="rgba(255,210,64,0.85)" rx="1"/>);}}return(<svg width="100%" height="100%" style={{position:"absolute",inset:0,pointerEvents:"none"}}><defs><linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2a1c5c"/><stop offset="55%" stopColor="#301f6e"/><stop offset="100%" stopColor="#180f3d"/></linearGradient>{blur&&<filter id="sb"><feGaussianBlur stdDeviation="0 2.2"/></filter>}</defs><rect width="100%" height="100%" fill="url(#road)" filter={blur?"url(#sb)":undefined}/><rect x="0" width="3" height="100%" fill="rgba(0,230,201,0.4)"/><rect x="calc(100% - 3px)" width="3" height="100%" fill="rgba(0,230,201,0.4)"/>{dashes}</svg>);}
function Tree({x,y,s=1,v=0}){const C=["#12b88f","#ff5da2","#ffd23f","#8f6bff"];const r=16*s;return(<g transform={`translate(${x},${y})`}><ellipse cx={3*s} cy={3*s} rx={r*0.85} ry={r*0.32} fill="rgba(20,10,50,0.3)"/><rect x={-3*s} y={-15*s} width={6*s} height={15*s} rx={3*s} fill="#8a5a34"/><circle cx={0} cy={-15*s} r={r} fill={C[v%4]}/></g>);}
function Lamppost({x,y,s=1}){const h=36*s;return(<g transform={`translate(${x},${y})`}><rect x={-2*s} y={-h} width={4*s} height={h} rx={2*s} fill="#8a7bb8"/><path d={`M0 ${-h} Q${8*s} ${-h} ${10*s} ${-h+6*s}`} stroke="#8a7bb8" strokeWidth={3*s} fill="none"/><ellipse cx={10*s} cy={-h+8*s} rx={7*s} ry={4*s} fill="#ffe66d"/></g>);}
function Bush({x,y,s=1}){return(<g transform={`translate(${x},${y})`}><ellipse cx={0} cy={0} rx={12*s} ry={7*s} fill="#0d5c52"/><ellipse cx={-4*s} cy={-3*s} rx={8*s} ry={6*s} fill="#128a72"/><ellipse cx={4*s} cy={-2*s} rx={9*s} ry={5*s} fill="#22b393"/></g>);}
function Scenery({offset,roadW}){if(!roadW)return null;const items=[],sp=120,n=12;for(let i=0;i<n;i++){const yL=((i*sp+offset)%(n*sp+sp))-sp;const yR=((i*sp+sp*0.52+offset)%(n*sp+sp))-sp;const sc=0.65+(i%3)*0.15,v=i%4,tL=i%6,tR=(i+2)%6;if(tL===1)items.push(<Lamppost key={`ll${i}`} x={-26} y={yL} s={sc*0.85}/>);else if(tL===3)items.push(<Bush key={`lb${i}`} x={-14} y={yL} s={sc}/>);else items.push(<Tree key={`lt${i}`} x={-18} y={yL} s={sc*0.86} v={v}/>);if(tR===2)items.push(<Lamppost key={`rl${i}`} x={roadW+26} y={yR} s={sc*0.85}/>);else if(tR===4)items.push(<Bush key={`rb${i}`} x={roadW+14} y={yR} s={sc}/>);else items.push(<Tree key={`rt${i}`} x={roadW+18} y={yR} s={sc*0.86} v={(v+2)%4}/>);}return(<svg width="100%" height="100%" style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"visible"}}><rect x={-roadW} y={-30} width={roadW} height="130%" fill="#180f3d"/><rect x={roadW} y={-30} width={roadW} height="130%" fill="#180f3d"/>{items}</svg>);}
export default function UltraLane(){
  const [phase,setPhase]=useState("intro");
  const [streak,setStreak]=useState(0);
  const [highScore,setHighScore]=useState(0);
  const [newHS,setNewHS]=useState(false);
  const [carLane,setCarLane]=useState(1);
  const [carLean,setCarLean]=useState(0);
  const [carSpeed,setCarSpeed]=useState(70);
  const [signs,setSigns]=useState([]);
  const [dashOff,setDashOff]=useState(0);
  const [scenOff,setScenOff]=useState(0);
  const [speedBlur,setSpeedBlur]=useState(false);
  const [speedFlash,setSpeedFlash]=useState(false);
  const [paused,setPaused]=useState(false);
  const pausedRef=useRef(false);
  const phaseRef=useRef("intro");
  const roadRef=useRef(null);
  const [roadW,setRoadW]=useState(0);
  const rafRef=useRef(null);
  const lastTRef=useRef(null);
  const signIdRef=useRef(0);
  const scoreRef=useRef(0);
  const carLaneRef=useRef(1);
  const carSpeedRef=useRef(70);
  const travelRef=useRef(MEDIUM_TRAVEL_TIME);
  const spawnTimerRef=useRef(1.5);
  const spawnIntRef=useRef(MEDIUM_SPAWN_INTERVAL);
  const deadRef=useRef(false);
  const signsRef=useRef([]);
  const gameTimeRef=useRef(0);
  const isDragRef=useRef(false);
  const gestureStartXRef=useRef(0);
  const gestureStartYRef=useRef(0);
  const gestureUsedRef=useRef(false);
  const [carPunch,setCarPunch]=useState(false);
  useEffect(()=>{try{const v=localStorage.getItem(HS_KEY);if(v){const n=parseInt(v,10);if(Number.isFinite(n))setHighScore(n);}}catch{}},[]);
  useEffect(()=>{ initAds(); },[]);
  useEffect(()=>{carLaneRef.current=carLane;},[carLane]);
  useEffect(()=>{carSpeedRef.current=carSpeed;},[carSpeed]);
  useEffect(()=>{pausedRef.current=paused;},[paused]);
  useEffect(()=>{phaseRef.current=phase;},[phase]);
  useEffect(()=>{if(!roadRef.current)return;const ro=new ResizeObserver(e=>setRoadW(e[0].contentRect.width));ro.observe(roadRef.current);return()=>ro.disconnect();},[]);
  const doPause=useCallback(()=>{if(phaseRef.current!=="playing"||deadRef.current||pausedRef.current)return;pausedRef.current=true;setPaused(true);cancelAnimationFrame(rafRef.current);},[]);
  useEffect(()=>{
    const onVis=()=>{if(document.hidden)doPause();};
    const onBlur=()=>{doPause();};
    const onPageHide=()=>{doPause();};
    const onTouchStartWindow=(e)=>{if(phaseRef.current!=="playing"||deadRef.current)return;const t=e.touches[0]; if(!t)return; if(t.clientY < 45 || window.innerHeight - t.clientY < 110) doPause();};
    document.addEventListener("visibilitychange",onVis);
    window.addEventListener("blur",onBlur);
    window.addEventListener("pagehide",onPageHide);
    window.addEventListener("touchstart",onTouchStartWindow,{passive:true});
    return()=>{document.removeEventListener("visibilitychange",onVis);window.removeEventListener("blur",onBlur);window.removeEventListener("pagehide",onPageHide);window.removeEventListener("touchstart",onTouchStartWindow);};
  },[doPause]);
  const resumeGame=useCallback((e)=>{if(e){e.preventDefault();e.stopPropagation();}lastTRef.current=null;pausedRef.current=false;setPaused(false);},[]);
  const STEP_PX=Math.max(20,roadW*(LANE_W/100)*0.22);
  const shiftToLane=useCallback((t)=>{const c=Math.max(0,Math.min(LANE_COUNT-1,t));if(c===carLaneRef.current)return;const d=c>carLaneRef.current?1:-1;setCarLean(d);carLaneRef.current=c;setCarLane(c);SFX.gearShift();setCarPunch(true);setTimeout(()=>setCarPunch(false),140);},[]);
  const startDrag=useCallback((cx,cy)=>{if(phase!=="playing"||deadRef.current||pausedRef.current)return; if(cy < 45){ doPause(); return; } if(window.innerHeight - cy < 90) return; isDragRef.current=true;gestureUsedRef.current=false;gestureStartXRef.current=cx;gestureStartYRef.current=cy;},[phase, doPause]);
  const moveDrag=useCallback((cx,cy)=>{if(!isDragRef.current||gestureUsedRef.current)return; if(window.innerHeight - cy < 70){doPause(); isDragRef.current=false; return;} const dx=cx-gestureStartXRef.current; const dy=cy-gestureStartYRef.current; if(Math.abs(dx) < STEP_PX) return; if(Math.abs(dy) > Math.abs(dx)*1.2) return; shiftToLane(carLaneRef.current+(dx>0?1:-1)); gestureUsedRef.current=true;},[STEP_PX,shiftToLane,doPause]);
  const endDrag=useCallback(()=>{if(!isDragRef.current)return;isDragRef.current=false;gestureUsedRef.current=false;setCarLean(0);},[]);
  const spawnSign=useCallback(()=>{
    const isM=Math.random()<0.45;
    const lane=Math.floor(Math.random()*LANE_COUNT);
    const speed=isM?carSpeedRef.current:SPEEDS.filter(sp=>sp!==carSpeedRef.current)[Math.floor(Math.random()*(SPEEDS.length-1))];
    const sign={id:signIdRef.current++,lane,speed,y:-0.08,state:null};
    const n=[...signsRef.current,sign];signsRef.current=n;setSigns(n);
  },[]);
  const tick=useCallback((ts)=>{
    if(deadRef.current||pausedRef.current)return;
    if(!lastTRef.current)lastTRef.current=ts;
    const dt=Math.min((ts-lastTRef.current)/1000,0.05);
    lastTRef.current=ts;
    gameTimeRef.current+=dt;
    const isLearn=gameTimeRef.current<LEARN_TIME;
    travelRef.current=getTravelTime(isLearn);
    spawnIntRef.current=getSpawnInterval(isLearn);
    const spd=1/travelRef.current;
    setDashOff(p=>(p+spd*dt*100*1.5)%13);
    setScenOff(p=>p+spd*dt*620);
    spawnTimerRef.current-=dt;
    if(spawnTimerRef.current<=0){spawnSign();spawnTimerRef.current=spawnIntRef.current;}
    let newDead=false;
    const HIT_START = HIT_ZONE_Y - 0.06;
    const HIT_END = HIT_ZONE_Y + 0.10;
    const updated=signsRef.current.map(s=>{
      if(s.state!==null)return{...s,y:s.y+spd*dt};
      const ny=s.y+spd*dt;
      const inLane=carLaneRef.current===s.lane;
      const isMatch=s.speed===carSpeedRef.current;
      const wasBefore=s.y < HIT_END;
      const isOverlapping=ny >= HIT_START && ny <= HIT_END;
      const hasPassed=ny > HIT_END;
      if(inLane && isMatch && ny>=HIT_ZONE_Y){
        SFX.correct();scoreRef.current+=1;setStreak(st=>st+1);
        const ns=pickCarSpeed(carSpeedRef.current);carSpeedRef.current=ns;setCarSpeed(ns);setSpeedFlash(true);SFX.speedChange();setTimeout(()=>setSpeedFlash(false),600);
        travelRef.current=getTravelTime(gameTimeRef.current<LEARN_TIME);spawnIntRef.current=getSpawnInterval(gameTimeRef.current<LEARN_TIME);setSpeedBlur(false);
        return{...s,y:ny,state:"correct"};
      }
      if(inLane &&!isMatch && isOverlapping){
        if(!newDead&&!deadRef.current){newDead=true;SFX.wrong();}
        return{...s,y:ny,state:"wrong"};
      }
      if(!inLane && isMatch && hasPassed && wasBefore){
        if(!newDead&&!deadRef.current){newDead=true;SFX.wrong();}
        return{...s,y:ny,state:"wrong"};
      }
      if(!inLane &&!isMatch && hasPassed){
        SFX.pass();
        return{...s,y:ny,state:"passed"};
      }
      return{...s,y:ny};
    }).filter(s=>s.y<1.3);
    signsRef.current=updated;setSigns(updated);
    if(newDead&&!deadRef.current){deadRef.current=true;SFX.over(); onPlayerDied(); const survived=scoreRef.current; if(survived>highScore){setHighScore(survived);try{localStorage.setItem(HS_KEY,String(survived));}catch{} setNewHS(true);} else {setNewHS(false);} setTimeout(()=>setPhase("result"),1800);}
    rafRef.current=requestAnimationFrame(tick);
  },[spawnSign,highScore]);
  useEffect(()=>{if(phase==="playing"&&!paused){lastTRef.current=null;rafRef.current=requestAnimationFrame(tick);}return()=>{cancelAnimationFrame(rafRef.current);lastTRef.current=null;};},[phase,paused,tick]);
  useEffect(()=>{if(phase==="playing"){scoreRef.current=0;deadRef.current=false;carLaneRef.current=1;carSpeedRef.current=SPEEDS[Math.floor(Math.random()*SPEEDS.length)];gameTimeRef.current=0;travelRef.current=getTravelTime(true);spawnTimerRef.current=1.2;spawnIntRef.current=getSpawnInterval(true);signsRef.current=[];isDragRef.current=false;pausedRef.current=false;setStreak(0);setNewHS(false);setCarLane(1);setCarLean(0);setCarPunch(false);setPaused(false);setCarSpeed(carSpeedRef.current);setSigns([]);setSpeedBlur(false);setSpeedFlash(false);}if(phase!=="playing"){cancelAnimationFrame(rafRef.current);setSigns([]);signsRef.current=[];setSpeedBlur(false);}},[phase]);
  const signScale=y=>Math.max(0.28,Math.min(1.15,0.28+Math.max(0,y)*0.98));
  const carXPct=carLane*LANE_W+LANE_W/2;
  const PAGE_BG="linear-gradient(160deg, #1b1150 0%, #3a1f6b 42%, #7c2f6e 72%, #ff6f61 100%)";
  if(phase==="intro"||phase==="result"){
    return(
      <div style={{width:"100vw",height:"100vh",height:"100dvh",background:PAGE_BG,backgroundColor:"#1b1150",display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'Trebuchet MS',Arial,sans-serif",overflow:"hidden",userSelect:"none",touchAction:"none",position:"relative",margin:0,padding:0}}>
        <div style={{position:"absolute",inset:0,opacity:0.22,pointerEvents:"none"}}><Road dashOffset={dashOff}/></div>
        <div style={{position:"relative",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:"100vh",height:"100dvh",paddingBottom:"18vh"}}>
          <div style={{background:"rgba(26,17,60,0.92)",border:"1.5px solid rgba(255,111,97,0.4)",borderRadius:22,padding:"24px 22px 22px",maxWidth:340,width:"92%",display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
            <h1 style={{backgroundImage:"linear-gradient(135deg,#ffd23f,#ff8f5c,#ff5da2)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",fontSize:46,fontWeight:900,textAlign:"center",margin:0,lineHeight:0.96,letterSpacing:10,whiteSpace:"pre-line",fontFamily:"'Arial Black',Arial,sans-serif"}}>{"ULTRA\nLANE"}</h1>
            {phase==="result"&&(<><p style={{color:"#b6a6e6",fontSize:12,margin:0,letterSpacing:1.5}}>{newHS?"🏆 New High Score!":"Game over."}</p><div style={{width:"100%",background:"rgba(255,255,255,0.05)",borderRadius:12,padding:"12px 8px",display:"flex",justifyContent:"space-around"}}>{[["STREAK",`${streak}`],["BEST",`${highScore}`]].map(([l,v],i)=>(<div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><span style={{color:"#9682cf",fontSize:9,letterSpacing:2,fontWeight:700}}>{l}</span><span style={{color:i===1?"#ffd23f":"#fff",fontSize:21,fontWeight:900,fontFamily:"'Arial Black',Arial,sans-serif"}}>{v}</span></div>))}</div></>)}
            {phase==="intro"&&highScore>0&&(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><span style={{color:"#9682cf",fontSize:9,letterSpacing:2,fontWeight:700}}>BEST STREAK</span><span style={{color:"#ffd23f",fontSize:21,fontWeight:900,lineHeight:1.25,fontFamily:"'Arial Black',Arial,sans-serif"}}>{highScore}</span></div>)}
            <button style={{background:"linear-gradient(135deg,#ffd23f,#ff8f5c,#ff5da2)",color:"#1b1150",border:"none",borderRadius:14,padding:"15px 0",fontSize:16,fontWeight:900,letterSpacing:3,cursor:"pointer",width:"100%",fontFamily:"'Arial Black',Arial,sans-serif"}} onClick={()=>setPhase("playing")}>GO</button>
          </div>
        </div>
        <div style={{position:"absolute",left:"50%",bottom:`${CAR_BOTTOM}%`,transform:"translateX(-50%)",zIndex:5}}><CarSVG/></div>
      </div>
    );
  }
  return(
    <div style={{width:"100vw",height:"100vh",height:"100dvh",background:PAGE_BG,backgroundColor:"#1b1150",display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'Trebuchet MS',Arial,sans-serif",overflow:"hidden",userSelect:"none",touchAction:"none",position:"relative",margin:0,padding:0}}>
      <div style={{width:"100%",maxWidth:440,display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:"calc(env(safe-area-inset-top, 0px) + 12px)",paddingBottom:"10px",paddingLeft:"20px",paddingRight:"20px",background:"linear-gradient(180deg, rgba(27,17,80,0.97), rgba(58,31,107,0.97))",borderBottom:"1px solid rgba(255,111,97,0.28)",zIndex:50,flexShrink:0,boxSizing:"border-box"}}>
        {[["STREAK",`${streak}`],["BEST",`${highScore}`]].map(([l,v],i)=>(<div key={i} style={{display:"flex",flexDirection:"column",alignItems:i===1?"flex-end":"flex-start"}}><span style={{color:"#9682cf",fontSize:9,letterSpacing:2,fontWeight:700}}>{l}</span><span style={{color:"#ffd23f",fontSize:21,fontWeight:900,lineHeight:1.25,fontFamily:"'Arial Black',Arial,sans-serif"}}>{v}</span></div>))}
      </div>
      <div ref={roadRef} style={{flex:1,width:"100%",maxWidth:440,position:"relative",overflow:"hidden",cursor:"pointer"}}
        onMouseDown={e=>startDrag(e.clientX,e.clientY)} onMouseMove={e=>moveDrag(e.clientX,e.clientY)} onMouseUp={endDrag} onMouseLeave={endDrag}
        onTouchStart={e=>{if(paused)return;const t=e.touches[0]; if(!t)return; if(t.clientY < 45 || window.innerHeight - t.clientY < 90){doPause(); return;} e.preventDefault(); startDrag(t.clientX,t.clientY);}} onTouchMove={e=>{if(paused)return;const t=e.touches[0]; if(!t)return; e.preventDefault(); moveDrag(t.clientX,t.clientY);}} onTouchEnd={e=>{if(paused)return;e.preventDefault();endDrag();}}>
        <Road dashOffset={dashOff} blur={speedBlur}/>
        <div style={{position:"absolute",inset:0,pointerEvents:"none"}}><Scenery offset={scenOff} roadW={roadW}/></div>
        {signs.map(s=>{
          const cx=s.lane*LANE_W+LANE_W/2;
          const sc=signScale(s.y);
          const w=66*sc;
          const h=88*sc;
          return(<div key={s.id} style={{position:"absolute",left:`${cx}%`,top:`${s.y*100}%`,width:`${w}px`,height:`${h}px`,transform:`translate(-50%,-50%)`,pointerEvents:"none",zIndex:10}}><SpeedSign speed={s.speed} state={s.state}/></div>);
        })}
        <div style={{position:"absolute",left:`${carXPct}%`,bottom:`${CAR_BOTTOM}%`,transform:`translateX(-50%) scale(${carPunch?1.08:1})`,transition:"left 0.12s cubic-bezier(.4,0,.2,1), transform 0.14s cubic-bezier(.34,1.56,.64,1)",zIndex:20,display:"flex",flexDirection:"column",alignItems:"center",gap:4,pointerEvents:"none"}}>
          <div style={{background:speedFlash?"rgba(255,210,64,0.95)":"rgba(27,17,60,0.85)",border:`2px solid ${speedFlash?"#ffd23f":"rgba(255,111,97,0.35)"}`,borderRadius:10,padding:"3px 10px"}}><span style={{color:speedFlash?"#1b1150":"#fff",fontSize:22,fontWeight:900,fontFamily:"'Arial Black',Arial,sans-serif",WebkitFontSmoothing:"antialiased"}}>{carSpeed}</span></div>
          <div style={{borderRadius:16}}><CarSVG lean={carLean}/></div>
        </div>
        {paused&&(<div onTouchStart={e=>{e.preventDefault();e.stopPropagation();}} style={{position:"absolute",inset:0,zIndex:90,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,8,40,0.82)",backdropFilter:"blur(4px)"}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:22,pointerEvents:"auto"}}><div style={{fontFamily:"'Arial Black',Arial,sans-serif",fontWeight:900,fontSize:34,letterSpacing:5,backgroundImage:"linear-gradient(135deg,#ffd23f,#ff8f5c,#ff5da2)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>PAUSED</div><button onClick={resumeGame} onTouchEnd={resumeGame} style={{background:"linear-gradient(135deg,#ffd23f,#ff8f5c,#ff5da2)",color:"#1b1150",border:"none",borderRadius:14,padding:"14px 36px",fontSize:15,fontWeight:900,letterSpacing:2,cursor:"pointer",fontFamily:"'Arial Black',Arial,sans-serif"}}>GO</button></div></div>)}
      </div>
    </div>
  );
}
