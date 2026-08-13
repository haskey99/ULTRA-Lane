import { useState, useEffect, useRef, useCallback } from "react";

const LANE_COUNT = 3;
const LANE_W = 100 / LANE_COUNT;
const CAR_BOTTOM = 14;
const HIT_ZONE_Y = 0.83;
const SPEEDS = [20,30,40,50,60,70,80,90,100,110,120,130];
const TRAVEL_TIME = 1.8;
const SPAWN_INTERVAL = 1.2;
function getTravelTime(){return TRAVEL_TIME;}
function getSpawnInterval(){return SPAWN_INTERVAL;}
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

// EXACT CAR FROM YOUR PHOTO - clean version
function CarSVG({lean=0}){
  return(
    <svg width="54" height="92" viewBox="0 0 54 92" fill="none" shapeRendering="geometricPrecision" style={{transform:`rotate(${lean*3}deg)`,display:"block"}}>
      {/* soft outer capsule glow like in photo */}
      <rect x="7" y="5" width="40" height="82" rx="20" fill="#3B225A" opacity="0.42"/>
      {/* main body teal */}
      <path d="M13.5 10.5 Q13.5 8 18.5 8 L35.5 8 Q40.5 8 40.5 10.5 L40.5 69.5 Q40.5 76.5 35 77.5 L19 77.5 Q13.5 76.5 13.5 69.5 Z" fill="#00D0B0"/>
      {/* wheels black */}
      <rect x="9.5" y="17.5" width="10.5" height="15.5" rx="4.8" fill="#121212"/>
      <rect x="34" y="17.5" width="10.5" height="15.5" rx="4.8" fill="#121212"/>
      <rect x="9.5" y="51" width="10.5" height="15.5" rx="4.8" fill="#121212"/>
      <rect x="34" y="51" width="10.5" height="15.5" rx="4.8" fill="#121212"/>
      {/* pink front corners - exactly like photo */}
      <rect x="14" y="11.2" width="5.2" height="5.2" rx="1.2" fill="#FF8ECC"/>
      <rect x="34.8" y="11.2" width="5.2" height="5.2" rx="1.2" fill="#FF8ECC"/>
      {/* small top dark window */}
      <path d="M21 19 Q27 17.8 33 19 L33 23.2 Q27 24.5 21 23.2 Z" fill="#1A1A35"/>
      {/* big windshield dark */}
      <rect x="15.5" y="27" width="23" height="28.5" rx="8.5" fill="#22224A"/>
      <rect x="16.5" y="28.5" width="21" height="25.5" rx="7" fill="#2B2B5E"/>
      <rect x="31.5" y="30.5" width="2.4" height="18" rx="1.2" fill="rgba(255,255,255,0.18)"/>
      {/* pink side markers */}
      <rect x="12" y="47.5" width="3.2" height="5" rx="0.9" fill="#FF8ECC"/>
      <rect x="38.8" y="47.5" width="3.2" height="5" rx="0.9" fill="#FF8ECC"/>
      {/* yellow headlights at bottom + black bumper */}
      <rect x="11.5" y="71" width="9.5" height="6.5" rx="1.6" fill="#FFFECC"/>
      <rect x="32.5" y="71" width="9.5" height="6.5" rx="1.6" fill="#FFFECC"/>
      <rect x="12.5" y="72" width="7.5" height="4.5" rx="1" fill="#FFF7A0"/>
      <rect x="33.5" y="72" width="7.5" height="4.5" rx="1" fill="#FFF7A0"/>
      <rect x="21.5" y="71.8" width="11" height="5" rx="1.2" fill="#1E1E1E"/>
    </svg>
  );
}

