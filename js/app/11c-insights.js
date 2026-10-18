"use strict";
/* ---------------- DASHBOARD (INSIGHTS) ----------------
   The GM-level dashboard: month and year to date gross, units and deliveries, each salesperson's
   scorecard (growth, profit handling, holding gross, deals losing money) and year-end projections.
   It reads the Sales Tracker's log (typed in, never the Finance deals). GM and Master always see it;
   anyone else needs the Insights switch on their user card, and the database checks the same switch.
   The older Finance-office summary stays here as its own tab for GM and Master. */
var INS = { view:"mtd", year:null, loaded:{}, loading:{}, err:null };
function insCan(){ return V.isAdmin() || V.featureOn(V.currentUser(), "insights"); }
function insYear(mode){ return (mode || INS.view) === "ytd" && INS.year ? INS.year : Number(stToday().slice(0, 4)); }
/* One query for the year (plus the 5 months before it, for growth and trends), shared with the Sales Tracker. */
function insLoad(year){
  stSync();
  var key = ST.store + ":" + year;
  if (INS.loaded[key] || INS.loading[key]) return;
  if (!stOnline()){ INS.loaded[key] = true; return; }
  INS.loading[key] = true;
  var fromM = C.salesMonthAdd(year + "-01", -5), store = ST.store;
  Promise.all([
    fetchAllRows(function(){ return sb.from("sales_log").select("id,data").eq("dealership_id", store).gte("sold_on", fromM + "-01").lte("sold_on", year + "-12-31").order("id"); }),
    fetchAllRows(function(){ return sb.from("sales_targets").select("month,data").eq("dealership_id", store).gte("month", fromM).lte("month", year + "-12").order("month"); })
  ]).then(function(rs){
    INS.loading[key] = false;
    if (ST.store !== store) return;
    rs[0].forEach(function(r){ if (r.data && r.data.id) ST.deals[r.data.id] = r.data; });
    for (var m = fromM; m <= year + "-12"; m = stShift(m, 1)) ST.targetsLoaded[m] = true;
    rs[1].forEach(function(r){ ST.targets[r.month] = r.data; });
    INS.loaded[key] = true; INS.err = null; render();
  }, function(e){
    INS.loading[key] = false; INS.err = "Couldn't load the dashboard: " + (e && e.message ? e.message : e) + ". Check the connection and refresh."; render();
  });
}
function insData(year){
  return C.salesInsights({ deals:stAllDeals(), targets:ST.targets, year:year, today:stToday() });
}
function insMoneyK(v){ if (v === null || v === undefined) return "—"; var a = Math.abs(v), s = v < 0 ? "−" : "";
  return a >= 1e6 ? s + "$" + (a/1e6).toFixed(2) + "M" : a >= 1e4 ? s + "$" + (a/1e3).toFixed(1) + "k" : s + stMoney(a); }
