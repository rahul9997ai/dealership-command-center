/* =====================================================================
   Layer 3: STORE, SHELL, DASHBOARD, CUSTOMER DISPLAY, FSM DISPLAY
   ===================================================================== */
(function () {
"use strict";
var D = window.__DCC_DATA__, C = window.__DCC_CORE__;
var esc = C.esc, money = C.money, money0 = C.money0, km = C.km;

var STORAGE_KEY = "dcc_preview_v2";
var state = {
  route:"dashboard",
  dealerships: C.clone(D.DEALERSHIPS),
  activeDealershipId:null,
  config:null,
  products: C.clone(D.PRODUCTS),
  users: C.clone(D.USERS),
  customers: C.clone(D.CUSTOMERS),
  vehicles: C.clone(D.VEHICLES),
  currentUserId:"u0",
  loggedIn:false,
  tx:null, completed:[], saved:[], history:[], version:0,
  cloud:{ productsByDealer:{} },
  ui:{ split:true, present:false, railOpen:false, modal:null, theme:"dark", loginError:null,
       productEdit:null, productConfigOpen:null, userForm:false, dealerForm:null, toast:null,
       email:{ pkg:"all", term:"all" },
       reports:{ period:"monthly", from:"", to:"", fsm:"all", product:"all", type:"all", dealership:"active" } }
};

/* The cloud is the source of truth. This browser only keeps a short-lived copy
   (sessionStorage: survives a refresh, gone when the browser closes) so customer
   details never linger on a shared showroom computer. Only the theme is kept long-term. */
(function restorePersisted(){
  var raw = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  try { var th = localStorage.getItem("axiom_theme"); if (th === "dark" || th === "light") state.ui.theme = th; } catch (e) {}
  try { raw = sessionStorage.getItem(STORAGE_KEY); } catch (e) {}
  if (!raw) return;
  var saved;
  try { saved = JSON.parse(raw); } catch (e) { return; }
  if (!saved || typeof saved !== "object") return;
  ["dealerships","products","users","customers","vehicles","completed","saved","history",
   "activeDealershipId","currentUserId","loggedIn","tx","route"].forEach(function(k){
    if (saved[k] !== undefined) state[k] = saved[k];
  });
  if (saved.theme) state.ui.theme = saved.theme;
})();

/* The seeded Master Administrator's login must always match what's in the
   code, even on a browser that cached an older snapshot from before a
   password field existed (or before it last changed) — otherwise fixing
   this account's credentials in code can never reach anyone who already
   has a persisted copy. Every other user/dealership stays exactly as saved. */
(function reconcileMasterAdmin(){
  var seed = D.USERS[0];
  var u0 = state.users.filter(function(u){ return u.id === seed.id; })[0];
  if (u0){ u0.email = seed.email; u0.password = seed.password; }
  else state.users.unshift(C.clone(seed));
})();

if (state.activeDealershipId && !state.dealerships.some(function(d){ return d.id === state.activeDealershipId; })){
  state.activeDealershipId = state.dealerships.length ? state.dealerships[0].id : null;
}
state.config = state.activeDealershipId ? state.dealerships.filter(function(d){ return d.id === state.activeDealershipId; })[0] : null;
if (!state.tx && state.activeDealershipId){
  state.tx = C.newTransaction(firstFsmFor(state.activeDealershipId) || "u0", state.activeDealershipId);
}

var channel = null;
try { if (window.BroadcastChannel) channel = new BroadcastChannel("dcc_preview_v2"); } catch (e) { channel = null; }
function shareableState(){
  return { dealerships:state.dealerships, activeDealershipId:state.activeDealershipId, products:state.products,
    users:state.users, customers:state.customers, vehicles:state.vehicles, completed:state.completed, saved:state.saved,
    history:state.history, currentUserId:state.currentUserId, loggedIn:state.loggedIn,
    tx:state.tx, route:state.route, theme:state.ui.theme, version:state.version };
}
function persist(){
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(shareableState())); } catch (e) {}
  try { localStorage.setItem("axiom_theme", state.ui.theme); } catch (e) {}
  try { if (channel) channel.postMessage(shareableState()); } catch (e) {}
}
function commit(){
  state.version++;
  if (window.__DCC_AUTOSAVE__) window.__DCC_AUTOSAVE__();
  persist();
  if (window.__DCC_CLOUD_PUSH__) window.__DCC_CLOUD_PUSH__();
  /* Deferred one tick: commit() usually runs inside a "change" handler fired
     by a field losing focus (e.g. Tab to the next field). This browser only
     finishes moving focus to that next field AFTER the change event returns —
     read document.activeElement synchronously here and it still reports
     <body>. Waiting one tick lets focus land first, so the re-render (which
     replaces the whole DOM) can correctly find and refocus it. */
  setTimeout(function(){
    if (window.__DCC_RENDER__) window.__DCC_RENDER__();
    if (window.__DCC_PUSH_CUSTOMER__) window.__DCC_PUSH_CUSTOMER__();
  }, 0);
}
window.__DCC_STATE__ = state;

function brand(){ return C.brandOf(state); }
function dealershipById(id){
  for (var i=0;i<state.dealerships.length;i++) if (state.dealerships[i].id === id) return state.dealerships[i];
  return state.dealerships[0];
}
function setDealership(id){
  /* Each dealership has its own product list. Park the one we're leaving and
     pick up (or start) the one we're entering. */
  var cp = state.cloud.productsByDealer;
  if (state.activeDealershipId && state.dealerships.some(function(d){ return d.id === state.activeDealershipId; }))
    cp[state.activeDealershipId] = state.products;
  state.activeDealershipId = id;
  state.config = dealershipById(id);
  state.products = cp[id] || (cp[id] = []);
  state.tx = C.newTransaction(firstFsmFor(id), id);
  applyFinanceDefaults(state.tx);
}
function firstFsmFor(id){
  var u = state.users.filter(function(x){ return x.active && x.dealershipId === id && x.role.indexOf("FSM") !== -1; })[0];
  return u ? u.id : null;
}
function applyFinanceDefaults(tx){
  var defTerm = state.config.finance.defaultTerm;
  tx.finance.terms = [defTerm];
  tx.finance.rates = {};
  tx.finance.rates[defTerm] = state.config.finance.defaultApr;
  tx.finance.frequency = state.config.finance.defaultFrequency;
}
function userById(id){
  for (var i=0;i<state.users.length;i++) if (state.users[i].id === id) return state.users[i];
  return { name:"Unassigned", initials:"--", role:"—", dealershipId:null };
}
function currentUser(){ return userById(state.currentUserId); }
function isMaster(){ return currentUser().role === "Master Administrator"; }
function isAdmin(){ return isMaster() || currentUser().role === "General Manager"; }
/* One role: Finance Manager. It is stored as "FSM" (the other Axiom modules key
   their access rules on that value); a legacy "FSM Manager" is treated the same. */
function isFinanceRole(r){ return r === "FSM" || r === "FSM Manager"; }
function roleLabel(r){ return isFinanceRole(r) ? "Finance Manager" : r; }
function isFinanceManager(){ return isFinanceRole(currentUser().role); }
function canEditProducts(){ return isAdmin() || isFinanceManager(); }
function ensureOffers(tx){
  if (!tx) return;
  var o = tx.offers;
  if (!o || !o.discount || !o.discount.packages || !Array.isArray(o.gifts) || o.discount.enabled === undefined) tx.offers = C.normOffers(o);
}
function storeUsers(){
  return state.users.filter(function(u){ return isMaster() ? true : u.dealershipId === state.activeDealershipId; });
}
/* People who can own a deal: Finance Managers and General Managers — never Salespeople (Pulse only). */
function isDealOwnerRole(role){ return isFinanceRole(role) || role === "General Manager"; }
function fsmUsers(){
  return state.users.filter(function(u){ return u.active && u.dealershipId === state.activeDealershipId && isDealOwnerRole(u.role); });
}
function setPath(obj, path, value){
  var parts = path.split("."), o = obj;
  for (var i=0;i<parts.length-1;i++) o = o[parts[i]];
  o[parts[parts.length-1]] = value;
}
function toast(msg, kind){
  state.ui.toast = { msg:msg, kind:kind||"info" };
  setTimeout(function(){ if (state.ui.toast && state.ui.toast.msg === msg){ state.ui.toast = null; if (window.__DCC_RENDER__) window.__DCC_RENDER__(); } }, 3800);
}
function allDeals(){ return state.history.concat(state.completed); }
/* Paused deals for the current dealership. A Finance Manager sees their own; GM and Master see all. */
/* What each Finance Manager can use. A General Manager or Master always has everything; the
   General Manager turns features on or off per Finance Manager in Users & access
   (config.fmAccess[userId][feature] === false = off; anything missing = on).
   Promotional offers also honour the older Dealership-settings choice (config.offerAccess). */
var FM_FEATURES = [
  { key:"finance", label:"Finance" }, { key:"cashadv", label:"Cash Conversion" }, { key:"coupons", label:"Coupons" },
  { key:"worksheet", label:"Worksheet" }, { key:"offers", label:"Promotional offers" }, { key:"reports", label:"Reports" },
  { key:"sales", label:"Sales Tracker (own F&I)" }, { key:"insights", label:"Dashboard (Insights)" }, { key:"ai", label:"AI Assistant" },
  { key:"payout", label:"Payout Request" }
];
/* A Sales Manager's switches (Sales Tracker and the Insights dashboard are off until turned on). */
var SM_FEATURES = [
  { key:"sales", label:"Sales Tracker", sub:"Log deals, Today, Sales performance, Appointments, Targets" },
  { key:"insights", label:"Dashboard (Insights)", sub:"Month and year to date gross, scorecards, year-end projections" },
  { key:"worksheet", label:"Worksheet", sub:"Print the Purchase Proposal" },
  { key:"ai", label:"AI Assistant", sub:"Chat and email drafting from the Sales Tracker (needs AI on in Dealership settings)" },
  { key:"payout", label:"Payout Request", sub:"Cheque requisition emails: ETO payouts, trade liens, used purchases, refunds" }
];
function featureLabel(key){ var f = SM_FEATURES.concat(FM_FEATURES).filter(function(x){ return x.key === key; })[0]; return f ? f.label : key; }
/* Off unless a Master or GM turns it on for that person (everything else is on unless turned off). */
var FEATURES_OFF_BY_DEFAULT = ["worksheet", "sales", "insights", "ai", "payout"];
function featureOn(u, key){
  u = u || currentUser();
  if (u.role === "Master Administrator" || u.role === "General Manager") return true;
  var cfg = state.config || {}, a = cfg.fmAccess && cfg.fmAccess[u.id];
  if (a && a[key] === false) return false;
  if (FEATURES_OFF_BY_DEFAULT.indexOf(key) !== -1) return !!(a && a[key] === true);
  if (key === "offers"){ var acc = cfg.offerAccess; if (acc && acc.mode === "selected") return (acc.users || []).indexOf(u.id) !== -1; }
  return true;
}
function canUseOffers(){ return featureOn(currentUser(), "offers"); }
function savedForMe(){
  var me = currentUser(), all = isAdmin();
  return (state.saved || []).filter(function(d){ return d.dealershipId === state.activeDealershipId && (all || d.fsmUserId === me.id); })
    .sort(function(a, b){ return (b.savedAt || "") < (a.savedAt || "") ? -1 : 1; });
}
function dealsForStore(){
  return allDeals().filter(function(d){ return d.dealershipId === state.activeDealershipId; });
}

/* ---------------- SHELL ----------------
   Access is role gated. A Master Administrator sees every screen, including
   Dealerships. A General Manager sees everything except Dealerships (they
   run one store, they don't create new ones). An FSM Manager additionally
   oversees Users & access for their own store. A plain FSM — and a time
   limited Demo account — only sees the deal-facing screens: Finance (which
   covers both finance and cash deals via the deal-type toggle), Products
   and Reports. */
