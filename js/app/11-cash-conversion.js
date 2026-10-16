"use strict";
/* ---------------- CASH CONVERSION ----------------
   Helps a Finance Manager show a cash buyer, honestly, what financing and
   investing the cash would do. Kept out of `state` on purpose: it is never
   saved or synced and starts blank every time the app loads. */
var caState = null, caWin = null;
function caBlank(){
  return caLoadPrefs({ tab:"invest", customer:"", amount:"", apr:"", term:"60", lost:"", invest:"sp500", gicRate:"",
    otherName:"", otherRate:"", years:"same", locRate:"", payMode:"match", payAmount:"", drawAmount:"", drawYear:"2", freq:"monthly", view:"account", avgOver:"all",
    present:false, down:"", acct:"tfsa", taxRate:"", email:"",
    la:"", lapr:"", lterm:"84", lfreq:"biweekly", lfirst:"", lumpN:"1", levery:"", lfull:false });
}
/* Fill the comparison from the deal on screen: the customer's name, the cash it would take
   (with the chosen package, or the vehicle alone when no package is chosen yet), and the
   deal's own term, rate and payment frequency. Returns what it filled, for the message. */
function caFromDeal(){
  var tx = state.tx;
  if (!tx || !state.config) return null;
  var t = C.totals(state, tx), fin = state.config.finance || {};
  var withPkg = !!t.selectedPackage && t.selectedPackage !== "none";
  var amt = withPkg ? (tx.type === "Cash" ? t.cashDueTotal : t.amountFinanced) : t.baseAmount;
  var term = C.primaryTerm(tx) || Number(fin.defaultTerm) || 60;
  var rates = tx.finance.rates || {}, rate = rates[term];
  if (rate === undefined || rate === null || rate === "") rate = fin.defaultApr;
  if (!caState) caState = caBlank();
  caState.customer = tx.customer.name || "";
  caState.amount = amt > 0 ? Number(amt).toLocaleString("en-CA", { minimumFractionDigits:2, maximumFractionDigits:2 }) : "";
  caState.apr = rate === undefined || rate === null || rate === "" ? "" : String(rate);
  if ([24,36,48,60,72,84,96].indexOf(Number(term)) !== -1) caState.term = String(term);
  caState.freq = (tx.finance.frequency || fin.defaultFrequency) === "biweekly" ? "biweekly" : "monthly";
  caState.la = caState.amount; caState.lapr = caState.apr; caState.lfreq = caState.freq;
  if ([12,24,36,48,60,72,84,96].indexOf(Number(term)) !== -1) caState.lterm = String(term);
  return { name: caState.customer, withPkg: withPkg, amount: amt };
}
function caFromDealToast(r){
  if (!r) return;
  toast((r.name ? "Filled from " + r.name + "'s deal" : "Filled from the deal on screen")
    + (r.withPkg ? "" : " — vehicle only, since no package is chosen yet") + ". Check the amount and rate.", "ok");
}
function caNum(v){ var n = parseFloat(String(v === null || v === undefined ? "" : v).replace(/[$,\s%]/g, "")); return isNaN(n) ? null : n; }
function caInputs(){
  var s = caState, term = caNum(s.term);
  var years = s.years === "same" ? (term ? term/12 : null) : caNum(s.years);
  var rate = s.invest === "gic" ? caNum(s.gicRate) : s.invest === "other" ? caNum(s.otherRate) : null;
  /* A down payment is paid today either way, so only the rest is compared. */
  var total = caNum(s.amount), down = s.tab !== "loc" ? Math.min(Math.max(0, caNum(s.down) || 0), Math.max(0, total || 0)) : 0;
  return { amount:total === null ? null : total - down, total:total, down:down, tax:caTaxPct(), apr:caNum(s.apr) || 0, term:term, lost:caNum(s.lost) || 0, years:years,
    invest:s.invest === "other" ? "custom" : s.invest, rate:rate === null ? "" : rate,
    locRate:caNum(s.locRate) === null ? "" : caNum(s.locRate), payMode:s.payMode, payAmount:caNum(s.payAmount),
    drawAmount:caNum(s.drawAmount) || 0, drawYear:caNum(s.drawYear) || 0, freq:s.freq === "biweekly" ? "biweekly" : "monthly",
    avgOver:s.avgOver || "all" };
}
/* ---- Cash Conversion extras ----
   Each Finance Manager's investment choices are remembered in this browser (not the deal details). */
var CA_PREF_KEYS = ["invest","gicRate","otherName","otherRate","avgOver","view","years","acct","taxRate"];
function caPrefKey(){ return "dcc.ca.prefs." + (state.currentUserId || "anon"); }
function caLoadPrefs(o){
  try {
    var p = JSON.parse(localStorage.getItem(caPrefKey()) || "null");
    if (p) CA_PREF_KEYS.forEach(function(k){ if (typeof p[k] === "string") o[k] = p[k]; });
  } catch (e) {}
  return o;
}
function caSavePrefs(){
  if (!caState) return;
  try {
    var p = {}; CA_PREF_KEYS.forEach(function(k){ p[k] = String(caState[k] === null || caState[k] === undefined ? "" : caState[k]); });
    localStorage.setItem(caPrefKey(), JSON.stringify(p));
  } catch (e) {}
}
/* Today's rates, set by the GM in Dealership settings, as one-tap choices. */
var CA_PRESETS = [["gic1","1-year GIC","gic"],["gic5","5-year GIC","gic"],["hisa","High-interest savings","other"]];
function caPresetChips(){
  var r = (state.config && state.config.caRates) || {}, s = caState;
  var list = CA_PRESETS.filter(function(p){ return caNum(r[p[0]]) !== null; });
  if (!list.length) return V.isAdmin()
    ? `<small class="muted tiny ca-preset-tip">Tip: add today's GIC and savings rates in <a href="#" data-act="route" data-route="settings">Dealership settings</a> to pick them in one tap.</small>` : "";
  return `<div class="ca-presets"><span>Today's rates</span>${list.map(function(p){
    var rate = caNum(r[p[0]]);
    var on = p[2] === "gic" ? s.invest === "gic" && caNum(s.gicRate) === rate
      : s.invest === "other" && s.otherName === p[1] && caNum(s.otherRate) === rate;
    return `<button type="button" class="btn sm ${on ? "on" : ""}" data-act="ca-preset" data-key="${p[0]}">${esc(p[1])} <b>${caPct(rate)}</b></button>`; }).join("")}</div>`;
}
function caTaxPct(){ return caState && caState.acct === "taxable" ? Math.min(60, Math.max(0, caNum(caState.taxRate) || 0)) : 0; }
function caTaxNote(){ var t = caTaxPct(); return t ? ` · after ${caPct(t)} tax on earnings` : ""; }
/* "Try it": finance, then pay the loan off after a few months. Result is against paying cash on day one. */
function caPayoffRows(res, I){
  var r = res.run, out = [];
  [3,6,12,24].forEach(function(m){
    if (m >= I.term || m > res.months) return;
    var po = C.loanPayoff(I.amount, I.apr, I.term, I.freq, m), k = po.periods;
    var acct = r.acctPath[Math.min(k, r.acctPath.length - 1)];
    out.push({ m:m, interest:po.interest, balance:po.balance, result:acct - po.balance });
  });
  return out;
}
function caReasons(){
  return [
    ["shield", "Pay it off any time", "No penalty for paying the balance early — Ontario's Consumer Protection Act gives you that right. Your credit agreement confirms the details."],
    ["trend", "Builds your credit", "On-time payments are reported to the credit bureaus, which can help your credit history."],
    ["lock", "Your cash stays yours", "Money on hand for emergencies or opportunities, instead of tied up in the vehicle."]];
}
function caSummary(res, I){
  var good = res.adv >= 0;
  return `<div class="ca-sum">
      <div><span>${caPayLabel(res.freq)}</span><strong class="num">${money(res.pmt)}</strong><small>${I.down > 0 ? money0(I.amount) + " financed" : esc(caState.term) + " months"}</small></div>
      <div><span>Cash kept invested</span><strong class="num">${money0(res.cash)}</strong><small>${I.down > 0 ? money0(I.down) + " down today" : "instead of paying cash"}</small></div>
      <div class="${good ? "good" : "bad"}"><span>${good ? "Ahead" : "Behind"} after ${caYears(res.months)}</span><strong class="num">${caSigned(res.adv)}</strong><small>vs paying cash</small></div></div>`;
}

