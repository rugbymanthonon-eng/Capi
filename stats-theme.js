const style = document.createElement("style");
style.id = "capi-stats-enhanced-style";
style.textContent = `
.cycle-stepper{display:grid;grid-template-columns:38px auto 38px;align-items:center;gap:5px;padding:5px;border-radius:18px;background:rgba(229,235,238,.78);border:1px solid rgba(45,70,89,.08);box-shadow:inset 0 1px 0 rgba(255,255,255,.85);transition:opacity .18s ease}
.cycle-stepper.disabled{opacity:.42}
.cycle-step-btn{width:38px;height:38px;border:0;border-radius:13px;background:rgba(255,255,255,.82);color:#405363;font-size:1.35rem;font-weight:650;display:grid;place-items:center;box-shadow:0 3px 9px rgba(35,55,72,.06)}
.cycle-step-btn:active:not(:disabled){transform:scale(.95)}
.cycle-step-btn:disabled{cursor:default}
.cycle-count-box{display:flex;align-items:baseline;gap:4px;padding:0 3px;min-width:76px;justify-content:center;color:#687681;font-size:.72rem;font-weight:700}
.cycle-count-box input{width:32px!important;min-width:0;border:0;background:transparent;box-shadow:none;padding:0;text-align:right;font-size:1.05rem;font-weight:850;color:var(--ink);appearance:textfield;-moz-appearance:textfield}
.cycle-count-box input::-webkit-outer-spin-button,.cycle-count-box input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.stats-filter-button{width:100%;border:1px solid rgba(45,70,89,.08);background:rgba(239,244,246,.68);border-radius:18px;display:grid;grid-template-columns:44px 1fr 20px;align-items:center;gap:11px;padding:11px 13px;margin:2px 0 14px;color:inherit;text-align:left;box-shadow:inset 0 1px 0 rgba(255,255,255,.75)}
.stats-filter-button:active{transform:scale(.992)}
.stats-filter-icon{width:40px;height:40px;border-radius:13px;background:rgba(47,121,216,.10);color:var(--blue);display:grid;place-items:center}
.stats-filter-icon svg{width:22px;height:22px;fill:currentColor}
.stats-filter-copy{min-width:0;display:grid;gap:2px}
.stats-filter-title{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:#788590;font-weight:800}
.stats-filter-copy strong{font-size:.91rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#stats-period-label{font-size:.74rem;color:#6f7c87;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stats-filter-chevron{font-size:1.6rem;font-weight:300;color:#87939c}
.stats-filter-form{display:grid;gap:18px}
.stats-filter-form h3{margin:0 0 9px;font-size:.82rem;color:#566673}
.stats-filter-options{display:grid;gap:7px;max-height:42vh;overflow:auto;padding:2px}
.stats-filter-group{display:grid;gap:6px}
.stats-filter-subs{display:grid;gap:5px;padding-left:18px}
.stats-filter-option{width:100%;border:1px solid rgba(45,70,89,.08);background:rgba(255,255,255,.72);border-radius:14px;padding:11px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;color:#41515e;font-weight:750}
.stats-filter-option.sub{font-size:.86rem;background:rgba(238,243,245,.74);font-weight:700}
.stats-filter-option em{font-style:normal;color:#87939c;font-weight:600;font-size:.75rem}
.stats-filter-option .filter-check{opacity:0;color:var(--blue);font-weight:900}
.stats-filter-option.selected{border-color:rgba(47,121,216,.28);background:rgba(47,121,216,.09);color:#204f88}
.stats-filter-option.selected .filter-check{opacity:1}
.stats-period-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.stats-period-grid label{font-size:.78rem;font-weight:750;color:#5b6974}
.stats-period-grid input{margin-top:6px}
.stats-filter-help{margin:8px 0 0!important;font-size:.74rem;color:#7a8791;line-height:1.4}
@media(max-width:700px){.card-head{flex-wrap:wrap}.cycle-stepper{margin-left:auto}}
@media(max-width:430px){.card-head{gap:10px}.cycle-stepper{width:100%;grid-template-columns:40px 1fr 40px;margin-top:2px}.cycle-count-box{justify-content:center}.stats-period-grid{grid-template-columns:1fr}}
`;
if (!document.getElementById(style.id)) document.head.appendChild(style);
