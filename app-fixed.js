import {
  openDB, seedDefaults, getAll, getOne, putOne, deleteOne,
  getSetting, setSetting, uid, exportAllData, restoreAllData
} from "./db.js";

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

const COLORS = ["#2f79d8","#4da879","#d95b5f","#8f6ad8","#d19a3a","#4b9daa","#7e8b98","#b66e9c","#547aa5","#6f9d67"];
const EUR = new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
const CHF = new Intl.NumberFormat("fr-CH",{style:"currency",currency:"CHF"});

const state = {
  categories:[],
  subcategories:[],
  transactions:[],
  profile:{firstName:"",lastName:"",email:"",cycleDay:25},
  fx:null,
  currentView:"home",
  manageType:"expense",
  chartMode:"grouped",
  chartSeries:[{kind:"all",id:"all",label:"Toutes les dépenses",color:COLORS[0]}],
  draft:null
};

document.addEventListener("DOMContentLoaded", init);

async function init(){
  try {
    await openDB();
    await seedDefaults();
    await reloadState();
    bindStaticEvents();
    renderProfile();
    renderManage();
    renderStats();
    renderHistory();
    renderFx();
    registerServiceWorker();

    refreshFx(false).then(async()=>{
      await resolvePendingFx();
      await reloadTransactions();
      renderStats(); renderHistory(); renderFx();
    }).catch(()=>{});
  } catch (err) {
    console.error("Capi init error", err);
    alert("Capi n'a pas pu démarrer correctement. Recharge la page.");
  }
}

async function reloadState(){
  [state.categories,state.subcategories,state.transactions,state.profile,state.fx] = await Promise.all([
    getAll("categories"),
    getAll("subcategories"),
    getAll("transactions"),
    getSetting("profile",{firstName:"",lastName:"",email:"",cycleDay:25}),
    getSetting("fx_chf_eur",null)
  ]);
  state.categories.sort((a,b)=>a.name.localeCompare(b.name,"fr"));
  state.subcategories.sort((a,b)=>a.name.localeCompare(b.name,"fr"));
}
async function reloadTransactions(){ state.transactions=await getAll("transactions"); }

function bindStaticEvents(){
  $$('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.nav)));
  $$('[data-open-transaction]').forEach(btn=>btn.addEventListener('click',()=>openTransaction(btn.dataset.openTransaction)));
  document.addEventListener('click',event=>{
    const close=event.target.closest('[data-close-modal]');
    if(close) closeModal(close.dataset.closeModal);
  });
  $('#profile-form').addEventListener('submit',saveProfile);
  $('#cycle-count').addEventListener('change',renderStats);
  $('#add-series').addEventListener('click',addSelectedSeries);
  $$('[data-chart-mode]').forEach(btn=>btn.addEventListener('click',()=>{
    state.chartMode=btn.dataset.chartMode;
    $$('[data-chart-mode]').forEach(x=>x.classList.toggle('active',x===btn));
    renderCustomChart();
  }));
  ['history-search','history-category','history-subcategory','history-from','history-to'].forEach(id=>$('#'+id).addEventListener('input',renderHistory));
  $('#history-type').addEventListener('change',()=>{renderHistoryCategoryFilter();renderHistory();});
  $('#history-category').addEventListener('change',()=>{renderHistorySubFilter();renderHistory();});
  $('#history-reset').addEventListener('click',()=>{
    $('#history-search').value=''; $('#history-type').value=''; $('#history-category').value='';
    $('#history-subcategory').innerHTML='<option value="">Toutes les sous-catégories</option>';
    $('#history-from').value=''; $('#history-to').value=''; renderHistory();
  });
  $$('[data-manage-type]').forEach(btn=>btn.addEventListener('click',()=>{
    state.manageType=btn.dataset.manageType;
    $$('[data-manage-type]').forEach(x=>x.classList.toggle('active',x===btn));
    renderCategoryManager();
  }));
  $('#add-category').addEventListener('click',()=>openEntityEditor('category'));
  $('#refresh-fx').addEventListener('click',async()=>{
    $('#fx-message').textContent='Actualisation…';
    try{ await refreshFx(true); await resolvePendingFx(); await reloadTransactions(); renderFx(); renderStats(); renderHistory(); toast('Taux actualisé'); }
    catch(err){ $('#fx-message').textContent='Impossible d’actualiser pour le moment. Le dernier taux connu reste utilisé.'; }
  });
  $('#export-backup').addEventListener('click',downloadBackup);
  $('#restore-backup').addEventListener('click',()=>$('#restore-file').click());
  $('#restore-file').addEventListener('change',restoreBackupFile);
  $('#export-csv').addEventListener('click',downloadCsv);
  window.addEventListener('resize',debounce(()=>{ if(state.currentView==='stats') renderStatsChartsOnly(); },150));
}

function showView(name){
  state.currentView=name;
  $$('.view').forEach(v=>v.classList.remove('active'));
  $('#view-'+name).classList.add('active');
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));
  if(name==='stats'){renderStats();renderHistory();}
  if(name==='manage'){renderManage();renderFx();}
  window.scrollTo({top:0,behavior:'smooth'});
}

