"use strict";
/* ---------------- BOOT ---------------- */
function boot(){
  state.ui.confirm = null; state.ui.savedList = false; state.ui.pwReset = null; state.ui.history = null; state.ui.giftEdit = null;
  /* What was on screen before this page load (a refresh keeps the browser-tab copy); signing in
     puts it back for the same person — see resumeSession(). */
  resume = { user:state.currentUserId, route:state.route, tx: state.tx ? C.clone(state.tx) : null };
  if (state.tx) V.applyFinanceDefaults(state.tx);
  var r = presetRange("monthly");
  state.ui.reports.from = r.from; state.ui.reports.to = r.to;
  authInit();
  commit();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

function addToPackage(pid, pkgKey){
  var line = state.tx.lines.filter(function(l){ return l.productId === pid; })[0];
  if (!line){
    var prod = C.productById(state, pid);
    if (!prod) return;
    line = makeLine(prod);
    state.tx.lines.push(line);
  }
  if (!line.packages) line.packages = { preferred:false, essential:false, basic:false };
  line.packages[pkgKey || "preferred"] = true;
}
window.__DCC_TEST__ = { productIconSvg:V.productIconSvg, state:state, render:render, addToPackage:addToPackage, completeDeal:completeDeal, newDeal:newDeal,
  filteredDeals:filteredDeals, internalPrint:internalPrint, customerPrint:customerPrint, buildEmail:buildEmail, buildEmailHtml:buildEmailHtml,
  viewProducts:viewProducts, viewReports:viewReports, viewUsers:viewUsers, viewSettings:viewSettings,
  viewDealerships:viewDealerships, routeView:routeView, presetRange:presetRange, priceRange:priceRange,
  saveDealer:saveDealer, deleteDealer:deleteDealer, customerWindowDoc:customerWindowDoc, renderOnboarding:renderOnboarding };
