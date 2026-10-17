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
function stImpBlank(){ return { raw:null, model:null, existing:null, headMap:{}, forced:{}, skip:{}, typeMap:{}, statusMap:{}, tabTypes:{}, type:"auto", ai:null, doc:null, docOk:{}, docEdits:{}, remember:true, layoutUsed:null }; }
function stImp(){ return ST.imp || (ST.imp = Object.assign({ file:"", tab:"", show:"all", busy:"", err:null }, stImpBlank())); }
function stImpReset(){ var h = ST.imp && ST.imp.hist; ST.imp = null; if (h) stImp().hist = h; }
/* read the file into rows (arrays of cell values), one entry per tab */
function stImpRead(file){
  var im = stImp();
  if (!file) return;
  var docType = /\.pdf$/i.test(file.name) ? "application/pdf" : /\.png$/i.test(file.name) ? "image/png" : /\.jpe?g$/i.test(file.name) ? "image/jpeg" : /\.webp$/i.test(file.name) ? "image/webp" : /\.gif$/i.test(file.name) ? "image/gif" : "";
  if (docType){
    /* a PDF or photo: AI file reading can read it (the screen asks before sending) */
    if (file.size > 6*1024*1024){ im.err = "That file is over 6 MB. Save a smaller copy (fewer pages, or a smaller photo) and try again."; render(); return; }
    Object.assign(im, stImpBlank(), { err:null, busy:"Opening " + file.name + "…", file:file.name }); render();
    var fr = new FileReader();
    fr.onload = function(){ im.busy = ""; im.doc = { mediaType:docType, data:String(fr.result).split(",")[1] || "" }; render(); };
    fr.onerror = function(){ im.busy = ""; im.err = "Couldn't open " + file.name + "."; render(); };
    fr.readAsDataURL(file); return;
  }
  if (/\.(heic|heif|docx?|pptx?|zip|pages|numbers)$/i.test(file.name)){
    im.err = file.name + " can't be read. Save it as Excel (.xlsx) or CSV, or for a page or photo as PDF, JPG or PNG, then drop that in."; render(); return; }
  if (file.size > 15*1024*1024){ im.err = "That file is over 15 MB. Save a copy with just the sales tabs and try again."; render(); return; }
  Object.assign(im, stImpBlank(), { err:null, busy:"Reading " + file.name + "…", file:file.name }); render();
  Promise.all([stImpLib(), file.arrayBuffer()]).then(function(r){
    var X = r[0], wb;
    try { wb = X.read(new Uint8Array(r[1]), { type:"array" }); } catch (e) { throw new Error(file.name + " couldn't be opened as a spreadsheet. Save it from Excel as .xlsx or .csv and try again."); }
    im.raw = wb.SheetNames.map(function(n){ return { name:n, rows:X.utils.sheet_to_json(wb.Sheets[n], { header:1, raw:true, defval:"" }) }; });
    stImpApplyLayouts(); stImpBuild();
    return stImpExisting().then(function(){ im.busy = ""; stImpBuild(); render(); });
  }).catch(function(e){ im.busy = ""; im.raw = null; im.model = null; im.err = (e && e.message ? e.message : String(e)); render(); });
}
/* review every tab, turn rows into deals and monthly totals, and check each one */
function stImpBuild(){
  var im = stImp(); if (im.doc){ if (im.ai && im.ai.status === "done") stImpBuildDoc(); return; }
  if (!im.raw) return;
  var opts = { type:im.type, headMap:im.headMap, typeMap:im.typeMap, statusMap:im.statusMap, leads:ST_LEAD, closes:["1st visit","Be-back"], stocks:ST_STOCK, store:ST.store, file:im.file };
  var logs = [], perf = [], tabs = [], byId = {}, order = [];
  im.raw.forEach(function(s){
    var filled = s.rows.filter(function(r){ return (r || []).some(function(v){ return C.impText(v); }); }).length;
    var forced = im.forced[s.name];
    if (forced === undefined){
      var P = C.impPerfSheet(s.name, s.rows);
      if (P && P.people.length){ perf.push(P); tabs.push({ name:s.name, kind:"perf", P:P }); return; }
    }
    var L = C.impLogSheet(s.name, s.rows, Object.assign({}, opts, { headerRow:forced, skipLines:im.skip[s.name], tabType:im.tabTypes[s.name] }));
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
  if (M.n.check){ toast("Check the " + M.n.check + " deal" + (M.n.check === 1 ? "" : "s") + " the AI wasn't sure about first.", "err"); return; }
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
    stImpRememberLayouts();
    var h = stImp().hist; INS.loaded = {}; ST.imp = null; stImp().hist = h ? [{ id:batch, data:rec.data, created_at:now }].concat(h) : null;
    ST.view = "log"; toast(msg, "ok"); render();
  }, function(e){
    im.busy = ""; im.hist = null;
    im.err = "The import stopped part-way: " + (e && e.message ? e.message : e) + (done ? ". " + done + " deals were saved and are listed under this import, so you can delete them, or import the file again to add the rest." : ".");
    render();
  });
}
/* ---- the screen ---- */
/* a value the AI wasn't sure of: shown as a box to correct, until the deal is confirmed */
function stImpCell(r, f, html){
  if (!r.unsure || r.unsure.indexOf(f) === -1 || r.state !== "check") return html;
  var d = r.deal, v = f === "sp" ? (d.salespeople[0] || {}).name : f === "soldDate" ? d.soldDate : d[f];
  return '<input class="st-tin st-unsure" data-stf="impDoc" data-k="' + r.idx + '|' + f + '" value="' + esc(v === null || v === undefined ? "" : v) + '" title="The AI wasn\'t sure of this value">';
}
function stImpPill(r){
  if (r.state === "check") return '<span class="st-pill scheduled">' + esc(r.unsureNote || "Check the outlined values") + '</span> <button type="button" class="st-act go" data-st="impdocok" data-v="' + r.idx + '">Looks right</button>';
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
  var pick = '<label class="st-gbtn st-file">' + (M || im.doc ? "Choose another file" : "Choose a file") + '<input type="file" data-stimp="file"></label>';
  var back = '<button type="button" class="st-gbtn" data-st="impcancel">' + (M ? "Cancel" : "Back to the Sales log") + '</button>';
  if (!M && im.doc){
    return head(esc(im.file), (im.doc.mediaType === "application/pdf" ? "A PDF" : "A photo") + " · read by AI, checked by you · nothing is saved until you press Import", '<button type="button" class="st-gbtn" data-st="impcancel">Cancel</button>' + pick) +
      (im.err ? '<div class="st-err">' + esc(im.err) + '</div>' : '') + stAiBox();
  }
  if (!M){
    return head("Bring in a spreadsheet", "Any sales sheet: every tab is checked and you see where it lands before anything is saved", back + pick) +
      (im.err ? '<div class="st-err">' + esc(im.err) + '</div>' : '') +
      (im.busy ? '<div class="st-warn" style="background:var(--info-bg);border-color:var(--blue);color:var(--blue)">' + esc(im.busy) + '</div>' : '') +
      '<label class="st-drop" data-stdrop="1"><input type="file" data-stimp="file"><span class="st-ico b">⇪</span><b>Drop the file here, or click to choose it</b><span>Excel (.xlsx, .xls), CSV or OpenDocument · New car logs, pre-owned logs, Sales Performance' + (stAiOn() ? ' · PDFs and photos of deal sheets (read by AI)' : '') + '</span></label>' +
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
  var perfOk = M.perf.filter(function(P){ return P.state === "ready" || P.state === "replace"; }).length, blocked = (M.typeUnknown && im.type === "auto") || !!M.n.check;
  var btn = n.ready || perfOk ? '<button type="button" class="st-gbtn primary" data-st="impsave"' + (im.busy || blocked ? " disabled" : "") + (blocked ? ' title="' + (M.n.check ? "Check the deals the AI wasn't sure about first" : "Choose New or Used first") + '"' : '') + '>' + (im.busy ? esc(im.busy) : "Import " + (n.ready ? n.ready + " deal" + (n.ready === 1 ? "" : "s") : "") + (n.ready && perfOk ? " + " : "") + (perfOk ? perfOk + " month" + (perfOk === 1 ? "" : "s") : "")) + '</button>' : '';
  var kpis = M.logs.length ? '<div class="st-kpis"><div class="st-hk"><div class="l">Deals found</div><div class="v">' + n.all + '</div><div class="s">' + M.logs.length + ' tab' + (M.logs.length === 1 ? "" : "s") + (n.dup ? ' · ' + n.dup + ' repeated on a later tab, counted once' : '') + '</div></div>' +
      '<div class="st-hk"><div class="l">Ready to import</div><div class="v" style="color:#86efac">' + n.ready + '</div><div class="s">' + (n.note ? n.note + ' with a note (shown below)' : 'matched and checked') + '</div></div>' +
      '<div class="st-hk"><div class="l">Already in the tracker</div><div class="v" style="color:#fde68a">' + n.exists + '</div><div class="s">same stock # and date · skipped</div></div>' +
      (M.doc ? '<div class="st-hk"><div class="l">To check</div><div class="v" style="color:' + (n.check ? "#fde68a" : "#86efac") + '">' + n.check + '</div><div class="s">' + (n.check ? 'deals with a value the AI wasn\'t sure of' : 'all checked') + '</div></div></div>' :
      '<div class="st-hk"><div class="l">Can\'t import</div><div class="v" style="color:' + (n.bad ? "#fca5a5" : "#fff") + '">' + n.bad + '</div><div class="s">' + (n.bad ? 'no readable date · fix in Excel and import again' : 'every row has a date') + '</div></div></div>') : '';
  /* where each tab lands */
  var lands = '<div class="st-table"><div class="st-th"><div><h2>WHERE THE DATA LANDS</h2><div class="st-hsub">every tab in the file, checked · nothing is saved until you press Import</div></div></div><div class="st-tw"><table><thead><tr><th class="l">Tab</th><th class="l">What it is</th><th class="l">Lands in</th><th class="l">Details</th><th></th></tr></thead><tbody>' +
    M.tabs.map(function(t){
      var what, where, det, act = "";
      if (t.kind === "log"){ what = '<span class="st-pill delivered">Sales log</span>'; where = "Sales log" + (t.L.month ? " · " + esc(stMonthName(t.L.month)) + " tab" : ""); det = t.L.rows.length + " deals · " + stImpTypeText(t.L, im) + (t.L.forced ? (im.ai && im.ai.tabs && im.ai.tabs[t.name] ? " · read by AI" : im.layoutUsed ? " · saved layout" : " · read by hand") : "");
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
  var fields = Object.keys(C.IMP_COL_LABEL), aiCols = (im.ai && im.ai.tabs && im.ai.tabs[im.tab] && im.ai.tabs[im.tab].columns) || [];
  var colmap = L && !M.doc ? '<div class="st-card" style="margin-bottom:14px"><div class="st-ch"><span class="st-ico b">⇄</span><h3>Columns · ' + esc(im.tab) + '<small>heading row ' + (L.header.row + 1) + ' · change any that are wrong; the same heading is used on every tab</small></h3><span class="cnt">' + Object.keys(L.header.cols).length + '</span></div><div class="st-colmap">' +
      L.header.all.map(function(a){ var aic = aiCols.filter(function(c){ return C.impHead(c.heading) === a.key; })[0];
        return '<div class="' + (a.field ? "" : "off") + (aic ? " ai" : "") + '"><span title="' + esc(a.text) + '">' + esc(a.text) + '</span><i>→</i><select class="st-tin st-mapsel" data-stf="impMap" data-key="' + esc(a.key) + '"><option value="">Not used</option>' +
        fields.map(function(f){ return '<option value="' + f + '" ' + (a.field === f ? "selected" : "") + '>' + esc(C.IMP_COL_LABEL[f]) + '</option>'; }).join("") + '</select>' +
        (aic ? '<em>' + stAiConf(aic.confidence) + ' ' + esc(aic.reason) + '</em>' : '') + '</div>'; }).join("") + '</div>' +
      '<div class="st-legend" style="align-items:center"><span>New or Used</span><span class="st-sub" style="margin:0">' + [["auto","Work it out"],["Used","All Used"],["New","All New"]].map(function(o){ return '<button type="button" data-st="imptype" data-v="' + o[0] + '" class="' + (im.type === o[0] ? "on" : "") + '">' + o[1] + '</button>'; }).join("") + '</span>' +
        '<span>' + (blocked ? '<b style="color:var(--danger)">This file doesn\'t say whether the deals are New or Used. Choose one.</b>' : '"Work it out" uses a New/Used column, else the tab or file name.') + '</span>' +
        (Object.keys(im.headMap).length || Object.keys(im.forced).length ? '<button type="button" class="btn sm ghost" data-st="impautomap">Undo my column changes</button>' : '') + '</div></div>' : '';
  var preview = L ? '<div class="st-table"><div class="st-th"><div><h2>PREVIEW · ' + esc(String(im.tab).toUpperCase()) + '</h2><div class="st-hsub">every row is shown before anything is saved</div></div>' +
      '<div class="st-actions"><select class="st-gsel" data-stf="impTab" aria-label="Tab">' + M.tabs.filter(function(t){ return t.L && t.L.rows.length; }).map(function(t){ return '<option value="' + esc(t.name) + '" ' + (t.name === im.tab ? "selected" : "") + '>' + esc(t.name) + ' (' + t.L.rows.length + ')</option>'; }).join("") + '</select>' +
      '<select class="st-gsel" data-stf="impShow" aria-label="Show"><option value="all" ' + (im.show === "all" ? "selected" : "") + '>All rows</option><option value="look" ' + (im.show === "look" ? "selected" : "") + '>Needs a look</option><option value="exists" ' + (im.show === "exists" ? "selected" : "") + '>Already in the tracker</option></select></div></div>' +
      '<div class="st-tw">' + (tabRows.length ? '<table><thead><tr><th class="l">Sold</th><th>Stock #</th><th class="l">Customer · vehicle</th><th>Salesperson</th><th>F&amp;I</th><th class="l">Status</th><th>Deal</th><th class="r">Front</th><th class="r">F&amp;I gross</th><th class="l">Check</th></tr></thead><tbody>' +
        tabRows.slice(0, 400).map(function(r){ var d = r.deal;
          return '<tr><td class="l" style="font-weight:600">' + stImpCell(r, "soldDate", d.soldDate ? stDay(d.soldDate) : '<span style="color:var(--danger)">—</span>') + '</td><td><b>' + stImpCell(r, "stockNo", esc(d.stockNo)) + '</b></td><td class="l"><b>' + stImpCell(r, "customer", esc(d.customer || "—")) + '</b><div class="ins-sub">' + esc(d.vehicle) + ' · ' + esc(d.type) + '</div></td>' +
            '<td>' + stImpCell(r, "sp", stSpText(d)) + '</td><td>' + stImpCell(r, "fiManager", esc(d.fiManager || "—")) + '</td><td class="l">' + stImpCell(r, "status", '<span class="st-pill ' + d.status + '">' + ST_LABEL[d.status] + '</span>') + '</td><td>' + stImpCell(r, "dealType", esc(d.dealType || "—")) + '</td>' +
            '<td class="r num">' + stImpCell(r, "frontGross", '<b' + (d.frontGross !== null && d.frontGross <= 0 ? ' style="color:var(--danger)"' : '') + '>' + (d.frontGross === null ? "—" : stMoney(d.frontGross)) + '</b>') + '</td><td class="r num">' + stImpCell(r, "fiGross", d.fiGross === null ? "—" : stMoney(d.fiGross)) + '</td><td class="l">' + stImpPill(r) + '</td></tr>'; }).join("") + '</tbody></table>' :
        '<div class="st-empty" style="padding:16px">' + (L.rows.length ? "No rows to show with this filter." : "No deals found under these headings. Check the columns above: Stock # (or Customer) and Salesperson are needed.") + '</div>') + '</div>' +
      '<div class="st-note">Rows sold in another month (for example last month\'s deals repeated on this tab) keep their own date. Where the same deal is on two tabs, the later tab\'s version is imported. F&amp;I managers are matched to their accounts by first name, so they see these deals in My F&amp;I.</div></div>' : '';
  return head(esc(im.file), M.tabs.length + " tab" + (M.tabs.length === 1 ? "" : "s") + " checked · " + (n.all ? n.all + " deals" : "no deals") + (M.perf.length ? " · " + M.perf.length + " Sales Performance tab" + (M.perf.length === 1 ? "" : "s") : "") + " · nothing is saved until you press Import", back + pick + btn, kpis) +
    (im.err ? '<div class="st-err">' + esc(im.err) + '</div>' : '') +
    (!M.logs.length && !M.perf.length ? '<div class="st-warn">Nothing in this file was recognised as sales data. If a tab is a sales log with unusual headings, press <b>Read as a sales log</b> next to it and match the columns.</div>' : '') +
    (M.doc ? "" : lands) + stAiBox() + stAiProposal() + (im.layoutUsed ? '<div class="st-note" style="margin:-6px 0 12px;border:0">Read with a layout saved on ' + esc(im.layoutUsed) + ' (no AI needed).</div>' : '') + colmap + preview;
}
/* the file box: choosing or dropping a file */
document.addEventListener("dragover", function(ev){ var z = ev.target && ev.target.closest ? ev.target.closest("[data-stdrop]") : null; if (z){ ev.preventDefault(); z.classList.add("over"); } });
document.addEventListener("dragleave", function(ev){ var z = ev.target && ev.target.closest ? ev.target.closest("[data-stdrop]") : null; if (z) z.classList.remove("over"); });
document.addEventListener("drop", function(ev){
  var z = ev.target && ev.target.closest ? ev.target.closest("[data-stdrop]") : null; if (!z) return;
  ev.preventDefault(); var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) stImpRead(f);
});
/* ---- AI file reading (General Manager; switched on per dealership in Dealership settings) ---- */
function stAiOn(){ return stImpCan() && !!(state.config && state.config.ai && state.config.ai.on); }
function stAiCall(body){
  if (!stOnline()) return Promise.reject(new Error("AI file reading needs the live Command Center (it isn't available offline)."));
  return sb.auth.getSession().then(function(r){
    var sess = r.data && r.data.session;
    if (!sess) throw new Error("You're signed out. Sign in again.");
    return fetch(SB_URL + "/functions/v1/ai-read", { method:"POST",
      headers:{ "Content-Type":"application/json", "apikey":SB_KEY, "Authorization":"Bearer " + sess.access_token }, body:JSON.stringify(body) });
  }).then(function(res){ return res.json().then(function(j){ if (!res.ok || j.error) throw new Error(j.error || ("Error " + res.status)); return j; }); });
}
function stAiRoster(){
  var names = stRoster(stToday().slice(0, 7)).slice();
  (ST.fms || []).forEach(function(m){ names.push(m.name); });
  return names;
}
/* what would be sent for the tabs the importer didn't recognise (shown before sending) */
function stAiSample(){
  var im = stImp(), roster = stAiRoster(), names = (im.model ? im.model.tabs : []).filter(function(t){ return t.kind === "unknown"; }).map(function(t){ return t.name; });
  return (im.raw || []).filter(function(s){ return names.indexOf(s.name) !== -1; }).slice(0, 20).map(function(s){ var m = C.impMaskTab(s.rows, roster); return { name:s.name, lines:m.lines, masked:m.masked, hidden:m.hidden }; });
}
function stImpAiSheet(){
  var im = stImp(), tabs = stAiSample();
  if (!tabs.length){ toast("Every tab was recognised already.", "ok"); return; }
  im.ai = { status:"reading", kind:"sheet" }; im.err = null; render();
  stAiCall({ dealershipId:ST.store, kind:"sheet", file:im.file, tabs:tabs.map(function(t){ return { name:t.name, lines:t.lines }; }) }).then(function(r){
    var res = r.result || {}, ai = { status:"done", kind:"sheet", tabs:{}, questions:(res.questions || []).map(function(q){ return Object.assign({ pick:0 }, q); }), cost:r.cost, spent:r.spent, cap:r.cap };
    (res.tabs || []).forEach(function(t){
      ai.tabs[t.name] = t;
      if (t.kind !== "sales_log" || !(t.headerLine > 0)) return;
      im.forced[t.name] = t.headerLine - 1;
      (t.columns || []).forEach(function(c){ im.headMap[C.impHead(c.heading)] = c.field || ""; });
      im.skip[t.name] = (t.skipLines || []).map(function(x){ return x.line; });
      (t.statusCodes || []).forEach(function(x){ im.statusMap[String(x.code).toUpperCase()] = x.status; });
      (t.typeCodes || []).forEach(function(x){ im.typeMap[String(x.code).toUpperCase()] = x.type; });
      if (t.vehicleType === "New" || t.vehicleType === "Used") im.tabTypes[t.name] = t.vehicleType;
    });
    ai.questions.forEach(function(q){ stAiApplyChoice(q.choices && q.choices[0]); });
    im.ai = ai; stImpBuild(); return stImpExisting().then(function(){ stImpBuild(); render(); });
  }).catch(function(e){ im.ai = null; im.err = e.message; render(); });
}
function stAiApplyChoice(ch){
  var im = stImp(); if (!ch) return;
  if (ch.kind === "column") im.headMap[C.impHead(ch.key)] = ch.value || "";
  else if (ch.kind === "typeCode") im.typeMap[String(ch.key).toUpperCase()] = ch.value;
  else if (ch.kind === "statusCode") im.statusMap[String(ch.key).toUpperCase()] = ch.value;
  else if (ch.kind === "tabType" && (ch.value === "New" || ch.value === "Used")) im.tabTypes[ch.key] = ch.value;
}
/* a PDF or a photo: read by AI into deals; the GM confirms each field it wasn't sure of */
function stImpAiDoc(){
  var im = stImp(), d = im.doc; if (!d) return;
  im.ai = { status:"reading", kind:"document" }; im.err = null; render();
  stAiCall({ dealershipId:ST.store, kind:"document", file:im.file, mediaType:d.mediaType, data:d.data, year:Number(stToday().slice(0, 4)) }).then(function(r){
    im.ai = { status:"done", kind:"document", result:r.result || {}, cost:r.cost, spent:r.spent, cap:r.cap }; im.docOk = {};
    stImpBuild(); return stImpExisting().then(function(){ stImpBuild(); render(); });
  }).catch(function(e){ im.ai = null; im.err = e.message; render(); });
}
function stImpBuildDoc(){
  var im = stImp(), res = im.ai && im.ai.result;
  var rows = C.impDocDeals(res, { year:Number(stToday().slice(0, 4)), store:ST.store, file:im.file, type:im.type === "New" || im.type === "Used" ? im.type : "" });
  (im.docEdits ? Object.keys(im.docEdits) : []).forEach(function(k){ var p = k.split("|"), r = rows[Number(p[0])]; if (r) stImpDocSet(r.deal, p[1], im.docEdits[k]); });
  var ex = im.existing || {};
  rows.forEach(function(r, i){ r.tab = im.file; r.idx = i; var k = stKey(r.deal.stockNo) + "|" + r.deal.soldDate;
    r.state = r.bad ? "bad" : (ST.deals[r.deal.id] || ex[k]) ? "exists" : (r.unsure.length && !(im.docOk || {})[i]) ? "check" : r.issues.length ? "note" : "ready"; });
  var L = { name:im.file, rows:rows, header:{ row:0, all:[], cols:{} }, typeUnknown:rows.some(function(r){ return r.typeMissing; }) && im.type === "auto" };
  im.model = { doc:true, logs:rows.length ? [L] : [], perf:[], tabs:[{ name:im.file, kind:rows.length ? "log" : "empty", L:L }], rows:rows, typeUnknown:L.typeUnknown,
    n:{ all:rows.length, ready:rows.filter(function(r){ return r.state === "ready" || r.state === "note"; }).length, note:rows.filter(function(r){ return r.state === "note"; }).length,
      exists:rows.filter(function(r){ return r.state === "exists"; }).length, bad:rows.filter(function(r){ return r.state === "bad"; }).length,
      check:rows.filter(function(r){ return r.state === "check"; }).length, dup:0 } };
  im.tab = im.file;
}
function stImpDocSet(d, f, v){
  if (f === "frontGross" || f === "fiGross") d[f] = C.impMoney(v);
  else if (f === "soldDate"){ d.soldDate = C.impDate(v, Number(stToday().slice(0, 4)), null) || ""; }
  else if (f === "sp") d.salespeople = [{ name:stKey(v) || "HOUSE", share:1 }];
  else if (f === "status"){ var s = String(v).toLowerCase(); if (C.SALE_STATUSES.indexOf(s) !== -1) d.status = s; }
  else d[f] = String(v || "");
}
/* remembered layouts: next month's file with the same headings is read without AI */
function stImpLayoutSig(row){ return (row || []).map(function(v){ return C.impHead(v); }).filter(Boolean).sort().join("|"); }
function stImpApplyLayouts(){
  var im = stImp(), lay = (state.config && state.config.importLayouts) || {}, used = null;
  if (!Object.keys(lay).length) return;
  (im.raw || []).forEach(function(s){
    for (var i = 0; i < Math.min(s.rows.length, 80); i++){ var L = lay[stImpLayoutSig(s.rows[i])]; if (!L) continue;
      im.forced[s.name] = i; Object.assign(im.headMap, L.headMap || {}); Object.assign(im.typeMap, L.typeMap || {}); Object.assign(im.statusMap, L.statusMap || {});
      if (L.tabType && !im.tabTypes[s.name]) im.tabTypes[s.name] = L.tabType;
      used = L.savedAt || "earlier"; break; }
  });
  im.layoutUsed = used;
}
function stImpRememberLayouts(){
  var im = stImp(); if (!im.ai || im.ai.kind !== "sheet" || !im.remember) return;
  var lay = Object.assign({}, state.config.importLayouts || {}), n = 0;
  (im.raw || []).forEach(function(s){
    var row = im.forced[s.name]; if (row === undefined || !(im.ai.tabs || {})[s.name]) return;
    var hm = {}; (s.rows[row] || []).forEach(function(v){ var k = C.impHead(v); if (k && Object.prototype.hasOwnProperty.call(im.headMap, k)) hm[k] = im.headMap[k]; });
    lay[stImpLayoutSig(s.rows[row])] = { headMap:hm, typeMap:im.typeMap, statusMap:im.statusMap, tabType:im.tabTypes[s.name] || "", savedAt:stToday(), file:im.file }; n++;
  });
  if (n){ state.config.importLayouts = lay; commit(); }
}
function stAiConf(p){ var c = p >= 85 ? "hi" : p >= 60 ? "mid" : "lo"; return '<span class="st-conf ' + c + '"><i><b style="width:' + Math.max(4, Math.min(100, p)) + '%"></b></i>' + Math.round(p) + '%</span>'; }
function stAiBox(){
  var im = stImp(), ai = im.ai;
  if (ai && ai.status === "reading") return '<div class="st-ai"><div class="st-ai-h"><span class="st-ai-tag">✦ AI</span><b>Reading ' + esc(im.file) + '…</b></div><div class="ins-sub">' + (ai.kind === "document" ? "Reading the deals on the page." : "Working out what each tab and column is.") + ' This usually takes 10 to 30 seconds.</div><div class="st-ai-prog"><i></i></div></div>';
  if (im.doc && !(ai && ai.status === "done")){
    if (!stAiOn()) return '<div class="st-warn">' + esc(im.file) + ' is a ' + (im.doc.mediaType === "application/pdf" ? "PDF" : "photo") + '. AI file reading can read the deals on it, but it\'s switched off. The General Manager can turn it on in Dealership settings › AI file reading.</div>';
    return '<div class="st-ai"><div class="st-ai-h"><span class="st-ai-tag">✦ AI file reading</span><b>Let AI read this ' + (im.doc.mediaType === "application/pdf" ? "PDF" : "photo") + '?</b></div>' +
      '<div class="st-ai-cols"><div class="st-ai-yes"><b>Sent</b>The ' + (im.doc.mediaType === "application/pdf" ? "PDF" : "photo") + ' as it is. A page can\'t have names blanked out first, so any customer names on it are sent too. The AI service doesn\'t keep it or learn from it.</div>' +
      '<div class="st-ai-no"><b>What happens</b>The AI lists the deals on the page and marks every value it isn\'t sure of. You check those before anything is imported; nothing is saved until you press Import.</div></div>' +
      '<div class="st-ai-go"><button type="button" class="btn sm primary" data-st="aidoc">✦ Let AI read this ' + (im.doc.mediaType === "application/pdf" ? "PDF" : "photo") + '</button><span class="ins-sub">usually 10–30 seconds · a few cents</span></div></div>';
  }
  if (ai || !im.model || im.model.doc) return "";
  var unknown = im.model.tabs.filter(function(t){ return t.kind === "unknown"; });
  if (!unknown.length) return "";
  if (!stAiOn()) return '<div class="st-note" style="margin:-6px 0 14px;border:0">Tip: AI file reading can work out tabs that aren\'t recognised. The General Manager can turn it on in Dealership settings › AI file reading.</div>';
  var sample = stAiSample(), first = sample[0] || { lines:[], masked:[], hidden:0 }, masked = [];
  sample.forEach(function(s){ s.masked.forEach(function(m){ if (masked.indexOf(m) === -1) masked.push(m); }); });
  var hidden = sample.reduce(function(a, s){ return a + s.hidden; }, 0), rows = sample.reduce(function(a, s){ return a + s.lines.length; }, 0);
  var shown = first.lines.slice(0, 9).map(function(l){ return l[0] + ": " + l[1].slice(0, 12).map(function(c){ return String(c).slice(0, 18); }).join(" | "); }).join("\n");
  return '<div class="st-ai"><div class="st-ai-h"><span class="st-ai-tag">✦ AI file reading</span><b>Let AI read ' + (unknown.length === 1 ? 'the "' + esc(unknown[0].name) + '" tab' : 'the ' + unknown.length + ' tabs that weren\'t recognised') + '?</b></div>' +
    '<div class="ins-sub" style="margin-bottom:10px">It works out which row has the headings, what each column holds and which rows aren\'t deals, and shows you its proposal. The amounts are still read by the importer, not by the AI. Nothing is saved until you press Import.</div>' +
    '<div class="st-ai-cols"><div class="st-ai-yes"><b>Sent</b>Headings and ' + rows + ' sample rows from ' + sample.length + ' tab' + (sample.length === 1 ? "" : "s") + '.' + (masked.length ? ' Customer names (' + esc(masked.join(", ")) + ') are replaced with "Customer 1", "Customer 2"…' : '') + (hidden ? ' ' + hidden + ' values blanked in all, including phone numbers and emails.' : '') + '</div>' +
    '<div class="st-ai-no"><b>Not sent</b>The rest of the file, customer names, phone numbers, emails. Nothing from other stores. The AI service doesn\'t keep what it\'s sent or learn from it.</div></div>' +
    '<details class="st-ai-peek"><summary>Exactly what is sent from "' + esc(first.name || "") + '"</summary><pre>' + esc(shown) + (first.lines.length > 9 ? "\n… " + (first.lines.length - 9) + " more rows" : "") + '</pre></details>' +
    '<div class="st-ai-go"><button type="button" class="btn sm primary" data-st="aisheet">✦ Let AI read this file</button><span class="ins-sub">usually 10–30 seconds · a few cents</span></div></div>';
}
function stAiProposal(){
  var im = stImp(), ai = im.ai; if (!ai || ai.status !== "done" || ai.kind !== "sheet") return "";
  var tabs = Object.keys(ai.tabs).map(function(k){ return ai.tabs[k]; });
  var kindTxt = { sales_log:"Sales log", monthly_totals:"Monthly totals (Sales Performance)", other:"Not sales data" };
  var qs = ai.questions || [];
  return '<div class="st-ai"><div class="st-ai-h"><span class="st-ai-tag">✦ AI proposal</span><b>What the AI worked out</b><span class="ins-sub" style="margin-left:auto">read for ' + stMoney2(ai.cost) + ' · ' + stMoney2(ai.spent) + ' of $' + ai.cap + ' used this month</span></div>' +
    tabs.map(function(t){ return '<div class="st-ai-tab"><b>' + esc(t.name) + '</b> · ' + esc(kindTxt[t.kind] || t.kind) + (t.kind === "sales_log" ? ' · headings on row ' + t.headerLine + (t.vehicleType === "New" || t.vehicleType === "Used" ? ' · ' + t.vehicleType + ' (' + esc(t.vehicleTypeReason) + ')' : t.vehicleType === "from_column" ? ' · New/Used from a column' : '') + ((t.skipLines || []).length ? ' · skipping ' + t.skipLines.map(function(x){ return "row " + x.line + " (" + esc(x.reason) + ")"; }).join(", ") : '') : '') + (t.note ? '<div class="ins-sub">' + esc(t.note) + '</div>' : '') + '</div>'; }).join("") +
    (qs.length ? '<div class="st-ai-qs"><div class="st-dsec" style="margin-top:12px">' + qs.length + ' question' + (qs.length === 1 ? "" : "s") + ' · the AI wasn\'t sure, so it asks (its suggestion is selected)</div>' + qs.map(function(q, qi){
      return '<div class="st-ai-q"><span class="n">' + (qi + 1) + '</span><div><b>' + esc(q.text) + '</b>' + (q.detail ? '<div class="ins-sub">' + esc(q.detail) + '</div>' : '') + '</div><div class="st-sub" style="margin:0">' +
        (q.choices || []).map(function(c, ci){ return '<button type="button" data-st="aichoose" data-v="' + qi + '|' + ci + '" class="' + (q.pick === ci ? "on" : "") + '">' + esc(c.label) + '</button>'; }).join("") + '</div></div>'; }).join("") + '</div>' : '') +
    '<label class="st-ai-rem"><input type="checkbox" data-stf="impRemember" ' + (im.remember ? "checked" : "") + '> Remember this layout, so next time a file with the same headings is read straight away, without AI</label></div>';
}
function stMoney2(v){ return "$" + (Number(v) || 0).toFixed(2); }
/* GM: Dealership settings card */
function stAiUsageLoad(){
  if (ST.aiUsage || ST.aiUsageLoading || !stOnline()) return;
  ST.aiUsageLoading = true; var store = ST.store;
  sb.from("sales_ai_usage").select("created_at,user_name,file,kind,sent,result,cost").eq("dealership_id", store).order("created_at", { ascending:false }).limit(40).then(function(r){
    ST.aiUsageLoading = false; if (ST.store !== store) return; ST.aiUsage = r.error ? [] : (r.data || []); render(); });
}
function viewAiSettings(){
  if (!V.isAdmin() || !state.config) return "";
  stSync(); stAiUsageLoad();
  var ai = state.config.ai || {}, cap = Number(ai.cap) > 0 ? Number(ai.cap) : 10, month = stToday().slice(0, 7), use = ST.aiUsage || [];
  var spent = use.filter(function(u){ return String(u.created_at).slice(0, 7) === month; }).reduce(function(a, u){ return a + Number(u.cost || 0); }, 0);
  var reads = use.filter(function(u){ return String(u.created_at).slice(0, 7) === month; }).length, lay = Object.keys(state.config.importLayouts || {}).length;
  return '<div class="card" style="margin-top:16px"><div class="card-h"><h2>AI file reading</h2><div class="sp"><span class="tag ' + (ai.on ? "ok" : "") + '">' + (ai.on ? "On" : "Off") + '</span></div></div><div class="card-b">' +
    '<p class="muted small" style="max-width:76ch;margin-top:0">When an Excel file isn\'t recognised, or for a PDF or photo of a deal sheet, AI can work out where the data goes. You always see its proposal and approve it before anything is imported. Only the General Manager (and Master) can use it.</p>' +
    '<div class="grid g2"><div>' +
      '<label class="uc-feat ' + (ai.on ? "on" : "") + '"><span>AI file reading<small>Offer AI in Sales Tracker › Import</small></span><span class="uc-sw"><input type="checkbox" data-st="aion" ' + (ai.on ? "checked" : "") + '><i></i></span></label>' +
      '<label class="f" style="margin-top:12px"><span>Monthly spending cap ($)</span><input type="number" min="1" step="1" value="' + cap + '" data-st-cap="1" style="max-width:140px"></label>' +
      '<div class="small" style="margin-top:10px"><b>This month:</b> ' + stMoney2(spent) + ' of $' + cap + ' · ' + reads + ' file' + (reads === 1 ? "" : "s") + ' read</div>' +
      '<div class="bar" style="margin-top:6px"><i style="width:' + Math.min(100, spent / cap * 100).toFixed(1) + '%"></i></div>' +
      '<div class="tiny muted" style="margin-top:6px">A sales-log file usually costs a few cents to read; a PDF page a little more. AI stops for the month at the cap.</div>' +
      (lay ? '<div class="small" style="margin-top:12px">' + lay + ' saved layout' + (lay === 1 ? "" : "s") + ' (files read without AI next time) <button type="button" class="btn sm ghost" data-st="aiforget">Forget them</button></div>' : '') +
    '</div><div><div class="notice info" style="margin:0"><b>Privacy</b><br>For spreadsheets only the headings and a sample of rows are sent, with customer names, phone numbers and emails replaced in the browser first. A PDF or photo is sent as it is (a page can\'t be blanked out), and the screen says so before you send it. The AI service doesn\'t keep what it\'s sent or learn from it, and the AI key stays on the server.</div></div></div>' +
    (use.length ? '<div class="tablewrap" style="margin-top:14px"><table><thead><tr><th>When</th><th>Who</th><th>File</th><th>Sent</th><th>Result</th><th class="right">Cost</th></tr></thead><tbody>' +
      use.slice(0, 12).map(function(u){ return '<tr><td class="nowrap">' + esc(new Date(u.created_at).toLocaleString("en-CA", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })) + '</td><td>' + esc(u.user_name || "") + '</td><td>' + esc(u.file || "") + '</td><td class="small">' + esc(u.sent || "") + '</td><td class="small">' + esc(u.result || "") + '</td><td class="right num">' + stMoney2(u.cost) + '</td></tr>'; }).join("") +
      '</tbody></table></div>' : '') + '</div></div>';
}