function openTransaction(type){
  state.draft={type,currency:'EUR',categoryId:null,subcategoryId:null};
  $('#transaction-kicker').textContent='Nouvelle opération';
  $('#transaction-title').textContent=type==='expense'?'Ajouter une dépense':'Ajouter une entrée';
  renderTransactionCategories(); openModal('transaction-modal');
}
function renderTransactionCategories(){
  const type=state.draft.type;
  const cats=state.categories.filter(c=>c.type===type && !c.archived);
  const activeSubs=state.subcategories.filter(s=>!s.archived);
  const favoriteShortcuts=[];
  for(const c of cats){
    const subs=activeSubs.filter(s=>s.categoryId===c.id);
    if(c.favorite && !subs.length) favoriteShortcuts.push({cat:c,sub:null,label:c.name});
    for(const s of subs) if(s.favorite) favoriteShortcuts.push({cat:c,sub:s,label:s.name});
  }
  $('#transaction-content').innerHTML=`${favoriteShortcuts.length?`<section class="favorite-shortcuts"><h3>Favoris</h3><div class="shortcut-row">${favoriteShortcuts.map((x,i)=>`<button class="shortcut" data-shortcut="${i}">${escapeHtml(x.label)}</button>`).join('')}</div></section>`:''}<section class="category-picker"><h3>${type==='expense'?'Choisis la catégorie de la dépense':'Choisis la catégorie de l’entrée'}</h3><div class="category-list">${cats.map(c=>{const subs=activeSubs.filter(s=>s.categoryId===c.id);return `<div class="category-block" data-category-block="${c.id}"><button class="category-btn" data-category="${c.id}"><span>${escapeHtml(c.name)}</span><span class="cat-right">${c.favorite?'<span class="star">★</span>':''}<span>${subs.length?'⌄':'›'}</span></span></button>${subs.length?`<div class="subcategory-panel"><div class="subcategory-inner">${subs.map(s=>`<button class="subcategory-btn" data-subcategory="${s.id}" data-parent="${c.id}"><span>${escapeHtml(s.name)}</span><span>${s.favorite?'★':'›'}</span></button>`).join('')}</div></div>`:''}</div>`;}).join('')}</div></section>`;
  $$('[data-shortcut]',$('#transaction-content')).forEach(btn=>btn.addEventListener('click',()=>{const x=favoriteShortcuts[Number(btn.dataset.shortcut)];selectFinalCategory(x.cat.id,x.sub?.id||null);}));
  $$('[data-category]',$('#transaction-content')).forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.category;const subs=activeSubs.filter(s=>s.categoryId===id);if(!subs.length)return selectFinalCategory(id,null);$$('[data-category-block]',$('#transaction-content')).forEach(block=>block.classList.toggle('expanded',block.dataset.categoryBlock===id?!block.classList.contains('expanded'):false));}));
  $$('[data-subcategory]',$('#transaction-content')).forEach(btn=>btn.addEventListener('click',()=>selectFinalCategory(btn.dataset.parent,btn.dataset.subcategory)));
}
function selectFinalCategory(categoryId,subcategoryId){state.draft.categoryId=categoryId;state.draft.subcategoryId=subcategoryId;renderTransactionForm();}
function renderTransactionForm(){
  const cat=getCategory(state.draft.categoryId), sub=getSubcategory(state.draft.subcategoryId), date=localDateKey();
  const dateLabel=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(new Date(date+'T12:00:00'));
  const type=state.draft.type;
  $('#transaction-content').innerHTML=`<form id="transaction-form" class="transaction-form"><div class="selected-path"><strong>${escapeHtml(cat?.name||'')}${sub?` → ${escapeHtml(sub.name)}`:''}</strong><button type="button" id="change-category">Changer</button></div><div class="amount-field"><label for="tx-amount">Montant *</label><div class="amount-box"><input id="tx-amount" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off"><span id="amount-currency-symbol">€</span></div></div><div class="segmented currency-choice"><button type="button" class="segment active" data-currency="EUR">EUR</button><button type="button" class="segment" data-currency="CHF">CHF</button></div><div class="optional-field"><label for="tx-place">${type==='expense'?'Lieu / magasin':'Origine'} <span class="muted">(facultatif)</span></label><input id="tx-place" maxlength="100" placeholder="${type==='expense'?'Ex. Carrefour, Migrol…':'Ex. Employeur, vente…'}"></div><div class="optional-field"><label for="tx-note">Note <span class="muted">(facultatif)</span></label><textarea id="tx-note" rows="3" maxlength="250" placeholder="Ajouter un détail si nécessaire"></textarea></div><div class="auto-date"><span>Date enregistrée automatiquement</span><strong>${capitalize(dateLabel)}</strong></div><div id="tx-error" class="validation-error hidden"></div><div class="submit-row"><button type="submit" class="primary-btn">${type==='expense'?'Enregistrer la dépense':'Enregistrer l’entrée'}</button></div></form>`;
  $('#change-category').addEventListener('click',renderTransactionCategories);
  $$('[data-currency]',$('#transaction-content')).forEach(btn=>btn.addEventListener('click',()=>{state.draft.currency=btn.dataset.currency;$$('[data-currency]',$('#transaction-content')).forEach(x=>x.classList.toggle('active',x===btn));$('#amount-currency-symbol').textContent=state.draft.currency==='EUR'?'€':'CHF';}));
  $('#transaction-form').addEventListener('submit',saveTransaction);
  setTimeout(()=>$('#tx-amount')?.focus(),120);
}
async function saveTransaction(event){
  event.preventDefault(); const amountCents=parseMoneyToCents($('#tx-amount').value);
  if(!Number.isInteger(amountCents)||amountCents<=0){showTxError('Renseigne un montant supérieur à 0.');return;}
  if(!state.draft.categoryId){showTxError('Choisis une catégorie.');return;}
  const category=getCategory(state.draft.categoryId), activeSubs=state.subcategories.filter(s=>s.categoryId===category.id&&!s.archived);
  if(activeSubs.length&&!state.draft.subcategoryId){showTxError('Choisis une sous-catégorie.');return;}
  const date=localDateKey(); let amountEurCents=amountCents, exchangeRate=1, rateDate=date, fxPending=false;
  if(state.draft.currency==='CHF'){
    try{const fx=await ensureCurrentFx();if(fx?.rate){exchangeRate=Number(fx.rate);rateDate=fx.date||date;amountEurCents=Math.round(amountCents*exchangeRate);}else{amountEurCents=null;exchangeRate=null;rateDate=null;fxPending=true;}}
    catch{if(state.fx?.rate){exchangeRate=Number(state.fx.rate);rateDate=state.fx.date;amountEurCents=Math.round(amountCents*exchangeRate);}else{amountEurCents=null;exchangeRate=null;rateDate=null;fxPending=true;}}
  }
  const now=new Date().toISOString();
  const row={id:uid('tx'),type:state.draft.type,amountCents,currency:state.draft.currency,amountEurCents,exchangeRate,rateDate,fxPending,date,categoryId:state.draft.categoryId,subcategoryId:state.draft.subcategoryId||null,place:$('#tx-place').value.trim(),note:$('#tx-note').value.trim(),createdAt:now,updatedAt:now};
  await putOne('transactions',row);state.transactions.push(row);closeModal('transaction-modal');toast(state.draft.type==='expense'?'Dépense enregistrée':'Entrée enregistrée');renderStats();renderHistory();
}
function showTxError(msg){const el=$('#tx-error');el.textContent=msg;el.classList.remove('hidden');}

