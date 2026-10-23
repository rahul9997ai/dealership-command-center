"use strict";
/* ---------------- ROUTER + RENDER ---------------- */
function routeView(){
  if (V.isMaster()){
    if (state.route === "dealerships" || state.route === "hqusers" || !state.dealerships.length) state.ui.hq = true;
    if (state.ui.hq){
      if (state.route !== "hqusers") state.route = "dealerships";
      return state.route === "hqusers" ? viewUsers("hq") : viewDealerships();
    }
  }
  if (!state.config) return renderOnboarding();
  var allowed = V.allowedRouteKeys();
  if (allowed && allowed.length === 0 && V.currentUser().role === "Sales Manager")
    return '<div class="card"><div class="card-b"><h2 style="margin:0 0 6px">Nothing is switched on for you yet</h2><p class="muted" style="margin:0">Your General Manager turns on the Sales Tracker (and the Dashboard or Worksheet) from your user card in Users &amp; access.</p></div></div>';
  if (allowed && allowed.length === 0) return viewSalespersonRedirect();
  if (allowed && allowed.indexOf(state.route) === -1) state.route = allowed[0] || "finance";
  if (state.route !== "settings") state.ui.setTab = null;
  switch (state.route){
    case "dashboard": return viewInsights();
    case "assistant": return viewAssistant();
    case "finance": return V.viewFinance();
    case "cashadv": return viewCashAdv();
    case "sales": return viewSalesTracker();
    case "coupons": return viewCoupons();
    case "worksheet": return viewWorksheet();
    case "payout": return viewPayout();
    case "products": return viewProducts();
    case "reports": return viewReports();
    case "users": return viewUsers();
    case "dealerships": return V.viewDashboard();
    case "settings": return viewSettings();
    default: return V.viewDashboard();
  }
}
/* A full re-render replaces every DOM node, including whatever the browser
   just moved focus to (e.g. the next field after Tab), which silently drops
   focus back to <body>. We fingerprint the focused field before the rewrite
   and refocus its replacement afterwards, restoring the caret too. */
