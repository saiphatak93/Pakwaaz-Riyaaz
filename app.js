"use strict";
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
let cfg,vibs=[],vibOf=[],marks=[],sel=0,curId=null,bpm=60;
let ctx=null,master,runGain,out,nbuf,timer=0,raf=0,state="stopped",nextT=0,idx=0,cycle=1,queue=[],shown=-1;
const AC=window.AudioContext||window.webkitAudioContext;
const KEY="pakhawajTaals.v1";let mem=[];

/* ---------- toast ---------- */
let tt;function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("on"),2200)}

/* ---------- taal model ---------- */
function make(name,n,vib,mk,pat,b,kit){
  const p=pat.split(/\s+/).filter(Boolean),c={name,n,vib,marks:mk,kit:kit||"bols",matras:Array.from({length:n},(_,i)=>({bol:p[i%p.length]||"Dha",snd:"auto",acc:false}))};
  cfg=c;recompute();vibStarts().forEach(i=>c.matras[i].acc=true);return {name,bpm:b,cfg:c};
}
function recompute(){
  const n=cfg.n,out=[];let s=0;
  for(const z of cfg.vib.split(/[\s,+]+/).map(x=>parseInt(x,10)).filter(x=>x>0)){if(s>=n)break;const k=Math.min(z,n-s);out.push(k);s+=k}
  const adj=s<n;if(adj)out.push(n-s);
  vibs=out;vibOf=[];out.forEach((z,j)=>{for(let k=0;k<z;k++)vibOf.push(j)});
  const tk=cfg.marks.split(/[\s,]+/).filter(Boolean);
  marks=out.map((_,j)=>{const t=(tk[j]||"").toUpperCase();if(j===0)return"X";if(t==="0")return"0";return/^\d+$/.test(t)?t:String(j+1)});
  const tot=cfg.vib.split(/[\s,+]+/).map(x=>parseInt(x,10)).filter(x=>x>0).reduce((a,b)=>a+b,0);
  $("#note").textContent=tot&&tot!==n?`Vibhags add up to ${tot}; adjusted to fit ${n} matras.`:"";
}
const vibStarts=()=>{const r=[];vibOf.forEach((v,i)=>{if(i===0||vibOf[i-1]!==v)r.push(i)});return r};
const markOf=i=>marks[vibOf[i]]||"X";
function labelOf(i){if(i===0)return["SAM","sam"];const m=markOf(i);return m==="0"?["KHALI","khali"]:["TALI "+m,"tali"]}

/* ---------- grid ---------- */
function cellHTML(i){
  const m=cfg.matras[i],st=i===0||vibOf[i]!==vibOf[i-1],mk=markOf(i),sym=st?(i===0?"×":mk==="0"?"○":mk):"";
  const cl=["c"];if(st)cl.push("vs",i===0?"sam":mk==="0"?"khali":"tali");if(m.acc||i===0)cl.push("acc");if(m.snd==="silent"||m.bol==="-")cl.push("sil");if(i===sel)cl.push("sel");if(i===cfg.n-1)cl.push("lastm");if(i===shown)cl.push("cur");
  return`<button class="${cl.join(" ")}" data-i="${i}" role="listitem"><i>${i+1}</i><b>${esc(m.bol)}</b><u>${sym}</u></button>`;
}
function renderGrid(){$("#grid").innerHTML=cfg.matras.map((_,i)=>cellHTML(i)).join("");renderSel()}
function renderCell(i){const g=$("#grid").children[i];if(g)g.outerHTML=cellHTML(i)}
function renderSel(){const m=cfg.matras[sel];$("#selL").textContent=`#${sel+1} of ${cfg.n}`;$("#mBol").value=m.bol;$("#mSnd").value=m.snd;$("#mAcc").checked=m.acc||sel===0;$("#mAcc").disabled=sel===0}
function syncForm(){$("#name").value=cfg.name;$("#n").value=cfg.n;$("#vib").value=cfg.vib;$("#marks").value=cfg.marks;$("#kit").value=cfg.kit;setBpm(bpm)}
function loadCfg(c,b,id){cfg=JSON.parse(JSON.stringify(c));curId=id||null;sel=0;shown=-1;if(b)bpm=b;recompute();syncForm();renderGrid();idle();renderPresets()}

