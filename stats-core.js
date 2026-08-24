import { getAll, getSetting } from "./db.js";

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const BLUE = "#2f79d8";

const statsState = {
  count: 12,
  filter: { kind:"all", id:"all", label:"Toutes les dépenses", from:"", to:"" },
  categories: [],
  subcategories: [],
  transactions: [],
  cycleDay: 25,
  redrawToken: 0
};

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", initEnhancedStats);
else initEnhancedStats();

function initEnhancedStats(){
  const input = $("#cycle-count");
  if(!input || !$("#overview-chart")) return;
  statsState.count = clampCount(input.value || 12);

  input.addEventListener("input",()=>{
    if(input.value !== "") input.value = String(clampCount(input.value));
    statsState.count = clampCount(input.value || 1);
    if(!hasCustomPeriod()) scheduleRedraw(0);
  });
  input.addEventListener("change",()=>{
    statsState.count = clampCount(input.value || 1);
    input.value = String(statsState.count);
    if(!hasCustomPeriod()) scheduleRedraw(0);
  });
  $("#cycle-minus")?.addEventListener("click",()=>adjustCount(-1));
  $("#cycle-plus")?.addEventListener("click",()=>adjustCount(1));
  $("#open-stats-filter")?.addEventListener("click",openStatsFilter);

  $$('[data-nav="stats"]').forEach(btn=>btn.addEventListener("click",()=>scheduleRedraw(20)));
  $("#profile-form")?.addEventListener("submit",()=>scheduleRedraw(300));
  window.addEventListener("resize",debounce(()=>{
    if($("#view-stats")?.classList.contains("active")) scheduleRedraw(0);
  },230));

  renderFilterSummary();
  scheduleRedraw(0);
}

function clampCount(value){
  const n = Math.round(Number(value) || 1);
  return Math.max(1, Math.min(36, n));
}
function adjustCount(delta){
  if(hasCustomPeriod()) return;
  statsState.count = clampCount(statsState.count + delta);
  const input = $("#cycle-count");
  if(input) input.value = String(statsState.count);
  scheduleRedraw(0);
}
function hasCustomPeriod(){ return Boolean(statsState.filter.from || statsState.filter.to); }
function scheduleRedraw(delay=0){
  const token = ++statsState.redrawToken;
  setTimeout(()=>{ if(token===statsState.redrawToken) redrawOverview(); }, delay);
}

async function loadStatsData(){
  const [categories,subcategories,transactions,profile] = await Promise.all([
    getAll("categories"), getAll("subcategories"), getAll("transactions"),
    getSetting("profile",{cycleDay:25})
  ]);
  statsState.categories = categories;
  statsState.subcategories = subcategories;
  statsState.transactions = transactions;
  statsState.cycleDay = normalizeCycleDay(profile?.cycleDay || 25);
}

async function redrawOverview(){
  try{
    await loadStatsData();
    const canvas = $("#overview-chart");
    if(!canvas) return;
    const ranges = hasCustomPeriod()
      ? buildRangesForPeriod(statsState.filter.from,statsState.filter.to,statsState.cycleDay)
      : buildRecentRanges(statsState.count,statsState.cycleDay);
    const values = ranges.map(r=>statsState.transactions
      .filter(t=> t.type==="expense" && t.amountEurCents!=null && t.date>=r.start && t.date<=r.end
        && (!statsState.filter.from || t.date>=statsState.filter.from)
        && (!statsState.filter.to || t.date<=statsState.filter.to)
        && matchesFilter(t,statsState.filter))
      .reduce((sum,t)=>sum+t.amountEurCents/100,0));
    drawChart(canvas,ranges,values);
    const empty=$("#overview-empty");
    if(empty) empty.classList.toggle("hidden",values.some(v=>v>0));
    const desc=$("#cycle-description");
    if(desc) desc.textContent=`Cycles calculés à partir du ${statsState.cycleDay} de chaque mois.`;
    renderFilterSummary();
  }catch(err){
    console.error("Capi stats enhanced",err);
  }
}

function matchesFilter(t,filter){
  if(filter.kind==="all") return true;
  if(filter.kind==="category") return t.categoryId===filter.id;
  if(filter.kind==="subcategory") return t.subcategoryId===filter.id;
  return true;
}

