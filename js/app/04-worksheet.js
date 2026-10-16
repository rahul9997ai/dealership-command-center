"use strict";
/* ---------------- WORKSHEET ----------------
   The salesperson's Purchase Proposal: a blank two-page form (front + Deal summary back) printed
   for the sales floor. Nothing is filled in or saved here; the dealership's name, address, logo and
   brand colours come from Dealership settings. */
var WS_FEES = [["Security & safety package", 599], ["Tire & road hazard", 799], ["Air tax & OTSF", null], ["OMVIC fee", null], ["", null], ["", null]];
var WS_ACCEPT = "By signing, I/we confirm the vehicle and the terms marked on this proposal (both sides) and ask the dealer to proceed with the purchase. I/We understand this proposal is <b>not a bill of sale</b>: the final price, payment, rate, term and any products are confirmed with the Finance Manager and set out in the bill of sale, and payments are subject to lender approval. Only the bill of sale signed by me/us and the dealer is the binding contract; it will show the all-in price with every fee itemized, plus HST and licensing. Any deposit paid is refundable if a bill of sale is not signed. Changes to this proposal are valid only if initialled by me/us and the dealer.";
function wsHeader(title, page){
  var cfg = state.config, b = V.brand();
  var logo = cfg.logo && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(cfg.logo) ? cfg.logo : null;
  var addr = [[cfg.address, cfg.city].filter(Boolean).join(", "), cfg.phone].filter(Boolean).join(" · ");
  return `<div class="ws-hd">
      <div class="ws-brand">${logo ? `<img class="ws-logo" src="${esc(logo)}" alt="">` : ""}
        <div><div class="ws-dn">${esc(cfg.name || b.label)}</div><div class="ws-addr">${esc(addr)}</div></div></div>
      <div class="ws-ttl"><b>${esc(title)}</b><span>Page ${page} of 2</span></div></div>
    <div class="ws-rule"></div>`;
}
function wsFront(){
  var cfg = state.config;
  var fees = WS_FEES.map(function(f){
    return `<tr class="ws-inc"><td>${f[0] ? esc(f[0]) : `<i class="ws-wl"></i>`}</td><td class="ws-a">${f[1] === null ? "" : money(f[1])}</td></tr>`; }).join("");
  var opt = function(kind, n){
    var lease = kind === "Lease";
    return `<div class="ws-op ${lease ? "ls" : ""}"><div class="ws-oph">${kind} option ${n}<span class="ws-pk"></span></div>
      <div class="ws-opb"><div class="ws-d">Term ____ mo · Down $________${lease ? "<br>________ km / year" : ""}</div>
        <div class="ws-pl"><b>$</b><i></i><small>per ☐ mo ☐ 2 wks</small></div></div></div>`; };
  return `<div class="ws-sheet">${wsHeader("Purchase Proposal", 1)}
    <div class="ws-meta"><div class="ws-box"><span>Date</span></div><div class="ws-box"><span>Sales consultant</span></div><div class="ws-box"><span>DMS #</span></div></div>
    <div class="ws-hero">
      <div class="ws-cu"><div class="ws-lbl">Prepared for</div><div class="ws-wline"></div>
        <div class="ws-sm">Address ________________________________<br>Phone ______________ Email ______________</div>
        <div class="ws-chips"><span>☐ 1st time</span><span>☐ Be-back</span><span>☐ Repeat</span><span>☐ Referral</span><span>☐ Test drive</span></div></div>
      <div class="ws-ve"><div class="ws-lbl">Your vehicle · ☐ New ☐ Used</div><div class="ws-wline"></div>
        <div class="ws-sm">Model code ________ Colours ________________ Stock ________</div>
        <div class="ws-chips"><span>3 Yr Basic Limited Warranty</span><span>5 Yr Basic Powertrain Warranty</span></div></div></div>
    <div class="ws-cols">
      <div>
        <div class="ws-sec">Price</div>
        <table class="ws-p">
          <tr><td>MSRP</td><td class="ws-a"></td></tr><tr><td>Options</td><td class="ws-a"></td></tr><tr><td>Freight &amp; PDI</td><td class="ws-a"></td></tr>
          <tr class="ws-h2"><td colspan="2">Dealer-installed options &amp; fees</td></tr>${fees}
          <tr class="ws-st"><td>All-in price</td><td class="ws-a"></td></tr>
          <tr><td>Trade-in allowance</td><td class="ws-a">−</td></tr><tr><td>Lien payout</td><td class="ws-a"></td></tr>
          <tr><td>HST (${esc(cfg.tax && cfg.tax.standard != null ? cfg.tax.standard : 13)}%)</td><td class="ws-a"></td></tr><tr><td>Licensing</td><td class="ws-a"></td></tr>
          <tr><td>Cash down</td><td class="ws-a">−</td></tr></table>
        <div class="ws-bal"><span>Balance</span><b>$</b></div>
        <div class="ws-trade"><div class="ws-sec" style="margin:0">Trade-in</div>
          <div class="ws-tg"><div><span>Year · make · model</span><b></b></div><div><span>Kilometres</span><b></b></div>
            <div><span>VIN</span><b></b></div><div><span>Colour</span><b></b></div>
            <div><span>Lien holder</span><b></b></div><div><span>Lien amount $</span><b></b></div></div>
          <div class="ws-yn"><span>Accident <em>Yes</em><em>No</em></span><span>Ext. warranty <em>Yes</em><em>No</em></span><span>Protection <em>Yes</em><em>No</em></span></div></div>
      </div>
      <div>
        <div class="ws-sec">Your options</div>
        <div class="ws-ops">${opt("Finance", 1)}${opt("Finance", 2)}${opt("Lease", 1)}${opt("Lease", 2)}</div>
        <div class="ws-howto">Payments include HST, on approved credit. Tick the option you'd like and initial: ________</div>
        <div class="ws-notes"><div class="ws-sec">Notes</div><div class="ws-ln"></div><div class="ws-ov">Final agreed terms are recorded on page 2</div></div>
      </div></div>
    <div class="ws-acc"><h4>Acceptance of terms</h4><p>${WS_ACCEPT}</p></div>
    <div class="ws-sig"><div>Customer signature</div><div>Sales consultant</div><div>Sales manager</div><div>Date</div></div>
    <div class="ws-ft"><span>${esc(cfg.name || "")}</span><span>Rates subject to lender approval</span></div></div>`;
}
function wsBack(){
  var cfg = state.config;
  return `<div class="ws-sheet">${wsHeader("Deal Summary", 2)}
    <div class="ws-meta"><div class="ws-box"><span>Customer</span></div><div class="ws-box"><span>Vehicle · stock #</span></div><div class="ws-box"><span>DMS #</span></div></div>
    <div class="ws-sec" style="margin-top:12pt">Notes</div><div class="ws-plain"></div>
    <div class="ws-final"><h4>Final agreed terms</h4>
      <div class="ws-fg"><div><span>All-in price $</span><b></b></div><div><span>Trade allowance $</span><b></b></div><div><span>Down payment $</span><b></b></div><div><span>Balance $</span><b></b></div>
        <div><span>Payment $</span><b></b></div><div><span>Term (months)</span><b></b></div><div><span>Frequency</span><b></b></div><div><span>Lease km / yr</span><b></b></div></div>
      <div class="ws-ch">Based on: ☐ Finance option 1 &nbsp; ☐ Finance option 2 &nbsp; ☐ Lease option 1 &nbsp; ☐ Lease option 2</div></div>
    <div class="ws-acc"><h4>Acceptance of terms</h4><p>${WS_ACCEPT.replace("the vehicle and the terms marked on this proposal (both sides)", "the vehicle and the final agreed terms above")}</p></div>
    <div class="ws-sig"><div>Customer signature</div><div>Sales consultant</div><div>Sales manager</div><div>Date · time</div></div>
    <div class="ws-ft"><span>${esc(cfg.name || "")}</span><span>Page 2 of 2 · Read together with page 1</span></div></div>`;
}
function wsDoc(){ var ink = couponInk(); return `<div class="ws-doc" style="--ws-dk:${ink.dk};--ws-hl:${ink.hl};--ws-a:${ink.a};--ws-b:${ink.b}">${wsFront()}${wsBack()}</div>`; }
/* Print from a hidden frame holding only the two sheets: none of the app's own print rules or overlays
   can add a page, whatever the browser or printer. */
