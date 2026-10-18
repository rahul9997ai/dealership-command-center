"use strict";
/* ---------------- GM DASHBOARD · FINANCIAL STATEMENTS ----------------
   The dealership's monthly financial statement, for the GM dashboard's Overview and Financials tabs.
   General Manager and Master only (the database checks the same: dealer_financials, sales_admin_ok).
   Three ways in: link the statement on Google Drive (Excel, Google Sheet or PDF; re-read when it changes),
   upload a file (Excel, PDF or photo), or type the figures. The AI reads any layout into the standard figures
   (departments' sales, gross, expenses and net; totals; operating figures); the GM checks them and saves. */
var FIN = { store:null, rows:{}, loaded:false, loading:false, err:null, read:null, month:null, lastAuto:0 };
var FIN_DEPT_LABEL = { new:"New vehicles", used:"Used vehicles", fi:"F&I", service:"Service", parts:"Parts", body:"Body shop", other:"Other" };
var FIN_DEPT_ORDER = ["new","used","fi","service","parts","body","other"];
var FIN_OPS = [["newUnits","New units retailed"],["usedUnits","Used units retailed"],["newInventoryUnits","New inventory (units)"],["usedInventoryUnits","Used inventory (units)"],
  ["newDaysSupply","New days supply"],["usedDaysSupply","Used days supply"],["serviceROs","Service repair orders"],["technicians","Technicians"],
  ["personnelExpense","Personnel expense"],["advertisingExpense","Advertising"],["floorPlanInterest","Floor plan interest"]];