function renderFilterSummary(){
  const label=$("#stats-filter-label"), period=$("#stats-period-label");
  if(label) label.textContent=statsState.filter.label;
  if(period){
    if(statsState.filter.from && statsState.filter.to) period.textContent=`Du ${dateShort(statsState.filter.from)} au ${dateShort(statsState.filter.to)}`;
    else if(statsState.filter.from) period.textContent=`Depuis le ${dateShort(statsState.filter.from)}`;
    else if(statsState.filter.to) period.textContent=`Jusqu’au ${dateShort(statsState.filter.to)}`;
    else period.textContent="Période : cycles récents";
  }
  const custom=hasCustomPeriod();
  $(".cycle-stepper")?.classList.toggle("disabled",custom);
  ["#cycle-count","#cycle-minus","#cycle-plus"].forEach(sel=>{const el=$(sel); if(el) el.disabled=custom;});
}

async function openStatsFilter(){
  await loadStatsData();
  let temp={...statsState.filter};
  const cats=statsState.categories.filter(c=>c.type==="expense").sort((a,b)=>a.name.localeCompare(b.name,"fr"));
  const html=[];
  html.push(filterOption("all","all","Toutes les dépenses",temp));
  for(const c of cats){
    html.push(`<div class="stats-filter-group">${filterOption("category",c.id,c.name,temp,c.archived)}`);
    const subs=statsState.subcategories.filter(s=>s.categoryId===c.id).sort((a,b)=>a.name.localeCompare(b.name,"fr"));
    if(subs.length){
      html.push(`<div class="stats-filter-subs">${subs.map(s=>filterOption("subcategory",s.id,s.name,temp,s.archived,true)).join("")}</div>`);
    }
    html.push(`</div>`);
  }

  const dialog=$("#dialog-content");
  dialog.innerHTML=`
    <div class="sheet-head">
      <button class="circle-btn" data-close-modal="dialog-modal">×</button>
      <div><p class="eyebrow">Statistiques</p><h2>Filtrer le graphique</h2></div>
      <span class="sheet-spacer"></span>
    </div>
    <form id="stats-filter-form" class="stats-filter-form">
      <div>
        <h3>Catégorie ou sous-catégorie</h3>
        <div id="stats-filter-options" class="stats-filter-options">${html.join("")}</div>
      </div>
      <div>
        <h3>Période exacte</h3>
        <div class="stats-period-grid">
          <label>Du<input id="stats-from" type="date" value="${attr(temp.from)}"></label>
          <label>Au<input id="stats-to" type="date" value="${attr(temp.to)}"></label>
        </div>
        <p class="stats-filter-help">Une période précise remplace temporairement le nombre de cycles et affiche tous les cycles qui la couvrent.</p>
      </div>
      <div id="stats-filter-error" class="validation-error hidden"></div>
      <div class="detail-actions">
        <button type="button" class="ghost-btn" id="stats-filter-reset">Réinitialiser</button>
        <button type="submit" class="primary-btn">Appliquer</button>
      </div>
    </form>`;

  const markSelected=()=>{
    $$('[data-stats-choice]',dialog).forEach(btn=>{
      const [kind,id]=btn.dataset.statsChoice.split(":");
      btn.classList.toggle("selected",temp.kind===kind && temp.id===id);
    });
  };
  $$('[data-stats-choice]',dialog).forEach(btn=>btn.addEventListener("click",()=>{
    const [kind,id]=btn.dataset.statsChoice.split(":");
    temp.kind=kind; temp.id=id;
    if(kind==="all") temp.label="Toutes les dépenses";
    else if(kind==="category") temp.label=statsState.categories.find(c=>c.id===id)?.name || "Catégorie";
    else{
      const sub=statsState.subcategories.find(s=>s.id===id);
      const cat=sub?statsState.categories.find(c=>c.id===sub.categoryId):null;
      temp.label=`${cat?.name||""} → ${sub?.name||""}`;
    }
    markSelected();
  }));
  $("#stats-filter-reset")?.addEventListener("click",()=>{
    temp={kind:"all",id:"all",label:"Toutes les dépenses",from:"",to:""};
    $("#stats-from").value=""; $("#stats-to").value=""; markSelected();
  });
  $("#stats-filter-form")?.addEventListener("submit",e=>{
    e.preventDefault();
    temp.from=$("#stats-from").value;
    temp.to=$("#stats-to").value;
    if(temp.from && temp.to && temp.from>temp.to){
      const error=$("#stats-filter-error");
      error.textContent="La date de début doit être avant la date de fin.";
      error.classList.remove("hidden");
      return;
    }
    statsState.filter=temp;
    closeDialog();
    renderFilterSummary();
    scheduleRedraw(0);
  });
  openDialog();
}