function wsPrint(title){
  var css = [];
  Array.prototype.forEach.call(document.styleSheets, function(sh){
    try { Array.prototype.forEach.call(sh.cssRules, function(r){ if (/\.ws-|@page ws/.test(r.cssText) && !/#overlay|modal/.test(r.cssText)) css.push(r.cssText); }); } catch (e) {}
  });
  var fonts = Array.prototype.map.call(document.querySelectorAll('link[href*="fonts.googleapis.com"]'), function(l){ return l.outerHTML; }).join("");
  var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title>' + fonts +
    '<style>@page{size:letter;margin:0}html,body{margin:0;padding:0;background:#fff}' + css.join("\n") +
    '.ws-sheet{height:10.95in;box-shadow:none;border-radius:0}.ws-sig{margin-top:12pt}</style></head><body>' + wsDoc() + '</body></html>';
  var old = document.getElementById("ws-print-frame"); if (old) old.remove();
  var fr = document.createElement("iframe");
  fr.id = "ws-print-frame"; fr.setAttribute("aria-hidden", "true"); fr.tabIndex = -1;
  fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(fr);
  var doc = fr.contentDocument; doc.open(); doc.write(html); doc.close();
  var imgs = Array.prototype.map.call(doc.images, function(i){ return i.decode ? i.decode().catch(function(){}) : null; });
  var fontsReady = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
  Promise.all(imgs.concat([fontsReady])).then(function(){
    setTimeout(function(){
      try { fr.contentWindow.focus(); fr.contentWindow.print(); }
      catch (e) { toast("The browser blocked printing. Try again, or use your browser's Print command.","err"); }
    }, 150);
  });
}
function viewWorksheet(){
  var hasLogo = !!(state.config.logo && /^data:image\//.test(state.config.logo));
  return `<div class="card"><div class="card-h"><h2>Purchase Proposal worksheet</h2>
      <div class="sp"><button class="btn primary" data-act="ws-print">Print worksheet</button></div></div>
    <div class="card-b">
      <p class="muted small" style="margin:0 0 6px;max-width:80ch">A blank two-page form for the sales floor: the proposal on the front and the deal summary on the back. Print it <strong>double-sided on letter paper</strong>. Nothing is saved.</p>
      ${hasLogo ? "" : `<div class="notice info" style="margin:8px 0 0">No dealership logo yet, so the worksheet shows the dealership name on its own. ${V.isAdmin() ? `Upload one in <a href="#" data-act="route" data-route="settings">Dealership settings</a>.` : "Your General Manager can upload one in Dealership settings."}</div>`}
      <div class="ws-prev">${wsDoc()}</div></div></div>`;
}