function SpeedSign({speed,state}){const numCol=state==="correct"?"#00c853":state==="wrong"?"#cc0000":"#111";const ringCol=state==="correct"?"#00e676":state==="wrong"?"#ff1744":"rgba(255,178,64,0.4)";const ringW=state?5:2.5;const fs=speed>=100?26:30;return(<div style={{position:"relative",width:66,height:88}}><svg width={66} height={88} viewBox="0 0 66 88" fill="none" style={{position:"absolute",inset:0}}><rect x="30.5" y="64" width="5" height="24" rx="2.5" fill="#b09ad9"/><circle cx="33" cy="33" r="32" fill="#e0245a"/><circle cx="33" cy="33" r="26" fill="#fff8f0"/><circle cx="33" cy="33" r="29" fill="none" stroke={ringCol} strokeWidth={ringW}/></svg><div style={{position:"absolute",left:0,right:0,top:"7.95%",height:"59%",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontFamily:"'Arial Black',Arial,sans-serif",fontWeight:900,fontSize:fs,lineHeight:1,color:numCol}}>{speed}</div></div></div>);}
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
  const travelRef=useRef(6.0);
  const spawnTimerRef=useRef(1.5);
  const spawnIntRef=useRef(2.2);
  const deadRef=useRef(false);
  const signsRef=useRef([]);
  const isDragRef=useRef(false);
  const gestureStartXRef=useRef(0);
  const gestureStartYRef=useRef(0);
  const gestureUsedRef=useRef(false);
  const [carPunch,setCarPunch]=useState(false);

  useEffect(()=>{try{const v=localStorage.getItem(HS_KEY);if(v){const n=parseInt(v,10);if(Number.isFinite(n))setHighScore(n);}}catch{}},[]);
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
    const onTouchStartWindow=(e)=>{if(phaseRef.current!=="playing"||deadRef.current)return;const t=e.touches[0]; if(!t)return; if(window.innerHeight - t.clientY < 110) doPause();};
    document.addEventListener("visibilitychange",onVis);
    window.addEventListener("blur",onBlur);
    window.addEventListener("pagehide",onPageHide);
    window.addEventListener("touchstart",onTouchStartWindow,{passive:true});
    return()=>{document.removeEventListener("visibilitychange",onVis);window.removeEventListener("blur",onBlur);window.removeEventListener("pagehide",onPageHide);window.removeEventListener("touchstart",onTouchStartWindow);};
  },[doPause]);

  const resumeGame=useCallback((e)=>{if(e){e.preventDefault();e.stopPropagation();}lastTRef.current=null;pausedRef.current=false;setPaused(false);},[]);
  const STEP_PX=Math.max(20,roadW*(LANE_W/100)*0.22);
  const shiftToLane=useCallback((t)=>{const c=Math.max(0,Math.min(LANE_COUNT-1,t));if(c===carLaneRef.current)return;const d=c>carLaneRef.current?1:-1;setCarLean(d);carLaneRef.current=c;setCarLane(c);SFX.gearShift();setCarPunch(true);setTimeout(()=>setCarPunch(false),140);},[]);
  const startDrag=useCallback((cx,cy)=>{if(phase!=="playing"||deadRef.current||pausedRef.current)return; if(window.innerHeight - cy < 90) return; isDragRef.current=true;gestureUsedRef.current=false;gestureStartXRef.current=cx;gestureStartYRef.current=cy;},[phase]);
  const moveDrag=useCallback((cx,cy)=>{if(!isDragRef.current||gestureUsedRef.current)return; if(window.innerHeight - cy < 70){doPause(); isDragRef.current=false; return;} const dx=cx-gestureStartXRef.current; const dy=cy-gestureStartYRef.current; if(Math.abs(dx) < STEP_PX) return; if(Math.abs(dy) > Math.abs(dx)*1.2) return; shiftToLane(carLaneRef.current+(dx>0?1:-1)); gestureUsedRef.current=true;},[STEP_PX,shiftToLane,doPause]);
  const endDrag=useCallback(()=>{if(!isDragRef.current)return;isDragRef.current=false;gestureUsedRef.current=false;setCarLean(0);},[]);
  const spawnSign=useCallback(()=>{const isM=Math.random()<0.48;const lane=Math.floor(Math.random()*LANE_COUNT);const speed=isM?carSpeedRef.current:SPEEDS.filter(s=>s!==carSpeedRef.current)[Math.floor(Math.random()*(SPEEDS.length-1))];const s={id:signIdRef.current++,lane,speed,y:-0.08,state:null};const n=[...signsRef.current,s];signsRef.current=n;setSigns(n);},[]);

  const tick=useCallback((ts)=>{
    if(deadRef.current||pausedRef.current)return;
    if(!lastTRef.current)lastTRef.current=ts;
    const dt=Math.min((ts-lastTRef.current)/1000,0.05);
    lastTRef.current=ts;
    const spd=1/travelRef.current;
    setDashOff(p=>(p+spd*dt*100*1.5)%13);
    setScenOff(p=>p+spd*dt*620);
    spawnTimerRef.current-=dt;
    if(spawnTimerRef.current<=0){spawnSign();spawnTimerRef.current=spawnIntRef.current;}
    let newDead=false;
    const updated=signsRef.current.map(s=>{
      if(s.state!==null)return{...s,y:s.y+spd*dt};
      const ny=s.y+spd*dt;
      const inLane=carLaneRef.current===s.lane;
      const isMatch=s.speed===carSpeedRef.current;
      if(ny>=HIT_ZONE_Y&&s.y<HIT_ZONE_Y){
        if(isMatch&&inLane){SFX.correct();scoreRef.current+=1;setStreak(st=>st+1); const ns=pickCarSpeed(carSpeedRef.current);carSpeedRef.current=ns;setCarSpeed(ns);setSpeedFlash(true);SFX.speedChange();setTimeout(()=>setSpeedFlash(false),600); travelRef.current=getTravelTime();spawnIntRef.current=getSpawnInterval();setSpeedBlur(travelRef.current<=3.0); return{...s,y:ny,state:"correct"};}
        else if(isMatch&&!inLane){if(!newDead&&!deadRef.current){newDead=true;SFX.wrong();}return{...s,y:ny,state:"wrong"};}
        else if(!isMatch&&inLane){if(!newDead&&!deadRef.current){newDead=true;SFX.wrong();}return{...s,y:ny,state:"wrong"};}
        else{SFX.pass();return{...s,y:ny,state:"passed"};}
      }
      return{...s,y:ny};
    }).filter(s=>s.y<1.3);
    signsRef.current=updated;setSigns(updated);
    if(newDead&&!deadRef.current){deadRef.current=true;SFX.over(); const survived=scoreRef.current; if(survived>highScore){setHighScore(survived);try{localStorage.setItem(HS_KEY,String(survived));}catch{} setNewHS(true);} else {setNewHS(false);} setTimeout(()=>setPhase("result"),1800);}
    rafRef.current=requestAnimationFrame(tick);
  },[spawnSign,highScore]);

  useEffect(()=>{if(phase==="playing"&&!paused){lastTRef.current=null;rafRef.current=requestAnimationFrame(tick);}return()=>{cancelAnimationFrame(rafRef.current);lastTRef.current=null;};},[phase,paused,tick]);
  useEffect(()=>{if(phase==="playing"){scoreRef.current=0;deadRef.current=false;carLaneRef.current=1;carSpeedRef.current=SPEEDS[Math.floor(Math.random()*SPEEDS.length)];travelRef.current=TRAVEL_TIME;spawnTimerRef.current=1.2;spawnIntRef.current=SPAWN_INTERVAL;signsRef.current=[];isDragRef.current=false;pausedRef.current=false;setStreak(0);setNewHS(false);setCarLane(1);setCarLean(0);setCarPunch(false);setPaused(false);setCarSpeed(carSpeedRef.current);setSigns([]);setSpeedBlur(false);setSpeedFlash(false);}if(phase!=="playing"){cancelAnimationFrame(rafRef.current);setSigns([]);signsRef.current=[];setSpeedBlur(false);}},[phase]);

  const signScale=y=>Math.max(0.25,Math.min(1.1,0.25+Math.max(0,y)*0.95));
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
      <div style={{width:"100%",maxWidth:440,display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:"calc(env(safe-area-inset-top, 0px) + 54px)",paddingBottom:"12px",paddingLeft:"28px",paddingRight:"28px",background:"linear-gradient(180deg, rgba(27,17,80,0.97), rgba(58,31,107,0.97))",borderBottom:"1px solid rgba(255,111,97,0.28)",zIndex:50,flexShrink:0,boxSizing:"border-box"}}>
        {[["STREAK",`${streak}`],["BEST",`${highScore}`]].map(([l,v],i)=>(<div key={i} style={{display:"flex",flexDirection:"column",alignItems:i===1?"flex-end":"flex-start"}}><span style={{color:"#9682cf",fontSize:9,letterSpacing:2,fontWeight:700}}>{l}</span><span style={{color:"#ffd23f",fontSize:21,fontWeight:900,lineHeight:1.25,fontFamily:"'Arial Black',Arial,sans-serif"}}>{v}</span></div>))}
      </div>
      <div ref={roadRef} style={{flex:1,width:"100%",maxWidth:440,position:"relative",overflow:"hidden",cursor:"pointer"}}
        onMouseDown={e=>startDrag(e.clientX,e.clientY)} onMouseMove={e=>moveDrag(e.clientX,e.clientY)} onMouseUp={endDrag} onMouseLeave={endDrag}
        onTouchStart={e=>{if(paused)return;const t=e.touches[0]; if(!t)return; if(window.innerHeight - t.clientY < 90){doPause(); return;} e.preventDefault(); startDrag(t.clientX,t.clientY);}} onTouchMove={e=>{if(paused)return;const t=e.touches[0]; if(!t)return; e.preventDefault(); moveDrag(t.clientX,t.clientY);}} onTouchEnd={e=>{if(paused)return;e.preventDefault();endDrag();}}>
        <Road dashOffset={dashOff} blur={speedBlur}/>
        <div style={{position:"absolute",inset:0,pointerEvents:"none"}}><Scenery offset={scenOff} roadW={roadW}/></div>
        {signs.map(s=>{const cx=s.lane*LANE_W+LANE_W/2;const sc=signScale(s.y);return(<div key={s.id} style={{position:"absolute",left:`${cx}%`,top:`${s.y*100}%`,transform:`translate(-50%,-50%) scale(${sc.toFixed(3)})`,pointerEvents:"none",zIndex:10}}><SpeedSign speed={s.speed} state={s.state}/></div>);})}
        <div style={{position:"absolute",left:`${carXPct}%`,bottom:`${CAR_BOTTOM}%`,transform:`translateX(-50%) scale(${carPunch?1.08:1})`,transition:"left 0.12s cubic-bezier(.4,0,.2,1), transform 0.14s cubic-bezier(.34,1.56,.64,1)",zIndex:20,display:"flex",flexDirection:"column",alignItems:"center",gap:4,pointerEvents:"none"}}>
          <div style={{background:speedFlash?"rgba(255,210,64,0.95)":"rgba(27,17,60,0.85)",border:`2px solid ${speedFlash?"#ffd23f":"rgba(255,111,97,0.35)"}`,borderRadius:10,padding:"3px 10px"}}><span style={{color:speedFlash?"#1b1150":"#fff",fontSize:22,fontWeight:900,fontFamily:"'Arial Black',Arial,sans-serif"}}>{carSpeed}</span></div>
          <div style={{borderRadius:16}}><CarSVG lean={carLean}/></div>
        </div>
        {paused&&(
          <div onTouchStart={e=>{e.preventDefault();e.stopPropagation();}} style={{position:"absolute",inset:0,zIndex:90,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,8,40,0.82)",backdropFilter:"blur(4px)"}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:22,pointerEvents:"auto"}}>
              <div style={{fontFamily:"'Arial Black',Arial,sans-serif",fontWeight:900,fontSize:34,letterSpacing:5,backgroundImage:"linear-gradient(135deg,#ffd23f,#ff8f5c,#ff5da2)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>PAUSED</div>
              <button onClick={resumeGame} onTouchEnd={resumeGame} style={{background:"linear-gradient(135deg,#ffd23f,#ff8f5c,#ff5da2)",color:"#1b1150",border:"none",borderRadius:14,padding:"14px 36px",fontSize:15,fontWeight:900,letterSpacing:2,cursor:"pointer",fontFamily:"'Arial Black',Arial,sans-serif"}}>GO</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