function filterOption(kind,id,label,temp,archived=false,sub=false){
  const selected=temp.kind===kind && temp.id===id;
  return `<button type="button" class="stats-filter-option ${sub?"sub ":""}${selected?"selected":""}" data-stats-choice="${kind}:${id}"><span>${html(label)}${archived?' <em>(archivée)</em>':''}</span><span class="filter-check">✓</span></button>`;
}
function openDialog(){
  const el=$("#dialog-modal");
  el?.classList.remove("hidden"); el?.setAttribute("aria-hidden","false"); document.body.style.overflow="hidden";
}
function closeDialog(){
  const el=$("#dialog-modal");
  el?.classList.add("hidden"); el?.setAttribute("aria-hidden","true"); document.body.style.overflow="";
}

function buildRecentRanges(count,cycleDay){
  const today=new Date(); today.setHours(12,0,0,0);
  const anchor=cycleStartForDate(today,cycleDay);
  const ranges=[];
  for(let i=count-1;i>=0;i--) ranges.push(makeRange(cycleDate(anchor.getFullYear(),anchor.getMonth()-i,cycleDay),cycleDay));
  return ranges;
}
function buildRangesForPeriod(from,to,cycleDay){
  const expenses=statsState.transactions.filter(t=>t.type==="expense").sort((a,b)=>a.date.localeCompare(b.date));
  const fromKey=from || expenses[0]?.date || to || localDateKey();
  const toKey=to || localDateKey();
  const fromDate=new Date(fromKey+"T12:00:00"), toDate=new Date(toKey+"T12:00:00");
  let cursor=cycleStartForDate(fromDate,cycleDay);
  const ranges=[];
  let guard=0;
  while(cursor<=toDate && guard<120){
    ranges.push(makeRange(cursor,cycleDay));
    cursor=cycleDate(cursor.getFullYear(),cursor.getMonth()+1,cycleDay);
    guard++;
  }
  return ranges.length?ranges:[makeRange(cycleStartForDate(toDate,cycleDay),cycleDay)];
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
  return {start:localDateKey(start),end:localDateKey(end),label:new Intl.DateTimeFormat("fr-FR",{month:"short"}).format(start).replace(".","")};
}
function normalizeCycleDay(v){ return Math.max(1,Math.min(31,Math.round(Number(v)||1))); }
function localDateKey(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function dateShort(key){ return new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit"}).format(new Date(key+"T12:00:00")); }

function drawChart(canvas,ranges,values){
  const rect=canvas.getBoundingClientRect();
  const width=Math.max(320,rect.width||320), height=Math.max(260,rect.height||300), dpr=Math.max(1,window.devicePixelRatio||1);
  canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,width,height);
  const left=46,right=12,top=18,bottom=45,cw=width-left-right,ch=height-top-bottom;
  let max=Math.max(0,...values); if(max<=0) max=100; max*=1.12;
  ctx.strokeStyle="rgba(81,103,117,.14)";ctx.fillStyle="#788590";ctx.lineWidth=1;ctx.font="11px system-ui";ctx.textAlign="right";ctx.textBaseline="middle";
  for(let i=0;i<=4;i++){
    const y=top+ch*i/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();ctx.fillText(compactEuro(max*(1-i/4)),left-7,y);
  }
  const groupW=cw/Math.max(1,ranges.length),innerPad=Math.min(8,groupW*.14),barW=Math.max(3,groupW-innerPad*2);
  values.forEach((v,i)=>{
    const h=v/max*ch;if(h<=0)return;const x=left+i*groupW+innerPad;ctx.fillStyle=BLUE;roundRect(ctx,x,top+ch-h,barW,h,Math.min(5,barW/3));
  });
  ctx.fillStyle="#667681";ctx.font="10px system-ui";ctx.textAlign="center";ctx.textBaseline="top";
  const every=ranges.length>14?Math.ceil(ranges.length/12):1;
  ranges.forEach((r,i)=>{if(i%every!==0&&i!==ranges.length-1)return;ctx.fillText(r.label,left+i*groupW+groupW/2,top+ch+10);});
}
function roundRect(ctx,x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();ctx.fill();}
function compactEuro(v){if(v>=1000000)return`${(v/1000000).toFixed(v>=10000000?0:1).replace(".",",")} M€`;if(v>=1000)return`${(v/1000).toFixed(v>=10000?0:1).replace(".",",")} k€`;return`${Math.round(v)} €`;}
function html(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function attr(s=""){return html(s);}
function debounce(fn,ms){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};}