function allowedRouteKeys(){
  var role = currentUser().role;
  if (role === "Master Administrator") return null;
  if (role === "General Manager") return ["dashboard","assistant","finance","cashadv","sales","coupons","worksheet","payout","products","reports","users","settings"];
  if (role === "Salesperson") return [];
  var fk = function(k){ return k === "dashboard" ? "insights" : k === "assistant" ? "ai" : k; };
  if (isFinanceRole(role)) return ["finance","cashadv","sales","coupons","worksheet","payout","products","reports","users","dashboard","assistant"].filter(function(k){
    return k === "products" || k === "users" || featureOn(currentUser(), fk(k)); });
  /* A Sales Manager sees only what's switched on for them: Sales Tracker, the Dashboard (Insights), Worksheet, AI Assistant. */
  if (role === "Sales Manager") return ["sales","dashboard","assistant","worksheet","payout"].filter(function(k){ return featureOn(currentUser(), fk(k)); });
  return ["finance","cashadv","sales","worksheet","payout","products","reports","dashboard"].filter(function(k){
    if (k === "sales") return role === "Sales Manager" && featureOn(currentUser(), "sales");
    if (k === "dashboard") return featureOn(currentUser(), "insights");
    return (k !== "worksheet" && k !== "payout") || featureOn(currentUser(), k); });
}
/* A Master starts at head office (the dealership list); opening a store gives its own Dealership Command. */
function inHQ(){ return isMaster() && !!state.ui.hq; }
function navItems(){
  if (inHQ()) return [
    { key:"dealerships", label:"Dealerships", ic:"◈", grp:"Head office" },
    { key:"hqusers", label:"Head-office users", ic:"◍", grp:"Head office" }];
  var items = [
    { key:"dashboard", label:"Dashboard", ic:"▤", grp:"Tools" },
    { key:"assistant", label:"AI Assistant", ic:"✦", grp:"Tools" },
    { key:"finance", label:"Finance", ic:"◧", grp:"Tools" },
    { key:"cashadv", label:"Cash Conversion", ic:"$", grp:"Tools" },
    { key:"sales", label:"Sales Tracker", ic:"◆", grp:"Tools" },
    { key:"coupons", label:"Coupons", ic:"✂", grp:"Tools" },
    { key:"worksheet", label:"Worksheet", ic:"☰", grp:"Tools" },
    { key:"payout", label:"Payout Request", ic:"✎", grp:"Tools" },
    { key:"products", label:"Products", ic:"▦", grp:"Tools" },
    { key:"reports", label:"Reports", ic:"▥", grp:"Tools" },
    { key:"users", label:"Users & access", ic:"◍", grp:"Manage" },
    { key:"settings", label:"Dealership settings", ic:"⚙", grp:"Manage" }
  ];
  var allowed = allowedRouteKeys();
  if (allowed) items = items.filter(function(n){ return allowed.indexOf(n.key) !== -1; });
  /* the AI Assistant shows once AI is on for the store (the GM and Master always see it, to find the switch) */
  if (!isAdmin() && !(state.config && state.config.ai && state.config.ai.on)) items = items.filter(function(n){ return n.key !== "assistant"; });
  return items;
}
function routeTitle(){
  var n = navItems().filter(function(x){ return x.key === state.route; })[0];
  return n ? n.label : "Dealership Command";
}
function renderShell(inner){
  var b = brand(), u = currentUser();
  var lastGrp = null;
  var nav = navItems().map(function(n){
    var head = n.grp && n.grp !== lastGrp ? `<div class="nav-group">${esc(n.grp)}</div>` : "";
    lastGrp = n.grp;
    /* the AI Assistant opens a chat panel on the right instead of a screen */
    if (n.st) return head + `<button class="nav-item ${window.AIC && window.AIC.open ? "active" : ""}" data-st="${n.st}" title="${esc(n.label)}">
      <span class="ic">${n.ic}</span><span>${esc(n.label)}</span></button>`;
    return head + `<button class="nav-item ${state.route===n.key?"active":""}" data-act="route" data-route="${n.key}" title="${esc(n.label)}">
      <span class="ic">${n.ic}</span><span>${esc(n.label)}</span>${n.tag?`<span class="tagx">${n.tag}</span>`:""}</button>`;
  }).join("");
  var hq = inHQ(), store = !hq && state.config;
  var brandName = hq ? "Mahan-EX" : store ? esc(state.config.name) : "Dealership Command";
  var brandMark = hq ? mhMark({ label:"" }) : store ? esc(state.config.logoMark||b.mark) : "DCC";
  var brandSub = hq ? "Head office" : store ? esc(b.label) + " · Dealership Command" : "No dealership yet";
  /* the left pane can be folded down to icons (remembered in this browser) */
  if (state.ui.railMini === undefined){ try { state.ui.railMini = localStorage.getItem("dcc-rail-mini") === "1"; } catch (e) { state.ui.railMini = false; } }
  return `<div class="app ${state.ui.railMini ? "rail-mini" : ""}">
    <aside class="rail ${state.ui.railOpen?"open":""}">
      <div class="rail-brand">
        <div class="badge-logo${hq ? " mh" : ""}" title="${brandName}">${brandMark}</div>
        <div class="rail-names"><div class="nm">${brandName}</div><div class="sb">${brandSub}</div></div>
        <button type="button" class="rail-fold" data-st="railmini" title="${state.ui.railMini ? "Show the menu" : "Fold the menu to icons"}" aria-label="${state.ui.railMini ? "Show the menu" : "Fold the menu"}">${state.ui.railMini ? "»" : "«"}</button>
        <button class="btn sm ghost menu-btn" data-act="toggle-rail" style="color:#cbd5e1">Menu</button>
      </div>
      <nav>${isMaster() && !hq ? `<button class="rail-back" data-act="go-hq">← All dealerships</button>` : ""}${nav}</nav>
      <div class="rail-foot"><div class="userchip"><div class="avatar">${esc(u.initials)}</div>
        <div><div class="nm">${esc(u.name)}</div><div class="tiny">${esc(roleLabel(u.role))}</div></div></div></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div>${isMaster() && store ? `<div class="crumb"><a href="#" data-act="go-hq">Dealerships</a> › ${esc(state.config.name)}</div>` : ""}<h1>${esc(routeTitle())}</h1></div>
        <div class="demo">
          <button class="btn sm" data-act="toggle-theme">${state.ui.theme === "dark" ? "Normal" : "Dark"} mode</button>
          <span class="tag">${esc(u.name)} · ${esc(roleLabel(u.role))}</span>
          <button class="btn sm" data-act="logout">Log out</button>
        </div>
      </header>
      <div class="view">${inner}</div>
    </div>
  </div>
  ${state.ui.toast ? `<div style="position:fixed;left:50%;transform:translateX(-50%);bottom:20px;z-index:90"
    class="notice ${state.ui.toast.kind==="err"?"err":state.ui.toast.kind==="ok"?"ok":"info"}" role="status">${esc(state.ui.toast.msg)}</div>`:""}`;
}

/* ---------------- DASHBOARD ---------------- */
function kpiCard(label, value, detail){
  return `<div class="card kpi"><div class="lb">${esc(label)}</div><div class="vl num">${value}</div><div class="dt">${detail||""}</div></div>`;
}
function viewDashboard(){
  var deals = dealsForStore(), today = C.todayISO(), month = today.slice(0,7), i;
  var todays = deals.filter(function(d){ return d.createdAt === today; });
  var mtd = deals.filter(function(d){ return d.createdAt.slice(0,7) === month; });
  var gross = 0, prodCount = 0;
  var withProduct = 0;
  for (i=0;i<mtd.length;i++){ var t = C.totals(state, mtd[i]); gross += t.productGross; prodCount += t.soldLines.length; if (t.soldLines.length) withProduct++; }
  var pen = mtd.length ? Math.round(withProduct/mtd.length*100) : 0;

  var byFsm = {};
  for (i=0;i<mtd.length;i++){
    var d = mtd[i], t2 = C.totals(state, d);
    if (!byFsm[d.fsmUserId]) byFsm[d.fsmUserId] = { deals:0, gross:0, products:0 };
    byFsm[d.fsmUserId].deals++; byFsm[d.fsmUserId].gross += t2.productGross; byFsm[d.fsmUserId].products += t2.soldLines.length;
  }
  var fsmRows = Object.keys(byFsm).map(function(k){ return { id:k, v:byFsm[k] }; }).sort(function(a,b){ return b.v.gross-a.v.gross; });
  var maxG = fsmRows.length ? Math.max(1, fsmRows[0].v.gross) : 1;

  var prodSales = {};
  for (i=0;i<mtd.length;i++){
    var sl = C.totals(state, mtd[i]).soldLines;
    for (var j=0;j<sl.length;j++){
      var p = sl[j].product; if (!p) continue;
      prodSales[p.id] = (prodSales[p.id]||0)+1;
    }
  }
  var psRows = Object.keys(prodSales).map(function(k){ return { p:C.productById(state,k), n:prodSales[k] }; })
    .sort(function(a,b){ return b.n-a.n; }).slice(0,6);
  var maxP = psRows.length ? psRows[0].n : 1;
  var recent = deals.slice().sort(function(a,b){ return a.createdAt<b.createdAt?1:-1; }).slice(0,8);

  return `<div class="grid g4" style="margin-bottom:16px">
    ${kpiCard("Deals today", todays.length, todays.length ? "Completed in the FSM office" : "No deals logged yet today")}
    ${kpiCard("Deals this month", mtd.length, withProduct + " with at least one product")}
    ${kpiCard("Product gross, month to date", money0(gross), "Retail less product cost")}
    ${kpiCard("Gross per deal", money0(mtd.length ? gross/mtd.length : 0), pen + "% of deals took a product")}
  </div>
  <div class="grid g2">
    <div class="card"><div class="card-h"><h2>FSM activity this month</h2>
      <div class="sp"><button class="btn sm" data-act="route" data-route="reports">Open reports</button></div></div>
      <div class="card-b">${fsmRows.length ? `<div class="tablewrap"><table>
        <thead><tr><th>FSM</th><th class="right">Deals</th><th class="right">Products</th><th class="right">Gross</th><th style="width:130px">Share</th></tr></thead>
        <tbody>${fsmRows.map(function(r){ var u = userById(r.id); return `<tr>
          <td><strong>${esc(u.name)}</strong><div class="tiny muted">${esc(roleLabel(u.role))}</div></td>
          <td class="right num">${r.v.deals}</td><td class="right num">${r.v.products}</td>
          <td class="right num">${money0(r.v.gross)}</td>
          <td><div class="bar"><i style="width:${Math.max(4,Math.round(r.v.gross/maxG*100))}%"></i></div></td></tr>`; }).join("")}
        </tbody></table></div>` : `<div class="empty">No deals recorded this month yet.</div>`}</div></div>
    <div class="card"><div class="card-h"><h2>Product sales this month</h2></div>
      <div class="card-b">${psRows.length ? `<div class="tablewrap"><table>
        <thead><tr><th>Product</th><th class="right">Sold</th><th style="width:150px">Volume</th></tr></thead>
        <tbody>${psRows.map(function(r){ return `<tr><td>${esc(r.p.name)}<div class="tiny muted">${esc(r.p.category)}</div></td>
          <td class="right num">${r.n}</td><td><div class="bar"><i style="width:${Math.max(4,Math.round(r.n/maxP*100))}%"></i></div></td></tr>`; }).join("")}
        </tbody></table></div>` : `<div class="empty">No products sold this month yet.</div>`}</div></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h2>Recent transactions</h2>
    <div class="sp"><button class="btn sm primary" data-act="new-deal">Start a new deal</button></div></div>
    <div class="card-b"><div class="tablewrap"><table>
      <thead><tr><th>Date</th><th>Deal</th><th>Customer</th><th>Vehicle</th><th>Type</th><th>FSM</th><th class="right">Products</th><th class="right">Gross</th></tr></thead>
      <tbody>${recent.map(function(d){ var t = C.totals(state,d); return `<tr>
        <td class="nowrap">${C.fmtDate(d.createdAt)}</td><td class="nowrap">${esc(d.id)}</td>
        <td>${esc(d.customer.name||"—")}</td><td>${esc(d.vehicle.year+" "+d.vehicle.model)}</td>
        <td><span class="tag">${esc(d.type)}</span></td><td>${esc(userById(d.fsmUserId).name)}</td>
        <td class="right num">${t.soldLines.length}</td><td class="right num">${money0(t.productGross)}</td></tr>`; }).join("")}
      </tbody></table></div></div></div>`;
}
function viewUnderConstruction(name){
  return `<div class="card"><div class="card-b"><div class="uc">
    <div class="bigtag">UNDER CONSTRUCTION</div>
    <h2>${esc(name)} is not built yet</h2>
    <p class="muted" style="max-width:52ch">${esc(name)} will be built after the Finance module is validated and approved. Nothing here is connected to Finance, so it cannot affect a live finance transaction.</p>
    <button class="btn primary" data-act="route" data-route="finance">Go to Finance</button></div></div></div>`;
}