async function ensureCurrentFx(){const today=localDateKey();if(state.fx?.checkedLocalDate===today&&state.fx?.rate)return state.fx;return refreshFx(false);}
async function refreshFx(force=false){const today=localDateKey();if(!force&&state.fx?.checkedLocalDate===today&&state.fx?.rate)return state.fx;const response=await fetch('https://api.frankfurter.dev/v2/rate/CHF/EUR',{cache:'no-store'});if(!response.ok)throw new Error('FX indisponible');const data=await response.json();const fx={rate:Number(data.rate),date:data.date,checkedAt:new Date().toISOString(),checkedLocalDate:today,source:'Frankfurter'};await setSetting('fx_chf_eur',fx);state.fx=fx;renderFx();return fx;}
async function getHistoricalFx(date){const response=await fetch(`https://api.frankfurter.dev/v2/rate/CHF/EUR?date=${encodeURIComponent(date)}`,{cache:'no-store'});if(!response.ok)throw new Error('FX historique indisponible');const data=await response.json();return {rate:Number(data.rate),date:data.date};}
async function resolvePendingFx(){const pending=state.transactions.filter(t=>t.currency==='CHF'&&(t.fxPending||t.amountEurCents==null));if(!pending.length)return;const cache=new Map();for(const t of pending){try{let fx=cache.get(t.date);if(!fx){fx=await getHistoricalFx(t.date);cache.set(t.date,fx);}t.exchangeRate=fx.rate;t.rateDate=fx.date;t.amountEurCents=Math.round(t.amountCents*fx.rate);t.fxPending=false;t.updatedAt=new Date().toISOString();await putOne('transactions',t);}catch{}}}
function renderFx(){if(!$('#fx-rate'))return;$('#fx-rate').textContent=state.fx?.rate?`1 CHF = ${Number(state.fx.rate).toFixed(4)} EUR`:'Aucun taux';$('#fx-date').textContent=state.fx?.date?formatDate(state.fx.date):'—';$('#fx-message').textContent=state.fx?.rate?'Les nouvelles opérations en CHF utilisent ce taux jusqu’à la prochaine actualisation. Les anciennes conversions restent figées.':'Une connexion Internet est nécessaire une première fois pour convertir les CHF.';}

