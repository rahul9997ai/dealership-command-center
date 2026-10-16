"use strict";
/* ---------------- SALES TRACKER (Phase 1) ----------------
   The sales log, Sales performance (the sales managers' sheet, done automatically), Today, and
   monthly targets with selling days. Everything is typed in here: nothing comes from the Finance
   deals. Stored in sales_log / sales_targets, one store at a time; only Master, the store's GM and
   its Sales Managers can read or change it (enforced by the database). */
var ST = stFresh(null);
function stFresh(store){
  return { store:store, deals:{}, months:{}, loading:{}, targets:{}, targetsLoaded:{}, view:"today", month:null, perf:"month",
    f:{ type:"all", status:"all", sp:"all", q:"" }, edit:null, editErr:null, saving:false, modal:null, tDraft:null, tDirty:false, err:null };
}
var ST_LABEL = { pending:"Pending", approved:"Approved", scheduled:"Sch. delivery", delivered:"Delivered", rdr:"Del / scanned",
  carry:"Carry over", declined:"Declined", cancelled:"Cancelled" };
var ST_STEPS = ["pending","approved","scheduled","delivered","rdr"];
var ST_OTHER = ["carry","declined","cancelled"];
var ST_LEAD = ["Walk in","E-Lead","Phone","Referral","Mobile","Repeat","Other"];
var ST_STOCK = ["Internal","Trade in","Lease return","Rental","Customer purchase","Auction / TradeRev","Dealer trade","M unit","BDC","Other"];
var ST_FLAGS = [["appt","Appointment"],["trade","Trade-in"],["secondTO","2nd turnover"],["secPack","Security pack"],["tire","Tire & wheel"],["posted","Posted"]];
var ST_HUES = ["#2563eb","#0f766e","#7c3aed","#dc2626","#d97706","#0891b2","#db2777","#4d7c0f","#9333ea","#0369a1"];

function stCan(){ var r = V.currentUser().role; return r === "Master Administrator" || r === "General Manager" || r === "Sales Manager"; }
function stToday(){ return C.todayISO(); }
function stShift(month, n){ var d = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1, 12); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }
function stMonthName(month){ return new Date(+month.slice(0, 4), +month.slice(5, 7) - 1, 1, 12).toLocaleDateString("en-CA", { month:"long", year:"numeric" }); }
function stDay(iso){ return iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-CA", { month:"short", day:"numeric" }) : ""; }
function stNum(v){ var n = parseFloat(String(v === null || v === undefined ? "" : v).replace(/[$,\s]/g, "")); return isNaN(n) ? null : n; }
function stKey(n){ return String(n || "").trim().toUpperCase(); }
function stF(n){ return n === null || n === undefined ? "—" : (Math.round(n * 10) / 10 % 1 ? (Math.round(n * 10) / 10).toFixed(1) : String(Math.round(n))); }
function stSync(){ if (ST.store !== state.activeDealershipId) ST = stFresh(state.activeDealershipId); if (!ST.month) ST.month = stToday().slice(0, 7); }
function stAllDeals(){ return Object.keys(ST.deals).map(function(k){ return ST.deals[k]; }); }

/* ---- loading and saving ---- */
function stOnline(){ return typeof sb !== "undefined" && !!sb && typeof cloud !== "undefined" && cloud.loaded; }
function stLoad(month){
  if (ST.months[month] || ST.loading[month]) return;
  if (!stOnline()){ ST.months[month] = true; ST.targetsLoaded[month] = true; return; }
  ST.loading[month] = true;
  var store = ST.store, from = month + "-01", to = stShift(month, 1) + "-01";
  Promise.all([
    fetchAllRows(function(){ return sb.from("sales_log").select("id,data").eq("dealership_id", store).gte("sold_on", from).lt("sold_on", to).order("id"); }),
    sb.from("sales_targets").select("month,data").eq("dealership_id", store).eq("month", month)
  ]).then(function(rs){
    if (ST.store !== store) return;
    if (rs[1].error) throw rs[1].error;
    rs[0].forEach(function(r){ if (r.data && r.data.id) ST.deals[r.data.id] = r.data; });
    if (rs[1].data && rs[1].data[0]) ST.targets[month] = rs[1].data[0].data;
    ST.months[month] = true; ST.targetsLoaded[month] = true; ST.loading[month] = false; render();
  }, function(e){
    ST.loading[month] = false; ST.err = "Couldn't load the Sales Tracker: " + (e && e.message ? e.message : e) + ". Check the connection and refresh."; render();
  });
}
function stLoadTargets(month){
  if (ST.targetsLoaded[month] || !stOnline()) return Promise.resolve(ST.targets[month]);
  return sb.from("sales_targets").select("data").eq("dealership_id", ST.store).eq("month", month).then(function(r){
    if (r.error) throw r.error; ST.targetsLoaded[month] = true; if (r.data && r.data[0]) ST.targets[month] = r.data[0].data; return ST.targets[month];
  });
}
function stSaveDeal(d){
  var me = V.currentUser();
  d.updatedAt = new Date().toISOString(); d.updatedBy = me.name || "";
  if (!d.createdAt){ d.createdAt = d.updatedAt; d.createdBy = me.name || ""; }
  if (!stOnline()){ ST.deals[d.id] = d; return Promise.resolve(); }
  return sb.from("sales_log").upsert({ id:d.id, dealership_id:ST.store, sold_on:d.soldDate || null, data:d })
    .then(function(r){ if (r.error) throw r.error; ST.deals[d.id] = d; });
}
function stDeleteDeal(id){
  if (!stOnline()){ delete ST.deals[id]; return Promise.resolve(); }
  return sb.from("sales_log").delete().eq("id", id).eq("dealership_id", ST.store).then(function(r){ if (r.error) throw r.error; delete ST.deals[id]; });
}
function stSaveTargets(month, data){
  if (!stOnline()){ ST.targets[month] = data; return Promise.resolve(); }
  return sb.from("sales_targets").upsert({ dealership_id:ST.store, month:month, data:data })
    .then(function(r){ if (r.error) throw r.error; ST.targets[month] = data; });
}

/* ---- the numbers ---- */
function stTargets(month){ return ST.targets[month] || { people:[], countOn:"sold", gross:0, rdr:0, closed:[], open:[] }; }
function stInfo(month){ var t = stTargets(month); return C.sellingDays(month, { closed:t.closed || [], open:t.open || [], openWeekdays:t.openWeekdays }); }
function stDayOf(month, info){ var today = stToday(), cur = today.slice(0, 7); return month < cur ? info.total : month > cur ? 0 : C.sellingDayOf(info, today); }
function stWeek(){ var d = new Date(stToday() + "T12:00:00"), s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); var e = new Date(s); e.setDate(s.getDate() + 6); return { from:C.localISO(s), to:C.localISO(e) }; }
/* Month: the sheet's numbers. Week: the same, with targets scaled to the week's selling days. */
function stPerf(month, mode){
  var t = stTargets(month), info = stInfo(month), total = info.total, day = stDayOf(month, info);
  if (mode === "week"){
    var w = stWeek(), days = info.days.slice();
    [stShift(month, -1), stShift(month, 1)].forEach(function(m){ if (w.from.slice(0, 7) === m || w.to.slice(0, 7) === m) days = days.concat(stInfo(m).days); });
    var wd = days.filter(function(x){ return x.open && x.date >= w.from && x.date <= w.to; }), today = stToday();
    var scale = total ? wd.length / total : 0;
    var tw = Object.assign({}, t, { people:(t.people || []).map(function(p){ return { name:p.name, n:(Number(p.n) || 0) * scale, u:(Number(p.u) || 0) * scale }; }) });
    var res = C.salesPerformance(stAllDeals(), tw, w, wd.filter(function(x){ return x.date <= today; }).length, wd.length);
    res.week = w; return res;
  }
  return C.salesPerformance(stAllDeals(), t, { from:month + "-01", to:month + "-31" }, day, total);
}

/* ---- pieces ---- */
function stHue(name){ var k = stKey(name), h = 0; for (var i = 0; i < k.length; i++) h = (h*31 + k.charCodeAt(i)) >>> 0; return /^(HOUSE|MOBILE)/.test(k) ? "#64748b" : ST_HUES[h % ST_HUES.length]; }
function stAv(name){ var k = stKey(name), c = stHue(k), ini = k.split(/[\s/]+/).filter(Boolean).map(function(w){ return w[0]; }).join("").slice(0, 2) || "?";
  return '<span class="st-av" style="background:linear-gradient(180deg,' + c + 'cc,' + c + ')">' + esc(ini) + '</span>'; }