/* ---------------- CUSTOMER DISPLAY ----------------
   Product name plus the term and kilometres chosen. No explanations,
   no internal pricing, no packages or terms the FSM did not select.    */
function lineConfigText(L, chosenOnly){
  /* chosenOnly = customer-facing: show a detail only once the Finance Manager has picked it. */
  var set = (L.cfg && L.cfg.cfgSet) || {}, bits = [];
  function ok(k){ return !chosenOnly || !!set[k]; }
  if (ok("term") && L.product.uses.term && L.cfg.term) bits.push(L.cfg.term + " months");
  if (ok("km") && L.product.uses.km && L.cfg.km) bits.push(km(L.cfg.km));
  if (ok("interval") && L.product.uses.interval && L.cfg.interval) bits.push("every " + km(L.cfg.interval));
  if (ok("deductible") && L.product.uses.deductible && L.cfg.deductible !== null && L.cfg.deductible !== undefined && L.cfg.deductible !== "")
    bits.push(Number(L.cfg.deductible) === 0 ? "no deductible" : "$" + L.cfg.deductible + " deductible");
  return bits.join(" · ");
}
/* If the FSM has recorded which package and term the customer chose,
   every customer-facing surface (this screen, the customer print, the
   emailed follow-up) narrows to that one package and that one term.
   Until then they show everything that has been assigned to a package. */
function packagesToShow(t, tx){
  var list, nonDeclined = t.lines.filter(function(L){ return !L.cfg.declined &&
    L.cfg.packages && (L.cfg.packages.preferred || L.cfg.packages.essential || L.cfg.packages.basic); });
  if (t.packagesUsed) list = t.packages.filter(function(p){ return p.count > 0; });
  else if (nonDeclined.length){
    var s=0, tx1=0, c=0;
    nonDeclined.forEach(function(L){ if (L.price!==null){ s+=L.price; tx1+=L.tax; c+=L.cost; } });
    list = [{ key:"selected", label:"SELECTED PACKAGE", blurb:"", lines:nonDeclined,
      count:nonDeclined.length, quotes:t.quotes, dueTotal:t.isCash?t.cashDueTotal:null,
      sub:Math.round(s*100)/100, tax:Math.round(tx1*100)/100, total:Math.round((s+tx1)*100)/100,
      cost:c, gross:Math.round((s-c)*100)/100 }];
  }
  else list = [];
  /* Keep every field a package object carries (dueTotal, sub, total, etc.) —
     allow-listing fields here has silently dropped new ones more than once
     when a package gets selected on the customer display. */
  var sel = tx && tx.display && tx.display.selection;
  if (sel && sel.package && sel.package !== "none"){
    list = list.filter(function(p){ return p.key === sel.package; });
    list = list.map(function(p){
      var np = {}; for (var k in p) np[k] = p[k];
      np.quotes = sel.term ? p.quotes.filter(function(x){ return x.term === sel.term; }) : p.quotes;
      return np;
    });
  }
  return list;
}
var PRODUCT_ICONS = { asp:"🛡", ppm:"🔧", trp:"🛞", app:"🧴", atr:"🔒", vrc:"🚙", gap:"🚗", key:"🔑", cpp:"✨" };
var PI_SVG = {
  shield:'<path d="M12 3l7.5 2.8v5.6c0 4.6-3.2 8.3-7.5 10-4.3-1.7-7.5-5.4-7.5-10V5.8z"/><path d="M8.6 12l2.4 2.4 4.4-4.6"/>',
  tire:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/><path d="M12 3v5.4M12 15.6V21M3 12h5.4M15.6 12H21"/>',
  gap:'<path d="M12 3l7.5 2.8v5.6c0 4.6-3.2 8.3-7.5 10-4.3-1.7-7.5-5.4-7.5-10V5.8z"/><path d="M14.4 9.4c-.5-.8-1.4-1.2-2.4-1.2-1.4 0-2.4.7-2.4 1.8 0 2.3 4.9 1.1 4.9 3.6 0 1.1-1.1 1.9-2.5 1.9-1.1 0-2-.4-2.6-1.2M12 7v10"/>',
  drop:'<path d="M12 3s6.2 6.3 6.2 10.4A6.2 6.2 0 015.8 13.4C5.8 9.3 12 3 12 3z"/><path d="M9 14a3 3 0 002.4 2.7"/>',
  sun:'<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  lock:'<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 018 0v2.5M12 14.5v2.5"/>',
  sparkle:'<path d="M11 3.5l1.9 5.1L18 10.5l-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  key:'<circle cx="8" cy="15.5" r="4"/><path d="M11 12.6L19.5 4M16.5 7l2.4 2.4M14 9.6l2 2"/>',
  wrench:'<path d="M14.7 6.3a4 4 0 01-5.2 5.2L4.4 16.6a2 2 0 002.9 2.9l5.1-5.1a4 4 0 005.2-5.2l-2.5 2.5-2.6-.7-.7-2.6z"/>',
  car:'<path d="M3 14l1.7-4.6A2 2 0 016.6 8h10.8a2 2 0 011.9 1.4L21 14v4h-2.6M3 14v4h2.6M3 14h18"/><circle cx="7.6" cy="17.6" r="1.9"/><circle cx="16.4" cy="17.6" r="1.9"/>',
  cog:'<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/>'
};
var PI_BY_ID = { asp:"shield", ppm:"wrench", trp:"tire", app:"sparkle", atr:"lock", vrc:"car", gap:"gap", key:"key", cpp:"sparkle" };
/* Pick a product-specific icon: exact product id first (the built-ins), then
   keywords in the name/category so dealership-added products get a fitting one. */