function renderStats(){const day=normalizeCycleDay(state.profile?.cycleDay);$('#cycle-description').textContent=`Cycles calculés à partir du ${day} de chaque mois.`;renderSeriesSelect();renderHistoryCategoryFilter();renderStatsChartsOnly();}
function renderStatsChartsOnly(){const count=Number($('#cycle-count')?.value||12);const ranges=buildCycleRanges(count,state.profile?.cycleDay);const overviewSeries=[{kind:'all',id:'all',label:'Toutes les dépenses',color:COLORS[0]}];const overviewData=seriesData(overviewSeries,ranges);drawBarChart($('#overview-chart'),ranges,overviewSeries,overviewData,'grouped');$('#overview-empty').classList.toggle('hidden',overviewData.some(row=>row.some(v=>v>0)));renderCustomChart();}
function renderCustomChart(){const count=Number($('#cycle-count')?.value||12);const ranges=buildCycleRanges(count,state.profile?.cycleDay);const data=seriesData(state.chartSeries,ranges);drawBarChart($('#custom-chart'),ranges,state.chartSeries,data,state.chartMode);renderSeriesChips();renderLegend();}
function renderSeriesSelect(){const current=$('#series-select')?.value;const options=['<option value="all:all">Toutes les dépenses</option>'];const cats=[...state.categories].filter(c=>c.type==='expense').sort((a,b)=>a.name.localeCompare(b.name,'fr'));for(const c of cats){options.push(`<option value="category:${c.id}">${escapeHtml(c.name)}${c.archived?' (archivée)':''}</option>`);for(const s of state.subcategories.filter(x=>x.categoryId===c.id).sort((a,b)=>a.name.localeCompare(b.name,'fr'))){options.push(`<option value="subcategory:${s.id}">↳ ${escapeHtml(c.name)} — ${escapeHtml(s.name)}${s.archived?' (archivée)':''}</option>`);}}$('#series-select').innerHTML=options.join('');if(current&&[...$('#series-select').options].some(o=>o.value===current))$('#series-select').value=current;}
function addSelectedSeries(){const[kind,id]=$('#series-select').value.split(':');if(state.chartSeries.some(s=>s.kind===kind&&s.id===id)){toast('Cette série est déjà affichée');return;}if(state.chartSeries.length>=6){toast('Maximum 6 séries pour garder le graphique lisible');return;}let label='Toutes les dépenses';if(kind==='category')label=getCategory(id)?.name||'Catégorie';if(kind==='subcategory'){const sub=getSubcategory(id),cat=sub?getCategory(sub.categoryId):null;label=`${cat?.name||''} — ${sub?.name||''}`;}state.chartSeries.push({kind,id,label,color:COLORS[state.chartSeries.length%COLORS.length]});renderCustomChart();}
function renderSeriesChips(){$('#series-chips').innerHTML=state.chartSeries.map((s,i)=>`<span class="series-chip"><span class="series-dot" style="background:${s.color}"></span>${escapeHtml(s.label)}${state.chartSeries.length>1?`<button data-remove-series="${i}" aria-label="Retirer">×</button>`:''}</span>`).join('');$$('[data-remove-series]',$('#series-chips')).forEach(btn=>btn.addEventListener('click',()=>{state.chartSeries.splice(Number(btn.dataset.removeSeries),1);renderCustomChart();}));}
function renderLegend(){$('#chart-legend').innerHTML=state.chartSeries.map(s=>`<span class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${escapeHtml(s.label)}</span>`).join('');}
function seriesData(series,ranges){return ranges.map(r=>series.map(s=>state.transactions.filter(t=>t.type==='expense'&&t.amountEurCents!=null&&t.date>=r.start&&t.date<=r.end&&transactionMatchesSeries(t,s)).reduce((sum,t)=>sum+t.amountEurCents/100,0)));}
function transactionMatchesSeries(t,s){if(s.kind==='all')return true;if(s.kind==='category')return t.categoryId===s.id;if(s.kind==='subcategory')return t.subcategoryId===s.id;return false;}
function drawBarChart(canvas,ranges,series,data,mode){if(!canvas)return;const rect=canvas.getBoundingClientRect();const width=Math.max(320,rect.width||320),height=Math.max(260,rect.height||300),dpr=Math.max(1,window.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);const left=46,right=12,top=18,bottom=45,cw=width-left-right,ch=height-top-bottom;let max=mode==='stacked'?Math.max(0,...data.map(row=>row.reduce((a,b)=>a+b,0))):Math.max(0,...data.flat());if(max<=0)max=100;max*=1.12;ctx.strokeStyle='rgba(81,103,117,.14)';ctx.fillStyle='#788590';ctx.lineWidth=1;ctx.font='11px system-ui';ctx.textAlign='right';ctx.textBaseline='middle';for(let i=0;i<=4;i++){const y=top+ch*i/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();const val=max*(1-i/4);ctx.fillText(formatCompactEuro(val),left-7,y);}const groupW=cw/ranges.length,innerPad=Math.min(8,groupW*.12);if(mode==='stacked'){ranges.forEach((r,ri)=>{const x=left+ri*groupW+innerPad,bw=Math.max(5,groupW-innerPad*2);let yBase=top+ch;series.forEach((s,si)=>{const v=data[ri][si],h=v/max*ch;if(h>0){ctx.fillStyle=s.color;roundRect(ctx,x,yBase-h,bw,h,Math.min(5,bw/3));yBase-=h;}});});}else{ranges.forEach((r,ri)=>{const usable=Math.max(6,groupW-innerPad*2),gap=Math.min(3,usable*.06),bw=Math.max(2,(usable-gap*(series.length-1))/series.length);series.forEach((s,si)=>{const v=data[ri][si],h=v/max*ch,x=left+ri*groupW+innerPad+si*(bw+gap);if(h>0){ctx.fillStyle=s.color;roundRect(ctx,x,top+ch-h,bw,h,Math.min(5,bw/3));}});});}ctx.fillStyle='#667681';ctx.font='10px system-ui';ctx.textAlign='center';ctx.textBaseline='top';const every=ranges.length>12?2:1;ranges.forEach((r,i)=>{if(i%every!==0&&i!==ranges.length-1)return;ctx.fillText(r.shortLabel,left+i*groupW+groupW/2,top+ch+10);});}
function roundRect(ctx,x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();ctx.fill();}