function insSpark(a){
  if (!a.length) return "";
  var mx = Math.max.apply(null, a.concat([1])), w = 86, h = 24, n = Math.max(1, a.length - 1);
  var pts = a.map(function(v, i){ return (i*w/n).toFixed(1) + "," + (h - 3 - (v/mx)*(h - 6)).toFixed(1); }).join(" ");
  var up = a.length < 2 || a[a.length - 1] >= a[a.length - 2], col = up ? "#10b981" : "#94a3b8";
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"/>' +
    '<circle cx="' + w + '" cy="' + (h - 3 - (a[a.length - 1]/mx)*(h - 6)).toFixed(1) + '" r="2.6" fill="' + col + '"/></svg>';
}
function insGrowthPill(g){
  if (g === null || g === undefined) return '<span class="st-pill pending">new</span>';
  return '<span class="st-pill ' + (g >= 1 ? "delivered" : g >= 0.9 ? "scheduled" : "declined") + '">' + (g >= 1 ? "▲ " : "▼ ") + Math.round(g*100) + '%</span>';
}
function insSubnav(){
  var tabs = (V.isAdmin() ? [["overview","Overview"],["money","Financials"]] : []).concat([["mtd","Sales · month"],["ytd","Sales · year"]]);
  if (V.isAdmin()) tabs.push(["fi","F&I office"], ["brief","Morning brief"]);
  return '<div class="st-sub">' + tabs.map(function(t){ return '<button type="button" data-st="insview" data-v="' + t[0] + '" class="' + (INS.view === t[0] ? "on" : "") + '">' + t[1] + '</button>'; }).join("") +
    (aiCan() ? '<span style="margin-left:auto;display:flex;gap:5px"><button type="button" data-st="aimail">✉ Morning email</button><button type="button" data-st="aichat">✦ Ask AI</button></span>' : '') + '</div>';
}
function insPersonList(rows, right){
  return rows.length ? rows.map(function(p){ return '<div class="st-help ins-li">' + stAv(p.name) + '<b>' + esc(p.name) + '</b>' + right(p) + '</div>'; }).join("") : '<div class="st-empty">Nobody yet.</div>';
}
function insCards(I){
  var sc = I.scores.mtd.filter(function(p){ return p.dealUnits > 0; });
  var hold = sc.filter(function(p){ return p.frontPvr !== null; }).sort(function(a, b){ return b.frontPvr - a.frontPvr; }).slice(0, 3);
  var lose = I.scores.mtd.filter(function(p){ return p.losingN > 0; }).sort(function(a, b){ return b.losingN - a.losingN || a.losingAmt - b.losingAmt; }).slice(0, 3);
  var withG = I.scores.mtd.filter(function(p){ return p.growth !== null && p.growth !== undefined; });
  var grow = withG.filter(function(p){ return p.growth >= 1; }).sort(function(a, b){ return b.growth - a.growth; }).slice(0, 3);
  var slip = withG.filter(function(p){ return p.growth < 1; }).sort(function(a, b){ return a.growth - b.growth; }).slice(0, 3);
  var card = function(ico, cls, title, sub, n, body){ return '<div class="st-card"><div class="st-ch"><span class="st-ico ' + cls + '">' + ico + '</span><h3>' + title + '<small>' + sub + '</small></h3>' + (n !== null ? '<span class="cnt">' + n + '</span>' : '') + '</div>' + body + '</div>'; };
  return '<div class="st-g4">' +
    card("▲", "g", "Holding gross best", "front gross per vehicle", null, insPersonList(hold, function(p){ return '<span class="st-pill delivered">' + stMoney(p.frontPvr) + '</span>'; })) +
    card("▼", "r", "Losing money", "$0 front gross or less", I.mtd.losingN, lose.length ? insPersonList(lose, function(p){ return '<span class="st-pill declined">' + p.losingN + ' · ' + insMoneyK(p.losingAmt) + '</span>'; }) : '<div class="st-empty">No deals at $0 front gross or less.</div>') +
    card("↗", "b", "Growing", "pace against their 3-month average", null, grow.length ? insPersonList(grow, function(p){ return insGrowthPill(p.growth); }) : '<div class="st-empty">Nobody ahead of their average yet.</div>') +
    card("↘", "o", "Slipping", "pace against their 3-month average", null, slip.length ? insPersonList(slip, function(p){ return insGrowthPill(p.growth); }) : '<div class="st-empty">Nobody behind their average.</div>') +
  '</div>';
}
function insScoreTable(I, mode, forPrint){
  var rows = I.scores[mode], storePvr = mode === "ytd" ? I.ytd.frontPvr : I.mtd.frontPvr;
  var body = rows.map(function(p){
    return '<tr><td class="l"><span class="st-who">' + stAv(p.name) + esc(p.name) + '</span></td><td class="num"><b>' + stF(p.units) + '</b><div class="ins-sub">N ' + stF(p.N) + ' · U ' + stF(p.U) + '</div></td>' +
      (mode === "ytd" ? '<td class="num"><b>' + p.yearEnd + '</b></td>' : '<td>' + insGrowthPill(p.growth) + '<div class="ins-sub">last month ' + stF(p.last) + '</div></td>') +
      (forPrint ? '' : '<td title="Units, last 6 months · this month at its pace so far">' + insSpark(p.trend) + '</td>') +
      '<td class="r num"><b>' + (p.frontPvr === null ? "—" : stMoney(p.frontPvr)) + '</b></td><td class="r num">' + (p.fiPvr === null ? "—" : stMoney(p.fiPvr)) + '</td><td class="r num"><b>' + stMoney(p.total) + '</b></td>' +
      '<td>' + (p.hold === null ? '<span class="ins-sub">—</span>' : '<span class="st-pill ' + (p.hold >= 0 ? "delivered" : "declined") + '">' + (p.hold >= 0 ? "+" : "−") + stMoney(Math.abs(p.hold)) + '</span>') + '</td>' +
      '<td>' + (p.losingN ? '<span class="st-pill declined">' + p.losingN + ' deal' + (p.losingN === 1 ? "" : "s") + ' · ' + insMoneyK(p.losingAmt) + '</span>' : '<span class="ins-sub">none</span>') + '</td>' +
      (mode === "ytd" ? '' : '<td class="num"><b>' + p.yearEnd + '</b> <span class="ins-sub">units</span></td>') + '</tr>'; }).join("");
  return '<table><thead><tr><th class="l">Salesperson</th><th>Units</th>' + (mode === "ytd" ? '<th>Year-end</th>' : '<th>Growth</th>') + (forPrint ? '' : '<th>6-month trend</th>') +
    '<th class="r">Front / vehicle</th><th class="r">F&amp;I / vehicle</th><th class="r">Total gross</th><th>Holding gross</th><th>Losing money</th>' + (mode === "ytd" ? '' : '<th>Year-end</th>') + '</tr></thead><tbody>' +
    (body || '<tr><td colspan="10" class="st-empty" style="padding:16px">No salespeople yet: set targets or log deals in the Sales Tracker.</td></tr>') + '</tbody></table>' +
    '<div class="st-note">Holding gross = their front gross per vehicle against the store average (' + (storePvr === null ? "—" : stMoney(storePvr)) + '). Losing money = deals with front gross entered at $0 or less. ' +
    (mode === "ytd" ? 'Year-end = their units per selling day this year × the selling days in the year (from their first month, for someone who started later in the year).' : 'Growth = where they\'re tracking this month against their average for the last 3 months.') + ' Split deals split the gross the same way as the unit.</div>';
}
function insTable(I, mode){
  return '<div class="st-table"><div class="st-th"><div><h2>SALESPERSON SCORECARDS</h2><div class="st-hsub">' + (mode === "ytd" ? I.year + " year to date" : stMonthName(I.cur) + " to date") + ' · house deals count for the store only</div></div>' +
    '<div class="st-actions"><button type="button" class="st-gbtn" data-st="email" data-what="ins-' + mode + '">Email</button><button type="button" class="st-gbtn primary" data-st="print" data-what="ins-' + mode + '">Print</button></div></div>' +
    '<div class="st-tw">' + insScoreTable(I, mode) + '</div></div>';
}
function insHero(I, mode){
  var cur = I.all.filter(function(r){ return r.month === I.cur; })[0] || { used:0, total:0 }, m = I.mtd, y = I.ytd, pj = I.proj;
  var open = stAllDeals().filter(function(d){ return C.saleIsOpen(d); }).length;
  var yearSel = '<select class="st-gsel" data-stf="insYear" aria-label="Year">' + [0, 1, 2].map(function(i){ var yy = Number(stToday().slice(0, 4)) - i; return '<option value="' + yy + '" ' + (yy === I.year ? "selected" : "") + '>' + yy + '</option>'; }).join("") + '</select>';
  var top = function(eyebrow, title, sub, extra){ return '<div class="st-hero-top"><div><div class="st-eyebrow">' + eyebrow + '</div><h2>' + title + '</h2><div class="st-hsub">' + sub + '</div></div><div class="st-actions">' + (extra || "") +
    '<button type="button" class="st-gbtn" data-st="email" data-what="ins-' + mode + '">Email</button><button type="button" class="st-gbtn primary" data-st="print" data-what="ins-' + mode + '">Print</button></div></div>'; };
  if (mode === "ytd"){
    var first = I.months[0].month + "-01", lastD = I.cur === stToday().slice(0, 7) ? stToday() : I.cur + "-" + new Date(+I.cur.slice(0, 4), +I.cur.slice(5, 7), 0).getDate();
    var diff = pj.units.last3 !== null && pj.units.pace !== null ? pj.units.last3 - pj.units.pace : null;
    return '<div class="st-hero">' + top("Dashboard · Insights", I.year + " year to date", esc(state.config.name || "") + ' · ' + stDay(first) + ' – ' + stDay(lastD) + ' · selling day ' + I.usedDays + ' of ' + I.yearDays, yearSel) +
      '<div class="st-kpis first-wide"><div class="st-hk ring">' + stRing(pj.gross.pace ? y.gross/pj.gross.pace : 0, 104, "#86efac", "#16a34a", insMoneyK(y.gross), pj.gross.pace ? "of " + insMoneyK(pj.gross.pace) : "so far", true) +
        '<div><div class="l">Gross year to date</div><div class="v">' + insMoneyK(pj.gross.pace) + ' <small>year-end</small></div><div class="s">front ' + insMoneyK(y.front) + ' · F&amp;I ' + insMoneyK(y.fi) + '</div></div></div>' +
      '<div class="st-hk"><div class="l">Units</div><div class="v">' + stF(y.units) + '</div><div class="s">New ' + stF(y.N) + ' · Used ' + stF(y.U) + ' · ' + y.delivered + ' delivered</div></div>' +
      '<div class="st-hk"><div class="l">Year-end volume</div><div class="v">' + (pj.units.pace === null ? "—" : pj.units.pace) + '</div><div class="s">New ' + (pj.N.pace === null ? "—" : pj.N.pace) + ' · Used ' + (pj.U.pace === null ? "—" : pj.U.pace) + ' · this year\'s pace</div></div>' +
      '<div class="st-hk"><div class="l">At the last 3 months\' pace</div><div class="v">' + (pj.units.last3 === null ? "—" : pj.units.last3) + '</div><div class="s">' + (diff === null ? "" : '<span style="color:' + (diff >= 0 ? "var(--ok)" : "var(--danger)") + '">' + (diff >= 0 ? "▲ " : "▼ ") + Math.abs(diff) + ' units</span> · ') + 'gross ' + insMoneyK(pj.gross.last3) + '</div></div></div></div>';
  }
  var ringPct = m.grossTarget ? m.gross/m.grossTarget : (m.trackGross ? m.gross/m.trackGross : 0);
  return '<div class="st-hero">' + top("Dashboard · Insights", stMonthName(I.cur) + " to date", esc(state.config.name || "") + ' · selling day ' + cur.used + ' of ' + cur.total) +
    '<div class="st-kpis first-wide"><div class="st-hk ring">' + stRing(ringPct, 104, "#86efac", "#16a34a", insMoneyK(m.gross), m.grossTarget ? "of " + insMoneyK(m.grossTarget) : "so far", true) +
      '<div><div class="l">Gross</div><div class="v">' + insMoneyK(m.trackGross) + ' <small>tracking</small></div><div class="s">front ' + insMoneyK(m.front) + ' · F&amp;I ' + insMoneyK(m.fi) + '</div></div></div>' +
    '<div class="st-hk"><div class="l">Units sold</div><div class="v">' + stF(m.units) + '</div><div class="s">New ' + stF(m.N) + ' · Used ' + stF(m.U) + (m.trackUnits !== null && m.trackUnits !== undefined ? ' · tracking ' + m.trackUnits : '') + (m.target ? ' of ' + m.target : '') + '</div>' +
      (m.target ? '<div class="st-pace"><i style="width:' + Math.min(100, m.units/m.target*100) + '%"></i>' + (cur.total ? '<em style="left:' + (cur.used/cur.total*100) + '%"></em>' : '') + '</div>' : '') + '</div>' +
    '<div class="st-hk"><div class="l">Delivered</div><div class="v">' + m.delivered + '</div><div class="s">' + open + ' still to deliver, carry-overs included</div></div>' +
    '<div class="st-hk"><div class="l">Gross per vehicle</div><div class="v">' + (m.pvr === null ? "—" : stMoney(m.pvr)) + '</div><div class="s">front ' + (m.frontPvr === null ? "—" : stMoney(m.frontPvr)) + ' · F&amp;I ' + (m.fiPvr === null ? "—" : stMoney(m.fiPvr)) + '</div></div></div></div>';
}
/* Gross by month: logged months solid, the rest of the year at this year's pace in a lighter shade. */
function insGrossChart(I){
  var rate = I.proj.gross.pace && I.yearDays ? I.proj.gross.pace/I.yearDays : 0;
  var vals = I.months.map(function(r){ var proj = r.future ? rate*r.total : r.month === I.cur ? rate*(r.total - r.used) : 0; return { r:r, a:r.gross, p:proj }; });
  var mx = Math.max.apply(null, vals.map(function(v){ return v.a + v.p; }).concat([1])) * 1.1;
  var W = 640, H = 250, L = 46, R = 10, T = 10, B = 26, step = (W - L - R)/12, bw = step - 10, bars = "", grid = "";
  var nice = Math.pow(10, Math.floor(Math.log10(mx/4))), gs = Math.ceil(mx/4/nice)*nice;
  for (var g = 0; g <= mx; g += gs){ var gy = T + (H - T - B)*(1 - g/mx); grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" stroke="var(--border)"/><text x="' + (L - 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--muted)">' + (g >= 1e6 ? "$" + +(g/1e6).toFixed(2) + "M" : g >= 1e3 ? "$" + +(g/1e3).toFixed(1) + "k" : "$" + g) + '</text>'; }
  vals.forEach(function(v, i){
    var x = L + i*step + 5, ha = (H - T - B)*v.a/mx, hp = (H - T - B)*v.p/mx, base = H - B;
    if (v.a > 0) bars += '<rect x="' + x.toFixed(1) + '" y="' + (base - ha).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + ha.toFixed(1) + '" rx="4" fill="#2563eb"><title>' + stMonthName(v.r.month) + ': ' + stMoney(v.a) + '</title></rect>';
    if (v.p > 0) bars += '<rect x="' + x.toFixed(1) + '" y="' + (base - ha - hp).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hp.toFixed(1) + '" rx="4" fill="#a78bfa" opacity=".45"><title>' + stMonthName(v.r.month) + ' projected: ' + stMoney(v.p) + '</title></rect>';
    if (!v.r.future && !v.r.hasDeals && v.r.units > 0) bars += '<text x="' + (x + bw/2).toFixed(1) + '" y="' + (base - 6) + '" text-anchor="middle" font-size="9" fill="var(--muted)">units</text>';
    bars += '<text x="' + (x + bw/2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + new Date(+v.r.month.slice(0, 4), +v.r.month.slice(5, 7) - 1, 1, 12).toLocaleDateString("en-CA", { month:"short" }) + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img" aria-label="Gross by month"><defs><linearGradient id="insga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>' +
    '<linearGradient id="insgp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>' + grid + bars + '</svg>' +
    '<div class="st-legend"><span><i style="background:#2563eb"></i>Gross logged</span><span><i style="background:#a78bfa"></i>Projected at this year\'s pace</span>' + (I.proj.estimated ? '<span>"units" = month imported from Sales Performance (units only, no gross)</span>' : '') + '</div>';
}
function insUnitsChart(I){
  var vals = I.months, mx = Math.max.apply(null, vals.map(function(r){ return r.units; }).concat([1, I.months.reduce(function(a, r){ return Math.max(a, r.target); }, 0)])) * 1.12;
  var W = 1180, H = 190, L = 20, R = 10, T = 16, B = 26, step = (W - L - R)/12, bw = Math.min(64, step - 22), bars = "";
  vals.forEach(function(r, i){
    var x = L + i*step + (step - bw)/2, base = H - B, hn = (H - T - B)*r.N/mx, hu = (H - T - B)*r.U/mx;
    if (r.N) bars += '<rect x="' + x.toFixed(1) + '" y="' + (base - hn).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hn.toFixed(1) + '" fill="#3b82f6"><title>New ' + stF(r.N) + '</title></rect>';
    if (r.U) bars += '<rect x="' + x.toFixed(1) + '" y="' + (base - hn - hu).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hu.toFixed(1) + '" fill="#0f766e"><title>Used ' + stF(r.U) + '</title></rect>';
    if (r.target){ var ty = base - (H - T - B)*r.target/mx; bars += '<line x1="' + (x - 2).toFixed(1) + '" x2="' + (x + bw + 2).toFixed(1) + '" y1="' + ty.toFixed(1) + '" y2="' + ty.toFixed(1) + '" stroke="#f59e0b" stroke-width="2"/>'; }
    if (r.units) bars += '<text x="' + (x + bw/2).toFixed(1) + '" y="' + (base - hn - hu - 4).toFixed(1) + '" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor">' + stF(r.units) + '</text>';
    bars += '<text x="' + (x + bw/2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + new Date(+r.month.slice(0, 4), +r.month.slice(5, 7) - 1, 1, 12).toLocaleDateString("en-CA", { month:"short" }) + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img" aria-label="Units by month"><defs><linearGradient id="insun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93c5fd"/><stop offset="1" stop-color="#2563eb"/></linearGradient>' +
    '<linearGradient id="insuu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5eead4"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs><line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="var(--border)"/>' + bars + '</svg>' +
    '<div class="st-legend"><span><i style="background:#2563eb"></i>New</span><span><i style="background:#0f766e"></i>Used (incl. As-is)</span><span><i style="background:#f59e0b"></i>Target</span></div>';
}
function insProjCard(I){
  var pj = I.proj, y = I.ytd;
  var row = function(label, now, p, p3, fmt){ var pct = p ? Math.min(1, now/p) : 0;
    return '<div style="margin-top:12px"><div style="display:flex;font-size:12.5px;font-weight:600;gap:8px"><span>' + label + '</span><span style="margin-left:auto"><b>' + (p === null ? "—" : fmt(p)) + '</b> <span class="ins-sub">· ' + (p3 === null ? "—" : fmt(p3)) + '</span></span></div>' +
      '<div class="st-track" style="margin-top:5px"><i class="ok" style="width:' + (pct*100).toFixed(1) + '%"></i></div><div class="ins-sub" style="margin-top:3px">' + fmt(now) + ' so far</div></div>'; };
  var n = function(v){ return String(Math.round(v)); };
  return '<div class="st-card"><div class="st-ch"><span class="st-ico p">◎</span><h3>Year-end projection<small>this year\'s pace · last 3 months\' pace</small></h3></div>' +
    row("Gross", y.gross, pj.gross.pace, pj.gross.last3, insMoneyK) + row("New units", y.N, pj.N.pace, pj.N.last3, n) + row("Used units", y.U, pj.U.pace, pj.U.last3, n) + row("Deliveries", y.delivered, pj.delivered.pace, pj.delivered.last3, n) +
    '<div class="st-legend"><span>Pace = so far ÷ selling days used × ' + I.yearDays + ' selling days in ' + I.year + '.' + (pj.estimated || pj.estimatedUnits ? ' Months with nothing recorded are left out and estimated at the same pace' +
      (pj.unitsFrom ? ' (units from ' + stMonthName(pj.unitsFrom) + (pj.dataFrom && pj.dataFrom !== pj.unitsFrom ? ', gross and deliveries from ' + stMonthName(pj.dataFrom) : '') + ')' : '') + '. Import earlier months to sharpen it.' : '') + '</span></div></div>';
}
function insViewMtd(I){ return insHero(I, "mtd") + insCards(I) + insTable(I, "mtd"); }
function insViewYtd(I){
  return insHero(I, "ytd") +
    '<div class="st-g2" style="grid-template-columns:1.5fr 1fr"><div class="st-card"><div class="st-ch"><span class="st-ico b">▮</span><h3>Gross by month<small>' + I.year + ' · logged, then projected</small></h3></div>' + insGrossChart(I) + '</div>' + insProjCard(I) + '</div>' +
    '<div class="st-card" style="margin-top:16px"><div class="st-ch"><span class="st-ico g">▤</span><h3>Units by month<small>New and Used against target · months before the tracker come from the Sales Performance import</small></h3></div>' + insUnitsChart(I) + '</div>' +
    insTable(I, "ytd");
}
/* print and email */
function insSheet(mode){
  var I = insData(insYear(mode)), title = mode === "ytd" ? I.year + " year to date" : stMonthName(I.cur) + " to date";
  var hero = insHero(I, mode).replace(/<div class="st-actions">[\s\S]*?<\/div><\/div>/, "</div>");
  return hero + (mode === "mtd" ? insCards(I) : "") + '<div class="st-table"><div class="st-th"><div><h2>' + esc((state.config.name || "") + " · SALESPERSON SCORECARDS") + '</h2><div class="st-hsub">' + esc(title) + ' · printed ' +
    new Date().toLocaleString("en-CA", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) + '</div></div></div>' + insScoreTable(I, mode, true) + '</div>';
}
function insEmailContent(mode){
  var I = insData(insYear(mode)), name = state.config.name || "", P = mode === "ytd" ? I.ytd : I.mtd;
  var title = mode === "ytd" ? I.year + " year to date" : stMonthName(I.cur) + " to date";
  var td = 'style="padding:6px 8px;border-bottom:1px solid #e6ebf3;font-size:13px;text-align:center"', tdl = 'style="padding:6px 8px;border-bottom:1px solid #e6ebf3;font-size:13px;text-align:left;font-weight:700"';
  var th = 'style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e6ebf3"';
  var m0 = function(v){ return v === null || v === undefined ? "—" : stMoney(v); };
  var rows = I.scores[mode].map(function(p){ return '<tr><td ' + tdl + '>' + esc(p.name) + '</td><td ' + td + '>' + stF(p.units) + '</td><td ' + td + '>' + (mode === "ytd" ? p.yearEnd : (p.growth === null || p.growth === undefined ? "new" : Math.round(p.growth*100) + "%")) + '</td><td ' + td + '>' + m0(p.frontPvr) + '</td><td ' + td + '>' + m0(p.fiPvr) + '</td><td ' + td + '><b>' + stMoney(p.total) + '</b></td><td ' + td + '>' + (p.hold === null ? "—" : (p.hold >= 0 ? "+" : "−") + stMoney(Math.abs(p.hold))) + '</td><td ' + td + '>' + (p.losingN ? p.losingN + " · " + insMoneyK(p.losingAmt) : "none") + '</td></tr>'; }).join("");
  var head = mode === "ytd" ? "Gross " + stMoney(P.gross) + " · units " + stF(P.units) + " · year-end " + (I.proj.units.pace === null ? "—" : I.proj.units.pace) + " units, " + insMoneyK(I.proj.gross.pace) + " gross"
    : "Gross " + stMoney(P.gross) + " (tracking " + insMoneyK(P.trackGross) + ") · units " + stF(P.units) + " · delivered " + P.delivered;
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:780px"><div style="background:#0b1730;color:#fff;padding:14px 16px;border-radius:10px 10px 0 0"><div style="font-size:12px;color:#93c5fd;letter-spacing:.12em;text-transform:uppercase">' + esc(name) + ' · Insights</div><div style="font-size:18px;font-weight:700">' + esc(title) + '</div><div style="font-size:12px;color:#cbd5e1">' + esc(head) + '</div></div>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;border:1px solid #e6ebf3"><tr><th ' + th + ' align="left">Salesperson</th><th ' + th + '>Units</th><th ' + th + '>' + (mode === "ytd" ? "Year-end" : "Growth") + '</th><th ' + th + '>Front / veh</th><th ' + th + '>F&amp;I / veh</th><th ' + th + '>Total gross</th><th ' + th + '>Holding</th><th ' + th + '>Losing money</th></tr>' + rows + '</table></div>';
  var text = name + " · Insights · " + title + "\n" + head + "\n\n" + I.scores[mode].map(function(p){ return p.name + ": " + stF(p.units) + " units · total gross " + stMoney(p.total) + " · front/veh " + m0(p.frontPvr) + (p.losingN ? " · losing money on " + p.losingN : ""); }).join("\n");
  return { subject:name + " · Insights · " + title, html:html, text:text };
}
function viewInsights(){
  if (!insCan()) return '<div class="card"><div class="card-b">The dashboard needs the Insights switch. Ask your General Manager.</div></div>';
  if (INS.view === "fi" && V.isAdmin()) return '<div class="stx">' + insSubnav() + '</div>' + V.viewDashboard();
  if (INS.view === "brief" && V.isAdmin()) return '<div class="stx">' + insSubnav() + dsBanner() + viewBrief() + stModal() + '</div>';
  if (INS.view === "brief" || INS.view === "fi" || ((INS.view === "overview" || INS.view === "money") && !V.isAdmin())) INS.view = "mtd";
  if (!INS.picked && V.isAdmin() && INS.view === "mtd"){ INS.view = "overview"; INS.picked = true; }
  var year = insYear(); insLoad(year);
  var loading = INS.loading[ST.store + ":" + year];
  var I = insData(year);
  return '<div class="stx">' + insSubnav() + dsBanner() + (INS.err ? '<div class="st-err">' + esc(INS.err) + '</div>' : '') +
    (loading ? '<div class="st-warn" style="background:var(--info-bg);border-color:var(--blue);color:var(--blue)">Loading the year\'s sales…</div>' : '') +
    (INS.view === "ytd" ? insViewYtd(I) : INS.view === "overview" ? insViewOverview(I) : INS.view === "money" ? insViewMoney() : insViewMtd(I)) + stModal() + '</div>';
}