/* ---------- audio ---------- */
function ensureCtx(){
  if(ctx)return true;if(!AC){toast("Web Audio is not supported in this browser.");return false}
  try{ctx=new AC({latencyHint:"interactive"})}catch(e){toast("Could not start audio.");return false}
  const comp=ctx.createDynamicsCompressor();master=ctx.createGain();master.connect(comp);comp.connect(ctx.destination);applyVol();
  nbuf=ctx.createBuffer(1,ctx.sampleRate*.4,ctx.sampleRate);const d=nbuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  out=master;return true;
}
function applyVol(){if(master)master.gain.setTargetAtTime($("#mute").checked?0:(+$("#vol").value/100)**1.5,ctx.currentTime,.015)}
function tone(t,f0,f1,d,type,pk,a=.003){const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);if(f1!==f0)o.frequency.exponentialRampToValueAtTime(f1,t+d);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(pk,.0002),t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);o.connect(g);g.connect(out);o.start(t);o.stop(t+a+d+.05)}
function noise(t,f,q,d,pk){const s=ctx.createBufferSource(),b=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=nbuf;b.type="bandpass";b.frequency.value=f;b.Q.value=q;g.gain.setValueAtTime(pk,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(b);b.connect(g);g.connect(out);s.start(t);s.stop(t+d+.02)}
function bell(t,p,base,dec){[1,2.76,5.4,8.93].forEach((m,k)=>tone(t,base*m,base*m,dec/(1+k*.6),"sine",p*[.5,.3,.15,.08][k],.002))}
function bolVoice(b,t,p){
  const s=b.toLowerCase();
  if(s.startsWith("dh")){tone(t,130,80,s.endsWith("n")?.6:.4,"sine",.9*p,.004);tone(t,340,330,.18,"triangle",.5*p);noise(t,2500,1,.03,.15*p)}
  else if(s[0]==="g"){tone(t,140,70,.45,"sine",.9*p,.004)}
  else if(s.startsWith("tin")){tone(t,520,515,.38,"triangle",.7*p);tone(t,1040,1040,.2,"sine",.15*p)}
  else if(s[0]==="n"||s.startsWith("ta")){tone(t,440,430,.17,"triangle",.7*p);noise(t,1800,1,.02,.2*p)}
  else if(s[0]==="k"){noise(t,2200,1.5,.05,.7*p);tone(t,700,500,.05,"sine",.3*p)}
  else{noise(t,3000,2,.04,.6*p);tone(t,620,520,.07,"triangle",.35*p)}
}
function playKit(kit,bol,acc,t){
  const p=acc?1.4:1;
  if(kit==="click")tone(t,acc?2400:1600,acc?2400:1600,.04,"square",.22*p,.001);
  else if(kit==="bell")bell(t,.5*p,acc?1046:784,.6);
  else if(kit==="clap"){noise(t,1400,1.2,.05,.9*p);noise(t+.012,1800,1.2,.07,.8*p)}
  else bolVoice(bol,t,p);
}
function playMatra(i,t){
  const m=cfg.matras[i]||{bol:"-",snd:"auto",acc:false},sam=i===0,kit=m.snd==="auto"?cfg.kit:m.snd;
  if(m.snd!=="silent"&&m.bol.trim()!=="-")playKit(kit,m.bol,m.acc||sam,t);
  if(sam){bell(t,.9,1320,2.4);tone(t,90,60,.5,"sine",.6)} /* TING + thump on Sam */
}

/* ---------- scheduler (look-ahead) ---------- */
function tick(){
  if(state!=="playing")return;
  out=runGain;
  while(nextT<ctx.currentTime+.15){
    if(idx>=cfg.n){idx=0;cycle++}
    playMatra(idx,nextT);queue.push({i:idx,t:nextT,c:cycle});
    nextT+=60/bpm;idx++;
    if(idx>=cfg.n){idx=0;cycle++}
  }
  timer=setTimeout(tick,25);
}
function frame(){
  if(state==="stopped")return;
  const now=ctx.currentTime-(ctx.outputLatency||0)-(ctx.baseLatency||0);let last=null;
  while(queue.length&&queue[0].t<=now)last=queue.shift();
  if(last)show(last.i,last.c);
  raf=requestAnimationFrame(frame);
}
function show(i,c){
  const n=cfg.n,m=cfg.matras[i];if(!m)return;
  const old=$("#grid").children[shown],nw=$("#grid").children[i];
  if(old)old.classList.remove("cur");shown=i;
  if(nw){nw.classList.add("cur");const g=$("#grid");if(nw.offsetTop<g.scrollTop||nw.offsetTop+nw.offsetHeight>g.scrollTop+g.clientHeight)g.scrollTop=nw.offsetTop-g.clientHeight/2}
  $("#num").textContent=i+1;$("#bol").textContent=m.bol==="-"?"(rest)":m.bol;$("#cyc").textContent=c;
  $("#pos-tag").textContent=`${i+1} / ${n}`;
  const[l,k]=labelOf(i),tg=$("#cur-tag");tg.textContent=l;tg.className="tag "+k+(vibOf[i]!==undefined?"":"");
  $("#last-tag").hidden=i!==n-1;$("#bar i").style.width=((i+1)/n*100)+"%";
  const cd=$("#cd"),rem=n-i;
  if($("#cdOn").checked&&n>=4&&rem<=3){cd.textContent=rem;cd.classList.remove("on");void cd.offsetWidth;cd.classList.add("on")}else cd.classList.remove("on");
  if(i===0){const d=$("#disp");d.classList.remove("sam");void d.offsetWidth;d.classList.add("sam")}
}
function idle(){shown=-1;$("#num").textContent="–";$("#bol").innerHTML="&nbsp;";$("#cyc").textContent="–";$("#pos-tag").textContent=`– / ${cfg.n}`;$("#cur-tag").textContent="Ready";$("#cur-tag").className="tag";$("#last-tag").hidden=true;$("#bar i").style.width="0";$("#cd").classList.remove("on");document.querySelectorAll(".c.cur").forEach(e=>e.classList.remove("cur"))}
function buttons(){const s=state;$("#bStart").disabled=s!=="stopped";$("#bPause").disabled=s!=="playing";$("#bResume").disabled=s!=="paused";$("#bStop").disabled=s==="stopped"}

/* ---------- transport ---------- */
function start(){
  if(state!=="stopped")return;            /* blocks duplicate playback */
  if(!ensureCtx())return;
  state="starting";buttons();
  ctx.resume().then(()=>{
    if(state!=="starting")return;
    runGain=ctx.createGain();runGain.connect(master);
    idx=0;cycle=1;queue=[];nextT=ctx.currentTime+.1;state="playing";buttons();tick();raf=requestAnimationFrame(frame);
  }).catch(()=>{state="stopped";buttons();toast("Browser blocked audio. Tap Start again.")});
}
function pause(){if(state!=="playing")return;state="paused";clearTimeout(timer);ctx.suspend();buttons()}
function resume(){if(state!=="paused")return;state="playing";buttons();ctx.resume().then(()=>{if(state==="playing"){clearTimeout(timer);tick()}})}
function stop(){
  state="stopped";clearTimeout(timer);cancelAnimationFrame(raf);queue=[];
  if(runGain){try{runGain.disconnect()}catch(e){}runGain=null}
  if(ctx&&ctx.state==="suspended")ctx.resume();
  idle();buttons();
}
function reset(){stop();bpm=60;$("#vol").value=80;$("#mute").checked=false;setBpm(60);applyVol();toast("Reset to matra 1, 60 BPM")}

/* ---------- tempo ---------- */
function setBpm(v){v=parseFloat(v);if(!isFinite(v)){toast("Enter a valid tempo");v=bpm}
  const c=clamp(Math.round(v),10,600);if(c!==v)toast("Tempo limited to 10–600");bpm=c;$("#bpmN").value=c;$("#bpmR").value=c}

/* ---------- presets ---------- */
function load(){try{const r=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(r))return r}catch(e){}return mem}
function store(a){mem=a;try{localStorage.setItem(KEY,JSON.stringify(a))}catch(e){toast("Storage unavailable; presets kept for this session only")}}
function seed(){
  let a=load();if(a.length)return a;
  const mk=(...x)=>{const o=make(...x);return{id:Math.random().toString(36).slice(2),name:o.name,bpm:o.bpm,cfg:o.cfg}};
  a=[mk("Chautal",12,"2,2,2,2,2,2","X,0,2,0,3,4","Dha Dha Din Ta Kit Dha Din Ta Tit Kat Gadi Gena",60),
     mk("Teental",16,"4,4,4,4","X,2,0,3","Dha Dhin Dhin Dha Dha Dhin Dhin Dha Dha Tin Tin Ta Ta Dhin Dhin Dha",90),
     mk("Long cycle (200)",200,Array(25).fill(8).join(","),"X","Dha Dhin Dhin Dha Ge Na Dha -",120)];
  store(a);return a;
}
function renderPresets(){
  const a=load();$("#presets").innerHTML=a.length?a.map(p=>`<div class="p"><span>${p.id===curId?"● ":""}${esc(p.name)} <small>${p.cfg.n} matras · ${p.bpm} bpm</small></span><button data-a="edit" data-id="${p.id}">Edit</button><button data-a="dup" data-id="${p.id}">Copy</button><button class="dng" data-a="del" data-id="${p.id}">Delete</button></div>`).join(""):'<p style="color:var(--mut)">No saved taals yet.</p>';
}
function save(asNew){
  const nm=$("#name").value.trim();if(!nm){toast("Give the taal a name first");return}cfg.name=nm;
  const a=load(),rec={id:curId&&!asNew?curId:Math.random().toString(36).slice(2),name:nm,bpm,cfg:JSON.parse(JSON.stringify(cfg))},k=a.findIndex(p=>p.id===rec.id);
  if(k>=0)a[k]=rec;else a.push(rec);curId=rec.id;store(a);renderPresets();toast("Saved “"+nm+"”");
}