function renderHistoryCategoryFilter(){const current=$('#history-category')?.value,type=$('#history-type')?.value||'',cats=state.categories.filter(c=>!type||c.type===type).sort((a,b)=>a.name.localeCompare(b.name,'fr'));$('#history-category').innerHTML='<option value="">Toutes les catégories</option>'+cats.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}${c.archived?' (archivée)':''}</option>`).join('');if(current&&cats.some(c=>c.id===current))$('#history-category').value=current;renderHistorySubFilter();}
function renderHistorySubFilter(){const catId=$('#history-category').value,current=$('#history-subcategory').value,subs=catId?state.subcategories.filter(s=>s.categoryId===catId):state.subcategories;$('#history-subcategory').innerHTML='<option value="">Toutes les sous-catégories</option>'+subs.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}${s.archived?' (archivée)':''}</option>`).join('');if(current&&subs.some(s=>s.id===current))$('#history-subcategory').value=current;}
function renderHistory(){if(!$('#history-list'))return;renderHistoryCategoryFilterIfNeeded();const q=$('#history-search').value.trim().toLowerCase(),type=$('#history-type').value,cat=$('#history-category').value,sub=$('#history-subcategory').value,from=$('#history-from').value,to=$('#history-to').value;const rows=[...state.transactions].filter(t=>{const catObj=getCategory(t.categoryId),subObj=getSubcategory(t.subcategoryId),hay=[t.place,t.note,catObj?.name,subObj?.name].filter(Boolean).join(' ').toLowerCase();return(!q||hay.includes(q))&&(!type||t.type===type)&&(!cat||t.categoryId===cat)&&(!sub||t.subcategoryId===sub)&&(!from||t.date>=from)&&(!to||t.date<=to);}).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));$('#history-list').innerHTML=rows.length?rows.map(t=>{const cat=getCategory(t.categoryId),sub=getSubcategory(t.subcategoryId),original=formatOriginal(t),eurEq=t.currency==='CHF'&&t.amountEurCents!=null?`≈ ${EUR.format(t.amountEurCents/100)}`:'';return `<button class="history-row" data-history-id="${t.id}"><div><div class="title">${escapeHtml(t.place||(t.type==='expense'?'Dépense':'Entrée'))}</div><div class="meta">${formatDate(t.date)} · ${escapeHtml(cat?.name||'Catégorie')} ${sub?`→ ${escapeHtml(sub.name)}`:''} ${t.fxPending?'<span class="pending-badge">conversion en attente</span>':''}</div></div><div><div class="amount ${t.type}">${t.type==='expense'?'−':'+'}${original}</div>${eurEq?`<div class="eur-equivalent">${eurEq}</div>`:''}</div></button>`;}).join(''):'<div class="empty-state">Aucune opération pour ces filtres.</div>';$$('[data-history-id]',$('#history-list')).forEach(btn=>btn.addEventListener('click',()=>openTransactionDetail(btn.dataset.historyId)));}
function renderHistoryCategoryFilterIfNeeded(){if($('#history-category').options.length<=1&&state.categories.length)renderHistoryCategoryFilter();}
function openTransactionDetail(id){const t=state.transactions.find(x=>x.id===id);if(!t)return;const cat=getCategory(t.categoryId),sub=getSubcategory(t.subcategoryId);$('#dialog-content').innerHTML=`<div class="sheet-head"><button class="circle-btn" data-close-modal="dialog-modal">×</button><div><p class="eyebrow">${t.type==='expense'?'Dépense':'Entrée'}</p><h2>Détail de l’opération</h2></div><span class="sheet-spacer"></span></div><div class="detail-grid"><div class="detail-item"><span>Montant</span><strong>${formatOriginal(t)}</strong></div><div class="detail-item"><span>Date</span><strong>${formatDate(t.date)}</strong></div><div class="detail-item"><span>Catégorie</span><strong>${escapeHtml(cat?.name||'—')}</strong></div><div class="detail-item"><span>Sous-catégorie</span><strong>${escapeHtml(sub?.name||'—')}</strong></div><div class="detail-item"><span>Équivalent EUR</span><strong>${t.amountEurCents!=null?EUR.format(t.amountEurCents/100):'En attente'}</strong></div><div class="detail-item"><span>Taux figé</span><strong>${t.currency==='CHF'&&t.exchangeRate?`1 CHF = ${Number(t.exchangeRate).toFixed(4)} EUR`:'—'}</strong></div><div class="detail-item full"><span>Lieu / origine</span><strong>${escapeHtml(t.place||'—')}</strong></div><div class="detail-item full"><span>Note</span><strong>${escapeHtml(t.note||'—')}</strong></div></div><div class="detail-actions"><button class="danger-btn" id="detail-delete">Supprimer</button><button class="primary-btn" id="detail-edit">Modifier</button></div>`;$('#detail-edit').addEventListener('click',()=>openEditTransaction(id));$('#detail-delete').addEventListener('click',()=>confirmDeleteTransaction(id));openModal('dialog-modal');}
function openEditTransaction(id){const t=state.transactions.find(x=>x.id===id);if(!t)return;const cats=state.categories.filter(c=>c.type===t.type);$('#dialog-content').innerHTML=`<div class="sheet-head"><button class="circle-btn" data-close-modal="dialog-modal">×</button><div><p class="eyebrow">Correction</p><h2>Modifier l’opération</h2></div><span class="sheet-spacer"></span></div><form id="edit-form" class="edit-form"><div class="grid2"><label>Montant *<input id="edit-amount" inputmode="decimal" value="${centsToInput(t.amountCents)}"></label><label>Devise<select id="edit-currency"><option value="EUR"${t.currency==='EUR'?' selected':''}>EUR</option><option value="CHF"${t.currency==='CHF'?' selected':''}>CHF</option></select></label></div><label>Date<input id="edit-date" type="date" value="${t.date}"></label><label>Catégorie *<select id="edit-category">${cats.map(c=>`<option value="${c.id}"${c.id===t.categoryId?' selected':''}>${escapeHtml(c.name)}${c.archived?' (archivée)':''}</option>`).join('')}</select></label><label>Sous-catégorie<select id="edit-subcategory"></select></label><label>Lieu / origine<input id="edit-place" value="${escapeAttr(t.place||'')}"></label><label>Note<textarea id="edit-note" rows="3">${escapeHtml(t.note||'')}</textarea></label><div id="edit-error" class="validation-error hidden"></div><div class="detail-actions"><button type="button" class="ghost-btn" id="edit-cancel">Annuler</button><button type="submit" class="primary-btn">Enregistrer</button></div></form>`;const fillSubs=()=>{const cid=$('#edit-category').value,subs=state.subcategories.filter(s=>s.categoryId===cid);$('#edit-subcategory').innerHTML='<option value="">Aucune</option>'+subs.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}${s.archived?' (archivée)':''}</option>`).join('');if(subs.some(s=>s.id===t.subcategoryId))$('#edit-subcategory').value=t.subcategoryId;};fillSubs();$('#edit-category').addEventListener('change',()=>{const cid=$('#edit-category').value,subs=state.subcategories.filter(s=>s.categoryId===cid);$('#edit-subcategory').innerHTML='<option value="">Aucune</option>'+subs.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}${s.archived?' (archivée)':''}</option>`).join('');});$('#edit-cancel').addEventListener('click',()=>openTransactionDetail(id));$('#edit-form').addEventListener('submit',async e=>{e.preventDefault();const amountCents=parseMoneyToCents($('#edit-amount').value),currency=$('#edit-currency').value,date=$('#edit-date').value,categoryId=$('#edit-category').value,subcategoryId=$('#edit-subcategory').value||null,relevantSubs=state.subcategories.filter(s=>s.categoryId===categoryId&&!s.archived);if(!amountCents||amountCents<=0)return editError('Renseigne un montant supérieur à 0.');if(!categoryId)return editError('Choisis une catégorie.');if(relevantSubs.length&&!subcategoryId)return editError('Choisis une sous-catégorie.');let amountEurCents=amountCents,exchangeRate=1,rateDate=date,fxPending=false;if(currency==='CHF'){const unchanged=t.currency==='CHF'&&t.amountCents===amountCents&&t.date===date&&t.exchangeRate;if(unchanged){amountEurCents=t.amountEurCents;exchangeRate=t.exchangeRate;rateDate=t.rateDate;fxPending=t.fxPending;}else{try{const fx=await getHistoricalFx(date);exchangeRate=fx.rate;rateDate=fx.date;amountEurCents=Math.round(amountCents*fx.rate);}catch{if(state.fx?.rate){exchangeRate=state.fx.rate;rateDate=state.fx.date;amountEurCents=Math.round(amountCents*state.fx.rate);}else{amountEurCents=null;exchangeRate=null;rateDate=null;fxPending=true;}}}}const updated={...t,amountCents,currency,date,categoryId,subcategoryId,place:$('#edit-place').value.trim(),note:$('#edit-note').value.trim(),amountEurCents,exchangeRate,rateDate,fxPending,updatedAt:new Date().toISOString()};await putOne('transactions',updated);state.transactions=state.transactions.map(x=>x.id===id?updated:x);closeModal('dialog-modal');toast('Opération modifiée');renderStats();renderHistory();});}
function editError(msg){const el=$('#edit-error');el.textContent=msg;el.classList.remove('hidden');}
function confirmDeleteTransaction(id){const t=state.transactions.find(x=>x.id===id);if(!t)return;$('#dialog-content').innerHTML=`<div class="sheet-head"><button class="circle-btn" data-close-modal="dialog-modal">×</button><div><p class="eyebrow">Confirmation</p><h2>Supprimer l’opération ?</h2></div><span class="sheet-spacer"></span></div><p>Cette suppression est définitive et mettra immédiatement les statistiques à jour.</p><div class="detail-actions"><button class="ghost-btn" id="delete-cancel">Annuler</button><button class="danger-btn" id="delete-confirm">Supprimer définitivement</button></div>`;$('#delete-cancel').addEventListener('click',()=>openTransactionDetail(id));$('#delete-confirm').addEventListener('click',async()=>{await deleteOne('transactions',id);state.transactions=state.transactions.filter(x=>x.id!==id);closeModal('dialog-modal');toast('Opération supprimée');renderStats();renderHistory();});}

