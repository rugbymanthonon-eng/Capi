import { getAll, getSetting } from "./db.js";

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const EXPENSE = "#d95b5f";
const INCOME = "#4da879";

const statsState = {
  count: 12,
  transactions: [],
  cycleDay: 25,
  redrawToken: 0
};

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", initOverviewStats);
else initOverviewStats();

function initOverviewStats(){
  const input = $("#cycle-count");
  if(!input || !$("#overview-chart")) return;
  statsState.count = clampCount(input.value || 12);

  input.addEventListener("input",()=>{
    if(input.value !== "") input.value = String(clampCount(input.value));
    statsState.count = clampCount(input.value || 1);
    scheduleRedraw(0);
  });
  input.addEventListener("change",()=>{
    statsState.count = clampCount(input.value || 1);
    input.value = String(statsState.count);
    scheduleRedraw(0);
  });
  $("#cycle-minus")?.addEventListener("click",()=>adjustCount(-1));
  $("#cycle-plus")?.addEventListener("click",()=>adjustCount(1));
  $$('[data-nav="stats"]').forEach(btn=>btn.addEventListener("click",()=>scheduleRedraw(20)));
  $("#profile-form")?.addEventListener("submit",()=>scheduleRedraw(300));
  window.addEventListener("resize",debounce(()=>{
    if($("#view-stats")?.classList.contains("active")) scheduleRedraw(0);
  },230));

  scheduleRedraw(0);
}

function clampCount(value){
  const n = Math.round(Number(value) || 1);
  return Math.max(1, Math.min(36, n));
}
function adjustCount(delta){
  statsState.count = clampCount(statsState.count + delta);
  const input = $("#cycle-count");
  if(input) input.value = String(statsState.count);
  scheduleRedraw(0);
}
function scheduleRedraw(delay=0){
  const token = ++statsState.redrawToken;
  setTimeout(()=>{ if(token===statsState.redrawToken) redrawOverview(); }, delay);
}

async function loadStatsData(){
  const [transactions,profile] = await Promise.all([
    getAll("transactions"),
    getSetting("profile",{cycleDay:25})
  ]);
  statsState.transactions = transactions;
  statsState.cycleDay = normalizeCycleDay(profile?.cycleDay || 25);
}

async function redrawOverview(){
  try{
    await loadStatsData();
    const canvas = $("#overview-chart");
    if(!canvas) return;
    const ranges = buildRecentRanges(statsState.count,statsState.cycleDay);
    const expenses = ranges.map(r=>sumType(r,"expense"));
    const incomes = ranges.map(r=>sumType(r,"income"));
    drawDualChart(canvas,ranges,expenses,incomes);

    const hasData = expenses.some(v=>v>0) || incomes.some(v=>v>0);
    const empty=$("#overview-empty");
    if(empty) empty.classList.toggle("hidden",hasData);
    const desc=$("#cycle-description");
    if(desc) desc.textContent=`Chaque cycle repart à zéro le ${statsState.cycleDay} du mois.`;
  }catch(err){
    console.error("Capi overview stats",err);
  }
}

function sumType(range,type){
  return statsState.transactions
    .filter(t=>t.type===type && t.amountEurCents!=null && t.date>=range.start && t.date<=range.end)
    .reduce((sum,t)=>sum+t.amountEurCents/100,0);
}

function buildRecentRanges(count,cycleDay){
  const today=new Date(); today.setHours(12,0,0,0);
  const anchor=cycleStartForDate(today,cycleDay);
  const ranges=[];
  for(let i=count-1;i>=0;i--){
    const start=cycleDate(anchor.getFullYear(),anchor.getMonth()-i,cycleDay);
    ranges.push(makeRange(start,cycleDay));
  }
  return ranges;
}
function cycleStartForDate(date,cycleDay){
  let start=cycleDate(date.getFullYear(),date.getMonth(),cycleDay);
  if(date<start) start=cycleDate(date.getFullYear(),date.getMonth()-1,cycleDay);
  return start;
}
function cycleDate(year,month,day){
  const last=new Date(year,month+1,0).getDate();
  return new Date(year,month,Math.min(normalizeCycleDay(day),last),12,0,0,0);
}
function makeRange(start,cycleDay){
  const next=cycleDate(start.getFullYear(),start.getMonth()+1,cycleDay);
  const end=new Date(next); end.setDate(end.getDate()-1);
  return {
    start:localDateKey(start),
    end:localDateKey(end),
    label:new Intl.DateTimeFormat("fr-FR",{month:"short"}).format(start).replace(".","")
  };
}
function normalizeCycleDay(v){ return Math.max(1,Math.min(31,Math.round(Number(v)||1))); }
function localDateKey(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

function drawDualChart(canvas,ranges,expenses,incomes){
  const rect=canvas.getBoundingClientRect();
  const width=Math.max(320,rect.width||320), height=Math.max(260,rect.height||300), dpr=Math.max(1,window.devicePixelRatio||1);
  canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,width,height);

  const left=46,right=12,top=18,bottom=45,cw=width-left-right,ch=height-top-bottom;
  let max=Math.max(0,...expenses,...incomes); if(max<=0) max=100; max*=1.12;

  ctx.strokeStyle="rgba(81,103,117,.14)"; ctx.fillStyle="#788590"; ctx.lineWidth=1;
  ctx.font="11px system-ui"; ctx.textAlign="right"; ctx.textBaseline="middle";
  for(let i=0;i<=4;i++){
    const y=top+ch*i/4;
    ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(width-right,y); ctx.stroke();
    ctx.fillText(compactEuro(max*(1-i/4)),left-7,y);
  }

  const groupW=cw/Math.max(1,ranges.length);
  const outerPad=Math.min(8,groupW*.14);
  const usable=Math.max(8,groupW-outerPad*2);
  const gap=Math.min(5,usable*.12);
  const barW=Math.max(3,(usable-gap)/2);

  ranges.forEach((r,i)=>{
    const baseX=left+i*groupW+outerPad;
    const ev=expenses[i]||0, iv=incomes[i]||0;
    const eh=ev/max*ch, ih=iv/max*ch;
    if(eh>0){ctx.fillStyle=EXPENSE;roundRect(ctx,baseX,top+ch-eh,barW,eh,Math.min(5,barW/3));}
    if(ih>0){ctx.fillStyle=INCOME;roundRect(ctx,baseX+barW+gap,top+ch-ih,barW,ih,Math.min(5,barW/3));}
  });

  ctx.fillStyle="#667681"; ctx.font="10px system-ui"; ctx.textAlign="center"; ctx.textBaseline="top";
  const every=ranges.length>14?Math.ceil(ranges.length/12):1;
  ranges.forEach((r,i)=>{
    if(i%every!==0 && i!==ranges.length-1) return;
    ctx.fillText(r.label,left+i*groupW+groupW/2,top+ch+10);
  });
}
function roundRect(ctx,x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();ctx.fill();}
function compactEuro(v){if(v>=1000000)return`${(v/1000000).toFixed(v>=10000000?0:1).replace(".",",")} M€`;if(v>=1000)return`${(v/1000).toFixed(v>=10000?0:1).replace(".",",")} k€`;return`${Math.round(v)} €`;}
function debounce(fn,ms){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};}