function stBadge(status){ return status ? '<span class="st-badge ' + status + '">' + (status === "ahead" ? "Ahead" : status === "pace" ? "Pace" : "Behind") + '</span>' : '<span class="st-badge store">Store only</span>'; }
function stRing(pct, size, c1, c2, label, sub, dark){
  var r = size/2 - 7, c = 2*Math.PI*r, id = "stg" + Math.random().toString(36).slice(2, 8), p = Math.max(0, Math.min(1, pct || 0));
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="flex:0 0 auto;filter:drop-shadow(0 6px 10px rgba(0,0,0,.25))" aria-hidden="true">' +
    '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
    '<circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="' + (dark ? "rgba(255,255,255,.14)" : "var(--surface-3)") + '" stroke-width="10"/>' +
    '<circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="url(#' + id + ')" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (c*p).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + size/2 + ' ' + size/2 + ')"/>' +
    '<text x="50%" y="' + (size/2 + (sub ? 0 : 5)) + '" text-anchor="middle" font-size="' + (size > 90 ? 18 : 15) + '" font-weight="800" fill="' + (dark ? "#fff" : "currentColor") + '">' + esc(label) + '</text>' +
    (sub ? '<text x="50%" y="' + (size/2 + 15) + '" text-anchor="middle" font-size="9.5" font-weight="600" fill="' + (dark ? "#bfdbfe" : "#64748b") + '">' + esc(sub) + '</text>' : '') + '</svg>';
}
function stTrack(done, target, day, total){
  if (!(target > 0)) return '<span class="st-hsub" style="font-size:11.5px;color:var(--muted)">—</span>';
  var pct = done/target, pace = total ? day/total : 0, cls = pct >= pace ? "ok" : pct >= pace*0.9 ? "mid" : "bad";
  return '<div class="st-track"><i class="' + cls + '" style="width:' + Math.min(100, pct*100) + '%"></i>' + (total ? '<em style="left:' + (pace*100) + '%"></em>' : '') + '</div>';
}
function stSubnav(){
  return '<div class="st-sub">' + [["today","Today"],["perf","Sales performance"],["log","Sales log"],["tgt","Targets & selling days"]].map(function(t){
    return '<button type="button" data-st="view" data-v="' + t[0] + '" class="' + (ST.view === t[0] ? "on" : "") + '">' + t[1] + '</button>'; }).join("") + '</div>';
}
function stMonthSelect(){
  var cur = stToday().slice(0, 7), opts = [];
  for (var i = 1; i >= -12; i--){ var m = stShift(cur, i); opts.push('<option value="' + m + '" ' + (m === ST.month ? "selected" : "") + '>' + stMonthName(m) + '</option>'); }
  return '<select class="st-gsel" data-stf="month" aria-label="Month">' + opts.join("") + '</select>';
}
function stRoster(month){
  var t = stTargets(month), names = (t.people || []).map(function(p){ return stKey(p.name); });
  stAllDeals().forEach(function(d){ (d.salespeople || []).forEach(function(s){ var k = stKey(s.name); if (k && names.indexOf(k) === -1) names.push(k); }); });
  ["HOUSE","MOBILE/HOUSE"].forEach(function(h){ if (names.indexOf(h) === -1) names.push(h); });
  return names;
}
function stSpText(d){
  var sp = d.salespeople || [];
  if (sp.length > 1) return esc(stKey(sp[0].name)) + ' <span class="st-split">' + Math.round(sp[0].share*100) + ' / ' + Math.round(sp[1].share*100) + ' ' + esc(stKey(sp[1].name)) + '</span>';
  return sp.length ? esc(stKey(sp[0].name)) : '<span style="color:var(--muted)">—</span>';
}

/* ---- Today ---- */
function stViewToday(){
  var month = stToday().slice(0, 7), info = stInfo(month), day = stDayOf(month, info), total = info.total, t = stTargets(month);
  var p = stPerf(month, "month"), s = p.store, today = stToday();
  var yd = new Date(today + "T12:00:00"); yd.setDate(yd.getDate() - 1); var yesterday = C.localISO(yd);
  var all = stAllDeals();
  var deliveredY = all.filter(function(d){ return (d.status === "delivered" || d.status === "rdr") && d.deliveredDate === yesterday; });
  var todayList = all.filter(function(d){ return (d.status === "scheduled" && String(d.deliveryAt || "").slice(0, 10) === today) || ((d.status === "delivered" || d.status === "rdr") && d.deliveredDate === today); })
    .sort(function(a, b){ return String(a.deliveryAt || "").localeCompare(String(b.deliveryAt || "")); });
  var open = all.filter(function(d){ return ["pending","approved","scheduled","carry"].indexOf(d.status) !== -1; });
  var save = all.filter(function(d){ return d.status === "pending" || d.status === "declined" || d.status === "approved"; }).sort(function(a, b){ return a.status === "declined" ? -1 : b.status === "declined" ? 1 : 0; });
  var gross = s.front + s.fi, grossTrack = day ? gross/day*total : 0, left = total - day;
  var help = p.people.filter(function(x){ return !x.storeOnly && x.tT > 0 && x.pct !== null && x.pct < 0.9; }).sort(function(a, b){ return a.pct - b.pct; });
  var noTargets = !(t.people || []).length;
  var li = function(d, right){ return '<li data-st="edit" data-id="' + esc(d.id) + '" style="cursor:pointer">' + right + '<span><b>' + esc(d.customer || d.stockNo || "Deal") + '</b><br><span style="font-size:11.5px;color:var(--muted)">' + esc(d.vehicle || "") + '</span></span><span class="who">' + stSpText(d) + '</span></li>'; };
  return '<div class="st-hero"><div class="st-hero-top"><div><div class="st-eyebrow">Sales Tracker · Morning meeting</div><h2>' +
      new Date(today + "T12:00:00").toLocaleDateString("en-CA", { weekday:"long", month:"long", day:"numeric" }) + '</h2><div class="st-hsub">' + esc(state.config.name || "") + ' · selling day ' + day + ' of ' + total + ' · ' + left + ' left</div></div>' +
      '<div class="st-actions"><button type="button" class="st-gbtn" data-st="add">+ Add a deal</button><button type="button" class="st-gbtn" data-st="email" data-what="today">Email</button><button type="button" class="st-gbtn primary" data-st="print" data-what="today">Print for the meeting</button></div></div>' +
    '<div class="st-kpis first-wide">' +
      '<div class="st-hk ring">' + stRing(s.tT ? s.sT/s.tT : 0, 104, "#fde68a", "#f59e0b", stF(s.sT), s.tT ? "of " + s.tT : "sold", true) +
        '<div><div class="l">Month so far</div><div class="v">' + (s.kT === null ? "—" : s.kT) + ' <small>tracking</small></div><div style="margin-top:6px">' + (s.tT ? stBadge(s.status) : '<span class="st-badge store">No target</span>') + '</div></div></div>' +
      '<div class="st-hk"><div class="l">New · Used sold</div><div class="v">' + stF(s.sN) + ' · ' + stF(s.sU) + '</div><div class="s">targets ' + s.tN + ' · ' + s.tU + (s.kN !== null ? ' · tracking ' + s.kN + ' · ' + s.kU : '') + '</div>' +
        '<div class="st-pace"><i style="width:' + (s.tT ? Math.min(100, s.sT/s.tT*100) : 0) + '%"></i>' + (total ? '<em style="left:' + (day/total*100) + '%"></em>' : '') + '</div></div>' +
      '<div class="st-hk"><div class="l">Needed per day</div><div class="v">' + (s.perDay === null ? "—" : s.perDay.toFixed(1)) + '</div><div class="s">' + (s.tT ? 'to reach ' + s.tT + ' in the ' + left + ' days left' : 'set targets to see this') + '</div></div>' +
      '<div class="st-hk"><div class="l">Gross vs forecast</div><div class="v">' + money0(gross) + '</div><div class="s">' + (t.gross ? 'of ' + money0(t.gross) + ' · tracking ' + money0(grossTrack) : 'front ' + money0(s.front) + ' · F&amp;I ' + money0(s.fi)) + '</div>' +
        (t.gross ? '<div class="st-pace"><i class="g" style="width:' + Math.min(100, gross/t.gross*100) + '%"></i><em style="left:' + (total ? day/total*100 : 0) + '%"></em></div>' : '') + '</div>' +
    '</div></div>' +
    (noTargets ? '<div class="st-warn" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">No targets for ' + stMonthName(month) + ' yet, so tracking and status can\'t be shown. <button type="button" class="btn sm primary" data-st="view" data-v="tgt">Set the targets</button></div>' : '') +
    '<div class="st-g3">' +
      '<div class="st-card"><div class="st-ch"><span class="st-ico g">✓</span><h3>Delivered yesterday<small>' + stDay(yesterday) + '</small></h3><span class="cnt">' + deliveredY.length + '</span></div>' +
        (deliveredY.length ? '<ul class="st-list">' + deliveredY.map(function(d){ return li(d, stAv((d.salespeople && d.salespeople[0] && d.salespeople[0].name) || "HOUSE")); }).join("") + '</ul>' : '<div class="st-empty">No deliveries recorded for yesterday.</div>') + '</div>' +
      '<div class="st-card"><div class="st-ch"><span class="st-ico b">⏱</span><h3>Delivering today<small>booked and done</small></h3><span class="cnt">' + todayList.length + '</span></div>' +
        (todayList.length ? '<ul class="st-list">' + todayList.map(function(d){ var done = d.status === "delivered" || d.status === "rdr", tm = String(d.deliveryAt || "").slice(11, 16);
          return li(d, '<span class="st-time">' + (done ? "✓ done" : (tm ? new Date("2000-01-01T" + tm).toLocaleTimeString("en-CA", { hour:"numeric", minute:"2-digit" }) : "today")) + '</span>'); }).join("") + '</ul>' : '<div class="st-empty">Nothing booked for today.</div>') + '</div>' +
      '<div class="st-card"><div class="st-ch"><span class="st-ico p">⏳</span><h3>Still to deliver<small>pending · approved · scheduled · carry over</small></h3><span class="cnt">' + open.length + '</span></div>' +
        (open.length ? '<ul class="st-list">' + open.slice(0, 6).map(function(d){ return li(d, '<span class="st-pill ' + d.status + '">' + ST_LABEL[d.status] + '</span>'); }).join("") + '</ul>' + (open.length > 6 ? '<div class="st-empty">and ' + (open.length - 6) + ' more in the Sales log</div>' : '') : '<div class="st-empty">Everything sold has been delivered.</div>') + '</div>' +
    '</div>' +
    '<div class="st-g2">' +
      '<div class="st-card"><div class="st-ch"><span class="st-ico o">⚑</span><h3>Save-a-deal<small>pending, declined and approved</small></h3><span class="cnt">' + save.length + '</span></div>' +
        (save.length ? save.slice(0, 8).map(function(d){ return '<div class="st-row" data-st="edit" data-id="' + esc(d.id) + '">' + stAv((d.salespeople && d.salespeople[0] && d.salespeople[0].name) || "HOUSE") +
          '<span><b>' + esc(d.customer || d.stockNo || "Deal") + '</b> <span style="color:var(--muted);font-size:12px">· ' + esc(d.vehicle || "") + '</span><br><span class="st-pill ' + d.status + '">' + ST_LABEL[d.status] + '</span></span><span class="nx">' + esc(d.notes || (d.status === "approved" ? "Book the delivery" : "")) + '</span></div>'; }).join("") : '<div class="st-empty">Nothing waiting.</div>') + '</div>' +
      '<div class="st-card"><div class="st-ch"><span class="st-ico r">▲</span><h3>Who needs help<small>tracking under 90% of target</small></h3></div>' +
        (noTargets ? '<div class="st-empty">Set targets to see who\'s behind.</div>' : help.length ? help.map(function(h){
          return '<div class="st-help">' + stAv(h.name) + '<b>' + esc(h.name) + '</b><div>' + stTrack(h.sT, h.tT, day, total) + '<div class="t2">' + stF(h.sT) + ' sold · tracking ' + h.kT + ' of ' + h.tT + (h.perDay !== null ? ' · needs ' + h.perDay.toFixed(1) + '/day' : '') + '</div></div>' + stBadge(h.status) + '</div>'; }).join("") +
          '<div class="st-legend"><span>Bar: sold so far</span><span>Line: where they should be today</span></div>' : '<div class="st-empty">Everyone is at 90% of target or better.</div>') + '</div>' +
    '</div>';
}