function renderProfile(){$('#profile-firstname').value=state.profile?.firstName||'';$('#profile-lastname').value=state.profile?.lastName||'';$('#profile-email').value=state.profile?.email||'';$('#profile-cycle-day').value=normalizeCycleDay(state.profile?.cycleDay);}
async function saveProfile(e){e.preventDefault();const profile={firstName:$('#profile-firstname').value.trim(),lastName:$('#profile-lastname').value.trim(),email:$('#profile-email').value.trim(),cycleDay:normalizeCycleDay($('#profile-cycle-day').value)};await setSetting('profile',profile);state.profile=profile;renderProfile();renderStats();toast('Profil enregistré');}

function renderManage(){renderProfile();renderCategoryManager();}
function renderCategoryManager(){const cats=state.categories.filter(c=>c.type===state.manageType).sort((a,b)=>Number(a.archived)-Number(b.archived)||Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,'fr'));$('#category-manager').innerHTML=cats.map(c=>{const subs=state.subcategories.filter(s=>s.categoryId===c.id).sort((a,b)=>Number(a.archived)-Number(b.archived)||Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,'fr'));return `<div class="manager-group"><div class="manager-row ${c.archived?'archived':''}"><div><div class="manager-name">${escapeHtml(c.name)}</div><div class="manager-meta">${c.archived?'Archivée':'Active'} · ${subs.length} sous-catégorie${subs.length!==1?'s':''}</div></div><div class="manager-actions"><button class="icon-action ${c.favorite?'favorite':''}" data-cat-favorite="${c.id}">${c.favorite?'★':'☆'}</button><button class="icon-action" data-cat-edit="${c.id}">Renommer</button><button class="icon-action" data-sub-add="${c.id}">+ Sous-cat.</button><button class="icon-action" data-cat-archive="${c.id}">${c.archived?'Réactiver':'Archiver'}</button></div></div>${subs.length?`<div class="sub-list">${subs.map(s=>`<div class="sub-row ${s.archived?'archived':''}"><div><strong>${escapeHtml(s.name)}</strong><div class="manager-meta">${s.archived?'Archivée':'Active'}</div></div><div class="manager-actions"><button class="icon-action ${s.favorite?'favorite':''}" data-sub-favorite="${s.id}">${s.favorite?'★':'☆'}</button><button class="icon-action" data-sub-edit="${s.id}">Renommer</button><button class="icon-action" data-sub-archive="${s.id}">${s.archived?'Réactiver':'Archiver'}</button></div></div>`).join('')}</div>`:''}</div>`;}).join('');$$('[data-cat-favorite]',$('#category-manager')).forEach(b=>b.addEventListener('click',()=>toggleFavorite('category',b.dataset.catFavorite)));$$('[data-sub-favorite]',$('#category-manager')).forEach(b=>b.addEventListener('click',()=>toggleFavorite('subcategory',b.dataset.subFavorite)));$$('[data-cat-archive]',$('#category-manager')).forEach(b=>b.addEventListener('click',()=>toggleArchive('category',b.dataset.catArchive)));$$('[data-sub-archive]',$('#category-manager')).forEach(b=>b.addEventListener('click',()=>toggleArchive('subcategory',b.dataset.subArchive)));$$('[data-cat-edit]',$('#category-manager')).forEach(b=>b.addEventListener('click',()=>openEntityEditor('category',b.dataset.catEdit)));$$('[data-sub-edit]',$('#category-manager')).forEach(b=>b.addEventListener('click',()=>openEntityEditor('subcategory',b.dataset.subEdit)));$$('[data-sub-add]',$('#category-manager')).forEach(b=>b.addEventListener('click',()=>openEntityEditor('subcategory',null,b.dataset.subAdd)));}
async function toggleFavorite(kind,id){if(kind==='category'){const row=getCategory(id);row.favorite=!row.favorite;await putOne('categories',row);}else{const row=getSubcategory(id);row.favorite=!row.favorite;await putOne('subcategories',row);}await reloadState();renderManage();renderStats();renderHistory();}
async function toggleArchive(kind,id){if(kind==='category'){const row=getCategory(id);row.archived=!row.archived;await putOne('categories',row);toast(row.archived?'Catégorie archivée':'Catégorie réactivée');}else{const row=getSubcategory(id);row.archived=!row.archived;await putOne('subcategories',row);toast(row.archived?'Sous-catégorie archivée':'Sous-catégorie réactivée');}await reloadState();renderManage();renderStats();renderHistory();}
function openEntityEditor(kind,id=null,parentId=null){const existing=kind==='category'?getCategory(id):getSubcategory(id),title=id?(kind==='category'?'Renommer la catégorie':'Renommer la sous-catégorie'):(kind==='category'?'Nouvelle catégorie':'Nouvelle sous-catégorie');$('#dialog-content').innerHTML=`<div class="sheet-head"><button class="circle-btn" data-close-modal="dialog-modal">×</button><div><p class="eyebrow">Gestion</p><h2>${title}</h2></div><span class="sheet-spacer"></span></div><form id="entity-form" class="edit-form"><label>Nom *<input id="entity-name" maxlength="70" value="${escapeAttr(existing?.name||'')}" autofocus></label><div id="entity-error" class="validation-error hidden"></div><div class="detail-actions"><button type="button" class="ghost-btn" data-close-modal="dialog-modal">Annuler</button><button class="primary-btn" type="submit">Enregistrer</button></div></form>`;$('#entity-form').addEventListener('submit',async e=>{e.preventDefault();const name=$('#entity-name').value.trim();if(!name){$('#entity-error').textContent='Donne un nom.';$('#entity-error').classList.remove('hidden');return;}if(kind==='category'){const row=existing||{id:uid('cat'),type:state.manageType,favorite:false,archived:false,createdAt:new Date().toISOString()};row.name=name;await putOne('categories',row);}else{const row=existing||{id:uid('sub'),categoryId:parentId,favorite:false,archived:false,createdAt:new Date().toISOString()};row.name=name;await putOne('subcategories',row);}await reloadState();closeModal('dialog-modal');renderManage();renderStats();renderHistory();toast('Enregistré');});openModal('dialog-modal');}

