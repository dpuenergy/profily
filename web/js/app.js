// web/js/app.js  –  v5.0
'use strict';

const API_CHAT = window.location.protocol === 'file:' ? 'http://localhost:3000/api/chat' : '/api/chat';

const MONTHS  = ['Led','Úno','Bře','Dub','Kvě','Čvn','Čvc','Srp','Zář','Říj','Lis','Pro'];
const DAYS    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAYS_CZ = ['Po','Út','St','Čt','Pá','So','Ne'];
const DOW_JS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const UNITS_MAP = {
  electricity: [{ value:'MWh', label:'MWh' }, { value:'kWh', label:'kWh' }],
  gas:         [{ value:'MWh', label:'MWh' }, { value:'kWh', label:'kWh' }],
  heat:        [{ value:'GJ',  label:'GJ'  }, { value:'MWh', label:'MWh' }],
  water:       [{ value:'m3',  label:'m³'  }],
};

// ─── Dynamic year ─────────────────────────────────────────────────────────────
let currentYear = 2025;

function isLeapYear(y)  { return (y%4===0&&y%100!==0)||y%400===0; }
function yearHours(y)   { return isLeapYear(y) ? 8784 : 8760; }
function computeMonthHourStarts(y) {
  const s=[0]; for(let m=0;m<11;m++) s.push(s[m]+new Date(y,m+1,0).getDate()*24); return s;
}
function easterDate(y) {
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4;
  const l=(32+2*e+2*i-h-k)%7,mn=Math.floor((a+11*h+22*l)/451);
  const mo=Math.floor((h+l-7*mn+114)/31),dy=((h+l-7*mn+114)%31)+1;
  return new Date(y,mo-1,dy);
}
function getCzHolidays(y) {
  const e=easterDate(y),gf=new Date(e),em=new Date(e);
  gf.setDate(e.getDate()-2); em.setDate(e.getDate()+1);
  const f=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return new Set([`${y}-01-01`,f(gf),f(em),`${y}-05-01`,`${y}-05-08`,
    `${y}-07-05`,`${y}-07-06`,`${y}-09-28`,`${y}-10-28`,`${y}-11-17`,
    `${y}-12-24`,`${y}-12-25`,`${y}-12-26`]);
}
let CZ_HOLIDAYS = getCzHolidays(currentYear);

// ─── State ────────────────────────────────────────────────────────────────────
let baseProfile     = null;
let editedMonthly   = Array(12).fill(1/12);
let editedDow       = Object.fromEntries(DAYS.map(d=>[d,1/7]));
let editedHourly    = Array(24).fill(1.0);
let editedHourlyNW  = Array(24).fill(1.0);
let monthlyKnown    = null;
let baseloadFrac    = 0;
let vacations       = [];
let weeklyOverrides = {};
let weekEditMode    = 'all';
let currentWeekIdx  = 0;
let holidaysAsNW    = true;
let chatHistory     = [];
let currentUnit     = null;
let charts          = {};
let measuredHours   = null;   // Float64Array(yearHours) | null, NaN = not measured

const $ = id => document.getElementById(id);

// ─── Normalization ────────────────────────────────────────────────────────────
function normSum(arr) { const s=arr.reduce((a,b)=>a+b,0); return s>0?arr.map(v=>v/s):arr.map(()=>1/arr.length); }
function normMax(arr) { const m=Math.max(...arr,1e-9); return arr.map(v=>v/m); }

// ─── Units ────────────────────────────────────────────────────────────────────
function getUnitOpts()  { return UNITS_MAP[$('medium').value]||UNITS_MAP.electricity; }
function getUnitDef()   { return getUnitOpts().find(o=>o.value===currentUnit)||getUnitOpts()[0]; }
function getUnitLabel() { return getUnitDef().label; }
function getAnnualInternal() { const r=parseFloat($('annual').value); return(!r||r<=0)?null:r; }
function updateUnitSelect() {
  const opts=getUnitOpts(), sel=$('unitSelect');
  sel.innerHTML=opts.map(o=>`<option value="${o.value}">${o.label}</option>`).join('');
  currentUnit=opts.find(o=>o.value===currentUnit)?currentUnit:opts[0].value;
  sel.value=currentUnit; $('unitLabel').textContent=getUnitLabel();
}

