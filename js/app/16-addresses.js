"use strict";
/* ---------------- ADDRESSES ----------------
   Every screen has its own link in the address bar (#/401-dixie-nissan/users, #/dealerships), so the
   browser's Back and Forward buttons, bookmarks and refresh all land on the right screen. */
var ROUTE_SLUG = { dashboard:"dashboard", assistant:"ai-assistant", finance:"finance", cashadv:"cash-conversion", sales:"sales-tracker", coupons:"coupons", worksheet:"worksheet",
  products:"products", reports:"reports", users:"users", settings:"settings" };
var SLUG_ROUTE = {}; Object.keys(ROUTE_SLUG).forEach(function(k){ SLUG_ROUTE[ROUTE_SLUG[k]] = k; });
var navSync = { last:null, boot:/^#\/[a-z0-9-]/i.test(location.hash) ? location.hash : null };
function slugify(t){ return String(t || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "store"; }
function storeSlug(d){
  var base = slugify(d.name), twin = state.dealerships.filter(function(x){ return slugify(x.name) === base; }).length > 1;
  return twin ? base + "-" + String(d.id).replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase() : base;
}
function hashForState(){
  if (!state.loggedIn || (state.auth && state.auth.mustChange)) return null;
  if (V.isMaster() && state.ui.hq) return state.route === "hqusers" ? "#/head-office-users" : "#/dealerships";
  if (!state.config) return null;
  return "#/" + storeSlug(state.config) + "/" + (ROUTE_SLUG[state.route] || "dashboard");
}
function syncHash(){
  var h = hashForState();
  if (!h) return;
  if (h !== location.hash){
    try { if (navSync.last === null) history.replaceState(null, "", h); else history.pushState(null, "", h); } catch (e) {}
  }
  navSync.last = h;
}
/* Open a store's Command Center on a given screen (loads its deals first if needed). */
function openStore(id, route){
  var enter = function(){ state.ui.hq = false; state.route = route || "dashboard"; state.ui.railOpen = false; state.ui.userCard = null; window.scrollTo(0, 0); commit(); };
  if (id === state.activeDealershipId && state.config) return ensureStoreDeals(id).then(enter, function(){});
  leaveDeal(function(){
    ensureStoreDeals(id).then(function(){ V.setDealership(id); resetDealUi(); enter(); }, function(){ commit(); });
  }, "switch");
}
/* Read an address and go there. Anything that doesn't match is ignored. */
function routeFromHash(h){
  var m = /^#\/([^/?#]+)(?:\/([^/?#]+))?/.exec(h || "");
  if (!m || !state.loggedIn) return false;
  var a = m[1].toLowerCase(), b = (m[2] || "").toLowerCase();
  if (a === "dealerships" || a === "head-office-users"){
    if (!V.isMaster()) return false;
    state.ui.hq = true; state.route = a === "dealerships" ? "dealerships" : "hqusers"; state.ui.userCard = null; commit(); return true;
  }
  var d = state.dealerships.filter(function(x){ return storeSlug(x) === a || x.id === m[1]; })[0];
  if (!d) return false;
  if (!V.isMaster() && d.id !== state.activeDealershipId) return false;
  var route = SLUG_ROUTE[b] || "dashboard";
  if (d.id !== state.activeDealershipId || state.ui.hq){ openStore(d.id, route); return true; }
  state.route = route; state.ui.userCard = null; commit(); return true;
}
window.addEventListener("popstate", function(){
  if (!state.loggedIn) return;
  navSync.last = location.hash;
  if (!routeFromHash(location.hash)) commit();
});