function productIconSvg(p){
  var k = PI_BY_ID[p && p.id];
  if (!k){
    var n = ((p && p.name) || "") + " " + ((p && p.category) || "");
    n = n.toLowerCase();
    k = /tire|rim|wheel/.test(n) ? "tire"
      : /rust|undercoat|corrosion|inhibit/.test(n) ? "drop"
      : /tint|window|film|glass/.test(n) ? "sun"
      : /ghost|immobil|theft|alarm|security|recovery|tracking/.test(n) ? "lock"
      : /ceramic|paint|appearance|gloss|interior|fabric|leather|detail/.test(n) ? "sparkle"
      : /gap|guaranteed asset|loan|balance/.test(n) ? "gap"
      : /key|fob/.test(n) ? "key"
      : /maint|service|oil|inspection/.test(n) ? "wrench"
      : /replacement|total loss/.test(n) ? "car"
      : "shield";
  }
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + PI_SVG[k] + '</svg>';
}
var GIFT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="9" width="17" height="4" rx="1"/><path d="M5 13v7h14v-7M12 9v11M12 9c-2.5 0-4-1-4-2.4A1.9 1.9 0 0111.2 5.3C11.8 6.2 12 9 12 9zM12 9c2.5 0 4-1 4-2.4a1.9 1.9 0 00-3.2-1.3C12.2 6.2 12 9 12 9z"/></svg>';
var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function hexRgb(h){ h = String(h).replace("#",""); if (h.length === 3) h = h.split("").map(function(c){ return c+c; }).join(""); var n = parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255]; }
function rgbHex(a){ return "#" + a.map(function(x){ x = Math.max(0,Math.min(255,Math.round(x))); return (x<16?"0":"") + x.toString(16); }).join(""); }
function mixHex(a, b, t){ var A = hexRgb(a), B = hexRgb(b); return rgbHex([0,1,2].map(function(i){ return A[i] + (B[i]-A[i])*t; })); }
function hexLum(h){ var c = hexRgb(h).map(function(v){ v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }); return .2126*c[0] + .7152*c[1] + .0722*c[2]; }
function contrastHex(a, b){ var x = hexLum(a), y = hexLum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
/* Nudge a colour toward `toward` (ink or white) until it reads on `bg` at the given contrast. */
function readableOn(c, bg, ratio, toward){ for (var i = 0; i < 12 && contrastHex(c, bg) < ratio; i++) c = mixHex(c, toward, .12); return c; }
/* The customer display's colours come from the dealership's brand colour
   (chosen in Dealership settings) and follow the app's light/dark mode. */
/* "brand" = the brand's own colours, "custom" = the colour a General Manager picked in Dealership
   settings. Dealerships that picked a colour before this switch existed count as "custom". */
function colorMode(cfg){
  cfg = cfg || state.config || {};
  if (cfg.colorMode === "brand" || cfg.colorMode === "custom") return cfg.colorMode;
  return /^#[0-9a-f]{6}$/i.test(cfg.brandColor || "") ? "custom" : "brand";
}
function customColor(){ var c = (state.config || {}).brandColor; return colorMode() === "custom" && /^#[0-9a-f]{6}$/i.test(c || "") ? c : null; }
/* Colours for the printed customer copy, the email and the Cash Conversion printout: a band
   (header gradient, white text on it) and a hue for headings and ticks that reads on white. */
function brandInk(){
  var W = "#ffffff", K = "#0a1220", cc = customColor(), pal = cc ? null : brand().pal;
  var chroma = function(h){ var r = hexRgb(h); return (Math.max.apply(null, r) - Math.min.apply(null, r)) / 255; };
  if (!pal){
    var base = cc || brand().color || "#2c5a9b";
    return { main:base, accent:base, hue:readableOn(base, W, 4.5, K), bandA:mixHex(base, K, .45), bandB:base };
  }
  var M = pal.main, A = pal.accent, inky = hexLum(M) < .02;
  var vivid = chroma(M) >= chroma(A) ? M : A;
  return { main:M, accent:A, hue:readableOn(vivid, W, 4.5, K),
    bandA:inky ? M : readableOn(mixHex(M, K, .22), W, 3, K), bandB:inky ? mixHex(M, W, .16) : readableOn(M, W, 3, K) };
}
function cdThemeStyle(){
  var cfg = state.config || {};
  var custom = !!customColor();
  if (!custom && brand().pal) return cdPaletteStyle(brand().pal);
  var base = custom ? customColor() : (brand().color || "#2c5a9b");
  var W = "#ffffff", K = "#0a1220", v;
  if (state.ui.theme === "dark") v = { "surface":mixHex(K,base,.12), "surface-2":mixHex(K,base,.18), "surface-3":mixHex(K,base,.24), "border":mixHex(K,base,.36),
    "blue":mixHex(base,W,.28), "blue-2":mixHex(base,W,.42), "blue-deep":mixHex(base,K,.72), "text":"#eaf0fb", "muted":"#a4b3cc",
    "head-a":mixHex(base,K,.72), "head-b":mixHex(base,K,.3), "price-bg":mixHex(K,base,.16),
    "pane":mixHex(K,base,.46), "pane-2":mixHex(K,base,.34), "pane-text":"#e9f0fb", "pane-muted":"#a9bbd6", "green":"#86efac", "tile":"#eef3fa",
    "pill-bg":mixHex(K,base,.2), "pill-text":"#eaf0fb" };
  else v = { "surface":mixHex(W,base,.07), "surface-2":mixHex(W,base,.03), "surface-3":mixHex(W,base,.12), "border":mixHex(W,base,.24),
    "blue":base, "blue-2":mixHex(base,W,.13), "blue-deep":mixHex(base,K,.38), "text":"#1c2b40", "muted":"#5c6e88",
    "head-a":mixHex(base,K,.38), "head-b":base, "price-bg":mixHex(W,base,.015),
    "pane":mixHex(base,K,.4), "pane-2":mixHex(base,K,.22), "pane-text":"#e9f0fb", "pane-muted":"#b3c4dd", "green":"#86efac", "tile":"#ffffff",
    "pill-bg":"#ffffff", "pill-text":"#0f2340" };
  return Object.keys(v).map(function(k){ return "--cd-" + k + ":" + v[k]; }).join(";");
}
/* The brand's own two colours: main for the header band and package titles, accent for icons,
   prices and highlights. Near-black mains (e.g. Nissan) get a soft charcoal sheen so the header
   isn't a flat slab, and the accent is nudged only as far as needed to stay readable as text. */
function cdPaletteStyle(pal){
  var M = pal.main, A = pal.accent, W = "#ffffff", K = "#0a0d12", v;
  /* page tints stay near-neutral with just a hint of the brand, so a bright red brand doesn't turn the screen pink */
  var inky = hexLum(M) < .02, tint = inky ? "#5b6170" : mixHex("#5b6170", M, .35);
  if (state.ui.theme === "dark"){
    var D = inky ? M : tint, sf = mixHex(K, D, inky ? .06 : .12);
    var ac = readableOn(hexLum(A) < .05 ? mixHex(M, W, .35) : mixHex(A, W, .12), mixHex(K, D, inky ? .14 : .24), 4.5, W);   /* readable on the lightest dark surface */
    v = { "surface":sf, "surface-2":mixHex(K, D, inky ? .1 : .18), "surface-3":mixHex(K, D, inky ? .14 : .24), "border":mixHex(K, inky ? "#8a8f98" : D, .3),
      "blue":ac, "blue-2":mixHex(ac, W, .14), "blue-deep":mixHex(M, K, .5), "text":"#eef1f6", "muted":"#a9b1bf",
      "head-a":inky ? mixHex(M, K, .3) : mixHex(M, K, .5), "head-b":inky ? mixHex(M, W, .12) : mixHex(M, K, .12),
      "ph-a":inky ? mixHex(M, W, .14) : mixHex(M, K, .08), "ph-b":inky ? M : mixHex(M, K, .45), "price-bg":mixHex(K, D, .1),
      "pane":mixHex(K, M, inky ? .3 : .46), "pane-2":mixHex(K, M, inky ? .2 : .34), "pane-text":"#eef1f6", "pane-muted":"#b4bccb", "green":"#86efac", "tile":"#eef1f6",
      "pill-bg":mixHex(K, M, .2), "pill-text":"#eef1f6" };
  } else {
    var ac2 = readableOn(A, mixHex(W, tint, .1), 4.5, K);   /* readable on the darkest light surface */
    v = { "surface":mixHex(W, tint, .06), "surface-2":mixHex(W, tint, .025), "surface-3":mixHex(W, tint, .1), "border":mixHex(W, tint, .22),
      "blue":ac2, "blue-2":mixHex(A, W, .14), "blue-deep":mixHex(M, K, .3), "text":"#1b1f27", "muted":"#5d6573",
      "head-a":inky ? M : mixHex(M, K, .22), "head-b":inky ? mixHex(M, W, .16) : M,
      "ph-a":inky ? mixHex(M, W, .16) : M, "ph-b":inky ? M : mixHex(M, K, .28), "price-bg":mixHex(W, M, .015),
      "pane":inky ? mixHex(M, W, .06) : mixHex(M, K, .4), "pane-2":inky ? mixHex(M, W, .16) : mixHex(M, K, .2), "pane-text":"#f2f4f8", "pane-muted":"#c3c9d4", "green":"#86efac", "tile":"#ffffff",
      "pill-bg":"#ffffff", "pill-text":"#151a22" };
  }
  return Object.keys(v).map(function(k){ return "--cd-" + k + ":" + v[k]; }).join(";");
}
/* Drawn product illustrations for common gifts (matched by name), used when no photo has been uploaded. */
var GIFT_ART = {
  tv:'<rect x="8" y="18" width="80" height="50" rx="5" style="fill:#1f2d44"/><rect x="12" y="22" width="72" height="42" rx="3" style="fill:var(--cd-blue)"/><path d="M12 54l20-14 16 10 14-9 22 14v9a3 3 0 01-3 3H15a3 3 0 01-3-3z" style="fill:#fff;opacity:.28"/><rect x="38" y="68" width="20" height="5" style="fill:#3b4d70"/><rect x="28" y="73" width="40" height="4" rx="2" style="fill:#3b4d70"/>',
  tablet:'<rect x="22" y="10" width="52" height="76" rx="7" style="fill:#1f2d44"/><rect x="26" y="16" width="44" height="62" rx="3" style="fill:var(--cd-blue)"/><path d="M26 60l14-12 10 8 8-6 12 10v18H26z" style="fill:#fff;opacity:.25"/><circle cx="48" cy="82" r="2" style="fill:#8fa3c4"/>',
  buds:'<rect x="26" y="40" width="44" height="42" rx="14" style="fill:#f4f7fb;stroke:#c9d3e2;stroke-width:2"/><path d="M26 58h44" style="stroke:#c9d3e2;stroke-width:2"/><circle cx="48" cy="66" r="3" style="fill:#c9d3e2"/><rect x="24" y="8" width="12" height="32" rx="6" transform="rotate(-12 30 24)" style="fill:#fff;stroke:#c9d3e2;stroke-width:2"/><rect x="60" y="8" width="12" height="32" rx="6" transform="rotate(12 66 24)" style="fill:#fff;stroke:#c9d3e2;stroke-width:2"/>',
  tire:'<circle cx="48" cy="48" r="38" style="fill:#1f2d44"/><circle cx="48" cy="48" r="26" style="fill:#c9d3e2"/><circle cx="48" cy="48" r="9" style="fill:#3b4d70"/><path d="M48 22v16M48 58v16M22 48h16M58 48h16M30 30l11 11M55 55l11 11M66 30L55 41M41 55L30 66" style="stroke:#3b4d70;stroke-width:4;stroke-linecap:round;fill:none"/>',
  oil:'<path d="M42 10s22 24 22 42a22 22 0 01-44 0c0-18 22-42 22-42z" style="fill:var(--cd-blue)"/><path d="M34 54a8 8 0 008 8" style="stroke:#fff;stroke-width:3;fill:none;stroke-linecap:round;opacity:.6"/><g transform="translate(66 46) rotate(38)"><rect x="-4" y="0" width="8" height="38" rx="4" style="fill:#3b4d70"/><circle cx="0" cy="0" r="9" style="fill:#3b4d70"/><rect x="-3" y="-11" width="6" height="9" style="fill:#fff"/></g>',
  card:'<rect x="8" y="22" width="80" height="52" rx="8" style="fill:var(--cd-blue)"/><rect x="8" y="34" width="80" height="10" style="fill:#0b1b3a;opacity:.55"/><rect x="16" y="56" width="26" height="7" rx="3" style="fill:#fff;opacity:.85"/><circle cx="72" cy="60" r="8" style="fill:#fff;opacity:.9"/>',
  key:'<circle cx="34" cy="48" r="20" style="fill:#3b4d70"/><circle cx="34" cy="48" r="8" style="fill:#f4f7fb"/><path d="M54 43h32v10h-8v-6h-8v6h-8v-6H54z" style="fill:#c9d3e2"/>',
  sparkle:'<path d="M44 8l7 22 22 7-22 7-7 22-7-22-22-7 22-7z" style="fill:var(--cd-blue)"/><path d="M74 54l4 11 11 4-11 4-4 11-4-11-11-4 11-4z" style="fill:#c9d3e2"/><path d="M20 62l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" style="fill:#e8eef7;stroke:#c9d3e2"/>',
  cam:'<rect x="14" y="26" width="62" height="38" rx="10" style="fill:#1f2d44"/><circle cx="45" cy="45" r="13" style="fill:#3b4d70"/><circle cx="45" cy="45" r="7" style="fill:var(--cd-blue)"/><circle cx="66" cy="34" r="3" style="fill:#e05252"/><rect x="40" y="64" width="10" height="10" style="fill:#3b4d70"/><rect x="30" y="72" width="30" height="5" rx="2.5" style="fill:#3b4d70"/>',
  box:'<rect x="12" y="38" width="72" height="44" rx="4" style="fill:var(--cd-blue)"/><rect x="8" y="28" width="80" height="14" rx="4" style="fill:var(--cd-blue);opacity:.85"/><rect x="43" y="28" width="10" height="54" style="fill:#fff;opacity:.9"/><path d="M48 28c-8-14-22-10-18-3s14 3 18 3zM48 28c8-14 22-10 18-3s-14 3-18 3z" style="fill:none;stroke:#fff;stroke-width:4"/>'
};
function giftArtKey(name){
  var n = String(name || "").toLowerCase();
  return /tv|television|oled|qled/.test(n) ? "tv"
    : /tablet|ipad|galaxy tab/.test(n) ? "tablet"
    : /airpod|earbud|headphone|earphone|buds|beats|speaker/.test(n) ? "buds"
    : /tire|tyre|wheel|rim|storage/.test(n) ? "tire"
    : /oil|maint|service|lube|inspection|wiper/.test(n) ? "oil"
    : /gift ?card|voucher|gas|fuel|card/.test(n) ? "card"
    : /key|fob|remote/.test(n) ? "key"
    : /detail|wash|wax|ceramic|polish|clean|shine/.test(n) ? "sparkle"
    : /dash|camera|cam\b|tracker|gps/.test(n) ? "cam" : "box";
}
function safeImg(u){ return (typeof u === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(u)) ? u : null; }
function giftPhoto(g){
  if (safeImg(g.image)) return g.image;
  var lib = (state.config && state.config.gifts) || [];
  for (var i=0;i<lib.length;i++) if (g.presetId && lib[i].id === g.presetId && safeImg(lib[i].image)) return lib[i].image;
  return null;
}
/* Photo if one was uploaded for the gift, otherwise a drawn illustration matched by name. */
function giftArtHtml(g){
  var ph = giftPhoto(g);
  return ph ? `<img src="${esc(ph)}" alt="${esc(g.name)}">`
    : `<svg viewBox="0 0 96 96" aria-hidden="true">${GIFT_ART[giftArtKey(g.name)]}</svg>`;
}
var PACKAGE_ICONS = { preferred:"★", essential:"◆", basic:"●" };
function renderCustomerDisplay(tx){
  var b = brand(), cfg = state.config, t = C.totals(state, tx);
  var head = `<div class="cd-head"><div class="fs">${esc(b.finLabel)}</div>
    <div class="cd-tagline">Stronger Coverage, Smarter Ownership, That's the Difference.</div></div>`;
  var freqWord = tx.finance.frequency ? C.freqLabel(tx.finance.frequency) : "bi-weekly or monthly";
  var noteBar = `<div class="cd-note"><div class="nt1">Premium protection for your ${esc(b.label)} investment</div>
    <div class="nt2">${tx.type==="Cash"
      ? "All totals shown are due in full at signing, plus "+esc(state.config.tax.standard)+"% HST."
      : "All payments shown are "+freqWord+", interest and "+esc(state.config.tax.standard)+"% HST included."}</div></div>`;
  var foot = `<div class="cd-foot"><span>${esc(cfg.name)} — ${esc(cfg.address)}, ${esc(cfg.city)}</span><span>${esc(cfg.phone)}</span>
  </div>`;

  if (tx.display.mode === "welcome" || tx.display.mode === "thankyou" || !tx.lines.length){
    var done = tx.display.mode === "thankyou";
    var body;
    if (done){
      body = `<div class="hw">Congratulations${tx.customer.name ? ", " + esc(tx.customer.name.split(" ")[0]) : ""}</div>
        <p class="muted" style="max-width:46ch">Your vehicle is protected and your paperwork is complete.</p>`;
    } else {
      body = `<div class="hw">Welcome${tx.customer.name ? " " + esc(tx.customer.name) : ""}</div>
        <div class="cd-sub1">Designing What Fits You Drive</div>
        <p class="muted" style="max-width:44ch">Your Finance Manager will help you choose the right coverage.</p>`;
    }
    return `<div class="cd" style="${cdThemeStyle()}">${head}<div class="cd-welcome">${body}</div>${noteBar}${foot}</div>`;
  }

  var shown = packagesToShow(t, tx);
  /* A gift (or the bundle savings) that applies to every package on screen is shown once, as a banner
     across the top; anything on only some packages stays on those package cards. */
  var bannerGifts = [], allSavings = false;
  if (shown.length >= 2){
    (shown[0].gifts || []).forEach(function(g){
      if (shown.every(function(p){ return (p.gifts || []).indexOf(g) !== -1; })) bannerGifts.push(g);
    });
    allSavings = shown.every(function(p){ return p.discount > 0; });
  }
  /* Gifts and bundle savings that apply to every package on screen share ONE pane above the packages. */
    var giftsCol = bannerGifts.length ? `<div><div class="op-lbl">Promotional Offer${bannerGifts.length > 1 ? "s" : ""}</div>
      <div class="op-gifts" style="--n:${Math.min(bannerGifts.length, 3)}">${bannerGifts.map(function(g){
        return `<div class="op-row"><div class="op-tile">${giftArtHtml(g)}</div><div><div class="op-name">${esc(g.name)}</div></div></div>`; }).join("")}</div></div>` : "";
  var saveCol = allSavings ? `<div><div class="op-lbl">Bundle Savings</div>
      <div class="op-save"><span class="op-ck">${CHECK_SVG}</span><div><div class="op-save-t">Bundle savings applied</div><div class="op-save-s">Reflected in every payment shown</div></div></div></div>` : "";
  var both = !!(giftsCol && saveCol);
  var bannersHtml = (giftsCol || saveCol) ? `<div class="opane"><div class="op-head">${GIFT_SVG}<span>Included with all packages</span></div>
    <div class="op-body${both ? "" : " one"}">${giftsCol}${both ? `<div class="op-div"></div>` : ""}${saveCol}</div></div>` : "";
  var cards = shown.map(function(p){
    var items = p.lines.map(function(L){
      var cfgTxt = lineConfigText(L, true);
      var icon = productIconSvg(L.product);
      var priceTxt = (L.price===null || !(tx.type==="Cash" || tx.display.showPrices)) ? "" : `<div class="pi-price">${money(L.price)}</div>`;
      return `<div class="pi"><span class="pi-icon">${icon}</span><div class="pi-txt"><div class="n2">${esc(L.product.name)}</div>${cfgTxt?`<div class="c2">${esc(cfgTxt)}</div>`:""}</div>${priceTxt}</div>`;
    }).join("");
    /* Savings and gifts are real: the discount is already inside this package's
       price and payments, and a gift is only shown when the Finance Manager
       attached one to this package. */
    var badges = [];
    if (p.discount > 0 && !allSavings) badges.push(`<span class="ph-chip">${CHECK_SVG}<span>Bundle savings applied</span></span>`);
    var badgeHtml = badges.length ? `<div class="ph-badges">${badges.join("")}</div>` : "";
    var pkgGifts = (p.gifts || []).filter(function(g){ return bannerGifts.indexOf(g) === -1; });
    var giftPills = pkgGifts.length ? `<div class="gift-pill"><div class="gp-tag">Promotional Offer${pkgGifts.length > 1 ? "s" : ""}</div>
      <div class="gp-items" style="--n:${Math.min(pkgGifts.length, 3)}">${pkgGifts.map(function(g){
        return `<div class="gp-item"><span class="gp-ic art">${giftArtHtml(g)}</span><div class="gp-name">${esc(g.name)}</div></div>`; }).join("")}</div></div>` : "";
    var sealHtml = pkgGifts.length ? `<div class="promo-cap">Promotional Offer</div>` : "";
    var payBox = tx.type==="Cash"
      ? (tx.display.showPayment ? `<div class="paybox"><div class="payterm"><div class="pt-term">Due in full</div>
          <div class="pt-amt">${money(p.dueTotal - t.vehicleTax - p.tax)} + HST</div></div></div>` : "")
      : (tx.display.showPayment && p.quotes && p.quotes.length)
      ? `<div class="paybox">${p.quotes.map(function(q){
          return `<div class="payterm"><div class="pt-term">${q.term} mo</div>
            <div class="pt-amt">${q.payment===null?"—":money(q.payment)}</div>
            <div class="pt-freq muted">${q.payment===null?"rate pending":C.freqLabel(q.frequency)}</div></div>`;
        }).join("")}</div>` : "";
    var declinedLines = t.lines.filter(function(L){ return L.cfg.declined; });
    var waiverHtml = declinedLines.length ? `<div class="cd-waiver">
      <div class="wv-lbl">Waiver</div>
      ${declinedLines.map(function(L){
        var perDayTxt = (L.perDayByTerm||[]).filter(function(x){ return x.perDay !== null; })
          .map(function(x){ return money(x.perDay) + "/day (" + x.term + " mo)"; }).join(" · ");
        return `<div class="wv-card">
          <span class="wv-x">✕</span>
          <div class="wv-txt"><div class="wv-name">${esc(L.product.name)}</div>
            <div class="wv-sub">DECLINED — ${perDayTxt || "—"}</div></div>
        </div>`;
      }).join("")}
    </div>` : "";
    return `<div class="pkgwrap"><div class="pkgcard"><div class="ph"><div>${esc(p.label)}</div>${badgeHtml}${giftPills}</div>${payBox}<div class="pb">${items}${waiverHtml}</div></div>${sealHtml}</div>`;
  }).join("");

  return `<div class="cd" style="${cdThemeStyle()}">${head}<div class="cd-body">
    <div class="cd-veh"><div class="v1">${esc(tx.vehicle.year+" "+tx.vehicle.make+" "+tx.vehicle.model)}</div>
      <div class="muted small">${tx.customer.name ? "Prepared for " + esc(tx.customer.name) : ""}</div></div>
    ${bannersHtml}
    <div class="pkgrid">${cards}</div>
  </div>${noteBar}${foot}</div>`;
}

/* ---------------- FSM DISPLAY ---------------- */
/* A step ticks only when that part of the deal is really finished: finance setup needs a
   selling price to work from (its term and rate are pre-filled, so they alone prove nothing),
   and Presentation needs the customer's package choice recorded. "bad" marks the steps
   holding a problem once Complete has been pressed (state.ui.finCheck). */
function stepState(tx, v){
  var t = v.totals, has = function(n){ return v.issues.some(function(i){ return i.step === n; }); };
  var priced = Number(tx.vehicle.price) > 0, check = !!state.ui.finCheck;
  var chosen = t.selectedPackage !== null || (!t.packagesUsed && tx.lines.length > 0);
  return [
    { n:1, label:"Customer", done: !has(1), bad: check && has(1) },
    { n:2, label:"Vehicle", done: !has(2), bad: check && has(2) },
    { n:3, label:tx.type==="Cash"?"Cash setup":"Finance setup", done: priced && !has(3), bad: check && has(3) },
    { n:4, label:"Products & packages", done: tx.lines.length > 0 && !has(4), bad: check && has(4) },
    { n:5, label:"Present & close", done: chosen, bad: check && has(5), target: !chosen && t.packagesUsed ? "step-choice" : "step-5" }
  ];
}
function selectOptions(list, current, fmt){
  return list.map(function(v){ return `<option value="${v}" ${String(current)===String(v)?"selected":""}>${esc(fmt?fmt(v):v)}</option>`; }).join("");
}
/* Money fields on the Finance screen are text boxes showing "$42,995.00" (or "1,885.00" beside a
   "$" prefix). Focusing one swaps in the plain number to edit, from data-raw (see the focusin
   handler); the change handler strips "$" and commas before saving. */
function moneyInput(v, sign){
  var has = v !== null && v !== undefined && v !== "" && !isNaN(Number(v));
  var shown = has ? (sign ? money(Number(v)) : money(Number(v)).replace("$", "")) : "";
  return `type="text" inputmode="decimal" autocomplete="off" data-money="${sign ? "sign" : "plain"}" data-raw="${has ? esc(String(Number(v))) : ""}" value="${esc(shown)}"`;
}
function moneyHint(v){ return v === null || v === undefined || v === "" || isNaN(Number(v)) ? "0.00" : money(Number(v)).replace("$", ""); }
function viewFinance(){
  ensureOffers(state.tx);
  var tx = state.tx, v = C.validate(state, tx), t = v.totals;
  var steps = stepState(tx, v);
  /* Already in Reports (just completed, or reopened from Reports)? Then say so, and say
     plainly whether it has been changed since. */
  var doneRec = state.completed.filter(function(d){ return d.id === tx.id; })[0] || null;
  var changedSince = !!doneRec && C.dealSig(doneRec) !== C.dealSig(tx);
  var doneBanner = !doneRec ? "" : changedSince
    ? `<div class="notice warn deal-banner"><div><strong>Changed since it was completed.</strong> Reports still show the earlier version of deal ${esc(tx.id)}.</div>
        <div class="sp"><button class="btn sm primary" data-act="complete">Update completed deal</button><button class="btn sm" data-act="new-deal">Start next deal</button></div></div>`
    : `<div class="notice ok deal-banner"><div><strong>✓ Deal completed.</strong> ${esc(tx.id)} is in Reports${doneRec.createdAt ? ", dated " + esc(C.fmtDate(doneRec.createdAt)) : ""}.</div>
        <div class="sp"><button class="btn sm primary" data-act="new-deal">Start next deal</button></div></div>`;

  var stepBar = `<div class="steps">${steps.map(function(s){
    return `<div class="step ${s.bad?"bad":s.done?"done":""}" data-act="scroll-step" data-step="${s.n}" data-target="${s.target || "step-" + s.n}">
      <span class="n">${s.bad?"!":s.done?"✓":s.n}</span><span>${esc(s.label)}</span></div>`; }).join("")}</div>`;

  /* One bar, pinned under the header while the page scrolls: the customer display, Print & send,
     Deal, how close the deal is to done, and Complete — with the step bar underneath. */
  var savedN = savedForMe().length, menu = state.ui.barMenu;
  var savedBadge = savedN ? `<span class="saved-badge">${savedN}</span>` : "";
  var leftN = v.errors.length;
  var readyPill = doneRec ? "" : leftN
    ? `<button type="button" class="ready-pill todo" data-act="jump-issue" data-idx="0" title="Go to the first thing left to finish">${leftN} thing${leftN===1?"":"s"} left</button>`
    : `<span class="ready-pill ok">✓ Ready to complete</span>`;
  var toolbar = `<div class="fin-toolbar"><div class="fin-bar">
    ${isAdmin() ? `<label class="switch"><span class="muted small">Finance Manager</span>
      <select data-bind="tx.fsmUserId" style="width:auto;min-width:150px">
        <option value="">Unassigned</option>
        ${fsmUsers().map(function(u){ return `<option value="${u.id}" ${u.id===tx.fsmUserId?"selected":""}>${esc(u.name)}</option>`; }).join("")}
      </select></label>` : ""}
    <div class="cdmenu-wrap">
      <button class="btn sm ${state.ui.cdMenu||state.ui.cdPreview?"on":""}" data-act="cd-menu">Customer display · ${{welcome:"Welcome",package:"Present",thankyou:"Thank you"}[tx.display.mode]||"Welcome"} ▾</button>
      ${state.ui.cdMenu ? `<div class="cdmenu">
        <div class="cdm-lbl">What the customer sees</div>
        <div class="cdm-seg">
          <button type="button" class="${tx.display.mode==="welcome"?"on":""}" data-act="cd-mode" data-mode="welcome">Welcome</button>
          <button type="button" class="${tx.display.mode==="package"?"on":""}" data-act="cd-mode" data-mode="package">Present</button>
          <button type="button" class="${tx.display.mode==="thankyou"?"on":""}" data-act="cd-mode" data-mode="thankyou">Thank you</button>
        </div>
        <div class="cdm-sep"></div>
        <button type="button" class="cdm-item" data-act="open-customer-window">Open on second screen ↗</button>
        <button type="button" class="cdm-item" data-act="present">Full screen</button>
        <button type="button" class="cdm-item" data-act="cd-preview-toggle">${state.ui.cdPreview ? "Hide preview" : "Preview here"}</button>
      </div>` : ""}
    </div>
    <div class="cdmenu-wrap">
      <button class="btn sm ${menu==="print"?"on":""}" data-act="bar-menu" data-menu="print">Print &amp; send ▾</button>
      ${menu==="print" ? `<div class="cdmenu bar-menu">
        <button type="button" class="cdm-item" data-act="email">Email the package</button>
        <button type="button" class="cdm-item" data-act="print-internal">Internal print</button>
        <button type="button" class="cdm-item" data-act="print-customer">Customer copy</button>
      </div>` : ""}
    </div>
    <button class="btn sm" data-act="new-deal" title="Clear this deal and start a fresh one (you can keep it in Saved deals first)">↺ New deal</button>
    <div class="cdmenu-wrap">
      <button class="btn sm ${menu==="deal"?"on":""}" data-act="bar-menu" data-menu="deal">Deal ▾${savedBadge}</button>
      ${menu==="deal" ? `<div class="cdmenu bar-menu">
        <button type="button" class="cdm-item" data-act="save-deal">Save deal</button>
        <button type="button" class="cdm-item" data-act="saved-list">Saved deals${savedBadge}</button>
      </div>` : ""}
    </div>
    <span class="fin-bar-sp"></span>
    ${readyPill}
    <button class="btn sm primary" data-act="complete">${doneRec ? "Update completed deal" : "Complete transaction"}</button>
  </div>${stepBar}</div>`;

  var customerCard = `<div class="card" id="step-1"><div class="card-h"><h2>1 · Customer</h2></div>
    <div class="card-b"><div class="cv-grid">
      <label class="f cv-wide"><span>Full name</span><input type="text" value="${esc(tx.customer.name)}" data-bind="tx.customer.name"></label>
      <label class="f"><span>Phone</span><input type="text" value="${esc(tx.customer.phone)}" data-bind="tx.customer.phone"></label>
      <label class="f"><span>Email</span><input type="text" value="${esc(tx.customer.email)}" data-bind="tx.customer.email"></label>
    </div></div></div>`;

  var vehicleCard = `<div class="card" id="step-2"><div class="card-h"><h2>2 · Vehicle</h2></div>
    <div class="card-b"><div class="cv-grid three">
      <label class="f"><span>Year</span><input type="number" value="${esc(tx.vehicle.year)}" data-bind="tx.vehicle.year" data-type="num"></label>
      <label class="f"><span>Make</span><input type="text" value="${esc(tx.vehicle.make)}" data-bind="tx.vehicle.make"></label>
      <label class="f"><span>Model</span><input type="text" value="${esc(tx.vehicle.model)}" data-bind="tx.vehicle.model"></label>
      <label class="f"><span>Stock number</span><input type="text" value="${esc(tx.vehicle.stock)}" data-bind="tx.vehicle.stock"></label>
      <label class="f"><span>Condition</span><select data-bind="tx.vehicle.condition">${selectOptions(["New","Certified Pre-Owned","Used"], tx.vehicle.condition)}</select></label>
      <label class="f"><span>Selling price</span><input ${moneyInput(tx.vehicle.price, true)} data-bind="tx.vehicle.price" data-type="num"></label>
    </div></div></div>`;

  var termChoices = [24,36,48,60,72,84,96];
  var termChips = termChoices.map(function(tm){
    var on = t.terms.indexOf(tm) !== -1;
    return `<label class="termchip ${on?"on":""}"><input type="checkbox" data-act="toggle-term" data-term="${tm}" ${on?"checked":""}>${tm} Months</label>`;
  }).join("");
  var rateInputs = t.terms.length ? `<div class="cfgrid" style="margin-top:10px">${t.terms.map(function(tm){
    var r = tx.finance.rates && tx.finance.rates[tm] !== undefined && tx.finance.rates[tm] !== null ? tx.finance.rates[tm] : "";
    return `<label class="f"><span>${tm} months — rate (APR %)</span><input type="number" step="0.01" value="${esc(r)}" data-act="term-rate" data-term="${tm}"></label>`;
  }).join("")}</div>` : "";

  var dealTypeToggle = `<div class="chiprow" style="margin-bottom:12px">
    <button type="button" class="btn sm ${tx.type==="Finance"?"on":""}" data-act="set-deal-type" data-deal-type="Finance">Finance</button>
    <button type="button" class="btn sm ${tx.type==="Cash"?"on":""}" data-act="set-deal-type" data-deal-type="Cash">Cash</button>
  </div>`;

  var financeBody = `
      <div class="fs-row"><div class="fs-left">
      <div class="fs-grid">
        <label class="f"><span>Trade allowance</span><input ${moneyInput(tx.finance.tradeAllowance, true)} data-bind="tx.finance.tradeAllowance" data-type="num"></label>
        <label class="f"><span>Trade payout</span><input ${moneyInput(tx.finance.tradePayout, true)} data-bind="tx.finance.tradePayout" data-type="num"></label>
        <label class="f"><span>Cash down</span><input ${moneyInput(tx.finance.downPayment, true)} data-bind="tx.finance.downPayment" data-type="num"></label>
        <label class="f"><span>Fees (non-taxable)</span><input ${moneyInput(tx.finance.feeAmount, true)} data-bind="tx.finance.feeAmount" data-type="num" placeholder="$0.00"></label>
      </div>
      <label class="f" style="margin-top:10px"><span>Payment frequency shown to the customer</span>
        <div class="chiprow" id="freq-chips">
          <button type="button" class="btn sm ${tx.finance.frequency==="monthly"?"on":""}" data-act="set-frequency" data-freq="monthly">Monthly</button>
          <button type="button" class="btn sm ${tx.finance.frequency==="biweekly"?"on":""}" data-act="set-frequency" data-freq="biweekly">Bi-weekly</button>
        </div>
      </label>
      </div><div class="fs-div" aria-hidden="true"></div><div class="fs-right">
        <div class="small muted" style="margin-bottom:6px">Finance terms to present — tick every term you want the customer to see, then set that term's own rate</div>
        <div class="chiprow" id="term-chips">${termChips}</div>
        ${rateInputs}
      </div></div>
      <div class="divider"></div>
      ${t.baseQuotes.length ? `<div class="tablewrap"><table>
        <thead><tr><th>Term</th><th class="right">Rate</th><th class="right">Base payment, no products</th><th class="right">Payments</th></tr></thead>
        <tbody>${t.baseQuotes.map(function(q){ return `<tr><td>${q.term} Months</td>
          <td class="right num">${q.rate===null?`<span class="tag warn">Enter rate</span>`:q.rate+"%"}</td>
          <td class="right num">${q.basePayment===null?"—":money(q.basePayment)+" "+C.freqLabel(q.frequency)}</td>
          <td class="right num">${q.paymentsCount}</td></tr>`; }).join("")}</tbody></table></div>`
        : `<div class="notice warn">Pick at least one term and a payment frequency to see payments.</div>`}`;

  var cashBody = `
      <div class="inline">
        <label class="f"><span>Trade allowance</span><input ${moneyInput(tx.cash.tradeAllowance, true)} data-bind="tx.cash.tradeAllowance" data-type="num"></label>
        <label class="f"><span>Trade payout</span><input ${moneyInput(tx.cash.tradePayout, true)} data-bind="tx.cash.tradePayout" data-type="num"></label>
        <label class="f"><span>Deposit</span><input ${moneyInput(tx.cash.downPayment, true)} data-bind="tx.cash.downPayment" data-type="num"></label>
        <label class="f"><span>Fees (non-taxable)</span><input ${moneyInput(tx.cash.feeAmount, true)} data-bind="tx.cash.feeAmount" data-type="num" placeholder="$0.00"></label>
      </div>
      <div class="divider"></div>
      <div class="tablewrap"><table>
        <thead><tr><th>Vehicle + fees + tax</th><th class="right">Products (selected package)</th><th class="right">Total due at signing</th></tr></thead>
        <tbody><tr><td>${money(t.baseAmount)}</td>
          <td class="right num">${money(t.productsTotal)}</td>
          <td class="right num"><strong>${money(t.baseAmount+t.productsTotal)}</strong></td></tr></tbody></table></div>
      <div class="small muted" style="margin-top:6px">No financing, no payment schedule — the customer pays this in full. The per-package total below updates as products are added.</div>
      ${allowedRouteKeys() === null || allowedRouteKeys().indexOf("cashadv") !== -1 ? `<div class="ca-cta"><div><strong>Paying cash?</strong> <span class="muted small">Show the customer what financing and investing the cash would do, filled in from this deal.</span></div>
        <button type="button" class="btn sm primary" data-act="ca-from-deal" data-go="1">Compare with financing →</button></div>` : ""}`;

  var financeCard = `<div class="card" id="step-3"><div class="card-h"><h2>3 · ${tx.type==="Cash"?"Cash":"Finance"} setup</h2>
    <div class="sp"><span class="tag">${tx.type==="Cash" ? "Paid in full" : (t.terms.length ? t.terms.length + " term" + (t.terms.length>1?"s":"") + " presented" : "No term selected")}</span></div></div>
    <div class="card-b">
      ${dealTypeToggle}
      ${tx.type==="Cash" ? cashBody : financeBody}
    </div></div>`;

  var pkgOf = function(k){ return t.packages.filter(function(x){ return x.key === k; })[0]; };
  var capWord = function(x){ x = String(x || ""); return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase(); };
  /* What a brand-new line for this product would start with, so the selectors can show real
     values (and a price hint) before the product has been ticked into any package. */
  function cfgDefaults(p){
    var d = { term:null, km:null, interval:null, deductible:null };
    if (p.uses.term){
      var want = C.primaryTerm(tx);
      if (want){ var best = p.terms[0]; p.terms.forEach(function(x){ if (Math.abs(x-want) < Math.abs(best-want)) best = x; }); d.term = best; }
      else d.term = p.terms[Math.min(2, p.terms.length-1)];
    }
    if (p.uses.km) d.km = p.kms[Math.min(2, p.kms.length-1)];
    if (p.uses.interval) d.interval = p.intervals[1] !== undefined ? p.intervals[1] : p.intervals[0];
    if (p.uses.deductible) d.deductible = p.deductibles[p.deductibles.length-1];
    return d;
  }
  /* Products as a menu grid: one row per product, one column per package. The column heads
     carry just Preferred / Essential / Basic; totals and payment differences are in the choice boxes above. */
  var pkgHead = D.PACKAGES.map(function(def){
    return `<div class="mg-pk"><div class="mg-pk-n">${esc(capWord(def.suffix))}</div></div>`;
  }).join("");
  var headNote = "Tick each product into one, two or all three packages.";
  var productRows = state.products.filter(function(p){ return p.active; }).map(function(p){
    var line = tx.lines.filter(function(l){ return l.productId === p.id; })[0];
    var L = line ? t.lines.filter(function(x){ return x.cfg.lineId === line.lineId; })[0] : null;
    var pkgs = line ? (line.packages || {}) : {};
    var icon = PRODUCT_ICONS[p.id] || "🛡";
    /* Tab should walk straight down the price column, not detour through
       every gear/package/decline control in between — those stay reachable
       by click but drop out of the keyboard tab order (tabindex="-1"), so
       DOM order alone carries Tab from one price box to the next. */
    var cells = D.PACKAGES.map(function(def){
      var on = !!pkgs[def.key], lbl = C.packageLabel(state, def.suffix);
      return `<label class="mg-cell ${on?"on":""}" title="${esc(p.name)} — ${esc(lbl)}"><input type="checkbox" tabindex="-1" data-act="toggle-package-list" data-product="${p.id}" data-package="${def.key}" ${on?"checked":""} aria-label="${esc(p.name)} in ${esc(lbl)}"><span class="mg-box">${on ? CHECK_SVG : ""}</span><span class="mg-lbl">${esc(capWord(def.suffix))}</span></label>`;
    }).join("");
    var declineOn = !!(line && line.declined);
    var declineBtn = `<label class="declinebtn ${declineOn?"on":""}"><input type="checkbox" tabindex="-1" data-act="toggle-decline" data-product="${p.id}" ${declineOn?"checked":""}>${declineOn?"Undo":"Decline"}</label>`;
    var priceNote = !line ? (p.pricing ? "" : `<span class="tag warn">No price set</span>`)
      : (line.declined ? `<span class="tag danger">Declined</span>`
      : L.price === null ? `<span class="tag danger">Enter a retail price</span>`
      : (L.overridden ? `<span class="tag warn">Price overridden</span>` : `<span class="tag ok">Configured</span>`));
    var needsCost = !C.hasListCost(p);
    var hasCfgFields = p.uses.term || p.uses.km || p.uses.interval || p.uses.deductible || needsCost;
    var cv = line || cfgDefaults(p);
    var bp = line ? "line:" + line.lineId + ":" : "newcfg:" + p.id + ":";
    var f2 = [];
    function cfgSel(label, key, opts, fmt){
      f2.push(`<label class="cfg-f"><span>${label}</span><select tabindex="-1" data-bind="${bp}${key}" data-type="num">
        <option value="">Select…</option>${selectOptions(opts, cv[key], fmt)}</select></label>`);
    }
    if (p.uses.term) cfgSel("Term", "term", p.terms, function(x){ return x + " Months"; });
    if (p.uses.km) cfgSel("Kilometres", "km", p.kms, function(x){ return km(x); });
    if (p.uses.interval) cfgSel("Service interval", "interval", p.intervals, function(x){ return "Every " + km(x); });
    if (p.uses.deductible) cfgSel("Deductible", "deductible", p.deductibles, function(x){ return Number(x)===0?"No deductible":"$"+x; });
    if (needsCost){
      var costVal = line && line.cost !== null && line.cost !== undefined ? line.cost : "";
      f2.push(`<label class="cfg-f"><span>Dealer cost ($)</span><input ${moneyInput(costVal, false)} tabindex="-1" data-bind="${bp}cost" data-type="num" placeholder="Enter cost"></label>`);
    }
    var cfgOpen = hasCfgFields && state.ui.productConfigOpen === p.id;
    var chosenBits = line ? lineConfigText(L || { product:p, cfg:line }, true) : "";
    var cfgSum = hasCfgFields && !cfgOpen && chosenBits ? `<div class="cfg-sum">${esc(chosenBits)}</div>` : "";
    var gearBtn = hasCfgFields ? `<button type="button" tabindex="-1" class="gearbtn ${cfgOpen?"on":""}" data-act="toggle-product-config" data-product="${p.id}" title="Options and dealer cost">⚙</button>` : "";
    var priceVal = line && L && L.price !== null ? L.price : "";
    var hintPrice = line ? (L ? L.configuredPrice : null) : C.priceFor(p, cv);
    var pricePlaceholder = hintPrice !== null && hintPrice !== undefined ? hintPrice : "0.00";
    var priceBind = line ? `line:${line.lineId}:price` : `newline:${p.id}:price`;
    return `<div class="mg-row ${declineOn?"declined":""}" data-pid="${esc(p.id)}">
      <div class="mg-prod"><div class="pr-icon">${icon}</div><div class="mg-name">
        <div class="nm">${esc(p.name)}${priceNote}${needsCost ? (line && Number(line.cost) > 0 ? `<span class="tag">Cost entered</span>` : `<span class="tag warn">No cost</span>`) : ""}</div>
        <div class="tiny muted">${esc(p.category)} · Tax ${p.taxRule==="vrc"?state.config.tax.vrc:state.config.tax.standard}%</div>
        ${cfgSum}
      </div></div>
      <div class="mg-price"><div class="pricebox"><span class="pfx">$</span><input ${moneyInput(priceVal, false)} data-bind="${priceBind}" data-type="num" placeholder="${moneyHint(pricePlaceholder === "0.00" ? null : pricePlaceholder)}"></div>${gearBtn}</div>
      ${cells}
      <div class="mg-dec">${declineBtn}</div>
      ${cfgOpen ? `<div class="mg-cfg cfg-inline">${f2.join("")}</div>` : ""}
    </div>`;
  }).join("");

  /* The customer's package choice sits at the top of Products & packages, right under its heading. */
  var chosenKey = tx.display.selection ? tx.display.selection.package : null;
  var addTerm = tx.type === "Cash" ? null : C.primaryTerm(tx);
  var choiceBtns = D.PACKAGES.map(function(def){
    var p = pkgOf(def.key), isSel = chosenKey === def.key;
    var q = addTerm ? (p.quotes || []).filter(function(x){ return x.term === addTerm; })[0] : null;
    var add = p.count && q && q.difference !== null ? "+" + money(q.difference) + " " + C.freqLabel(q.frequency) : "";
    return `<button type="button" class="pkgselect ${isSel?"on":""}" data-act="select-final-package" data-package="${def.key}" ${p.count || isSel ? "" : "disabled"}>
      <div class="pks-name">${esc(p.label)}</div>
      <div class="pks-count">${p.count} product${p.count===1?"":"s"}${p.hasUnpriced?" · price missing":""}</div>
      <div class="pks-total">${p.count ? money(p.sub) : "—"}</div>
      ${p.count ? `<div class="tiny muted">before tax</div>` : ""}
      ${add ? `<div class="pks-add">${add}</div>` : ""}
    </button>`;
  }).join("");
  var selNone = chosenKey === "none";
  var selNote = selNone ? `<div class="notice ok" style="margin-top:12px">Recorded: no package purchased. Nothing from this presentation counts as sold in reports.
      <button class="btn sm" data-act="clear-selection" style="margin-left:10px">Undo</button></div>`
    : tx.display.selection ? `<div class="notice ok" style="margin-top:12px">
      Presenting only <strong>${esc((pkgOf(chosenKey)||{}).label||"")}</strong> on the customer display.
      <button class="btn sm" data-act="clear-selection" style="margin-left:10px">Show all packages again</button></div>` : "";
  var choiceBox = `<div class="choice-box">
      <div class="choice-top"><div>
      <div class="lbl">Which package did the customer choose?</div>
      <p class="muted small" style="margin:2px 0 0;max-width:80ch">It narrows the customer display to that package and records it as sold, so only its products count in reports. Click it again to undo.${addTerm ? ` The blue figure is what each package adds to the ${esc(C.freqLabel(tx.finance.frequency))} payment at ${addTerm} months.` : ""}</p>
      </div>
      <button type="button" class="btn sm choice-none ${selNone?"on":""}" data-act="select-final-package" data-package="none">Customer didn't buy a package</button></div>
      <div class="choice-row" id="step-choice">${choiceBtns}</div>
      ${selNote}
    </div>`;

  var productsCard = `<div class="card" id="step-4"><div class="card-h"><h2>4 · Products &amp; packages</h2>
    <div class="sp"><span class="muted small">${tx.lines.length} selected</span>
      <button class="btn sm" data-act="route" data-route="products">Manage product master</button></div></div>
    <div class="card-b">
      ${state.products.length ? `${choiceBox}<div class="mg-head">
          <div class="mg-h-prod muted small">${headNote}</div>
          <div class="mg-h-price tiny muted">Retail price</div>
          ${pkgHead}
          <div class="mg-h-dec"></div>
        </div>${productRows}`
        : `<div class="emptystate"><h3>No products set up yet</h3><p class="muted small">Add this dealership's products first, then come back to build packages.</p><button class="btn primary" data-act="route" data-route="products">Set up products</button></div>`}
    </div></div>`;

  var off = tx.offers, dsc = off.discount;
  var dscUnit = dsc.type === "percent" ? "%" : "$";
  var dscInputs = dsc.scope === "deal"
    ? `<label class="f"><span>Discount on whichever package the customer chooses</span><div class="pricebox"><span class="pfx">${dscUnit}</span>
        <input type="number" min="0" step="any" value="${dsc.deal ? esc(dsc.deal) : ""}" data-bind="tx.offers.discount.deal" data-type="num" placeholder="0"></div></label>
       <div class="tiny muted">${D.PACKAGES.map(function(def){ var p = pkgOf(def.key); return p && p.discount > 0 ? esc(C.packageLabel(state, def.suffix)) + ": −" + money(p.discount) + " → " + money(p.sub) : ""; }).filter(Boolean).join(" · ") || "Enter a value to show a savings badge on the customer display."}</div>`
    : `<div class="offers-grid">${D.PACKAGES.map(function(def){ var p = pkgOf(def.key);
        return `<label class="f"><span>${esc(C.packageLabel(state, def.suffix))}</span><div class="pricebox"><span class="pfx">${dscUnit}</span>
          <input type="number" min="0" step="any" value="${dsc.packages[def.key] ? esc(dsc.packages[def.key]) : ""}" data-bind="tx.offers.discount.packages.${def.key}" data-type="num" placeholder="0"></div>
          <span class="tiny muted">${p && p.discount > 0 ? "−" + money(p.discount) + " → " + money(p.sub) : "No discount"}</span></label>`; }).join("")}</div>`;
  var presetGifts = (state.config.gifts || []).filter(function(g){ return g && g.name; });
  var gEdit = state.ui.giftEdit;
  var libCostOf = function(presetId){ var lb = (state.config.gifts || []).filter(function(x){ return x.id === presetId; })[0];
    return lb && lb.cost !== null && lb.cost !== undefined && lb.cost !== "" && !isNaN(Number(lb.cost)) ? Number(lb.cost) : null; };
  var offerNeedsCost = function(g){ return !g.presetId || libCostOf(g.presetId) === null; };
  var allPk = function(pk){ return !!(pk && pk.preferred && pk.essential && pk.basic); };
  var cap = function(x){ return x.charAt(0) + x.slice(1).toLowerCase(); };
  var scopeLabel = function(g){ return allPk(g.packages) ? "All packages" : D.PACKAGES.filter(function(def){ return g.packages && g.packages[def.key]; }).map(function(def){ return cap(def.suffix); }).join(", "); };
  var gbtn = function(key, label, g){
    return `<div class="gbtn-wrap"><button type="button" class="gbtn ${g ? "on" : ""}" data-act="gift-open" data-key="${esc(key)}">${g ? CHECK_SVG : "＋"}<span>${esc(label)}${g ? `<span class="gsub"> · ${esc(scopeLabel(g))}${offerNeedsCost(g) && !(Number(g.cost) > 0) ? " · no cost" : ""}</span>` : ""}</span></button>
      ${g ? `<button type="button" class="gbtn-x" data-act="gift-x" data-key="${esc(key)}" title="Remove this offer" aria-label="Remove ${esc(label)}">✕</button>` : ""}</div>`;
  };
  var giftButtons = presetGifts.map(function(lib){
    return gbtn("p:" + lib.id, lib.name, off.gifts.filter(function(x){ return x.presetId === lib.id; })[0] || null);
  }).join("")
    + off.gifts.filter(function(x){ return !x.presetId; }).map(function(x){ return gbtn("c:" + x.id, x.name || "Custom offer", x); }).join("")
    + gbtn("c:new", "Custom offer", null);
  var gPanel = "";
  if (gEdit){
    var gValid = !!(String(gEdit.name || "").trim()) && (gEdit.mode === "all" || allPk(gEdit.pk) || D.PACKAGES.some(function(def){ return gEdit.pk[def.key]; }));
    gPanel = `<div class="gpanel">
      <div class="gpanel-t">${gEdit.custom ? `<input type="text" id="giftNameInput" value="${esc(gEdit.name || "")}" placeholder="Offer name, e.g. Winter tire storage" autocomplete="off">` : `<strong>${esc(gEdit.name)}</strong>`}</div>
      <div class="gpanel-l">Show this offer on</div>
      <div class="gp-seg"><button type="button" class="${gEdit.mode === "all" ? "on" : ""}" data-act="gift-mode" data-val="all">All packages</button>
        <button type="button" class="${gEdit.mode === "some" ? "on" : ""}" data-act="gift-mode" data-val="some">Selected packages</button></div>
      ${gEdit.mode === "some" ? `<div class="pkgchk-row" style="margin:10px 0 2px;flex-wrap:wrap">${D.PACKAGES.map(function(def){ var on = !!gEdit.pk[def.key];
        return `<label class="pkgchk ${on ? "on" : ""}"><input type="checkbox" data-act="gift-dpk" data-pkg="${def.key}" ${on ? "checked" : ""}>${esc(C.packageLabel(state, def.suffix))}</label>`; }).join("")}</div>` : ""}
      ${gEdit.needsCost ? `<label class="f" style="margin:12px 0 0;max-width:220px"><span>Dealer cost for this deal ($)</span>
        <input type="number" min="0" step="any" id="giftCostInput" value="${gEdit.cost === null || gEdit.cost === undefined ? "" : esc(gEdit.cost)}" placeholder="Enter cost"></label>` : ""}
      <div class="gpanel-a"><button type="button" class="btn sm" data-act="gift-cancel">Cancel</button>
        <button type="button" class="btn sm primary" data-act="gift-done" ${gValid ? "" : "disabled"}>Done</button></div></div>`;
  }
  var offersCard = `<div class="card" id="step-offers"><div class="card-h"><h2>Offers</h2></div>
    <div class="card-b"><div class="offers-2col">
      <div>
        <div class="lbl" style="margin-bottom:4px">Package savings</div>
        <p class="muted small" style="margin:0 0 8px">A real price reduction on the package. The customer sees a "Bundle savings applied" badge, with no amounts. Switching it on or off clears the values.</p>
        <label class="switch"><input type="checkbox" data-act="offer-toggle" ${dsc.enabled?"checked":""}> Bundle savings</label>
        ${!dsc.enabled ? "" : `<div class="chiprow" style="margin:10px 0">
          <button type="button" class="btn sm ${dsc.scope==="package"?"on":""}" data-act="offer-scope" data-val="package">Per package</button>
          <button type="button" class="btn sm ${dsc.scope==="deal"?"on":""}" data-act="offer-scope" data-val="deal">Whole deal</button>
          <span style="width:10px"></span>
          <button type="button" class="btn sm ${dsc.type==="percent"?"on":""}" data-act="offer-dtype" data-val="percent">% off</button>
          <button type="button" class="btn sm ${dsc.type==="amount"?"on":""}" data-act="offer-dtype" data-val="amount">$ off</button>
        </div>
        ${dscInputs}`}
      </div>
      <div class="offers-div" aria-hidden="true"></div>
      <div>
        <div class="lbl" style="margin-bottom:4px">Promotional Offer</div>
        <p class="muted small" style="margin:0 0 10px;${canUseOffers() ? "" : "display:none"}">Included at no charge to the customer. Tap an offer to choose which packages get it; it turns green once added. Tap it again to edit, or ✕ to remove it. Dealer costs are kept in Dealership settings.</p>
        ${canUseOffers() ? `<div class="gbtn-row">${giftButtons}</div>${gPanel}`
          : `<div class="notice info" style="margin:0">Promotional offers are added by your General Manager.${off.gifts.length ? " Offers on this deal: " + off.gifts.map(function(g){ return esc(g.name); }).join(", ") + "." : ""}</div>`}
      </div>
    </div></div></div>`;

  /* 5 · Present & close: every package at every term (what the Finance Manager quotes from),
     then the amount financed, the checklist and Complete — the last things done in the box. */
  var activePk = t.packages.filter(function(p){ return p.count > 0; });
  var pkgCell = function(p){
    return `<strong>${esc(p.label)}</strong> <span class="tiny muted">${p.count} product${p.count===1?"":"s"}</span>`
      + (p.key === chosenKey ? ` <span class="tag ok">Chosen</span>` : "")
      + (p.hasUnpriced ? ` <span class="tag warn">Price missing</span>` : "")
      + (p.discount > 0 ? `<div class="tiny muted">includes −${money(p.discount)} bundle savings</div>` : "");
  };
  var payGrid;
  if (tx.type === "Cash"){
    payGrid = `<div class="tablewrap"><table class="paygrid">
      <thead><tr><th>Paid in full</th><th class="right">Products, before tax</th><th class="right">Products, with tax</th><th class="right">Total due at signing</th></tr></thead>
      <tbody><tr class="base"><td>Vehicle only, no products</td><td class="right num">—</td><td class="right num">—</td><td class="right num">${money(t.baseAmount)}</td></tr>
      ${activePk.map(function(p){ return `<tr class="${p.key===chosenKey?"chosen":""}"><td>${pkgCell(p)}</td><td class="right num">${money(p.sub)}</td>
        <td class="right num">${money(p.total)}</td><td class="right num"><strong>${money(p.dueTotal)}</strong></td></tr>`; }).join("")}
      </tbody></table></div>`;
  } else if (!t.baseQuotes.length){
    payGrid = `<div class="notice warn">Pick at least one term and a payment frequency in Finance setup to compare payments.</div>`;
  } else {
    payGrid = `<div class="tablewrap"><table class="paygrid">
      <thead><tr><th>${t.frequency === "biweekly" ? "Bi-weekly" : "Monthly"} payment, with tax</th>${t.baseQuotes.map(function(q){
        return `<th class="right">${q.term} months${q.rate !== null ? " · " + q.rate + "%" : ""}</th>`; }).join("")}</tr></thead>
      <tbody><tr class="base"><td>Vehicle only, no products</td>${t.baseQuotes.map(function(q){
        return `<td class="right num">${q.basePayment === null ? `<span class="tag warn">Enter rate</span>` : money(q.basePayment)}</td>`; }).join("")}</tr>
      ${activePk.map(function(p){ return `<tr class="${p.key===chosenKey?"chosen":""}"><td>${pkgCell(p)}</td>${p.quotes.map(function(q){
        return `<td class="right num">${q.payment === null ? "—" : money(q.payment) + `<i>+${money(q.difference)}</i>`}</td>`; }).join("")}</tr>`; }).join("")}
      </tbody></table></div>`;
  }
  if (!activePk.length) payGrid += `<div class="tiny muted" style="margin-top:8px">Tick products into packages above to compare them here.</div>`;

  var chosenPkg = t.selectedPackage && t.selectedPackage !== "none" ? pkgOf(t.selectedPackage) : null;
  var closeSum = !t.selectedPackage ? "" : `<div class="kv total"><span>${tx.type === "Cash" ? "Total due at signing" : "Amount financed"}${chosenPkg ? " with " + esc(brand().label + " " + capWord(chosenPkg.suffix)) : ", vehicle only"}</span>
    <span class="num">${money(tx.type === "Cash" ? t.cashDueTotal : t.amountFinanced)}</span></div>`;
  var checkNote = v.errors.length ? `<div class="notice err"><div><strong>Finish these before completing the deal</strong> <span class="tiny">· tap one to go to it</span>
        <ul class="issue-list">${v.issues.map(function(e, i){ return `<li><button type="button" data-act="jump-issue" data-idx="${i}">${esc(e.msg)}</button></li>`; }).join("")}</ul></div></div>`
    : (v.warnings.length ? `<div class="notice warn">${esc(v.warnings[0])}</div>`
    : `<div class="notice ok">Everything checks out. This deal is ready to complete.</div>`);

  var packageCard = `<div class="card" id="step-5"><div class="card-h"><h2>5 · Present &amp; close</h2>
    <div class="sp"><label class="switch"><input type="checkbox" data-act="toggle-payment" ${tx.display.showPayment?"checked":""}> Show payments to customer</label>
      ${tx.type==="Cash" ? "" : `<label class="switch" style="margin-left:14px"><input type="checkbox" data-act="toggle-prices" ${tx.display.showPrices?"checked":""}> Show product prices</label>`}
</div></div>
    <div class="card-b">
      ${payGrid}
      <div class="close-box">
        ${closeSum}
        <div class="close-finish">${checkNote}<button class="btn primary close-go" data-act="complete">${doneRec ? "Update completed deal" : "Complete transaction"}</button></div>
      </div>
    </div></div>`;

  return toolbar + doneBanner + `<div class="fin-split solo">
    <div><div class="stack"><div class="cv-row">${customerCard}${vehicleCard}</div>${financeCard}${productsCard}${offersCard}${packageCard}</div></div></div>`;
}

window.__DCC_VIEW1__ = { state:state, brand:brand, cdThemeStyle:cdThemeStyle, brandInk:brandInk, colorMode:colorMode, hexLum:hexLum, readableOn:readableOn, userById:userById, currentUser:currentUser, isAdmin:isAdmin,
  isMaster:isMaster, roleLabel:roleLabel, isDealOwnerRole:isDealOwnerRole, isFinanceRole:isFinanceRole, isFinanceManager:isFinanceManager, canEditProducts:canEditProducts, ensureOffers:ensureOffers, savedForMe:savedForMe, canUseOffers:canUseOffers, featureOn:featureOn, FM_FEATURES:FM_FEATURES, SM_FEATURES:SM_FEATURES, featureLabel:featureLabel, mixHex:mixHex, storeUsers:storeUsers, fsmUsers:fsmUsers, setPath:setPath, toast:toast, allDeals:allDeals,
  dealsForStore:dealsForStore, dealershipById:dealershipById, setDealership:setDealership, applyFinanceDefaults:applyFinanceDefaults,
  firstFsmFor:firstFsmFor, renderShell:renderShell, viewDashboard:viewDashboard, viewUnderConstruction:viewUnderConstruction,
  renderCustomerDisplay:renderCustomerDisplay, viewFinance:viewFinance, commit:commit, persist:persist,
  channel:channel, selectOptions:selectOptions, kpiCard:kpiCard, lineConfigText:lineConfigText,
  packagesToShow:packagesToShow, STORAGE_KEY:STORAGE_KEY, allowedRouteKeys:allowedRouteKeys, navItems:navItems,
  PRODUCT_ICONS:PRODUCT_ICONS, PACKAGE_ICONS:PACKAGE_ICONS, productIconSvg:productIconSvg };
})();
