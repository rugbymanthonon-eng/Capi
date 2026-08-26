import { getSetting } from "./db.js";

const $ = (s) => document.querySelector(s);
let token = 0;

function normalizeCycleDay(v){
  return Math.max(1, Math.min(31, Math.round(Number(v) || 1)));
}

function cycleDate(year, monthIndex, day){
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, last), 12, 0, 0, 0);
}

function buildRecentStarts(count, cycleDay){
  const day = normalizeCycleDay(cycleDay);
  const today = new Date();
  today.setHours(12,0,0,0);
  let start = cycleDate(today.getFullYear(), today.getMonth(), day);
  if(today < start) start = cycleDate(today.getFullYear(), today.getMonth() - 1, day);

  const starts = [];
  for(let i = count - 1; i >= 0; i--){
    starts.push(cycleDate(start.getFullYear(), start.getMonth() - i, day));
  }
  return starts;
}

async function repaintCustomMonthLabels(){
  const myToken = ++token;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if(myToken !== token) return;

  const canvas = $("#custom-chart");
  const input = $("#cycle-count");
  if(!canvas || !input || !canvas.width || !canvas.height) return;

  const profile = await getSetting("profile", { cycleDay: 25 });
  if(myToken !== token) return;

  const count = Math.max(1, Math.min(36, Math.round(Number(input.value) || 1)));
  const starts = buildRecentStarts(count, profile?.cycleDay || 25);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, rect.width || 320);
  const height = Math.max(260, rect.height || 300);
  const ctx = canvas.getContext("2d");

  const left = 46;
  const right = 12;
  const bottom = 45;
  const chartWidth = width - left - right;
  const groupWidth = chartWidth / Math.max(1, starts.length);

  ctx.clearRect(0, height - bottom + 1, width, bottom);
  ctx.fillStyle = "#667681";
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const every = starts.length > 12 ? 2 : 1;
  starts.forEach((date, i) => {
    if(i % every !== 0 && i !== starts.length - 1) return;
    const label = new Intl.DateTimeFormat("fr-FR", { month: "short" })
      .format(date)
      .replace(".", "")
      .toLowerCase();
    ctx.fillText(label, left + i * groupWidth + groupWidth / 2, height - bottom + 10);
  });
}

function schedule(){
  const run = () => setTimeout(repaintCustomMonthLabels, 40);
  run();
  setTimeout(repaintCustomMonthLabels, 180);
}

function bind(){
  const input = $("#cycle-count");
  input?.addEventListener("input", schedule);
  input?.addEventListener("change", schedule);
  $("#add-series")?.addEventListener("click", schedule);
  document.querySelectorAll('[data-chart-mode]').forEach(el => el.addEventListener("click", schedule));
  document.querySelectorAll('[data-nav="stats"]').forEach(el => el.addEventListener("click", schedule));
  window.addEventListener("resize", schedule);
  document.addEventListener("click", event => {
    if(event.target.closest('[data-remove-series]')) schedule();
  });
  schedule();
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once:true });
else bind();