/* ---------- events ---------- */
$("#bStart").onclick=start;$("#bPause").onclick=pause;$("#bResume").onclick=resume;$("#bStop").onclick=stop;$("#bReset").onclick=reset;
$("#bpmN").onchange=e=>setBpm(e.target.value);$("#bpmR").oninput=e=>setBpm(e.target.value);
$("#vol").oninput=applyVol;$("#mute").onchange=applyVol;
$("#kit").onchange=e=>cfg.kit=e.target.value;
$("#name").oninput=e=>cfg.name=e.target.value;
$("#n").onchange=e=>{
  let v=parseInt(e.target.value,10);if(!isFinite(v)||v<1){toast("Matras must be a whole number from 1 to 2000");e.target.value=cfg.n;return}
  if(v>2000){v=2000;toast("Limited to 2000 matras")}
  const p=$("#pat").value.split(/\s+/).filter(Boolean),m=cfg.matras;
  while(m.length<v)m.push({bol:p.length?p[m.length%p.length]:"Dha",snd:"auto",acc:false});m.length=v;cfg.n=v;
  if(idx>=v)idx=0;sel=Math.min(sel,v-1);e.target.value=v;recompute();renderGrid();shown=-1;if(state==="stopped")idle();else $("#pos-tag").textContent=`${shown+1} / ${v}`;
};
$("#vib").onchange=e=>{cfg.vib=e.target.value;recompute();renderGrid()};
$("#marks").onchange=e=>{cfg.marks=e.target.value;recompute();renderGrid()};
$("#bPat").onclick=()=>{const p=$("#pat").value.split(/\s+/).filter(Boolean);if(!p.length){toast("Type some bols first, e.g. Dha Dhin Dhin Dha");return}cfg.matras.forEach((m,i)=>m.bol=p[i%p.length].slice(0,12));renderGrid()};
$("#bAcc").onclick=()=>{cfg.matras.forEach(m=>m.acc=false);vibStarts().forEach(i=>cfg.matras[i].acc=true);renderGrid();toast("Vibhag starts accented")};
$("#grid").onclick=e=>{const b=e.target.closest(".c");if(!b)return;const o=sel;sel=+b.dataset.i;renderCell(o);renderCell(sel);renderSel()};
$("#mBol").oninput=e=>{cfg.matras[sel].bol=e.target.value.trim()||"-";renderCell(sel)};
$("#mSnd").onchange=e=>{cfg.matras[sel].snd=e.target.value;renderCell(sel)};
$("#mAcc").onchange=e=>{cfg.matras[sel].acc=e.target.checked;renderCell(sel)};
$("#bPrev").onclick=()=>{if(!ensureCtx())return;ctx.resume().then(()=>{out=master;playMatra(sel,ctx.currentTime+.02)})};
$("#bSave").onclick=()=>save(false);$("#bSaveNew").onclick=()=>save(true);
$("#bNew").onclick=()=>{stop();const o=make("New taal",16,"4,4,4,4","X,2,0,3","Dha Dhin Dhin Dha",80);loadCfg(o.cfg,60,null)};
$("#presets").onclick=e=>{const b=e.target.closest("button");if(!b)return;const a=load(),p=a.find(x=>x.id===b.dataset.id);if(!p)return;
  if(b.dataset.a==="edit"){stop();loadCfg(p.cfg,p.bpm,p.id)}
  else if(b.dataset.a==="dup"){const c=JSON.parse(JSON.stringify(p));c.id=Math.random().toString(36).slice(2);c.name=p.name+" copy";c.cfg.name=c.name;a.push(c);store(a);renderPresets();toast("Duplicated")}
  else{store(a.filter(x=>x.id!==p.id));if(curId===p.id)curId=null;renderPresets();toast("Deleted “"+p.name+"”")}};
document.addEventListener("keydown",e=>{if(e.code==="Space"&&!/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)){e.preventDefault();state==="stopped"?start():state==="playing"?pause():resume()}});
document.addEventListener("visibilitychange",()=>{/* scheduler keeps running via audio clock; nothing to do */});

/* ---------- init ---------- */
if(!AC)toast("Web Audio API unavailable: audio disabled in this browser.");
const first=seed()[0];loadCfg(first.cfg,first.bpm,first.id);buttons();