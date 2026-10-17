"use strict";
/* ---------------- AI ASSISTANT (General Manager and Master only) ----------------
   - Morning brief: a Dashboard tab; written only when someone presses the button, saved for the day and
     shared by the GM and Master.
   - Chat: "AI Assistant" in the left pane (and "Ask AI" on the Dashboard) opens a chat panel on the right.
   - Morning email: a formatted report to copy into Outlook or Gmail; the AI only writes the short note.
   Every number is worked out here from the Sales Tracker; the AI is sent those numbers (salespeople's names,
   units, gross, pace; never customer details) and only writes words around them. Uses the same switch and
   monthly cap as AI file reading (Dealership settings › AI). */
var AIC = { open:false, msgs:[], busy:false, draft:"", err:null };
var AIB = { store:null, day:null, rec:null, loading:false, busy:false, err:null };
var AIM = null;
function aiCan(){ return V.isAdmin(); }
function aiOn(){ return !!(state.config && state.config.ai && state.config.ai.on); }
function aiMonth(){ return stToday().slice(0, 7); }
function aiAddDays(iso, n){ var d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return C.localISO(d); }
function aiLastSaturday(){ var d = new Date(stToday() + "T12:00:00"); do { d.setDate(d.getDate() - 1); } while (d.getDay() !== 6); return C.localISO(d); }
function aiWeekStart(){ var d = new Date(stToday() + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return C.localISO(d); }
function aiDayName(iso){ return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", { weekday:"long", month:"long", day:"numeric" }); }
/* load what the assistant needs: this month, last month, the year (Insights), carry-overs */
function aiEnsure(){
  stSync();
  var m = aiMonth(); stLoad(m); stLoad(stShift(m, -1)); stLoadCarry(); insLoad(Number(m.slice(0, 4)));
}
function aiReady(){ var m = aiMonth(); return !!(ST.months[m] && ST.months[stShift(m, -1)] && INS.loaded[ST.store + ":" + Number(m.slice(0, 4))] && ST.carryFor === m) || !stOnline(); }
function aiR1(v){ return v === null || v === undefined ? null : Math.round(v*10)/10; }
function aiR0(v){ return v === null || v === undefined ? null : Math.round(v); }
/* units per salesperson for a few days (sold date), and deliveries in those days */
function aiPeriod(from, to){
  var a = C.salesAgg(stAllDeals(), { from:from, to:to }, "sold"), people = {};
  Object.keys(a.people).forEach(function(k){ var p = a.people[k]; people[k] = { sold:aiR1(p.units), new:aiR1(p.N), used:aiR1(p.U), front:aiR0(p.front), fi:aiR0(p.fi) }; });
  var del = {}; stAllDeals().forEach(function(d){ if (!C.saleDelivered(d)) return; var dd = d.deliveredDate || d.soldDate; if (dd < from || dd > to) return;
    (d.salespeople || [{ name:"HOUSE", share:1 }]).forEach(function(s){ var k = stKey(s.name); del[k] = aiR1((del[k] || 0) + (Number(s.share) || 1)); }); });
  return { from:from, to:to, sold:a.store.units, new:a.store.N, used:a.store.U, delivered:a.store.delivered, front:aiR0(a.store.front), fi:aiR0(a.store.fi), people:people, deliveredBy:del };
}
/* everything the assistant knows about the store: numbers only, no customer details */
function aiFacts(){
  var today = stToday(), month = aiMonth(), p = stPerf(month, "month"), s = p.store, t = stTargets(month), I = insData(Number(month.slice(0, 4)));
  var sc = {}; I.scores.mtd.forEach(function(x){ sc[x.name] = x; });
  var monthDeals = stAllDeals().filter(function(d){ return String(d.soldDate || "").slice(0, 7) === month; });
  var cur = I.all.filter(function(r){ return r.month === month; })[0] || {}, prevM = stShift(month, -1);
  var prev = I.all.filter(function(r){ return r.month === prevM; })[0];
  var people = p.people.filter(function(x){ return !x.storeOnly; }).map(function(x){
    var z = sc[x.name] || {}, mine = monthDeals.filter(function(d){ return C.saleCounts(d) && (d.salespeople || []).some(function(q){ return stKey(q.name) === x.name; }); });
    var cnt = function(f){ var o = {}; mine.forEach(function(d){ var v = f(d); if (v) o[v] = (o[v] || 0) + 1; }); return o; };
    return { name:x.name, target:{ new:x.tN, used:x.tU, total:x.tT }, sold:{ new:x.sN, used:x.sU, total:x.sT }, tracking:x.kT, pctOfTarget:x.pct === null ? null : Math.round(x.pct*100), status:x.status,
      neededPerDay:x.perDay === null ? null : aiR1(x.perDay), lastMonthUnits:z.last === undefined ? null : aiR1(z.last), avgLast3Months:z.avg3 === undefined ? null : aiR1(z.avg3),
      paceVs3MonthAvgPct:z.growth === null || z.growth === undefined ? null : Math.round(z.growth*100), frontPerVehicle:aiR0(z.frontPvr), fiPerVehicle:aiR0(z.fiPvr), totalGross:aiR0(z.total),
      frontPerVehicleVsStore:aiR0(z.hold), dealsAtOrBelowZeroFront:z.losingN || 0, amountOnThoseDeals:aiR0(z.losingAmt), yearEndUnitsProjection:z.yearEnd || 0,
      closeTypes:cnt(function(d){ return d.closeType; }), leadSources:cnt(function(d){ return d.leadSource; }), dealTypes:cnt(function(d){ return d.dealType; }),
      tradeIns:mine.filter(function(d){ return d.flags && d.flags.trade; }).length };
  });
  var deals = monthDeals.map(function(d){ return { sold:d.soldDate, stock:d.stockNo, vehicle:d.vehicle, type:d.type, deal:d.dealType, salespeople:(d.salespeople || []).map(function(q){ return q.name + (q.share < 1 ? " " + Math.round(q.share*100) + "%" : ""); }).join(" + "),
    status:stLbl(d.status), delivered:d.deliveredDate || "", front:d.frontGross, fi:d.fiGross, leadSource:d.leadSource || "", close:d.closeType || "" }; });
  var carry = stCarry().map(function(d){ return { sold:d.soldDate, stock:d.stockNo, vehicle:d.vehicle, salesperson:(d.salespeople && d.salespeople[0] && d.salespeople[0].name) || "", status:stLbl(d.status), daysSinceSold:stDaysSince(d.soldDate), deliveryBooked:d.deliveryAt || "" }; });
  var yd = aiAddDays(today, -1), sat = aiLastSaturday();
  return {
    store:state.config.name || "", today:today, weekday:new Date(today + "T12:00:00").toLocaleDateString("en-CA", { weekday:"long" }),
    month:{ name:stMonthName(month), sellingDay:p.day, sellingDays:p.total, sellingDaysLeft:p.total - p.day, countsOn:p.countOn,
      target:{ new:s.tN, used:s.tU, total:s.tT }, sold:{ new:s.sN, used:s.sU, total:s.sT }, tracking:{ new:s.kN, used:s.kU, total:s.kT }, status:s.status, neededPerDay:s.perDay === null ? null : aiR1(s.perDay),
      gross:{ front:aiR0(s.front), fi:aiR0(s.fi), total:aiR0(s.front + s.fi), forecast:t.gross || null, tracking:I.mtd.trackGross }, perVehicle:{ front:aiR0(I.mtd.frontPvr), fi:aiR0(I.mtd.fiPvr), total:aiR0(I.mtd.pvr) },
      delivered:I.mtd.delivered, dealsAtOrBelowZeroFront:I.mtd.losingN },
    lastMonth:prev ? { name:stMonthName(prevM), units:aiR1(prev.units), new:aiR1(prev.N), used:aiR1(prev.U), gross:aiR0(prev.gross), delivered:prev.delivered } : null,
    yesterday:Object.assign({ date:yd }, aiPeriod(yd, yd)), lastSaturday:Object.assign({ date:sat }, aiPeriod(sat, sat)), thisWeek:aiPeriod(aiWeekStart(), today),
    today:{ deliveriesBooked:stAllDeals().filter(function(d){ return d.status === "scheduled" && String(d.deliveryAt || "").slice(0, 10) === today; }).length },
    salespeople:people, carryOvers:carry, carryOversDeliveredThisMonth:stCarryDelivered(month).length, dealsThisMonth:deals,
    yearToDate:{ year:I.year, units:aiR1(I.ytd.units), gross:aiR0(I.ytd.gross), delivered:I.ytd.delivered,
      yearEndProjection:{ units:I.proj.units.pace, new:I.proj.N.pace, used:I.proj.U.pace, gross:I.proj.gross.pace, delivered:I.proj.delivered.pace, atLast3MonthsPaceUnits:I.proj.units.last3 } } };
}
/* tiny, safe formatting for AI text: **bold**, numbered and "- " lists, paragraphs */
function aiMd(t){
  var out = [], list = null;
  var inline = function(x){ return esc(x).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>"); };
  var close = function(){ if (list){ out.push("</" + list + ">"); list = null; } };
  String(t || "").split(/\n/).forEach(function(line){
    var l = line.trim(), m;
    if (!l){ close(); return; }
    if ((m = l.match(/^\d+[.)]\s+(.*)$/))){ if (list !== "ol"){ close(); out.push("<ol>"); list = "ol"; } out.push("<li>" + inline(m[1]) + "</li>"); return; }
    if ((m = l.match(/^[-•*]\s+(.*)$/))){ if (list !== "ul"){ close(); out.push("<ul>"); list = "ul"; } out.push("<li>" + inline(m[1]) + "</li>"); return; }
    close(); out.push("<p>" + inline(l) + "</p>");
  });
  close(); return out.join("");
}
function aiOffNote(){ return '<div class="ai-off">AI is switched off for this dealership. ' + (V.isAdmin() ? 'Turn it on in Dealership settings › AI.' : '') + '</div>'; }

/* ---- morning brief (Dashboard tab) ---- */
function aiBriefLoad(){
  var today = stToday();
  if (AIB.store === ST.store && AIB.day === today) return;
  AIB.store = ST.store; AIB.day = today; AIB.rec = null; AIB.err = null;
  if (!stOnline()) return;
  AIB.loading = true; var store = ST.store;
  sb.from("sales_ai_briefs").select("data,created_at").eq("dealership_id", store).eq("day", today).then(function(r){
    AIB.loading = false; if (ST.store !== store) return; AIB.rec = r.data && r.data[0] ? r.data[0].data : null; render(); });
}
function aiFigures(){
  var f = aiFacts(), m = f.month, y = f.yesterday;
  return [["Yesterday", stF(y.sold), "sold · " + y.delivered + " delivered"], ["Month", stF(m.sold.total), m.target.total ? "tracking " + (m.tracking.total === null ? "—" : m.tracking.total) + " of " + m.target.total : "no target set"],
    ["Needed / day", m.neededPerDay === null ? "—" : m.neededPerDay.toFixed(1), m.sellingDaysLeft + " selling days left"], ["Gross", insMoneyK(m.gross.total), m.gross.forecast ? "tracking " + insMoneyK(m.gross.tracking) + " of " + insMoneyK(m.gross.forecast) : "front " + insMoneyK(m.gross.front) + " · F&I " + insMoneyK(m.gross.fi)],
    ["At $0 or less", String(m.dealsAtOrBelowZeroFront), "deals this month"]];
}
function aiBriefWrite(){
  if (AIB.busy) return;
  if (!aiReady()){ toast("Still loading the store's numbers. Try again in a moment.", "err"); return; }
  AIB.busy = true; AIB.err = null; render();
  var figures = aiFigures();
  stAiCall({ dealershipId:ST.store, kind:"brief", day:stToday(), facts:aiFacts(), figures:figures }).then(function(r){
    AIB.busy = false; AIB.rec = { brief:r.result, figures:figures, by:V.currentUser().name, at:new Date().toISOString(), cost:r.cost }; render();
  }).catch(function(e){ AIB.busy = false; AIB.err = e.message; render(); });
}
function viewBrief(){
  aiEnsure(); aiBriefLoad();
  if (!aiOn()) return aiOffNote();
  var rec = AIB.rec, b = rec && rec.brief;
  var head = '<div class="st-hero"><div class="st-hero-top"><div><div class="st-eyebrow">Dashboard · Morning brief</div><h2>' + esc(aiDayName(stToday())) + '</h2><div class="st-hsub">' + esc(state.config.name || "") +
    (rec ? ' · written ' + esc(new Date(rec.at).toLocaleTimeString("en-CA", { hour:"numeric", minute:"2-digit" })) + (rec.by ? ' by ' + esc(rec.by) : '') : ' · written by AI from the Sales Tracker\'s numbers when you ask') + '</div></div>' +
    '<div class="st-actions">' +
    (rec ? '<button type="button" class="st-gbtn" data-st="aibrief"' + (AIB.busy ? " disabled" : "") + '>' + (AIB.busy ? "Writing…" : "Write a new one") + '</button>' : '') + '</div></div></div>';
  if (AIB.err) head += '<div class="st-err">' + esc(AIB.err) + '</div>';
  if (!rec){
    return head + '<div class="st-card ai-brief-empty"><span class="st-ico p">✦</span><div><b>Today\'s brief hasn\'t been written yet.</b><div class="ins-sub" style="font-size:12px;margin-top:2px">The AI reads this month\'s numbers (sales, pace, gross, carry-overs; never customer details) and writes what\'s working, what needs attention and who needs help today. It\'s saved for the day, so the GM and Master see the same one.</div></div>' +
      '<button type="button" class="btn primary" data-st="aibrief"' + (AIB.busy || AIB.loading ? " disabled" : "") + '>' + (AIB.busy ? "Writing the brief…" : "✦ Write today's brief") + '</button></div>' +
      (AIB.busy ? '<div class="st-ai-prog"><i></i></div>' : '') + (aiReady() ? '' : '<div class="ins-sub" style="margin-top:6px">Loading the store\'s numbers…</div>');
  }
  var figs = rec.figures || [];
  return head + '<div class="ai-brief-grid"><div class="st-card ai-brief"><div class="ai-figs">' + figs.map(function(f){ return '<div class="st-hk"><div class="l">' + esc(f[0]) + '</div><div class="v">' + esc(f[1]) + '</div><div class="s">' + esc(f[2]) + '</div></div>'; }).join("") + '</div>' +
    '<h3 class="ai-head">' + esc(b.headline || "") + '</h3>' +
    '<p><b>What\'s working.</b> ' + esc(b.working || "") + '</p><p><b>Needs attention.</b> ' + esc(b.attention || "") + '</p>' +
    ((b.help || []).length ? '<p><b>Who needs help today.</b></p><ul>' + b.help.map(function(h){ return '<li><b>' + esc(h.name) + '</b>: ' + esc(h.text) + '</li>'; }).join("") + '</ul>' : '') +
    '<p><b>One thing for today.</b> ' + esc(b.today || "") + '</p>' +
    '<div class="ai-ask"><input class="st-gsel" data-stf="aiBriefQ" placeholder="Ask a follow-up, e.g. what should Bilal do differently?" value="' + esc(AIC.briefQ || "") + '"><button type="button" class="btn primary" data-st="aibriefask">Ask</button></div>' +
    '<div class="ins-sub" style="margin-top:8px">The figures in the boxes come from the Sales Tracker. The wording is written by AI from those figures; check anything that matters before acting on it.</div></div>' +
    '<div class="st-card"><div class="st-ch"><span class="st-ico r">▲</span><h3>Needs help<small>from the brief</small></h3></div>' +
      ((b.help || []).length ? b.help.map(function(h){ return '<div class="st-help ins-li">' + stAv(h.name) + '<b>' + esc(h.name) + '</b><span></span></div>'; }).join("") : '<div class="st-empty">Nobody flagged.</div>') +
      '<div class="st-ch" style="margin-top:12px"><span class="st-ico b">⏱</span><h3>Today<small>from the Sales Tracker</small></h3></div>' +
      '<div class="ins-sub" style="font-size:12px">' + (function(){ var f = aiFacts(); return f.today.deliveriesBooked + ' deliver' + (f.today.deliveriesBooked === 1 ? "y" : "ies") + ' booked · ' + f.carryOvers.length + ' carry-over' + (f.carryOvers.length === 1 ? "" : "s") + ' open'; })() + '</div></div></div>';
}

/* ---- chat (right-hand panel) ---- */
var AI_CHIPS = ["Who needs help this week, and what should I do with each?", "How can our weakest salesperson improve?", "Where are we losing gross?", "What should I cover in tomorrow's morning meeting?", "Plan for this Saturday", "Compare New and Used this month"];
function aiSend(q){
  q = String(q || "").trim(); if (!q || AIC.busy) return;
  if (!aiOn()){ toast("AI is switched off. Turn it on in Dealership settings › AI.", "err"); return; }
  if (!aiReady()){ toast("Still loading the store's numbers. Try again in a moment.", "err"); return; }
  AIC.msgs.push({ role:"user", content:q }); AIC.draft = ""; AIC.busy = true; AIC.err = null; AIC.scroll = true; render();
  stAiCall({ dealershipId:ST.store, kind:"chat", facts:aiFacts(), messages:AIC.msgs.map(function(m){ return { role:m.role, content:m.content }; }) }).then(function(r){
    AIC.busy = false; AIC.msgs.push({ role:"assistant", content:String(r.result || ""), cost:r.cost }); AIC.scroll = true; render();
  }).catch(function(e){ AIC.busy = false; AIC.err = e.message; AIC.msgs.pop(); AIC.draft = q; render(); });
}
function aiChatPanel(){
  if (!AIC.open || !aiCan() || !state.config) return "";
  aiEnsure();
  var body = !aiOn() ? aiOffNote() : (AIC.msgs.length ? AIC.msgs.map(function(m){ return '<div class="ai-msg ' + (m.role === "user" ? "u" : "a") + '">' + (m.role === "user" ? esc(m.content).replace(/\n/g, "<br>") : aiMd(m.content)) + '</div>'; }).join("") :
    '<div class="ai-hello"><b>Ask about ' + esc(state.config.name || "the store") + '</b><div>Answers come from this store\'s Sales Tracker: units, pace, gross, lead sources, close types and carry-overs. Customer details are never sent.</div></div>' +
    '<div class="ai-chips">' + AI_CHIPS.map(function(c){ return '<button type="button" data-st="aichip" data-v="' + esc(c) + '">' + esc(c) + '</button>'; }).join("") + '</div>') +
    (AIC.busy ? '<div class="ai-msg a ai-typing"><i></i><i></i><i></i></div>' : '');
  if (AIC.scroll){ AIC.scroll = false; setTimeout(function(){ var l = document.querySelector(".ai-log"); if (l) l.scrollTop = l.scrollHeight; }, 0); }
  return '<aside class="ai-panel" role="dialog" aria-label="AI Assistant"><div class="ai-ph"><span class="st-ico p">✦</span><div><b>AI Assistant</b><div class="ai-sub">' + esc(state.config.name || "") + ' · GM and Master only</div></div>' +
    '<span class="ai-pa">' + (AIC.msgs.length ? '<button type="button" class="btn sm ghost" data-st="aiclear">New chat</button>' : '') + '<button type="button" class="btn sm" data-st="aichat" aria-label="Close">✕</button></span></div>' +
    '<div class="ai-log">' + body + '</div>' + (AIC.err ? '<div class="st-err" style="margin:0 12px 8px">' + esc(AIC.err) + '</div>' : '') +
    (aiOn() ? '<div class="ai-pf"><textarea rows="2" data-stf="aiDraft" placeholder="Ask about the store, a salesperson or the month…">' + esc(AIC.draft) + '</textarea><button type="button" class="btn primary" data-st="aisend"' + (AIC.busy ? " disabled" : "") + '>Send</button></div>' +
      '<div class="ai-foot">' + (aiReady() ? 'Sends salespeople\'s names and the store\'s numbers only. Each question is a few cents.' : 'Loading the store\'s numbers…') + '</div>' : '') + '</aside>';
}

/* ---- morning email (copy, formatted) ---- */
function aiMailOpen(){ aiEnsure(); AIM = { period:"yesterday", who:"team", tone:"encouraging", gross:false, note:"", noteKey:"", busy:false, err:null }; }
function aiMailRange(){
  var t = stToday(), y = aiAddDays(t, -1);
  return AIM.period === "saturday" ? { from:aiLastSaturday(), to:aiLastSaturday(), label:aiDayName(aiLastSaturday()), short:"Saturday" } :
    AIM.period === "week" ? { from:aiWeekStart(), to:t, label:"Week of " + stDay(aiWeekStart()), short:"This week" } :
    AIM.period === "month" ? { from:aiMonth() + "-01", to:t, label:stMonthName(aiMonth()) + " to date", short:"Month" } : { from:y, to:y, label:aiDayName(y), short:"Yesterday" };
}
function aiMailData(){
  var R = aiMailRange(), P = aiPeriod(R.from, R.to), month = aiMonth(), perf = stPerf(month, "month");
  var rows = perf.people.filter(function(x){ return !x.storeOnly && (AIM.who === "team" || x.name === AIM.who); }).map(function(x){
    var pp = P.people[x.name] || {}; return { name:x.name, new:pp.new || 0, used:pp.used || 0, period:pp.sold || 0, delivered:P.deliveredBy[x.name] || 0, front:pp.front || 0, fi:pp.fi || 0, month:x.sT, target:x.tT, tracking:x.kT, status:x.status }; });
  if (AIM.who === "team") rows.sort(function(a, b){ return b.period - a.period || b.month - a.month; });
  var s = perf.store, me = AIM.who === "team" ? null : rows[0];
  return { range:R, rows:rows, single:me, store:{ period:P.sold, new:P.new, used:P.used, delivered:P.delivered, front:P.front, fi:P.fi, month:s.sT, target:s.tT, tracking:s.kT, status:s.status, day:perf.day, total:perf.total },
    deals:AIM.who === "team" ? [] : stAllDeals().filter(function(d){ return C.saleCounts(d) && d.soldDate >= R.from && d.soldDate <= R.to && (d.salespeople || []).some(function(q){ return stKey(q.name) === AIM.who; }); }) };
}
function aiMailHtml(D, note){
  var name = state.config.name || "", ink = (V.brandInk && V.brandInk()) || { main:"#1d63ed" }, col = { ahead:"#059669", pace:"#d97706", behind:"#dc2626" };
  var th = 'style="padding:8px 10px;font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e3e8ef;background:#f7f9fc"';
  var td = 'style="padding:8px 10px;border-bottom:1px solid #eef2f7;text-align:center;font-size:13px"', tdl = 'style="padding:8px 10px;border-bottom:1px solid #eef2f7;text-align:left;font-size:13px;font-weight:700"';
  var single = !!D.single, x = single ? D.single : D.store, me = V.currentUser();
  var kpis = [[D.range.short === "Month" ? "Sold" : "Sold " + D.range.short.toLowerCase(), stF(x.period)], ["Delivered", stF(x.delivered)], ["Month to date", stF(x.month) + (x.target ? " of " + x.target : "")], ["Tracking", x.tracking === null || x.tracking === undefined ? "—" : String(x.tracking)]];
  if (AIM.gross && !single) kpis.push(["Gross", stMoney((x.front || 0) + (x.fi || 0))]);
  var badge = function(st){ return st ? '<span style="display:inline-block;padding:2px 9px;border-radius:999px;color:#ffffff;font-size:10.5px;font-weight:800;background:' + (col[st] || "#94a3b8") + '">' + st.toUpperCase() + '</span>' : '<span style="color:#94a3b8">—</span>'; };
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:680px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #dbe4f0">' +
    '<tr><td style="padding:16px 20px;border-bottom:3px solid ' + ink.main + '"><div style="font-size:17px;font-weight:800;letter-spacing:.03em">' + esc(name.toUpperCase()) + '</div><div style="font-size:12px;color:#64748b;margin-top:2px">' +
      (single ? esc(D.single.name) + ' · ' : '') + 'Sales report · ' + esc(D.range.label) + '</div></td></tr>' +
    (note ? '<tr><td style="padding:14px 20px 6px;font-size:13.5px;line-height:1.6;color:#334155">' + esc(note).replace(/\n/g, "<br>") + '<div style="margin-top:8px;color:#64748b;font-size:12px">' + esc(me.name || "") + ', ' + esc(V.roleLabel ? V.roleLabel(me.role) : me.role) + '</div></td></tr>' : '') +
    '<tr><td style="padding:8px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse"><tr>' +
      kpis.map(function(k){ return '<td style="padding:10px 8px;text-align:center;border-top:1px solid #e3e8ef;border-bottom:1px solid #e3e8ef"><div style="font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">' + esc(k[0]) + '</div><div style="font-size:19px;font-weight:800;margin-top:2px">' + esc(k[1]) + '</div></td>'; }).join("") + '</tr></table></td></tr>';
  if (!single){
    html += '<tr><td><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse"><tr><th ' + th + ' align="left">Salesperson</th><th ' + th + '>New</th><th ' + th + '>Used</th><th ' + th + '>' + esc(D.range.short) + '</th><th ' + th + '>Month</th>' + (AIM.gross ? '<th ' + th + '>Gross</th>' : '') + '<th ' + th + '>Status</th></tr>' +
      D.rows.map(function(r){ return '<tr><td ' + tdl + '>' + esc(r.name) + '</td><td ' + td + '>' + stF(r.new) + '</td><td ' + td + '>' + stF(r.used) + '</td><td ' + td + '><b>' + stF(r.period) + '</b></td><td ' + td + '>' + stF(r.month) + (r.target ? '<span style="color:#94a3b8"> / ' + r.target + '</span>' : '') + '</td>' +
        (AIM.gross ? '<td ' + td + '>' + stMoney(r.front + r.fi) + '</td>' : '') + '<td ' + td + '>' + badge(r.status) + '</td></tr>'; }).join("") +
      '<tr><td ' + tdl.replace("font-weight:700", "font-weight:800;background:#f1f5ff") + '>Store</td><td ' + td.replace('font-size:13px"', 'font-size:13px;background:#f1f5ff"') + '>' + stF(D.store.new) + '</td><td ' + td.replace('font-size:13px"', 'font-size:13px;background:#f1f5ff"') + '>' + stF(D.store.used) + '</td><td ' + td.replace('font-size:13px"', 'font-size:13px;background:#f1f5ff"') + '><b>' + stF(D.store.period) + '</b></td><td ' + td.replace('font-size:13px"', 'font-size:13px;background:#f1f5ff"') + '>' + stF(D.store.month) + (D.store.target ? ' / ' + D.store.target : '') + '</td>' +
        (AIM.gross ? '<td ' + td.replace('font-size:13px"', 'font-size:13px;background:#f1f5ff"') + '>' + stMoney(D.store.front + D.store.fi) + '</td>' : '') + '<td ' + td.replace('font-size:13px"', 'font-size:13px;background:#f1f5ff"') + '>' + badge(D.store.status) + '</td></tr></table></td></tr>';
  } else if (D.deals.length){
    html += '<tr><td><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse"><tr><th ' + th + ' align="left">Sold</th><th ' + th + ' align="left">Vehicle</th><th ' + th + '>Type</th><th ' + th + '>Status</th>' + (AIM.gross ? '<th ' + th + '>Gross</th>' : '') + '</tr>' +
      D.deals.map(function(d){ return '<tr><td ' + tdl.replace("font-weight:700", "font-weight:600") + '>' + esc(stDay(d.soldDate)) + '</td><td style="padding:8px 10px;border-bottom:1px solid #eef2f7;font-size:13px">' + esc(d.vehicle || d.stockNo || "") + '</td><td ' + td + '>' + esc(d.type || "") + '</td><td ' + td + '>' + esc(stLbl(d.status)) + '</td>' + (AIM.gross ? '<td ' + td + '>' + stMoney((Number(d.frontGross) || 0) + (Number(d.fiGross) || 0)) + '</td>' : '') + '</tr>'; }).join("") + '</table></td></tr>';
  }
  html += '<tr><td style="padding:10px 20px;font-size:11px;color:#94a3b8">Selling day ' + D.store.day + ' of ' + D.store.total + ' · AXIOM Command Center · ' + esc(new Date().toLocaleString("en-CA", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })) + '</td></tr></table></div>';
  return html;
}
function aiMailText(D, note){
  var single = !!D.single, x = single ? D.single : D.store, me = V.currentUser();
  var out = [(state.config.name || "") + (single ? " · " + D.single.name : "") + " · Sales report · " + D.range.label, ""];
  if (note){ out.push(note, "", (me.name || ""), ""); }
  out.push("Sold: " + stF(x.period) + " · Delivered: " + stF(x.delivered) + " · Month to date: " + stF(x.month) + (x.target ? " of " + x.target : "") + " · Tracking: " + (x.tracking === null || x.tracking === undefined ? "—" : x.tracking), "");
  if (!single) D.rows.forEach(function(r){ out.push(r.name + ": " + stF(r.period) + " (N " + stF(r.new) + " · U " + stF(r.used) + ") · month " + stF(r.month) + (r.target ? "/" + r.target : "") + (r.status ? " · " + r.status.toUpperCase() : "") + (AIM.gross ? " · gross " + stMoney(r.front + r.fi) : "")); });
  else D.deals.forEach(function(d){ out.push(stDay(d.soldDate) + " · " + (d.vehicle || d.stockNo || "") + " · " + (d.type || "") + " · " + stLbl(d.status)); });
  return out.join("\n");
}
function aiMailNote(){
  if (!AIM || AIM.busy) return;
  if (!aiReady()){ toast("Still loading the store's numbers. Try again in a moment.", "err"); return; }
  var D = aiMailData();
  var facts = { store:state.config.name || "", period:D.range.label, covers:AIM.who === "team" ? "whole sales team" : AIM.who, monthSellingDay:D.store.day, monthSellingDays:D.store.total,
    store_totals:D.store, salespeople:D.rows.map(function(r){ return { name:r.name, soldInPeriod:r.period, new:r.new, used:r.used, deliveredInPeriod:r.delivered, monthToDate:r.month, monthTarget:r.target, tracking:r.tracking, status:r.status }; }),
    includeGross:AIM.gross };
  if (!AIM.gross){ delete facts.store_totals.front; delete facts.store_totals.fi; }
  AIM.busy = true; AIM.err = null; render();
  stAiCall({ dealershipId:ST.store, kind:"note", tone:AIM.tone === "numbers" ? "brief and factual, straight to the numbers" : "encouraging and motivating, professional", facts:facts }).then(function(r){
    AIM.busy = false; AIM.note = String(r.result || "").trim(); render(); }).catch(function(e){ AIM.busy = false; AIM.err = e.message; render(); });
}
function aiMailCopy(rich){
  var D = aiMailData(), note = AIM.tone === "none" ? "" : AIM.note, html = aiMailHtml(D, note), text = aiMailText(D, note), done = false;
  try {
    if (rich && navigator.clipboard && window.ClipboardItem){ navigator.clipboard.write([new ClipboardItem({ "text/html":new Blob([html], { type:"text/html" }), "text/plain":new Blob([text], { type:"text/plain" }) })]); done = true; }
    else if (navigator.clipboard){ navigator.clipboard.writeText(text); done = true; }
  } catch (e) { done = false; }
  toast(done ? (rich ? "Copied. Paste it into a new email in Outlook or Gmail." : "Copied as plain text.") : "This browser blocked copying.", done ? "ok" : "err");
}
function aiMailModal(){
  if (!AIM || !aiCan() || !state.config) return "";
  var D = aiMailData(), note = AIM.tone === "none" ? "" : AIM.note, people = stPerf(aiMonth(), "month").people.filter(function(x){ return !x.storeOnly; });
  var seg = function(k, opts){ return '<div class="st-sub" style="margin:0">' + opts.map(function(o){ return '<button type="button" data-st="aimailset" data-k="' + k + '" data-v="' + o[0] + '" class="' + (AIM[k] === o[0] ? "on" : "") + '">' + o[1] + '</button>'; }).join("") + '</div>'; };
  return '<div class="st-modal ai-mail" data-st="aimailclose"><div data-st-stop="1" role="dialog" aria-label="Morning email"><div class="h"><div><b style="font-size:15px">Morning email</b><div class="ins-sub" style="font-size:11.5px">The numbers come from the Sales Tracker; AI writes only the note. Copy it into Outlook or Gmail and send it yourself.</div></div>' +
    '<span style="display:flex;gap:6px"><button type="button" class="btn sm" data-st="aimailclose">Close</button></span></div>' +
    '<div class="ai-mail-b"><div class="ai-mail-opts">' +
      '<div class="ai-lab">Period</div>' + seg("period", [["yesterday","Yesterday"],["saturday","Last Saturday"],["week","This week"],["month","Month to date"]]) +
      '<div class="ai-lab">Covers</div><select class="st-tin ai-sel" data-stf="aiMailWho"><option value="team">Whole team</option>' + people.map(function(p){ return '<option value="' + esc(p.name) + '" ' + (AIM.who === p.name ? "selected" : "") + '>' + esc(p.name) + '</option>'; }).join("") + '</select>' +
      '<div class="ai-lab">Note at the top</div>' + seg("tone", [["encouraging","Encouraging"],["numbers","Straight to the numbers"],["none","No note"]]) +
      (AIM.tone !== "none" ? '<textarea rows="5" class="ai-note" data-stf="aiNote" placeholder="Press Write note, or type your own.">' + esc(AIM.note) + '</textarea>' +
        '<button type="button" class="btn sm" data-st="ainote"' + (AIM.busy || !aiOn() ? " disabled" : "") + '>' + (AIM.busy ? "Writing…" : AIM.note ? "✦ Rewrite note" : "✦ Write note") + '</button>' + (aiOn() ? '' : '<div class="ins-sub">AI is off; type the note yourself.</div>') : '') +
      '<label class="ai-chk"><input type="checkbox" data-stf="aiMailGross" ' + (AIM.gross ? "checked" : "") + '> Include gross</label>' +
      (AIM.err ? '<div class="st-err" style="margin-top:8px">' + esc(AIM.err) + '</div>' : '') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px"><button type="button" class="btn primary" data-st="aicopyhtml">Copy formatted email</button><button type="button" class="btn" data-st="aicopytext">Copy plain text</button></div>' +
    '</div><div class="ai-mail-prev">' + aiMailHtml(D, note) + '</div></div></div></div>';
}
