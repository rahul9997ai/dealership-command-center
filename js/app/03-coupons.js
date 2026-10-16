"use strict";
/* ---------------- COUPONS ----------------
   A one-sided DL coupon (210 × 99 mm, three to an A4 sheet) made from the customer's name, an
   amount and the products it applies to. Nothing is saved: the code is random each time and
   only the product list is kept, shared by everyone at the store. Colours, name and address
   come from the dealership the coupon is made in; the artwork is drawn here, no logos. */
var COUPON_DEFAULT_PRODUCTS = ["Lease-End Waiver", "Winter Guard (Rust Inhibition)", "Platinum Service Contract"];
var COUPON_HEADLINES = { lease:"On your lease", purchase:"On your purchase", vehicle:"On your new vehicle", finance:"On your financing" };
var COUPON_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function couponProducts(){ var l = state.config && state.config.couponProducts; return Array.isArray(l) ? l : COUPON_DEFAULT_PRODUCTS.slice(); }
function couponCode(){
  var words = String((state.config && state.config.name) || "AX").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  var pre = words.map(function(w){ return w.charAt(0); }).join("").slice(0, 3) || "AX";
  var r = new Uint32Array(8);
  try { window.crypto.getRandomValues(r); } catch (e) { for (var k = 0; k < 8; k++) r[k] = Math.floor(Math.random() * 1e9); }
  var part = function(o){ var s = ""; for (var i = 0; i < 4; i++) s += COUPON_CHARS.charAt(r[o + i] % COUPON_CHARS.length); return s; };
  return pre + "-" + part(0) + "-" + part(4);
}
function couponState(){
  var cp = state.ui.coupon;
  if (!cp || cp.dealershipId !== state.activeDealershipId){
    cp = state.ui.coupon = { dealershipId:state.activeDealershipId, name:"", amount:"", headline:"lease", chosen:{}, expiry:C.todayISO(), copies:1, code:couponCode(), adding:"" };
  }
  return cp;
}
function couponAmount(cp){ var n = parseFloat(String(cp.amount || "").replace(/[$,\s]/g, "")); return isNaN(n) || n <= 0 ? null : n; }
function couponArt(ink){
  /* A glass storefront: sky, curtain wall with a soft reflection, dark fascia with a brand stripe, pavement. */
  return `<svg viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="cpSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfdcea"/><stop offset="1" stop-color="#eef2f7"/></linearGradient>
      <linearGradient id="cpGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a9bcd2"/><stop offset=".45" stop-color="#6d839e"/><stop offset="1" stop-color="#3b4a5e"/></linearGradient>
      <linearGradient id="cpRefl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <rect width="200" height="110" fill="url(#cpSky)"/>
    <path d="M0 26 L200 10 L200 110 L0 110 Z" fill="${ink.dk}"/>
    <path d="M0 38 L200 24 L200 110 L0 110 Z" fill="url(#cpGlass)"/>
    <g stroke="#e8eef5" stroke-opacity=".55" stroke-width=".9"><path d="M0 64 L200 54"/><path d="M0 90 L200 84"/>
      <path d="M30 36 L30 110"/><path d="M62 34 L62 110"/><path d="M94 31 L94 110"/><path d="M126 29 L126 110"/><path d="M158 27 L158 110"/><path d="M190 25 L190 110"/></g>
    <path d="M44 110 L104 32 L140 29 L80 110 Z" fill="url(#cpRefl)"/>
    <path d="M0 31 L200 16 L200 19 L0 34 Z" fill="${ink.hl}"/>
  </svg>`;
}
function couponIcon(n){
  var p = { shield:'<path d="M12 3l7.5 2.8v5.6c0 4.6-3.2 8.3-7.5 10-4.3-1.7-7.5-5.4-7.5-10V5.8z"/><path d="M8.8 12l2.3 2.3 4.2-4.4"/>',
    car:'<path d="M4.5 15.5l1.6-5c.4-1.2 1.4-2 2.7-2h6.4c1.3 0 2.3.8 2.7 2l1.6 5"/><rect x="3" y="15" width="18" height="4" rx="1.2"/><path d="M6 19v1.5M18 19v1.5"/>',
    tools:'<path d="M14.7 6.3a4 4 0 005 5L13 18l-3-3z"/><path d="M4 20l6-6"/><path d="M4 4l5 5"/>' }[n];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}