async function downloadBackup(){const data=await exportAllData();downloadBlob(JSON.stringify(data,null,2),`capi-sauvegarde-${localDateKey()}.json`,'application/json');toast('Sauvegarde exportée');}
async function restoreBackupFile(e){const file=e.target.files?.[0];if(!file)return;try{const text=await file.text(),payload=JSON.parse(text);if(!confirm('Restaurer cette sauvegarde remplacera les données présentes sur cet appareil. Continuer ?'))return;await restoreAllData(payload);await reloadState();renderProfile();renderManage();renderStats();renderHistory();renderFx();toast('Sauvegarde restaurée');}catch(err){alert('Impossible de restaurer ce fichier : '+err.message);}finally{e.target.value='';}}
function downloadCsv(){const header=['type','date','montant_original','devise','montant_eur','taux_chf_eur','date_taux','categorie','sous_categorie','lieu','note'],lines=[header.join(';')],sorted=[...state.transactions].sort((a,b)=>a.date.localeCompare(b.date));for(const t of sorted){const cat=getCategory(t.categoryId),sub=getSubcategory(t.subcategoryId),values=[t.type==='expense'?'depense':'entree',t.date,(t.amountCents/100).toFixed(2),t.currency,t.amountEurCents==null?'':(t.amountEurCents/100).toFixed(2),t.exchangeRate??'',t.rateDate??'',cat?.name||'',sub?.name||'',t.place||'',t.note||''].map(csvCell);lines.push(values.join(';'));}downloadBlob('\ufeff'+lines.join('\n'),`capi-${localDateKey()}.csv`,'text/csv;charset=utf-8');toast('CSV exporté');}

