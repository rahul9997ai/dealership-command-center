"use strict";
/* ---------------- SALESPERSON PHOTOS · IMPORT FROM A STAFF PAGE ----------------
   General Manager (or Master) only. Paste the link to the dealership's "meet our team" page: the staff-photos
   function reads the page (server side, public pages only) and lists its pictures with the words around each.
   The app proposes which picture belongs to which salesperson on the Targets roster; the GM reviews every
   match (change it, untick it) before anything is saved. Saved photos are the same 320 px squares as photos
   added by hand (config.spPhotos). */
var PH = { open:false, url:"", busy:false, saving:false, err:null, images:null, page:"", rows:{}, chooser:null };
function phCan(){ return V.isAdmin() && stOnline(); }
function phCall(body){
  return sb.auth.getSession().then(function(r){
    var sess = r.data && r.data.session; if (!sess) throw new Error("You're signed out. Sign in again.");
    body.dealershipId = ST.store;
    return fetch(SB_URL + "/functions/v1/staff-photos", { method:"POST", headers:{ "Content-Type":"application/json", "apikey":SB_KEY, "Authorization":"Bearer " + sess.access_token }, body:JSON.stringify(body) });
  }).then(function(res){ return res.json().then(function(j){ if (!res.ok || j.error) throw new Error(j.error || ("Error " + res.status)); return j; }); });
}
function phWords(s){ return " " + String(s || "").toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/[-']/g, "").replace(/\s+/g, " ").trim() + " "; }
/* how well one picture fits one salesperson: the name in the picture's own alt text / file name beats a name in the
   text after it (captions), which beats a name in the text before it. Needs every word of the roster name. */
function phScore(name, im){
  var toks = phWords(name).trim().split(" ").filter(function(t){ return t.length >= 2; });
  if (!toks.length) return 0;
  var has = function(text){ var w = phWords(text); return toks.every(function(t){ return w.indexOf(" " + t + " ") >= 0; }); };
  if (has(im.alt + " " + im.file)) return 30;
  if (has(im.after)) return 20;
  if (has(im.before)) return 8;
  return 0;
}
function phRoster(){ var seen = {}; return (stDraft().people || []).map(function(p){ return stKey(p.name || ""); }).filter(function(n){ if (!n || seen[n] || /^(HOUSE|MOBILE)/.test(n)) return false; seen[n] = 1; return true; }); }
function phMatch(){
  var ims = PH.images || [], roster = phRoster(), best = {};
  roster.forEach(function(n){
    var sc = ims.map(function(im, i){ return { i:i, s:phScore(n, im) }; }).filter(function(x){ return x.s > 0; }).sort(function(a, b){ return b.s - a.s; });
    best[n] = sc;
  });
  PH.rows = {};
  roster.forEach(function(n){
    var sc = best[n], top = sc[0], tie = top && sc[1] && sc[1].s === top.s;
    /* a picture claimed more strongly by another person is not offered */
    var taken = top && roster.some(function(o){ return o !== n && best[o][0] && best[o][0].i === top.i && best[o][0].s > top.s; });
    PH.rows[n] = { pick:top && !taken ? top.i : null, use:!!(top && !taken && !tie && top.s >= 20), note:top && !taken ? (tie ? "Several pictures could fit — check this one." : top.s < 20 ? "Weak match — check it." : "") : "" };
  });
}
function phThumb(im, size){
  return '<img class="st-phimg" src="' + esc(im.src) + '" alt="' + esc(im.alt || im.file || "") + '" referrerpolicy="no-referrer" loading="lazy" style="width:' + size + 'px;height:' + size + 'px" onerror="this.style.visibility=\'hidden\'">';
}
function phCard(){
  if (!PH.open || !phCan()) return "";
  var roster = phRoster(), ims = PH.images, n = 0;
  if (ims) roster.forEach(function(r){ if (PH.rows[r] && PH.rows[r].use && PH.rows[r].pick !== null) n++; });
  var head = '<div class="st-ch"><span class="st-ico b">▣</span><h3>Import photos from a staff page<small>General Manager only · you review every match before it is saved</small></h3><button type="button" class="btn sm ghost" data-st="phclose">Close</button></div>';
  var form = '<div class="st-ph-form"><input class="st-tin" style="flex:1 1 280px;text-align:left" data-stf="phUrl" value="' + esc(PH.url) + '" placeholder="https://yourdealership.ca/meet-our-team" inputmode="url" autocomplete="off">' +
    '<button type="button" class="btn sm primary" data-st="phscan"' + (PH.busy || PH.saving ? " disabled" : "") + '>' + (PH.busy ? "Reading the page…" : ims ? "Read again" : "Find photos") + '</button></div>';
  var info = '<div class="st-ph-note">Use the dealership\'s own staff page and only photos you have permission to show on the Showroom TV. Pages that build themselves in the browser (the staff only appear after loading) can come up empty — upload those photos with the ＋ button instead.</div>';
  var err = PH.err ? '<div class="st-warn" style="margin:8px 14px 0">' + esc(PH.err) + '</div>' : '';
  var body = "";
  if (ims){
    if (!ims.length) body = '<div class="st-empty" style="padding:14px">No pictures were found on that page.</div>';
    else if (!roster.length) body = '<div class="st-empty" style="padding:14px">Add your salespeople to the roster first, then read the page again.</div>';
    else {
      body = '<div class="st-tw"><table><thead><tr><th class="l">Salesperson</th><th>Now</th><th>Found on the page</th><th>Use</th></tr></thead><tbody>' + roster.map(function(r){
        var row = PH.rows[r] || { pick:null, use:false, note:"" }, im = row.pick !== null ? ims[row.pick] : null;
        return '<tr><td class="l"><b>' + esc(r) + '</b></td><td>' + stPortrait(r, 40) + '</td><td>' +
          (im ? '<span class="st-phrow">' + phThumb(im, 56) + '</span>' : '<span style="color:var(--muted);font-size:12px">No match found</span>') +
          ' <button type="button" class="btn sm ghost" data-st="phchoose" data-v="' + esc(r) + '">' + (im ? "Change" : "Pick one") + '</button>' +
          (row.note ? '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + esc(row.note) + '</div>' : '') + '</td>' +
          '<td><input type="checkbox" data-stf="phUse:' + esc(r) + '"' + (row.use && im ? " checked" : "") + (im ? "" : " disabled") + ' aria-label="Use this photo for ' + esc(r) + '"></td></tr>' +
          (PH.chooser === r ? '<tr><td colspan="4" style="background:var(--surface-2)"><div style="font-size:11.5px;color:var(--muted);margin-bottom:6px">Click the picture that is ' + esc(r) + ':</div><div class="st-phgrid">' +
            ims.slice(0, 80).map(function(x, i){ return '<button type="button" class="st-phpick' + (row.pick === i ? " on" : "") + '" data-st="phset" data-v="' + i + '" title="' + esc(x.alt || x.file || "") + '">' + phThumb(x, 64) + '</button>'; }).join("") +
            '</div><button type="button" class="btn sm ghost" data-st="phnone" data-v="' + esc(r) + '" style="margin-top:6px">No photo for ' + esc(r) + '</button></td></tr>' : '');
      }).join("") + '</tbody></table></div>' +
        '<div class="st-note" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button type="button" class="btn sm primary" data-st="phsave"' + (n && !PH.saving ? "" : " disabled") + '>' + (PH.saving ? "Saving…" : "Save " + n + " photo" + (n === 1 ? "" : "s")) + '</button><span>' + ims.length + ' pictures found on the page. Saved photos replace the ones shown under “Now”.</span></div>';
    }
  }
  return '<div class="st-card st-phimport">' + head + form + info + err + body + '</div>';
}
/* square-crop and shrink to 320 px (same as a photo picked by hand) */
function phCrop(dataUrl){
  return new Promise(function(ok, bad){
    var img = new Image();
    img.onload = function(){
      var side = Math.min(img.width, img.height), c = document.createElement("canvas"); c.width = c.height = 320;
      var sx = (img.width - side)/2, sy = img.height > img.width ? Math.max(0, (img.height - side)*0.2) : (img.height - side)/2;
      c.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, 320, 320); ok(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = function(){ bad(new Error("A picture couldn't be read.")); };
    img.src = dataUrl;
  });
}
function phSave(){
  var jobs = phRoster().filter(function(r){ var w = PH.rows[r]; return w && w.use && w.pick !== null; });
  if (!jobs.length || PH.saving) return;
  PH.saving = true; PH.err = null; render();
  var got = {}, failed = [];
  jobs.reduce(function(p, r){
    return p.then(function(){ return phCall({ action:"image", url:PH.images[PH.rows[r].pick].src }).then(function(j){ return phCrop(j.dataUrl); }).then(function(d){ got[r] = d; }, function(){ failed.push(r); }); });
  }, Promise.resolve()).then(function(){
    var names = Object.keys(got);
    if (names.length){ state.config.spPhotos = Object.assign({}, state.config.spPhotos || {}, got); commit(); }
    PH.saving = false;
    if (failed.length) PH.err = "Couldn't download the picture for " + failed.join(", ") + ". Upload those with the ＋ button instead.";
    if (names.length) toast(names.length + " photo" + (names.length === 1 ? "" : "s") + " saved.", "ok");
    if (names.length && !failed.length){ PH.open = false; PH.images = null; PH.rows = {}; PH.chooser = null; }
    render();
  });
}
function phAct(act, el){
  var v = el.getAttribute("data-v");
  switch (act){
    case "phopen": PH.open = true; PH.err = null; render(); return true;
    case "phclose": PH.open = false; PH.chooser = null; render(); return true;
    case "phscan":
      if (!PH.url.trim()){ PH.err = "Paste the link to your staff page first."; render(); return true; }
      PH.busy = true; PH.err = null; PH.chooser = null; render();
      phCall({ action:"scan", url:PH.url.trim() }).then(function(j){
        PH.busy = false; PH.images = j.images || []; PH.page = j.page || ""; phMatch();
        if (PH.images.length && !phRoster().length) PH.err = "There are no salespeople on the roster yet.";
        render();
      }, function(e){ PH.busy = false; PH.err = e.message; render(); });
      return true;
    case "phchoose": PH.chooser = PH.chooser === v ? null : v; render(); return true;
    case "phset": { var r = PH.chooser; if (r && PH.rows[r]){ PH.rows[r].pick = Number(v); PH.rows[r].use = true; PH.rows[r].note = ""; PH.chooser = null; } render(); return true; }
    case "phnone": if (PH.rows[v]){ PH.rows[v].pick = null; PH.rows[v].use = false; PH.rows[v].note = ""; } PH.chooser = null; render(); return true;
    case "phsave": phSave(); return true;
  }
  return false;
}
function phField(k, el, ev){
  if (k === "phUrl"){ PH.url = el.value; return; }
  if (k.indexOf("phUse:") === 0){ if (ev.type !== "change") return; var r = k.slice(6); if (PH.rows[r]) PH.rows[r].use = !!el.checked; render(); }
}