function finSync(){ if (FIN.store !== state.activeDealershipId) FIN = { store:state.activeDealershipId, rows:{}, loaded:false, loading:false, err:null, read:null, month:null, lastAuto:0 }; }
function finCfg(){ return (state.config && state.config.financials) || {}; }
function finLoad(force){
  finSync();
  if (!V.isAdmin() || FIN.loading || (FIN.loaded && !force)) return;
  if (!stOnline()){ FIN.loaded = true; return; }
  FIN.loading = true; var store = FIN.store;
  fetchAllRows(function(){ return sb.from("dealer_financials").select("month,data,source,updated_by_name,updated_at").eq("dealership_id", store).order("month"); }).then(function(rows){
    FIN.loading = false; if (FIN.store !== store) return; FIN.rows = {}; rows.forEach(function(r){ FIN.rows[r.month] = Object.assign({}, r.data, { _src:r.source, _by:r.updated_by_name, _at:r.updated_at }); });
    FIN.loaded = true; FIN.err = null; render(); finAuto();
  }, function(e){ FIN.loading = false; FIN.loaded = true; FIN.err = "Couldn't load the financial statements: " + (e && e.message ? e.message : e); render(); });
}
function finMonths(){ return Object.keys(FIN.rows).sort(); }
function finLatest(){ var m = finMonths(); return m.length ? m[m.length - 1] : null; }
function finN(v){ return v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v); }
function finDept(r, k){ return ((r && r.departments) || []).filter(function(d){ return d.key === k; })[0] || null; }
/* derived figures a GM reads first */
function finKpis(r){
  if (!r) return null;
  var t = r.totals || {}, gross = finN(t.gross), exp = finN(t.expenses), net = finN(t.netProfit), sales = finN(t.sales);
  var deptGross = function(k){ var d = finDept(r, k); return d ? finN(d.gross) : null; };
  if (gross === null){ var g = 0, any = false; FIN_DEPT_ORDER.forEach(function(k){ var v = deptGross(k); if (v !== null){ g += v; any = true; } }); gross = any ? g : null; }
  var fixed = ["service","parts","body"].reduce(function(a, k){ var v = deptGross(k); return v === null ? a : (a || 0) + v; }, null);
  return { sales:sales, gross:gross, expenses:exp, net:net, grossPct:sales && gross !== null ? gross/sales : null, netPct:sales && net !== null ? net/sales : null,
    expPct:gross && exp !== null ? exp/gross : null, absorption:exp && fixed !== null ? fixed/exp : null, fixed:fixed };
}
/* ---- reading a statement (file or link) ---- */
function finTabsFrom(buf){
  var X = window.XLSX, wb = X.read(buf, { type:"array" });
  return wb.SheetNames.slice(0, 12).map(function(n){
    var rows = X.utils.sheet_to_json(wb.Sheets[n], { header:1, raw:false, defval:"" }), lines = [];
    rows.forEach(function(r, i){ var cells = r.map(function(c){ return String(c).trim(); }); if (cells.some(function(c){ return c; })) lines.push([i + 1, cells]); });
    return { name:n, lines:lines.slice(0, 400) };
  }).filter(function(t){ return t.lines.length; });
}
function finAi(body, label){
  FIN.read = { busy:true, err:null, file:label, months:null, note:"" }; render();
  return stAiCall(Object.assign({ dealershipId:FIN.store, kind:"financials", file:label }, body)).then(function(r){
    var res = r.result || {}; FIN.read = { busy:false, err:null, file:label, months:(res.months || []).filter(function(m){ return /^\d{4}-\d{2}$/.test(m.month || ""); }), note:res.note || "", cost:r.cost };
    if (!FIN.read.months.length) FIN.read.err = "No monthly figures were found in " + label + ". Check it's the financial statement, or type the figures.";
    render();
  }).catch(function(e){ FIN.read = { busy:false, err:e.message, file:label, months:null }; render(); });
}
function finReadFile(f){
  if (!f) return;
  if (!aiOn()){ toast("Reading a statement uses AI: turn AI on in Dealership settings › AI, or type the figures.", "err"); return; }
  var name = f.name || "statement", type = f.type || "";
  if (/\.(xlsx|xlsm|xls|csv)$/i.test(name) || /sheet|excel|csv/.test(type)){
    stImpLib().then(function(){ var fr = new FileReader(); fr.onload = function(){ var tabs = finTabsFrom(new Uint8Array(fr.result));
      if (!tabs.length){ toast("That file is empty.", "err"); return; } finAi({ tabs:tabs }, name); }; fr.readAsArrayBuffer(f); });
  } else if (/pdf|image\/(png|jpeg|webp)/.test(type)){
    if (f.size > 6 * 1024 * 1024){ toast("That file is over 6 MB. Send just the statement pages.", "err"); return; }
    var fr2 = new FileReader(); fr2.onload = function(){ finAi({ mediaType:type, data:String(fr2.result).split(",")[1] }, name); }; fr2.readAsDataURL(f);
  } else toast("Send the statement as Excel, PDF or a photo.", "err");
}
function finReadLink(quiet){
  var L = finCfg().link; if (!L || !L.id) return Promise.resolve();
  if (!aiOn()){ if (!quiet) toast("Reading a statement uses AI: turn AI on in Dealership settings › AI.", "err"); return Promise.resolve(); }
  if (!quiet){ FIN.read = { busy:true, err:null, file:L.name, months:null }; render(); }
  return dsCall({ action:"fetch", dealershipId:FIN.store, fileId:L.id }).then(function(r){
    var bytes = Uint8Array.from(atob(r.data), function(c){ return c.charCodeAt(0); }), mt = String(r.meta.mimeType || "");
    state.config.financials = Object.assign({}, finCfg(), { link:Object.assign({}, L, { modified:r.meta.modifiedTime, read:new Date().toISOString() }) }); commit();
    if (/pdf/.test(mt)){ var b64 = ""; for (var i = 0; i < bytes.length; i += 32768) b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)); return finAi({ mediaType:"application/pdf", data:btoa(b64) }, r.meta.name || L.name); }
    return stImpLib().then(function(){ var tabs = finTabsFrom(bytes); return finAi({ tabs:tabs }, r.meta.name || L.name); });
  }).catch(function(e){ FIN.read = { busy:false, err:e.message, file:L.name, months:null }; render(); });
}
/* the linked statement is re-read when it changed (checked once a day when the GM opens the dashboard) */
function finAuto(){
  var L = finCfg().link; if (!L || !L.id || !V.isAdmin() || !stOnline() || !aiOn() || FIN.read) return;
  var key = "dcc-fin-check-" + FIN.store, last = 0; try { last = Number(localStorage.getItem(key)) || 0; } catch (e) {}
  if (Date.now() - last < 20*3600*1000) return;
  try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
  dsCall({ action:"check", dealershipId:FIN.store, fileId:L.id }).then(function(r){ if (r.meta && r.meta.modifiedTime && r.meta.modifiedTime !== L.modified){ toast("The linked financial statement changed. Reading it…", "ok"); finReadLink(false); } }, function(){});
}
function finBlankMonth(month){
  return { month:month, departments:FIN_DEPT_ORDER.slice(0, 6).map(function(k){ return { key:k, name:FIN_DEPT_LABEL[k], sales:null, gross:null, expenses:null, net:null }; }),
    totals:{ sales:null, gross:null, expenses:null, netProfit:null }, operating:{}, unsure:[] };
}
function finSaveRead(){
  var R = FIN.read; if (!R || !R.months) return;
  var me = V.currentUser(), store = FIN.store;
  var rows = R.months.map(function(m){ var d = C.clone(m); return { dealership_id:store, month:m.month, data:d, source:R.file || "typed", updated_by_name:me.name || "", updated_at:new Date().toISOString() }; });
  R.saving = true; render();
  sb.from("dealer_financials").upsert(rows).then(function(x){
    if (x.error){ R.saving = false; R.err = x.error.message; render(); return; }
    rows.forEach(function(r){ FIN.rows[r.month] = Object.assign({}, r.data, { _src:r.source, _by:r.updated_by_name, _at:r.updated_at }); });
    FIN.read = null; FIN.month = rows[rows.length - 1].month; toast("Saved " + rows.length + " month" + (rows.length === 1 ? "" : "s") + " of financial figures.", "ok"); render();
  });
}
function finDelete(month){
  askConfirm("Delete " + stMonthName(month) + "'s figures?", "The financial figures for that month are removed from the dashboard. You can read the statement again any time.", "Delete", function(){
    sb.from("dealer_financials").delete().eq("dealership_id", FIN.store).eq("month", month).then(function(x){ if (x.error){ toast(x.error.message, "err"); return; } delete FIN.rows[month]; if (FIN.month === month) FIN.month = null; toast("Deleted.", "ok"); render(); }); });
}
/* ---- review what was read (or type it) before saving ---- */
function finMoneyIn(path, v){ return '<input class="fin-in" inputmode="decimal" data-fin="' + path + '" value="' + (v === null || v === undefined ? "" : esc(String(v))) + '" placeholder="—">'; }
function finReview(){
  var R = FIN.read; if (!R) return "";
  if (R.busy) return '<div class="st-card fin-review"><div class="st-ch"><span class="st-ico p">✦</span><h3>Reading ' + esc(R.file || "the statement") + '…<small>the AI is finding the standard figures</small></h3></div><div class="st-ai-prog"><i></i></div></div>';
  if (!R.months) return R.err ? '<div class="st-err">' + esc(R.err) + ' <button type="button" class="btn sm" data-fin-act="close">OK</button></div>' : "";
  return '<div class="st-card fin-review"><div class="st-ch"><span class="st-ico p">✓</span><h3>Check the figures, then save<small>' + esc(R.file === "typed" ? "typed in" : "read from " + (R.file || "")) + (R.note ? " · " + esc(R.note) : "") + '</small></h3>' +
      '<span style="margin-left:auto;display:flex;gap:6px"><button type="button" class="btn sm" data-fin-act="close">Cancel</button><button type="button" class="btn sm primary" data-fin-act="save"' + (R.saving ? " disabled" : "") + '>' + (R.saving ? "Saving…" : "Save " + R.months.length + " month" + (R.months.length === 1 ? "" : "s")) + '</button></span></div>' +
    (R.err ? '<div class="st-err">' + esc(R.err) + '</div>' : '') +
    R.months.map(function(m, mi){
      var unsure = (m.unsure || []);
      return '<div class="fin-rmonth"><div class="fin-rhead">' + (R.file === "typed" ? '<input type="month" class="st-gsel" data-fin-month="' + mi + '" value="' + esc(m.month) + '">' : '<b>' + esc(stMonthName(m.month)) + '</b>') + (FIN.rows[m.month] ? '<span class="tag">replaces the saved figures</span>' : '') +
          (unsure.length ? '<span class="fin-unsure">Check: ' + unsure.map(esc).join(" · ") + '</span>' : '') + '</div>' +
        '<div class="st-tw"><table class="fin-tbl"><thead><tr><th class="l">Department</th><th class="r">Sales</th><th class="r">Gross</th><th class="r">Expenses</th><th class="r">Net</th></tr></thead><tbody>' +
          (m.departments || []).map(function(d, di){ return '<tr><td class="l">' + esc(FIN_DEPT_LABEL[d.key] || d.name || d.key) + '</td>' + ["sales","gross","expenses","net"].map(function(f){ return '<td class="r">' + finMoneyIn(mi + ".d." + di + "." + f, d[f]) + '</td>'; }).join("") + '</tr>'; }).join("") +
          '<tr class="tot"><td class="l">Dealership total</td><td class="r">' + finMoneyIn(mi + ".t.sales", (m.totals || {}).sales) + '</td><td class="r">' + finMoneyIn(mi + ".t.gross", (m.totals || {}).gross) + '</td><td class="r">' + finMoneyIn(mi + ".t.expenses", (m.totals || {}).expenses) + '</td><td class="r">' + finMoneyIn(mi + ".t.netProfit", (m.totals || {}).netProfit) + '</td></tr>' +
        '</tbody></table></div>' +
        '<div class="fin-ops">' + FIN_OPS.map(function(o){ return '<label><span>' + esc(o[1]) + '</span>' + finMoneyIn(mi + ".o." + o[0], (m.operating || {})[o[0]]) + '</label>'; }).join("") + '</div></div>'; }).join("") +
    '<div class="ins-sub">Amounts in dollars; leave a box empty when the statement doesn\'t show it. Only the General Manager and Master can see these figures.</div></div>';
}
function finField(ev){
  var el = ev.target; if (!el || !el.getAttribute) return; var k = el.getAttribute("data-fin"); if (!k || !FIN.read || !FIN.read.months) return;
  var parts = k.split("."), m = FIN.read.months[Number(parts[0])]; if (!m) return;
  var raw = String(el.value).replace(/[$,\s]/g, ""), neg = /^\(.*\)$/.test(raw); raw = raw.replace(/[()]/g, "");
  var v = raw === "" || isNaN(Number(raw)) ? null : Number(raw) * (neg ? -1 : 1);
  if (parts[1] === "d"){ var d = m.departments[Number(parts[2])]; if (d) d[parts[3]] = v; }
  else if (parts[1] === "t"){ m.totals = m.totals || {}; m.totals[parts[2]] = v; }
  else if (parts[1] === "o"){ m.operating = m.operating || {}; m.operating[parts[2]] = v; }
}
document.addEventListener("input", finField);
/* ---- settings tile: link or upload ---- */
function viewFinSettings(){
  if (!V.isAdmin() || !state.config) return "";
  finSync(); finLoad(); dsSyncStore();
  if (!DS.info && !DS.infoErr && stOnline() && !DS.infoLoading){ DS.infoLoading = true;
    dsCall({ action:"info", dealershipId:state.activeDealershipId }).then(function(r){ DS.infoLoading = false; DS.info = r; render(); }, function(e){ DS.infoLoading = false; DS.infoErr = e.notSetUp ? "notsetup" : e.message; render(); }); }
  var L = finCfg().link, months = finMonths();
  return '<div class="card"><div class="card-h"><h2>Financial statements</h2><div class="sp"><span class="tag ' + (months.length ? "ok" : "") + '">' + months.length + ' month' + (months.length === 1 ? "" : "s") + '</span></div></div><div class="card-b">' +
    '<p class="muted small" style="max-width:80ch;margin-top:0">The monthly financial statement feeds the GM dashboard\'s <b>Overview</b> and <b>Financials</b>: departmental sales, gross, expenses and net, net profit, absorption and the operating figures. The AI reads any layout (OEM composite, DMS export, accountant\'s summary); you check the figures before they\'re saved. Only the General Manager and Master see them.</p>' +
    '<div class="grid g2"><div><div class="ai-lab">Link it on Google Drive</div>' +
      (L && L.id ? '<div class="fin-link"><b>' + esc(L.name || L.id) + '</b><div class="ins-sub">' + (L.read ? "Last read " + esc(new Date(L.read).toLocaleString("en-CA", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })) : "Not read yet") + ' · re-read automatically when the file changes</div>' +
          '<div style="display:flex;gap:6px;margin-top:8px"><button type="button" class="btn sm primary" data-fin-act="readlink"' + (FIN.read && FIN.read.busy ? " disabled" : "") + '>Read it now</button><button type="button" class="btn sm" data-fin-act="unlink">Unlink</button></div></div>'
        : '<div class="aip-add"><input class="st-tin" data-fin-link="1" value="' + esc(FIN.linkDraft || "") + '" placeholder="Paste the statement\'s Google Drive link"><button type="button" class="btn primary" data-fin-act="link">Link</button></div>' +
          '<div class="ins-sub">' + (DS.info ? 'First share the file on Google Drive with <b>' + esc(DS.info.email) + '</b> as Viewer.' : DS.infoErr === "notsetup" ? 'Google Drive isn\'t set up on the server yet.' : 'Share the file with the Command Center\'s Google account as Viewer, then paste its link.') + '</div>') +
      '<div class="ai-lab" style="margin-top:16px">Or upload it</div><label class="btn">Choose a statement (Excel, PDF or photo)<input type="file" accept=".xlsx,.xls,.xlsm,.csv,application/pdf,image/png,image/jpeg,image/webp" data-fin-file="1" style="display:none"></label>' +
      '<div class="ai-lab" style="margin-top:16px">Or type the figures</div><button type="button" class="btn" data-fin-act="type">Enter a month by hand</button></div>' +
    '<div><div class="ai-lab">Saved months</div>' + (months.length ? '<div class="fin-saved">' + months.slice().reverse().map(function(m){ var r = FIN.rows[m], k = finKpis(r);
        return '<div><b>' + esc(stMonthName(m)) + '</b><span class="ins-sub">net ' + (k && k.net !== null ? stMoney(k.net) : "—") + ' · ' + esc(r._src || "") + '</span><button type="button" class="st-act" data-fin-act="del" data-v="' + m + '" title="Delete">✕</button></div>'; }).join("") + '</div>'
      : '<div class="st-empty">Nothing saved yet.</div>') + (aiOn() ? '' : '<div class="ins-sub" style="margin-top:10px">Reading a statement uses AI (Dealership settings › AI). Typing the figures doesn\'t.</div>') + '</div></div>' +
    finReview() + '</div></div>';
}
function finAct(a, el){
  if (a === "close"){ FIN.read = null; render(); return; }
  if (a === "save"){ finSaveRead(); return; }
  if (a === "readlink"){ finReadLink(false); return; }
  if (a === "unlink"){ state.config.financials = Object.assign({}, finCfg(), { link:null }); commit(); toast("Unlinked. The saved months stay.", "ok"); render(); return; }
  if (a === "del"){ finDelete(el.getAttribute("data-v")); return; }
  if (a === "type"){ var m = stShift(stToday().slice(0, 7), -1); FIN.read = { busy:false, err:null, file:"typed", months:[finBlankMonth(m)], note:"" }; render(); return; }
  if (a === "typemonth"){ return; }
  if (a === "link"){
    var id = dsFileId(FIN.linkDraft); if (!id){ toast("Paste the file's link from Google Drive (Share › Copy link).", "err"); return; }
    dsCall({ action:"check", dealershipId:state.activeDealershipId, fileId:id }).then(function(r){
      state.config.financials = Object.assign({}, finCfg(), { link:{ id:id, name:r.meta.name, modified:"" } }); FIN.linkDraft = ""; commit(); toast("Linked " + r.meta.name + ". Reading it…", "ok"); render(); finReadLink(false);
    }, function(e){ toast(e.message, "err"); });
  }
}
document.addEventListener("click", function(ev){
  var el = ev.target && ev.target.closest ? ev.target.closest("[data-fin-act]") : null; if (!el || !V.isAdmin()) return;
  ev.preventDefault(); finAct(el.getAttribute("data-fin-act"), el);
});
document.addEventListener("input", function(ev){ if (ev.target && ev.target.getAttribute && ev.target.getAttribute("data-fin-link")) FIN.linkDraft = ev.target.value; });
document.addEventListener("change", function(ev){
  var el = ev.target; if (!el || !el.getAttribute) return;
  if (el.getAttribute("data-fin-file") && el.files && el.files[0]){ finReadFile(el.files[0]); el.value = ""; }
  if (el.getAttribute("data-fin-month") && FIN.read && FIN.read.months){ var mm = FIN.read.months[Number(el.getAttribute("data-fin-month"))]; if (mm && /^\d{4}-\d{2}$/.test(el.value)){ mm.month = el.value; render(); } }
});