// ─── Date utils ───────────────────────────────────────────────────────────────
function fmtDate(y,m0,d) { return `${y}-${String(m0+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function hourToDate(h)   { return new Date(currentYear,0,1,h); }
function dateToHourIdx(s) {
  const [y,m,d]=s.split('-').map(Number);
  return Math.max(0,Math.round((new Date(y,m-1,d)-new Date(currentYear,0,1))/86400000))*24;
}
function isNonWorkingDay(m0,day) {
  const dow=new Date(currentYear,m0,day).getDay();
  return dow===0||dow===6||(holidaysAsNW&&CZ_HOLIDAYS.has(fmtDate(currentYear,m0,day)));
}
function getVacationFactor(m0,day) {
  const ds=fmtDate(currentYear,m0,day);
  for(const v of vacations) if(ds>=v.from&&ds<=v.to) return v.factor;
  return 1.0;
}
function getWeekIdx(m0,day) {
  return Math.floor(Math.round((new Date(currentYear,m0,day)-new Date(currentYear,0,1))/86400000)/7);
}
function getDowWeightForDay(m0,day) {
  const name=DOW_JS[new Date(currentYear,m0,day).getDay()], wi=getWeekIdx(m0,day);
  return (weeklyOverrides[wi]?weeklyOverrides[wi][name]:null)??editedDow[name];
}
function getWeekLabel(wi) {
  const s=new Date(currentYear,0,1+wi*7),e=new Date(currentYear,0,1+wi*7+6);
  const f=d=>`${d.getDate()}.${d.getMonth()+1}.`;
  return `Týden ${wi+1} · ${f(s)}–${f(e)}`;
}

// ─── Baseload ────────────────────────────────────────────────────────────────
function withBaseload(h) { return baseloadFrac>0?h.map(v=>baseloadFrac+(1-baseloadFrac)*v):h; }

// ─── Year series ──────────────────────────────────────────────────────────────
// overlayMeasured=true (default) → measured hours replace model in CSV/total
// overlayMeasured=false → pure model (used for chart dataset[0])
function buildYearValues(overlayMeasured=true) {
  const monthly=monthlyKnown?normSum(monthlyKnown.map(v=>Math.max(0,v||0))):editedMonthly;
  const ann=getAnnualInternal();
  const wp=withBaseload(editedHourly),ws=wp.reduce((a,b)=>a+b,0)||1;
  const np=withBaseload(editedHourlyNW),ns=np.reduce((a,b)=>a+b,0)||1;
  const vals=[];
  for(let m=0;m<12;m++) {
    const dim=new Date(currentYear,m+1,0).getDate();
    const mE=ann?monthly[m]*ann:monthly[m];
    let dms=0;
    for(let d=1;d<=dim;d++) dms+=getDowWeightForDay(m,d)*getVacationFactor(m,d);
    for(let d=1;d<=dim;d++) {
      const nw=isNonWorkingDay(m,d);
      const dE=mE*getDowWeightForDay(m,d)*getVacationFactor(m,d)/(dms||1);
      const pr=nw?np:wp, pS=nw?ns:ws;
      for(let h=0;h<24;h++) vals.push(dE*pr[h]/pS);
    }
  }
  if(overlayMeasured&&measuredHours) {
    for(let i=0;i<Math.min(vals.length,measuredHours.length);i++) {
      if(!isNaN(measuredHours[i])) vals[i]=measuredHours[i];
    }
  }
  return vals;
}

// ─── Chart updates ────────────────────────────────────────────────────────────
function updateYearChart() {
  if(!charts.year) return;
  const ann=getAnnualInternal(), unit=getUnitLabel();
  const modelVals=buildYearValues(false);

  // Dataset 0: model (NaN where measured so line breaks there)
  // Dataset 1: measured data only
  const modelPts=[], measPts=[];
  for(let i=0;i<modelVals.length;i++) {
    const hasMeas=measuredHours&&!isNaN(measuredHours[i]);
    modelPts.push({x:i, y: hasMeas ? NaN : modelVals[i]});
    if(hasMeas) measPts.push({x:i, y:measuredHours[i]});
  }
  charts.year.data.datasets[0].data=modelPts;
  charts.year.data.datasets[1].data=measPts;
  charts.year.options.scales.y.title.text=ann?`${unit}/h`:'rel.';
  charts.year.update('none');
}
function updateMonthlyChart() { if(charts.monthly){charts.monthly.data.datasets[0].data=[...editedMonthly];charts.monthly.update('none');} }
function updateDowChart() {
  if(!charts.dow) return;
  const src=(weekEditMode==='week'&&weeklyOverrides[currentWeekIdx])?weeklyOverrides[currentWeekIdx]:editedDow;
  charts.dow.data.datasets[0].data=DAYS.map(d=>src[d]); charts.dow.update('none');
}
function updateHourlyChart()   { if(charts.hourly)  {charts.hourly.data.datasets[0].data=[...editedHourly];   charts.hourly.update('none');}  }
function updateHourlyNWChart() { if(charts.hourlyNW){charts.hourlyNW.data.datasets[0].data=[...editedHourlyNW];charts.hourlyNW.update('none');} }
function refreshAll() { updateMonthlyChart();updateDowChart();updateHourlyChart();updateHourlyNWChart();updateYearChart(); }

// ─── DOW week edit ────────────────────────────────────────────────────────────
function getCurrentDow() { return (weekEditMode==='week'&&weeklyOverrides[currentWeekIdx])?{...weeklyOverrides[currentWeekIdx]}:{...editedDow}; }
function setCurrentDow(d) { if(weekEditMode==='week') weeklyOverrides[currentWeekIdx]={...d}; else editedDow={...d}; }

// ─── Drag configs ─────────────────────────────────────────────────────────────
function makeMonthlyDragCfg() {
  return {dragData:{round:5,showTooltip:true,
    onDrag(_,__,i,v){editedMonthly[i]=Math.max(0,v);updateYearChart();},
    onDragEnd(_,__,i,v){editedMonthly[i]=Math.max(0,v);editedMonthly=normSum(editedMonthly);updateMonthlyChart();updateYearChart();},
  }};
}
function makeDowDragCfg() {
  return {dragData:{round:5,showTooltip:true,
    onDrag(_,__,i,v){const c=getCurrentDow();c[DAYS[i]]=Math.max(0,v);setCurrentDow(c);updateYearChart();},
    onDragEnd(_,__,i,v){const c=getCurrentDow();c[DAYS[i]]=Math.max(0,v);const nv=normSum(DAYS.map(d=>c[d]));const n={};DAYS.forEach((d,j)=>{n[d]=nv[j];});setCurrentDow(n);updateDowChart();updateYearChart();},
  }};
}
function makeHourlyWorkDragCfg() {
  return {dragData:{round:4,showTooltip:true,
    onDrag(_,__,i,v){editedHourly[i]=Math.max(0,Math.min(1,v));updateYearChart();},
    onDragEnd(_,__,i,v){editedHourly[i]=Math.max(0,Math.min(1,v));editedHourly=normMax(editedHourly);updateHourlyChart();updateYearChart();},
  }};
}
function makeHourlyNWDragCfg() {
  return {dragData:{round:4,showTooltip:true,
    onDrag(_,__,i,v){editedHourlyNW[i]=Math.max(0,Math.min(1,v));updateYearChart();},
    onDragEnd(_,__,i,v){editedHourlyNW[i]=Math.max(0,Math.min(1,v));editedHourlyNW=normMax(editedHourlyNW);updateHourlyNWChart();updateYearChart();},
  }};
}

// ─── Year range pickers ───────────────────────────────────────────────────────
function updateYearRange() {
  const fv=$('yearFrom').value, tv=$('yearTo').value, h=yearHours(currentYear);
  charts.year.options.scales.x.min=fv?dateToHourIdx(fv):0;
  charts.year.options.scales.x.max=tv?Math.min(dateToHourIdx(tv)+23,h-1):h-1;
  charts.year.update('none');
}
function resetYearRange() {
  $('yearFrom').value=''; $('yearTo').value='';
  charts.year.options.scales.x.min=0; charts.year.options.scales.x.max=yearHours(currentYear)-1;
  charts.year.update('none');
}
function onYearChange() {
  currentYear=parseInt($('yearSelect').value,10);
  CZ_HOLIDAYS=getCzHolidays(currentYear);
  weeklyOverrides={};
  const ys=String(currentYear);
  ['yearFrom','yearTo'].forEach(id=>{$(id).min=`${ys}-01-01`;$(id).max=`${ys}-12-31`;$(id).value='';});
  charts.year.options.scales.x.min=0; charts.year.options.scales.x.max=yearHours(currentYear)-1;
  if(editedMonthly) updateYearChart();
  updateWeekNav();
}

// ─── Chart init ───────────────────────────────────────────────────────────────
function initCharts() {
  const barOpts={responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{callback:v=>(v*100).toFixed(1)+'%'}}}};
  charts.monthly=new Chart($('chartMonthly'),{type:'bar',
    data:{labels:MONTHS,datasets:[{data:[...editedMonthly],backgroundColor:'#3b82f6',hoverBackgroundColor:'#2563eb'}]},
    options:{...barOpts,plugins:{...barOpts.plugins,...makeMonthlyDragCfg()},scales:{y:{...barOpts.scales.y,min:0,max:0.30}}},
  });
  charts.dow=new Chart($('chartDow'),{type:'bar',
    data:{labels:DAYS_CZ,datasets:[{data:DAYS.map(d=>editedDow[d]),backgroundColor:'#10b981',hoverBackgroundColor:'#059669'}]},
    options:{...barOpts,plugins:{...barOpts.plugins,...makeDowDragCfg()},scales:{y:{...barOpts.scales.y,min:0,max:0.35}}},
  });
  const lineOpts={responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},
    scales:{y:{beginAtZero:true,min:0,max:1.05,ticks:{callback:v=>(v*100).toFixed(0)+'%'}}}};
  const lineLabels=Array.from({length:24},(_,i)=>i+'h');
  charts.hourly=new Chart($('chartHourly'),{type:'line',
    data:{labels:lineLabels,datasets:[{data:[...editedHourly],borderColor:'#f59e0b',backgroundColor:'rgba(245,158,11,0.15)',fill:true,tension:0.35,pointRadius:5,pointHoverRadius:7,pointBackgroundColor:'#f59e0b'}]},
    options:{...lineOpts,plugins:{...lineOpts.plugins,...makeHourlyWorkDragCfg()}},
  });
  charts.hourlyNW=new Chart($('chartHourlyNW'),{type:'line',
    data:{labels:lineLabels,datasets:[{data:[...editedHourlyNW],borderColor:'#8b5cf6',backgroundColor:'rgba(139,92,246,0.15)',fill:true,tension:0.35,pointRadius:5,pointHoverRadius:7,pointBackgroundColor:'#8b5cf6'}]},
    options:{...lineOpts,plugins:{...lineOpts.plugins,...makeHourlyNWDragCfg()}},
  });

  // Year chart – two datasets: model (indigo) + measured (green)
  charts.year=new Chart($('chartYear'),{
    type:'line',
    data:{datasets:[
      {data:[],borderColor:'#6366f1',backgroundColor:'rgba(99,102,241,0.08)',fill:true,tension:0,pointRadius:0,borderWidth:1,spanGaps:false,label:'Model'},
      {data:[],borderColor:'#10b981',backgroundColor:'transparent',fill:false,tension:0,pointRadius:0,borderWidth:2,spanGaps:false,label:'Naměřeno'},
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,parsing:false,
      plugins:{legend:{display:false},decimation:{enabled:true,algorithm:'min-max'}},
      scales:{
        x:{type:'linear',min:0,max:yearHours(currentYear)-1,
          afterBuildTicks(axis){
            const range=axis.max-axis.min, mhs=computeMonthHourStarts(currentYear);
            if(range<=21*24){
              const t=[];for(let h=Math.floor(axis.min/24)*24;h<=axis.max+24;h+=24)t.push({value:h});axis.ticks=t;
            } else if(range<=93*24){
              const t=[];for(let h=0;h<yearHours(currentYear);h+=7*24){if(h>=axis.min-24&&h<=axis.max+168)t.push({value:h});}axis.ticks=t;
            } else {axis.ticks=mhs.map(v=>({value:v}));}
          },
          ticks:{maxRotation:0,callback(val){
            const range=this.max-this.min;
            if(range<=93*24){const d=hourToDate(val);return`${d.getDate()}.${d.getMonth()+1}.`;}
            const idx=computeMonthHourStarts(currentYear).indexOf(val);
            return idx>=0?MONTHS[idx]:'';
          }},
          grid:{color:'rgba(0,0,0,0.06)'},
        },
        y:{beginAtZero:true,title:{display:true,text:'rel.',font:{size:11}},ticks:{maxTicksLimit:6}},
      },
    },
  });
}

// ─── Apply profile ────────────────────────────────────────────────────────────
function applyProfile(profile) {
  baseProfile=profile; editedMonthly=[...profile.monthly]; editedDow={...profile.dow};
  editedHourly=[...profile.hourly]; editedHourlyNW=[...profile.hourly]; weeklyOverrides={};

  // Populate monthly inputs with absolute values when annual is known
  const ann=getAnnualInternal();
  const inputs=[...document.querySelectorAll('.mi-input')];
  if(ann&&ann>0) {
    profile.monthly.forEach((v,i)=>{ if(inputs[i]) inputs[i].value=(v*ann).toFixed(2); });
    monthlyKnown=inputs.map(i=>parseFloat(i.value)||0);
    const panel=$('advPanel');
    if(panel.style.display==='none'){panel.style.display='';$('advIcon').textContent='▾';}
  }

  refreshAll();
  const type=profile.meta?.object_type||'', notes=profile.meta?.notes||'';
  appendMsg('system',`✓ Profil vygenerován: ${type}${notes?' — '+notes:''}`);
  if(ann&&ann>0) appendMsg('system','→ Měsíční hodnoty přeneseny do Rozšířených nastavení.');
}

// ─── Extracted data handler ───────────────────────────────────────────────────
function handleExtracted(ext) {
  if(!ext||typeof ext!=='object') return;

  // Annual consumption
  if(typeof ext.annual==='number'&&ext.annual>0&&!$('annual').value) {
    $('annual').value=ext.annual.toFixed(0);
    if(ext.unit) {
      const found=getUnitOpts().find(o=>o.label===ext.unit||o.value===ext.unit);
      if(found){currentUnit=found.value;updateUnitSelect();}
    }
    if(editedMonthly) updateYearChart();
  }

  // Vacation periods
  if(Array.isArray(ext.vacations)&&ext.vacations.length>0) {
    let added=0;
    ext.vacations.forEach(v=>{
      if(!v.from||!v.to) return;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(v.from)||!/^\d{4}-\d{2}-\d{2}$/.test(v.to)) return;
      if(v.from>v.to) return;
      // Deduplicate
      if(vacations.find(e=>e.from===v.from&&e.to===v.to)) return;
      const factor=Math.max(0,Math.min(1,Number(v.factor)||0));
      vacations.push({from:v.from,to:v.to,factor,label:v.label||''});
      addVacationRow({from:v.from,to:v.to,factor,label:v.label||''});
      added++;
    });
    if(added>0){syncVacations();appendMsg('system',`→ Přidáno ${added} období útlumu do Rozšířených nastavení.`);}
  }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function appendMsg(role,text) {
  const el=document.createElement('div');
  el.className=role==='system'?'chat-msg chat-msg--system':`chat-msg chat-msg--${role}`;
  el.textContent=text;
  $('chatMessages').appendChild(el);
  $('chatMessages').scrollTop=$('chatMessages').scrollHeight;
  if(role==='user'||role==='assistant') chatHistory.push({role,content:text});
}

async function callChat() {
  const btn=$('btnChatSend'); btn.disabled=true; btn.textContent='…';
  const typing=document.createElement('div');
  typing.className='chat-msg chat-msg--assistant chat-msg--typing';
  typing.innerHTML='<span></span><span></span><span></span>';
  $('chatMessages').appendChild(typing); $('chatMessages').scrollTop=$('chatMessages').scrollHeight;
  try {
    const res=await fetch(API_CHAT,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({history:chatHistory,medium:$('medium').value,annual:$('annual').value||'',year:String(currentYear)}),
    });
    typing.remove();
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||`HTTP ${res.status}`);}
    const data=await res.json();
    handleExtracted(data.extracted);
    if(data.type==='question') {
      appendMsg('assistant',data.text);
    } else {
      const {type:_t,extracted:_e,...profile}=data;
      applyProfile(profile);
    }
  } catch(e){typing.remove();appendMsg('assistant','✗ Chyba: '+e.message);}
  finally{btn.disabled=false;btn.textContent='Odeslat';}
}

function sendChatMessage() {
  const inp=$('chatInput'),text=inp.value.trim(); if(!text) return;
  inp.value=''; appendMsg('user',text); callChat();
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportCSV() {
  const ann=getAnnualInternal();
  const unit=getUnitLabel(), vals=buildYearValues(true);
  const colHeader=ann?`Spotřeba [${unit}/h]`:'Spotřeba [rel.]';
  const rows=[['Datum a čas',colHeader]]; let idx=0;
  for(let m=0;m<12;m++){
    const days=new Date(currentYear,m+1,0).getDate();
    for(let d=1;d<=days;d++){
      const ds=fmtDate(currentYear,m,d);
      for(let h=0;h<24;h++) rows.push([`${ds} ${String(h).padStart(2,'0')}:00`,(vals[idx++]||0).toFixed(5)]);
    }
  }
  const csv=rows.map(r=>r.join(';')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`profil_${currentYear}_${Date.now()}.csv`; a.click();
}

// ─── Measured data import ─────────────────────────────────────────────────────
function parseDT(s) {
  s=s.trim(); let m;
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})/);
  if(m) return new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);
  m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(\d{1,2}):(\d{2})/);
  if(m) return new Date(+m[3],+m[2]-1,+m[1],+m[4],+m[5]);
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m) return new Date(+m[1],+m[2]-1,+m[3],0,0);
  m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(m) return new Date(+m[3],+m[2]-1,+m[1],0,0);
  return null;
}

function parseMeasuredCSV(text) {
  const lines=text.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2) throw new Error('Soubor neobsahuje data');
  const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';
  const headers=lines[0].split(sep).map(h=>h.trim().replace(/^["']+|["']+$/g,'').toLowerCase());

  // Find datetime and value columns
  const dtNames=['datum a čas','datum_a_čas','datetime','date','datum','timestamp','cas','čas'];
  const valNames=['spotřeba','spotreba','value','hodnota','kwh','mwh','gj','m3','consumption','energia'];
  let dtCol=headers.findIndex(h=>dtNames.some(n=>h.includes(n)));
  let valCol=headers.findIndex(h=>valNames.some(n=>h.includes(n)));
  if(dtCol<0) dtCol=0;
  if(valCol<0) valCol=dtCol===0?1:0;

  const hourlyData={};
  let parsed=0,skipped=0;
  const jan1=new Date(currentYear,0,1);

  for(let i=1;i<lines.length;i++){
    const cells=lines[i].split(sep).map(c=>c.trim().replace(/^["']+|["']+$/g,''));
    if(cells.length<=Math.max(dtCol,valCol)){skipped++;continue;}
    const val=parseFloat((cells[valCol]||'').replace(',','.'));
    if(isNaN(val)){skipped++;continue;}
    const dt=parseDT(cells[dtCol]);
    if(!dt){skipped++;continue;}
    const hi=Math.floor((dt-jan1)/3600000);
    if(hi<0||hi>=yearHours(currentYear)){skipped++;continue;}
    if(!hourlyData[hi]) hourlyData[hi]={sum:0,count:0};
    hourlyData[hi].sum+=val; hourlyData[hi].count++;
    parsed++;
  }
  return {hourlyData,parsed,skipped};
}

function applyMeasuredData(hourlyData) {
  const totalH=yearHours(currentYear);
  const mh=new Float64Array(totalH).fill(NaN);
  for(const [h,d] of Object.entries(hourlyData)) mh[+h]=d.sum;
  measuredHours=mh;

  // Calibrate monthly distribution
  const mhs=computeMonthHourStarts(currentYear);
  const monthTotals=Array(12).fill(null);
  for(let m=0;m<12;m++){
    const mStart=mhs[m], mEnd=m<11?mhs[m+1]:totalH;
    let sum=0,missing=0;
    for(let hi=mStart;hi<mEnd;hi++){if(isNaN(mh[hi]))missing++;else sum+=mh[hi];}
    const cov=1-missing/(mEnd-mStart);
    if(cov>=0.7) monthTotals[m]=sum/cov;
  }

  // Update monthly inputs with measured data
  const inputs=[...document.querySelectorAll('.mi-input')];
  monthTotals.forEach((v,i)=>{if(v!==null&&inputs[i])inputs[i].value=v.toFixed(2);});

  if(monthTotals.some(v=>v!==null)){
    const filledVals=inputs.map(i=>parseFloat(i.value)||0);
    monthlyKnown=filledVals;
    editedMonthly=normSum(filledVals.map(v=>Math.max(0,v)));
    // Estimate annual if not set
    if(!$('annual').value){
      const measCount=monthTotals.filter(v=>v!==null).length;
      const measSum=monthTotals.reduce((a,v)=>a+(v||0),0);
      if(measCount>0) $('annual').value=Math.round(measSum/measCount*12).toFixed(0);
    }
    // Open advanced panel and monthly inputs to show what was filled
    const panel=$('advPanel');
    if(panel.style.display==='none'){panel.style.display='';$('advIcon').textContent='▾';}
  }

  // Calibrate hourly shapes from fully-measured days
  const wSum=Array(24).fill(0),wCnt=Array(24).fill(0);
  const nwSum=Array(24).fill(0),nwCnt=Array(24).fill(0);
  for(let m=0;m<12;m++){
    const dim=new Date(currentYear,m+1,0).getDate();
    for(let d=1;d<=dim;d++){
      const dayOfYear=Math.round((new Date(currentYear,m,d)-new Date(currentYear,0,1))/86400000);
      const dayStart=dayOfYear*24;
      const nw=isNonWorkingDay(m,d);
      let ok=true;
      for(let h=0;h<24;h++){if(dayStart+h>=totalH||isNaN(mh[dayStart+h])){ok=false;break;}}
      if(!ok) continue;
      for(let h=0;h<24;h++){
        if(nw){nwSum[h]+=mh[dayStart+h];nwCnt[h]++;}
        else  {wSum[h] +=mh[dayStart+h];wCnt[h]++; }
      }
    }
  }
  if(Math.min(...wCnt)>=5){
    const s=wSum.map((v,h)=>wCnt[h]>0?v/wCnt[h]:0);
    if(Math.max(...s)>0){editedHourly=normMax(s);}
  }
  if(Math.min(...nwCnt)>=5){
    const s=nwSum.map((v,h)=>nwCnt[h]>0?v/nwCnt[h]:0);
    if(Math.max(...s)>0){editedHourlyNW=normMax(s);}
  }
  refreshAll();
}

function onFileInput(e) {
  const file=e.target.files[0]; if(!file) return;
  const status=$('importStatus');
  status.textContent='Načítám…';
  const reader=new FileReader();
  reader.onload=ev=>{
    try {
      const {hourlyData,parsed,skipped}=parseMeasuredCSV(ev.target.result);
      const measCount=Object.keys(hourlyData).length;
      if(measCount===0) throw new Error('Nepodařilo se načíst žádná data. Zkontroluj formát souboru.');
      applyMeasuredData(hourlyData);
      const months=computeMonthHourStarts(currentYear);
      const coveredMonths=new Set();
      for(const h of Object.keys(hourlyData)){
        const hi=+h; for(let m=0;m<12;m++){if(hi>=months[m]&&(m===11||hi<months[m+1])){coveredMonths.add(m);break;}}
      }
      const mNames=Array.from(coveredMonths).sort((a,b)=>a-b).map(i=>MONTHS[i]).join(', ');
      status.textContent=`✓ Načteno ${measCount} hodin (${coveredMonths.size} měsíce: ${mNames}). Vynecháno řádků: ${skipped}.`;
      status.style.color='#166534';
      // Update legend visibility
      $('legendMeasured').style.display='';
    } catch(err){
      status.textContent='✗ '+err.message;
      status.style.color='#991b1b';
    }
    e.target.value=''; // reset input for re-upload
  };
  reader.readAsText(file,'utf-8');
}

function clearMeasuredData() {
  measuredHours=null;
  $('importStatus').textContent='';
  $('legendMeasured').style.display='none';
  updateYearChart();
}

// ─── Advanced ────────────────────────────────────────────────────────────────
function buildMonthlyInputs() {
  const g=$('monthlyInputsGrid'); g.innerHTML='';
  MONTHS.forEach((m,i)=>{
    const l=document.createElement('label'); l.className='mi-cell';
    l.innerHTML=`<span class="mi-month">${m}</span><input type="number" class="mi-input" data-idx="${i}" min="0" step="any" placeholder="—">`;
    g.appendChild(l);
  });
}
function applyMonthlyKnown() {
  const vals=Array.from(document.querySelectorAll('.mi-input')).map(i=>parseFloat(i.value)||0);
  const total=vals.reduce((a,b)=>a+b,0);
  if(total<=0){alert('Zadej alespoň jednu měsíční spotřebu.');return;}
  monthlyKnown=vals; editedMonthly=normSum(vals.map(v=>Math.max(0,v)));
  if(!$('annual').value) $('annual').value=total.toFixed(0);
  updateMonthlyChart(); updateYearChart();
}
function clearMonthlyKnown() {
  monthlyKnown=null;
  document.querySelectorAll('.mi-input').forEach(i=>{i.value='';});
  if(baseProfile){editedMonthly=[...baseProfile.monthly];updateMonthlyChart();updateYearChart();}
}
function onBaseloadChange() {
  baseloadFrac=parseInt($('baseloadSlider').value,10)/100;
  $('baseloadLabel').textContent=Math.round(baseloadFrac*100)+' %';
  updateYearChart();
}
function syncVacations() {
  vacations=[];
  document.querySelectorAll('#vacationsTbody tr').forEach(tr=>{
    const from=tr.querySelector('.vac-from').value, to=tr.querySelector('.vac-to').value;
    const factor=(parseFloat(tr.querySelector('.vac-factor').value)||0)/100;
    if(from&&to&&from<=to) vacations.push({from,to,factor});
  });
  updateYearChart();
}
function addVacationRow(data=null) {
  const tr=document.createElement('tr'), ys=String(currentYear);
  tr.innerHTML=`<td><input type="date" class="vac-from" min="${ys}-01-01" max="${ys}-12-31"></td><td><input type="date" class="vac-to" min="${ys}-01-01" max="${ys}-12-31"></td><td><input type="number" class="vac-factor" value="0" min="0" max="100" step="5"> %</td><td><button class="btn-del-vac">✕</button></td>`;
  if(data){
    tr.querySelector('.vac-from').value=data.from||'';
    tr.querySelector('.vac-to').value=data.to||'';
    tr.querySelector('.vac-factor').value=Math.round((data.factor||0)*100);
  }
  tr.querySelector('.btn-del-vac').addEventListener('click',()=>{tr.remove();syncVacations();});
  tr.querySelectorAll('input').forEach(i=>i.addEventListener('change',syncVacations));
  $('vacationsTbody').appendChild(tr);
}
function toggleAdvanced() {
  const p=$('advPanel'),open=p.style.display!=='none';
  p.style.display=open?'none':''; $('advIcon').textContent=open?'▸':'▾';
}

// ─── Week nav ─────────────────────────────────────────────────────────────────
function updateWeekNav() {
  $('weekLabel').textContent=getWeekLabel(currentWeekIdx);
  $('btnPrevWeek').disabled=currentWeekIdx<=0; $('btnNextWeek').disabled=currentWeekIdx>=51;
}
function onWeekModeChange() {
  weekEditMode=$('chkWeekMode').checked?'week':'all';
  $('weekNav').style.display=weekEditMode==='week'?'flex':'none'; updateDowChart();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  initCharts(); buildMonthlyInputs();
  updateUnitSelect(); currentUnit=getUnitOpts()[0].value; updateUnitSelect();

  $('medium').addEventListener('change',()=>{updateUnitSelect();if(editedMonthly)updateYearChart();});
  $('unitSelect').addEventListener('change',()=>{currentUnit=$('unitSelect').value;$('unitLabel').textContent=getUnitLabel();if(editedMonthly)updateYearChart();});
  $('annual').addEventListener('input',()=>{if(editedMonthly)updateYearChart();});
  $('yearSelect').addEventListener('change',onYearChange);

  $('btnChatSend').addEventListener('click',sendChatMessage);
  $('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.ctrlKey)sendChatMessage();});

  $('yearFrom').addEventListener('change',updateYearRange);
  $('yearTo').addEventListener('change',updateYearRange);
  $('btnResetRange').addEventListener('click',resetYearRange);
  const ys=String(currentYear);
  ['yearFrom','yearTo'].forEach(id=>{$(id).min=`${ys}-01-01`;$(id).max=`${ys}-12-31`;});

  $('btnCSV').addEventListener('click',exportCSV);

  $('btnAdvToggle').addEventListener('click',toggleAdvanced);
  $('btnApplyMonthly').addEventListener('click',applyMonthlyKnown);
  $('btnClearMonthly').addEventListener('click',clearMonthlyKnown);
  $('baseloadSlider').addEventListener('input',onBaseloadChange);
  $('btnAddVacation').addEventListener('click',()=>addVacationRow());
  $('chkHolidays').addEventListener('change',e=>{holidaysAsNW=e.target.checked;updateYearChart();});

  $('chkWeekMode').addEventListener('change',onWeekModeChange);
  $('btnPrevWeek').addEventListener('click',()=>{currentWeekIdx=Math.max(0,currentWeekIdx-1);updateWeekNav();updateDowChart();});
  $('btnNextWeek').addEventListener('click',()=>{currentWeekIdx=Math.min(51,currentWeekIdx+1);updateWeekNav();updateDowChart();});
  updateWeekNav();

  // File upload
  $('fileInput').addEventListener('change',onFileInput);
  $('btnClearMeasured').addEventListener('click',clearMeasuredData);
  $('legendMeasured').style.display='none';
});