var FOCUS_ATTRS = ["data-ca","data-cp","data-bind","data-act","data-term","data-line","data-fee","data-product","data-package","data-df","data-uf","data-stf","data-stt","data-pof","data-pox","data-pod","data-posf","id"];
function focusFingerprint(el){
  if (!el || !el.getAttribute || !el.tagName) return null;
  var parts = [el.tagName.toLowerCase()];
  FOCUS_ATTRS.forEach(function(a){ var v = el.getAttribute(a); if (v) parts.push('['+a+'="'+v.replace(/"/g,'\\"')+'"]'); });
  return parts.length > 1 ? parts.join("") : null;
}
function render(){
  try { C.saleSetAliases(state.config && state.config.spAlias); } catch (e) {}
  try { document.documentElement.setAttribute("data-theme", state.ui.theme); } catch (e) {}
  var root = document.getElementById("root"), ov = document.getElementById("overlay");
  var y = window.scrollY;
  var active = document.activeElement;
  var fp = (active && active !== document.body) ? focusFingerprint(active) : null;
  var selStart = null, selEnd = null;
  if (fp && active && typeof active.selectionStart === "number"){
    try { selStart = active.selectionStart; selEnd = active.selectionEnd; } catch (e) {}
  }
  root.innerHTML = state.loggedIn ? ((state.auth && state.auth.mustChange) ? renderChangePassword() : V.renderShell(routeView())) : renderLogin();
  ov.innerHTML = (state.loggedIn && !(state.auth && state.auth.mustChange)) ? renderOverlay() : "";
  window.scrollTo(0, y);
  if (fp){
    var next = null;
    try { next = document.querySelector(fp); } catch (e) { next = null; }
    if (next){
      next.focus();
      if (selStart !== null && typeof next.setSelectionRange === "function"){
        try { next.setSelectionRange(selStart, selEnd); } catch (e) {}
      }
    }
  }
  if (state.ui.userForm) syncUserForm();
  measureBars();
  markIssues();
  if (state.ui.tour) positionTour();
  if (state.ui.extendForm || state.ui.userForm) initWheels();
  if (typeof syncHash === "function") syncHash();
}
window.__DCC_RENDER__ = render;
/* The Finance bar pins itself just under the header, and jumping to a step must land below
   both, so their real heights (which change with wrapping) are kept in CSS variables. */
/* It also docks the customer display preview beside the form on wide screens, and picks the
   Finance view's compact layouts from the width it is really given. */
function measureBars(){
  var de = document.documentElement;
  de.classList.toggle("cd-docked", !!(state.loggedIn && state.route === "finance" && state.ui.cdPreview && !state.ui.present && window.innerWidth >= 1200));
  /* the coupon preview is drawn at real size (210 mm); shrink it on screen to fit its panel */
  var cpv = document.querySelector(".cp-prev"), cpc = cpv && cpv.querySelector(".cp");
  if (cpc){ cpc.style.zoom = ""; var cz = Math.min(1, (cpv.clientWidth - 12) / cpc.offsetWidth); cpc.style.zoom = cz < 1 ? cz.toFixed(3) : ""; }
  var fs = document.querySelector(".fin-split");
  if (fs){ var w = fs.clientWidth; fs.classList.toggle("mg-narrow", w < 840); fs.classList.toggle("fin-compact", w < 720); }
  var tb = document.querySelector(".topbar"), fb = document.querySelector(".fin-toolbar");
  if (tb) de.style.setProperty("--topbar-h", tb.offsetHeight + "px");
  if (fb) de.style.setProperty("--finbar-h", fb.offsetHeight + "px");
}
window.addEventListener("resize", measureBars);

/* ---------------- SECOND CUSTOMER WINDOW ----------------
   The preview runs inside a sandboxed frame, so a second window cannot load
   the app by URL. We open a blank window, write the customer display into it,
   and rewrite it on every change to the transaction.                      */
var custWin = null;
function customerWindowDoc(){
  var css = "";
  try { css = appCssText(); } catch (e) {}
  return '<!DOCTYPE html><html data-theme="' + state.ui.theme + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Customer Display — ' + esc(state.config.name) + '</title><style>' + css +
    /* On this standalone page .monitor is the whole screen, not a sidebar
       card, so it needs to actually stretch to fill the viewport height —
       .cd's min-height:430px alone left the rest of a tall window blank. */
    ' html,body{height:100%} body{margin:0;background:var(--bg)}' +
    ' .monitor{min-height:100vh;display:flex;flex-direction:column}' +
    ' .cd{flex:1;min-height:0}</style></head><body>' +
    '<div class="monitor" style="border:0;border-radius:0;position:static">' +
    '<div class="monitor-bar"><span class="live"></span><span>CUSTOMER DISPLAY</span></div>' +
    V.renderCustomerDisplay(state.tx) + '</div></body></html>';
}
function pushCustomerWindow(){
  if (!custWin || custWin.closed) return;
  try { custWin.document.open(); custWin.document.write(customerWindowDoc()); custWin.document.close(); }
  catch (e) { custWin = null; }
}
window.__DCC_PUSH_CUSTOMER__ = pushCustomerWindow;
function openCustomerWindow(){
  var w = null;
  /* No size/position features here on purpose — passing a features string
     (e.g. width=...,height=...) is what makes browsers treat window.open as
     a popup window. Omitting it opens a normal tab instead, which is what a
     two-screen FSM desk wants: drag that tab to the customer's monitor. */
  try { w = window.open("", "dccCustomerDisplay"); } catch (e) { w = null; }
  if (!w){
    state.ui.present = true;
    toast("This browser blocked the new tab, so the customer display opened full screen instead.","err");
    commit(); return;
  }
  custWin = w; pushCustomerWindow();
  toast("Customer display opened in a new tab. It updates as you build the deal.","ok");
  commit();
}

