"use strict";
/* ---------------- TODAY, MONTH AT A GLANCE, GM OVERVIEW ----------------
   Laid out the way executive dashboards are read: a few headline numbers first (each against its target,
   with a trend), one main chart, then the exceptions that need attention, and the detail last.
   - Today (Sales Managers' morning meeting): headline numbers, the month's pace, open deals, today's
     deliveries, what needs attention, who needs help, and one tabbed list of deals.
   - Month at a glance (Sales Managers): the month's results, pace, weak links, salesperson leaderboard,
     deal mix, lead sources and week by week against last month.
   - Overview (GM dashboard): the financial statement's headline figures (net profit, gross, absorption,
     expenses) next to sales, departmental gross, the net profit trend and what needs the GM's attention. */
var GL_C = { blue:"#2563eb", teal:"#0f766e", amber:"#d97706", slate:"#94a3b8", red:"#dc2626", green:"#059669", violet:"#7c3aed", sky:"#0891b2" };
var GL_STATUS_C = { pending:"#eab308", approved:"#f97316", scheduled:"#2563eb", carry:"#eab308" };
function glK(v){ return insMoneyK(v); }
function glPct(v){ return v === null || v === undefined || isNaN(v) ? "—" : Math.round(v*100) + "%"; }
function glDelta(now, before, money){
  if (now === null || before === null || now === undefined || before === undefined) return "";
  var d = now - before; if (!d) return '<span class="gl-d flat">no change</span>';
  return '<span class="gl-d ' + (d > 0 ? "up" : "down") + '">' + (d > 0 ? "▲ " : "▼ ") + (money ? glK(Math.abs(d)) : Math.abs(Math.round(d*10)/10)) + '</span>';
}
/* a headline tile: label, value, sub-line, optional progress bar with a pace marker */
function glTile(label, value, sub, o){
  o = o || {};
  var bar = o.bar !== undefined && o.bar !== null ? '<div class="gl-bar"><i class="' + (o.barCls || "") + '" style="width:' + Math.max(0, Math.min(100, o.bar*100)).toFixed(1) + '%"></i>' + (o.mark !== undefined && o.mark !== null ? '<em style="left:' + (o.mark*100).toFixed(1) + '%"></em>' : '') + '</div>' : '';
  return '<div class="gl-tile' + (o.cls ? " " + o.cls : "") + '"><div class="gl-l">' + label + (o.badge || "") + '</div><div class="gl-v">' + value + (o.spark || "") + '</div>' + bar + '<div class="gl-s">' + (sub || "") + '</div></div>';
}
function glCard(ico, cls, title, sub, body, right){
  return '<div class="st-card gl-card"><div class="st-ch"><span class="st-ico ' + cls + '">' + ico + '</span><h3>' + title + (sub ? '<small>' + sub + '</small>' : '') + '</h3>' + (right ? '<span class="gl-right">' + right + '</span>' : '') + '</div>' + body + '</div>';
}
/* donut with given colours: parts [[label, n, colour]] */
function glDonut(parts, label){
  var r = 44, c = 2*Math.PI*r, off = 0, tot = parts.reduce(function(a, p){ return a + p[1]; }, 0), seg = "";
  parts.forEach(function(p){ if (!p[1]) return; var len = c*p[1]/tot;
    seg += '<circle cx="56" cy="56" r="' + r + '" fill="none" stroke="' + p[2] + '" stroke-width="16" stroke-dasharray="' + Math.max(0, len - (parts.filter(function(x){ return x[1]; }).length > 1 ? 2 : 0)).toFixed(1) + ' ' + c.toFixed(1) + '" stroke-dashoffset="' + (-off).toFixed(1) + '" transform="rotate(-90 56 56)"/>'; off += len; });
  return '<div class="gl-donut"><svg viewBox="0 0 112 112" width="112" height="112" aria-hidden="true"><circle cx="56" cy="56" r="' + r + '" fill="none" stroke="var(--surface-3)" stroke-width="16"/>' + seg +
    '<text x="56" y="56" text-anchor="middle" font-size="20" font-weight="800" fill="currentColor">' + tot + '</text><text x="56" y="72" text-anchor="middle" font-size="9.5" fill="#64748b" font-weight="600">' + esc(label) + '</text></svg>' +
    '<div class="gl-leg">' + parts.map(function(p){ return '<div><i style="background:' + p[2] + '"></i><span>' + esc(p[0]) + '</span><b>' + p[1] + '</b><em>' + (tot ? Math.round(p[1]/tot*100) : 0) + '%</em></div>'; }).join("") + '</div></div>';
}
/* one stacked bar: parts [[label, n, colour]] */
function glStack(parts, title){
  var tot = parts.reduce(function(a, p){ return a + p[1]; }, 0);
  return '<div class="gl-stack">' + (title ? '<div class="gl-stack-t">' + title + '</div>' : '') + '<div class="gl-stack-b">' + (tot ? parts.filter(function(p){ return p[1]; }).map(function(p){ return '<i title="' + esc(p[0]) + ': ' + p[1] + '" style="width:' + (p[1]/tot*100).toFixed(2) + '%;background:' + p[2] + '"></i>'; }).join("") : '<i style="width:100%;background:var(--surface-3)"></i>') + '</div>' +
    '<div class="gl-stack-l">' + parts.map(function(p){ return '<span><i style="background:' + p[2] + '"></i>' + esc(p[0]) + ' <b>' + p[1] + '</b>' + (tot ? ' <em>' + Math.round(p[1]/tot*100) + '%</em>' : '') + '</span>'; }).join("") + '</div></div>';
}
/* horizontal bars: rows [[label, value, colour, ghost(optional previous value)]], money or units */
function glHBars(rows, money){
  var mx = Math.max.apply(null, rows.map(function(r){ return Math.max(Math.abs(r[1] || 0), Math.abs(r[3] || 0)); }).concat([1]));
  return '<div class="gl-hbars">' + rows.map(function(r){ var v = r[1] || 0, w = Math.abs(v)/mx*100, g = r[3] === undefined || r[3] === null ? null : Math.abs(r[3])/mx*100;
    return '<div class="gl-hb"><span class="gl-hb-l">' + esc(r[0]) + '</span><span class="gl-hb-t">' + (g !== null ? '<em style="width:' + g.toFixed(1) + '%"></em>' : '') + '<i style="width:' + w.toFixed(1) + '%;background:' + (v < 0 ? GL_C.red : r[2]) + '"></i></span><b>' + (money ? glK(v) : stF(v)) + '</b></div>'; }).join("") + '</div>';
}
/* vertical bars: cols [[label, value, value2 (optional, lighter)]] */
function glVBars(cols, money, legend){
  var mx = Math.max.apply(null, cols.map(function(c){ return Math.max(Math.abs(c[1] || 0), Math.abs(c[2] || 0)); }).concat([1]));
  var W = 560, H = 190, B = 22, T = 14, step = W/cols.length, two = cols.some(function(c){ return c[2] !== undefined && c[2] !== null; }), bw = Math.min(two ? 22 : 36, step/(two ? 2.6 : 1.6)), out = "";
  var zero = H - B, hasNeg = cols.some(function(c){ return (c[1] || 0) < 0; });
  if (hasNeg) zero = T + (H - B - T)*(mx/(mx*2)) ;
  var scale = hasNeg ? (H - B - T)/(2*mx) : (H - B - T)/mx;
  cols.forEach(function(c, i){
    var x = i*step + step/2, v = c[1] || 0, v2 = c[2];
    var bar = function(val, bx, col, op){ var h = Math.abs(val)*scale, y = val >= 0 ? zero - h : zero; return '<rect x="' + bx.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" rx="3" fill="' + col + '"' + (op ? ' opacity="' + op + '"' : '') + '><title>' + esc(c[0]) + ': ' + (money ? stMoney(val) : stF(val)) + '</title></rect>'; };
    if (two && v2 !== undefined && v2 !== null) out += bar(v2, x - bw - 1, GL_C.slate, ".55");
    out += bar(v, two ? x + 1 : x - bw/2, v < 0 ? GL_C.red : GL_C.blue);
    out += '<text x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + esc(c[0]) + '</text>';
    if (v) out += '<text x="' + (two ? x + 1 + bw/2 : x).toFixed(1) + '" y="' + (v >= 0 ? zero - Math.abs(v)*scale - 4 : zero + Math.abs(v)*scale + 11).toFixed(1) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="currentColor">' + (money ? glK(v) : stF(v)) + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img"><line x1="0" x2="' + W + '" y1="' + zero.toFixed(1) + '" y2="' + zero.toFixed(1) + '" stroke="var(--border)"/>' + out + '</svg>' + (legend || '');
}
function glSpark(vals){ return vals.length > 1 ? '<span class="gl-spark">' + insSpark(vals) + '</span>' : ''; }

/* ---- what needs attention (deals) ---- */
function stAttention(month){
  var today = stToday(), all = stAllDeals(), open = all.filter(function(d){ return C.saleIsOpen(d); });
  var since = function(d, k){ return stDaysSince((d.statusDates && d.statusDates[k]) || d.soldDate); };
  var A = [
    { key:"overdue", sev:"r", label:"Scheduled deliveries past their date", deals:open.filter(function(d){ return d.status === "scheduled" && d.deliveryAt && String(d.deliveryAt).slice(0, 10) < today; }) },
    { key:"booking", sev:"o", label:"Approved 3+ days, delivery not booked", deals:open.filter(function(d){ return d.status === "approved" && since(d, "approved") > 3; }) },
    { key:"pending", sev:"o", label:"Pending more than a week", deals:open.filter(function(d){ return (d.status === "pending" || d.status === "carry") && since(d, "pending") > 7; }) },
    { key:"old", sev:"o", label:"Carry-overs older than 30 days", deals:open.filter(function(d){ return stDaysSince(d.soldDate) > 30; }) },
    { key:"declined", sev:"r", label:"Declined this month: worth another try?", deals:all.filter(function(d){ return d.status === "declined" && String(d.soldDate || "").slice(0, 7) === month; }) },
    { key:"losing", sev:"r", label:"Deals at $0 front gross or less", deals:all.filter(function(d){ return C.saleCounts(d) && String(d.soldDate || "").slice(0, 7) === month && d.frontGross !== null && d.frontGross !== undefined && d.frontGross !== "" && Number(d.frontGross) <= 0; }) }
  ];
  return A.filter(function(a){ return a.deals.length; });
}
/* ---- weak links (people and process) for the month ---- */
function stWeakLinks(month){
  var p = stPerf(month, "month"), cur = stToday().slice(0, 7), out = [];
  var agg = C.salesAgg(stAllDeals(), { from:month + "-01", to:month + "-31" }, "sold"), sp = agg.people, st = agg.store;
  var storeFront = st.units ? st.front/st.units : null;
  p.people.filter(function(x){ return !x.storeOnly && x.tT > 0 && x.pct !== null && x.pct < 0.9; }).sort(function(a, b){ return a.pct - b.pct; }).forEach(function(x){
    out.push({ sev:x.pct < 0.6 ? "r" : "o", who:x.name, text:"at " + Math.round(x.pct*100) + "% of target pace: " + stF(x.sT) + " sold of " + x.tT + (x.perDay !== null ? ", needs " + x.perDay.toFixed(1) + " a day" : "") }); });
  if (month === cur){
    var wk = C.localISO(new Date(new Date(stToday() + "T12:00:00").getTime() - 7*864e5));
    p.people.filter(function(x){ return !x.storeOnly && x.tT > 0; }).forEach(function(x){
      var recent = stAllDeals().some(function(d){ return C.saleCounts(d) && d.soldDate > wk && (d.salespeople || []).some(function(q){ return stKey(q.name) === x.name; }); });
      if (!recent) out.push({ sev:"o", who:x.name, text:"no deal in the last 7 days" }); });
  }
  Object.keys(sp).forEach(function(k){ var x = sp[k]; if (x.storeOnly) return;
    if (x.losingN >= 2) out.push({ sev:"r", who:k, text:x.losingN + " deals at $0 front or less (" + glK(x.losingAmt) + ")" });
    else if (storeFront !== null && storeFront > 0 && x.units >= 3 && x.front/x.units < storeFront*0.6) out.push({ sev:"o", who:k, text:"front gross " + stMoney(x.front/x.units) + " a vehicle, store average " + stMoney(storeFront) }); });
  var att = stAttention(month), wait = att.filter(function(a){ return a.key === "booking"; })[0], old = att.filter(function(a){ return a.key === "old"; })[0];
  if (wait) out.push({ sev:"o", who:"Process", text:wait.deals.length + " approved deal" + (wait.deals.length === 1 ? "" : "s") + " waiting 3+ days for a delivery booking" });
  if (old) out.push({ sev:"o", who:"Process", text:old.deals.length + " carry-over" + (old.deals.length === 1 ? "" : "s") + " older than 30 days" });
  return out;
}
function glWeakList(list, max){
  return list.length ? '<div class="gl-weak">' + list.slice(0, max || 8).map(function(w){ return '<div class="gl-wk ' + w.sev + '"><i></i><div><b>' + esc(w.who) + '</b> <span>' + esc(w.text) + '</span></div></div>'; }).join("") + '</div>'
    : '<div class="st-empty">Nothing stands out. Everyone is on pace and the pipeline is moving.</div>';
}

/* ================= TODAY ================= */
function stViewToday(){
  var month = stToday().slice(0, 7), t = stTargets(month), p = stPerf(month, "month"), s = p.store, today = stToday(), m = stMonthStats(month);
  var yd = new Date(today + "T12:00:00"); yd.setDate(yd.getDate() - 1); var yesterday = C.localISO(yd);
  var all = stAllDeals(), open = all.filter(function(d){ return C.saleIsOpen(d); }), carry = stCarry();
  var deliveredY = all.filter(function(d){ return (d.status === "delivered" || d.status === "rdr") && d.deliveredDate === yesterday; });
  var todayList = all.filter(function(d){ return (d.status === "scheduled" && String(d.deliveryAt || "").slice(0, 10) === today) || ((d.status === "delivered" || d.status === "rdr") && d.deliveredDate === today); })
    .sort(function(a, b){ return String(a.deliveryAt || "").localeCompare(String(b.deliveryAt || "")); });
  var save = all.filter(function(d){ return d.status === "pending" || d.status === "approved" || (d.status === "declined" && String(d.soldDate || "").slice(0, 7) === month); }).sort(function(a, b){ return a.status === "declined" ? -1 : b.status === "declined" ? 1 : 0; });
  var gross = s.front + s.fi, pvr = s.deals ? gross/s.deals : null, left = p.total - p.day, noTargets = !(t.people || []).length;
  var delivered = stDeliveredIn(month).length, carryDel = stCarryDelivered(month).length;
  var att = stAttention(month), help = p.people.filter(function(x){ return !x.storeOnly && x.tT > 0 && x.pct !== null && x.pct < 0.9; }).sort(function(a, b){ return a.pct - b.pct; });
  var pace = p.total ? p.day/p.total : null;
  var head = '<div class="gl-head"><div><div class="st-eyebrow">Sales Tracker · Today</div><h2>' + new Date(today + "T12:00:00").toLocaleDateString("en-CA", { weekday:"long", month:"long", day:"numeric" }) + '</h2>' +
      '<div class="st-hsub">' + esc(state.config.name || "") + ' · selling day ' + p.day + ' of ' + p.total + ' · ' + left + ' left</div></div>' +
    '<div class="st-actions"><button type="button" class="st-gbtn" data-st="add">+ Add a deal</button><button type="button" class="st-gbtn" data-st="email" data-what="today">Email</button><button type="button" class="st-gbtn primary" data-st="print" data-what="today">Print for the meeting</button></div></div>';
  var kpis = '<div class="gl-kpis">' +
    glTile("Sold this month", stF(s.sT) + (s.tT ? '<small> of ' + s.tT + '</small>' : ''), 'New ' + stF(s.sN) + ' · Used ' + stF(s.sU), { bar:s.tT ? s.sT/s.tT : null, mark:pace, barCls:s.status === "ahead" ? "ok" : s.status === "pace" ? "mid" : "bad", badge:s.tT ? stBadge(s.status) : "" }) +
    glTile("Projected finish", s.kT === null ? "—" : String(s.kT), s.tT && s.kT !== null ? (s.kT >= s.tT ? '<span class="gl-d up">▲ ' + (s.kT - s.tT) + ' over target</span>' : '<span class="gl-d down">▼ ' + (s.tT - s.kT) + ' short of ' + s.tT + '</span>') : 'set targets to see this') +
    glTile("Delivered this month", String(delivered), carryDel + ' from carry-overs · ' + todayList.length + ' today') +
    glTile("Needed per day", s.perDay === null ? "—" : s.perDay.toFixed(1), s.tT ? 'to reach ' + s.tT + ' in ' + left + ' days · so far ' + (p.day ? (s.sT/p.day).toFixed(1) : "—") + '/day' : 'set targets to see this') +
    glTile("Gross", glK(gross), (pvr !== null ? stMoney(pvr) + ' a vehicle' : 'no gross yet') + (t.gross ? ' · forecast ' + glK(t.gross) : ''), t.gross ? { bar:gross/t.gross, mark:pace, barCls:"ok" } : {}) +
  '</div>';
  var byStatus = ["pending","approved","scheduled"].map(function(k){ return [stLbl(k), open.filter(function(d){ return d.status === k || (k === "pending" && d.status === "carry"); }).length, GL_STATUS_C[k]]; });
  var other = open.length - byStatus.reduce(function(a, x){ return a + x[1]; }, 0); if (other > 0) byStatus.push(["Other", other, GL_C.slate]);
  var aging = [["0-7 days", 0, "#93c5fd"], ["8-30 days", 0, "#3b82f6"], ["31-60 days", 0, "#f59e0b"], ["60+ days", 0, "#dc2626"]];
  open.forEach(function(d){ var a = stDaysSince(d.soldDate); aging[a <= 7 ? 0 : a <= 30 ? 1 : a <= 60 ? 2 : 3][1]++; });
  var row2 = '<div class="gl-row gl-2-1">' +
    glCard("↗", "b", "Pace this month", "units sold against the target pace", stChart(m.cum, s.tT, p.total, s.kT), s.tT ? stBadge(s.status) : "") +
    glCard("◔", "p", "Open deals", "until delivered, cancelled or declined", glDonut(byStatus, "open") + glStack(aging, "Age since sold") + (carry.length ? '<div class="gl-note"><b>' + carry.length + '</b> carried over from earlier months</div>' : '')) + '</div>';
  var mini = function(list, lead, empty){ return list.length ? '<div class="st-items">' + list.slice(0, 5).map(function(d){ return stItem(d, lead ? lead(d) : ""); }).join("") + '</div>' + (list.length > 5 ? '<div class="st-empty">and ' + (list.length - 5) + ' more</div>' : '') : '<div class="st-empty">' + empty + '</div>'; };
  var todayCard = glCard("⏱", "b", "Deliveries", stDay(today) + " · yesterday " + deliveredY.length,
    '<div class="gl-sublab">Today <b>' + todayList.length + '</b></div>' + mini(todayList, function(d){ var done = d.status === "delivered" || d.status === "rdr", tm = String(d.deliveryAt || "").slice(11, 16);
      return stE(d, done ? "status" : "delivery", '<span class="st-time">' + (done ? "✓ done" : (tm ? new Date("2000-01-01T" + tm).toLocaleTimeString("en-CA", { hour:"numeric", minute:"2-digit" }) : "today")) + '</span>'); }, "Nothing booked for today.") +
    '<div class="gl-sublab">Delivered yesterday <b>' + deliveredY.length + '</b></div>' + mini(deliveredY, null, "None recorded for yesterday."));
  var attCard = glCard("!", "o", "Needs attention", "click one to see the deals", att.length ? '<div class="gl-att">' + att.map(function(a){
      return '<button type="button" class="gl-at ' + a.sev + (ST.todayFilter === a.key ? " on" : "") + '" data-st="todayfilter" data-v="' + a.key + '"><i></i><span>' + esc(a.label) + '</span><b>' + a.deals.length + '</b></button>'; }).join("") + '</div>'
    : '<div class="st-empty">Nothing overdue, stuck or losing money.</div>');
  var helpCard = glCard("▲", "r", "Who needs help", "under 90% of their target pace", noTargets ? '<div class="st-empty">Set targets to see who\'s behind.</div>' : help.length ? help.slice(0, 6).map(function(h){
      return '<div class="gl-help"><b>' + esc(h.name) + '</b><div>' + stTrack(h.sT, h.tT, p.day, p.total) + '<div class="t2">' + stF(h.sT) + ' of ' + h.tT + ' · tracking ' + h.kT + (h.perDay !== null ? ' · needs ' + h.perDay.toFixed(1) + '/day' : '') + '</div></div>' + stBadge(h.status) + '</div>'; }).join("") : '<div class="st-empty">Everyone is at 90% of target pace or better.</div>');
  var row3 = '<div class="gl-row gl-3">' + todayCard + attCard + helpCard + '</div>';
  /* one list of deals, tabbed */
  var f = ST.todayFilter ? att.filter(function(a){ return a.key === ST.todayFilter; })[0] : null;
  if (ST.todayFilter && !f) ST.todayFilter = null;
  var tab = f ? "att" : (ST.todayTab || "open");
  var lists = { open:open, carry:carry, save:save, att:f ? f.deals : [] };
  var list = lists[tab] || [], max = ST.todayAll ? 400 : 10;
  var tabs = [["open","Still to deliver", open.length], ["carry","Carry-overs", carry.length], ["save","Save-a-deal", save.length]];
  var lead = function(d){ return stE(d, "status", '<span class="st-pill ' + d.status + '">' + stLbl(d.status) + '</span>') + stFromPill(d); };
  var dealsCard = '<div class="st-card gl-card"><div class="gl-tabs">' + tabs.map(function(x){ return '<button type="button" data-st="todaytab" data-v="' + x[0] + '" class="' + (tab === x[0] ? "on" : "") + '">' + x[1] + ' <b>' + x[2] + '</b></button>'; }).join("") +
      (f ? '<button type="button" class="on att" data-st="todayfilter" data-v="">' + esc(f.label) + ' <b>' + f.deals.length + '</b> ✕</button>' : '') + '</div>' +
    (list.length ? '<div class="st-items">' + list.slice(0, max).map(function(d){
        var when = d.status === "scheduled" && d.deliveryAt ? stDay(d.deliveryAt) + " " + String(d.deliveryAt).slice(11, 16) : "";
        return stItem(d, lead(d), tab === "save" ? { noVehicle:true, after:stE(d, "notes", d.notes ? esc(d.notes) : '<span style="color:var(--muted)">' + (d.status === "approved" ? "Book the delivery" : "add a note") + '</span>', "st-note-c") }
          : { after:(when ? stE(d, "delivery", '<span class="st-when">' + esc(when) + '</span>') : '') + '<span class="st-days">' + stDaysSince(d.soldDate) + ' d</span>' }); }).join("") + '</div>' +
      (list.length > max ? '<button type="button" class="gl-more" data-st="todayall">Show all ' + list.length + '</button>' : ST.todayAll && list.length > 10 ? '<button type="button" class="gl-more" data-st="todayall">Show fewer</button>' : '')
      : '<div class="st-empty">' + (tab === "carry" ? "No carry-overs: everything from earlier months is delivered, cancelled or declined." : tab === "save" ? "Nothing waiting." : "Everything sold has been delivered.") + '</div>') + '</div>';
  return head + (noTargets ? stNewMonth(month, carry) : '') + kpis + row2 + row3 + dealsCard;
}

/* ================= MONTH AT A GLANCE ================= */
function stViewMonth(){
  var month = ST.month, prev = stShift(month, -1); stLoad(prev);
  var t = stTargets(month), p = stPerf(month, "month"), s = p.store, m = stMonthStats(month), gross = s.front + s.fi;
  var agg = C.salesAgg(stAllDeals(), { from:month + "-01", to:month + "-31" }, "sold"), aggP = C.salesAgg(stAllDeals(), { from:prev + "-01", to:prev + "-31" }, "sold");
  var pace = p.total ? p.day/p.total : null, delivered = stDeliveredIn(month).length;
  var pv = function(v, n){ return n ? stMoney(v/n) : "—"; };
  var head = '<div class="gl-head"><div><div class="st-eyebrow">Sales Tracker · Month at a glance</div><h2>' + stMonthName(month) + '</h2><div class="st-hsub">' + esc(state.config.name || "") + ' · selling day ' + p.day + ' of ' + p.total + ' · compared with ' + stMonthName(prev) + '</div></div>' +
    '<div class="st-actions">' + stMonthSelect() + '</div></div>';
  var kpis = '<div class="gl-kpis">' +
    glTile("Units sold", stF(s.sT) + (s.tT ? '<small> of ' + s.tT + '</small>' : ''), 'New ' + stF(s.sN) + ' · Used ' + stF(s.sU) + ' · last month ' + stF(aggP.store.units), { bar:s.tT ? s.sT/s.tT : null, mark:pace, barCls:s.status === "ahead" ? "ok" : s.status === "pace" ? "mid" : "bad", badge:s.tT ? stBadge(s.status) : "" }) +
    glTile("Projected finish", s.kT === null ? "—" : String(s.kT), s.tT && s.kT !== null ? (s.kT >= s.tT ? '<span class="gl-d up">▲ ' + (s.kT - s.tT) + ' over target</span>' : '<span class="gl-d down">▼ ' + (s.tT - s.kT) + ' short</span>') + ' · New ' + (s.kN === null ? "—" : s.kN) + ' · Used ' + (s.kU === null ? "—" : s.kU) : '') +
    glTile("Delivered", String(delivered), 'in ' + stMonthName(month).split(" ")[0] + ', whenever sold') +
    glTile("Gross per vehicle", pv(gross, s.deals), 'front ' + pv(s.front, s.deals) + ' · F&amp;I ' + pv(s.fi, s.deals) + ' · total ' + glK(gross), t.gross ? { bar:gross/t.gross, mark:pace, barCls:"ok" } : {}) +
    glTile("At $0 front or less", String(agg.store.losingN), agg.store.losingN ? glK(agg.store.losingAmt) + ' across those deals' : 'every deal made front gross', { cls:agg.store.losingN ? "warn" : "" }) +
  '</div>';
  var row2 = '<div class="gl-row gl-2-1">' + glCard("↗", "b", "Pace", "units sold against the target pace", stChart(m.cum, s.tT, p.total, s.kT), s.tT ? stBadge(s.status) : "") +
    glCard("!", "r", "Weak links", "people and process to work on", glWeakList(stWeakLinks(month), 8)) + '</div>';
  /* leaderboard */
  var people = p.people.filter(function(x){ return !x.storeOnly; }).sort(function(a, b){ return b.sT - a.sT; });
  var lb = '<div class="gl-lb"><div class="gl-lb-h"><span>Salesperson</span><span>Sold against target</span><span>Sold</span><span>Tracking</span><span>Front / veh</span><span>F&amp;I / veh</span><span>Status</span></div>' +
    people.map(function(x){ var a = agg.people[x.name] || {}, n = a.units || 0;
      return '<div class="gl-lb-r"><b>' + esc(x.name) + '</b><span>' + stTrack(x.sT, x.tT, p.day, p.total) + '</span><span><b>' + stF(x.sT) + '</b>' + (x.tT ? '<em> / ' + x.tT + '</em>' : '') + '</span><span>' + (x.kT === null ? "—" : x.kT) + '</span>' +
        '<span>' + (n ? stMoney(a.front/n) : "—") + '</span><span>' + (n ? stMoney(a.fi/n) : "—") + '</span><span>' + (x.tT ? stBadge(x.status) : '<span class="ins-sub">no target</span>') + '</span></div>'; }).join("") +
    '<div class="st-legend"><span>Bar: sold so far</span><span>Line: where they should be today</span></div></div>';
  /* mix, lead sources, week by week */
  var nu = [["New", m.nu[0][1], GL_C.blue], ["Used", m.nu[1][1], GL_C.teal], ["As-is", m.nu[2][1], GL_C.amber]];
  var flc = [["Finance", m.flc[0][1], GL_C.blue], ["Lease", m.flc[1][1], GL_C.violet], ["Cash", m.flc[2][1], GL_C.slate]];
  var rate = function(label, v){ return '<div class="gl-rate"><span>' + label + '</span><div class="gl-bar"><i class="ok" style="width:' + Math.round(v*100) + '%"></i></div><b>' + Math.round(v*100) + '%</b></div>'; };
  var mixCard = glCard("◐", "p", "Deal mix", m.n + " deals", glStack(nu, "Vehicle") + glStack(flc, "Deal type") + '<div class="gl-sublab">Attach and close rates</div>' +
    rate("Finance &amp; lease", m.finPct) + rate("Trade-ins", m.trade) + rate("Security pack", m.secPack) + rate("Tire &amp; wheel", m.tire) + rate("Be-back closes", m.beback));
  var lead = m.lead.slice().sort(function(a, b){ return b[1] - a[1]; });
  var leadCard = glCard("◎", "o", "Lead sources", "deals with a source entered", lead.length ? glHBars(lead.map(function(l, i){ return [l[0], l[1], [GL_C.blue, GL_C.teal, GL_C.violet, GL_C.amber, GL_C.sky, GL_C.slate][i % 6]]; }), false) : '<div class="st-empty">No lead sources entered yet.</div>');
  var wk = function(mo){ var w = [0,0,0,0,0]; stAllDeals().forEach(function(d){ if (!C.saleCounts(d) || String(d.soldDate || "").slice(0, 7) !== mo) return; var day = Number(d.soldDate.slice(8, 10)); w[Math.min(4, Math.floor((day - 1)/7))]++; }); return w; };
  var w1 = wk(month), w0 = wk(prev);
  var weekCard = glCard("▮", "b", "Week by week", "deals sold, this month against last", glVBars(["1-7","8-14","15-21","22-28","29+"].map(function(l, i){ return [l, w1[i], w0[i]]; }), false,
    '<div class="st-legend"><span><i style="background:' + GL_C.blue + '"></i>' + esc(stMonthName(month).split(" ")[0]) + '</span><span><i style="background:' + GL_C.slate + '"></i>' + esc(stMonthName(prev).split(" ")[0]) + '</span></div>'));
  return head + kpis + row2 + '<div class="st-card gl-card">' + '<div class="st-ch"><span class="st-ico g">▤</span><h3>Salesperson leaderboard<small>sold, pace and gross per vehicle</small></h3></div>' + lb + '</div>' +
    '<div class="gl-row gl-3">' + mixCard + leadCard + weekCard + '</div>';
}

/* ================= GM DASHBOARD · OVERVIEW and FINANCIALS ================= */
function insFinTrend(key, n){
  var ms = finMonths().slice(-(n || 12));
  return ms.map(function(m){ var k = finKpis(FIN.rows[m]); return [new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1, 12).toLocaleDateString("en-CA", { month:"short" }), k ? k[key] : null]; });
}
function insFinFlags(){
  var ms = finMonths(); if (!ms.length) return [];
  var cur = FIN.rows[ms[ms.length - 1]], prev = ms.length > 1 ? FIN.rows[ms[ms.length - 2]] : null, k = finKpis(cur), out = [], name = stMonthName(ms[ms.length - 1]).split(" ")[0];
  if (k.net !== null && k.net < 0) out.push({ sev:"r", who:"Net profit", text:"a loss of " + stMoney(-k.net) + " in " + name });
  if (k.expPct !== null && k.expPct > 0.9) out.push({ sev:"r", who:"Expenses", text:glPct(k.expPct) + " of gross in " + name });
  else if (k.expPct !== null && k.expPct > 0.8) out.push({ sev:"o", who:"Expenses", text:glPct(k.expPct) + " of gross in " + name });
  if (k.absorption !== null && k.absorption < 0.5) out.push({ sev:"o", who:"Absorption", text:"service, parts and body cover " + glPct(k.absorption) + " of expenses" });
  if (prev) FIN_DEPT_ORDER.forEach(function(dk){ var a = finDept(cur, dk), b = finDept(prev, dk); if (!a || !b) return; var g1 = finN(a.gross), g0 = finN(b.gross);
    if (g1 !== null && g0 && g0 > 0 && g1 < g0*0.9) out.push({ sev:"o", who:FIN_DEPT_LABEL[dk], text:"gross down " + Math.round((1 - g1/g0)*100) + "% on the month (" + glK(g1) + " vs " + glK(g0) + ")" }); });
  return out;
}
function insFinCta(){
  return '<div class="st-card gl-cta"><span class="st-ico g">▤</span><div><b>Add the monthly financial statement</b><div class="ins-sub">Net profit, departmental gross, expenses and absorption appear here once the statement is linked on Google Drive or uploaded. The AI reads any layout; you check the figures before saving.</div></div>' +
    '<span style="display:flex;gap:6px;flex-wrap:wrap"><label class="btn primary">Upload a statement<input type="file" accept=".xlsx,.xls,.xlsm,.csv,application/pdf,image/png,image/jpeg,image/webp" data-fin-file="1" style="display:none"></label><button type="button" class="btn" data-st="insfinset">Link it on Google Drive</button></span></div>';
}
function insViewOverview(I){
  finLoad();
  var month = I.cur, p = stPerf(month, "month"), s = p.store, ms = finMonths(), fm = ms.length ? ms[ms.length - 1] : null, r = fm ? FIN.rows[fm] : null, k = finKpis(r);
  var pr = ms.length > 1 ? FIN.rows[ms[ms.length - 2]] : null, kp = finKpis(pr), pace = p.total ? p.day/p.total : null, m = stMonthStats(month);
  var netTrend = insFinTrend("net", 12), fmName = fm ? stMonthName(fm) : "";
  var head = '<div class="gl-head"><div><div class="st-eyebrow">Dashboard · Overview</div><h2>' + esc(state.config.name || "") + '</h2><div class="st-hsub">' + stMonthName(month) + ' sales to date' + (fm ? ' · financial statement for ' + fmName : ' · no financial statement yet') + '</div></div>' +
    '</div>';
  var kpis = '<div class="gl-kpis">' +
    glTile("Net profit" + (fm ? ' · ' + fmName.split(" ")[0] : ''), k && k.net !== null ? glK(k.net) : "—", k && k.net !== null ? (kp && kp.net !== null ? glDelta(k.net, kp.net, true) + ' on the month' : '') + (k.netPct !== null ? ' · ' + glPct(k.netPct) + ' of sales' : '') : 'from the financial statement', { spark:glSpark(netTrend.map(function(x){ return x[1] || 0; })), cls:k && k.net !== null && k.net < 0 ? "warn" : "" }) +
    glTile("Total gross" + (fm ? ' · ' + fmName.split(" ")[0] : ''), k && k.gross !== null ? glK(k.gross) : "—", k && k.gross !== null ? (kp && kp.gross !== null ? glDelta(k.gross, kp.gross, true) + ' on the month' : '') + (k.grossPct !== null ? ' · ' + glPct(k.grossPct) + ' of sales' : '') : 'from the financial statement') +
    glTile("Units sold", stF(s.sT) + (s.tT ? '<small> of ' + s.tT + '</small>' : ''), esc(stMonthName(month).split(" ")[0]) + ' to date · tracking ' + (s.kT === null ? "—" : s.kT) + ' · ' + glK(s.front + s.fi) + ' gross logged', { bar:s.tT ? s.sT/s.tT : null, mark:pace, barCls:s.status === "ahead" ? "ok" : s.status === "pace" ? "mid" : "bad", badge:s.tT ? stBadge(s.status) : "" }) +
    glTile("Fixed absorption", k && k.absorption !== null ? glPct(k.absorption) : "—", k && k.absorption !== null ? 'service, parts and body gross ÷ total expenses' : 'needs departmental gross and expenses', { bar:k && k.absorption !== null ? Math.min(1, k.absorption) : null, barCls:k && k.absorption >= 0.6 ? "ok" : "mid" }) +
    glTile("Expenses", k && k.expenses !== null ? glK(k.expenses) : "—", k && k.expPct !== null ? glPct(k.expPct) + ' of gross' : 'from the financial statement', { bar:k && k.expPct !== null ? Math.min(1, k.expPct) : null, barCls:k && k.expPct > 0.85 ? "bad" : "ok" }) +
  '</div>';
  var deptRows = r ? FIN_DEPT_ORDER.map(function(dk){ var d = finDept(r, dk), b = finDept(pr, dk); return d && finN(d.gross) !== null ? [FIN_DEPT_LABEL[dk], finN(d.gross), [GL_C.blue, GL_C.teal, GL_C.violet, GL_C.amber, GL_C.sky, GL_C.green, GL_C.slate][FIN_DEPT_ORDER.indexOf(dk)], b ? finN(b.gross) : null] : null; }).filter(Boolean) : [];
  var row2 = fm ? '<div class="gl-row gl-2-1">' +
      glCard("▤", "b", "Gross by department", fmName + (pr ? " · grey = " + stMonthName(ms[ms.length - 2]).split(" ")[0] : ""), deptRows.length ? glHBars(deptRows, true) : '<div class="st-empty">The statement has no departmental gross.</div>') +
      glCard("$", "g", "Net profit by month", "from the financial statements", netTrend.some(function(x){ return x[1] !== null; }) ? glVBars(netTrend.map(function(x){ return [x[0], x[1]]; }), true) : '<div class="st-empty">No net profit figures yet.</div>') + '</div>'
    : insFinCta();
  var flags = insFinFlags().concat(stWeakLinks(month));
  var row3 = '<div class="gl-row gl-2-1">' + glCard("↗", "b", "Sales pace · " + stMonthName(month), "units sold against the target pace", stChart(m.cum, s.tT, p.total, s.kT), s.tT ? stBadge(s.status) : "") +
    glCard("!", "r", "Needs your attention", "financials, people and process", glWeakList(flags, 9)) + '</div>';
  return head + kpis + row2 + row3 + (fm ? insFinTable(fm) : '');
}
function insFinTable(fm){
  var r = FIN.rows[fm], ms = finMonths(), i = ms.indexOf(fm), pr = i > 0 ? FIN.rows[ms[i - 1]] : null, t = r.totals || {};
  var cell = function(v){ return v === null ? '<span class="ins-sub">—</span>' : stMoney(v); };
  var rows = FIN_DEPT_ORDER.map(function(dk){ var d = finDept(r, dk); if (!d) return ""; var sales = finN(d.sales), g = finN(d.gross), b = finDept(pr, dk), g0 = b ? finN(b.gross) : null;
    return '<tr><td class="l"><b>' + esc(FIN_DEPT_LABEL[dk] || d.name) + '</b></td><td class="r">' + cell(sales) + '</td><td class="r"><b>' + cell(g) + '</b></td><td class="r">' + (sales && g !== null ? glPct(g/sales) : "—") + '</td><td class="r">' + cell(finN(d.expenses)) + '</td><td class="r">' + cell(finN(d.net)) + '</td><td class="r">' + (g !== null && g0 !== null ? glDelta(g, g0, true) : "—") + '</td></tr>'; }).join("");
  return '<div class="st-card gl-card"><div class="st-ch"><span class="st-ico p">▥</span><h3>Departments · ' + esc(stMonthName(fm)) + '<small>' + esc((r._src || "") + (r._by ? " · saved by " + r._by : "")) + '</small></h3></div><div class="st-tw"><table class="fin-tbl"><thead><tr><th class="l">Department</th><th class="r">Sales</th><th class="r">Gross</th><th class="r">Gross %</th><th class="r">Expenses</th><th class="r">Net</th><th class="r">Gross on the month</th></tr></thead><tbody>' + rows +
    '<tr class="tot"><td class="l">Dealership</td><td class="r">' + cell(finN(t.sales)) + '</td><td class="r">' + cell(finN(t.gross)) + '</td><td class="r">' + (finN(t.sales) && finN(t.gross) !== null ? glPct(finN(t.gross)/finN(t.sales)) : "—") + '</td><td class="r">' + cell(finN(t.expenses)) + '</td><td class="r"><b>' + cell(finN(t.netProfit)) + '</b></td><td></td></tr></tbody></table></div></div>';
}
function insViewMoney(){
  finLoad();
  var ms = finMonths(), fm = FIN.month && FIN.rows[FIN.month] ? FIN.month : (ms.length ? ms[ms.length - 1] : null);
  var sel = ms.length ? '<select class="st-gsel" data-fin-sel="1">' + ms.slice().reverse().map(function(m){ return '<option value="' + m + '" ' + (m === fm ? "selected" : "") + '>' + stMonthName(m) + '</option>'; }).join("") + '</select>' : '';
  var head = '<div class="gl-head"><div><div class="st-eyebrow">Dashboard · Financials</div><h2>' + (fm ? stMonthName(fm) : "Financial statements") + '</h2><div class="st-hsub">' + esc(state.config.name || "") + ' · General Manager and Master only</div></div>' +
    '<div class="st-actions">' + sel + '<label class="st-gbtn">Upload a statement<input type="file" accept=".xlsx,.xls,.xlsm,.csv,application/pdf,image/png,image/jpeg,image/webp" data-fin-file="1" style="display:none"></label>' +
      (finCfg().link && finCfg().link.id ? '<button type="button" class="st-gbtn" data-fin-act="readlink">Read the linked statement</button>' : '<button type="button" class="st-gbtn" data-st="insfinset">Link on Google Drive</button>') + '<button type="button" class="st-gbtn" data-fin-act="type">Type the figures</button></div></div>';
  if (FIN.err) head += '<div class="st-err">' + esc(FIN.err) + '</div>';
  if (!fm) return head + finReview() + (FIN.read ? '' : insFinCta());
  var r = FIN.rows[fm], k = finKpis(r), i = ms.indexOf(fm), kp = i > 0 ? finKpis(FIN.rows[ms[i - 1]]) : null, op = r.operating || {};
  var kpis = '<div class="gl-kpis">' + glTile("Total sales", k.sales !== null ? glK(k.sales) : "—", kp && kp.sales !== null && k.sales !== null ? glDelta(k.sales, kp.sales, true) + ' on the month' : '') +
    glTile("Total gross", k.gross !== null ? glK(k.gross) : "—", (k.grossPct !== null ? glPct(k.grossPct) + ' of sales' : '') + (kp && kp.gross !== null && k.gross !== null ? ' · ' + glDelta(k.gross, kp.gross, true) : '')) +
    glTile("Expenses", k.expenses !== null ? glK(k.expenses) : "—", k.expPct !== null ? glPct(k.expPct) + ' of gross' : '') +
    glTile("Net profit", k.net !== null ? glK(k.net) : "—", (k.netPct !== null ? glPct(k.netPct) + ' of sales' : '') + (kp && kp.net !== null && k.net !== null ? ' · ' + glDelta(k.net, kp.net, true) : ''), { cls:k.net !== null && k.net < 0 ? "warn" : "" }) +
    glTile("Fixed absorption", k.absorption !== null ? glPct(k.absorption) : "—", 'service, parts and body gross ÷ expenses') + '</div>';
  var grossTrend = insFinTrend("gross", 12), netTrend = insFinTrend("net", 12);
  var trends = '<div class="gl-row gl-1-1">' + glCard("▮", "b", "Total gross by month", "", glVBars(grossTrend, true)) + glCard("$", "g", "Net profit by month", "", glVBars(netTrend, true)) + '</div>';
  var ops = FIN_OPS.filter(function(o){ return finN(op[o[0]]) !== null; });
  var opsCard = ops.length ? '<div class="st-card gl-card"><div class="st-ch"><span class="st-ico o">◷</span><h3>Operating figures<small>' + esc(stMonthName(fm)) + '</small></h3></div><div class="gl-ops">' +
    ops.map(function(o){ var v = finN(op[o[0]]); return '<div><span>' + esc(o[1]) + '</span><b>' + (/Expense|advertising|Interest/i.test(o[0]) ? stMoney(v) : stF(v)) + '</b></div>'; }).join("") + '</div></div>' : '';
  return head + finReview() + kpis + insFinTable(fm) + trends + opsCard;
}
document.addEventListener("change", function(ev){ var el = ev.target; if (el && el.getAttribute && el.getAttribute("data-fin-sel")){ FIN.month = el.value; render(); } });