/* ---- Sales performance ---- */
function stPerfTable(p, forPrint){
  var cell = function(cls, v){ return '<td class="' + cls + '">' + v + '</td>'; };
  var row = function(r, cls){
    var house = r.storeOnly, store = cls === "store", tgt = function(v){ return house ? "—" : stF(v); };
    return '<tr class="' + (cls || "") + '"><td class="l"><span class="st-who">' + (store ? '<span class="st-ico b" style="width:28px;height:28px;font-size:12px">★</span>' : stAv(r.name)) + esc(r.name) + '</span></td>' +
      cell("bn sep", tgt(r.tN)) + cell("bu", tgt(r.tU)) + cell("bt", tgt(r.tT)) +
      cell("bn sep", stF(r.sN)) + cell("bu", stF(r.sU)) + cell("bt", stF(r.sT)) +
      cell("bn sep", r.kN === null ? "—" : r.kN) + cell("bu", r.kU === null ? "—" : r.kU) + cell("bt", r.kT === null ? "—" : r.kT) +
      '<td class="sep" style="min-width:' + (forPrint ? 90 : 130) + 'px">' + (house || !(r.tT > 0) ? '<span style="font-size:11.5px;color:var(--muted)">' + (house ? "store only" : "no target") + '</span>' :
        '<div class="st-pc"><span>' + (r.pct === null ? "—" : Math.round(r.pct*100) + "%") + '</span>' + stTrack(r.sT, r.tT, p.day, p.total) + '</div>') + '</td>' +
      '<td>' + (house ? '<span class="st-badge store">House</span>' : r.tT > 0 && r.status ? stBadge(r.status) : '<span style="color:var(--muted)">—</span>') + '</td>' +
      '<td class="num"><b>' + (house || r.perDay === null ? "—" : r.perDay.toFixed(1)) + '</b></td></tr>';
  };
  return '<table><thead><tr class="g"><th></th><th class="n sep" colspan="3">Target</th><th class="u sep" colspan="3">Sold</th><th class="sep" colspan="3">Tracking</th><th class="sep" colspan="3"></th></tr>' +
    '<tr><th class="l">Salesperson</th><th class="sep">New</th><th>Used</th><th>Total</th><th class="sep">New</th><th>Used</th><th>Total</th><th class="sep">New</th><th>Used</th><th>Total</th><th class="sep">% to target</th><th>Status</th><th>Need / day</th></tr></thead><tbody>' +
    row(p.store, "store") + p.people.map(function(r){ return row(r, r.storeOnly ? "house" : ""); }).join("") + '</tbody></table>';
}
function stViewPerf(){
  var cur = stToday().slice(0, 7), week = ST.perf === "week" && ST.month === cur;
  var p = stPerf(ST.month, week ? "week" : "month"), s = p.store, title = week ? "WEEK OF " + stDay(p.week.from).toUpperCase() + " – " + stDay(p.week.to).toUpperCase() : stMonthName(ST.month).toUpperCase() + " SALES PERFORMANCE";
  var sc = function(label, sold, target, track, c1, c2){ return '<div class="st-sc">' + stRing(target ? sold/target : 0, 84, c1, c2, stF(sold), target ? "of " + stF(target) : "sold") +
    '<div><div class="l">' + label + '</div><div class="v">' + (track === null ? "—" : track) + '</div><div class="s">tracking' + (target && track !== null ? ' · ' + Math.round(track/target*100) + '% of target' : '') + '</div></div></div>'; };
  return '<div class="st-sum">' + sc("New", s.sN, s.tN, s.kN, "#93c5fd", "#2563eb") + sc("Used", s.sU, s.tU, s.kU, "#5eead4", "#0f766e") +
      '<div class="st-sc">' + stRing(s.tT ? s.sT/s.tT : 0, 84, "#fde68a", "#f59e0b", stF(s.sT), s.tT ? "of " + stF(s.tT) : "sold") + '<div><div class="l">Total</div><div class="v">' + (s.kT === null ? "—" : s.kT) + '</div><div class="s">tracking ' + (s.status ? stBadge(s.status) : "") + '</div></div></div>' +
      '<div class="st-sc dark"><div style="flex:1"><div class="l">Selling day</div><div class="v">' + p.day + ' <span style="font-size:14px;color:#cbd5e1">of ' + p.total + '</span></div>' +
        '<div class="st-pace"><i class="b" style="width:' + (p.total ? p.day/p.total*100 : 0) + '%"></i></div><div class="s" style="margin-top:8px">' + (s.perDay !== null && s.tT ? 'Needs ' + s.perDay.toFixed(1) + ' a day to hit ' + stF(s.tT) : s.tT ? 'Period finished' : 'Set targets to see the pace') + '</div></div></div></div>' +
    '<div class="st-table"><div class="st-th"><div><h2>' + esc(title) + '</h2><div class="st-hsub">Counted on ' + (p.countOn === "delivered" ? "delivery" : "sold") + ' · As-is counts as Used · split deals count as shares</div></div>' +
      '<div class="st-actions">' + (ST.month === cur ? '<span class="st-sub" style="margin:0"><button type="button" data-st="perfmode" data-v="month" class="' + (week ? "" : "on") + '">Month</button><button type="button" data-st="perfmode" data-v="week" class="' + (week ? "on" : "") + '">This week</button></span>' : '') +
      stMonthSelect() + '<button type="button" class="st-gbtn" data-st="email" data-what="perf">Email</button><button type="button" class="st-gbtn primary" data-st="print" data-what="perf">Print</button></div></div>' +
      '<div class="st-tw">' + stPerfTable(p) + '</div>' +
      '<div class="st-note">Tracking = sold ÷ selling day ' + p.day + ' × ' + p.total + ' selling days. The bar shows sold against target; the line is where they should be today. AHEAD 100%+ · PACE 90–99% · BEHIND under 90%.' + (week ? ' Weekly targets are the month\'s targets scaled to this week\'s selling days.' : '') + '</div></div>';
}

