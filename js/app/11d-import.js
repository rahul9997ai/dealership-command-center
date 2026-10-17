"use strict";
/* ---------------- SALES TRACKER · IMPORT FROM EXCEL ----------------
   Any spreadsheet can be dropped in (Excel, CSV, OpenDocument). Every tab is reviewed and the screen
   says where its data will land before anything is saved:
   - a sales log (any layout: the heading row is found in each tab, headings are matched by name, and
     anyone can correct a column or read an unrecognised tab by hand) → deals in the Sales log;
     New / Used comes from a New/Used column, else from the tab or file name ("pre-owned" = Used);
   - the Sales Performance workbook → each month's sold New / Used per salesperson (and targets), kept as
     that month's totals so year to date has history before the tracker started.
   Only the General Manager (or a Master) imports. Every import is recorded and can be deleted in one go,
   which removes exactly what it brought in (the database checks it's the GM). */
var ST_IMP_LIB = null;
var ST_IMP_SRC = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
var ST_IMP_SRI = "sha512-r22gChDnGvBylk90+2e/ycr3RVrDi8DIOkIGNhJlKfuyQM4tIRAI062MaV8sfjQKYVGjOBaZBOA87z+IhZE9DA==";
var ST_IMP_ACCEPT = ".xlsx,.xlsm,.xlsb,.xls,.ods,.csv,.tsv,.txt";
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
function stImpCan(){ return V.isAdmin(); }
function stImp(){ return ST.imp || (ST.imp = { file:"", raw:null, type:"auto", tab:"", show:"all", busy:"", err:null, model:null, existing:null, headMap:{}, forced:{} }); }
function stImpReset(){ var h = ST.imp && ST.imp.hist; ST.imp = null; if (h) stImp().hist = h; }
/* read the file into rows (arrays of cell values), one entry per tab */
function stImpRead(file){
  var im = stImp();
  if (!file) return;
  if (/\.(pdf|png|jpe?g|gif|heic|webp|docx?|pptx?|zip)$/i.test(file.name)){
    im.err = file.name + " isn't a spreadsheet, so it can't be read yet. Open it in Excel (or export it from your DMS) and save it as .xlsx or .csv, then drop that in."; render(); return; }
  if (file.size > 15*1024*1024){ im.err = "That file is over 15 MB. Save a copy with just the sales tabs and try again."; render(); return; }
  im.err = null; im.busy = "Reading " + file.name + "…"; im.file = file.name; im.raw = null; im.model = null; im.existing = null; im.headMap = {}; im.forced = {}; im.type = "auto"; render();
  Promise.all([stImpLib(), file.arrayBuffer()]).then(function(r){
    var X = r[0], wb;
    try { wb = X.read(new Uint8Array(r[1]), { type:"array" }); } catch (e) { throw new Error(file.name + " couldn't be opened as a spreadsheet. Save it from Excel as .xlsx or .csv and try again."); }
    im.raw = wb.SheetNames.map(function(n){ return { name:n, rows:X.utils.sheet_to_json(wb.Sheets[n], { header:1, raw:true, defval:"" }) }; });
    stImpBuild();
    return stImpExisting().then(function(){ im.busy = ""; stImpBuild(); render(); });
  }).catch(function(e){ im.busy = ""; im.raw = null; im.model = null; im.err = (e && e.message ? e.message : String(e)); render(); });
}
/* review every tab, turn rows into deals and monthly totals, and check each one */
function stImpBuild(){
  var im = stImp(); if (!im.raw) return;
  var opts = { type:im.type, headMap:im.headMap, leads:ST_LEAD, closes:["1st visit","Be-back"], stocks:ST_STOCK, store:ST.store, file:im.file };
  var logs = [], perf = [], tabs = [], byId = {}, order = [];
  im.raw.forEach(function(s){
    var filled = s.rows.filter(function(r){ return (r || []).some(function(v){ return C.impText(v); }); }).length;
    var forced = im.forced[s.name];
    if (forced === undefined){
      var P = C.impPerfSheet(s.name, s.rows);
      if (P && P.people.length){ perf.push(P); tabs.push({ name:s.name, kind:"perf", P:P }); return; }
    }
    var L = C.impLogSheet(s.name, s.rows, Object.assign({}, opts, { headerRow:forced }));
    if (L){ L.forced = forced !== undefined; if (L.rows.length) logs.push(L); tabs.push({ name:s.name, kind:L.rows.length ? "log" : "logEmpty", L:L }); return; }
    tabs.push({ name:s.name, kind:filled ? "unknown" : "empty", rows:filled });
  });
  /* the same deal on more than one tab (tabs often repeat last month's undelivered deals): the latest tab wins */
  logs.slice().sort(function(a, b){ return String(a.month || "").localeCompare(String(b.month || "")); }).forEach(function(L){
    L.rows.forEach(function(r){ r.tab = L.name; if (!byId[r.deal.id]) order.push(r.deal.id); byId[r.deal.id] = r; });
  });
  var ex = im.existing || {}, cur = stToday().slice(0, 7);
  var rows = order.map(function(id){ var r = byId[id], d = r.deal, k = stKey(d.stockNo) + "|" + d.soldDate;
    r.state = r.bad ? "bad" : (ST.deals[id] || ex[k]) ? "exists" : r.issues.length ? "note" : "ready"; return r; });
  perf.forEach(function(P){ P.state = !P.month ? "nomonth" : P.month >= cur ? "live" : (ST.targets[P.month] && ST.targets[P.month].history) ? "replace" : "ready"; });
  im.model = { logs:logs, perf:perf, tabs:tabs, rows:rows, typeUnknown:logs.some(function(L){ return L.typeUnknown; }),
    n:{ all:rows.length, ready:rows.filter(function(r){ return r.state === "ready" || r.state === "note"; }).length, note:rows.filter(function(r){ return r.state === "note"; }).length,
      exists:rows.filter(function(r){ return r.state === "exists"; }).length, bad:rows.filter(function(r){ return r.state === "bad"; }).length,
      dup:logs.reduce(function(a, L){ return a + L.rows.length; }, 0) - rows.length } };
  if (!im.tab || !tabs.some(function(t){ return t.name === im.tab && t.L && (t.L.rows.length || t.L.forced); })) {
    var withLog = tabs.filter(function(t){ return t.L && t.L.rows.length; }); im.tab = withLog.length ? withLog[withLog.length - 1].name : "";
  }
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
/* ---- past imports (GM): list and delete ---- */
function stImpHistLoad(force){
  var im = stImp();
  if ((im.hist && !force) || im.histLoading) return;
  if (!stOnline()){ im.hist = im.hist || []; return; }
  im.histLoading = true;
  var store = ST.store;
  sb.from("sales_imports").select("id,data,created_at").eq("dealership_id", store).order("created_at", { ascending:false }).then(function(r){
    im.histLoading = false; if (ST.store !== store) return;
    if (r.error){ im.hist = []; im.err = "Couldn't load past imports: " + r.error.message; } else im.hist = r.data || [];
    render();
  });
}
function stImpDelete(id){
  var im = stImp(), h = (im.hist || []).filter(function(x){ return x.id === id; })[0]; if (!h) return;
  var d = h.data || {};
  askConfirm("Delete this import?", "This removes everything " + (d.file || "this import") + " brought in: " + (d.deals || 0) + " deal" + (d.deals === 1 ? "" : "s") +
    (d.months && d.months.length ? " and " + d.months.length + " month" + (d.months.length === 1 ? "" : "s") + " of Sales Performance totals" : "") +
    ", including any changes made to those deals since. Deals typed in by hand aren't touched. This can't be undone.", "Delete import", function(){
    var done = function(res){
      var store = ST.store, keep = stImp().hist.filter(function(x){ return x.id !== id; });
      ST = stFresh(store); ST.view = "import"; stImp().hist = keep; INS.loaded = {};
      toast("Import deleted" + (res && res.deals !== undefined ? ": " + res.deals + " deal" + (res.deals === 1 ? "" : "s") + " removed" : "") + ".", "ok"); render();
    };
    if (!stOnline()){
      Object.keys(ST.deals).forEach(function(k){ if (ST.deals[k].importBatch === id) delete ST.deals[k]; });
      Object.keys(ST.targets).forEach(function(m){ var t = ST.targets[m]; if (t.history && t.history.batch === id) delete t.history; if (t.peopleBatch === id){ delete t.people; delete t.peopleBatch; } });
      im.hist = im.hist.filter(function(x){ return x.id !== id; }); toast("Import deleted.", "ok"); render(); return;
    }
    sb.rpc("sales_import_delete", { p_id:id }).then(function(r){ if (r.error) toast("Couldn't delete the import: " + r.error.message, "err"); else done(r.data); });
  });
}
function stImpSave(){
  var im = stImp(), M = im.model; if (!M || im.busy) return;
  if (!stImpCan()){ toast("Only the General Manager can import.", "err"); return; }
  if (M.typeUnknown && im.type === "auto"){ toast("Choose whether these deals are New or Used first.", "err"); return; }
  var me = V.currentUser(), now = new Date().toISOString(), fms = ST.fms || [];
  var batch = "I" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var deals = M.rows.filter(function(r){ return r.state === "ready" || r.state === "note"; }).map(function(r){
    var d = C.clone(r.deal), first = stKey(d.fiManager).split(/\s+/)[0];
    var fm = first ? fms.filter(function(m){ return stKey(m.name).split(/\s+/)[0] === first; }) : [];
    if (fm.length === 1){ d.fiUserId = fm[0].id; d.fiManager = fm[0].name; }
    d.importBatch = batch; d.createdAt = now; d.createdBy = (me.name || "") + " (import)"; d.updatedAt = now; d.updatedBy = me.name || "";
    return d; });
  var months = M.perf.filter(function(P){ return P.state === "ready" || P.state === "replace"; });
  if (!deals.length && !months.length){ toast("There's nothing new to import.", "err"); return; }
  var rec = { id:batch, dealership_id:ST.store, data:{ file:im.file, by:me.name || "", deals:deals.length, months:months.map(function(P){ return P.month; }),
    tabs:M.logs.map(function(L){ return L.name; }).concat(months.map(function(P){ return P.name; })), types:deals.reduce(function(a, d){ a[d.type] = (a[d.type] || 0) + 1; return a; }, {}) } };
  im.busy = "Importing…"; render();
  var chain = stOnline() ? sb.from("sales_imports").insert(rec).then(function(r){ if (r.error) throw r.error; }) : Promise.resolve();
  var done = 0;
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
      nt.history = { people:hp, importedAt:now, file:im.file, tab:P.name, batch:batch };
      if (!(nt.people || []).length){ nt.people = P.people.filter(function(p){ return !C.saleStoreOnly(p.name) && (p.tn || p.tu); }).map(function(p){ return { name:stKey(p.name), n:p.tn, u:p.tu }; }); nt.peopleBatch = batch; }
      return stSaveTargets(P.month, nt);
    });
  });
  chain.then(function(){
    var msg = (deals.length ? deals.length + " deal" + (deals.length === 1 ? "" : "s") : "") + (deals.length && months.length ? " and " : "") + (months.length ? months.length + " month" + (months.length === 1 ? "" : "s") + " of Sales Performance totals" : "") + " imported. You can delete this import from Import at any time.";
    var h = stImp().hist; INS.loaded = {}; ST.imp = null; stImp().hist = h ? [{ id:batch, data:rec.data, created_at:now }].concat(h) : null;
    ST.view = "log"; toast(msg, "ok"); render();
  }, function(e){
    im.busy = ""; im.hist = null;
    im.err = "The import stopped part-way: " + (e && e.message ? e.message : e) + (done ? ". " + done + " deals were saved and are listed under this import, so you can delete them, or import the file again to add the rest." : ".");
    render();
  });
}
/* ---- the screen ---- */
function stImpPill(r){
  if (r.state === "ready") return '<span class="st-pill delivered">Ready</span>';
  if (r.state === "note") return '<span class="st-pill scheduled" title="Imports with this note">' + esc(r.issues[0]) + '</span>';
  if (r.state === "exists") return '<span class="st-pill pending">Already in the tracker · skipped</span>';
  return '<span class="st-pill declined">' + esc(r.issues[0] || "Can't import") + ' · not imported</span>';
}
function stImpTypeText(L, im){
  if (im.type === "New" || im.type === "Used") return im.type + " (chosen)";
  if (L.typeFrom === "column") return "New / Used column";
  if (L.typeGuess) return L.typeGuess + " (from the " + (C.impTypeFromName(L.name) ? "tab" : "file") + " name)";
  return '<b style="color:var(--danger)">New or Used? Choose below</b>';
}
function stImpHistCard(){
  var im = stImp(), h = im.hist;
  return '<div class="st-table"><div class="st-th"><div><h2>PAST IMPORTS</h2><div class="st-hsub">everything an import brought in can be deleted in one go · General Manager only</div></div></div><div class="st-tw">' +
    (!h ? '<div class="st-empty" style="padding:16px">Loading…</div>' : h.length ? '<table><thead><tr><th class="l">Imported</th><th class="l">File</th><th class="l">By</th><th class="l">What it brought in</th><th></th></tr></thead><tbody>' +
      h.map(function(x){ var d = x.data || {}, t = d.types || {};
        return '<tr><td class="l">' + esc(new Date(x.created_at).toLocaleString("en-CA", { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" })) + '</td><td class="l"><b>' + esc(d.file || "") + '</b></td><td class="l">' + esc(d.by || "") + '</td>' +
          '<td class="l" style="white-space:normal">' + (d.deals ? d.deals + ' deal' + (d.deals === 1 ? "" : "s") + (Object.keys(t).length ? ' <span class="ins-sub">(' + Object.keys(t).map(function(k){ return t[k] + " " + k; }).join(" · ") + ')</span>' : '') : '') +
            (d.months && d.months.length ? (d.deals ? ' · ' : '') + 'totals for ' + d.months.map(function(m){ return stMonthName(m); }).join(", ") : '') + '</td>' +
          '<td class="r"><button type="button" class="st-act del" data-st="impdel" data-v="' + esc(x.id) + '">Delete import</button></td></tr>'; }).join("") + '</tbody></table>' :
      '<div class="st-empty" style="padding:16px">Nothing has been imported into this store yet.</div>') + '</div></div>';
}
function stViewImport(){
  if (!stImpCan()) return '<div class="st-card"><div class="st-empty">Importing is for the General Manager.</div></div>';
  var im = stImp(), M = im.model;
  stLoadFms(); stImpHistLoad();
  var head = function(title, sub, actions, kpis){ return '<div class="st-hero"><div class="st-hero-top"><div><div class="st-eyebrow">Sales Tracker · Import</div><h2>' + title + '</h2><div class="st-hsub">' + sub + '</div></div><div class="st-actions">' + actions + '</div></div>' + (kpis || "") + '</div>'; };
  var pick = '<label class="st-gbtn st-file">' + (M ? "Choose another file" : "Choose a file") + '<input type="file" data-stimp="file"></label>';
  var back = '<button type="button" class="st-gbtn" data-st="impcancel">' + (M ? "Cancel" : "Back to the Sales log") + '</button>';
  if (!M){
    return head("Bring in a spreadsheet", "Any sales sheet: every tab is checked and you see where it lands before anything is saved", back + pick) +
      (im.err ? '<div class="st-err">' + esc(im.err) + '</div>' : '') +
      (im.busy ? '<div class="st-warn" style="background:var(--info-bg);border-color:var(--blue);color:var(--blue)">' + esc(im.busy) + '</div>' : '') +
      '<label class="st-drop" data-stdrop="1"><input type="file" data-stimp="file"><span class="st-ico b">⇪</span><b>Drop the file here, or click to choose it</b><span>Excel (.xlsx, .xls), CSV or OpenDocument · New car logs, pre-owned logs, Sales Performance</span></label>' +
      '<div class="st-g2"><div class="st-card"><div class="st-ch"><span class="st-ico g">✎</span><h3>Sales logs<small>one row per vehicle · any layout</small></h3></div><ul class="st-plain">' +
        '<li>Every tab is read; the heading row is found wherever it sits.</li><li>Headings are matched by name (Stock #, Stk, Sales Person, Buyer, Front End Gross…). Anything it gets wrong, you re-match before importing.</li>' +
        '<li>New or Used comes from a New/Used column, or from the tab or file name ("pre-owned" = Used, "new" = New). Otherwise you pick.</li><li>Dates typed as text, like <b>9TH SEP</b>, are read using the tab\'s year.</li>' +
        '<li>A deal already in the tracker (same stock # and date) is skipped, so nothing is counted twice.</li></ul></div>' +
      '<div class="st-card"><div class="st-ch"><span class="st-ico p">▤</span><h3>Sales Performance<small>monthly totals per salesperson</small></h3></div><ul class="st-plain">' +
        '<li>Each month tab\'s Sold N and Sold U per salesperson become that month\'s totals (targets too, if the month has none).</li><li>Used for units in months before the tracker, so year to date and the projections have history.</li>' +
        '<li>The current month is skipped: it\'s tracked live from the deals you log.</li><li>Tabs with neither (dashboards, drop-down lists, read-me) are listed and left alone.</li></ul></div></div>' + stImpHistCard();
  }
  var n = M.n, T = M.tabs.filter(function(t){ return t.name === im.tab && t.L; })[0], L = T && T.L;
  var tabRows = M.rows.filter(function(r){ return r.tab === im.tab; }).filter(function(r){ return im.show === "all" || (im.show === "look" ? r.state === "note" || r.state === "bad" : r.state === "exists"); });
  var perfOk = M.perf.filter(function(P){ return P.state === "ready" || P.state === "replace"; }).length, blocked = M.typeUnknown && im.type === "auto";
  var btn = n.ready || perfOk ? '<button type="button" class="st-gbtn primary" data-st="impsave"' + (im.busy || blocked ? " disabled" : "") + (blocked ? ' title="Choose New or Used first"' : '') + '>' + (im.busy ? esc(im.busy) : "Import " + (n.ready ? n.ready + " deal" + (n.ready === 1 ? "" : "s") : "") + (n.ready && perfOk ? " + " : "") + (perfOk ? perfOk + " month" + (perfOk === 1 ? "" : "s") : "")) + '</button>' : '';
  var kpis = M.logs.length ? '<div class="st-kpis"><div class="st-hk"><div class="l">Deals found</div><div class="v">' + n.all + '</div><div class="s">' + M.logs.length + ' tab' + (M.logs.length === 1 ? "" : "s") + (n.dup ? ' · ' + n.dup + ' repeated on a later tab, counted once' : '') + '</div></div>' +
      '<div class="st-hk"><div class="l">Ready to import</div><div class="v" style="color:#86efac">' + n.ready + '</div><div class="s">' + (n.note ? n.note + ' with a note (shown below)' : 'matched and checked') + '</div></div>' +
      '<div class="st-hk"><div class="l">Already in the tracker</div><div class="v" style="color:#fde68a">' + n.exists + '</div><div class="s">same stock # and date · skipped</div></div>' +
      '<div class="st-hk"><div class="l">Can\'t import</div><div class="v" style="color:' + (n.bad ? "#fca5a5" : "#fff") + '">' + n.bad + '</div><div class="s">' + (n.bad ? 'no readable date · fix in Excel and import again' : 'every row has a date') + '</div></div></div>' : '';
  /* where each tab lands */
  var lands = '<div class="st-table"><div class="st-th"><div><h2>WHERE THE DATA LANDS</h2><div class="st-hsub">every tab in the file, checked · nothing is saved until you press Import</div></div></div><div class="st-tw"><table><thead><tr><th class="l">Tab</th><th class="l">What it is</th><th class="l">Lands in</th><th class="l">Details</th><th></th></tr></thead><tbody>' +
    M.tabs.map(function(t){
      var what, where, det, act = "";
      if (t.kind === "log"){ what = '<span class="st-pill delivered">Sales log</span>'; where = "Sales log" + (t.L.month ? " · " + esc(stMonthName(t.L.month)) + " tab" : ""); det = t.L.rows.length + " deals · " + stImpTypeText(t.L, im) + (t.L.forced ? " · read by hand" : "");
        act = t.name === im.tab ? '<span class="ins-sub">previewing</span>' : '<button type="button" class="st-act" data-st="imptab" data-v="' + esc(t.name) + '">Preview</button>'; }
      else if (t.kind === "logEmpty"){ what = '<span class="st-pill pending">Sales log, empty</span>'; where = "—"; det = "headings found, no deals yet"; }
      else if (t.kind === "perf"){ var P = t.P; what = '<span class="st-pill approved">Sales Performance</span>';
        where = P.state === "ready" || P.state === "replace" ? "Monthly totals · " + esc(stMonthName(P.month)) : "—";
        det = P.state === "ready" ? P.people.length + " salespeople" : P.state === "replace" ? "imported before · will be replaced" : P.state === "live" ? "current or future month · tracked live, skipped" : "no month in the title · skipped"; }
      else if (t.kind === "unknown"){ what = '<span class="st-pill pending">Not recognised</span>'; where = "Not imported"; det = t.rows + " rows with something in them · no sales columns found";
        act = '<button type="button" class="st-act" data-st="impforce" data-v="' + esc(t.name) + '">Read as a sales log</button>'; }
      else { what = '<span class="st-pill pending">Empty</span>'; where = "—"; det = "nothing in it"; }
      return '<tr><td class="l"><b>' + esc(t.name) + '</b></td><td class="l">' + what + '</td><td class="l">' + where + '</td><td class="l" style="white-space:normal;font-size:12px">' + det + '</td><td class="r">' + act + '</td></tr>'; }).join("") +
    '</tbody></table></div></div>';
  var fields = Object.keys(C.IMP_COL_LABEL);
  var colmap = L ? '<div class="st-card" style="margin-bottom:14px"><div class="st-ch"><span class="st-ico b">⇄</span><h3>Columns · ' + esc(im.tab) + '<small>heading row ' + (L.header.row + 1) + ' · change any that are wrong; the same heading is used on every tab</small></h3><span class="cnt">' + Object.keys(L.header.cols).length + '</span></div><div class="st-colmap">' +
      L.header.all.map(function(a){ return '<div class="' + (a.field ? "" : "off") + '"><span title="' + esc(a.text) + '">' + esc(a.text) + '</span><i>→</i><select class="st-tin st-mapsel" data-stf="impMap" data-key="' + esc(a.key) + '"><option value="">Not used</option>' +
        fields.map(function(f){ return '<option value="' + f + '" ' + (a.field === f ? "selected" : "") + '>' + esc(C.IMP_COL_LABEL[f]) + '</option>'; }).join("") + '</select></div>'; }).join("") + '</div>' +
      '<div class="st-legend" style="align-items:center"><span>New or Used</span><span class="st-sub" style="margin:0">' + [["auto","Work it out"],["Used","All Used"],["New","All New"]].map(function(o){ return '<button type="button" data-st="imptype" data-v="' + o[0] + '" class="' + (im.type === o[0] ? "on" : "") + '">' + o[1] + '</button>'; }).join("") + '</span>' +
        '<span>' + (blocked ? '<b style="color:var(--danger)">This file doesn\'t say whether the deals are New or Used. Choose one.</b>' : '"Work it out" uses a New/Used column, else the tab or file name.') + '</span>' +
        (Object.keys(im.headMap).length || Object.keys(im.forced).length ? '<button type="button" class="btn sm ghost" data-st="impautomap">Undo my column changes</button>' : '') + '</div></div>' : '';
  var preview = L ? '<div class="st-table"><div class="st-th"><div><h2>PREVIEW · ' + esc(String(im.tab).toUpperCase()) + '</h2><div class="st-hsub">every row is shown before anything is saved</div></div>' +
      '<div class="st-actions"><select class="st-gsel" data-stf="impTab" aria-label="Tab">' + M.tabs.filter(function(t){ return t.L && t.L.rows.length; }).map(function(t){ return '<option value="' + esc(t.name) + '" ' + (t.name === im.tab ? "selected" : "") + '>' + esc(t.name) + ' (' + t.L.rows.length + ')</option>'; }).join("") + '</select>' +
      '<select class="st-gsel" data-stf="impShow" aria-label="Show"><option value="all" ' + (im.show === "all" ? "selected" : "") + '>All rows</option><option value="look" ' + (im.show === "look" ? "selected" : "") + '>Needs a look</option><option value="exists" ' + (im.show === "exists" ? "selected" : "") + '>Already in the tracker</option></select></div></div>' +
      '<div class="st-tw">' + (tabRows.length ? '<table><thead><tr><th class="l">Sold</th><th>Stock #</th><th class="l">Customer · vehicle</th><th>Salesperson</th><th>F&amp;I</th><th class="l">Status</th><th>Deal</th><th class="r">Front</th><th class="r">F&amp;I gross</th><th class="l">Check</th></tr></thead><tbody>' +
        tabRows.slice(0, 400).map(function(r){ var d = r.deal;
          return '<tr><td class="l" style="font-weight:600">' + (d.soldDate ? stDay(d.soldDate) : '<span style="color:var(--danger)">—</span>') + '</td><td><b>' + esc(d.stockNo) + '</b></td><td class="l"><b>' + esc(d.customer || "—") + '</b><div class="ins-sub">' + esc(d.vehicle) + ' · ' + esc(d.type) + '</div></td>' +
            '<td>' + stSpText(d) + '</td><td>' + esc(d.fiManager || "—") + '</td><td class="l"><span class="st-pill ' + d.status + '">' + ST_LABEL[d.status] + '</span></td><td>' + esc(d.dealType || "—") + '</td>' +
            '<td class="r num"><b' + (d.frontGross !== null && d.frontGross <= 0 ? ' style="color:var(--danger)"' : '') + '>' + (d.frontGross === null ? "—" : stMoney(d.frontGross)) + '</b></td><td class="r num">' + (d.fiGross === null ? "—" : stMoney(d.fiGross)) + '</td><td class="l">' + stImpPill(r) + '</td></tr>'; }).join("") + '</tbody></table>' :
        '<div class="st-empty" style="padding:16px">' + (L.rows.length ? "No rows to show with this filter." : "No deals found under these headings. Check the columns above: Stock # (or Customer) and Salesperson are needed.") + '</div>') + '</div>' +
      '<div class="st-note">Rows sold in another month (for example last month\'s deals repeated on this tab) keep their own date. Where the same deal is on two tabs, the later tab\'s version is imported. F&amp;I managers are matched to their accounts by first name, so they see these deals in My F&amp;I.</div></div>' : '';
  return head(esc(im.file), M.tabs.length + " tab" + (M.tabs.length === 1 ? "" : "s") + " checked · " + (n.all ? n.all + " deals" : "no deals") + (M.perf.length ? " · " + M.perf.length + " Sales Performance tab" + (M.perf.length === 1 ? "" : "s") : "") + " · nothing is saved until you press Import", back + pick + btn, kpis) +
    (im.err ? '<div class="st-err">' + esc(im.err) + '</div>' : '') +
    (!M.logs.length && !M.perf.length ? '<div class="st-warn">Nothing in this file was recognised as sales data. If a tab is a sales log with unusual headings, press <b>Read as a sales log</b> next to it and match the columns.</div>' : '') +
    lands + colmap + preview;
}
/* the file box: choosing or dropping a file */
document.addEventListener("dragover", function(ev){ var z = ev.target && ev.target.closest ? ev.target.closest("[data-stdrop]") : null; if (z){ ev.preventDefault(); z.classList.add("over"); } });
document.addEventListener("dragleave", function(ev){ var z = ev.target && ev.target.closest ? ev.target.closest("[data-stdrop]") : null; if (z) z.classList.remove("over"); });
document.addEventListener("drop", function(ev){
  var z = ev.target && ev.target.closest ? ev.target.closest("[data-stdrop]") : null; if (!z) return;
  ev.preventDefault(); var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) stImpRead(f);
});
