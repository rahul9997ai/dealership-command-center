"use strict";
/* ---------------- ACTIONS ---------------- */
function findLine(id){
  for (var i=0;i<state.tx.lines.length;i++) if (state.tx.lines[i].lineId === id) return state.tx.lines[i];
  return null;
}
function makeLine(p){
  var line = { lineId:C.uid("L"), productId:p.id, term:null, km:null, interval:null, deductible:null,
    price:null, priceOverridden:false, declined:false, packages:{ preferred:false, essential:false, basic:false } };
  if (p.uses.term){
    var want = C.primaryTerm(state.tx);
    if (want){ var best = p.terms[0];
      p.terms.forEach(function(x){ if (Math.abs(x-want) < Math.abs(best-want)) best = x; });
      line.term = best;
    } else line.term = p.terms[Math.min(2, p.terms.length-1)];
  }
  if (p.uses.km) line.km = p.kms[Math.min(2, p.kms.length-1)];
  if (p.uses.interval) line.interval = p.intervals[1] !== undefined ? p.intervals[1] : p.intervals[0];
  if (p.uses.deductible) line.deductible = p.deductibles[p.deductibles.length-1];
  return line;
}
/* Take the Finance Manager to a problem: open the product's options if the field lives there,
   switch on the red markers, then scroll the field into the middle of the screen. */
function jumpToIssue(iss){
  if (!iss) return;
  state.ui.finCheck = true;
  if (iss.cfg && iss.product) state.ui.productConfigOpen = iss.product;
  commit();
  setTimeout(function(){
    var el = document.querySelector(iss.target) || (iss.row ? document.querySelector(iss.row) : null);
    if (!el) return;
    /* instant, not smooth: a re-render mid-animation (e.g. a toast closing) would stop it halfway */
    if (el.scrollIntoView) el.scrollIntoView({ block:"center" });
    if (el.focus) { try { el.focus({ preventScroll:true }); } catch (e) {} }
  }, 30);
}
/* After every render on the Finance screen, outline the fields that still block Complete. */
function markIssues(){
  if (!state.ui.finCheck || state.route !== "finance" || !state.tx || !state.loggedIn) return;
  C.validate(state, state.tx).issues.forEach(function(iss){
    var el = null;
    try { el = document.querySelector(iss.target) || (iss.row ? document.querySelector(iss.row) : null); } catch (e) {}
    if (el) el.classList.add("need");
  });
}
function completeDeal(skipCostCheck){
  if (!V.isAdmin()) state.tx.fsmUserId = state.currentUserId;
  /* Already in Reports? Then this is an update: keep its original date, and skip it if nothing changed. */
  var prev = state.completed.filter(function(d){ return d.id === state.tx.id; })[0];
  if (prev && C.dealSig(prev) === C.dealSig(state.tx)){ toast("Nothing has changed since this deal was completed.","info"); commit(); return; }
  var v = C.validate(state, state.tx);
  if (!v.ok){
    toast(v.errors.length === 1 ? "One thing to finish: " + v.errors[0] : v.errors.length + " things to finish before completing — they're marked in red.", "err");
    jumpToIssue(v.issues[0]);
    return;
  }
  var noCost = v.totals.soldLines.filter(function(L){ return L.costMissing && L.price !== null; }).map(function(L){ return L.product.name; });
  var soldPkg = v.totals.packages.filter(function(p){ return p.key === v.totals.selectedPackage; })[0];
  (soldPkg ? soldPkg.gifts : []).forEach(function(g){
    var lb = (state.config.gifts || []).filter(function(x){ return x.id === g.presetId; })[0];
    var listHas = lb && lb.cost !== null && lb.cost !== undefined && lb.cost !== "" && !isNaN(Number(lb.cost));
    if (!listHas && !(Number(g.cost) > 0)) noCost.push(g.name + " (promotional offer)");
  });
  if (noCost.length && !skipCostCheck){
    askConfirm("Some items have no dealer cost", noCost.join(", ")
      + (noCost.length > 1 ? " have" : " has") + " no cost entered, so gross in reports will be overstated. Add the cost (⚙ on a product, or tap the offer), or complete anyway.",
      "Complete anyway", function(){ completeDeal(true); });
    return;
  }
  var done = C.clone(state.tx);
  done.status = "Completed"; done.createdAt = prev && prev.createdAt ? prev.createdAt : C.todayISO();
  state.completed = state.completed.filter(function(d){ return d.id !== done.id; });
  state.saved = (state.saved || []).filter(function(d){ return d.id !== done.id; });
  state.completed.push(done);
  state.tx.status = "Completed";
  if (!prev) state.tx.display.mode = "thankyou";
  state.ui.finCheck = false;
  toast(prev ? "Deal " + done.id + " updated in Reports." : "Deal " + done.id + " completed and sent to reporting.","ok");
  commit();
}

