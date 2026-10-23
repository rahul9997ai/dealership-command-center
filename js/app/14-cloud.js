"use strict";
/* ---------------- AXIOM LOGIN / LOGOUT ----------------
   Sign-in, sessions and passwords are handled by Supabase Auth; access to
   data is enforced by row-level security in the database. */
var SB_URL = "https://tbptlrewwxhggxxfdiks.supabase.co";
var SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRicHRscmV3d3hoZ2d4eGZkaWtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2OTYzMTksImV4cCI6MjEwNTI3MjMxOX0.lYDOQbBWj4ZEHD2VkBfKtl1mTnSXlIGmkPb2dt6B4lU";
/* Arriving from a password-reset email: the URL carries type=recovery. Remember it before supabase-js clears the hash. */
var RECOVERY = /(^|[#&?])type=recovery/.test(String(location.hash) + String(location.search));
var sb = (window.supabase && window.supabase.createClient) ? window.supabase.createClient(SB_URL, SB_KEY) : null;
state.auth = null;

/* ---------------- CLOUD DATA (Supabase, row-level secured) ----------------
   Dealerships, products and completed deals live in Supabase so every device
   sees the same data, and the database itself only hands each user the rows
   for their own dealership (and, for non-GM roles, their own deals). Local
   storage is just a cache. Every commit() schedules a diff-and-upsert; deletes
   are always explicit so a reopened deal can never be deleted by accident. */
var cloud = { loaded:false, snap:{ d:{}, p:{}, x:{} }, del:{ d:[], p:[], x:[] }, timer:null, running:false, warned:false, lastLoad:0 };
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/;
window.__DCC_CLOUD__ = cloud;
/* exposed for the in-browser test harness only */
setTimeout(function(){ cloud.apply = cloudApply; cloud.diff = cloudDiff; cloud.wipe = cloudWipeLocal; }, 0);

function cloudApply(dRows, pRows, xRows, keepTx){
  var byDealer = {};
  pRows.forEach(function(r){ (byDealer[r.dealership_id] = byDealer[r.dealership_id] || []).push(r.data); });
  Object.keys(byDealer).forEach(function(k){ byDealer[k].sort(function(a, b){ return (a._sort||0) - (b._sort||0); }); });
  state.dealerships = dRows.map(function(r){ var d = r.data; d.id = r.id; return d; });
  state.cloud.productsByDealer = byDealer;
  state.completed = xRows.map(function(r){ return r.data; }).filter(function(x){ return x && x.status !== "Saved"; });
  state.saved = xRows.map(function(r){ return r.data; }).filter(function(x){ return x && x.status === "Saved"; });
  state.history = [];
  state.users = state.users.filter(function(u){ return u.id === "u0" || UUID_RE.test(u.id); });
  cloud.snap = { d:{}, p:{}, x:{} };
  state.dealerships.forEach(function(d){ cloud.snap.d[d.id] = JSON.stringify(d); });
  Object.keys(byDealer).forEach(function(k){ byDealer[k].forEach(function(pr){ cloud.snap.p[k + "|" + pr.id] = JSON.stringify(pr); }); });
  state.completed.concat(state.saved).forEach(function(x){ cloud.snap.x[x.id] = JSON.stringify(x); });
  if (!state.dealerships.length){ state.activeDealershipId = null; state.config = null; state.tx = null; state.products = C.clone(D.PRODUCTS); return; }
  var me = userById(state.currentUserId), has = function(id){ return state.dealerships.some(function(d){ return d.id === id; }); };
  var want = V.isMaster() ? (has(state.activeDealershipId) ? state.activeDealershipId : state.dealerships[0].id)
                          : ((me && has(me.dealershipId)) ? me.dealershipId : state.dealerships[0].id);
  if (keepTx && has(state.activeDealershipId)){
    state.config = state.dealerships.filter(function(d){ return d.id === state.activeDealershipId; })[0];
    state.products = byDealer[state.activeDealershipId] || (byDealer[state.activeDealershipId] = []);
    return;
  }
  state.activeDealershipId = null;
  V.setDealership(want);
}
/* The database hands back at most 1,000 rows per request, so every list is read in pages. */
var CLOUD_PAGE = 1000;
function fetchAllRows(make){
  var out = [];
  var page = function(from){
    return make().range(from, from + CLOUD_PAGE - 1).then(function(r){
      if (r.error) throw r.error;
      var rows = r.data || [];
      out = out.concat(rows);
      return rows.length === CLOUD_PAGE ? page(from + CLOUD_PAGE) : out;
    });
  };
  return page(0);
}
function fetchDeals(ids){
  if (ids && !ids.length) return Promise.resolve([]);
  return fetchAllRows(function(){ var q = sb.from("deals").select("*").order("id"); return ids ? q.in("dealership_id", ids) : q; });
}
/* A Master can see every store's deals, so they're loaded one store at a time as stores are opened.
   Everyone else is limited to their own store by the database, so they get everything they can see.
   dealIds: null = everything allowed; [] = no deals; [ids] = those stores only. */
function cloudFetch(dealIds){
  return Promise.all([
    fetchAllRows(function(){ return sb.from("dealerships").select("*").order("id"); }),
    fetchAllRows(function(){ return sb.from("products").select("*").order("dealership_id").order("id"); }),
    fetchDeals(dealIds)
  ]).then(function(rs){ return { d:rs[0], p:rs[1], x:rs[2] }; });
}
/* Which deals this browser currently holds: null = all it may see, otherwise the loaded stores. */
function dealScope(){ return (!V.isMaster() || cloud.dealsAll) ? null : Object.keys(cloud.dealsFor || {}); }
/* Swap in fresh deal rows for the given stores (null = all), keeping the sync snapshot in step. */
function cloudMergeDeals(rows, ids){
  var inScope = function(x){ return !ids || ids.indexOf(x.dealershipId) !== -1; };
  state.completed = (state.completed || []).filter(function(x){ return x && !inScope(x); });
  state.saved = (state.saved || []).filter(function(x){ return x && !inScope(x); });
  Object.keys(cloud.snap.x).forEach(function(k){ var j = cloud.snap.x[k]; try { if (inScope(JSON.parse(j))) delete cloud.snap.x[k]; } catch (e) {} });
  rows.forEach(function(r){
    var x = r.data; if (!x) return;
    (x.status === "Saved" ? state.saved : state.completed).push(x);
    cloud.snap.x[x.id] = JSON.stringify(x);
  });
}
/* Make sure a store's deals are here before it opens (Master only; instant if already loaded). */
function ensureStoreDeals(id){
  if (!sb || !cloud.loaded || !V.isMaster() || cloud.dealsAll || (cloud.dealsFor && cloud.dealsFor[id])) return Promise.resolve();
  toast("Opening the dealership…","info");
  return fetchDeals([id]).then(function(rows){
    cloudMergeDeals(rows, [id]); cloud.dealsFor = cloud.dealsFor || {}; cloud.dealsFor[id] = 1;
  }, function(){ toast("Couldn't load this dealership's deals. Check the connection and try again.","err"); throw new Error("deals"); });
}
/* Reports across every dealership need every store's deals. */
function ensureAllDeals(){
  if (!sb || !cloud.loaded || cloud.dealsAll) return Promise.resolve();
  if (cloud.allLoading) return cloud.allLoading;
  cloud.allLoading = fetchDeals(null).then(function(rows){
    cloudMergeDeals(rows, null); cloud.dealsAll = true; cloud.allLoading = null;
  }, function(){ cloud.allLoading = null; toast("Couldn't load every dealership's deals. Try again.","err"); });
  return cloud.allLoading;
}
/* This month's completed deals per store, for the Dealerships cards (a light count, not the deals). */
function loadMonthCounts(){
  var month = C.todayISO().slice(0,7);
  if (!sb || !cloud.loaded) return;
  if (cloud.monthCounts && cloud.monthCounts.month === month && Date.now() - cloud.monthCounts.at < 60000) return;
  if (cloud.countsLoading) return;
  cloud.countsLoading = true;
  fetchAllRows(function(){ return sb.from("deals").select("id,dealership_id").gte("data->>createdAt", month + "-01").neq("data->>status", "Saved").order("id"); })
    .then(function(rows){
      var c = {}; rows.forEach(function(r){ c[r.dealership_id] = (c[r.dealership_id] || 0) + 1; });
      cloud.monthCounts = { month:month, at:Date.now(), by:c }; cloud.countsLoading = false; commit();
    }, function(){ cloud.countsLoading = false; });
}
/* A brand-new cloud has nothing in it. If the master administrator signs in on
   the browser that already holds the dealerships they built before the cloud
   existed, move all of it up once. */
function cloudMigrate(){
  var dl = state.dealerships.filter(function(d){ return d && d.id; });
  var dRows = dl.map(function(d){ return { id:d.id, name:d.name || "Dealership", active:d.active !== false, data:d }; });
  var pRows = [];
  dl.forEach(function(d){
    var list = state.cloud.productsByDealer[d.id] || state.products;
    list.forEach(function(pr, i){ pr._sort = i; pRows.push({ dealership_id:d.id, id:pr.id, data:pr }); });
  });
  var ids = {}; dl.forEach(function(d){ ids[d.id] = 1; });
  var xRows = state.completed.filter(function(x){ return x && x.id && ids[x.dealershipId]; })
    .map(function(x){ return { id:x.id, dealership_id:x.dealershipId, fsm_user_id:x.fsmUserId || null, data:x }; });
  return sb.from("dealerships").upsert(dRows).then(function(r){ if (r.error) throw r.error;
    return pRows.length ? sb.from("products").upsert(pRows) : { error:null }; }).then(function(r){ if (r.error) throw r.error;
    return xRows.length ? sb.from("deals").upsert(xRows) : { error:null }; }).then(function(r){ if (r.error) throw r.error;
    toast("Your existing dealerships and deals were moved to the cloud.","ok"); });
}
function cloudLoad(){
  var master = V.isMaster(), first = master ? [] : null;
  cloud.dealsFor = {}; cloud.dealsAll = !master; cloud.monthCounts = null;
  return cloudFetch(first).then(function(r){
    if (!r.d.length && master && state.dealerships.length) return cloudMigrate().then(function(){ return cloudFetch(first); });
    return r;
  }).then(function(r){
    cloudApply(r.d, r.p, r.x, false);
    cloud.loaded = true; cloud.lastLoad = Date.now();
    /* A Master starts with only the store that's open. */
    if (master && state.activeDealershipId){
      var id = state.activeDealershipId;
      return fetchDeals([id]).then(function(rows){ cloudMergeDeals(rows, [id]); cloud.dealsFor[id] = 1; });
    }
  });
}
function cloudDiff(){
  if (state.activeDealershipId && state.dealerships.some(function(d){ return d.id === state.activeDealershipId; }))
    state.cloud.productsByDealer[state.activeDealershipId] = state.products;
  var out = { d:[], p:[], x:[], snapD:{}, snapP:{}, snapX:{} };
  state.dealerships.forEach(function(d){
    var j = JSON.stringify(d);
    if (cloud.snap.d[d.id] !== j){ out.d.push({ id:d.id, name:d.name || "Dealership", active:d.active !== false, data:d }); out.snapD[d.id] = j; }
  });
  var known = {}; state.dealerships.forEach(function(d){ known[d.id] = 1; });
  Object.keys(state.cloud.productsByDealer).forEach(function(k){
    if (!known[k]) return;
    state.cloud.productsByDealer[k].forEach(function(pr, i){
      pr._sort = i;
      var j = JSON.stringify(pr), key = k + "|" + pr.id;
      if (cloud.snap.p[key] !== j){ out.p.push({ dealership_id:k, id:pr.id, data:pr }); out.snapP[key] = j; }
    });
  });
  state.completed.concat(state.saved || []).forEach(function(x){
    if (!x || !x.id || !known[x.dealershipId]) return;
    var j = JSON.stringify(x);
    if (cloud.snap.x[x.id] !== j){ out.x.push({ id:x.id, dealership_id:x.dealershipId, fsm_user_id:x.fsmUserId || null, data:x }); out.snapX[x.id] = j; }
  });
  return out;
}
function cloudHasWork(df){ return df.d.length || df.p.length || df.x.length || cloud.del.d.length || cloud.del.p.length || cloud.del.x.length; }
function cloudPush(){
  if (!cloud.loaded || !state.loggedIn || !sb) return Promise.resolve(true);
  if (cloud.hold) return Promise.resolve(true);
  if (cloud.running){ cloudSchedule(); return Promise.resolve(false); }
  var df = cloudDiff();
  if (!cloudHasWork(df)) return Promise.resolve(true);
  cloud.running = true;
  var dels = cloud.del; cloud.del = { d:[], p:[], x:[] };
  function chk(r){ if (r && r.error) throw r.error; return r; }
  var chain = Promise.resolve();
  if (df.d.length) chain = chain.then(function(){ return sb.from("dealerships").upsert(df.d).then(chk); });
  if (df.p.length) chain = chain.then(function(){ return sb.from("products").upsert(df.p).then(chk); });
  if (df.x.length) chain = chain.then(function(){ return sb.from("deals").upsert(df.x).then(chk); });
  dels.p.forEach(function(k){ chain = chain.then(function(){ return sb.from("products").delete().eq("dealership_id", k.dealer).eq("id", k.id).then(chk); }); });
  if (dels.x.length) chain = chain.then(function(){ return sb.from("deals").delete().in("id", dels.x).then(chk); });
  dels.d.forEach(function(id){
    chain = chain.then(function(){ return sb.from("products").delete().eq("dealership_id", id).then(chk); })
      .then(function(){ return sb.from("deals").delete().eq("dealership_id", id).then(chk); })
      .then(function(){ return sb.from("dealerships").delete().eq("id", id).then(chk); });
  });
  return chain.then(function(){
    for (var k in df.snapD) cloud.snap.d[k] = df.snapD[k];
    for (var k2 in df.snapP) cloud.snap.p[k2] = df.snapP[k2];
    for (var k3 in df.snapX) cloud.snap.x[k3] = df.snapX[k3];
    cloud.running = false; cloud.warned = false; return true;
  }, function(e){
    cloud.running = false;
    cloud.del.d = dels.d.concat(cloud.del.d); cloud.del.p = dels.p.concat(cloud.del.p); cloud.del.x = dels.x.concat(cloud.del.x);
    if (!cloud.warned){ cloud.warned = true; toast("Couldn't save your latest changes to the cloud — will retry. (" + (e.message || "network") + ")","err"); }
    setTimeout(cloudSchedule, 8000);
    return false;
  });
}
function cloudSchedule(){
  if (!cloud.loaded || !state.loggedIn || !sb) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(function(){ cloud.timer = null; cloudPush(); }, 900);
}
window.__DCC_CLOUD_PUSH__ = cloudSchedule;
/* Pick up changes made on other devices when the tab comes back into focus —
   but never while this browser has unsaved changes of its own. */
document.addEventListener("visibilitychange", function(){
  if (document.visibilityState !== "visible" || !cloud.loaded || !state.loggedIn || cloud.running || cloud.timer) return;
  if (Date.now() - cloud.lastLoad < 45000) return;
  if (cloudHasWork(cloudDiff())) return;
  cloudFetch(dealScope()).then(function(r){ cloudApply(r.d, r.p, r.x, true); cloud.lastLoad = Date.now(); cloud.monthCounts = null; commit(); }, function(){});
});
function cloudWipeLocal(){
  state.dealerships = []; state.completed = []; state.saved = []; state.history = []; state.customers = []; state.vehicles = [];
  state.products = C.clone(D.PRODUCTS); state.cloud.productsByDealer = {};
  state.users = state.users.filter(function(u){ return u.id === "u0"; });
  state.tx = null; state.config = null; state.activeDealershipId = null; state.currentUserId = "u0";
  cloud.snap = { d:{}, p:{}, x:{} }; cloud.del = { d:[], p:[], x:[] }; cloud.loaded = false;
}
/* End a session: save anything pending first, then clear the cached business
   data so the next person on this computer can never see it. If saving fails
   the cache is kept so nothing is lost. */
function endSession(msg){
  clearTimeout(cloud.timer); cloud.timer = null;
  storeDraft(false); resume = null;   /* a named deal in progress goes to Saved deals before the local copy is cleared */
  var flush = cloud.loaded ? cloudPush() : Promise.resolve(true);
  return flush.then(function(ok){
    var done = function(){
      if (ok && cloud.loaded) cloudWipeLocal();
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
      state.loggedIn = false; state.auth = null; state.ui.welcome = null; state.ui.tour = null; state.ui.authChecking = false;
      state.ui.loginError = msg || null; commit();
    };
    return sb ? sb.auth.signOut().then(done, done) : (done(), null);
  });
}

function upsertProfileUser(p){
  var isSp = p.role === "Salesperson";
  var ccOn = p.cc_enabled !== false && !isSp, pulseOn = p.pulse_enabled !== false;
  var ccType = p.cc_access_type || p.access_type, ccExp = p.cc_expires_at !== undefined ? p.cc_expires_at : p.expires_at;
  var rec = { id:p.id, name:p.name, role:(p.role === "FSM Manager" ? "FSM" : p.role), email:p.email, username:p.username || null, dealershipId:p.dealership_id || null,
    /* "active" is per app: Dealership Command staff by their Dealership Command access, Salespeople (Pulse only) by their Pulse access. */
    active: isSp ? pulseOn : ccOn, ccOn:ccOn, pulseOn:pulseOn,
    demo:ccType === "demo", expiresAt:ccExp || null,
    mustChange:!!p.must_change_password, onboarded:!!p.onboarded, accessDays:null, restrictions:[],
    initials:String(p.name||"?").split(/\s+/).map(function(w){ return w[0]; }).join("").slice(0,2).toUpperCase() };
  var ex = state.users.filter(function(u){ return u.id === p.id; })[0];
  if (ex){ for (var k in rec) ex[k] = rec[k]; } else state.users.push(rec);
}
function adminCall(body){
  return sb.auth.getSession().then(function(r){
    var sess = r.data && r.data.session;
    if (!sess) throw new Error("You're signed out — sign in again.");
    return fetch(SB_URL + "/functions/v1/admin-users", { method:"POST",
      headers:{ "Content-Type":"application/json", "apikey":SB_KEY, "Authorization":"Bearer " + sess.access_token },
      body:JSON.stringify(body) });
  }).then(function(res){
    return res.json().then(function(j){ if (!res.ok || j.error) throw new Error(j.error || ("Error " + res.status)); return j; });
  });
}
function refreshUsers(){
  if (!sb || !(V.isAdmin() || V.currentUser().role === "FSM")) return;
  adminCall({ action:"list" }).then(function(r){ (r.users || []).forEach(upsertProfileUser); commit(); }).catch(function(){});
}
function failLogin(msg){ return endSession(msg); }
function finishEnter(u){
  if (state.dealerships.length){
    if (u.dealershipId && state.dealerships.some(function(d){ return d.id === u.dealershipId; })) V.setDealership(u.dealershipId);
    else V.setDealership(state.dealerships[0].id);
  }
  state.route = (u.role === "Master Administrator" || u.role === "General Manager") ? "dashboard" : "finance";
  state.ui.hq = u.role === "Master Administrator";
  if (state.ui.hq) state.route = "dealerships";
  if (state.tx && !V.isAdmin()) state.tx.fsmUserId = u.id;
  var resumed = resumeSession(u), who = String(state.tx && state.tx.customer.name || "").trim();
  var isDemo = !!(state.auth && state.auth.accessType === "demo"), isFirst = !!(state.auth && !state.auth.onboarded);
  state.ui.welcome = (isDemo || isFirst) ? { demo:isDemo, first:isFirst } : null;
  toast(resumed ? "Welcome back. " + (who ? who + "'s deal is" : "Your open deal is") + " back on screen."
    : "Welcome back, " + String(u.name||"").split(" ")[0] + ".","ok");
  refreshUsers();
  if (!state.ui.welcome) maybeStartTour();
  navSync.last = null;
  if (navSync.boot){ var bootLink = navSync.boot; navSync.boot = null; if (routeFromHash(bootLink)) return; }
  commit();
}
function loadProfileAndEnter(){
  return sb.auth.getUser().then(function(r){
    var user = r.data && r.data.user;
    if (!user) return failLogin(null);
    return sb.from("profiles").select("*").eq("id", user.id).single().then(function(pr){
      var p = pr.data;
      if (!p || !p.active) return failLogin("This account isn't active. Contact your administrator.");
      var ccOn = p.cc_enabled !== false && p.role !== "Salesperson";
      var ccType = p.cc_access_type || p.access_type, ccExp = p.cc_expires_at !== undefined ? p.cc_expires_at : p.expires_at;
      if (!ccOn) return failLogin(p.role === "Salesperson" || p.pulse_enabled !== false
        ? "This account doesn't have Dealership Command access. Sign in to Mahan-EX Pulse instead, or ask your administrator."
        : "This account isn't active. Contact your administrator.");
      if (ccType === "demo" && ccExp && new Date(ccExp) <= new Date())
        return failLogin("Your Dealership Command demo access has expired. Contact your administrator.");
      state.auth = { mustChange:!!p.must_change_password || RECOVERY, accessType:ccType, expiresAt:ccExp, onboarded:!!p.onboarded };
      upsertProfileUser(p);
      state.currentUserId = p.id;
      return cloudLoad().then(function(){
        state.loggedIn = true; state.ui.loginError = null; state.ui.authChecking = false;
        if (!p.must_change_password && !RECOVERY) finishEnter(userById(p.id)); else commit();
      }, function(e){
        return endSession("Couldn't load your dealership data (" + (e && e.message ? e.message : "network problem") + "). Please try again.");
      });
    });
  });
}
function doLogin(){
  var emailEl = document.getElementById("loginEmail"), pwEl = document.getElementById("loginPassword");
  var email = emailEl ? emailEl.value.trim().toLowerCase() : "";
  var pw = pwEl ? pwEl.value : "";
  if (!email || !pw){ state.ui.loginError = "Enter your email and password."; commit(); return; }
  if (!sb){ state.ui.loginError = "The sign-in service couldn't load. Check your connection and refresh."; commit(); return; }
  var remEl = document.getElementById("loginRemember");
  try { localStorage.setItem("axiom_remember", remEl && !remEl.checked ? "0" : "1"); sessionStorage.setItem("axiom_active", "1"); } catch (e) {}
  sb.auth.signInWithPassword({ email:email, password:pw }).then(function(r){
    if (r.error){
      state.ui.loginError = /invalid login|banned|not found/i.test(r.error.message) ? "That email and password don't match an active account." : r.error.message;
      commit(); return;
    }
    return loadProfileAndEnter();
  });
}
function doLogout(){ endSession(null); }
function doChangePassword(){
  var a = document.getElementById("newPw"), b = document.getElementById("newPw2");
  var pw = a ? a.value : "", pw2 = b ? b.value : "";
  if (pw.length < 8){ state.ui.pwError = "Use at least 8 characters."; commit(); return; }
  if (pw !== pw2){ state.ui.pwError = "The two passwords don't match."; commit(); return; }
  sb.auth.updateUser({ password:pw }).then(function(r){
    if (r.error){ state.ui.pwError = r.error.message; commit(); return; }
    return sb.rpc("clear_must_change_password").then(function(){
      RECOVERY = false; state.auth.mustChange = false; state.ui.pwError = null;
      finishEnter(userById(state.currentUserId));
    });
  });
}
function authInit(){
  state.loggedIn = false;
  if (!sb) return;
  state.ui.authChecking = true;
  /* "Remember me" unticked = the session lasts only until the browser is closed. */
  var forget = false;
  try { forget = !RECOVERY && localStorage.getItem("axiom_remember") === "0" && !sessionStorage.getItem("axiom_active"); } catch (e) {}
  sb.auth.getSession().then(function(r){
    if (r.data && r.data.session && forget) return sb.auth.signOut().then(function(){ state.ui.authChecking = false; commit(); });
    if (r.data && r.data.session){ try { sessionStorage.setItem("axiom_active", "1"); } catch (e) {} return loadProfileAndEnter(); }
    state.ui.authChecking = false; commit();
  }, function(){ state.ui.authChecking = false; commit(); });
}
function fmtRemaining(ms){
  var t = Math.max(0, Math.floor(ms/1000)), d = Math.floor(t/86400), h = Math.floor(t%86400/3600), m = Math.floor(t%3600/60), sec = t%60;
  function z(n){ return (n<10?"0":"") + n; }
  return (d ? d + "d " : "") + z(h) + ":" + z(m) + ":" + z(sec);
}
function fmtExpiry(iso){
  try { return new Date(iso).toLocaleString("en-CA", { dateStyle:"full", timeStyle:"short" }); } catch (e) { return String(iso); }
}
setInterval(function(){
  var a = state.auth;
  if (!state.loggedIn || !a || a.accessType !== "demo" || !a.expiresAt) return;
  var ms = new Date(a.expiresAt).getTime() - Date.now();
  if (ms <= 0){ failLogin("Your demo access has expired."); return; }
  var el = document.getElementById("demoTimer"); if (el) el.textContent = fmtRemaining(ms);
  var el2 = document.getElementById("welcomeTimer"); if (el2) el2.textContent = fmtRemaining(ms);
}, 1000);
function renderChangePassword(){
  var err = state.ui.pwError;
  return axLanding(`<div class="axl-card">
      <h2>${RECOVERY ? "Reset your password" : "Create your password"}</h2>
      <p class="axl-sub">${RECOVERY ? "Choose a new password for your account." : "You signed in with a temporary password. Choose your own to continue."}</p>
      ${err ? `<div class="axl-err" role="alert">${esc(err)}</div>` : ""}
      <div class="axl-field">${axi("lock")}<input type="password" id="newPw" placeholder="New password (8+ characters)" autocomplete="new-password" aria-label="New password"></div>
      <div class="axl-field">${axi("lock")}<input type="password" id="newPw2" placeholder="Confirm password" autocomplete="new-password" aria-label="Confirm password"></div>
      <button type="button" class="axl-btn" data-act="do-change-password">Save and continue</button>
      <div class="axl-row" style="justify-content:center;margin:16px 0 0"><a class="axl-link" data-act="logout">Sign out</a></div>
    </div>`);
}
function demoChip(){
  var a = state.auth;
  if (!state.loggedIn || !a || a.accessType !== "demo" || a.mustChange || !a.expiresAt) return "";
  return `<div class="demo-chip" title="Demo access ends ${esc(fmtExpiry(a.expiresAt))}"><span class="dc-dot"></span>
    <span class="dc-lbl">Demo access</span><span class="dc-time" id="demoTimer">${fmtRemaining(new Date(a.expiresAt).getTime() - Date.now())}</span></div>`;
}
function demoNoticeModal(){
  var w = state.ui.welcome, a = state.auth;
  if (!w || !a) return "";
  var first = String((userById(state.currentUserId).name) || "").split(" ")[0] || "there";
  var demoBlock = w.demo ? `<div class="wc-expiry"><div class="lbl">Your demo access expires</div>
      <div class="big">${esc(fmtExpiry(a.expiresAt))}</div>
      <div class="wc-count"><span class="muted small">Time remaining</span><span class="wc-timer" id="welcomeTimer">${fmtRemaining(new Date(a.expiresAt).getTime() - Date.now())}</span></div></div>
    <p class="small muted">A countdown stays at the top of your screen and you'll be signed out automatically when it reaches zero. Need more time? Ask your administrator.</p>` : "";
  var themeBlock = w.first ? `<div class="wc-theme"><div class="lbl">Choose how Mahan-EX looks</div>
      <div class="wc-themes">
        <button type="button" class="wc-tile ${state.ui.theme==="dark"?"on":""}" data-act="set-theme" data-theme="dark"><span class="sw sw-dark"><i></i><i></i></span>Dark</button>
        <button type="button" class="wc-tile ${state.ui.theme!=="dark"?"on":""}" data-act="set-theme" data-theme="light"><span class="sw sw-light"><i></i><i></i></span>Normal</button>
      </div><div class="tiny muted">You can change this any time from the top bar.</div></div>` : "";
  return `<div class="welcome-bg"><div class="welcome-card">
    <div class="wc-glow"></div>
    ${w.demo ? `<div class="wc-badge"><span class="dc-dot"></span>Demo access</div>` : `<div class="wc-badge wc-badge-ok">Mahan-EX</div>`}
    <h2>Welcome, ${esc(first)}</h2>
    <p class="wc-lead">${w.demo ? "You're exploring Mahan-EX with the full functionality of your role. Everything you build here is yours to try." : "Your account is ready. Let's get you set up in a few seconds."}</p>
    ${themeBlock}${demoBlock}
    <button class="btn primary wc-btn" data-act="demo-ack">${w.first ? "Continue" : "Continue to Mahan-EX"}</button>
  </div></div>`;
}
var WHEEL_H = 44;
var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function wheelYears(){ var y = new Date().getFullYear(), o = []; for (var i=0;i<5;i++) o.push(y+i); return o; }
function wheelDate(sel){
  var yrs = wheelYears(), y = yrs[sel.yr] || yrs[0], m = sel.mo;
  var dim = new Date(y, m+1, 0).getDate(), d = Math.min(sel.day+1, dim);
  var h = ((sel.hr+1) % 12) + (sel.ap ? 12 : 0);
  return new Date(y, m, d, h, sel.mi*5, 0, 0);
}
function defaultWheelSel(baseMs){
  var yrs = wheelYears(), base = new Date(baseMs), h24 = base.getHours();
  return { mo:base.getMonth(), day:base.getDate()-1, yr:Math.max(0, yrs.indexOf(base.getFullYear())),
    hr:((h24 % 12) || 12) - 1, mi:Math.round(base.getMinutes()/5) % 12, ap:h24 >= 12 ? 1 : 0 };
}
function wheelPicker(sel, setName){
  var yrs = wheelYears();
  function wheel(key, items, idx){
    return `<div class="wheel" data-wheel="${key}" data-idx="${idx}"><div class="wheel-pad"></div>${items.map(function(t, k){
      return `<div class="wi ${k===idx?"on":""}">${t}</div>`; }).join("")}<div class="wheel-pad"></div></div>`;
  }
  var days = []; for (var d=1; d<=31; d++) days.push(d);
  var hrs = []; for (var h=1; h<=12; h++) hrs.push(h);
  var mins = []; for (var m=0; m<60; m+=5) mins.push((m<10?"0":"")+m);
  return `<div data-wheelset="${setName}">
    <div class="wheel-summary"><div class="lbl">Expires</div><div class="big" id="wheelSummary">${esc(fmtExpiry(wheelDate(sel).toISOString()))}</div></div>
    <div class="wheel-heads"><span style="flex:1.6">Month</span><span>Day</span><span style="flex:1.3">Year</span><span class="gap"></span><span>Hour</span><span>Min</span><span></span></div>
    <div class="wheels">
      <div class="wheel-band"></div>
      ${wheel("mo", MONTHS, sel.mo).replace('class="wheel"','class="wheel" style="flex:1.6"')}
      ${wheel("day", days, sel.day)}
      ${wheel("yr", yrs, sel.yr).replace('class="wheel"','class="wheel" style="flex:1.3"')}
      <span class="wheel-gap"></span>
      ${wheel("hr", hrs, sel.hr)}
      ${wheel("mi", mins, sel.mi)}
      ${wheel("ap", ["AM","PM"], sel.ap)}
    </div></div>`;
}
function genTempPassword(){
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", out = "", a = new Uint32Array(12);
  (window.crypto || window.msCrypto).getRandomValues(a);
  for (var i=0;i<12;i++) out += chars[a[i] % chars.length];
  return out;
}
var inviteSecret = null;
function inviteMessage(i){
  return ["Hi " + i.first + ",", "", "You've been given access to Mahan-EX Dealership Command.", "", "Sign in: " + i.url, "Email: " + i.email,
    "Temporary password: " + i.password, "", "You'll choose your own password the first time you sign in."].join(String.fromCharCode(10));
}
function inviteModal(){
  var i = inviteSecret;
  if (!i) return "";
  var intro = i.setOwn
    ? (i.emailed ? `An invite was emailed to <strong>${esc(i.email)}</strong> with a button to set their own password. Some company mail systems hold new senders in junk or quarantine, so if it doesn't show up, ask them to check there. You can also use <strong>Reset password</strong> on their row to make a temporary password you can share yourself.`
                 : `The invite email couldn't be sent. Use <strong>Reset password</strong> on ${esc(i.first)}'s row to make a temporary password you can share yourself.`)
    : (i.emailed ? `An email with a <strong>Set your password</strong> link was sent to <strong>${esc(i.email)}</strong>. Some company mail systems hold new senders in junk or quarantine, so if it doesn't show up, share the details below yourself.`
                 : `The email couldn't be sent, so share these details with ${esc(i.first)} yourself.`);
  var details = i.setOwn ? "" : `<div class="notice info" style="display:block;line-height:1.7">
        <div><span class="muted small">Sign in</span><br><strong>${esc(i.url)}</strong></div>
        <div style="margin-top:6px"><span class="muted small">Email</span><br><strong>${esc(i.email)}</strong></div>
        <div style="margin-top:6px"><span class="muted small">Temporary password</span><br><strong style="font-family:Consolas,Menlo,monospace;letter-spacing:.04em">${esc(i.password)}</strong></div></div>
      <div style="margin-top:12px"><button class="btn" data-act="invite-copy">Copy message</button></div>
      <p class="tiny muted" style="margin:10px 0 0">They'll be asked to choose their own password the first time they sign in.</p>`;
  return `<div class="modal-bg" data-act="invite-close"><div class="modal" style="max-width:520px">
    <div class="modal-h"><h2>${esc(i.title)}</h2><div class="sp"><button class="btn primary" data-act="invite-close">Done</button></div></div>
    <div class="modal-b"><p style="margin-top:0">${intro}</p>${details}</div></div></div>`;
}
function historyModal(){
  var h = state.ui.history;
  if (!h) return "";
  var label = { INSERT:"Created", UPDATE:"Changed", DELETE:"Deleted" };
  var body = h.loading ? `<p class="muted">Loading…</p>` : h.error ? `<div class="notice err">${esc(h.error)}</div>`
    : !h.rows.length ? `<p class="muted">No recorded changes for this deal yet. History is kept from the moment it was turned on.</p>`
    : `<div class="tablewrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${h.rows.map(function(x){
        return `<tr><td class="nowrap">${esc(new Date(x.changed_at).toLocaleString("en-CA",{dateStyle:"medium",timeStyle:"short"}))}</td><td>${esc(x.actor_name || "—")}</td><td>${esc(label[x.action] || x.action)}</td></tr>`; }).join("")}</tbody></table></div>`;
  return `<div class="modal-bg" data-act="history-close"><div class="modal" style="max-width:560px">
    <div class="modal-h"><h2>Deal ${esc(h.id)} — history</h2><div class="sp"><button class="btn primary" data-act="history-close">Close</button></div></div>
    <div class="modal-b">${body}</div></div></div>`;
}
function resetPwModal(){
  var f = state.ui.pwReset;
  if (!f) return "";
  var u = userById(f.id), canMail = u.role !== "Salesperson" && u.email && !/@pulse\.local$/.test(u.email);
  return `<div class="modal-bg" data-act="close-modal-bg"><div class="modal" style="max-width:480px">
    <div class="modal-h"><h2>Reset password</h2><div class="sp">
      <button class="btn" data-act="pwreset-cancel">Cancel</button>
      <button class="btn primary" data-act="pwreset-save">Set password</button></div></div>
    <div class="modal-b">
      <p style="margin-top:0"><strong>${esc(u.name)}</strong> will use this temporary password and choose their own the next time they sign in.</p>
      <label class="f"><span>Temporary password (at least 8 characters)</span>
        <div class="inline" style="gap:8px"><input type="text" id="pwResetVal" value="${esc(f.value || "")}" autocomplete="off" spellcheck="false"><button type="button" class="btn sm" data-act="pwreset-gen">Generate</button></div></label>
      <label class="switch" style="margin-top:10px"><input type="checkbox" id="pwResetMail" ${canMail ? "checked" : "disabled"}> Email a set-your-password link to ${canMail ? esc(u.email) : "them (not available for this account)"}</label>
    </div></div></div>`;
}
function extendModal(){
  var f = state.ui.extendForm;
  if (!f) return "";
  var u = userById(f.id), yrs = wheelYears();
  if (!f.sel) f.sel = defaultWheelSel(Math.max(Date.now(), u.expiresAt ? new Date(u.expiresAt).getTime() : 0) + 7*86400000);
  return `<div class="modal-bg" data-act="close-modal-bg"><div class="modal" style="max-width:460px">
    <div class="modal-h"><h2>Extend demo</h2><div class="sp">
      <button class="btn" data-act="extend-cancel">Cancel</button>
      <button class="btn primary" data-act="extend-save">Save new expiry</button></div></div>
    <div class="modal-b">
      <p style="margin-bottom:4px"><strong>${esc(u.name)}</strong>${u.expiresAt ? ` currently expires <strong>${esc(fmtExpiry(u.expiresAt))}</strong>` : ""}</p>
      ${wheelPicker(f.sel, "extend")}
      <p class="tiny muted" style="margin-top:10px">Scroll each column to choose. The demo ends at exactly this date and time.</p>
    </div></div></div>`;
}
function initWheels(){
  Array.prototype.forEach.call(document.querySelectorAll(".wheel"), function(w){
    w.scrollTop = Number(w.getAttribute("data-idx")) * WHEEL_H;
  });
}
document.addEventListener("scroll", function(ev){
  var w = ev.target;
  if (!w || !w.classList || !w.classList.contains("wheel")) return;
  var set = w.closest ? w.closest("[data-wheelset]") : null;
  var sel = !set ? null : (set.getAttribute("data-wheelset") === "invite" ? state.ui.inviteSel : (state.ui.extendForm && state.ui.extendForm.sel));
  if (!sel) return;
  var idx = Math.max(0, Math.min(w.querySelectorAll(".wi").length - 1, Math.round(w.scrollTop / WHEEL_H)));
  sel[w.getAttribute("data-wheel")] = idx;
  w.setAttribute("data-idx", idx);
  Array.prototype.forEach.call(w.querySelectorAll(".wi"), function(it, k){ it.classList.toggle("on", k === idx); });
  var sm = document.getElementById("wheelSummary");
  if (sm) sm.textContent = fmtExpiry(wheelDate(sel).toISOString());
}, true);