/* ---- email to the customer (formatted to paste, or plain text through the mail app) ---- */
function caPlain(h){ return String(h).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"'); }
function caEmail(){
  var s = caState || caBlank(), I = caInputs(), cfg = state.config, pb = caPrintBrand(), u = V.currentUser ? V.currentUser() : null;
  var name = s.customer.trim(), first = name.split(" ")[0];
  var docName = s.tab === "loc" ? "Line of credit vs dealer financing" : s.tab === "amort" ? "Loan payoff and amortization" : "Cash vs finance comparison";
  var subject = (s.tab === "amort" ? "Your loan payoff plan" : s.tab === "loc" ? "Line of credit vs dealer financing" : "Your cash vs finance comparison") + " — " + (cfg.name || "");
  var lead, big, sub, basis = "", rows = [], extra = [], reasons = [];
  if (s.tab === "amort"){
    var am = caAmortEmail();
    if (!am) return null;
    lead = am.lead; big = am.big; sub = am.sub; basis = am.basis; rows = am.rows; extra = am.extra;
    reasons = [["Pay it off any time", "Ontario's Consumer Protection Act lets you prepay without penalty; ask your lender how it applies extra payments."]];
  } else if (s.tab === "loc"){
    var lc = C.locCompare(I);
    if (!lc) return null;
    var lh = caLocHeadline(lc), L = lc.loc;
    lead = caPlain(lh.lead); big = caPlain(lh.big); sub = caPlain(lh.sub);
    rows = [["Dealer financing", caPct(I.apr) + " fixed · " + money(lc.dealer.pmt) + " " + caFreqWord(lc.freq) + " · " + money0(lc.dealer.interest) + " interest"],
      ["Line of credit", caPct(L.rate) + " variable · " + (L.payoff ? "paid off in " + caDuration(L.payoff, lc.ppy) + " · " + money0(L.interest) + " interest" : "not paid off at this payment")]];
    reasons = caLocReasons().map(function(t){ return ["", caPlain(t)]; });
  } else {
    var res = C.cashAdvantage(I);
    if (!res) return null;
    var st = caStatement(res), inv = caInvestName(true);
    lead = res.adv >= 0 ? "Your financing advantage" : "Your comparison";
    big = caSigned(res.adv); sub = caPlain(st.heroSub);
    basis = (res.kind === "history" ? `Based on ${caPlain(inv)}'s average of ${caPct(res.rate)} a year, ${res.avgFrom}–${res.avgTo}`
      : s.invest === "gic" ? `Based on a GIC at ${caPct(res.rate)}, guaranteed` : `If ${caPlain(inv)} earns ${caPct(res.rate)} a year`) + caTaxNote();
    rows = st.rows.map(function(x){ return [caPlain(x[0]), caPlain(x[1])]; }).concat([[caPlain(st.totalLabel.replace(/^= /, "")), caPlain(st.total)]]);
    extra = [[caPayLabel(res.freq), money(res.pmt)], ["Term", s.term + " months at " + caPct(I.apr) + " APR"]];
    if (I.down > 0) extra.push(["Down payment", money0(I.down)]);
    extra = extra.concat(caPayoffRows(res, I).slice(0, 3).map(function(x){ return ["If paid off after " + x.m + " months", money0(x.interest) + " interest · " + caSigned(x.result) + " vs paying cash"]; }));
    reasons = caReasons().map(function(r){ return [r[1], r[2]]; });
  }
  var td = 'style="padding:7px 0;border-bottom:1px solid #e6e9ef;font-size:14px;color:#1b2130"';
  var tdr = 'style="padding:7px 0;border-bottom:1px solid #e6e9ef;font-size:14px;color:#1b2130;text-align:right;font-weight:600;white-space:nowrap"';
  var table = function(list){ return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${list.map(function(x){ return `<tr><td ${td}>${esc(x[0])}</td><td ${tdr}>${esc(x[1])}</td></tr>`; }).join("")}</table>`; };
  var html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:20px 0;font-family:Arial,Helvetica,sans-serif"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden">
      <tr><td style="background:${pb.base};padding:18px 24px;color:#ffffff"><div style="font-size:18px;font-weight:700">${esc(cfg.name || "")}</div><div style="font-size:12px;opacity:.85">${esc(docName)}</div></td></tr>
      <tr><td style="padding:22px 24px 6px;font-size:15px;color:#1b2130">${first ? "Hi " + esc(first) + "," : "Hello,"}<br><br>As promised, here is the comparison we went through together.</td></tr>
      <tr><td style="padding:10px 24px"><div style="background:${pb.soft};border-radius:10px;padding:16px 18px">
        <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${pb.deep}">${esc(lead)}</div>
        <div style="font-size:30px;font-weight:700;color:${pb.deep};margin:4px 0">${esc(big)}</div>
        <div style="font-size:13px;color:#3a4252">${esc(sub)}</div>${basis ? `<div style="font-size:12px;color:#6b7383;margin-top:6px">${esc(basis)}</div>` : ""}</div></td></tr>
      <tr><td style="padding:8px 24px">${table(rows)}</td></tr>
      ${extra.length ? `<tr><td style="padding:8px 24px">${table(extra)}</td></tr>` : ""}
      ${reasons.length ? `<tr><td style="padding:12px 24px 4px">${reasons.map(function(r){ return `<div style="font-size:13px;color:#3a4252;margin:0 0 8px;padding-left:10px;border-left:3px solid ${pb.base}">${r[0] ? `<strong>${esc(r[0])}.</strong> ` : ""}${esc(r[1])}</div>`; }).join("")}</td></tr>` : ""}
      <tr><td style="padding:14px 24px;font-size:14px;color:#1b2130">Happy to answer any questions.<br><br>${u ? esc(u.name) + "<br>" : ""}Finance Manager, ${esc(cfg.name || "")}<br><span style="color:#6b7383">${esc([cfg.phone, cfg.email].filter(Boolean).join(" · "))}</span></td></tr>
      <tr><td style="padding:12px 24px 20px;font-size:11px;line-height:1.5;color:#8a91a0">${esc(caDisclaimer(s.tab))}</td></tr>
    </table></td></tr></table>`;
  var text = (first ? "Hi " + first + "," : "Hello,") + "\n\nAs promised, here is the comparison we went through together.\n\n" +
    lead + ": " + big + "\n" + sub + (basis ? "\n" + basis : "") + "\n\n" +
    rows.concat(extra).map(function(x){ return x[0] + ": " + x[1]; }).join("\n") + "\n\n" +
    reasons.map(function(r){ return "- " + (r[0] ? r[0] + ". " : "") + r[1]; }).join("\n") + "\n\nHappy to answer any questions.\n\n" +
    (u ? u.name + "\n" : "") + "Finance Manager, " + (cfg.name || "") + "\n" + [cfg.phone, cfg.email].filter(Boolean).join(" · ") + "\n\n" + caDisclaimer(s.tab);
  return { subject:subject, html:html, text:text };
}
function caEmailModal(){
  if (!state.ui.modal || state.ui.modal.kind !== "caemail") return "";
  var m = caEmail();
  return `<div class="modal-bg" data-act="close-modal-bg"><div class="modal wide">
    <div class="modal-h"><h2>Email the comparison</h2><div class="sp">
      <button class="btn" data-act="close-modal">Close</button>
      <button class="btn" data-act="ca-email-copy" ${m ? "" : "disabled"}>Copy formatted email</button>
      <button class="btn" data-act="ca-email-text" ${m ? "" : "disabled"}>Copy plain text</button>
      <button class="btn primary" data-act="ca-email-open" ${m ? "" : "disabled"}>Open in email app</button></div></div>
    <div class="modal-b">
      ${m ? `<div class="inline">
        <label class="f"><span>To</span><input type="text" data-ca="email" value="${esc(caState.email)}" placeholder="customer@example.ca" autocomplete="off"></label>
        <label class="f"><span>Subject</span><input type="text" id="caEmailSubject" value="${esc(m.subject)}"></label></div>
      <div style="background:#f3f5f8;border-radius:10px;overflow:hidden;border:1px solid var(--border)">${m.html}</div>
      <p class="small muted" style="margin-top:10px">“Open in email app” sends the plain-text version. For the formatted version, use “Copy formatted email” and paste it into a Gmail or Outlook message.</p>`
      : `<p class="muted">Complete the comparison first, then email it.</p>`}
    </div></div></div>`;
}
function caEmailCopy(rich){
  var m = caEmail(); if (!m) return;
  var done = false;
  try {
    if (rich && navigator.clipboard && navigator.clipboard.write && window.ClipboardItem){
      navigator.clipboard.write([ new ClipboardItem({ "text/html":new Blob([m.html], { type:"text/html" }), "text/plain":new Blob([m.text], { type:"text/plain" }) }) ]);
      done = true;
    }
  } catch (e) { done = false; }
  if (!done){ try { if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(m.text); done = true; } } catch (e) {} }
  toast(done ? (rich ? "Formatted email copied — paste it (Ctrl/Cmd+V) into your email." : "Plain text copied.") : "This browser blocked copying. Use Open in email app instead.", done ? "ok" : "err");
}
function caEmailOpen(){
  var m = caEmail(); if (!m) return;
  var subj = document.getElementById("caEmailSubject");
  var href = "mailto:" + encodeURIComponent(caState.email || "") + "?subject=" + encodeURIComponent(subj ? subj.value : m.subject) + "&body=" + encodeURIComponent(m.text);
  var opened = null;
  try { opened = window.open(href, "_blank"); } catch (e) { opened = null; }
  toast(opened ? "Opening your email app with the plain-text version." : "The browser blocked the mail app. Use Copy formatted email instead.", opened ? "ok" : "err");
}
/* ---- Payoff calculator tab: a financed customer who plans lump sums to pay the loan off faster.
   No investment comparison here: cost of borrowing and the amortization schedule only. */
var AM_FREQS = [["monthly","Monthly"],["semimonthly","Semi-monthly"],["biweekly","Bi-weekly"],["weekly","Weekly"]];
var AM_MAX_LUMPS = 6;
function amFreqWord(f){ return f === "semimonthly" ? "semi-monthly" : f === "biweekly" ? "bi-weekly" : f === "weekly" ? "weekly" : "monthly"; }
function amFirstDefault(freq){ return C.amortDate(C.todayISO(), 2, freq); }
function amLumpCount(){ return Math.min(AM_MAX_LUMPS, Math.max(1, Number(caState.lumpN) || 1)); }
/* A lump sum is picked by date and rides with the first scheduled payment on or after that date,
   so it always lines up with the payment frequency chosen. Until a date is picked: the first payment. */
function amLumpDate(i, first){ return caState["lumpDate" + i] || first; }
function amLumpPayment(date, first, freq, n){
  if (!date || date <= first) return 1;
  for (var k = 1; k <= n; k++) if (C.amortDate(first, k, freq) >= date) return k;
  return n;
}
function amSchedSize(){
  var s = caState, freq = C.AMORT_PPY[s.lfreq] ? s.lfreq : "biweekly";
  var first = s.lfirst || amFirstDefault(freq), n = Math.max(1, Math.round((caNum(s.lterm) || 84)/12*C.AMORT_PPY[freq]));
  return { freq:freq, first:first, n:n, last:C.amortDate(first, n, freq) };
}
function caLoanInputs(){
  var s = caState, z = amSchedSize(), lumps = [];
  for (var i = 0; i < amLumpCount(); i++){
    var a = caNum(s["lumpAmt" + i]);
    if (a > 0) lumps.push({ at:amLumpPayment(amLumpDate(i, z.first), z.first, z.freq, z.n), amount:a });
  }
  return { amount:caNum(s.la), apr:caNum(s.lapr), months:caNum(s.lterm) || 84, freq:z.freq, first:z.first, lumps:lumps, every:caNum(s.levery) || 0 };
}
function amCompare(){
  var L = caLoanInputs();
  if (!(L.amount > 0) || L.apr === null) return null;
  var cmp = C.amortCompare(L);
  if (cmp) cmp.inputs = L;
  return cmp;
}
function amHeadline(cmp){
  var b = cmp.base, p = cmp.plan;
  return cmp.hasExtra
    ? { eyebrow:"Your interest with the extra payments", lead:"With the extra payments, the customer pays only", big:money0(p.interest), tail:"in interest",
        sub:`instead of ${money0(b.interest)} as scheduled — saves ${money0(cmp.saved)}. Last payment ${C.fmtDate(p.last)} instead of ${C.fmtDate(b.last)}` + (cmp.fewer > 0 ? ` (${caDuration(cmp.fewer, b.ppy)} sooner)` : "") + "." }
    : { eyebrow:"Your cost of borrowing", lead:"Cost of borrowing over the full term", big:money0(b.interest), tail:"interest",
        sub:`${b.count} ${amFreqWord(b.freq)} payments of ${money(b.pmt)}, last payment ${C.fmtDate(b.last)}` };
}
function amTermsLine(cmp){
  var b = cmp.base;
  return `${money0(b.amount)} at ${caPct(b.apr)} APR · ${b.months} months · ${amFreqWord(b.freq)} payments from ${C.fmtDate(b.first)}`;
}
function amChart(cmp, print){
  var c = caColors(print), b = cmp.base, p = cmp.plan;
  var path = function(sch){ var a = [sch.amount]; sch.rows.forEach(function(x){ a.push(x.balance); }); while (a.length < b.count + 1) a.push(0); return a; };
  var series = [{ data:path(b), color:c.b, dash:cmp.hasExtra, width:2.5, dot:false }];
  if (cmp.hasExtra) series.push({ data:path(p), color:c.a, fill:!!print && print !== true });
  return caLineChart(series, b.count, print, "Loan balance over time", b.ppy) +
    caLegend(cmp.hasExtra ? [{ color:c.a, text:"With the extra payments" }, { color:c.b, dash:true, text:"As scheduled" }] : [{ color:c.b, text:"Loan balance as scheduled" }]);
}
function amCompareRows(cmp){
  var b = cmp.base, p = cmp.plan;
  return [
    ["Payments made", b.count, p.count],
    ["Regular payment", money(b.pmt), money(p.pmt)],
    ["Extra payments", "—", p.extra > 0 ? money(p.extra) : "—"],
    ["Cost of borrowing (interest)", money(b.interest), money(p.interest)],
    ["Total paid", money(b.paid), money(p.paid)],
    ["Last payment", C.fmtDate(b.last), C.fmtDate(p.last)]];
}
function amYearTable(cmp, cls){
  var yrs = C.amortYears(cmp.plan), base = C.amortYears(cmp.base);
  return `<table class="${cls}"><thead><tr><th>Year</th><th>To</th><th class="right">Paid</th>${cmp.hasExtra ? `<th class="right">Extra</th>` : ""}<th class="right">Interest</th><th class="right">Principal</th><th class="right">Balance</th>${cmp.hasExtra ? `<th class="right">If no extra</th>` : ""}</tr></thead><tbody>
    ${yrs.map(function(y, i){ var by = base[i];
      return `<tr><td>${y.year}</td><td>${C.fmtDate(y.to)}</td><td class="right num">${money(y.paid)}</td>${cmp.hasExtra ? `<td class="right num">${y.extra ? money(y.extra) : "—"}</td>` : ""}<td class="right num">${money(y.interest)}</td><td class="right num">${money(r2(y.principal - y.extra))}</td><td class="right num">${money(y.balance)}</td>${cmp.hasExtra ? `<td class="right num muted">${by ? money(by.balance) : ""}</td>` : ""}</tr>`; }).join("")}
    </tbody></table>
    ${cmp.hasExtra && yrs.length < base.length ? `<p class="am-note">Paid off in year ${yrs.length} instead of year ${base.length}. “If no extra” is what would still be owed without the extra payments.</p>` : ""}`;
}
function amScheduleTable(sch, cls){
  return `<table class="${cls}"><thead><tr><th>No.</th><th>Due date</th><th class="right">Payment</th><th class="right">Extra</th><th class="right">Interest</th><th class="right">Principal</th><th class="right">Balance</th></tr></thead><tbody>
    ${sch.rows.map(function(x){ return `<tr class="${x.extra ? "ex" : ""}"><td>${x.k}</td><td>${C.fmtDate(x.date)}</td><td class="right num">${money(x.pay)}</td><td class="right num">${x.extra ? money(x.extra) : ""}</td><td class="right num">${money(x.interest)}</td><td class="right num">${money(r2(x.principal - x.extra))}</td><td class="right num">${money(x.balance)}</td></tr>`; }).join("")}
    <tr class="tot"><td colspan="2">Total</td><td class="right num">${money(r2(sch.paid - sch.extra))}</td><td class="right num">${sch.extra ? money(sch.extra) : ""}</td><td class="right num">${money(sch.interest)}</td><td class="right num">${money(r2(sch.amount - sch.extra))}</td><td class="right num">${money(0)}</td></tr></tbody></table>
    <p class="am-note">Each payment = interest + principal. Extra payments go straight off the balance.</p>`;
}
var r2 = C.r2;
/* The customer's goal ("paid off in X months"), on the loan alone. */
function amGoal(){
  var g = caNum(caState.lgoal), L = caLoanInputs();
  if (!(g > 0) || !(L.amount > 0) || L.apr === null) return null;
  var r = C.amortGoal(L, g);
  if (r) r.months = g;
  return r;
}
function amGoalCard(g, cx){
  var b = g.base, f = amFreqWord(b.freq), lastT = C.amortDate(b.first, g.nt, b.freq);
  if (g.reached) return `<div class="${cx ? "cx-card" : "ca-card"} am-goal"><div class="${cx ? "cx-card-h" : "ca-card-h"}">${cx ? "" : "<h3>"}Customer's goal: paid off in ${g.months} months${cx ? "" : "</h3>"}</div>
    <p class="${cx ? "cx-note" : "small"}">The loan is already paid off within ${g.months} months on its regular payments — no extra needed.</p></div>`;
  var L = g.lump, E = g.every;
  var box = function(title, big, lines, act, btn){
    return `<div class="am-goal-opt"><span>${title}</span><strong class="num">${big}</strong>${lines.map(function(l){ return `<small>${l}</small>`; }).join("")}${!cx && act ? `<button type="button" class="btn sm primary" data-act="${act}">${btn}</button>` : ""}</div>`; };
  return `<div class="${cx ? "cx-card" : "ca-card"} am-goal">
    <div class="${cx ? "cx-card-h" : "ca-card-h"}">${cx ? `Paid off in ${g.months} months` : `<h3>Customer's goal: paid off in ${g.months} months</h3><span class="muted small">${g.nt} ${f} payments · last payment by ${C.fmtDate(lastT)}</span>`}</div>
    <div class="am-goal-grid">
      ${box("Option A · One lump sum with the first payment", money(L.amount), [`paid on ${C.fmtDate(b.first)}, together with the first ${f} payment of ${money(b.pmt)}`, `interest paid ${money0(L.sched.interest)} (saves ${money0(L.saved)}) · last payment ${C.fmtDate(L.sched.last)}`], "ca-goal-lump", "Use this lump sum")}
      ${box("Option B · Or add to every payment", "+" + money(E.amount), [`${f} payment becomes ${money(r2(b.pmt + E.amount))} instead of ${money(b.pmt)}`, `interest paid ${money0(E.sched.interest)} (saves ${money0(E.saved)}) · last payment ${C.fmtDate(E.sched.last)}`], "ca-goal-every", "Use this top-up")}
    </div>
    ${cx ? "" : `<p class="tiny muted" style="margin:8px 0 0">Worked out on the loan alone. “Use” puts it into the extra payments on the left (replacing what's there), so the comparison, customer screen, printout and email all show it.</p>`}</div>`;
}
/* What each tab is for, shown under the tab row. */
var CA_TAB_DESC = {
  invest:"<strong>Cash buyer.</strong> What financing and investing the cash would leave them, compared with paying cash.",
  amort:"<strong>Financed customer.</strong> Cost of borrowing, and how a lump sum, a top-up or a payoff goal shortens the loan. No investment involved.",
  loc:"<strong>Customer planning to use a line of credit.</strong> Their line of credit against dealer financing."
};
/* The cash tabs and the payoff calculator keep their own boxes; when switching, fill whichever side is still empty. */
function caSyncTabs(to){
  var s = caState, cashSide = to !== "amort";
  if (cashSide && !caNum(s.amount) && caNum(s.la)){
    s.amount = s.la;
    if (caNum(s.apr) === null && caNum(s.lapr) !== null) s.apr = s.lapr;
    if ([24,36,48,60,72,84,96].indexOf(Number(s.lterm)) !== -1) s.term = String(s.lterm);
    if (s.lfreq === "monthly" || s.lfreq === "biweekly") s.freq = s.lfreq;
  } else if (!cashSide && !caNum(s.la) && caNum(s.amount)){
    s.la = s.amount;
    if (caNum(s.lapr) === null && caNum(s.apr) !== null) s.lapr = s.apr;
    s.lterm = String(s.term || s.lterm); s.lfreq = s.freq || s.lfreq; s.lfirst = "";
  }
}
function caAmortLeft(){
  var s = caState, freq = C.AMORT_PPY[s.lfreq] ? s.lfreq : "biweekly", ppy = C.AMORT_PPY[freq];
  var term = caNum(s.lterm) || 84, first = s.lfirst || amFirstDefault(freq);
  var termOpts = [12,24,36,48,60,72,84,96].map(function(t){ return `<option value="${t}" ${String(t) === String(s.lterm) ? "selected" : ""}>${t} months</option>`; }).join("");
  var z = amSchedSize(), lumps = "";
  for (var i = 0; i < amLumpCount(); i++){
    var ld = amLumpDate(i, first), lk = amLumpPayment(ld, first, freq, z.n);
    lumps += `<div class="am-lump">
      <div class="ca-in"><i>$</i><input type="text" inputmode="decimal" data-ca="lumpAmt${i}" value="${esc(s["lumpAmt" + i] || "")}" placeholder="e.g. 10,000" autocomplete="off" aria-label="Lump sum ${i + 1} amount"></div>
      <input type="date" data-ca="lumpDate${i}" value="${esc(ld)}" min="${first}" max="${z.last}" aria-label="Date of lump sum ${i + 1}">
      ${amLumpCount() > 1 || s["lumpAmt" + i] ? `<button type="button" class="btn sm ghost" data-act="ca-lump-del" data-i="${i}" title="Remove this lump sum" aria-label="Remove lump sum ${i + 1}">×</button>` : "<span></span>"}
      <small class="am-lump-at">With ${amFreqWord(freq)} payment ${lk} of ${z.n} · ${C.fmtDate(C.amortDate(first, lk, freq))}</small></div>`;
  }
  var goalOpts = `<option value="">No goal set</option>` + [7,12,18,24,30,36,42,48,54,60,66,72,78,84,90].filter(function(m){ return m < term; })
    .map(function(m){ return `<option value="${m}" ${String(m) === String(s.lgoal) ? "selected" : ""}>${m} months</option>`; }).join("");
  return `<div class="am-sec"><b>1</b> The loan</div>
    ${caField("Customer name (optional)", "customer", { ph:"For the printout" })}
    ${caField("Loan amount (amount financed)", "la", { pre:"$", ph:"31,790", hint:"After down payment and trade, including taxes and anything financed." })}
    <div class="ca-row">${caField("Interest rate (APR)", "lapr", { post:"%", ph:"7.99" })}
      <label class="f"><span>Loan term</span><select data-ca="lterm">${termOpts}</select></label></div>
    <label class="f"><span>Payments</span><div class="ca-seg">${AM_FREQS.map(function(f){
      return `<button class="btn ${freq === f[0] ? "on" : ""}" data-act="ca-lfreq" data-freq="${f[0]}">${f[1]}</button>`; }).join("")}</div></label>
    <label class="f"><span>First payment date</span><input type="date" data-ca="lfirst" value="${esc(first)}"></label>
    <div class="am-sec"><b>2</b> Customer's goal <small>optional</small></div>
    <label class="f"><span>Customer wants the loan paid off in</span><select data-ca="lgoal">${goalOpts}</select>
      <small class="muted tiny">Shows the lump sum needed with the first payment, or the top-up on every payment, to finish by then.</small></label>
    <div class="am-sec"><b>3</b> Extra payments <small>optional</small></div>
    <div class="f am-lumps"><span>Lump-sum payments</span>${lumps}
      ${amLumpCount() < AM_MAX_LUMPS ? `<button type="button" class="btn sm" data-act="ca-lump-add">+ Add another lump sum</button>` : ""}
      <small class="muted tiny">Pick any date: the lump sum is paid with the first ${amFreqWord(freq)} payment on or after it, straight off the balance.</small></div>
    ${caField("Extra on every payment (optional)", "levery", { pre:"$", ph:"0", hint:"A fixed top-up added to each regular payment." })}
    <div class="am-sec"><b>4</b> Printout</div>
    <label class="ca-check"><input type="checkbox" data-act="ca-lfull" ${s.lfull ? "checked" : ""}> Include the full payment schedule when printing</label>
    <small class="muted tiny">Ticked: every payment down to $0.00 prints after the summary. Unticked: the summary and year-by-year table only.</small>`;
}
function caAmortRight(){
  var cmp = amCompare();
  if (!cmp) return `<div class="ca-empty"><div class="ca-empty-ic">%</div><h3>Enter the loan amount and interest rate</h3>
    <p class="muted small">The cost of borrowing and the payment schedule appear here as you type. Add a lump sum to see how much sooner the loan is paid off.</p></div>`;
  var b = cmp.base, p = cmp.plan, h = amHeadline(cmp), goal = amGoal();
  return `${goal ? amGoalCard(goal, false) : ""}<div class="ca-sum">
      <div><span>${amFreqWord(b.freq).replace(/^./, function(c){ return c.toUpperCase(); })} payment</span><strong class="num">${money(b.pmt)}</strong><small>${b.count} payments</small></div>
      <div><span>${cmp.hasExtra ? "Interest paid" : "Cost of borrowing"}</span><strong class="num">${money0(p.interest)}</strong><small>${cmp.hasExtra ? "with the extra payments" : "interest over the full term"}</small></div>
      ${cmp.hasExtra ? `<div class="good"><span>Interest saved</span><strong class="num">${money0(cmp.saved)}</strong><small>vs ${money0(b.interest)} as scheduled${cmp.fewer > 0 ? " · " + caDuration(cmp.fewer, b.ppy) + " sooner" : ""}</small></div>`
        : `<div><span>Total paid</span><strong class="num">${money0(b.paid)}</strong><small>last payment ${C.fmtDate(b.last)}</small></div>`}</div>
    <div class="ca-hero ${cmp.hasExtra ? "good" : "neutral"}"><div class="ca-lead">${h.lead}</div>
      <div class="ca-big num">${h.big} <span>${h.tail}</span></div><div class="ca-sub">${h.sub}</div></div>
    ${cmp.hasExtra ? "" : `<p class="ca-tabnote">Add a lump sum on the left (for example a bonus or tax refund) to show how much interest it saves and how much sooner the loan ends.</p>`}
    <div class="ca-card"><div class="ca-card-h"><h3>As scheduled vs with extra payments</h3></div>
      <div class="tablewrap"><table class="ca-tbl am-cmp"><thead><tr><th></th><th class="right">As scheduled</th><th class="right">With extra payments</th></tr></thead><tbody>
      ${amCompareRows(cmp).map(function(r){ return `<tr><td>${r[0]}</td><td class="right num">${r[1]}</td><td class="right num ${cmp.hasExtra ? "strong" : "muted"}">${r[2]}</td></tr>`; }).join("")}</tbody></table></div></div>
    <div class="ca-card"><div class="ca-card-h"><h3>Loan balance over time</h3></div>${amChart(cmp, false)}</div>
    <div class="ca-card"><div class="ca-card-h"><h3>Year by year</h3></div><div class="tablewrap">${amYearTable(cmp, "ca-tbl")}</div></div>
    <details class="ca-years" ${cmp.hasExtra ? "open" : ""}><summary>${cmp.hasExtra ? "Payment schedule to the last payment" : "Full payment schedule"} (${p.count} payments)</summary><div class="tablewrap am-sched">${amScheduleTable(p, "ca-tbl")}</div></details>`;
}
function caAmortCustomer(){
  var cmp = amCompare();
  if (!cmp) return null;
  var b = cmp.base, p = cmp.plan, h = amHeadline(cmp);
  return `<section class="cx-hero up">
      <div class="cx-hero-l">
        <div class="cx-eyebrow light">${h.eyebrow}</div>
        <div class="cx-big num">${h.big}</div>
        <div class="cx-hero-sub">${cmp.hasExtra ? "in interest, " + h.sub : "in interest over the full term — " + h.sub}</div>
        <div class="cx-basis">${amTermsLine(cmp)}</div>
      </div>
      <div class="cx-paths">
        <div class="cx-path ${cmp.hasExtra ? "" : "win"}">${caIcon("flag")}<div><span>As scheduled</span><strong class="num">${C.fmtDate(b.last)}</strong><em>${b.count} payments · ${money0(b.interest)} interest</em></div></div>
        ${cmp.hasExtra ? `<div class="cx-path win">${caIcon("trend")}<div><span>With your extra payments</span><strong class="num">${C.fmtDate(p.last)}</strong><em>${p.count} payments · ${money0(p.interest)} interest</em></div></div>` : ""}
      </div>
    </section>
    <section class="cx-row">
      <div class="cx-card"><div class="cx-card-h">Year by year</div><div class="cx-tblwrap">${amYearTable(cmp, "cx-tbl")}</div></div>
      <div class="cx-card cx-chart"><div class="cx-card-h">Your loan balance</div>${amChart(cmp, "cd")}</div>
    </section>
    ${cmp.hasExtra ? `<section class="cx-one"><div class="cx-card"><div class="cx-card-h">Your payment schedule to the last payment · ${p.count} payments</div><div class="cx-tblwrap am-cx-sched">${amScheduleTable(p, "cx-tbl")}</div></div></section>` : ""}
    ${amGoal() ? `<section class="cx-one">${amGoalCard(amGoal(), true)}</section>` : ""}
    <section class="cx-tiles am">
      <div class="cx-tile"><span>${amFreqWord(b.freq)} payment</span><strong class="num">${money(b.pmt)}</strong></div>
      <div class="cx-tile"><span>Rate</span><strong class="num">${caPct(b.apr)} APR</strong></div>
      <div class="cx-tile"><span>Term</span><strong class="num">${b.months} months</strong></div>
      <div class="cx-tile"><span>Total paid</span><strong class="num">${money0(p.paid)}</strong></div>
    </section>`;
}
function caAmortTerms(){
  var cmp = amCompare(); if (!cmp) return "";
  var b = cmp.base;
  return `<div class="pv-terms">
      <div><span>Loan amount</span><strong>${money(b.amount)}</strong></div>
      <div><span>Rate</span><strong>${caPct(b.apr)} APR</strong></div>
      <div><span>Term</span><strong>${b.months} months</strong></div>
      <div><span>Payments</span><strong>${amFreqWord(b.freq).replace(/^./, function(c){ return c.toUpperCase(); })} · ${money(b.pmt)}</strong></div>
      <div><span>First payment</span><strong>${C.fmtDate(b.first)}</strong></div></div>`;
}
function caAmortPrint(pb){
  var cmp = amCompare();
  if (!cmp) return `<p>Complete the payoff calculator on screen to print it.</p>`;
  var h = amHeadline(cmp);
  return `<div class="pv-hero up"><div class="pv-hero-l">
      <div class="pv-eyebrow">${h.eyebrow}</div><div class="pv-big">${h.big}</div>
      <div class="pv-hero-sub">${cmp.hasExtra ? "in interest, " + h.sub : "in interest over the full term — " + h.sub}</div></div></div>
    <div class="pv-two">
      <div class="pv-card"><div class="pv-card-h">As scheduled vs with extra payments</div>
        <table class="pv-cmp"><thead><tr><th></th><th>As scheduled</th><th>With extra payments</th></tr></thead><tbody>
        ${amCompareRows(cmp).map(function(r){ return `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="pv-card pv-chartcard"><div class="pv-card-h">Loan balance over time</div>${amChart(cmp, pb)}</div>
    </div>
    ${(function(){ var g = amGoal(); if (!g || g.reached) return "";
      return `<div class="pv-try"><div class="pv-card-h">Paid off in ${g.months} months</div><table><tbody>
        <tr><td>Option A · One lump sum with the first payment (${C.fmtDate(g.base.first)})</td><td>${money(g.lump.amount)}</td><td>interest paid ${money0(g.lump.sched.interest)} (saves ${money0(g.lump.saved)})</td></tr>
        <tr><td>Option B · Or add to every ${amFreqWord(g.base.freq)} payment</td><td>+${money(g.every.amount)}</td><td>interest paid ${money0(g.every.sched.interest)} (saves ${money0(g.every.saved)})</td></tr></tbody></table></div>`; })()}
    <div class="pv-try"><div class="pv-card-h">Year by year</div>${amYearTable(cmp, "")}</div>
    ${caState.lfull ? `<div class="pv-try pv-sched"><div class="pv-card-h">${cmp.hasExtra ? "Payment schedule with the extra payments, to the last payment" : "Payment schedule"} · ${cmp.plan.count} payments</div>${amScheduleTable(cmp.plan, "")}</div>` : ""}`;
}
function caAmortEmail(){
  var cmp = amCompare(); if (!cmp) return null;
  var b = cmp.base, p = cmp.plan, h = amHeadline(cmp);
  return { lead:h.eyebrow, big:h.big, sub:(cmp.hasExtra ? "in interest, " : "in interest over the full term — ") + h.sub, basis:amTermsLine(cmp),
    rows:[[`${amFreqWord(b.freq).replace(/^./, function(c){ return c.toUpperCase(); })} payment`, money(b.pmt)],
      ["As scheduled", `${b.count} payments · ${money(b.interest)} interest · last payment ${C.fmtDate(b.last)}`]].concat(cmp.hasExtra ? [
      ["With your extra payments", `${p.count} payments · ${money(p.interest)} interest · last payment ${C.fmtDate(p.last)}`],
      ["Extra payments", money(p.extra)], ["Interest saved", money(cmp.saved)]] : []).concat((function(){ var g = amGoal(); return g && !g.reached ? [
      ["To pay it off in " + g.months + " months", "one lump sum of " + money(g.lump.amount) + " with the first payment, or " + money(g.every.amount) + " more on every payment"]] : []; })()),
    extra:C.amortYears(p).map(function(y){ return ["Year " + y.year + " (to " + C.fmtDate(y.to) + ")", money(y.interest) + " interest · balance " + money(y.balance)]; }) };
}

function caTaxAssume(){
  var t = caTaxPct();
  return t ? "Assumes the payment schedule shown, investment earnings taxed at " + caPct(t) + " as they are earned, and no fees."
    : "Assumes the payment schedule shown, investments held tax-free (e.g. a TFSA) and no fees.";
}
function caInvestName(withThe){
  var s = caState;
  if (s.invest === "gic") return "a GIC";
  if (s.invest === "other") return s.otherName.trim() || "the chosen investment";
  return (withThe ? "the " : "") + C.MARKETS[s.invest].label;
}
function caSigned(n){ return (n < -0.5 ? "−" : "+") + money0(Math.abs(n)); }
function caPct(n){ return (Math.round(n * 100)/100).toFixed(2).replace(/\.?0+$/, "") + "%"; }
function caYears(months){ var y = months/12; return (y % 1 === 0 ? y : y.toFixed(1)) + " year" + (y === 1 ? "" : "s"); }
function caYearsText(months){ var y = months/12; return (y % 1 === 0 ? y : y.toFixed(1)) + "-year"; }
function caFreqWord(f){ return f === "biweekly" ? "bi-weekly" : "monthly"; }
function caPayLabel(f){ return f === "biweekly" ? "Bi-weekly payment" : "Monthly payment"; }
/* `p` payment periods at `ppy` a year, shown in years and months. */
function caDuration(p, ppy){
  if (!p) return "Never";
  var m = Math.round(p * 12 / (ppy || 12));
  var y = Math.floor(m/12), mo = m % 12;
  return (y ? y + " yr" + (y > 1 ? "s" : "") : "") + (y && mo ? " " : "") + (mo ? mo + " mo" : "");
}
function caField(label, key, opts){
  opts = opts || {};
  var v = caState[key], ph = opts.ph || "";
  if (/^[\d.,]+$/.test(ph) && ph !== "0") ph = "e.g. " + ph;
  return `<label class="f"><span>${label}</span>
    <div class="ca-in">${opts.pre ? `<i>${opts.pre}</i>` : ""}<input type="text" inputmode="decimal" data-ca="${key}" value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off">${opts.post ? `<i>${opts.post}</i>` : ""}</div>
    ${opts.hint ? `<small class="muted tiny">${opts.hint}</small>` : ""}</label>`;
}

/* ---- charts ---- */
function caColors(mode){
  if (mode === "cd") return { a:"var(--cd-blue)", b:"var(--cd-muted)", w:"var(--warn)", grid:"var(--cd-border)", txt:"var(--cd-muted)" };
  if (mode && typeof mode === "object") return { a:mode.base, b:"#94a3b8", w:"#b45309", grid:"#e6ebf2", txt:"#667085" };
  return mode ? { a:"#1d61d8", b:"#94a3b8", w:"#b45309", grid:"#e3e8ef", txt:"#667085" }
              : { a:"var(--blue)", b:"var(--muted)", w:"var(--warn)", grid:"var(--border)", txt:"var(--muted)" };
}
/* series: [{ data:[...per payment period], color, dash, width }] over `months` periods, `ppy` a year. */
function caLineChart(series, months, print, label, ppy){
  ppy = ppy || 12;
  var W = 640, H = 230, L = 64, R = 16, T = 14, B = 30, c = caColors(print);
  var all = [];
  series.forEach(function(s){ all = all.concat(s.data.slice(0, months + 1)); });
  var lo = Math.min(0, Math.min.apply(null, all)), hi = Math.max(1, Math.max.apply(null, all));
  /* Round axis steps (1, 2, 2.5 or 5 × a power of ten) so labels read $20k, $40k… */
  var raw = (hi - lo)/4, mag = Math.pow(10, Math.floor(Math.log10(raw))), step;
  step = [1, 2, 2.5, 5, 10].map(function(m){ return m*mag; }).filter(function(v){ return v >= raw; })[0];
  lo = Math.floor(lo/step)*step; hi = Math.ceil(hi/step)*step;
  var x = function(i){ return L + (W - L - R) * i / months; };
  var y = function(v){ return T + (H - T - B) * (1 - (v - lo)/(hi - lo)); };
  var ticks = [];
  for (var tv = lo; tv <= hi + step/2; tv += step) ticks.push(tv);
  var yl = ticks.map(function(v){ return `<line x1="${L}" x2="${W-R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${Math.abs(v) < 0.5 ? c.txt : c.grid}" stroke-width="1"/>
    <text x="${L-8}" y="${(y(v)+4).toFixed(1)}" text-anchor="end" font-size="11" fill="${c.txt}">${v < -0.5 ? "−" : ""}$${Math.abs(v) >= 1000 ? +(Math.abs(v)/1000).toFixed(1) + "k" : Math.round(Math.abs(v))}</text>`; }).join("");
  var yrs = Math.floor(months/ppy), xl = "", every = yrs > 10 ? 2 : 1;
  for (var yy = 0; yy <= yrs; yy += every) xl += `<text x="${x(yy*ppy).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="11" fill="${c.txt}">${yy === 0 ? "Today" : "Yr " + yy}</text>`;
  var gid = "cag" + Math.random().toString(36).slice(2, 8), defs = "";
  var lines = series.map(function(s){
    var pts = s.data.slice(0, months + 1).map(function(v, i){ return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ");
    var last = Math.min(months, s.data.length - 1), area = "";
    if (s.fill){
      var base = y(Math.max(lo, 0)).toFixed(1);
      defs = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".28"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>`;
      area = `<polygon points="${x(0).toFixed(1)},${base} ${pts} ${x(last).toFixed(1)},${base}" fill="url(#${gid})" stroke="none"/>`;
    }
    return area + `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.width || 3}" stroke-linejoin="round" ${s.dash ? `stroke-dasharray="6 5"` : ""}/>
      ${s.dot === false ? "" : `<circle cx="${x(last).toFixed(1)}" cy="${y(s.data[last]).toFixed(1)}" r="4.5" fill="${s.color}"/>`}`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="ca-chart" role="img" aria-label="${esc(label)}">${defs}${yl}${xl}${lines}</svg>`;
}
function caLegend(items){
  return `<div class="ca-legend">${items.map(function(it){
    return `<span><i style="background:${it.dash ? "transparent" : it.color};${it.dash ? "border-top:2px dashed " + it.color + ";height:0" : ""}"></i>${it.text}</span>`; }).join("")}</div>`;
}
function caInvestChart(res, print){
  var c = caColors(print), run = res.run;
  if (caView() === "budget"){
    return caLineChart([
      { data:run.portPath, color:c.b, width:2.5 },
      { data:run.untPath, color:c.a, fill:!!print && print !== true }
    ], res.N, print, "Cash left invested versus payments invested instead", res.ppy) +
    caLegend([{ color:c.a, text:"Finance: your cash left invested" }, { color:c.b, text:"Pay cash: the payments invested instead" }]);
  }
  return caLineChart([
    { data:run.loanPath, color:c.b, dash:true, width:2.5, dot:false },
    { data:run.acctPath, color:c.a, fill:!!print && print !== true }
  ], res.N, print, "Investment account and car loan balance over time", res.ppy) +
  caLegend([{ color:c.a, text:"Investment account (pays the car loan)" }, { color:c.b, dash:true, text:"Car loan still owing" }]);
}
function caLocChart(lc, print){
  var c = caColors(print), n = lc.n, ppy = lc.ppy, payoff = lc.loc.payoff;
  var H = payoff ? Math.max(n, payoff) : Math.max(n + 2*ppy, Math.ceil(n * 1.5 / ppy) * ppy);
  H = Math.min(H, 20*ppy);
  var pad = function(arr){ var out = arr.slice(0, H + 1), last = out[out.length - 1]; while (out.length < H + 1) out.push(last); return out; };
  var series = [{ data:pad(lc.dealer.path), color:c.a, fill:!!print && print !== true }];
  if (lc.payMode !== "interest") series.push({ data:pad(lc.loc.minPath), color:c.w, dash:true, width:2, dot:false });
  series.push({ data:pad(lc.loc.path), color:c.w });
  var leg = [{ color:c.a, text:"Dealer loan balance" },
    { color:c.w, text:"Line of credit balance" + (lc.payMode === "interest" ? " (interest only)" : "") }];
  if (lc.payMode !== "interest") leg.push({ color:c.w, dash:true, text:"Line of credit if only the minimum is paid" });
  return caLineChart(series, H, print, "Amount owing over time: dealer loan versus line of credit", ppy) + caLegend(leg);
}

/* ---- Cash vs finance & invest: words and numbers ---- */
function caHeadline(res){
  var inv = caInvestName(true), yrs = caYearsText(res.months);
  var lead = res.kind === "history"
    ? `At ${esc(inv)}'s average of ${caPct(res.rate)} a year (${res.avgFrom}–${res.avgTo}), financing leaves the customer`
    : caState.invest === "gic"
      ? `With a GIC at ${caPct(res.rate)} (guaranteed), financing leaves the customer`
      : `If ${esc(inv)} earns ${caPct(res.rate)} a year, financing leaves the customer`;
  return { good:res.adv >= 0, lead:lead, big:caSigned(res.adv), tail:res.adv >= 0 ? "ahead" : "behind" };
}
function caStory(res){
  var r = res.run, inv = caInvestName(true), term = Number(caState.term), M = res.months;
  var txt = `Put ${money0(r.cash)} in ${esc(inv)} today instead of paying cash, and pay each ${money(res.pmt)} ${caFreqWord(res.freq)} car payment out of that account. `;
  if (M === term) txt += `After ${caYears(M)} the car is paid off and ${r.acctEnd >= 0 ? money0(r.acctEnd) + " is left" : "the account is short by " + money0(-r.acctEnd)}.`;
  else if (M > term) txt += `The car is paid off after ${term} months and what's left keeps growing — ${money0(r.acctEnd)} by year ${M/12}.`;
  else txt += `After ${caYears(M)} the account holds ${money0(r.acctEnd)}; paying off the ${money0(r.owing)} still owed leaves ${caSigned(r.adv).replace("+", "")}.`;
  txt += ` Paying cash today leaves $0 to invest.`;
  var low = Math.min.apply(null, r.acctPath);
  if (low < -0.5){
    var m = Math.ceil(r.acctPath.findIndex(function(v){ return v < 0; }) * 12 / res.ppy);
    txt += ` <strong>Note:</strong> the account runs out in month ${m}, so later payments would come from the customer's pocket.`;
  }
  return txt;
}
/* Everything the three surfaces (FM page, customer screen, printout) need to tell
   the story in the chosen view. "account" = payments come out of the investment;
   "budget" = the cash stays invested untouched and payments come from income. */
function caView(){ return caState && caState.view === "budget" ? "budget" : "account"; }
function caStatement(res){
  var r = res.run, every = res.freq === "biweekly" ? "bi-weekly" : "monthly", good = res.adv >= 0, yrs = caYears(res.months);
  if (caView() === "budget"){
    var finEnd = r.untEnd - r.owing, rows = [
      [`Finance: ${money0(r.cash)} stays invested, untouched`, money0(r.untEnd), "", `earns ${caSigned(r.untouchedEarnings)} on the full amount; you pay ${money(r.pmt)} ${every} from your budget`],
      [`Pay cash: invest the ${money(r.pmt)} ${every} payment instead`, money0(r.portEnd), "", `${r.payCount} payments, ${money0(r.paid)} put in`]];
    if (r.owing > 0.5) rows.push([`Finance: loan still owing after ${yrs}`, "−" + money0(r.owing), "neg", ""]);
    return { rows:rows, totalLabel:good ? "Financing comes out ahead by" : "Paying cash comes out ahead by", total:money0(Math.abs(res.adv)),
      note:`Either way you spend the same money — ${money0(r.cash)} today plus ${money(r.pmt)} ${every} — only the order changes. Paying cash keeps that payment free to invest.`,
      payCash:{ value:money0(r.portEnd), sub:`if you invest ${money(r.pmt)} ${every} instead` },
      finance:{ value:money0(finEnd), sub:`your ${money0(r.cash)} left invested` },
      heroSub:(good ? "ahead of" : "behind") + ` paying cash and investing the payments, after ${yrs}`,
      chartTitle:`Your money over ${yrs}` };
  }
  var rows2 = [
    [`Cash invested today`, money0(r.cash), "", r.lost > 0 ? `the cash price, after the ${money0(r.lost)} cash discount` : ""],
    [`+ Earnings on what's left after each payment`, caSigned(r.earnings), r.earnings >= 0 ? "pos" : "neg", ""],
    [`− Car payments (${r.payCount} × ${money(r.pmt)})`, "−" + money0(r.paid), "neg", `includes ${money0(r.interestPaid)} interest`]];
  if (r.owing > 0.5) rows2.push([`− Loan still owing after ${yrs}`, "−" + money0(r.owing), "neg", ""]);
  return { rows:rows2, totalLabel:"= Left in your account", total:caSigned(res.adv),
    note:"Your cash goes into the account and every car payment comes out of it. Earnings are only on what's left.",
    payCash:{ value:"$0", sub:"left to invest" },
    finance:{ value:caSigned(res.adv), sub:`yours after ${yrs}` },
    heroSub:(good ? "left in your account" : "behind paying cash") + ` after ${yrs} — compared with $0 if you pay cash today`,
    chartTitle:`Your investment account over ${yrs}` };
}
function caReceipt(res, print){
  var st = caStatement(res), budget = caView() === "budget";
  return `<div class="ca-receipt${print ? " print" : ""}"><div class="ca-receipt-h">How it's worked out</div>
    ${st.rows.map(function(x){ return `<div class="ca-rr"><span>${x[0]}${x[3] ? `<small class="ca-rr-sub">${x[3]}</small>` : ""}</span><strong class="num ${x[2]}">${x[1]}</strong></div>`; }).join("")}
    <div class="ca-rr total"><span>${st.totalLabel}${budget ? "" : ` <span class="ca-vs">vs $0 if paying cash</span>`}</span><strong class="num">${st.total}</strong></div>
    <p class="ca-story">${budget ? st.note : caStory(res)}</p></div>`;
}
function caWhyLines(res){
  var inv = caInvestName(true), out = [];
  if (res.kind === "history"){
    out.push(`In <strong>${Math.round(res.aheadPct)}%</strong> of past ${caYearsText(res.months)} periods (${res.firstYear}–${res.lastYear}), ${esc(inv)} beat this loan.`);
    out.push(`Worst period ${caSigned(res.worst)} (from ${res.worstStart}) · Best ${caSigned(res.best)} (from ${res.bestStart}).`);
  }
  if (res.breakEven !== null) out.push(`Financing comes out ahead whenever the investment earns more than <strong>${caPct(res.breakEven)}</strong> a year.`);
  return out;
}
function caYearTable(res, print){
  var r = res.run, hist = false;
  if (caView() === "budget"){
    var brows = r.years.map(function(y){
      return `<tr><td>Yr ${y.n}${hist && y.label ? `<div class="tiny muted">${esc(y.label)}</div>` : ""}</td>
        <td class="right num">${y.ret >= 0 ? "+" : "−"}${caPct(Math.abs(y.ret))}</td>
        <td class="right num">${money0(y.unt)}</td><td class="right num">${y.owing > 0.5 ? money0(y.owing) : "Paid off"}</td>
        <td class="right num">${money0(y.port)}</td><td class="right num"><strong>${caSigned(y.unt - y.owing - y.port)}</strong></td></tr>`;
    }).join("");
    var btable = `<table class="ca-ytable"><thead><tr><th>Year</th><th class="right">${hist ? "Market return" : "Return"}</th>
      <th class="right">Finance: cash invested</th><th class="right">Loan owing</th><th class="right">Pay cash: payments invested</th><th class="right">Difference</th></tr></thead>
      <tbody>${brows}</tbody></table>`;
    return print ? `<h3>Year by year</h3>${btable}`
      : `<details class="ca-years"><summary>Year-by-year breakdown</summary><div class="tablewrap">${btable}</div></details>`;
  }
  var rows = r.years.map(function(y){
    return `<tr><td>Yr ${y.n}${hist && y.label ? `<div class="tiny muted">${esc(y.label)}</div>` : ""}</td>
      <td class="right num">${y.ret >= 0 ? "+" : "−"}${caPct(Math.abs(y.ret))}</td>
      <td class="right num">${money0(y.start)}</td><td class="right num">${caSigned(y.earn)}</td>
      <td class="right num">${y.pay ? "−" + money0(y.pay) : "—"}</td><td class="right num"><strong>${money0(y.end)}</strong></td>
      <td class="right num">${y.owing > 0.5 ? money0(y.owing) : "Paid off"}</td></tr>`;
  }).join("");
  var table = `<table class="ca-ytable"><thead><tr><th>Year</th><th class="right">${hist ? "Market return" : "Return"}</th><th class="right">Account at start</th>
    <th class="right">Earnings</th><th class="right">Car payments</th><th class="right">Account at end</th><th class="right">Loan owing</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  return print ? `<h3>Year by year</h3>${table}`
    : `<details class="ca-years"><summary>Year-by-year breakdown</summary><div class="tablewrap">${table}</div></details>`;
}

/* ---- Line of credit vs dealer: words and numbers ---- */
function caLocHeadline(lc){
  var term = lc.term;
  if (!lc.loc.payoff){
    return { cls:"bad", lead:"At this payment, the line of credit is never paid off",
      big:"Still owing " + money0(lc.loc.owingAtTerm),
      sub:`after ${term} months, when the dealer loan is already paid off` + (lc.loc.grows ? " — the payment doesn't cover the interest, so the balance keeps growing" : "") };
  }
  var d = lc.locCheaperBy, when = `Line of credit paid off in ${caDuration(lc.loc.payoff, lc.ppy)} · dealer loan in ${caDuration(lc.n, lc.ppy)}` +
    (lc.draw ? `. Includes interest on the extra ${money0(lc.draw.amount)} withdrawal` : "");
  if (Math.abs(d) < 1) return { cls:"neutral", lead:"At these rates and payments, both cost the same", big:"Same cost", sub:when + ". The difference is in the risks below." };
  if (d < 0) return { cls:"good", lead:"Dealer financing costs less in total by", big:money0(-d), sub:when };
  return { cls:"bad", lead:"At today's rate, the line of credit costs less in total by", big:money0(d), sub:when + ". Its rate can change — see “if rates rise”." };
}
function caLocRows(lc){
  var I = caInputs(), L = lc.loc, term = lc.term;
  var drawNote = lc.draw ? ` <div class="tiny muted">+ ${money0(lc.draw.amount)} more in year ${lc.draw.year}</div>` : "";
  var locPay = lc.payMode === "interest" ? `${money(L.ioPmt)} <div class="tiny muted">interest only — rises if rates rise</div>`
    : money(L.pmt) + (lc.payMode === "match" ? ` <div class="tiny muted">same as dealer payment</div>` : "");
  var locInt = L.payoff ? money0(L.interest)
    : lc.payMode === "interest" ? `${money0(L.ioInterestAtTerm)} <div class="tiny muted">in ${term} months, and still owing ${money0(L.owingAtTerm)}</div>`
    : `<span class="neg">Keeps growing</span> <div class="tiny muted">still owing ${money0(L.owingAtTerm)} after ${term} months</div>`;
  var rise = L.risePayoff ? `${money0(L.riseInterest)} <div class="tiny muted">paid off in ${caDuration(L.risePayoff, lc.ppy)}</div>`
    : `<span class="neg">Never paid off</span> <div class="tiny muted">still owing ${money0(L.riseOwingAtTerm)} after ${term} months</div>`;
  return [
    ["Rate", `${caPct(I.apr)} <span class="tag ok">Fixed</span>`, `${caPct(L.rate)} <span class="tag warn">Variable</span>`],
    ["Amount borrowed", money0(lc.dealer.amount), money0(L.amount) + drawNote],
    [caPayLabel(lc.freq), money(lc.dealer.pmt), locPay],
    ["Paid off in", caDuration(lc.n, lc.ppy), L.payoff ? caDuration(L.payoff, lc.ppy) : `<span class="neg">Never at this payment</span>`],
    ["Total interest", money0(lc.dealer.interest), locInt],
    [`If rates rise ${lc.shock}% after year 1`, `${money0(lc.dealer.interest)} <div class="tiny muted">no change</div>`, rise]
  ];
}
function caLocTable(lc){
  return `<table class="ca-table"><thead><tr><th></th><th class="right">Dealer financing</th><th class="right">Line of credit</th></tr></thead>
    <tbody>${caLocRows(lc).map(function(r){ return `<tr><td>${r[0]}</td><td class="right num">${r[1]}</td><td class="right num">${r[2]}</td></tr>`; }).join("")}</tbody></table>`;
}
function caLocReasons(){
  return [
    "<strong>Fixed rate:</strong> the dealer payment never changes. A line of credit moves with prime.",
    "<strong>A finish line:</strong> the dealer loan is paid off on a set date. A line only asks for interest, so the balance can stay for years.",
    "<strong>No creeping balance:</strong> every new withdrawal from a line adds to what's owed and to the interest. The car loan can only go down.",
    "<strong>Keeps your line free:</strong> the full credit line stays available for emergencies, and a HELOC keeps your home out of the car purchase."
  ];
}

/* ---- page ---- */
function viewCashAdv(){
  if (!caState) caState = caBlank();
  if (["invest","amort","loc"].indexOf(caState.tab) === -1) caState.tab = "invest";
  caSavePrefs();
  setTimeout(caPushWindow, 0);
  var s = caState, tabs = `<div class="ca-tabs no-print">
      ${[["invest","Cash vs Finance &amp; Invest"],["amort","Payoff calculator"],["loc","Line of Credit vs Dealer"]].map(function(t){
        return `<button class="btn ${s.tab===t[0]?"on":""}" data-act="ca-tab" data-tab="${t[0]}">${t[1]}</button>`; }).join("")}
      <span class="sp">${state.tx && (state.tx.customer.name || Number(state.tx.vehicle.price) > 0) ? `<button class="btn" data-act="ca-from-deal" title="Fill in the customer, amount, rate and term from the deal on the Finance screen">Use deal on screen</button>` : ""}
      <button class="btn" data-act="ca-clear">Clear</button>
      <button class="btn" data-act="ca-window">Second screen ↗</button>
      <button class="btn" data-act="ca-present">Full screen</button>
      <button class="btn" data-act="ca-email">Email</button>
      <button class="btn primary" data-act="ca-print">Print for customer</button></span></div>
    <p class="ca-tabdesc no-print">${CA_TAB_DESC[s.tab] || ""}</p>`;
  var terms = [24,36,48,60,72,84,96].map(function(t){ return `<option value="${t}" ${String(t)===String(s.term)?"selected":""}>${t} months</option>`; }).join("");
  var common = `${caField("Customer name (optional)", "customer", { ph:"For the printout" })}
    ${caField("Cash amount (all-in, with tax)", "amount", { pre:"$", ph:"45,000" })}
    <div class="ca-row">${caField("Dealer rate (APR)", "apr", { post:"%", ph:"1.99" })}
      <label class="f"><span>Loan term</span><select data-ca="term">${terms}</select></label></div>
    <label class="f"><span>Payments</span><div class="ca-seg two">
      <button class="btn ${s.freq!=="biweekly"?"on":""}" data-act="ca-freq" data-freq="monthly">Monthly</button>
      <button class="btn ${s.freq==="biweekly"?"on":""}" data-act="ca-freq" data-freq="biweekly">Bi-weekly</button></div></label>
    ${caField("Cash discount lost by financing", "lost", { pre:"$", ph:"0", hint:"Only if the cash price is lower than the finance price." })}`;
  var left, right;
  if (s.tab === "amort"){ left = caAmortLeft(); right = caAmortRight(); }
  else if (s.tab !== "loc"){
    var yearOpts = `<option value="same" ${s.years==="same"?"selected":""}>Same as loan</option>` +
      [1,2,3,4,5,6,7,8,10,12,15].map(function(y){ return `<option value="${y}" ${String(y)===String(s.years)?"selected":""}>${y} year${y>1?"s":""}</option>`; }).join("");
    var inv = [["gic","GIC"],["sp500","S&P 500"],["tsx","TSX"],["other","Other"]].map(function(o){
      return `<button class="btn ${s.invest===o[0]?"on":""}" data-act="ca-invest" data-inv="${o[0]}">${o[1]}</button>`; }).join("");
    left = `${common}
      ${caField("Down payment (optional)", "down", { pre:"$", ph:"0", hint:"Paid today either way; the comparison uses the rest." })}
      <label class="f"><span>Customer invests the cash in</span><div class="ca-seg">${inv}</div></label>
      ${caPresetChips()}
      ${s.invest === "gic" ? caField("GIC rate", "gicRate", { post:"%", ph:"3.25", hint:"Use a current bank or credit union GIC rate." }) : ""}
      ${s.invest === "other" ? `<div class="ca-row">${caField("Investment name", "otherName", { ph:"e.g. XEQT, Apple" })}${caField("Expected return / yr", "otherRate", { post:"%", ph:"7" })}</div>` : ""}
      ${s.invest === "sp500" || s.invest === "tsx" ? (function(){
        var opts = [["all","Since 1990"],["10","Last 10 years"],["5","Last 5 years"]].map(function(o){
          var a = C.marketAverage(s.invest, o[0] === "all" ? 0 : Number(o[0]));
          return `<button class="btn ${(s.avgOver||"all")===o[0]?"on":""}" data-act="ca-avg" data-avg="${o[0]}">${o[1]}<small>${caPct(a.rate)}/yr</small></button>`; }).join("");
        return `<label class="f"><span>Average return over</span><div class="ca-seg three ca-avg">${opts}</div>
          <small class="muted tiny">${esc(C.MARKETS[s.invest].long)}, dividends included, compound average. Since 1990 is the fairest long-run figure; recent years have been unusually strong.</small></label>`;
      })() : ""}
      <label class="f"><span>Investment period</span><select data-ca="years">${yearOpts}</select></label>
      <label class="f"><span>Where the cash is invested</span><div class="ca-seg two">
        <button class="btn ${s.acct!=="taxable"?"on":""}" data-act="ca-acct" data-acct="tfsa">TFSA / RRSP (tax-free)</button>
        <button class="btn ${s.acct==="taxable"?"on":""}" data-act="ca-acct" data-acct="taxable">Taxable account</button></div></label>
      ${s.acct === "taxable" ? caField("Tax on the earnings", "taxRate", { post:"%", ph:"30", hint:"GIC or savings interest: the customer's marginal tax rate. Stocks: about half of it (capital gains)." }) : ""}
      <label class="f"><span>Show it as</span><div class="ca-seg two">
        <button class="btn ${caView()==="account"?"on":""}" data-act="ca-view" data-view="account">Pay from the investment</button>
        <button class="btn ${caView()==="budget"?"on":""}" data-act="ca-view" data-view="budget">Keep it invested</button></div>
        <small class="muted tiny">Same result either way — pick the picture that fits how this customer thinks.</small></label>`;
    var I = caInputs(), res = C.cashAdvantage(I);
    if (!res){
      var need = [caNum(s.amount) ? "" : "the cash amount", caNum(s.apr) === null ? "the dealer rate" : "",
        s.invest === "gic" && caNum(s.gicRate) === null ? "a GIC rate" : s.invest === "other" && caNum(s.otherRate) === null ? "the expected return" : ""].filter(Boolean);
      right = `<div class="ca-empty"><div class="ca-empty-ic">$</div><h3>Enter ${need.length ? need.join(need.length > 2 ? ", " : " and ").replace(/, ([^,]*)$/, " and $1") : "the details"} on the left</h3>
        <p class="muted small">The comparison appears here as you type.</p></div>`;
    } else {
      var h = caHeadline(res), why = caWhyLines(res);
      right = `${caSummary(res, I)}<div class="ca-hero ${h.good?"good":"bad"}">
          <div class="ca-lead">${h.lead}</div>
          <div class="ca-big num">${h.big} <span>${h.tail}</span></div>
          <div class="ca-sub">after ${caYears(res.months)}, compared with paying cash${caTaxNote()}</div></div>
        ${caReceipt(res, false)}
        ${caView() === "budget" ? "" : `<p class="ca-fmnote no-print"><strong>For you, not the customer:</strong> if the ${money0(res.run.cash)} had stayed untouched it would have earned ${money0(res.run.untouchedEarnings)} over this period. The comparison counts only ${money0(res.run.earnings)}, because each car payment leaves the account first.</p>`}
        ${why.length ? `<ul class="ca-why">${why.map(function(w){ return `<li>${w}</li>`; }).join("")}</ul>` : ""}
        ${caInvestChart(res, false)}
        ${res.kind === "history" ? `<p class="tiny muted" style="margin:6px 0 0">Uses ${esc(caInvestName())}'s compound average return, ${res.avgFrom}–${res.avgTo}. Real years go up and down; past returns are not a guarantee.</p>` : ""}
        ${caYearTable(res, false)}`;
    }
  } else {
    var pays = [["match","Match dealer payment"],["interest","Interest only"],["custom","Custom amount"]].map(function(o){
      return `<button class="btn ${s.payMode===o[0]?"on":""}" data-act="ca-paymode" data-mode="${o[0]}">${o[1]}</button>`; }).join("");
    var drawYears = [1,2,3,4,5,6,7,8].map(function(y){ return `<option value="${y}" ${String(y)===String(s.drawYear)?"selected":""}>Year ${y}</option>`; }).join("");
    left = `${common}
      ${caField("Line of credit rate", "locRate", { post:"%", ph:"5.45", hint:"Prime is 4.45% (Oct 2026); most HELOCs are prime + 0–1%. Unsecured lines are higher." })}
      <label class="f"><span>Customer pays on the line (${caFreqWord(s.freq)})</span><div class="ca-seg three">${pays}</div></label>
      ${s.payMode === "custom" ? caField(s.freq === "biweekly" ? "Bi-weekly payment on the line" : "Monthly payment on the line", "payAmount", { pre:"$", ph:s.freq === "biweekly" ? "275" : "600" }) : ""}
      <div class="ca-row">${caField("Extra withdrawal later (optional)", "drawAmount", { pre:"$", ph:"0" })}
        <label class="f"><span>Taken in</span><select data-ca="drawYear">${drawYears}</select></label></div>
      <p class="tiny muted" style="margin:-6px 0 12px">Shows what happens if the customer borrows more on the same line, e.g. for a trip or renovation.</p>`;
    var lc = C.locCompare(caInputs());
    if (!lc){
      right = `<div class="ca-empty"><div class="ca-empty-ic">%</div><h3>Enter the cash amount, dealer rate and line of credit rate${s.payMode==="custom"?", and the payment":""}</h3>
        <p class="muted small">The comparison appears here as you type.</p></div>`;
    } else {
      var lh = caLocHeadline(lc);
      right = `<div class="ca-hero ${lh.cls}">
          <div class="ca-lead">${lh.lead}</div>
          <div class="ca-big num">${lh.big}</div>
          <div class="ca-sub">${lh.sub}</div></div>
        <div class="tablewrap">${caLocTable(lc)}</div>
        <div style="margin-top:14px">${caLocChart(lc, false)}</div>
        <ul class="ca-why" style="margin-top:14px">${caLocReasons().map(function(w){ return `<li>${w}</li>`; }).join("")}</ul>`;
    }
  }
  var fmOnly = `<details class="ca-talk no-print"><summary>Talk track for the Finance Manager <span class="tag">Not shown to customer</span></summary>
    <dl>
      <dt>Open with</dt><dd>“Before I take your cheque, I show every customer both options — it takes one minute and the choice is yours.”</dd>
      <dt>Explaining the number</dt><dd>“Put your cash in the account instead of giving it to us. Your car payments come out of that account. When the car is paid off, this is what's still yours. Pay cash and that number is zero.”</dd>
      <dt>“That's earnings on the whole amount, isn't it?”</dt><dd>“No — the earnings are only on what's left in the account after each payment comes out. Here's the year-by-year table.” Open the Year-by-year breakdown: the account shrinks every year, and so do the earnings.</dd>
      <dt>“I don't like debt.”</dt><dd>“Understood. You'd still own the vehicle, and the cash stays in your name. If you change your mind, you can pay the loan off at any time — Ontario's Consumer Protection Act (s. 77) gives borrowers the right to prepay the full balance without a penalty.” Confirm the lender's contract terms.</dd>
      <dt>“I don't want to be locked in.”</dt><dd>The customer screen and printout show what paying the loan off after 3, 6 or 12 months would cost — often less than the cash earned meanwhile.</dd>
      <dt>“I'd rather not finance all of it.”</dt><dd>Enter a down payment on the left; the comparison uses only the part that's financed.</dd>
      <dt>Payoff calculator</dt><dd>For a customer who wants the lower payment of a longer term but plans to pay it down with a bonus or tax refund: enter the lump sums and show the interest saved and the new last-payment date.</dd>
      <dt>“I want to own it outright.”</dt><dd>“You will own it either way — financing just decides where your cash sits while the car is paid off.”</dd>
      <dt>“I'll use my line of credit.”</dt><dd>Use the Line of Credit tab with their real rate. Switch to “Interest only” and add an extra withdrawal to show how a line can stay open for years. Be honest if theirs truly costs less.</dd>
      <dt>“Rates are high.”</dt><dd>Show the break-even rate. If a GIC alone beats it, that is a guaranteed result with no market risk.</dd>
      <dt>Never</dt><dd>Recommend a specific investment or promise returns. Let the customer choose what they would invest in.</dd>
    </dl></details>`;
  return `${tabs}<div class="ca-grid">
    <div class="card"><div class="card-b">${left}</div>${fmOnly}</div>
    <div class="card"><div class="card-b ca-results">${right}</div>
      <div class="ca-disc">${caDisclaimer(s.tab)}</div></div></div>`;
}
function caDisclaimer(tab){
  if (tab === "amort") return "Illustration only. Payments, interest and dates are estimates from the amount, rate, term and payment frequency shown, with interest worked out each payment period and rounded to the cent. Your credit agreement and lender statements are final. Ontario's Consumer Protection Act lets you prepay without penalty; ask your lender how it applies extra payments. Financing is subject to lender approval.";
  return tab === "loc"
    ? "Illustration only, not financial advice. Line of credit rates are variable and set by the customer's lender; minimum payments vary by lender. Interest is shown compounding each payment period, with any unpaid interest added to the balance. Dealer financing is subject to lender approval; the credit agreement shows the APR and cost of borrowing."
    : "Illustration only — not investment, tax or legal advice. Investment returns are not guaranteed and can be negative; past performance does not predict future results. " + caTaxAssume() + " Historical data: S&P 500 total return (NYU Stern) converted to CAD (Federal Reserve USD/CAD); S&P/TSX Composite total return from 2018, price return plus estimated 2.5% dividends before. Financing is subject to lender approval.";
}

/* ---- customer screen (second window or full screen) ----
   A presentation view: dealership header, one hero result, the "two paths"
   side by side, the worked-out statement, chart and key figures. Colours come
   from the dealership's brand (--cd-* variables), in light or dark mode. */
function caIcon(name){
  var p = {
    lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    flag:'<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    trend:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    check:'<path d="M5 12l5 5 9-10"/>',
    cash:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    grow:'<path d="M4 20h16"/><path d="M7 16v-4M12 16V8M17 16v-7"/>'
  }[name] || "";
  return `<svg class="cx-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
function caDonut(pct){
  var r = 30, c = 2*Math.PI*r, f = Math.max(0, Math.min(100, pct))/100;
  return `<svg class="cx-donut" viewBox="0 0 76 76" aria-hidden="true">
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--cd-border)" stroke-width="8"/>
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--cd-blue)" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${(c*f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 38 38)"/>
    <text x="38" y="43" text-anchor="middle" font-size="16" font-weight="700" fill="currentColor">${Math.round(pct)}%</text></svg>`;
}
function caCustomerHtml(){
  var s = caState || caBlank(), b = V.brand(), cfg = state.config, I = caInputs();
  var name = s.customer.trim(), first = name.split(" ")[0];
  var head = `<header class="cx-head">
      <div class="cx-brand"><div class="cx-mark">${esc(cfg.logoMark || b.mark)}</div>
        <div><div class="cx-dealer">${esc(cfg.name)}</div><div class="cx-lender">${esc(b.finLabel)}</div></div></div>
      <div class="cx-meta">${name ? `<div class="cx-for">Prepared for <strong>${esc(name)}</strong></div>` : ""}<div>${C.fmtDate(C.todayISO())}</div></div>
    </header>`;
  var foot = `<footer class="cx-foot"><p>${caDisclaimer(s.tab)}</p><span>${esc(cfg.name)} · ${esc(cfg.address)}, ${esc(cfg.city)} · ${esc(cfg.phone)}</span></footer>`;
  var wait = `<div class="cx-wait"><div class="cx-eyebrow">${esc(cfg.name)}</div>
      <div class="cx-welcome">Welcome${first ? ", " + esc(first) : ""}</div>
      <p>Your Finance Manager is preparing your personal comparison.</p><div class="cx-dots"><i></i><i></i><i></i></div></div>`;
  var body;
  if (s.tab === "amort") body = caAmortCustomer() || wait;
  else if (s.tab !== "loc"){
    var res = C.cashAdvantage(I);
    if (!res) body = wait;
    else {
      var good = res.adv >= 0, r = res.run, inv = caInvestName(true);
      var basis = res.kind === "history" ? `Based on ${esc(inv)}'s average of ${caPct(res.rate)} a year, ${res.avgFrom}–${res.avgTo}`
        : caState.invest === "gic" ? `Based on a GIC at ${caPct(res.rate)}, guaranteed` : `If ${esc(inv)} earns ${caPct(res.rate)} a year`;
      basis += caTaxNote() + (I.down > 0 ? ` · ${money0(I.down)} down payment today` : "");
      var st = caStatement(res), tryRows = caPayoffRows(res, I).slice(0, 3);
      var tiles = [
        [caPayLabel(res.freq), money(res.pmt)],
        ["Term", esc(s.term) + " months"],
        ["Rate", caPct(I.apr) + " APR"]];
      body = `<section class="cx-hero ${good ? "up" : "down"}">
          <div class="cx-hero-l">
            <div class="cx-eyebrow light">${good ? "Your financing advantage" : "Your comparison"}</div>
            <div class="cx-big num">${caSigned(res.adv)}</div>
            <div class="cx-hero-sub">${st.heroSub}</div>
            <div class="cx-basis">${basis}</div>
          </div>
          <div class="cx-paths">
            <div class="cx-path ${good ? "" : "win"}">${caIcon("cash")}<div><span>Pay cash today</span><strong class="num">${st.payCash.value}</strong><em>${st.payCash.sub}</em></div></div>
            <div class="cx-path ${good ? "win" : ""}">${caIcon("grow")}<div><span>Finance &amp; invest</span><strong class="num">${st.finance.value}</strong><em>${st.finance.sub}</em></div></div>
          </div>
        </section>
        <section class="cx-row">
          <div class="cx-card cx-stmt"><div class="cx-card-h">How it's worked out</div>
            ${st.rows.map(function(x){ return `<div class="cx-line"><span>${x[0]}${x[3] ? `<small>${x[3]}</small>` : ""}</span><strong class="num ${x[2] === "pos" ? "pos" : ""}">${x[1]}</strong></div>`; }).join("")}
            <div class="cx-line total"><span>${st.totalLabel.replace(/^= /, "")}</span><strong class="num">${st.total}</strong></div>
            <p class="cx-note">${st.note}</p></div>
          <div class="cx-card cx-chart"><div class="cx-card-h">${st.chartTitle}</div>
            ${caInvestChart(res, "cd")}</div>
        </section>
        <section class="cx-tiles">
          ${tiles.map(function(t){ return `<div class="cx-tile"><span>${t[0]}</span><strong class="num">${t[1]}</strong></div>`; }).join("")}
          ${res.kind === "history"
            ? `<div class="cx-tile cx-win">${caDonut(res.aheadPct)}<div><span>History check</span><strong>Beat this loan in ${Math.round(res.aheadPct)}% of past ${caYearsText(res.months)} periods</strong><em>${res.firstYear}–${res.lastYear}</em></div></div>`
            : res.breakEven !== null ? `<div class="cx-tile"><span>Break-even return</span><strong class="num">${caPct(res.breakEven)} a year</strong></div>` : ""}
        </section>
        ${tryRows.length ? `<section class="cx-try"><div class="cx-card-h">Try it — pay it off any time</div><div class="cx-try-row">
          ${tryRows.map(function(x){ return `<div class="cx-tile"><span>Paid off after ${x.m} months</span><strong class="num">${money0(x.interest)} interest</strong><em>${caSigned(x.result)} compared with paying cash</em></div>`; }).join("")}</div></section>` : ""}
        <section class="cx-reasons three">${caReasons().map(function(r){ return `<div class="cx-reason">${caIcon(r[0])}<p><strong>${esc(r[1])}.</strong> ${esc(r[2])}</p></div>`; }).join("")}</section>`;
    }
  } else {
    var lc = C.locCompare(I);
    if (!lc) body = wait;
    else {
      var lh = caLocHeadline(lc), L = lc.loc;
      var plan = function(title, chip, chipCls, rows, win){
        return `<div class="cx-plan ${win ? "win" : ""}"><div class="cx-plan-h"><strong>${title}</strong><span class="cx-chip ${chipCls}">${chip}</span></div>
          ${rows.map(function(x){ return `<div class="cx-line"><span>${x[0]}</span><strong class="num">${x[1]}</strong></div>`; }).join("")}</div>`;
      };
      var dealerWins = lh.cls !== "bad";
      var reasons = caLocReasons(), icons = ["lock","flag","trend","shield"];
      body = `<section class="cx-hero ${lh.cls === "bad" ? "down" : "up"}">
          <div class="cx-hero-l">
            <div class="cx-eyebrow light">Line of credit vs dealer financing</div>
            <div class="cx-lead">${lh.lead}</div>
            <div class="cx-big num">${lh.big}</div>
            <div class="cx-hero-sub">${lh.sub}</div>
          </div>
        </section>
        <section class="cx-row loc">
          <div class="cx-plans">
            ${plan("Dealer financing", "Fixed rate", "ok", [
              ["Rate", caPct(I.apr)], [caPayLabel(lc.freq), money(lc.dealer.pmt)],
              ["Paid off in", caDuration(lc.n, lc.ppy)], ["Total interest", money0(lc.dealer.interest)],
              [`If rates rise ${lc.shock}%`, "No change"]], dealerWins)}
            ${plan("Line of credit", "Variable rate", "warn", [
              ["Rate", caPct(L.rate)], [caPayLabel(lc.freq), lc.payMode === "interest" ? money(L.ioPmt) + " <small>interest only</small>" : money(L.pmt)],
              ["Paid off in", L.payoff ? caDuration(L.payoff, lc.ppy) : "Never at this payment"],
              ["Total interest", L.payoff ? money0(L.interest) : "Still owing " + money0(L.owingAtTerm)],
              [`If rates rise ${lc.shock}%`, L.risePayoff ? money0(L.riseInterest) + " interest" : "Never paid off"]], !dealerWins)}
          </div>
          <div class="cx-card cx-chart"><div class="cx-card-h">What you owe over time</div>${caLocChart(lc, "cd")}</div>
        </section>
        <section class="cx-reasons">${reasons.map(function(t, i){ return `<div class="cx-reason">${caIcon(icons[i])}<p>${t}</p></div>`; }).join("")}</section>`;
    }
  }
  return `<div class="cd cx" style="${V.cdThemeStyle()}">${head}<main class="cx-main">${body}</main>${foot}</div>`;
}
function caWindowDoc(){
  var css = "";
  try { css = appCssText(); } catch (e) {}
  return '<!DOCTYPE html><html data-theme="' + state.ui.theme + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Your Options — ' + esc(state.config.name) + '</title><style>' + css +
    ' html,body{height:100%} body{margin:0;background:var(--bg)} .cd{min-height:100vh;display:flex;flex-direction:column}</style></head><body>' +
    caCustomerHtml() + '</body></html>';
}
function caPushWindow(){
  if (!caWin || caWin.closed || !caState || state.route !== "cashadv") return;
  try { caWin.document.open(); caWin.document.write(caWindowDoc()); caWin.document.close(); }
  catch (e) { caWin = null; }
}
function caOpenWindow(){
  var w = null;
  try { w = window.open("", "dccCashAdvantage"); } catch (e) { w = null; }
  if (!w){
    caState.present = true;
    toast("This browser blocked the new tab, so the customer screen opened full screen instead.","err");
    render(); return;
  }
  caWin = w; caPushWindow();
  toast("Customer screen opened in a new tab — drag it to the customer's monitor. It updates as you type.","ok");
  render();
}
/* ---- customer printout ----
   Same story as the customer screen, laid out for one Letter page in the
   dealership's brand colour (always the light palette on paper). */
function caHexMix(a, b, t){
  var p = function(h){ return [1,3,5].map(function(i){ return parseInt(h.slice(i, i+2), 16); }); };
  var x = p(a), y = p(b);
  return "#" + x.map(function(v, i){ return ("0" + Math.round(v + (y[i] - v)*t).toString(16)).slice(-2); }).join("");
}
function caPrintBrand(){
  var base = V.brandInk().hue;
  return { base:base, deep:caHexMix(base, "#0a1220", .45), soft:caHexMix(base, "#ffffff", .92), line:caHexMix(base, "#ffffff", .75) };
}
function cashAdvPrint(){
  var s = caState || caBlank(), I = caInputs(), cfg = state.config, b = V.brand(), pb = caPrintBrand();
  var u = V.currentUser ? V.currentUser() : null, name = s.customer.trim();
  var vars = `--pv-base:${pb.base};--pv-deep:${pb.deep};--pv-soft:${pb.soft};--pv-line:${pb.line}`;
  var head = `<div class="pv-head">
      <div class="pv-brand"><div class="pv-mark">${esc(cfg.logoMark || b.mark)}</div>
        <div><div class="pv-dealer">${esc(cfg.name)}</div><div class="pv-lender">${esc(b.finLabel)}</div></div></div>
      <div class="pv-title"><div class="pv-doc">${s.tab === "loc" ? "Line of Credit vs Dealer Financing" : s.tab === "amort" ? "Loan Payoff &amp; Amortization" : "Cash vs Finance Comparison"}</div>
        <div class="pv-sub">${name ? "Prepared for <strong>" + esc(name) + "</strong> · " : ""}${C.fmtDate(C.todayISO())}</div></div>
    </div>`;
  var terms = s.tab === "amort" ? caAmortTerms() : `<div class="pv-terms">
      <div><span>Amount</span><strong>${money0(I.total === null ? I.amount : I.total)}</strong></div>
      ${I.down > 0 ? `<div><span>Down payment</span><strong>${money0(I.down)}</strong></div>` : ""}
      <div><span>Dealer rate</span><strong>${caPct(I.apr)} APR</strong></div>
      <div><span>Term</span><strong>${esc(s.term)} months</strong></div>
      <div><span>Payments</span><strong>${caFreqWord(I.freq).replace(/^./, function(c){ return c.toUpperCase(); })}</strong></div>
      ${I.lost ? `<div><span>Cash discount</span><strong>${money0(I.lost)}</strong></div>` : ""}
    </div>`;
  var body;
  if (s.tab === "amort") body = caAmortPrint(pb);
  else if (s.tab === "loc"){
    var lc = C.locCompare(I);
    if (!lc) body = `<p>Complete the line of credit comparison on screen to print it.</p>`;
    else {
      var lh = caLocHeadline(lc), L = lc.loc, dealerWins = lh.cls !== "bad";
      var plan = function(title, chip, rows, win){
        return `<div class="pv-plan ${win ? "win" : ""}"><div class="pv-plan-h"><strong>${title}</strong><span>${chip}</span></div>
          ${rows.map(function(x){ return `<div class="pv-line"><span>${x[0]}</span><strong>${x[1]}</strong></div>`; }).join("")}</div>`;
      };
      body = `<div class="pv-hero"><div class="pv-hero-l">
          <div class="pv-eyebrow">${lh.lead}</div><div class="pv-big">${lh.big}</div><div class="pv-hero-sub">${lh.sub}</div></div></div>
        <div class="pv-two">
          ${plan("Dealer financing", "Fixed rate", [
            ["Rate", caPct(I.apr)], [caPayLabel(lc.freq), money(lc.dealer.pmt)], ["Paid off in", caDuration(lc.n, lc.ppy)],
            ["Total interest", money0(lc.dealer.interest)], [`If rates rise ${lc.shock}%`, "No change"]], dealerWins)}
          ${plan("Line of credit", "Variable rate", [
            ["Rate", caPct(L.rate)], [caPayLabel(lc.freq), lc.payMode === "interest" ? money(L.ioPmt) + " (interest only)" : money(L.pmt)],
            ["Paid off in", L.payoff ? caDuration(L.payoff, lc.ppy) : "Never at this payment"],
            ["Total interest", L.payoff ? money0(L.interest) : "Still owing " + money0(L.owingAtTerm)],
            [`If rates rise ${lc.shock}%`, L.risePayoff ? money0(L.riseInterest) + " interest" : "Never paid off"]], !dealerWins)}
        </div>
        <div class="pv-card pv-chartcard"><div class="pv-card-h">What you owe over time</div>${caLocChart(lc, pb)}</div>
        <div class="pv-reasons">${caLocReasons().map(function(t){ return `<div>${t}</div>`; }).join("")}</div>`;
    }
  } else {
    var res = C.cashAdvantage(I);
    if (!res) body = `<p>Complete the comparison on screen to print it.</p>`;
    else {
      var good = res.adv >= 0, r = res.run, inv = caInvestName(true);
      var basis = res.kind === "history" ? `Based on ${esc(inv)}'s average of ${caPct(res.rate)} a year, ${res.avgFrom}–${res.avgTo}`
        : caState.invest === "gic" ? `Based on a GIC at ${caPct(res.rate)}, guaranteed` : `If ${esc(inv)} earns ${caPct(res.rate)} a year`;
      var st = caStatement(res);
      basis += caTaxNote();
      var pTry = caPayoffRows(res, I);
      var facts = [[caPayLabel(res.freq), money(res.pmt)], ["Total interest", money0(res.interest)]];
      if (res.kind === "history") facts.push(["History check", `Beat this loan in ${Math.round(res.aheadPct)}% of past ${caYearsText(res.months)} periods`]);
      if (res.breakEven !== null) facts.push(["Break-even return", caPct(res.breakEven) + " a year"]);
      body = `<div class="pv-hero ${good ? "up" : "down"}">
          <div class="pv-hero-l">
            <div class="pv-eyebrow">${good ? "Your financing advantage" : "Your comparison"}</div>
            <div class="pv-big">${caSigned(res.adv)}</div>
            <div class="pv-hero-sub">${st.heroSub}</div>
            <div class="pv-basis">${basis}</div>
          </div>
          <div class="pv-paths">
            <div class="pv-path ${good ? "" : "win"}"><span>Pay cash today</span><strong>${st.payCash.value}</strong><em>${st.payCash.sub}</em></div>
            <div class="pv-path ${good ? "win" : ""}"><span>Finance &amp; invest</span><strong>${st.finance.value}</strong><em>${st.finance.sub}</em></div>
          </div>
        </div>
        <div class="pv-two">
          <div class="pv-card"><div class="pv-card-h">How it's worked out</div>
            ${st.rows.map(function(x){ return `<div class="pv-line"><span>${x[0]}${x[3] ? `<small class="pv-sub2">${x[3]}</small>` : ""}</span><strong class="${x[2]}">${x[1]}</strong></div>`; }).join("")}
            <div class="pv-line total"><span>${st.totalLabel.replace(/^= /, "")}</span><strong>${st.total}</strong></div>
            <p class="pv-note">${st.note}</p></div>
          <div class="pv-card pv-chartcard"><div class="pv-card-h">${st.chartTitle}</div>${caInvestChart(res, pb)}</div>
        </div>
        <div class="pv-facts">${facts.map(function(f){ return `<div><span>${f[0]}</span><strong>${f[1]}</strong></div>`; }).join("")}</div>
        ${pTry.length ? `<div class="pv-try"><div class="pv-card-h">Pay it off any time</div><table><thead><tr><th>Paid off after</th><th>Interest paid</th><th>Payoff amount</th><th>Compared with paying cash</th></tr></thead><tbody>
          ${pTry.map(function(x){ return `<tr><td>${x.m} months</td><td>${money0(x.interest)}</td><td>${money0(x.balance)}</td><td>${caSigned(x.result)}</td></tr>`; }).join("")}</tbody></table></div>` : ""}
        <div class="pv-reasons">${caReasons().map(function(r){ return `<div><strong>${esc(r[1])}.</strong> ${esc(r[2])}</div>`; }).join("")}</div>
        ${caYearTable(res, true)}`;
    }
  }
  var foot = `<div class="pv-foot">
      <div class="pv-sign"><div><i></i><span>Customer</span></div><div><i></i><span>${u ? esc(u.name) + " · " : ""}Finance Manager</span></div></div>
      <p>${caDisclaimer(s.tab)}</p>
      <div class="pv-addr">${esc(cfg.name)} · ${esc(cfg.address)}, ${esc(cfg.city)} · ${esc(cfg.phone)}</div></div>`;
  return `<div class="doc pv" style="${vars}">${head}${terms}${body}${foot}</div>`;
}