/* ---------------- KEEPING THE DEAL ON SCREEN SAFE ----------------
   Auto-save: once the deal has a customer name it is copied into Saved deals, so a closed tab
   or a crash can't lose it. It runs at most every 30 seconds while the Finance Manager works
   (each save is a cloud write and an audit-log row) and straight away when the deal is about
   to leave the screen or the tab is hidden. Completed deals are never auto-saved. */
var DRAFT_EVERY_MS = 30000, draftTimer = null;
function dealHasContent(tx){
  return !!(tx && (String(tx.customer.name || "").trim() || tx.vehicle.model || tx.vehicle.stock || tx.vehicle.price || tx.lines.length));
}
function isCompletedId(id){ return state.completed.some(function(d){ return d.id === id; }); }
function storeDraft(force){
  clearTimeout(draftTimer); draftTimer = null;
  var tx = state.tx;
  if (!state.loggedIn || !tx || !tx.dealershipId || tx.status === "Completed" || isCompletedId(tx.id)) return false;
  if (!(force ? dealHasContent(tx) : String(tx.customer.name || "").trim())) return false;
  var list = state.saved || (state.saved = []);
  var prev = list.filter(function(d){ return d.id === tx.id; })[0];
  if (prev && C.dealSig(prev) === C.dealSig(tx)) return false;
  var copy = C.clone(tx);
  copy.status = "Saved"; copy.savedAt = new Date().toISOString(); copy.savedBy = state.currentUserId;
  if (!copy.fsmUserId && !V.isAdmin()) copy.fsmUserId = state.currentUserId;
  state.saved = list.filter(function(d){ return d.id !== copy.id; });
  state.saved.push(copy);
  return true;
}
/* Called on every commit: start the 30-second clock if the deal needs saving. It deliberately
   doesn't re-render, so a field being typed in is never disturbed. */
window.__DCC_AUTOSAVE__ = function(){
  var tx = state.tx;
  if (draftTimer || !state.loggedIn || !tx || !String(tx.customer.name || "").trim() || tx.status === "Completed" || isCompletedId(tx.id)) return;
  draftTimer = setTimeout(function(){ draftTimer = null; if (storeDraft(false)){ V.persist(); cloudSchedule(); } }, DRAFT_EVERY_MS);
};
function flushDraft(){ if (storeDraft(false)){ V.persist(); cloudPush(); } }
document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "hidden") flushDraft(); });
window.addEventListener("pagehide", flushDraft);

/* Before anything replaces the deal on screen (New deal, opening another deal, switching
   dealership): nothing in progress is ever thrown away without asking. */
function leaveDeal(go, kind){
  var tx = state.tx;
  if (!tx || !dealHasContent(tx)) return go();
  var title = kind === "switch" ? "Switch dealership?" : kind === "open" ? "Open the other deal?" : "Start a new deal?";
  var done = state.completed.filter(function(d){ return d.id === tx.id; })[0];
  if (done){
    if (C.dealSig(done) === C.dealSig(tx)) return go();
    askChoice(title, "You changed deal " + tx.id + " after it was completed. Reports still show the earlier version.", [
      { label:"Discard changes", kind:"danger", go:go },
      /* carry on only if the update really went through (it may stop to ask about a missing cost or a problem) */
      { label:"Update and continue", kind:"primary", go:function(){
          completeDeal();
          var now = state.completed.filter(function(d){ return d.id === tx.id; })[0];
          if (!state.ui.confirm && now && C.dealSig(now) === C.dealSig(tx)) go(); } }
    ]);
    return;
  }
  var saved = (state.saved || []).filter(function(d){ return d.id === tx.id; })[0];
  var name = String(tx.customer.name || "").trim();
  if (saved && C.dealSig(saved) === C.dealSig(tx)){
    if (name) toast(name + "'s deal is in Saved deals.","ok");
    return go();
  }
  askChoice(title, (name ? name + "'s deal isn't finished. " : "This deal isn't finished. ") + "Keep it in Saved deals to pick it up later, or discard it.", [
    { label:"Discard it", kind:"danger", go:function(){
        if (saved){ state.saved = state.saved.filter(function(d){ return d.id !== tx.id; }); cloud.del.x.push(tx.id); }
        go(); } },
    { label:"Keep it in Saved deals", kind:"primary", go:function(){
        storeDraft(true); toast((name ? name + "'s deal is" : "The deal is") + " in Saved deals.","ok"); go(); } }
  ]);
}
function resetDealUi(){ state.ui.finCheck = false; state.ui.productConfigOpen = null; state.ui.giftEdit = null; }