function getCategory(id){return state.categories.find(c=>c.id===id)||null;}
function getSubcategory(id){return id?state.subcategories.find(s=>s.id===id)||null:null;}
function openModal(id){const el=$('#'+id);el.classList.remove('hidden');el.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
function closeModal(id){const el=$('#'+id);el.classList.add('hidden');el.setAttribute('aria-hidden','true');document.body.style.overflow='';}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('show'),1800);}
function localDateKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function parseMoneyToCents(value){if(value==null)return null;const normalized=String(value).trim().replace(/\s/g,'').replace(',','.');if(!/^\d+(\.\d{0,2})?$/.test(normalized))return null;return Math.round(Number(normalized)*100);}
function centsToInput(cents){return(cents/100).toFixed(2).replace('.',',');}
function formatOriginal(t){const value=t.amountCents/100;return t.currency==='CHF'?CHF.format(value):EUR.format(value);}
function formatDate(date){if(!date)return'—';return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(date+'T12:00:00'));}
function formatCompactEuro(v){if(v>=1000000)return`${(v/1000000).toFixed(v>=10000000?0:1).replace('.',',')} M€`;if(v>=1000)return`${(v/1000).toFixed(v>=10000?0:1).replace('.',',')} k€`;return`${Math.round(v)} €`;}
function normalizeCycleDay(v){const n=Math.round(Number(v)||1);return Math.max(1,Math.min(31,n));}
function cycleDate(year,monthIndex,day){const last=new Date(year,monthIndex+1,0).getDate();return new Date(year,monthIndex,Math.min(day,last),12,0,0,0);}
function buildCycleRanges(count,cycleDay){const day=normalizeCycleDay(cycleDay),today=new Date();today.setHours(12,0,0,0);let start=cycleDate(today.getFullYear(),today.getMonth(),day);if(today<start)start=cycleDate(today.getFullYear(),today.getMonth()-1,day);const starts=[];for(let i=count-1;i>=0;i--)starts.push(cycleDate(start.getFullYear(),start.getMonth()-i,day));return starts.map(s=>{const next=cycleDate(s.getFullYear(),s.getMonth()+1,day),end=new Date(next);end.setDate(end.getDate()-1);return{start:localDateKey(s),end:localDateKey(end),shortLabel:new Intl.DateTimeFormat('fr-FR',{month:'short',year:'2-digit'}).format(s).replace('.','')};});}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function escapeAttr(s=''){return escapeHtml(s);}
function capitalize(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s;}
function csvCell(v){const s=String(v??'');return`"${s.replace(/"/g,'""')}"`;}
function downloadBlob(content,filename,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
function debounce(fn,ms){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};}
function registerServiceWorker(){if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));}}