/* ---- Sales log ---- */
function stViewLog(){
  var month = ST.month, f = ST.f, q = f.q.trim().toLowerCase();
  var list = stAllDeals().filter(function(d){ return String(d.soldDate || "").slice(0, 7) === month; });
  var counts = { all:list.length, open:0, del:0, neg:0, N:0, U:0, A:0 };
  list.forEach(function(d){ if (["pending","approved","scheduled","carry"].indexOf(d.status) !== -1) counts.open++; else if (d.status === "delivered" || d.status === "rdr") counts.del++; else counts.neg++;
    if (d.type === "As-is") counts.A++; else if (d.type === "Used") counts.U++; else counts.N++; });
  var rows = list.filter(function(d){
    if (f.type !== "all" && (f.type === "Used" ? !C.saleIsUsed(d) : d.type !== f.type)) return false;
    if (f.status === "open" && ["pending","approved","scheduled","carry"].indexOf(d.status) === -1) return false;
    if (f.status !== "all" && f.status !== "open" && d.status !== f.status) return false;
    if (f.sp !== "all" && !(d.salespeople || []).some(function(s){ return stKey(s.name) === f.sp; })) return false;
    if (q && [d.customer, d.stockNo, d.vehicle, d.customerNo].join(" ").toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).sort(function(a, b){ return String(b.soldDate).localeCompare(String(a.soldDate)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
  var sel = function(key, opts){ return '<select class="st-gsel" data-stf="f.' + key + '">' + opts.map(function(o){ return '<option value="' + esc(o[0]) + '" ' + (f[key] === o[0] ? "selected" : "") + '>' + esc(o[1]) + '</option>'; }).join("") + '</select>'; };
  var card = function(ico, cls, title, sub, n, foot){ return '<div class="st-card"><div class="st-ch"><span class="st-ico ' + cls + '">' + ico + '</span><h3>' + title + '<small>' + sub + '</small></h3><span class="cnt">' + n + '</span></div><div style="font-size:11.5px;color:var(--muted)">' + foot + '</div></div>'; };
  return '<div class="st-g4">' +
      card("✎", "b", "Deals this month", stMonthName(month), counts.all, "New " + counts.N + " · Used " + counts.U + " · As-is " + counts.A) +
      card("⏱", "o", "Not delivered yet", "pending · approved · scheduled", counts.open, "carry overs included") +
      card("✓", "g", "Delivered", "delivered and scanned", counts.del, "") +
      card("✕", "r", "Declined / cancelled", "not counted", counts.neg, "") + '</div>' +
    '<div class="st-table"><div class="st-th"><div><h2>' + esc(stMonthName(month).toUpperCase()) + ' SALES LOG</h2><div class="st-hsub">New and Used together · click a deal to open it</div></div>' +
      '<div class="st-actions">' + stMonthSelect() + sel("type", [["all","New & Used"],["New","New"],["Used","Used (incl. As-is)"],["As-is","As-is only"]]) +
        sel("status", [["all","All statuses"],["open","Not delivered yet"]].concat(C.SALE_STATUSES.map(function(s){ return [s, ST_LABEL[s]]; }))) +
        sel("sp", [["all","All salespeople"]].concat(stRoster(month).map(function(n){ return [n, n]; }))) +
        '<input class="st-gsel" data-stf="f.q" value="' + esc(f.q) + '" placeholder="Search customer or stock #" style="width:190px">' +
        '<button type="button" class="st-gbtn" data-st="csv">Export</button><button type="button" class="st-gbtn primary" data-st="add">+ Add a deal</button></div></div>' +
      '<div class="st-tw">' + (rows.length ? '<table><thead><tr><th class="l">Date</th><th>Stock #</th><th class="l">Customer · vehicle</th><th>Type</th><th class="l">Salesperson</th><th>Deal</th><th>Source · close</th><th class="r">Front</th><th class="r">F&amp;I</th><th class="l">Status</th></tr></thead><tbody>' +
        rows.map(function(d){ return '<tr class="click" data-st="edit" data-id="' + esc(d.id) + '"><td class="l" style="font-weight:600">' + stDay(d.soldDate) + '</td><td><b>' + esc(d.stockNo || "") + '</b></td>' +
          '<td class="l"><b>' + esc(d.customer || "") + '</b><div style="font-size:11.5px;color:var(--muted)">' + esc(d.vehicle || "") + '</div></td><td><span class="st-pill ' + esc(d.type || "New") + '">' + esc(d.type || "New") + '</span></td>' +
          '<td class="l"><span class="st-who" style="font-weight:600">' + stAv((d.salespeople && d.salespeople[0] && d.salespeople[0].name) || "HOUSE") + stSpText(d) + '</span></td><td>' + esc(d.dealType || "") + '</td>' +
          '<td style="font-size:11.5px">' + esc(d.leadSource || "") + '<br><span style="color:var(--muted)">' + esc(d.closeType || "") + '</span></td>' +
          '<td class="r num"><b>' + (d.frontGross === null || d.frontGross === undefined ? "—" : money0(d.frontGross)) + '</b></td><td class="r num"><b>' + (d.fiGross === null || d.fiGross === undefined ? "—" : money0(d.fiGross)) + '</b></td>' +
          '<td class="l"><span class="st-pill ' + d.status + '">' + ST_LABEL[d.status] + '</span>' + (d.status === "scheduled" && d.deliveryAt ? '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + stDay(d.deliveryAt) + ' ' + String(d.deliveryAt).slice(11, 16) + '</div>' : '') + '</td></tr>'; }).join("") +
        '</tbody></table>' : '<div class="st-empty" style="padding:24px 16px">' + (list.length ? "No deals match these filters." : "No deals logged for " + stMonthName(month) + " yet. Use <b>+ Add a deal</b>.") + '</div>') + '</div>' +
      '<div class="st-note">Carry over = sold last month, delivering this month (it counts in the month it was sold). Declined and cancelled deals stay in the log but don\'t count toward anyone\'s numbers.</div></div>';
}

/* ---- Adding or editing a deal ---- */
function stBlank(){
  return { id:"S" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), soldDate:stToday(), status:"pending", statusDates:{ pending:stToday() }, type:"New", dealType:"Finance",
    salespeople:[], stockNo:"", customerNo:"", customer:"", vehicle:"", fiManager:"", frontGross:null, fiGross:null, lender:"", leadSource:"", closeType:"",
    stockSource:"", flags:{}, deliveryAt:"", deliveredDate:"", notes:"" };
}
function stOpen(d){
  var e = C.clone(d), sp = e.salespeople || [];
  e._sp1 = sp[0] ? stKey(sp[0].name) : ""; e._split = sp.length > 1; e._sp2 = sp[1] ? stKey(sp[1].name) : ""; e._share = sp.length > 1 ? String(Math.round(sp[0].share*100)) : "50";
  e._front = d.frontGross === null || d.frontGross === undefined ? "" : String(d.frontGross); e._fi = d.fiGross === null || d.fiGross === undefined ? "" : String(d.fiGross);
  e._isNew = !ST.deals[d.id];
  ST.edit = e; ST.editErr = null;
}
function stDrawer(){
  var e = ST.edit; if (!e) return "";
  var mgr = true; /* Phase 1: only Master, GMs and Sales Managers reach this screen, and all of them may split deals */
  var dup = e.stockNo ? stAllDeals().filter(function(x){ return x.id !== e.id && stKey(x.stockNo) === stKey(e.stockNo); }) : [];
  var roster = stRoster(ST.month);
  var seg = function(field, opts){ return '<div class="st-seg">' + opts.map(function(o){ return '<button type="button" data-st="set" data-k="' + field + '" data-v="' + o + '" class="' + (e[field] === o ? "on" : "") + '">' + o + '</button>'; }).join("") + '</div>'; };
  var opt = function(list, cur, blank){ return (blank ? '<option value="">' + blank + '</option>' : '') + list.map(function(o){ return '<option ' + (cur === o ? "selected" : "") + '>' + esc(o) + '</option>'; }).join(""); };
  var idx = ST_STEPS.indexOf(e.status);
  return '<div class="st-back" data-st="close"></div><div class="st-drawer" role="dialog" aria-label="' + (e._isNew ? "Add a deal" : "Edit deal") + '">' +
    '<div class="h"><b>' + (e._isNew ? "Add a deal" : "Deal · " + esc(e.customer || e.stockNo || "")) + '</b><span style="display:flex;gap:6px">' +
      (e._isNew ? '' : '<button type="button" class="btn sm danger" data-st="del">Delete</button>') + '<button type="button" class="btn sm" data-st="close">Cancel</button><button type="button" class="btn sm primary" data-st="save"' + (ST.saving ? " disabled" : "") + '>' + (ST.saving ? "Saving…" : "Save deal") + '</button></span></div>' +
    '<div class="b">' + (ST.editErr ? '<div class="st-err">' + esc(ST.editErr) + '</div>' : '') +
      '<div class="st-steps">' + ST_STEPS.map(function(s, i){ return '<button type="button" data-st="status" data-v="' + s + '" class="' + (e.status === s ? "cur" : idx > i ? "done" : "") + '">' + ST_LABEL[s] + '</button>'; }).join("") + '</div>' +
      '<div class="st-steps" style="margin-top:-6px">' + ST_OTHER.map(function(s){ return '<button type="button" data-st="status" data-v="' + s + '" class="' + (e.status === s ? "cur" : "") + (s !== "carry" ? " neg" : "") + '">' + ST_LABEL[s] + '</button>'; }).join("") + '</div>' +
      '<div class="st-r3"><label class="f"><span>Date sold</span><input type="date" data-stf="e.soldDate" value="' + esc(e.soldDate) + '"></label><label class="f"><span>Stock #</span><input data-stf="e.stockNo" value="' + esc(e.stockNo) + '"></label><label class="f"><span>Customer #</span><input data-stf="e.customerNo" value="' + esc(e.customerNo) + '"></label></div>' +
      (dup.length ? '<div class="st-warn">Stock # ' + esc(e.stockNo) + ' is already in the log (' + esc(dup[0].customer || "") + ', ' + stDay(dup[0].soldDate) + ', ' + ST_LABEL[dup[0].status] + '). Saving adds it again.</div>' : '') +
      '<div class="st-r2"><label class="f"><span>Customer</span><input data-stf="e.customer" value="' + esc(e.customer) + '"></label><label class="f"><span>Vehicle</span><input data-stf="e.vehicle" value="' + esc(e.vehicle) + '" placeholder="2026 Nissan Rogue SV"></label></div>' +
      '<div class="st-r2"><div class="f"><span>New / Used / As-is</span>' + seg("type", ["New","Used","As-is"]) + '</div><div class="f"><span>Deal</span>' + seg("dealType", ["Finance","Lease","Cash"]) + '</div></div>' +
      '<datalist id="st-roster">' + roster.map(function(n){ return '<option value="' + esc(n) + '">'; }).join("") + '</datalist>' +
      '<div class="st-r2"><label class="f"><span>Salesperson</span><input list="st-roster" data-stf="e._sp1" value="' + esc(e._sp1) + '" placeholder="Pick or type a name"></label><label class="f"><span>F&amp;I manager</span><input data-stf="e.fiManager" value="' + esc(e.fiManager) + '"></label></div>' +
      (mgr ? '<div class="st-box"><div class="lock">Sales Managers and GMs only</div><label style="font-size:12.5px;font-weight:600;display:flex;gap:6px;align-items:center"><input type="checkbox" data-stf="e._split" ' + (e._split ? "checked" : "") + '> Split this deal</label>' +
        (e._split ? '<div class="st-r2" style="margin-top:8px"><label class="f"><span>Second salesperson</span><input list="st-roster" data-stf="e._sp2" value="' + esc(e._sp2) + '"></label><label class="f"><span>' + esc(e._sp1 || "First") + '\'s share</span><select data-stf="e._share">' +
          ["50","60","70","40","30"].map(function(v){ return '<option value="' + v + '" ' + (e._share === v ? "selected" : "") + '>' + v + ' / ' + (100 - Number(v)) + '</option>'; }).join("") + '</select></label></div>' :
          '<div style="font-size:11.5px;color:var(--muted);margin-top:4px">Otherwise it\'s 1 full unit for ' + esc(e._sp1 || "the salesperson") + '. Choose HOUSE or MOBILE/HOUSE for a store-only deal.</div>') + '</div>' : '') +
      '<div class="st-r3"><label class="f"><span>Front gross</span><input inputmode="decimal" data-stf="e._front" value="' + esc(e._front) + '" placeholder="$"></label><label class="f"><span>F&amp;I gross</span><input inputmode="decimal" data-stf="e._fi" value="' + esc(e._fi) + '" placeholder="$"></label><label class="f"><span>Lender</span><input data-stf="e.lender" value="' + esc(e.lender) + '"></label></div>' +
      '<div class="st-r3"><label class="f"><span>Lead source</span><select data-stf="e.leadSource">' + opt(ST_LEAD, e.leadSource, "—") + '</select></label><label class="f"><span>Close</span><select data-stf="e.closeType">' + opt(["1st visit","Be-back"], e.closeType, "—") + '</select></label><label class="f"><span>Stock source</span><select data-stf="e.stockSource">' + opt(ST_STOCK, e.stockSource, "—") + '</select></label></div>' +
      '<div class="f"><span>Tick what applies</span></div><div class="st-flags">' + ST_FLAGS.map(function(fl){ return '<button type="button" data-st="flag" data-v="' + fl[0] + '" class="' + (e.flags && e.flags[fl[0]] ? "on" : "") + '">' + fl[1] + '</button>'; }).join("") + '</div>' +
      (e.status === "scheduled" || e.deliveryAt ? '<label class="f"><span>Delivery booked for</span><input type="datetime-local" data-stf="e.deliveryAt" value="' + esc(String(e.deliveryAt || "").slice(0, 16)) + '"></label>' : '') +
      (e.status === "delivered" || e.status === "rdr" ? '<label class="f"><span>Delivered on</span><input type="date" data-stf="e.deliveredDate" value="' + esc(e.deliveredDate || "") + '"></label>' : '') +
      '<label class="f"><span>Notes</span><textarea rows="2" data-stf="e.notes" placeholder="e.g. stips: proof of income">' + esc(e.notes || "") + '</textarea></label>' +
      (e.updatedAt ? '<div style="font-size:11px;color:var(--muted)">Last changed ' + new Date(e.updatedAt).toLocaleString("en-CA", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) + (e.updatedBy ? " by " + esc(e.updatedBy) : "") + '</div>' : '') +
    '</div></div>';
}
function stCommitEdit(){
  var e = ST.edit; if (!e || ST.saving) return;
  var sp1 = stKey(e._sp1), sp2 = stKey(e._sp2), share = Number(e._share) / 100 || 0.5;
  if (!e.soldDate){ ST.editErr = "Enter the date sold."; return render(); }
  if (!String(e.customer || "").trim() && !String(e.stockNo || "").trim()){ ST.editErr = "Enter the customer or the stock #."; return render(); }
  if (!sp1){ ST.editErr = "Choose the salesperson (or HOUSE)."; return render(); }
  if (e._split && (!sp2 || sp2 === sp1)){ ST.editErr = "Choose a different second salesperson, or untick Split."; return render(); }
  var d = {};
  Object.keys(e).forEach(function(k){ if (k.charAt(0) !== "_") d[k] = e[k]; });
  d.salespeople = e._split ? [{ name:sp1, share:share }, { name:sp2, share:Math.round((1 - share)*100)/100 }] : [{ name:sp1, share:1 }];
  d.frontGross = stNum(e._front); d.fiGross = stNum(e._fi);
  d.stockNo = String(d.stockNo || "").trim().toUpperCase(); d.customer = String(d.customer || "").trim();
  if (d.status !== "scheduled" && d.status !== "delivered" && d.status !== "rdr") d.deliveryAt = d.deliveryAt || "";
  ST.saving = true; render();
  stSaveDeal(d).then(function(){
    ST.saving = false; ST.edit = null; toast("Deal saved" + (d.customer ? " · " + d.customer : "") + ".", "ok"); render();
  }, function(err){ ST.saving = false; ST.editErr = "Couldn't save: " + (err && err.message ? err.message : err); render(); });
}

/* ---- Targets & selling days ---- */
function stDraft(){
  if (!ST.tDraft || ST.tDraft._month !== ST.month){
    var t = C.clone(stTargets(ST.month)); t._month = ST.month; t.people = t.people || []; t.closed = t.closed || []; t.open = t.open || [];
    t.countOn = t.countOn || "sold"; ST.tDraft = t; ST.tDirty = false;
  }
  return ST.tDraft;
}
function stViewTargets(){
  var t = stDraft(), month = ST.month, info = C.sellingDays(month, { closed:t.closed, open:t.open, openWeekdays:t.openWeekdays }), plain = C.sellingDays(month, { openWeekdays:t.openWeekdays });
  var today = stToday(), day = stDayOf(month, info), totN = 0, totU = 0;
  t.people.forEach(function(p){ totN += Number(p.n) || 0; totU += Number(p.u) || 0; });
  var first = new Date(month + "-01T12:00:00").getDay(), cal = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(function(d){ return '<div class="h">' + d + '</div>'; }).join("");
  for (var i = 0; i < first; i++) cal += '<div class="e"></div>';
  info.days.forEach(function(d, i){
    var cls = !d.open ? (d.holiday && plain.days[i].open === false && d.dow !== 0 ? "hol" : "off") : d.date === today ? "today" : d.date < today ? "past" : "";
    cal += '<button type="button" data-st="day" data-v="' + d.date + '" class="' + cls + '" title="' + esc(d.open ? "Open — click to close" : (d.reason || "Closed") + " — click to open") + '">' + d.day + '</button>';
  });
  var weekly = function(v){ return info.total ? (v * 6 / info.total).toFixed(1) : "—"; };
  return '<div class="st-hero"><div class="st-hero-top"><div><div class="st-eyebrow">Sales Tracker · Targets &amp; selling days</div><h2>' + stMonthName(month) + '</h2><div class="st-hsub">Set by the Sales Manager or GM · selling days worked out automatically</div></div>' +
      '<div class="st-actions">' + stMonthSelect() + '<button type="button" class="st-gbtn" data-st="copytargets">Copy last month\'s targets</button><button type="button" class="st-gbtn primary" data-st="savetargets"' + (ST.saving ? " disabled" : "") + '>' + (ST.tDirty ? "Save changes" : "Saved") + '</button></div></div>' +
    '<div class="st-kpis"><div class="st-hk"><div class="l">Store target</div><div class="v">' + (totN + totU) + '</div><div class="s">New ' + totN + ' · Used ' + totU + '</div></div>' +
      '<div class="st-hk"><div class="l">Selling days</div><div class="v">' + info.total + '</div><div class="s">' + day + ' used · ' + (info.total - day) + ' left</div><div class="st-pace"><i class="b" style="width:' + (info.total ? day/info.total*100 : 0) + '%"></i></div></div>' +
      '<div class="st-hk"><div class="l">Gross forecast</div><div class="v">' + (t.gross ? money0(t.gross) : "—") + '</div><div class="s">' + (t.gross && totN + totU ? "about " + money0(t.gross/(totN + totU)) + " per vehicle" : "optional") + '</div></div>' +
      '<div class="st-hk"><div class="l">RDR target</div><div class="v">' + (t.rdr || "—") + '</div><div class="s">optional</div></div></div></div>' +
    (ST.tDirty ? '<div class="st-warn">You have unsaved changes to ' + stMonthName(month) + '\'s targets.</div>' : '') +
    '<div class="st-g2"><div class="st-table" style="margin:0"><div class="st-th"><div><h2>SALESPERSON TARGETS</h2><div class="st-hsub">units · New and Used · HOUSE and MOBILE/HOUSE are always there (store only)</div></div></div>' +
      '<div class="st-tw"><table><thead><tr><th class="l">Salesperson</th><th>New</th><th>Used</th><th>Total</th><th>Weekly N · U</th><th></th></tr></thead><tbody>' +
      (t.people.length ? t.people.map(function(p, i){ return '<tr><td class="l"><span class="st-who">' + stAv(p.name || "?") + '<input class="st-tin" style="width:150px;text-align:left" data-stt="name:' + i + '" value="' + esc(p.name || "") + '" placeholder="Name"></span></td>' +
          '<td class="bn"><input class="st-tin" inputmode="numeric" data-stt="n:' + i + '" value="' + esc(p.n === undefined ? "" : p.n) + '"></td><td class="bu"><input class="st-tin" inputmode="numeric" data-stt="u:' + i + '" value="' + esc(p.u === undefined ? "" : p.u) + '"></td>' +
          '<td class="bt">' + ((Number(p.n) || 0) + (Number(p.u) || 0)) + '</td><td style="font-size:11.5px;color:var(--muted)">' + weekly(Number(p.n) || 0) + ' · ' + weekly(Number(p.u) || 0) + '</td>' +
          '<td><button type="button" class="btn sm ghost" data-st="rmperson" data-v="' + i + '" title="Remove" aria-label="Remove ' + esc(p.name || "") + '">×</button></td></tr>'; }).join("") :
        '<tr><td colspan="6" class="st-empty" style="padding:16px">No salespeople yet. Add them below, or copy last month\'s targets.</td></tr>') +
      '<tr class="store"><td class="l">Store</td><td>' + totN + '</td><td>' + totU + '</td><td>' + (totN + totU) + '</td><td>' + weekly(totN) + ' · ' + weekly(totU) + '</td><td></td></tr></tbody></table></div>' +
      '<div class="st-note" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><button type="button" class="btn sm" data-st="addperson">+ Add a salesperson</button>' +
        '<span>Gross forecast <input class="st-tin" style="width:100px" inputmode="numeric" data-stt="gross" value="' + esc(t.gross || "") + '" placeholder="$"></span>' +
        '<span>RDR target <input class="st-tin" inputmode="numeric" data-stt="rdr" value="' + esc(t.rdr || "") + '"></span>' +
        '<span>Counts toward target <select class="st-tin" style="width:auto" data-stt="countOn"><option value="sold" ' + (t.countOn !== "delivered" ? "selected" : "") + '>Sold</option><option value="delivered" ' + (t.countOn === "delivered" ? "selected" : "") + '>Delivered</option></select></span></div></div>' +
    '<div class="st-card"><div class="st-ch"><span class="st-ico b">▦</span><h3>Selling days<small>' + stMonthName(month) + ' · click a day to open or close it</small></h3><span class="cnt">' + info.total + '</span></div>' +
      '<div class="st-cal">' + cal + '</div>' +
      '<div class="st-legend"><span><i style="background:var(--surface-3)"></i>Closed</span><span><i style="background:#fde68a"></i>Holiday</span><span><i style="background:rgba(59,130,246,.25)"></i>Used</span><span><i style="background:#2563eb"></i>Today</span></div>' +
      '<div style="font-size:11.5px;color:var(--muted);margin-top:8px">Open Monday to Saturday; closed Sundays, Ontario statutory holidays and the Civic Holiday. ' +
        (t.closed.length || t.open.length ? 'Changed by hand: ' + t.closed.map(function(x){ return stDay(x) + " closed"; }).concat(t.open.map(function(x){ return stDay(x) + " opened"; })).join(", ") + '.' : '') + '</div></div></div>';
}

/* ---- print and email ---- */
function stSheet(what){
  if (what === "today") return stViewToday().replace(/<div class="st-actions">[\s\S]*?<\/div><\/div>/, "</div>");
  var cur = stToday().slice(0, 7), week = ST.perf === "week" && ST.month === cur, p = stPerf(ST.month, week ? "week" : "month");
  return '<div class="st-table"><div class="st-th"><div><h2>' + esc((state.config.name || "") + " · " + (week ? "WEEK OF " + stDay(p.week.from) + " – " + stDay(p.week.to) : stMonthName(ST.month).toUpperCase() + " SALES PERFORMANCE")) + '</h2>' +
    '<div class="st-hsub">Selling day ' + p.day + ' of ' + p.total + ' · counted on ' + (p.countOn === "delivered" ? "delivery" : "sold") + ' · printed ' + new Date().toLocaleString("en-CA", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) + '</div></div></div>' + stPerfTable(p, true) +
    '<div class="st-note">Tracking = sold ÷ current selling day × total selling days. AHEAD 100%+ · PACE 90–99% · BEHIND under 90%. Split deals count as shares.</div></div>';
}
function stPrint(what){
  var css = appCssText(), body = stSheet(what);
  var html = '<!doctype html><html data-theme="light"><head><meta charset="utf-8"><title>' + esc((state.config.name || "") + " · Sales Tracker") + '</title>' +
    '<style>' + css + '@page{size:letter landscape;margin:10mm}html,body{background:#fff}body{padding:0}.stx *{-webkit-print-color-adjust:exact;print-color-adjust:exact}.st-tw{overflow:visible}.st-table,.st-card,.st-hero{break-inside:avoid}</style></head>' +
    '<body><div class="stx">' + body + '</div></body></html>';
  var old = document.getElementById("st-print-frame"); if (old) old.remove();
  var fr = document.createElement("iframe"); fr.id = "st-print-frame"; fr.setAttribute("aria-hidden", "true"); fr.tabIndex = -1;
  fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(fr);
  var doc = fr.contentDocument; doc.open(); doc.write(html); doc.close();
  setTimeout(function(){ try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast("The browser blocked printing. Try again.","err"); } }, 300);
}
function stEmailContent(what){
  var cur = stToday().slice(0, 7), month = what === "today" ? cur : ST.month, week = what === "perf" && ST.perf === "week" && ST.month === cur;
  var p = stPerf(month, week ? "week" : "month"), s = p.store, name = state.config.name || "";
  var title = week ? "Week of " + stDay(p.week.from) + " – " + stDay(p.week.to) : stMonthName(month) + " sales performance";
  var col = { ahead:"#059669", pace:"#d97706", behind:"#dc2626" };
  var td = 'style="padding:6px 8px;border-bottom:1px solid #e6ebf3;font-size:13px;text-align:center"', tdl = 'style="padding:6px 8px;border-bottom:1px solid #e6ebf3;font-size:13px;text-align:left;font-weight:700"';
  var rows = [s].concat(p.people).map(function(r, i){ var st = r.storeOnly ? "House" : r.status ? r.status.toUpperCase() : "—";
    return '<tr' + (i === 0 ? ' style="background:#eef4ff"' : '') + '><td ' + tdl + '>' + esc(r.name) + '</td><td ' + td + '>' + (r.storeOnly ? "—" : stF(r.tT)) + '</td><td ' + td + '>' + stF(r.sN) + ' · ' + stF(r.sU) + '</td><td ' + td + '><b>' + stF(r.sT) + '</b></td><td ' + td + '>' + (r.kT === null ? "—" : r.kT) + '</td><td ' + td + '>' + (r.storeOnly || r.pct === null ? "—" : Math.round(r.pct*100) + "%") + '</td>' +
      '<td ' + td + '><span style="display:inline-block;padding:2px 9px;border-radius:999px;color:#fff;font-size:11px;font-weight:800;background:' + (col[r.status] || "#94a3b8") + '">' + st + '</span></td><td ' + td + '>' + (r.storeOnly || r.perDay === null ? "—" : r.perDay.toFixed(1)) + '</td></tr>'; }).join("");
  var th = 'style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e6ebf3"';
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:760px"><div style="background:#0b1730;color:#fff;padding:14px 16px;border-radius:10px 10px 0 0"><div style="font-size:12px;color:#93c5fd;letter-spacing:.12em;text-transform:uppercase">' + esc(name) + '</div><div style="font-size:18px;font-weight:700">' + esc(title) + '</div>' +
    '<div style="font-size:12px;color:#cbd5e1">Selling day ' + p.day + ' of ' + p.total + ' · store ' + stF(s.sT) + (s.tT ? ' of ' + s.tT + ' · tracking ' + s.kT + ' (' + (s.status || "").toUpperCase() + ')' : '') + '</div></div>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;border:1px solid #e6ebf3"><tr><th ' + th + ' align="left">Salesperson</th><th ' + th + '>Target</th><th ' + th + '>Sold N · U</th><th ' + th + '>Sold</th><th ' + th + '>Tracking</th><th ' + th + '>%</th><th ' + th + '>Status</th><th ' + th + '>Need / day</th></tr>' + rows + '</table></div>';
  var text = name + " · " + title + "\nSelling day " + p.day + " of " + p.total + "\n\n" + [s].concat(p.people).map(function(r){
    return r.name + ": sold " + stF(r.sT) + " (N " + stF(r.sN) + " · U " + stF(r.sU) + ")" + (r.storeOnly || !r.tT ? "" : " · target " + r.tT + " · tracking " + r.kT + " · " + Math.round(r.pct*100) + "% · " + String(r.status || "").toUpperCase()); }).join("\n");
  return { subject:name + " · " + title, html:html, text:text };
}
function stModal(){
  if (!ST.modal) return "";
  var m = stEmailContent(ST.modal.what);
  return '<div class="st-modal" data-st="closemodal"><div data-st-stop="1"><div class="h"><b>Email: ' + esc(m.subject) + '</b><span style="display:flex;gap:6px;flex-wrap:wrap">' +
    '<button type="button" class="btn sm" data-st="closemodal">Close</button><button type="button" class="btn sm" data-st="copyhtml">Copy formatted</button><button type="button" class="btn sm" data-st="copytext">Copy plain text</button><button type="button" class="btn sm primary" data-st="mailto">Open in email app</button></span></div>' +
    '<div class="b"><div style="background:#fff;border-radius:10px;padding:10px;color:#0f172a;overflow:auto">' + m.html + '</div><p style="font-size:12px;color:var(--muted);margin:10px 0 0">“Open in email app” sends the plain-text version; use “Copy formatted” and paste into Gmail or Outlook to keep the table.</p></div></div></div>';
}
function stCopy(rich){
  var m = stEmailContent(ST.modal.what), done = false;
  try {
    if (rich && navigator.clipboard && window.ClipboardItem){
      navigator.clipboard.write([new ClipboardItem({ "text/html":new Blob([m.html], { type:"text/html" }), "text/plain":new Blob([m.text], { type:"text/plain" }) })]); done = true;
    } else if (navigator.clipboard){ navigator.clipboard.writeText(m.text); done = true; }
  } catch (e) { done = false; }
  toast(done ? "Copied. Paste it into your email." : "This browser blocked copying. Use Open in email app instead.", done ? "ok" : "err");
}
function stCsv(){
  var month = ST.month, list = stAllDeals().filter(function(d){ return String(d.soldDate || "").slice(0, 7) === month; }).sort(function(a, b){ return String(a.soldDate).localeCompare(String(b.soldDate)); });
  var q = function(v){ v = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var head = ["Date sold","Stock #","Customer #","Customer","Vehicle","Type","Deal","Salesperson","Split with","Share","F&I manager","Front gross","F&I gross","Lender","Lead source","Close","Stock source","Status","Delivered","Appointment","Trade","2nd T.O.","Security pack","Tire","Posted","Notes"];
  var lines = [head.join(",")].concat(list.map(function(d){ var sp = d.salespeople || [], fl = d.flags || {};
    return [d.soldDate, d.stockNo, d.customerNo, d.customer, d.vehicle, d.type, d.dealType, sp[0] && sp[0].name, sp[1] && sp[1].name, sp.length > 1 ? Math.round(sp[0].share*100) + "/" + Math.round(sp[1].share*100) : "",
      d.fiManager, d.frontGross, d.fiGross, d.lender, d.leadSource, d.closeType, d.stockSource, ST_LABEL[d.status], d.deliveredDate,
      fl.appt ? "Y" : "", fl.trade ? "Y" : "", fl.secondTO ? "Y" : "", fl.secPack ? "Y" : "", fl.tire ? "Y" : "", fl.posted ? "Y" : "", d.notes].map(q).join(","); }));
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type:"text/csv" }));
  a.download = (state.config.name || "Sales") + " sales log " + month + ".csv";
  document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---- the screen ---- */
function viewSalesTracker(){
  if (!stCan()) return '<div class="card"><div class="card-b">The Sales Tracker is for the General Manager and Sales Managers.</div></div>';
  stSync();
  var month = ST.view === "today" ? stToday().slice(0, 7) : ST.month;
  stLoad(month); stLoad(stShift(month, -1));
  var loading = ST.loading[month] || ST.loading[stShift(month, -1)];
  var body = ST.view === "perf" ? stViewPerf() : ST.view === "log" ? stViewLog() : ST.view === "tgt" ? stViewTargets() : stViewToday();
  return '<div class="stx">' + stSubnav() + (ST.err ? '<div class="st-err">' + esc(ST.err) + '</div>' : '') +
    (loading ? '<div class="st-warn" style="background:var(--info-bg);border-color:var(--blue);color:var(--blue)">Loading the sales log…</div>' : '') +
    body + stDrawer() + stModal() + '</div>';
}

/* ---- events (Sales Tracker elements carry data-st / data-stf / data-stt, so the app's own handlers ignore them) ---- */
function stAct(act, el){
  var v = el.getAttribute("data-v"), e = ST.edit;
  switch (act){
    case "view": ST.view = v; ST.err = null; if (v !== "today" && !ST.month) ST.month = stToday().slice(0, 7); window.scrollTo(0, 0); break;
    case "perfmode": ST.perf = v; break;
    case "add": stOpen(stBlank()); break;
    case "edit": { var d = ST.deals[el.getAttribute("data-id")]; if (d) stOpen(d); break; }
    case "close": ST.edit = null; break;
    case "set": if (e) e[el.getAttribute("data-k")] = v; break;
    case "status":
      if (e){ e.status = v; e.statusDates = e.statusDates || {}; if (!e.statusDates[v]) e.statusDates[v] = stToday();
        if ((v === "delivered" || v === "rdr") && !e.deliveredDate) e.deliveredDate = stToday(); }
      break;
    case "flag": if (e){ e.flags = e.flags || {}; e.flags[v] = !e.flags[v]; } break;
    case "save": stCommitEdit(); return;
    case "del":
      if (e) askConfirm("Delete this deal?", "Remove " + (e.customer || e.stockNo || "this deal") + " from the sales log. This can't be undone.", "Delete", function(){
        stDeleteDeal(e.id).then(function(){ ST.edit = null; toast("Deal deleted.","ok"); render(); }, function(err){ ST.editErr = "Couldn't delete: " + (err && err.message ? err.message : err); render(); }); });
      return;
    case "addperson": stDraft().people.push({ name:"", n:"", u:"" }); ST.tDirty = true; break;
    case "rmperson": stDraft().people.splice(Number(v), 1); ST.tDirty = true; break;
    case "day": {
      var t = stDraft(), plain = C.sellingDays(ST.month, { openWeekdays:t.openWeekdays }).days.filter(function(x){ return x.date === v; })[0];
      var nowOpen = C.sellingDays(ST.month, { closed:t.closed, open:t.open, openWeekdays:t.openWeekdays }).days.filter(function(x){ return x.date === v; })[0].open;
      t.closed = t.closed.filter(function(x){ return x !== v; }); t.open = t.open.filter(function(x){ return x !== v; });
      if (nowOpen && plain.open) t.closed.push(v); else if (!nowOpen && !plain.open) t.open.push(v);
      ST.tDirty = true; break; }
    case "copytargets": {
      var prev = stShift(ST.month, -1);
      stLoadTargets(prev).then(function(pt){
        if (!pt || !(pt.people || []).length){ toast("There are no targets for " + stMonthName(prev) + " to copy.","err"); return; }
        var t2 = stDraft(); t2.people = C.clone(pt.people); t2.gross = pt.gross; t2.rdr = pt.rdr; t2.countOn = pt.countOn || "sold"; ST.tDirty = true;
        toast("Copied " + stMonthName(prev) + "'s targets. Check them, then Save.","ok"); render();
      }, function(){ toast("Couldn't load last month's targets.","err"); });
      return; }
    case "savetargets": {
      var t3 = stDraft(), clean = { people:t3.people.filter(function(p){ return String(p.name || "").trim(); }).map(function(p){ return { name:stKey(p.name), n:Number(p.n) || 0, u:Number(p.u) || 0 }; }),
        gross:stNum(t3.gross) || 0, rdr:stNum(t3.rdr) || 0, countOn:t3.countOn === "delivered" ? "delivered" : "sold", closed:t3.closed.slice().sort(), open:t3.open.slice().sort() };
      if (t3.openWeekdays) clean.openWeekdays = t3.openWeekdays;
      ST.saving = true; render();
      stSaveTargets(ST.month, clean).then(function(){ ST.saving = false; ST.tDraft = null; ST.tDirty = false; toast(stMonthName(ST.month) + " targets saved.","ok"); render(); },
        function(err){ ST.saving = false; toast("Couldn't save the targets: " + (err && err.message ? err.message : err),"err"); render(); });
      return; }
    case "print": stPrint(el.getAttribute("data-what")); return;
    case "email": ST.modal = { what:el.getAttribute("data-what") }; break;
    case "closemodal": ST.modal = null; break;
    case "copyhtml": stCopy(true); return;
    case "copytext": stCopy(false); return;
    case "mailto": { var m = stEmailContent(ST.modal.what), w = null;
      try { w = window.open("mailto:?subject=" + encodeURIComponent(m.subject) + "&body=" + encodeURIComponent(m.text), "_blank"); } catch (x) { w = null; }
      if (!w) toast("The browser blocked the email app. Use Copy instead.","err"); return; }
    case "csv": stCsv(); return;
    default: return;
  }
  render();
}
document.addEventListener("click", function(ev){
  var el = ev.target && ev.target.closest ? ev.target.closest("[data-st],[data-st-stop]") : null;
  if (!el || !el.hasAttribute("data-st")) return;
  if (el.tagName === "INPUT" || el.tagName === "SELECT") return;
  ev.preventDefault();
  stAct(el.getAttribute("data-st"), el);
});
function stField(ev){
  var el = ev.target; if (!el || !el.getAttribute) return;
  var k = el.getAttribute("data-stf"), tk = el.getAttribute("data-stt");
  if (k){
    var val = el.type === "checkbox" ? el.checked : el.value;
    if (k === "month"){ if (ev.type !== "change") return; ST.month = val; ST.tDraft = null; ST.tDirty = false; render(); return; }
    if (k.indexOf("f.") === 0){ ST.f[k.slice(2)] = val; if (ev.type === "change" || k === "f.q") render(); return; }
    if (k.indexOf("e.") === 0 && ST.edit){
      ST.edit[k.slice(2)] = val;
      /* redraw only where the layout depends on it */
      if (ev.type === "change" && (k === "e._split" || k === "e.stockNo" || k === "e._sp1")) render();
    }
    return;
  }
  if (tk){
    var t = stDraft(), parts = tk.split(":");
    if (parts.length === 2) t.people[Number(parts[1])][parts[0]] = el.value; else t[tk] = el.value;
    ST.tDirty = true;
    if (ev.type === "change") render();
  }
}
document.addEventListener("input", stField);
document.addEventListener("change", stField);
document.addEventListener("keydown", function(ev){ if (ev.key === "Escape" && (ST.edit || ST.modal)){ ST.edit = null; ST.modal = null; render(); } });