function saveDeal(){
  var tx = state.tx;
  if (!tx) return;
  if (!tx.customer.name && !tx.vehicle.model && !tx.lines.length){ toast("Add a customer, vehicle or product before saving.","err"); commit(); return; }
  if (!V.isAdmin() || !tx.fsmUserId) tx.fsmUserId = tx.fsmUserId || state.currentUserId;
  if (isCompletedId(tx.id)){ toast("This deal is already completed — use Update completed deal to save changes to it.","err"); commit(); return; }
  var copy = C.clone(tx);
  copy.status = "Saved"; copy.savedAt = new Date().toISOString(); copy.savedBy = state.currentUserId;
  state.saved = (state.saved || []).filter(function(d){ return d.id !== copy.id; });
  state.saved.push(copy);
  toast("Deal saved. Find it under Saved deals to continue later.","ok");
  commit();
}
function openSaved(id){
  var d = (state.saved || []).filter(function(x){ return x.id === id; })[0];
  if (!d) return;
  if (d.dealershipId && d.dealershipId !== state.activeDealershipId) V.setDealership(d.dealershipId);
  var o = C.clone(d); o.status = "Open";
  state.tx = o; state.route = "finance"; state.ui.savedList = false; resetDealUi();
  toast("Saved deal reopened.","ok"); commit();
}
function savedModal(){
  if (!state.ui.savedList) return "";
  var list = V.savedForMe(), onScreen = state.tx ? state.tx.id : null;
  var rows = list.map(function(d){
    var when = d.savedAt ? new Date(d.savedAt).toLocaleString("en-CA",{dateStyle:"medium",timeStyle:"short"}) : "—";
    var veh = [d.vehicle.year, d.vehicle.make, d.vehicle.model].filter(Boolean).join(" ");
    return `<tr><td class="nowrap">${esc(when)}</td><td>${esc(d.customer.name || "No name yet")}</td><td>${esc(veh || "—")}</td>
      <td>${esc(userById(d.fsmUserId).name)}</td>
      <td class="right nowrap">${d.id === onScreen ? `<span class="tag ok">On screen now</span>`
        : `<button class="btn sm primary" data-act="saved-open" data-deal="${esc(d.id)}">Open</button>
        <button class="btn sm danger" data-act="saved-delete" data-deal="${esc(d.id)}">Delete</button>`}</td></tr>`;
  }).join("");
  return `<div class="modal-bg" data-act="saved-close"><div class="modal" style="max-width:760px">
    <div class="modal-h"><h2>Saved deals</h2><div class="sp"><button class="btn" data-act="saved-close">Close</button></div></div>
    <div class="modal-b">${list.length ? `<p class="muted small" style="margin:0 0 10px">Deals are saved here automatically once they have a customer name, and leave this list when they're completed.</p>
      <div class="tablewrap"><table><thead><tr><th>Saved</th><th>Customer</th><th>Vehicle</th><th>Finance Manager</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<p class="muted" style="margin:0">No saved deals. Deals are saved here automatically once they have a customer name, or use <strong>Save deal</strong> to pause one and come back to it later.</p>`}</div></div></div>`;
}
function newDeal(){
  state.tx = C.newTransaction(V.isAdmin() ? (state.tx ? state.tx.fsmUserId : V.firstFsmFor(state.activeDealershipId)) : state.currentUserId, state.activeDealershipId);
  V.applyFinanceDefaults(state.tx);
  state.route = "finance"; resetDealUi();
  commit();
}
/* Reopening a saved deal loads a copy as the live transaction but leaves the
   saved record in Reports, so nothing vanishes if you leave without finishing.
   Completing it again replaces the saved record (matched by deal id). */
function openSavedDeal(id){
  var deal = state.completed.filter(function(d){ return d.id === id; })[0];
  if (!deal){ toast("That deal couldn't be found.","err"); return; }
  var opened = C.clone(deal);
  opened.status = "Open";
  /* setDealership also brings in that dealership's own product list */
  if (opened.dealershipId && opened.dealershipId !== state.activeDealershipId) V.setDealership(opened.dealershipId);
  state.tx = opened;
  state.route = "finance"; resetDealUi();
  toast("Deal " + id + " reopened for editing.","ok");
  commit();
}

/* A refresh, or signing back in after the session timed out, used to start over on a blank
   deal. Put back the deal and the screen that were open — only for the same person, and only
   in a dealership they can still open. `resume` is captured in boot(). */
var resume = null;
function resumeSession(u){
  var r = resume; resume = null;
  if (!r || r.user !== u.id) return false;
  if (r.route) state.route = r.route;
  var tx = r.tx;
  if (!dealHasContent(tx) || !state.dealerships.some(function(d){ return d.id === tx.dealershipId; })) return false;
  if (tx.dealershipId !== state.activeDealershipId){
    if (!V.isMaster()) return false;
    V.setDealership(tx.dealershipId);
  }
  if (!V.isAdmin()) tx.fsmUserId = u.id;
  state.tx = tx;
  return true;
}
