"use strict";
/* ---------------- SALES TRACKER · GOOGLE DRIVE SYNC ----------------
   For stores that keep their sales log in Excel on Google Drive: the tracker reads those files (read-only,
   through a Google service account the files are shared with) so the Dashboard, the AI brief and the
   reports work while the Sales Managers keep using Excel. Set up per dealership in Dealership settings
   (GM / Master): paste each file's Drive link and say whether it's New or Used.
   The Excel file is the source of truth while the sync is on: each sync adds new rows, updates changed ones
   and removes deals that were taken out of the file. Synced deals carry data.source = "drive:<file id>".
   It runs when someone who can enter sales opens the Sales Tracker or the Dashboard (at most every 15
   minutes, and only reads a file that changed), or on "Sync now". Turning it off keeps the data. */
var DS = { store:null, status:{}, statusLoaded:false, running:false, lastAuto:0, err:null, info:null, infoErr:null, addLink:"", addType:"auto", adding:false, msg:null };
function dsCfg(){ return (state.config && state.config.driveSync) || { on:false, files:[] }; }
function dsOn(){ var c = dsCfg(); return !!(c.on && (c.files || []).length); }
function dsSyncStore(){ if (DS.store !== state.activeDealershipId){ DS = Object.assign({}, DS, { store:state.activeDealershipId, status:{}, statusLoaded:false, lastAuto:0, info:null, infoErr:null, err:null, msg:null }); } }
function dsCall(body){
  return sb.auth.getSession().then(function(r){
    var sess = r.data && r.data.session; if (!sess) throw new Error("You're signed out. Sign in again.");
    return fetch(SB_URL + "/functions/v1/drive-file", { method:"POST", headers:{ "Content-Type":"application/json", "apikey":SB_KEY, "Authorization":"Bearer " + sess.access_token }, body:JSON.stringify(body) });
  }).then(function(res){ return res.json().then(function(j){ if (!res.ok || j.error){ var e = new Error(j.error || ("Error " + res.status)); e.notSetUp = j.configured === false; throw e; } return j; }); });
}
function dsFileId(link){
  var t = String(link || "").trim(), m = t.match(/\/d\/([A-Za-z0-9_-]{10,})/) || t.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || t.match(/^([A-Za-z0-9_-]{20,})$/);
  return m ? m[1] : "";
}
function dsLoadStatus(){
  dsSyncStore();
  if (!stOnline()) return Promise.resolve();
  var store = DS.store;
  return sb.from("sales_sync").select("file_id,modified_time,synced_at,synced_by,result,excluded").eq("dealership_id", store).then(function(r){
    if (DS.store !== store) return; DS.status = {}; (r.data || []).forEach(function(x){ DS.status[x.file_id] = x; }); DS.statusLoaded = true; });
}
/* saved layouts (from an import that used AI or matched columns by hand) apply to synced files too */
function dsLayouts(raw){
  var lay = (state.config && state.config.importLayouts) || {}, o = { forced:{}, headMap:{}, typeMap:{}, statusMap:{}, tabTypes:{} };
  raw.forEach(function(s){
    for (var i = 0; i < Math.min(s.rows.length, 80); i++){ var L = lay[stImpLayoutSig(s.rows[i])]; if (!L) continue;
      o.forced[s.name] = i; Object.assign(o.headMap, L.headMap || {}); Object.assign(o.typeMap, L.typeMap || {}); Object.assign(o.statusMap, L.statusMap || {});
      if (L.tabType) o.tabTypes[s.name] = L.tabType; break; }
  });
  return o;
}
/* read one file's tabs into deals (same rules as Import from Excel); the latest tab wins for a repeated deal */
function dsParse(file, buf){
  var X = window.XLSX, wb = X.read(buf, { type:"array" });
  var raw = wb.SheetNames.map(function(n){ return { name:n, rows:X.utils.sheet_to_json(wb.Sheets[n], { header:1, raw:true, defval:"" }) }; });
  var lay = dsLayouts(raw), logs = [], bad = 0;
  raw.forEach(function(s){
    if (lay.forced[s.name] === undefined && C.impPerfSheet(s.name, s.rows)) return;
    var L = C.impLogSheet(s.name, s.rows, { type:file.type === "New" || file.type === "Used" ? file.type : "auto", headMap:lay.headMap, typeMap:lay.typeMap, statusMap:lay.statusMap,
      headerRow:lay.forced[s.name], tabType:lay.tabTypes[s.name], leads:ST_LEAD, closes:["1st visit","Be-back"], stocks:ST_STOCK, store:ST.store, file:file.name });
    if (L && L.rows.length) logs.push(L);
  });
  var rows = [];
  logs.sort(function(a, b){ return String(a.month || "").localeCompare(String(b.month || "")); }).forEach(function(L){
    L.rows.forEach(function(r){ if (r.bad){ bad++; return; } r.deal.importedFrom = file.name + " · " + L.name; rows.push(r); });
  });
  var M = C.impMerge(rows);
  return { deals:M.rows.map(function(r){ return r.deal; }), bad:bad, tabs:logs.length, merged:M.merged };
}
function dsSig(d){ var c = Object.assign({}, d); ["createdAt","createdBy","updatedAt","updatedBy","importBatch"].forEach(function(k){ delete c[k]; }); return JSON.stringify(c); }
function dsSyncFile(file, force){
  var store = ST.store, src = "drive:" + file.id, me = V.currentUser(), st = DS.status[file.id] || {};
  return dsCall({ action:"fetch", dealershipId:store, fileId:file.id, since:force ? "" : (st.modified_time || "") }).then(function(r){
    if (r.unchanged) return { file:file, unchanged:true };
    return stImpLib().then(function(){
      var bytes = Uint8Array.from(atob(r.data), function(c){ return c.charCodeAt(0); }), P = dsParse(file, bytes);
      var dates = P.deals.map(function(d){ return d.soldDate; }).sort();
      return Promise.all([
        fetchAllRows(function(){ return sb.from("sales_log").select("id,data").eq("dealership_id", store).eq("data->>source", src).order("id"); }),
        dates.length ? fetchAllRows(function(){ return sb.from("sales_log").select("id,data").eq("dealership_id", store).gte("sold_on", dates[0]).lte("sold_on", dates[dates.length - 1]).order("id"); }) : Promise.resolve([])
      ]).then(function(rs){
        /* deals already in the tracker: this file's own (by source), the same deal imported before (same id: adopted),
           or one typed in by hand with the same stock # and date (left alone, counted as skipped) */
        var mine = {}, other = {}, typed = {}, now = new Date().toISOString(), fms = ST.fms || [];
        rs[0].forEach(function(x){ mine[x.id] = x.data; });
        rs[1].forEach(function(x){ var d = x.data || {}; if (d.source !== src){ other[x.id] = d; typed[stKey(d.stockNo) + "|" + d.soldDate] = x.id; } });
        var write = [], keep = {}, skipped = 0, added = 0, updated = 0, excl = (DS.status[file.id] && DS.status[file.id].excluded) || [], kept = 0;
        P.deals.forEach(function(d){
          if (excl.indexOf(d.id) !== -1){ kept++; return; }
          var tid = typed[stKey(d.stockNo) + "|" + d.soldDate];
          if (!mine[d.id] && tid && tid !== d.id){ skipped++; return; }
          keep[d.id] = 1; d.source = src;
          var first = stKey(d.fiManager).split(/\s+/)[0], fm = first ? fms.filter(function(m){ return stKey(m.name).split(/\s+/)[0] === first; }) : [];
          if (fm.length === 1){ d.fiUserId = fm[0].id; d.fiManager = fm[0].name; }
          var old = mine[d.id] || other[d.id];
          if (old && old.source === src && dsSig(old) === dsSig(Object.assign({}, d, { createdAt:old.createdAt }))) return;
          d.createdAt = old ? old.createdAt : now; d.createdBy = old ? old.createdBy : "Google Drive sync"; d.updatedAt = now; d.updatedBy = "Google Drive sync (" + (me.name || "") + ")";
          write.push(d); if (old) updated++; else added++;
        });
        var gone = Object.keys(mine).filter(function(id){ return !keep[id]; });
        var chain = Promise.resolve();
        for (var i = 0; i < write.length; i += 200) (function(chunk){ chain = chain.then(function(){
          return sb.from("sales_log").upsert(chunk.map(function(d){ return { id:d.id, dealership_id:store, sold_on:d.soldDate, data:d }; })).then(function(x){ if (x.error) throw x.error; chunk.forEach(function(d){ ST.deals[d.id] = d; }); }); }); })(write.slice(i, i + 200));
        for (var j = 0; j < gone.length; j += 200) (function(chunk){ chain = chain.then(function(){
          return sb.from("sales_log").delete().eq("dealership_id", store).in("id", chunk).then(function(x){ if (x.error) throw x.error; chunk.forEach(function(id){ delete ST.deals[id]; }); }); }); })(gone.slice(j, j + 200));
        var result = { added:added, updated:updated, removed:gone.length, skipped:skipped, unreadable:P.bad, deals:P.deals.length, tabs:P.tabs, merged:P.merged, deletedInTracker:kept };
        return chain.then(function(){
          var rec = { dealership_id:store, file_id:file.id, modified_time:r.meta.modifiedTime, synced_at:now, synced_by:me.name || "", result:result, excluded:excl };
          return sb.from("sales_sync").upsert(rec).then(function(x){ if (x.error) throw x.error; DS.status[file.id] = rec; return { file:file, result:result }; });
        });
      });
    });
  });
}
function dsSyncAll(force, quiet){
  if (DS.running || !dsOn() || !stOnline()) return Promise.resolve();
  dsSyncStore(); DS.running = true; DS.err = null; render();
  var files = (dsCfg().files || []).slice(), done = [], chain = DS.statusLoaded ? Promise.resolve() : dsLoadStatus();
  files.forEach(function(f){ chain = chain.then(function(){ return dsSyncFile(f, force).then(function(x){ done.push(x); }); }); });
  return chain.then(function(){
    DS.running = false; INS.loaded = {}; ST.carryFor = null;
    var ch = done.filter(function(x){ return x.result && (x.result.added || x.result.updated || x.result.removed); });
    if (!quiet || ch.length) toast(ch.length ? "Synced from Google Drive: " + ch.map(function(x){ var r = x.result; return x.file.name + " (" + [r.added ? r.added + " new" : "", r.updated ? r.updated + " changed" : "", r.removed ? r.removed + " removed" : ""].filter(Boolean).join(", ") + ")"; }).join("; ") + "." : "Google Drive: no changes since the last sync.", "ok");
    render();
  }, function(e){ DS.running = false; DS.err = e.message; if (!quiet) toast("Google Drive sync stopped: " + e.message, "err"); render(); });
}
/* opening the Sales Tracker or the Dashboard syncs, at most every 15 minutes */
function dsAuto(){
  dsSyncStore();
  if (!dsOn() || !stCan() || !stOnline() || DS.running || Date.now() - DS.lastAuto < 15*60*1000) return;
  DS.lastAuto = Date.now();
  setTimeout(function(){ dsSyncAll(false, true); }, 400);
}
/* a synced deal deleted in the tracker stays deleted, even though it's still in the Excel file */
function dsExclude(d){
  var fid = String(d && d.source || "").replace(/^drive:/, ""); if (!fid || !stOnline()) return Promise.resolve();
  var st = DS.status[fid] || {}, ex = (st.excluded || []).slice(); if (ex.indexOf(d.id) === -1) ex.push(d.id);
  st.excluded = ex; DS.status[fid] = st;
  return sb.from("sales_sync").upsert({ dealership_id:ST.store, file_id:fid, excluded:ex, modified_time:st.modified_time || null, synced_at:st.synced_at || new Date().toISOString(), synced_by:st.synced_by || "", result:st.result || null });
}
function dsLastSync(){ var t = 0; Object.keys(DS.status).forEach(function(k){ var x = Date.parse(DS.status[k].synced_at || ""); if (x > t) t = x; }); return t; }
function dsBanner(){
  if (!dsOn()) return "";
  dsAuto();
  var t = dsLastSync();
  return '<div class="ds-strip"><span class="ds-dot' + (DS.err ? " bad" : DS.running ? " run" : "") + '"></span><span>' + (DS.running ? "Syncing from Google Drive…" : DS.err ? "Google Drive sync stopped: " + esc(DS.err) :
    "Sales log from Google Drive (" + esc((dsCfg().files || []).map(function(f){ return f.name; }).join(", ")) + ")" + (t ? " · synced " + esc(new Date(t).toLocaleString("en-CA", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })) : "")) + '</span>' +
    (stCan() ? '<button type="button" class="ds-btn" data-ds="sync"' + (DS.running ? " disabled" : "") + '>Sync now</button>' : '') + '</div>';
}
/* ---- Dealership settings card (GM / Master) ---- */
function viewDriveSettings(){
  if (!V.isAdmin() || !state.config) return "";
  dsSyncStore();
  var c = dsCfg(), files = c.files || [];
  if (!DS.statusLoaded && stOnline() && !DS.loadingStatus){ DS.loadingStatus = true; dsLoadStatus().then(function(){ DS.loadingStatus = false; render(); }); }
  if (!DS.info && !DS.infoErr && stOnline() && !DS.infoLoading){ DS.infoLoading = true;
    dsCall({ action:"info", dealershipId:state.activeDealershipId }).then(function(r){ DS.infoLoading = false; DS.info = r; render(); }, function(e){ DS.infoLoading = false; DS.infoErr = e.notSetUp ? "notsetup" : e.message; render(); }); }
  var typeSel = function(cur, attr){ return '<select ' + attr + ' style="width:auto">' + [["auto","Work it out"],["New","New"],["Used","Used"]].map(function(o){ return '<option value="' + o[0] + '" ' + (cur === o[0] ? "selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select>'; };
  return '<div class="card" style="margin-top:16px"><div class="card-h"><h2>Google Drive sync</h2><div class="sp"><span class="tag ' + (c.on ? "ok" : "") + '">' + (c.on ? "On" : "Off") + '</span></div></div><div class="card-b">' +
    '<p class="muted small" style="max-width:82ch;margin-top:0">For stores that keep the sales log in Excel on Google Drive. While it\'s on, the Sales Tracker reads those files (read-only) so the Dashboard, the AI brief and the reports stay current while the Sales Managers keep using Excel. The Excel file is the source of truth: each sync adds new rows, updates changed ones and removes deals taken out of the file. It syncs when someone opens the Sales Tracker or Dashboard (at most every 15 minutes) or on Sync now. Turning it off keeps the data, and the tracker carries on from there.</p>' +
    (DS.infoErr === "notsetup" ? '<div class="notice warn">Google Drive sync isn\'t set up on the server yet: it needs a Google service account key (secret GOOGLE_SERVICE_ACCOUNT in Supabase).</div>' :
      DS.infoErr ? '<div class="notice warn">' + esc(DS.infoErr) + '</div>' :
      '<div class="notice info" style="margin-bottom:12px"><b>Step 1.</b> In Google Drive, share each Excel file with <b>' + esc(DS.info ? DS.info.email : "…") + '</b> as <b>Viewer</b>. <b>Step 2.</b> Paste the file\'s link below and say whether it\'s the New or the Used log.</div>') +
    '<label class="uc-feat ' + (c.on ? "on" : "") + '" style="max-width:420px"><span>Sync from Google Drive<small>' + files.length + ' file' + (files.length === 1 ? "" : "s") + '</small></span><span class="uc-sw"><input type="checkbox" data-dsf="on" ' + (c.on ? "checked" : "") + '><i></i></span></label>' +
    (files.length ? '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>File</th><th>New / Used</th><th>Last sync</th><th>Result</th><th></th></tr></thead><tbody>' +
      files.map(function(f, i){ var s = DS.status[f.id], r = s && s.result;
        return '<tr><td><b>' + esc(f.name) + '</b></td><td>' + typeSel(f.type || "auto", 'data-dsf="type" data-i="' + i + '"') + '</td><td class="nowrap small">' + (s ? esc(new Date(s.synced_at).toLocaleString("en-CA", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })) + (s.synced_by ? ' · ' + esc(s.synced_by) : '') : '<span class="muted">not yet</span>') + '</td>' +
          '<td class="small">' + (r ? r.deals + ' deals · ' + r.added + ' new · ' + r.updated + ' changed · ' + r.removed + ' removed' + (r.merged ? ' · ' + r.merged + ' re-logged rows merged' : '') + (r.skipped ? ' · ' + r.skipped + ' already typed in' : '') + ((s.excluded || []).length ? ' · ' + s.excluded.length + ' deleted here, kept out' : '') + (r.unreadable ? ' · ' + r.unreadable + ' without a readable date' : '') : '') + '</td>' +
          '<td class="right"><button type="button" class="btn sm ghost" data-ds="remove" data-i="' + i + '">Remove</button></td></tr>'; }).join("") + '</tbody></table></div>' : '') +
    '<div class="inline" style="margin-top:12px;align-items:flex-end"><label class="f" style="flex:2"><span>Google Drive link to an Excel sales log</span><input type="text" data-dsf="link" value="' + esc(DS.addLink) + '" placeholder="https://docs.google.com/spreadsheets/d/… or https://drive.google.com/file/d/…"></label>' +
      '<label class="f" style="flex:0 0 auto"><span>This file is</span>' + typeSel(DS.addType, 'data-dsf="addType"') + '</label>' +
      '<button type="button" class="btn primary" data-ds="add"' + (DS.adding ? " disabled" : "") + ' style="margin-bottom:12px">' + (DS.adding ? "Checking…" : "Add file") + '</button></div>' +
    (DS.msg ? '<div class="notice ' + DS.msg[0] + '">' + esc(DS.msg[1]) + '</div>' : '') +
    (c.on && files.length ? '<div style="margin-top:8px"><button type="button" class="btn" data-ds="sync"' + (DS.running ? " disabled" : "") + '>' + (DS.running ? "Syncing…" : "Sync now") + '</button>' + (DS.err ? ' <span class="small" style="color:var(--danger)">' + esc(DS.err) + '</span>' : '') + '</div>' : '') +
    (function(){ var al = (state.config && state.config.spAlias) || {}, ks = Object.keys(al); return ks.length ? '<div style="margin-top:12px"><b style="font-size:12.5px">Same salesperson, two spellings</b><div class="tiny muted" style="margin:2px 0 6px">Deals logged under the spelling on the left count for the name on the right.</div>' +
      ks.map(function(k){ return '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;padding:3px 0">' + esc(k) + ' → <b>' + esc(al[k]) + '</b><button type="button" class="btn sm" style="margin-left:auto" data-ds="unalias" data-k="' + esc(k) + '">Undo</button></div>'; }).join("") + '</div>' : ""; })() +
    '<p class="tiny muted" style="margin:12px 0 0">Tip: if a file\'s headings aren\'t recognised, import it once from Sales Tracker › Import (AI or matching by hand) with "Remember this layout" ticked; the sync then reads it the same way.</p>' +
    '</div></div>';
}
function dsSave(){ commit(); }
document.addEventListener("click", function(ev){
  var el = ev.target && ev.target.closest ? ev.target.closest("[data-ds]") : null; if (!el) return;
  ev.preventDefault();
  var a = el.getAttribute("data-ds"), c = state.config.driveSync = Object.assign({ on:false, files:[] }, state.config.driveSync || {});
  if (a === "sync"){ dsSyncAll(true, false); return; }
  if (a === "unalias"){ var ak = el.getAttribute("data-k"); state.config.spAlias = Object.assign({}, state.config.spAlias || {}); delete state.config.spAlias[ak]; C.saleSetAliases(state.config.spAlias); dsSave(); toast(ak + " counts on its own again.", "ok"); render(); return; }
  if (a === "remove"){ var f = c.files[Number(el.getAttribute("data-i"))]; if (!f) return;
    askConfirm("Stop syncing " + f.name + "?", "The deals already synced from it stay in the tracker. Add the file again to resume.", "Stop syncing", function(){ c.files.splice(c.files.indexOf(f), 1); dsSave(); toast("Removed " + f.name + " from the sync.", "ok"); }); return; }
  if (a === "add"){
    var id = dsFileId(DS.addLink);
    if (!id){ DS.msg = ["warn", "Paste the file's link from Google Drive (Share › Copy link)."]; render(); return; }
    if (c.files.some(function(x){ return x.id === id; })){ DS.msg = ["warn", "That file is already in the list."]; render(); return; }
    DS.adding = true; DS.msg = null; render();
    dsCall({ action:"check", dealershipId:state.activeDealershipId, fileId:id }).then(function(r){
      DS.adding = false;
      if (!/spreadsheet|excel|officedocument\.spreadsheetml|google-apps\.spreadsheet|csv/i.test(r.meta.mimeType)){ DS.msg = ["warn", r.meta.name + " isn't an Excel file or Google Sheet."]; render(); return; }
      c.files.push({ id:id, name:r.meta.name, type:DS.addType }); DS.addLink = ""; DS.msg = ["info", "Added " + r.meta.name + ". " + (c.on ? "Press Sync now to read it." : "Turn the sync on to start.")]; dsSave();
    }, function(e){ DS.adding = false; DS.msg = ["warn", e.message]; render(); });
  }
});
function dsField(ev){
  var el = ev.target; if (!el || !el.getAttribute) return; var k = el.getAttribute("data-dsf"); if (!k) return;
  var c = state.config.driveSync = Object.assign({ on:false, files:[] }, state.config.driveSync || {});
  if (k === "link"){ DS.addLink = el.value; return; }
  if (ev.type !== "change") return;
  if (k === "addType"){ DS.addType = el.value; return; }
  if (k === "on"){ c.on = !!el.checked; DS.lastAuto = 0; dsSave(); toast("Google Drive sync is " + (c.on ? "on" : "off") + ".", "ok"); return; }
  if (k === "type"){ var f = c.files[Number(el.getAttribute("data-i"))]; if (f){ f.type = el.value; DS.status[f.id] = Object.assign({}, DS.status[f.id] || {}, { modified_time:"" }); dsSave(); } }
}
document.addEventListener("input", dsField);
document.addEventListener("change", dsField);