/* Coupon colours from the dealership: the darker brand colour for the name and text (kept readable
   on white), the vivid one for accents, and the band gradient. */
function couponInk(){
  var ink = V.brandInk(), W = "#ffffff", K = "#0a1220";
  var dk = V.hexLum(ink.main) <= V.hexLum(ink.accent) ? ink.main : ink.accent;
  dk = V.readableOn(dk, W, 7, K);
  return { dk:dk, hl:ink.hue, a:ink.bandA, b:ink.bandB };
}
function couponHtml(cp){
  var cfg = state.config, b = V.brand(), ink = couponInk();
  var amt = couponAmount(cp), list = couponProducts().filter(function(p){ return cp.chosen[p]; });
  var amtTxt = amt === null ? "$—" : (Math.round(amt) === amt ? money0(amt) : money(amt));
  var today = C.todayISO(), exp = cp.expiry || today;
  var dealer = String(cfg.name || b.label);
  var addr = [cfg.address, cfg.city].filter(Boolean).join(", ");
  var plist = list.length ? list : ["Select a product"];
  var pSize = plist.length <= 3 ? 3 : plist.length === 4 ? 2.5 : 2.1;
  var logo = cfg.logo && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(cfg.logo) ? cfg.logo : null;
  var name = String(cp.name || "").trim();
  var nSize = name.length > 22 ? 7.2 : name.length > 16 ? 8.6 : 10;
  return `<div class="cp" style="--cp-dk:${ink.dk};--cp-hl:${ink.hl};--cp-a:${ink.a};--cp-b:${ink.b}">
    <div class="cp-hdr">${logo ? `<img class="cp-logo" src="${esc(logo)}" alt="">` : ""}
      <div class="cp-dn ${logo ? "" : "solo"}"><b>${esc(dealer)}</b><span>${esc(b.finLabel || b.label)}</span></div>
      <div class="cp-cd"><span>Coupon code</span><b>${esc(cp.code)}</b></div></div>
    <div class="cp-art">${couponArt(ink)}</div>
    <div class="cp-h1">Congratulations</div>
    <div class="cp-nm" style="font-size:${nSize}mm">${esc(name || "Customer name")}</div>
    <div class="cp-h2">${esc(COUPON_HEADLINES[cp.headline] || COUPON_HEADLINES.lease)} — <b>${esc(dealer)}</b> has you covered</div>
    <div class="cp-band"><span class="cp-amt">${esc(amtTxt)}</span><span class="cp-off">Off</span><span class="cp-vr"></span>
      <div class="cp-pl" style="font-size:${pSize}mm">${plist.map(function(p){ return `<div>${esc(p)}</div>`; }).join("")}</div>
      <div class="cp-valid">${exp === today ? "Valid today only" : "Valid until"}<br>${esc(C.fmtDate(exp))}</div></div>
    <div class="cp-ben"><div>${couponIcon("shield")}Protect your investment</div><div>${couponIcon("car")}Enjoy peace of mind</div><div>${couponIcon("tools")}Drive with confidence</div></div>
    <div class="cp-sign"><div><b>${esc(name)}</b>Customer name</div><div>Manager signature</div><div><b>${esc(C.fmtDate(today))}</b>Date</div></div>
    <div class="cp-ft">${esc([dealer, addr, cfg.phone].filter(Boolean).join(" · "))}</div>
  </div>`;
}
function couponSheet(cp){
  var n = cp.copies === 3 ? 3 : 1, out = "";
  for (var i = 0; i < n; i++) out += couponHtml(cp) + `<div class="cp-cut"><span>✂</span></div>`;
  return `<div class="cp-sheet">${out}</div>`;
}
function viewCoupons(){
  var cp = couponState(), list = couponProducts(), amt = couponAmount(cp);
  var picked = list.filter(function(p){ return cp.chosen[p]; }).length;
  var ready = amt !== null && picked > 0;
  var prods = list.map(function(p, i){ var on = !!cp.chosen[p];
    return `<div class="cpf-prod ${on ? "on" : ""}"><label><input type="checkbox" data-act="cp-pick" data-idx="${i}" ${on ? "checked" : ""}><span>${esc(p)}</span></label>
      <button type="button" class="cpf-x" data-act="cp-remove" data-idx="${i}" title="Remove from the list" aria-label="Remove ${esc(p)}">✕</button></div>`; }).join("");
  return `<div class="cp-page">
    <div class="card"><div class="card-h"><h2>Create a coupon</h2></div><div class="card-b">
      <label class="f"><span>Customer name</span><input type="text" data-cp="name" value="${esc(cp.name)}" placeholder="e.g. Jordan Lee" autocomplete="off"></label>
      <div class="cpf-row">
        <label class="f"><span>Amount off</span><div class="ca-in"><i>$</i><input type="text" inputmode="decimal" data-cp="amount" value="${esc(cp.amount)}" placeholder="250" autocomplete="off"></div></label>
        <label class="f"><span>Headline</span><select data-cp="headline">${Object.keys(COUPON_HEADLINES).map(function(k){
          return `<option value="${k}" ${cp.headline === k ? "selected" : ""}>Congratulations ${esc(COUPON_HEADLINES[k].toLowerCase())}</option>`; }).join("")}</select></label>
      </div>
      <div class="f"><span>Products on the coupon</span>
        <div class="cpf-prods">${prods || `<div class="tiny muted">No products yet. Add one below.</div>`}</div>
        <div class="cpf-add"><input type="text" data-cp="adding" value="${esc(cp.adding || "")}" placeholder="Add a product, e.g. Tire &amp; Rim Protection" autocomplete="off" maxlength="60">
          <button type="button" class="btn sm" data-act="cp-add">Add</button></div>
        <small class="muted tiny">The list is shared by everyone at ${esc(state.config.name)}. Tick the ones for this coupon.</small></div>
      <div class="cpf-row">
        <label class="f"><span>Valid until</span><input type="date" data-cp="expiry" value="${esc(cp.expiry)}" min="${C.todayISO()}">
          <small class="muted tiny">${cp.expiry === C.todayISO() ? "Today only (the default)." : `<a href="#" data-act="cp-today">Back to today only</a>`}</small></label>
        <label class="f"><span>Print</span><div class="ca-seg two">
          <button class="btn ${cp.copies !== 3 ? "on" : ""}" data-act="cp-copies" data-n="1">1 coupon</button>
          <button class="btn ${cp.copies === 3 ? "on" : ""}" data-act="cp-copies" data-n="3">3 per sheet</button></div></label>
      </div>
      <div class="cpf-code"><span class="muted small">Coupon code</span><b>${esc(cp.code)}</b><button type="button" class="btn sm" data-act="cp-newcode">New code</button></div>
      <div class="cpf-go">
        <button type="button" class="btn" data-act="cp-clear">Start over</button>
        <button type="button" class="btn primary" data-act="cp-print" ${ready ? "" : "disabled"}>Print coupon</button></div>
      ${ready ? "" : `<div class="tiny muted" style="text-align:right;margin-top:6px">Enter an amount and tick at least one product to print.</div>`}
    </div></div>
    <div class="card cp-prev-card"><div class="card-h"><h2>Preview</h2><div class="sp"><span class="muted small">DL size · 210 × 99 mm · prints on A4</span></div></div>
      <div class="card-b"><div class="cp-prev">${couponHtml(cp)}</div></div></div>
  </div>`;
}

