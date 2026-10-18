"use strict";
/* ---------------- SALES TRACKER · PULSE DELIVERIES (read-only) ----------------
   For stores that also use Axiom Pulse: a vehicle delivered in Pulse shows as Delivered in the sales log
   (with Pulse's delivery date and a small "Pulse" tag). Pulse is never changed. Switched on per dealership in
   Dealership settings (General Manager / Master): config.pulseLink = { on }.
   The matching runs in the database (sales_pulse_apply): same stock #, else the same customer name, only when
   exactly one open deal fits; each Pulse delivery is applied once, so a deal changed back by hand stays as set.
   It runs when the Sales Tracker or the Dashboard is open (at most every 5 minutes) and on "Check Pulse now". */
var PL = { store:null, last:0, running:false, res:null, err:null };
function plOn(){ return !!(state.config && state.config.pulseLink && state.config.pulseLink.on); }
function plRun(manual, retry){
  if (PL.store !== state.activeDealershipId) PL = { store:state.activeDealershipId, last:0, running:false, res:null, err:null };
  if (PL.running || !stOnline() || !state.activeDealershipId) return;
  var store = PL.store; PL.running = true; PL.last = Date.now(); if (manual) render();
  sb.rpc("sales_pulse_apply", { p_dealer:store }).then(function(r){
    PL.running = false; if (PL.store !== store) return;
    if (r.error){ PL.err = r.error.message; if (manual) toast("Couldn't check Pulse: " + r.error.message, "err"); render(); return; }
    var x = r.data || {}; PL.err = null;
    /* just switched on: the setting may still be saving, so try once more */
    if (x.off && retry){ setTimeout(function(){ plRun(manual, false); }, 3000); return; }
    PL.res = Object.assign({ at:Date.now() }, x);
    if (x.applied > 0){
      Object.keys(ST.months).forEach(function(m){ stLoad(m, true); }); ST.carryFor = null; if (typeof INS !== "undefined") INS.loaded = {};
      toast("From Pulse: " + x.applied + " deliver" + (x.applied === 1 ? "y" : "ies") + " marked Delivered.", "ok");
    } else if (manual) toast(x.off ? "Pulse deliveries are switched off." : "Checked Pulse: nothing new to mark Delivered.", "ok");
    render();
  }, function(e){ PL.running = false; PL.err = e && e.message ? e.message : String(e); render(); });
}
/* opening the Sales Tracker or the Dashboard checks Pulse, at most every 5 minutes */
function plAuto(){
  if (PL.store !== state.activeDealershipId){ PL = { store:state.activeDealershipId, last:0, running:false, res:null, err:null }; }
  if (!plOn() || PL.running || Date.now() - PL.last < 5*60*1000) return;
  PL.last = Date.now(); setTimeout(function(){ plRun(false); }, 600);
}
/* ---- Dealership settings card (GM / Master) ---- */
function viewPulseSettings(){
  if (!V.isAdmin() || !state.config) return "";
  var on = plOn(), x = PL.store === state.activeDealershipId ? PL.res : null;
  return '<div class="card"><div class="card-h"><h2>Pulse deliveries</h2><div class="sp"><span class="tag ' + (on ? "ok" : "") + '">' + (on ? "Linked" : "Off") + '</span></div></div><div class="card-b">' +
    '<p class="muted small" style="max-width:80ch;margin-top:0">When a vehicle is delivered in <b>Axiom Pulse</b>, the Sales Tracker marks the deal <b>Delivered</b> with Pulse\'s delivery date and a small "Pulse" tag. ' +
    'Read-only: nothing in Pulse is changed. Deals are matched on the stock #, or the customer\'s name when there\'s no stock #, and only when exactly one open deal fits. ' +
    'A deal you change back by hand stays as you set it, and the Google Drive sync won\'t move a Pulse-delivered deal back to open.</p>' +
    '<div class="grid g2"><div>' +
      '<label class="uc-feat ' + (on ? "on" : "") + '"><span>Link Pulse deliveries<small>to this store\'s Sales Tracker</small></span><span class="uc-sw"><input type="checkbox" data-pl="on" ' + (on ? "checked" : "") + '><i></i></span></label>' +
      (on ? '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><button type="button" class="btn sm" data-pl="run"' + (PL.running ? " disabled" : "") + '>' + (PL.running ? "Checking…" : "Check Pulse now") + '</button>' +
        (PL.err ? '<span class="small" style="color:var(--danger)">' + esc(PL.err) + '</span>' : x && !x.off ? '<span class="small muted">Last check ' + esc(new Date(x.at).toLocaleTimeString("en-CA", { hour:"numeric", minute:"2-digit" })) + ': ' + (x.applied ? x.applied + " marked Delivered" : "nothing new") + '</span>' : '') + '</div>' : '') +
    '</div><div class="small muted">Checked automatically whenever the Sales Tracker or the Dashboard is open (every 5 minutes at most). Works for any store that uses Pulse: switch it on in that store\'s settings.</div></div>' +
    '</div></div>';
}
function plEvent(ev){
  var el = ev.target && ev.target.closest ? ev.target.closest("[data-pl]") : null; if (!el || !state.config || !V.isAdmin()) return;
  var a = el.getAttribute("data-pl");
  if (a === "on" && ev.type === "change"){
    state.config.pulseLink = Object.assign({}, state.config.pulseLink || {}, { on:!!el.checked }); commit();
    toast("Pulse deliveries are " + (el.checked ? "linked" : "off") + ".", "ok");
    if (el.checked) setTimeout(function(){ plRun(true, true); }, 1500);
    render();
  }
  if (a === "run" && ev.type === "click"){ ev.preventDefault(); plRun(true, false); }
}
document.addEventListener("click", plEvent);
document.addEventListener("change", plEvent);
