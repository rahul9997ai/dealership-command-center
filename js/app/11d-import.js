"use strict";
/* ---------------- SALES TRACKER · IMPORT FROM EXCEL ----------------
   Brings in the sheets the sales office already keeps:
   - a sales log (the pre-owned log, or anything laid out like it): one deal per row, header row found
     in each month tab, dates typed as text ("9TH SEP") read, columns matched by their headings;
   - the Sales Performance workbook: each month's sold New / Used per salesperson (and targets), kept as
     that month's totals so year to date has history before the tracker started.
   Nothing is saved until Import is pressed. The Excel reader loads only when a file is chosen. */
var ST_IMP_LIB = null;
var ST_IMP_SRC = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
var ST_IMP_SRI = "sha512-r22gChDnGvBylk90+2e/ycr3RVrDi8DIOkIGNhJlKfuyQM4tIRAI062MaV8sfjQKYVGjOBaZBOA87z+IhZE9DA==";
function stImpLib(){
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (ST_IMP_LIB) return ST_IMP_LIB;
  ST_IMP_LIB = new Promise(function(res, rej){
    var s = document.createElement("script");
    s.src = ST_IMP_SRC; s.integrity = ST_IMP_SRI; s.crossOrigin = "anonymous"; s.async = true;
    s.onload = function(){ if (window.XLSX) res(window.XLSX); else { ST_IMP_LIB = null; rej(new Error("The Excel reader didn't start.")); } };
    s.onerror = function(){ ST_IMP_LIB = null; s.remove(); rej(new Error("Couldn't load the Excel reader. Check the connection and try again.")); };
    document.head.appendChild(s);
  });
  return ST_IMP_LIB;
}
function stImp(){ return ST.imp || (ST.imp = { file:"", raw:null, type:"Used", tab:"", show:"all", busy:"", err:null, model:null, existing:null }); }
function stImpReset(){ ST.imp = null; }
/* read the file into rows (arrays of cell values), one entry per tab */
function stImpRead(file){
  var im = stImp();
  if (!file) return;
  if (file.size > 15*1024*1024){ im.err = "That file is over 15 MB. Save a copy with just the sales tabs and try again."; render(); return; }
  im.err = null; im.busy = "Reading " + file.name + "…"; im.file = file.name; im.raw = null; im.model = null; im.existing = null; render();
  Promise.all([stImpLib(), file.arrayBuffer()]).then(function(r){
    var X = r[0], wb = X.read(new Uint8Array(r[1]), { type:"array" });
    im.raw = wb.SheetNames.map(function(n){ return { name:n, rows:X.utils.sheet_to_json(wb.Sheets[n], { header:1, raw:true, defval:"" }) }; });
    stImpBuild();
    if (!im.model.logs.length && !im.model.perf.length){ im.busy = ""; im.err = "No sales log or Sales Performance tab was found in " + file.name + ". The importer looks for a heading row with Stock # and Salesperson (a sales log), or Salesperson, Sold N and Sold U (Sales Performance)."; render(); return; }
    return stImpExisting().then(function(){ im.busy = ""; stImpBuild(); render(); });
  }).catch(function(e){ im.busy = ""; im.err = (e && e.message ? e.message : String(e)); render(); });
}
/* turn the rows into deals and monthly totals, and check each one */
function stImpBuild(){
  var im = stImp(); if (!im.raw) return;
  var opts = { type:im.type, leads:ST_LEAD, closes:["1st visit","Be-back"], stocks:ST_STOCK, store:ST.store, file:im.file };
  var logs = [], perf = [], byId = {}, order = [];
  im.raw.forEach(function(s){
    var L = C.impLogSheet(s.name, s.rows, opts);
    if (L){ if (L.rows.length) logs.push(L); return; }
    var P = C.impPerfSheet(s.name, s.rows);
    if (P && P.people.length) perf.push(P);
  });
  /* the same deal on more than one tab (tabs often repeat last month's undelivered deals): the latest tab wins */
  logs.slice().sort(function(a, b){ return String(a.month || "").localeCompare(String(b.month || "")); }).forEach(function(L){
    L.rows.forEach(function(r){ r.tab = L.name; if (!byId[r.deal.id]) order.push(r.deal.id); else byId[r.deal.id].replaced = true; byId[r.deal.id] = r; });
  });
  var ex = im.existing || {}, cur = stToday().slice(0, 7);
  var rows = order.map(function(id){ var r = byId[id], d = r.deal, k = stKey(d.stockNo) + "|" + d.soldDate;
    r.state = r.bad ? "bad" : (ST.deals[id] || ex[k]) ? "exists" : r.issues.length ? "note" : "ready"; return r; });
  perf.forEach(function(P){ P.state = !P.month ? "nomonth" : P.month >= cur ? "live" : (ST.targets[P.month] && ST.targets[P.month].history) ? "replace" : "ready"; });
  var heads = logs.length ? logs[0].header.heads : {};
  im.model = { logs:logs, perf:perf, rows:rows, heads:heads,
    n:{ all:rows.length, ready:rows.filter(function(r){ return r.state === "ready" || r.state === "note"; }).length, note:rows.filter(function(r){ return r.state === "note"; }).length,
      exists:rows.filter(function(r){ return r.state === "exists"; }).length, bad:rows.filter(function(r){ return r.state === "bad"; }).length,
      dup:logs.reduce(function(a, L){ return a + L.rows.length; }, 0) - rows.length } };
  if (!im.tab || !logs.some(function(L){ return L.name === im.tab; })) im.tab = logs.length ? logs[logs.length - 1].name : "";
}
/* what's already in the tracker for those dates, so a deal typed in by hand isn't added twice */
function stImpExisting(){
  var im = stImp(), dates = im.model.rows.map(function(r){ return r.deal.soldDate; }).filter(Boolean).sort();
  im.existing = {};
  stAllDeals().forEach(function(d){ im.existing[stKey(d.stockNo) + "|" + d.soldDate] = d.id; });
  if (!dates.length || !stOnline()) return Promise.resolve();
  var store = ST.store;
  return fetchAllRows(function(){ return sb.from("sales_log").select("id,data").eq("dealership_id", store).gte("sold_on", dates[0]).lte("sold_on", dates[dates.length - 1]).order("id"); })
    .then(function(rows){ rows.forEach(function(r){ var d = r.data || {}; if (d.id){ ST.deals[d.id] = d; im.existing[stKey(d.stockNo) + "|" + d.soldDate] = d.id; } }); });
}
function stImpSave(){
  var im = stImp(), M = im.model; if (!M || im.busy) return;
  var me = V.currentUser(), now = new Date().toISOString(), fms = ST.fms || [];
  var deals = M.rows.filter(function(r){ return r.state === "ready" || r.state === "note"; }).map(function(r){
    var d = C.clone(r.deal), first = stKey(d.fiManager).split(/\s+/)[0];
    var fm = first ? fms.filter(function(m){ return stKey(m.name).split(/\s+/)[0] === first; }) : [];
    if (fm.length === 1){ d.fiUserId = fm[0].id; d.fiManager = fm[0].name; }
    d.createdAt = now; d.createdBy = (me.name || "") + " (import)"; d.updatedAt = now; d.updatedBy = me.name || "";
    return d; });
  var months = M.perf.filter(function(P){ return P.state === "ready" || P.state === "replace"; });
  if (!deals.length && !months.length){ toast("There's nothing new to import.", "err"); return; }
  im.busy = "Importing…"; render();
  var chain = Promise.resolve(), done = 0;
  for (var i = 0; i < deals.length; i += 200) (function(chunk){
    chain = chain.then(function(){
      if (!stOnline()){ chunk.forEach(function(d){ ST.deals[d.id] = d; }); done += chunk.length; return; }
      return sb.from("sales_log").upsert(chunk.map(function(d){ return { id:d.id, dealership_id:ST.store, sold_on:d.soldDate, data:d }; }))
        .then(function(r){ if (r.error) throw r.error; chunk.forEach(function(d){ ST.deals[d.id] = d; }); done += chunk.length; im.busy = "Importing… " + done + " of " + deals.length; render(); });
    });
  })(deals.slice(i, i + 200));
  months.forEach(function(P){
    chain = chain.then(function(){ return stLoadTargets(P.month); }).then(function(t){
      var nt = C.clone(t || { people:[], countOn:"sold", gross:0, rdr:0, closed:[], open:[] }), hp = {};
      P.people.forEach(function(p){ hp[stKey(p.name)] = { n:p.sn, u:p.su }; });
      nt.history = { people:hp, importedAt:now, file:im.file, tab:P.name };
      if (!(nt.people || []).length) nt.people = P.people.filter(function(p){ return !C.saleStoreOnly(p.name) && (p.tn || p.tu); }).map(function(p){ return { name:stKey(p.name), n:p.tn, u:p.tu }; });
      return stSaveTargets(P.month, nt);
    });
  });
  chain.then(function(){
    var msg = (deals.length ? deals.length + " deal" + (deals.length === 1 ? "" : "s") : "") + (deals.length && months.length ? " and " : "") + (months.length ? months.length + " month" + (months.length === 1 ? "" : "s") + " of Sales Performance totals" : "") + " imported.";
    INS.loaded = {}; stImpReset(); ST.view = "log"; toast(msg, "ok"); render();
  }, function(e){
    im.busy = ""; im.err = "The import stopped part-way: " + (e && e.message ? e.message : e) + (done ? ". " + done + " deals were saved; importing the file again skips them." : "."); render();
  });
}
/* ---- the screen ---- */
function stImpPill(r){
  if (r.state === "ready") return '<span class="st-pill delivered">Ready</span>';
  if (r.state === "note") return '<span class="st-pill scheduled" title="Imports with this note">' + esc(r.issues[0]) + '</span>';
  if (r.state === "exists") return '<span class="st-pill pending">Already in the tracker · skipped</span>';
  return '<span class="st-pill declined">' + esc(r.issues[0] || "Can't import") + ' · not imported</span>';
}
function stViewImport(){
  var im = stImp(), M = im.model;
  stLoadFms();
  var head = function(title, sub, actions, kpis){ return '<div class="st-hero"><div class="st-hero-top"><div><div class="st-eyebrow">Sales Tracker · Import from Excel</div><h2>' + title + '</h2><div class="st-hsub">' + sub + '</div></div><div class="st-actions">' + actions + '</div></div>' + (kpis || "") + '</div>'; };
  var pick = '<label class="st-gbtn st-file">' + (M ? "Choose another file" : "Choose a file") + '<input type="file" accept=".xlsx,.xlsm,.xls,.csv" data-stimp="file"></label>';
  var back = '<button type="button" class="st-gbtn" data-st="impcancel">' + (M ? "Cancel" : "Back to the Sales log") + '</button>';
  if (!M){
    return head("Bring in your Excel sheets", "Nothing is saved until you check the preview and press Import", back + pick) +
      (im.err ? '<div class="st-err">' + esc(im.err) + '</div>' : '') +
      (im.busy ? '<div class="st-warn" style="background:var(--info-bg);border-color:var(--blue);color:var(--blue)">' + esc(im.busy) + '</div>' : '') +
      '<label class="st-drop" data-stdrop="1"><input type="file" accept=".xlsx,.xlsm,.xls,.csv" data-stimp="file"><span class="st-ico b">⇪</span><b>Drop the workbook here, or click to choose it</b><span>.xlsx, .xls or .csv</span></label>' +
      '<div class="st-g2"><div class="st-card"><div class="st-ch"><span class="st-ico g">✎</span><h3>A sales log<small>e.g. the 2026 pre-owned log</small></h3></div><ul class="st-plain">' +
        '<li>One row per vehicle; every month tab is read.</li><li>The heading row is found automatically (it moves from tab to tab).</li><li>Dates typed as text, like <b>9TH SEP</b>, are read using the tab\'s year.</li>' +
        '<li>Status, F/C, front and F&amp;I gross, source, close type and the Y/N columns come across.</li><li>A deal already in the tracker (same stock # and date) is skipped, so nothing is counted twice.</li></ul></div>' +
      '<div class="st-card"><div class="st-ch"><span class="st-ico p">▤</span><h3>Sales Performance<small>monthly totals per salesperson</small></h3></div><ul class="st-plain">' +
        '<li>Each month tab\'s Sold N and Sold U per salesperson become that month\'s totals.</li><li>Targets come across too, for months without targets.</li><li>Used for units in months before the tracker, so year to date and the projections have history.</li>' +
        '<li>The current month is skipped: it\'s tracked live from the deals you log.</li></ul></div></div>';
  }
  var n = M.n, L = M.logs.filter(function(x){ return x.name === im.tab; })[0];
  var tabRows = M.rows.filter(function(r){ return r.tab === im.tab; }).filter(function(r){ return im.show === "all" || (im.show === "look" ? r.state === "note" || r.state === "bad" : r.state === "exists"); });
  var perfOk = M.perf.filter(function(P){ return P.state === "ready" || P.state === "replace"; }).length;
  var btn = n.ready || perfOk ? '<button type="button" class="st-gbtn primary" data-st="impsave"' + (im.busy ? " disabled" : "") + '>' + (im.busy ? esc(im.busy) : "Import " + (n.ready ? n.ready + " deal" + (n.ready === 1 ? "" : "s") : "") + (n.ready && perfOk ? " + " : "") + (perfOk ? perfOk + " month" + (perfOk === 1 ? "" : "s") : "")) + '</button>' : '';
  var kpis = M.logs.length ? '<div class="st-kpis"><div class="st-hk"><div class="l">Deals found</div><div class="v">' + n.all + '</div><div class="s">' + M.logs.length + ' tab' + (M.logs.length === 1 ? "" : "s") + (n.dup ? ' · ' + n.dup + ' repeated on a later tab, counted once' : '') + '</div></div>' +
      '<div class="st-hk"><div class="l">Ready to import</div><div class="v" style="color:#86efac">' + n.ready + '</div><div class="s">' + (n.note ? n.note + ' with a note (shown below)' : 'matched and checked') + '</div></div>' +
      '<div class="st-hk"><div class="l">Already in the tracker</div><div class="v" style="color:#fde68a">' + n.exists + '</div><div class="s">same stock # and date · skipped</div></div>' +
      '<div class="st-hk"><div class="l">Can\'t import</div><div class="v" style="color:' + (n.bad ? "#fca5a5" : "#fff") + '">' + n.bad + '</div><div class="s">' + (n.bad ? 'no readable date · fix in Excel and import again' : 'every row has a date') + '</div></div></div>' : '';
  var colmap = M.logs.length ? '<div class="st-card"><div class="st-ch"><span class="st-ico b">⇄</span><h3>Columns matched<small>from the heading row of each tab</small></h3><span class="cnt">' + Object.keys(M.heads).length + '</span></div><div class="st-colmap">' +
      Object.keys(M.heads).map(function(k){ return '<div><span>' + esc(M.heads[k]) + '</span><i>→</i><b>' + esc(C.IMP_COL_LABEL[k] || k) + '</b></div>'; }).join("") + '</div>' +
      '<div class="st-legend" style="align-items:center"><span>These deals are</span><span class="st-sub" style="margin:0">' + [["Used","Used"],["New","New"],["file","From a N/U column"]].map(function(o){ return '<button type="button" data-st="imptype" data-v="' + o[0] + '" class="' + (im.type === o[0] ? "on" : "") + '">' + o[1] + '</button>'; }).join("") + '</span><span>The pre-owned log is Used. As-is can be set on each deal afterwards.</span></div></div>' : '';
  var perfCard = M.perf.length ? '<div class="st-table"><div class="st-th"><div><h2>SALES PERFORMANCE TOTALS</h2><div class="st-hsub">sold New · Used per salesperson, kept as each month\'s totals</div></div></div><div class="st-tw"><table><thead><tr><th class="l">Tab</th><th class="l">Month</th><th class="l">Salespeople · sold N / U</th><th>Store</th><th class="l">Check</th></tr></thead><tbody>' +
      M.perf.map(function(P){ var tn = 0, tu = 0; P.people.forEach(function(p){ tn += p.sn; tu += p.su; });
        var pill = P.state === "ready" ? '<span class="st-pill delivered">Ready</span>' : P.state === "replace" ? '<span class="st-pill scheduled">Imported before · will be replaced</span>' : P.state === "live" ? '<span class="st-pill pending">Current or future month · tracked live, skipped</span>' : '<span class="st-pill declined">No month in the title · skipped</span>';
        return '<tr><td class="l"><b>' + esc(P.name) + '</b></td><td class="l">' + (P.month ? stMonthName(P.month) : "—") + '</td><td class="l" style="white-space:normal;font-size:12px">' + P.people.map(function(p){ return esc(p.name) + ' <span class="ins-sub">' + stF(p.sn) + ' / ' + stF(p.su) + '</span>'; }).join(" · ") + '</td><td class="num"><b>' + stF(tn + tu) + '</b></td><td class="l">' + pill + '</td></tr>'; }).join("") +
      '</tbody></table></div></div>' : '';
  var preview = L ? '<div class="st-table"><div class="st-th"><div><h2>PREVIEW · ' + esc(String(im.tab).toUpperCase()) + '</h2><div class="st-hsub">every row is shown before anything is saved · heading on row ' + (L.header.row + 1) + '</div></div>' +
      '<div class="st-actions"><select class="st-gsel" data-stf="impTab" aria-label="Tab">' + M.logs.map(function(x){ return '<option value="' + esc(x.name) + '" ' + (x.name === im.tab ? "selected" : "") + '>' + esc(x.name) + ' (' + x.rows.length + ')</option>'; }).join("") + '</select>' +
      '<select class="st-gsel" data-stf="impShow" aria-label="Show"><option value="all" ' + (im.show === "all" ? "selected" : "") + '>All rows</option><option value="look" ' + (im.show === "look" ? "selected" : "") + '>Needs a look</option><option value="exists" ' + (im.show === "exists" ? "selected" : "") + '>Already in the tracker</option></select></div></div>' +
      '<div class="st-tw">' + (tabRows.length ? '<table><thead><tr><th class="l">Sold</th><th>Stock #</th><th class="l">Customer · vehicle</th><th>Salesperson</th><th>F&amp;I</th><th class="l">Status</th><th>Deal</th><th class="r">Front</th><th class="r">F&amp;I gross</th><th class="l">Check</th></tr></thead><tbody>' +
        tabRows.slice(0, 400).map(function(r){ var d = r.deal;
          return '<tr><td class="l" style="font-weight:600">' + (d.soldDate ? stDay(d.soldDate) : '<span style="color:var(--danger)">—</span>') + '</td><td><b>' + esc(d.stockNo) + '</b></td><td class="l"><b>' + esc(d.customer || "—") + '</b><div class="ins-sub">' + esc(d.vehicle) + ' · ' + esc(d.type) + '</div></td>' +
            '<td>' + esc(d.salespeople[0].name) + '</td><td>' + esc(d.fiManager || "—") + '</td><td class="l"><span class="st-pill ' + d.status + '">' + ST_LABEL[d.status] + '</span></td><td>' + esc(d.dealType || "—") + '</td>' +
            '<td class="r num"><b' + (d.frontGross !== null && d.frontGross <= 0 ? ' style="color:var(--danger)"' : '') + '>' + (d.frontGross === null ? "—" : stMoney(d.frontGross)) + '</b></td><td class="r num">' + (d.fiGross === null ? "—" : stMoney(d.fiGross)) + '</td><td class="l">' + stImpPill(r) + '</td></tr>'; }).join("") + '</tbody></table>' :
        '<div class="st-empty" style="padding:16px">No rows to show with this filter.</div>') + '</div>' +
      '<div class="st-note">Rows sold in another month (for example last month\'s deals repeated on this tab) keep their own date. Where the same deal is on two tabs, the later tab\'s version is imported. F&amp;I managers are matched to their accounts by first name, so they see these deals in My F&amp;I.</div></div>' : '';
  return head(esc(im.file), (M.logs.length ? n.all + " deals on " + M.logs.length + " tab" + (M.logs.length === 1 ? "" : "s") : "") + (M.logs.length && M.perf.length ? " · " : "") + (M.perf.length ? M.perf.length + " Sales Performance tab" + (M.perf.length === 1 ? "" : "s") : "") + " · nothing is saved until you press Import", back + pick + btn, kpis) +
    (im.err ? '<div class="st-err">' + esc(im.err) + '</div>' : '') + colmap + perfCard + preview;
}
/* the file box: choosing or dropping a file */
document.addEventListener("dragover", function(ev){ var z = ev.target && ev.target.closest ? ev.target.closest("[data-stdrop]") : null; if (z){ ev.preventDefault(); z.classList.add("over"); } });
document.addEventListener("dragleave", function(ev){ var z = ev.target && ev.target.closest ? ev.target.closest("[data-stdrop]") : null; if (z) z.classList.remove("over"); });
document.addEventListener("drop", function(ev){
  var z = ev.target && ev.target.closest ? ev.target.closest("[data-stdrop]") : null; if (!z) return;
  ev.preventDefault(); var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) stImpRead(f);
});
