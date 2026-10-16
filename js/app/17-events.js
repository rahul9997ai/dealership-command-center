"use strict";
/* ---------------- EVENTS ---------------- */
/* Cash Conversion fields update the comparison as the FM types (lightly debounced). */
var caTimer = null;
function caFieldEvent(ev){
  var el = ev.target, k = el && el.getAttribute && el.getAttribute("data-ca");
  if (!k || !caState) return;
  caState[k] = el.value;
  clearTimeout(caTimer);
  if (el.tagName === "SELECT") render(); else caTimer = setTimeout(render, 220);
}
document.addEventListener("input", caFieldEvent);
/* Coupon fields: the preview follows as the Finance Manager types. */
var cpTimer = null;
function cpFieldEvent(ev){
  var el = ev.target, k = el && el.getAttribute && el.getAttribute("data-cp");
  if (!k || !state.ui.coupon) return;
  state.ui.coupon[k] = el.value;
  if (k === "expiry" && (!el.value || el.value < C.todayISO())) state.ui.coupon.expiry = C.todayISO();
  if (k === "adding") return;
  clearTimeout(cpTimer);
  if (el.tagName === "SELECT" || el.type === "date") render(); else cpTimer = setTimeout(render, 200);
}
document.addEventListener("input", cpFieldEvent);
document.addEventListener("change", cpFieldEvent);
document.addEventListener("keydown", function(ev){
  if (ev.key === "Enter" && ev.target && ev.target.getAttribute && ev.target.getAttribute("data-cp") === "adding"){ ev.preventDefault(); couponAddProduct(); }
});
/* The shared product list lives on the dealership. A General Manager or Master saves it like any
   setting; a Finance Manager saves only this list, through set_coupon_products (database rules
   don't let them change the rest of the dealership). */
function couponSaveList(list){
  state.config.couponProducts = list;
  if (V.isAdmin() || !sb){ commit(); return; }
  cloud.snap.d[state.config.id] = JSON.stringify(state.config);
  commit();
  sb.rpc("set_coupon_products", { p_products: list }).then(function(r){
    if (r && r.error) toast("Couldn't save the product list: " + r.error.message, "err");
  });
}
function couponAddProduct(){
  var cp = couponState(), name = String(cp.adding || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) return;
  var list = couponProducts().slice();
  var same = list.filter(function(x){ return x.toLowerCase() === name.toLowerCase(); })[0];
  if (same){ cp.chosen[same] = true; cp.adding = ""; commit(); return; }
  if (list.length >= 30){ toast("The list holds up to 30 products. Remove one first.", "err"); commit(); return; }
  list.push(name); cp.chosen[name] = true; cp.adding = "";
  couponSaveList(list);
}
document.addEventListener("change", caFieldEvent);
document.addEventListener("change", function(ev){
  var el = ev.target, k = el && el.getAttribute && el.getAttribute("data-carate");
  if (!k || !state.config) return;
  var r = Object.assign({}, state.config.caRates || {}), v = caNum(el.value);
  if (v === null || v < 0) delete r[k]; else r[k] = v;
  state.config.caRates = r; commit();
});
document.addEventListener("input", function(ev){
  if (ev.target && ev.target.id === "giftCostInput" && state.ui.giftEdit){ state.ui.giftEdit.cost = ev.target.value; }
  if (ev.target && ev.target.id === "giftNameInput" && state.ui.giftEdit){
    state.ui.giftEdit.name = ev.target.value;
    var gdb = document.querySelector("[data-act=gift-done]");
    if (gdb) gdb.disabled = !ev.target.value.trim() || !(state.ui.giftEdit.mode === "all" || state.ui.giftEdit.pk.preferred || state.ui.giftEdit.pk.essential || state.ui.giftEdit.pk.basic);
  }
  if (ev.target && ev.target.id === "pwResetVal" && state.ui.pwReset) state.ui.pwReset.value = ev.target.value;
});
document.addEventListener("keydown", function(ev){
  if (ev.key === "Enter" && ev.target && (ev.target.id === "loginEmail" || ev.target.id === "loginPassword")){
    ev.preventDefault(); doLogin();
  }
  if (ev.key === "Enter" && ev.target && ev.target.id === "resetEmail"){
    ev.preventDefault(); var rb = document.querySelector("[data-act=do-reset]"); if (rb) rb.click();
  }
});
document.addEventListener("click", function(ev){
  var el = ev.target.closest ? ev.target.closest("[data-act]") : null;
  /* Close the bar's menus (Customer display, Print & send, Deal) when clicking anywhere else or choosing an item. */
  if (state.ui.cdMenu || state.ui.barMenu){
    var inWrap = ev.target.closest && ev.target.closest(".cdmenu-wrap");
    var a0 = el ? el.getAttribute("data-act") : null;
    if (!inWrap || (a0 && a0 !== "cd-menu" && a0 !== "bar-menu")){ state.ui.cdMenu = false; state.ui.barMenu = null; setTimeout(function(){ if (window.__DCC_RENDER__) window.__DCC_RENDER__(); }, 0); }
  }
  if (!el) return;
  var act = el.getAttribute("data-act");
  if ((act === "close-modal-bg" || act === "confirm-bg" || act === "history-close" || act === "invite-close" || act === "saved-close" || act === "user-card-close") && ev.target !== el && el.classList.contains("modal-bg")) return;
  /* a click on a control inside a user-list row shouldn't also open the card */
  if (act === "user-card" && el.tagName === "TR" && ev.target.closest && ev.target.closest("a,select,input,label")) return;
  if (/^product-(new|edit|save|toggle|delete|template)$/.test(act) && !V.canEditProducts()){ toast("Only a General Manager or Finance Manager can add, edit or delete products.","err"); return; }
  switch (act){
    case "route": state.route = el.getAttribute("data-route"); state.ui.railOpen = false; commit(); break;
    case "toggle-rail": state.ui.railOpen = !state.ui.railOpen; commit(); break;
    case "ca-tab": { var cnt = el.getAttribute("data-tab"); caSyncTabs(cnt); caState.tab = cnt; render(); break; }
    case "ca-invest": caState.invest = el.getAttribute("data-inv"); render(); break;
    case "ca-clear": caState = caBlank(); render(); break;
    case "cp-add": couponAddProduct(); break;
    case "ws-print": state.ui.modal = { kind:"worksheet" }; commit(); break;
    case "user-card": state.ui.userCard = el.getAttribute("data-user"); commit(); break;
    case "user-card-close": state.ui.userCard = null; commit(); break;
    case "dealer-logo-remove": if (V.isAdmin()){ delete state.config.logo; toast("Logo removed.","ok"); commit(); } break;
    case "cp-remove": {
      var cpl = couponProducts().slice(), cpi = Number(el.getAttribute("data-idx")), cpn = cpl[cpi];
      if (cpn === undefined) break;
      askConfirm("Remove \u201c" + cpn + "\u201d?", "It comes off the coupon product list for everyone at " + state.config.name + ". Coupons already printed aren't affected.", "Remove", function(){
        cpl.splice(cpi, 1); delete couponState().chosen[cpn]; couponSaveList(cpl); });
      break; }
    case "cp-newcode": couponState().code = couponCode(); render(); break;
    case "cp-copies": couponState().copies = Number(el.getAttribute("data-n")) === 3 ? 3 : 1; render(); break;
    case "cp-today": ev.preventDefault(); couponState().expiry = C.todayISO(); render(); break;
    case "cp-clear": state.ui.coupon = null; render(); break;
    case "cp-print": {
      var cpp = couponState();
      if (couponAmount(cpp) === null || !couponProducts().some(function(x){ return cpp.chosen[x]; })){ toast("Enter an amount and tick at least one product.", "err"); break; }
      state.ui.modal = { kind:"coupon" }; commit(); break; }
    case "fm-feature": {
      if (!V.isAdmin() || el.tagName === "INPUT") break;
      var fu = el.getAttribute("data-user"), fk = el.getAttribute("data-feature"), fuser = userById(fu);
      var cfgA = state.config, wasOn = V.featureOn(fuser, fk);
      /* fold the older "Who can add promotional offers" setting into the per-person list once */
      if (fk === "offers" && cfgA.offerAccess && cfgA.offerAccess.mode === "selected"){
        cfgA.fmAccess = cfgA.fmAccess || {};
        state.users.filter(function(x){ return x.dealershipId === state.activeDealershipId && V.isFinanceRole(x.role); }).forEach(function(x){
          cfgA.fmAccess[x.id] = cfgA.fmAccess[x.id] || {}; cfgA.fmAccess[x.id].offers = (cfgA.offerAccess.users || []).indexOf(x.id) !== -1; });
        cfgA.offerAccess = { mode:"all", users:[] };
      }
      cfgA.fmAccess = cfgA.fmAccess || {}; cfgA.fmAccess[fu] = cfgA.fmAccess[fu] || {};
      cfgA.fmAccess[fu][fk] = !wasOn;
      toast(fuser.name + (wasOn ? " can no longer use " : " can now use ") + (V.FM_FEATURES.filter(function(f){ return f.key === fk; })[0] || {}).label + ".", "ok");
      commit(); break; }
    case "ca-from-deal": {
      var caR = caFromDeal();
      if (el.getAttribute("data-go")){ state.route = "cashadv"; window.scrollTo(0, 0); }
      caFromDealToast(caR); commit(); break; }
    case "ca-paymode": caState.payMode = el.getAttribute("data-mode"); render(); break;
    case "ca-freq": caState.freq = el.getAttribute("data-freq"); render(); break;
    case "ca-view": caState.view = el.getAttribute("data-view"); render(); break;
    case "ca-avg": caState.avgOver = el.getAttribute("data-avg"); render(); break;
    case "ca-lfreq": caState.lfreq = el.getAttribute("data-freq"); caState.lfirst = ""; render(); break;
    case "ca-lump-add": {
      var lz = amSchedSize(), lnew = amLumpCount();
      caState.lumpN = String(Math.min(AM_MAX_LUMPS, lnew + 1));
      caState["lumpDate" + lnew] = C.amortDate(lz.first, Math.min(lz.n, C.AMORT_PPY[lz.freq] * lnew + 1), lz.freq);  /* a year apart by default */
      render(); break; }
    case "ca-lump-del": {
      var ldi = Number(el.getAttribute("data-i")), lcn = amLumpCount();
      for (var lj = ldi; lj < lcn - 1; lj++){ caState["lumpAmt" + lj] = caState["lumpAmt" + (lj + 1)]; caState["lumpDate" + lj] = caState["lumpDate" + (lj + 1)]; }
      caState["lumpAmt" + (lcn - 1)] = ""; caState["lumpDate" + (lcn - 1)] = "";
      caState.lumpN = String(Math.max(1, lcn - 1)); render(); break; }
    case "ca-lfull": caState.lfull = !caState.lfull; render(); break;
    case "ca-goal-lump": case "ca-goal-every": {
      var gg = amGoal();
      if (gg && !gg.reached){
        for (var gi = 0; gi < AM_MAX_LUMPS; gi++){ caState["lumpAmt" + gi] = ""; caState["lumpDate" + gi] = ""; }
        caState.lumpN = "1"; caState.levery = "";
        if (act === "ca-goal-lump"){ caState.lumpAmt0 = gg.lump.amount.toLocaleString("en-CA", { minimumFractionDigits:2, maximumFractionDigits:2 }); caState.lumpDate0 = gg.base.first;
          toast("Lump sum of " + money(gg.lump.amount) + " added with the first payment.", "ok"); }
        else { caState.levery = gg.every.amount.toFixed(2); toast("Added " + money(gg.every.amount) + " to every payment.", "ok"); }
      }
      render(); break; }
    case "ca-acct": caState.acct = el.getAttribute("data-acct") === "taxable" ? "taxable" : "tfsa"; render(); break;
    case "ca-preset": {
      var cpk = el.getAttribute("data-key"), cpr = caNum(((state.config && state.config.caRates) || {})[cpk]);
      var cpd = CA_PRESETS.filter(function(x){ return x[0] === cpk; })[0];
      if (cpd && cpr !== null){
        if (cpd[2] === "gic"){ caState.invest = "gic"; caState.gicRate = String(cpr); }
        else { caState.invest = "other"; caState.otherName = cpd[1]; caState.otherRate = String(cpr); }
      }
      render(); break; }
    case "ca-email": state.ui.modal = { kind:"caemail" }; commit(); break;
    case "ca-email-copy": caEmailCopy(true); break;
    case "ca-email-text": caEmailCopy(false); break;
    case "ca-email-open": caEmailOpen(); break;
    case "ca-window": caOpenWindow(); break;
    case "ca-present": caState.present = true; render(); break;
    case "ca-exit-present": caState.present = false; render(); break;
    case "ca-print": state.ui.modal = { kind:"cashadv" }; commit(); break;
    case "toggle-product-config": {
      var pcid = el.getAttribute("data-product");
      state.ui.productConfigOpen = (state.ui.productConfigOpen === pcid) ? null : pcid;
      commit(); break; }
    case "toggle-theme": state.ui.theme = state.ui.theme === "dark" ? "light" : "dark"; commit(); break;
    case "toggle-split": state.ui.split = !state.ui.split; commit(); break;
    case "cd-menu": state.ui.cdMenu = !state.ui.cdMenu; state.ui.barMenu = null; commit(); break;
    case "bar-menu": { var bm = el.getAttribute("data-menu");
      state.ui.barMenu = state.ui.barMenu === bm ? null : bm; state.ui.cdMenu = false; commit(); break; }
    case "cd-preview-toggle": state.ui.cdPreview = !state.ui.cdPreview; state.ui.cdMenu = false; commit(); break;
    case "cd-preview-close": state.ui.cdPreview = false; commit(); break;
    case "present": state.ui.present = true; commit(); break;
    case "exit-present": state.ui.present = false; commit(); break;
    case "open-customer-window": openCustomerWindow(); break;
    case "new-deal": leaveDeal(newDeal, "new"); break;
    case "deal-open": { var oid = el.getAttribute("data-deal");
      if (state.tx && state.tx.id === oid){ state.route = "finance"; commit(); break; }
      leaveDeal(function(){ openSavedDeal(oid); }, "open"); break; }
    case "jump-issue": jumpToIssue(C.validate(state, state.tx).issues[Number(el.getAttribute("data-idx"))]); break;
    case "deal-delete": {
      var delId = el.getAttribute("data-deal");
      askConfirm("Delete this deal?", "Deal " + delId + " will be permanently deleted. This can't be undone.", "Delete deal", function(){
        state.completed = state.completed.filter(function(d){ return d.id !== delId; });
        cloud.del.x.push(delId);
        toast("Deal " + delId + " deleted.","ok");
        commit();
      });
      break; }
    case "complete": completeDeal(); break;
    case "save-deal": saveDeal(); break;
    case "saved-list": storeDraft(false); state.ui.savedList = true; commit(); break;
    case "saved-close": state.ui.savedList = false; commit(); break;
    case "saved-open": {
      var sid = el.getAttribute("data-deal");
      if (state.tx && state.tx.id === sid){ state.ui.savedList = false; commit(); break; }
      leaveDeal(function(){ openSaved(sid); }, "open"); break; }
    case "saved-delete": {
      var sdel = el.getAttribute("data-deal");
      askConfirm("Delete this saved deal?", "It will be removed permanently. This can't be undone.", "Delete deal", function(){
        state.saved = (state.saved || []).filter(function(d){ return d.id !== sdel; });
        cloud.del.x.push(sdel); state.ui.savedList = true;
        toast("Saved deal deleted.","ok"); commit(); });
      break; }
    case "product-template":
      if (state.products.length){ toast("This dealership already has products.","err"); break; }
      state.products = C.clone(D.PRODUCTS);
      state.cloud.productsByDealer[state.activeDealershipId] = state.products;
      toast("Starter template loaded. Edit the names, prices and rules to match your store.","ok"); commit(); break;
    case "offer-toggle": {
      V.ensureOffers(state.tx);
      var dd = state.tx.offers.discount;
      dd.enabled = !dd.enabled;
      dd.scope = "package"; dd.type = "percent"; dd.deal = 0; dd.packages = { preferred:0, essential:0, basic:0 };
      commit(); break; }
    case "offer-scope": V.ensureOffers(state.tx); state.tx.offers.discount.scope = el.getAttribute("data-val"); commit(); break;
    case "offer-dtype": V.ensureOffers(state.tx); state.tx.offers.discount.type = el.getAttribute("data-val"); commit(); break;
    case "gift-open": {
      if (!V.canUseOffers()){ toast("Promotional offers are added by your General Manager.","err"); break; }
      V.ensureOffers(state.tx);
      var gk = el.getAttribute("data-key"), goff = state.tx.offers, gdraft = null;
      if (state.ui.giftEdit && state.ui.giftEdit.key === gk){ state.ui.giftEdit = null; commit(); break; }
      var gAll = function(pk){ return !!(pk && pk.preferred && pk.essential && pk.basic); };
      var gNone = { preferred:false, essential:false, basic:false };
      var gLibCost = function(id){ var lb = (state.config.gifts || []).filter(function(x){ return x.id === id; })[0];
        return lb && lb.cost !== null && lb.cost !== undefined && lb.cost !== "" && !isNaN(Number(lb.cost)) ? Number(lb.cost) : null; };
      if (gk === "c:new") gdraft = { key:gk, custom:true, name:"", existingId:null, mode:"all", pk:{ preferred:true, essential:true, basic:true }, needsCost:true, cost:null };
      else if (gk.indexOf("p:") === 0){
        var glib = (state.config.gifts || []).filter(function(x){ return x.id === gk.slice(2); })[0];
        if (!glib) break;
        var gex = goff.gifts.filter(function(x){ return x.presetId === glib.id; })[0];
        gdraft = { key:gk, custom:false, presetId:glib.id, name:glib.name, existingId: gex ? gex.id : null,
          mode: gex && !gAll(gex.packages) ? "some" : "all", pk: gex ? C.clone(gex.packages) : { preferred:true, essential:true, basic:true },
          needsCost: gLibCost(glib.id) === null, cost: gex ? gex.cost : null };
      } else {
        var gcx = goff.gifts.filter(function(x){ return x.id === gk.slice(2); })[0];
        if (!gcx) break;
        gdraft = { key:gk, custom:true, name:gcx.name, existingId:gcx.id, mode: gAll(gcx.packages) ? "all" : "some", pk:C.clone(gcx.packages || gNone), needsCost:true, cost:gcx.cost };
      }
      state.ui.giftEdit = gdraft; commit(); break; }
    case "gift-mode": {
      var gd = state.ui.giftEdit; if (!gd) break;
      var gm = el.getAttribute("data-val");
      if (gm === "some" && gd.pk.preferred && gd.pk.essential && gd.pk.basic) gd.pk = { preferred:false, essential:false, basic:false };
      gd.mode = gm; commit(); break; }
    case "gift-cancel": state.ui.giftEdit = null; commit(); break;
    case "gift-done": {
      var gdn = state.ui.giftEdit; if (!gdn) break;
      V.ensureOffers(state.tx);
      var gnm = String(gdn.name || "").trim();
      var gpk = gdn.mode === "all" ? { preferred:true, essential:true, basic:true } : C.clone(gdn.pk);
      if (!gnm || !(gpk.preferred || gpk.essential || gpk.basic)){ toast("Pick at least one package.","err"); break; }
      var gline = state.tx.offers.gifts.filter(function(x){ return x.id === gdn.existingId; })[0];
      var gCost = gdn.needsCost ? (gdn.cost === "" || gdn.cost === null || gdn.cost === undefined || isNaN(Number(gdn.cost)) ? null : Number(gdn.cost)) : undefined;
      if (gline){ gline.packages = gpk; if (gdn.custom) gline.name = gnm; if (gCost !== undefined) gline.cost = gCost; }
      else {
        var glb = gdn.custom ? null : (state.config.gifts || []).filter(function(x){ return x.id === gdn.presetId; })[0];
        state.tx.offers.gifts.push({ id:C.uid("g"), presetId: gdn.custom ? null : gdn.presetId, name:gnm, value:null,
          cost: gCost !== undefined ? gCost : (glb && glb.cost !== undefined ? glb.cost : null), showValue:false, packages:gpk });
      }
      state.ui.giftEdit = null; commit(); break; }
    case "gift-x": {
      if (!V.canUseOffers()) break;
      V.ensureOffers(state.tx);
      var gxk = el.getAttribute("data-key");
      state.tx.offers.gifts = state.tx.offers.gifts.filter(function(x){ return gxk.indexOf("p:") === 0 ? x.presetId !== gxk.slice(2) : x.id !== gxk.slice(2); });
      if (state.ui.giftEdit && state.ui.giftEdit.key === gxk) state.ui.giftEdit = null;
      commit(); break; }
    case "gift-add": {
      V.ensureOffers(state.tx);
      var gp = el.getAttribute("data-preset"), gsrc = gp === "custom" ? null : (state.config.gifts || [])[Number(gp)];
      state.tx.offers.gifts.push({ id:C.uid("g"), presetId: gsrc ? gsrc.id : null, name: gsrc ? gsrc.name : "", value: gsrc && gsrc.value !== undefined ? gsrc.value : null,
        cost: gsrc && gsrc.cost !== undefined ? gsrc.cost : null, showValue:false, packages:{ preferred:false, essential:false, basic:false } });
      commit(); break; }
    case "gift-remove": V.ensureOffers(state.tx); state.tx.offers.gifts.splice(Number(el.getAttribute("data-idx")), 1); commit(); break;
    case "gift-preset-add": if (!state.config.gifts) state.config.gifts = []; state.config.gifts.push({ id:C.uid("g"), name:"", value:null, cost:null }); commit(); break;
    case "gift-photo-remove": (state.config.gifts[Number(el.getAttribute("data-idx"))] || {}).image = null; commit(); break;
    case "gift-preset-remove": state.config.gifts.splice(Number(el.getAttribute("data-idx")), 1); commit(); break;
    case "brand-color": state.config.brandColor = el.getAttribute("data-color"); state.config.colorMode = "custom"; commit(); break;
    case "brand-color-reset": state.config.colorMode = "brand"; commit(); break;
    case "color-mode": {
      var cmode = el.getAttribute("data-mode") === "custom" ? "custom" : "brand";
      state.config.colorMode = cmode;
      /* first time on "Colour of choice": start from the brand's own colour (its accent when the main colour is black) */
      if (cmode === "custom" && !/^#[0-9a-f]{6}$/i.test(state.config.brandColor || "")){
        var cb = V.brand(), cpal = cb.pal;
        state.config.brandColor = cpal ? (V.hexLum(cpal.main) < .02 ? cpal.accent : cpal.main).toLowerCase() : (cb.color || "#2c5a9b");
      }
      commit(); break; }
    case "email":
      state.ui.modal = { kind:"email" };
      if (state.tx.display.selection){
        state.ui.email.pkg = state.tx.display.selection.package;
        state.ui.email.term = state.tx.display.selection.term ? String(state.tx.display.selection.term) : "all";
      }
      commit(); break;
    case "copy-email-html": copyEmailHtml(); break;
    case "copy-email-text": copyEmailText(); break;
    case "send-email": sendEmail(); break;
    case "select-final-package": {
      var fpk = el.getAttribute("data-package");
      state.tx.display.selection = (state.tx.display.selection && state.tx.display.selection.package === fpk)
        ? null : { package: fpk };
      commit(); break; }
    case "clear-selection": state.tx.display.selection = null; commit(); break;
    case "remove-line": {
      var lid = el.getAttribute("data-line");
      state.tx.lines = state.tx.lines.filter(function(l){ return l.lineId !== lid; });
      if (!state.tx.lines.length && state.tx.display.mode === "package") state.tx.display.mode = "welcome";
      commit(); break; }
    case "reset-price": {
      var ln = findLine(el.getAttribute("data-line"));
      if (ln){ ln.price = null; ln.priceOverridden = false; } commit(); break; }
    case "set-frequency": state.tx.finance.frequency = el.getAttribute("data-freq"); commit(); break;
    case "set-deal-type": state.tx.type = el.getAttribute("data-deal-type"); commit(); break;
    case "cd-mode": state.tx.display.mode = el.getAttribute("data-mode"); state.ui.cdMenu = false; commit(); break;
    case "scroll-step": {
      var target = document.getElementById(el.getAttribute("data-target") || "step-" + el.getAttribute("data-step"));
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior:"smooth", block:"start" }); break; }
    case "print-internal": state.ui.modal = { kind:"internal" }; commit(); break;
    case "print-customer": state.ui.modal = { kind:"customer" }; commit(); break;
    case "close-modal": case "close-modal-bg":
      state.ui.modal = null; state.ui.productEdit = null; state.ui.userForm = false; state.ui.dealerForm = null; state.ui.extendForm = null; state.ui.pwReset = null; commit(); break;
    case "do-print": {
      var oldTitle = document.title, pm = state.ui.modal;
      document.title = pm && pm.kind === "worksheet" ? "Purchase Proposal - " + (state.config.name || "Worksheet")
        : pm && pm.kind === "coupon" ? "Coupon " + couponState().code + (couponState().name.trim() ? " - " + couponState().name.trim() : "")
        : pm && pm.kind === "cashadv" ? (caState && caState.tab === "amort" ? "Loan Payoff Schedule" : caState && caState.tab === "loc" ? "Line of Credit Comparison" : "Cash vs Finance Comparison") + (caState && caState.customer.trim() ? " - " + caState.customer.trim() : "")
        : (pm && pm.kind === "customer" ? "Protection Summary" : "Transaction Record") + (state.tx && state.tx.customer.name ? " - " + state.tx.customer.name : "");
      if (pm && pm.kind === "worksheet"){ wsPrint(document.title); setTimeout(function(){ document.title = oldTitle; }, 1500); break; }
      try { window.print(); } catch (e) { toast("The browser blocked printing. Try again, or use your browser's Print command.","err"); }
      setTimeout(function(){ document.title = oldTitle; }, 1500);
      break; }
    case "product-new": state.ui.productEdit = { id:null, name:"", code:"", category:"", active:true, taxRule:"standard",
      uses:{term:true,km:false,interval:false,deductible:false}, terms:[36,48,60,72], kms:[], intervals:[], deductibles:[],
      cost:null, desc:"", benefit:"", pricing:{ base:0, term:{} } }; commit(); break;
    case "product-edit": state.ui.productEdit = C.clone(C.productById(state, el.getAttribute("data-product"))); commit(); break;
    case "product-cancel": state.ui.productEdit = null; commit(); break;
    case "product-save": saveProduct(); break;
    case "product-toggle": {
      var pr = C.productById(state, el.getAttribute("data-product"));
      if (pr){ pr.active = !pr.active;
        if (!pr.active) state.tx.lines = state.tx.lines.filter(function(l){ return l.productId !== pr.id; }); }
      commit(); break; }
    case "product-delete": {
      var did = el.getAttribute("data-product");
      state.products = state.products.filter(function(p){ return p.id !== did; });
      cloud.del.p.push({ dealer:state.activeDealershipId, id:did });
      state.tx.lines = state.tx.lines.filter(function(l){ return l.productId !== did; });
      toast("Product removed from the master list.","ok"); commit(); break; }
    case "user-new": state.ui.userForm = true; state.ui.inviteSel = null; commit(); break;
    case "user-cancel": state.ui.userForm = false; commit(); break;
    case "user-save": saveUser(); break;
    case "user-setpw": state.ui.pwReset = { id:el.getAttribute("data-user"), value:genTempPassword() }; commit(); break;
    case "pwreset-gen": { var pv = document.getElementById("pwResetVal"); if (pv){ pv.value = genTempPassword(); state.ui.pwReset.value = pv.value; } break; }
    case "deal-history": {
      var hid = el.getAttribute("data-deal");
      state.ui.history = { id:hid, loading:true, rows:[] }; commit();
      sb.from("deal_audit").select("action,actor_name,changed_at").eq("deal_id", hid).order("changed_at", { ascending:false }).limit(100)
        .then(function(res){
          if (!state.ui.history || state.ui.history.id !== hid) return;
          state.ui.history.loading = false;
          if (res.error) state.ui.history.error = "Couldn't load the history: " + res.error.message; else state.ui.history.rows = res.data || [];
          commit(); });
      break; }
    case "history-close": state.ui.history = null; commit(); break;
    case "uf-genpw": { var pwf = document.querySelector('.modal [data-uf="password"]'); if (pwf) pwf.value = genTempPassword(); break; }
    case "invite-copy": {
      var im = inviteSecret ? inviteMessage(inviteSecret) : "";
      try { navigator.clipboard.writeText(im).then(function(){ toast("Message copied — paste it into a text or email.","ok"); }, function(){ toast("Couldn't copy automatically — select the details and copy them.","err"); }); }
      catch (e) { toast("Couldn't copy automatically — select the details and copy them.","err"); }
      break; }
    case "invite-close": inviteSecret = null; commit(); break;
    case "pwreset-cancel": state.ui.pwReset = null; commit(); break;
    case "pwreset-save": {
      var pr = state.ui.pwReset, pvEl = document.getElementById("pwResetVal"), pm = document.getElementById("pwResetMail");
      var pwNext = pvEl ? pvEl.value.trim() : "";
      if (!pr) break;
      if (pwNext.length < 8){ toast("Password not changed — use at least 8 characters.","err"); break; }
      var pwUser = userById(pr.id), wantMail = !!(pm && pm.checked && !pm.disabled);
      adminCall({ action:"reset_password", id:pr.id, password:pwNext, send_email:wantMail, app:"command" })
        .then(function(r){
          state.ui.pwReset = null;
          if (pwUser.role !== "Salesperson" && pwUser.email){
            inviteSecret = { title:"Password reset — share the sign-in details", first:String(pwUser.name||"").split(" ")[0], email:pwUser.email, password:pwNext, url:"https://finance.rahulchamp.ca/", emailed:!!(wantMail && r && r.emailed) };
          } else toast("Temporary password set for " + pwUser.name + ".","ok");
          refreshUsers(); commit(); })
        .catch(function(e){ toast(e.message,"err"); });
      break; }
    case "user-toggle": {
      var uu = userById(el.getAttribute("data-user"));
      if (uu.role === "Master Administrator") { toast("A master administrator can't be deactivated.","err"); break; }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(uu.id)){ uu.active = !uu.active; commit(); break; }
      adminCall(uu.role === "Salesperson" ? { action:"update", id:uu.id, pulse_enabled:!uu.active, app:"command" } : { action:"update", id:uu.id, cc_enabled:!uu.active, app:"command" })
        .then(function(){ refreshUsers(); }).catch(function(e){ toast(e.message,"err"); });
      break; }
    case "user-pulse": {
      var up = userById(el.getAttribute("data-user"));
      adminCall({ action:"update", id:up.id, pulse_enabled:!up.pulseOn, app:"command" })
        .then(function(){ toast(up.name + (up.pulseOn ? " no longer has Axiom Pulse access." : " now has Axiom Pulse access."),"ok"); refreshUsers(); })
        .catch(function(e){ toast(e.message,"err"); });
      break; }
    case "user-delete": {
      var uid2 = el.getAttribute("data-user");
      var ud = userById(uid2);
      if (ud.role === "Master Administrator") { toast("A master administrator can't be removed.","err"); break; }
      if (uid2 === state.currentUserId) { toast("You can't remove your own account.","err"); break; }
      askConfirm("Remove " + ud.name + "?", ud.role === "Salesperson"
        ? "This deletes their account, including their Axiom Pulse sign-in. This can't be undone."
        : "They lose Command Center access. If they also use Axiom Pulse they keep that login; otherwise the account is deleted. This can't be undone.", "Remove user", function(){
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(uid2)){
          /* A leftover from before real accounts existed — it only lives in this browser, so there's nothing on the server to delete. */
          state.users = state.users.filter(function(u){ return u.id !== uid2; }); toast("User removed.","ok"); commit(); return;
        }
        toast("Removing " + ud.name + "…","info");
        adminCall({ action:"delete", id:uid2, app:"command" }).then(function(r){
          if (r && r.kept){
            ud.ccOn = false; if (ud.role !== "Salesperson") ud.active = false; commit(); refreshUsers();
            showNotice(ud.name + " removed from Command Center", "They no longer have Command Center access. Their Axiom Pulse login is unchanged.");
            return;
          }
          if (r && r.deactivated){
            ud.active = false; commit(); refreshUsers();
            showNotice(ud.name + " was deactivated", "This account still has linked records, so it couldn't be erased. It was deactivated and can no longer sign in.");
            return;
          }
          /* Don't trust "ok" alone: re-read the server list and confirm the account is really gone. */
          return adminCall({ action:"list" }).then(function(l){
            var still = (l.users || []).some(function(x){ return x.id === uid2; });
            if (still){ showNotice("Couldn't remove " + ud.name, "The server reported success, but the account still exists. Please try again, and if it keeps happening, tell Rahul the time it happened."); return; }
            state.users = state.users.filter(function(u){ return u.id !== uid2; });
            toast(ud.name + " was removed.","ok"); commit();
          });
        }).catch(function(e){
          if (window.console) console.error("Remove user failed", e);
          showNotice("Couldn't remove " + ud.name, (e && e.message) ? e.message : "Something went wrong reaching the server. Check your connection and try again.");
        });
      });
      break; }
    case "confirm-yes": { var cf = pendingConfirm; pendingConfirm = null; state.ui.confirm = null; commit(); if (cf) cf(); break; }
    case "confirm-choice": {
      var chs = pendingChoices, ch = chs ? chs[Number(el.getAttribute("data-idx"))] : null;
      pendingChoices = null; state.ui.confirm = null; commit(); if (ch && ch.go) ch.go(); break; }
    case "confirm-no": case "confirm-bg": pendingConfirm = null; pendingChoices = null; state.ui.confirm = null; commit(); break;
    case "uf-access": {
      var mr = document.querySelector(".modal"); if (!mr) break;
      var av = el.getAttribute("data-val");
      mr.querySelector('[data-uf="access"]').value = av;
      Array.prototype.forEach.call(el.parentNode.children, function(b){ b.classList.toggle("on", b === el); });
      mr.querySelector("#ufDemoBox").style.display = av === "demo" ? "" : "none";
      initWheels(); break; }
    case "demo-extend": state.ui.extendForm = { id:el.getAttribute("data-user") }; commit(); break;
    case "extend-save": {
      var ef = state.ui.extendForm;
      if (!ef || !ef.sel){ toast("Pick a date and time.","err"); break; }
      var dt = wheelDate(ef.sel);
      if (!(dt.getTime() > Date.now())){ toast("Pick a moment in the future.","err"); break; }
      var newExp = dt.toISOString();
      adminCall({ action:"update", id:ef.id, access_type:"demo", expires_at:newExp })
        .then(function(){ state.ui.extendForm = null; toast("Demo extended to " + fmtExpiry(newExp) + ".","ok"); refreshUsers(); commit(); })
        .catch(function(e){ toast(e.message,"err"); });
      break; }
    case "demo-convert": {
      var dc = userById(el.getAttribute("data-user"));
      askConfirm("Give " + dc.name + " full access?", "Their demo time limit is removed and they keep full access.", "Make full access", function(){
        adminCall({ action:"update", id:dc.id, access_type:"full" })
          .then(function(){ toast(dc.name + " now has full access.","ok"); refreshUsers(); })
          .catch(function(e){ toast(e.message,"err"); });
      });
      break; }
    case "do-change-password": doChangePassword(); break;
    case "toggle-pw": {
      var pwi = document.getElementById("loginPassword");
      if (pwi) pwi.type = pwi.type === "password" ? "text" : "password";
      break; }
    case "demo-ack": state.ui.welcome = null; maybeStartTour(); commit(); break;
    case "set-theme": state.ui.theme = el.getAttribute("data-theme"); commit(); break;
    case "tour-next": tourStep(1); break;
    case "tour-back": tourStep(-1); break;
    case "tour-skip": tourEnd(); break;
    case "extend-cancel": state.ui.extendForm = null; commit(); break;
    case "dealer-new": state.ui.dealerForm = { id:null, name:"", brandKey:"ford", logoMark:"", active:true,
      address:"", city:"", phone:"", email:"", dealerCode:"",
      finance:{ defaultApr:7.49, defaultTerm:72, defaultFrequency:"biweekly", adminFee:699, licensing:120 },
      tax:{ standard:13, vrc:8 } }; commit(); break;
    case "dealer-edit": state.ui.dealerForm = C.clone(V.dealershipById(el.getAttribute("data-dealership"))); commit(); break;
    case "dealer-cancel": state.ui.dealerForm = null; commit(); break;
    case "dealer-save": saveDealer(); maybeStartTour(); break;
    case "dealer-delete": deleteDealer(el.getAttribute("data-dealership")); break;
    case "switch-to-dealership": openStore(el.getAttribute("data-dealership"), "dashboard"); break;
    case "go-hq": state.ui.hq = true; state.route = "dealerships"; state.ui.railOpen = false; state.ui.userCard = null; window.scrollTo(0, 0); commit(); break;
    case "do-login": doLogin(); break;
    case "logout": doLogout(); break;
    case "forgot-password": state.ui.forgot = true; state.ui.forgotMsg = null; state.ui.loginError = null; commit(); break;
    case "back-login": state.ui.forgot = false; state.ui.forgotMsg = null; commit(); break;
    case "do-reset": {
      var rem = document.getElementById("resetEmail"), rev = rem ? rem.value.trim() : "";
      if (!/^\S+@\S+\.\S+$/.test(rev)){ state.ui.forgotMsg = "Enter a valid email address."; commit(); break; }
      state.ui.forgotBusy = true; commit();
      fetch(SB_URL + "/functions/v1/request-password-reset", { method:"POST", headers:{ "Content-Type":"application/json", apikey:SB_KEY },
        body:JSON.stringify({ email:rev, app:"command" }) })
        .then(function(){ state.ui.forgotMsg = "If that email is registered, we've sent a reset link. Check your inbox (and spam folder). It expires in 24 hours."; })
        .catch(function(){ state.ui.forgotMsg = "We couldn't send that right now. Try again in a moment, or ask your administrator to reset it."; })
        .then(function(){ state.ui.forgotBusy = false; commit(); });
      break; }
  }
});

document.addEventListener("change", function(ev){
  var el = ev.target;
  if (el.getAttribute && el.getAttribute("data-pf") === "category" && state.ui.productEdit){
    var proot = document.querySelector(".modal");
    if (!proot) return;
    var descEl = proot.querySelector('[data-pf="desc"]'), benEl = proot.querySelector('[data-pf="benefit"]');
    var nameEl = proot.querySelector('[data-pf="name"]');
    if (descEl && benEl && !descEl.value.trim() && !benEl.value.trim()){
      var tmpl = categoryTemplate(el.value, nameEl ? nameEl.value.trim() : "");
      descEl.value = tmpl.desc; benEl.value = tmpl.benefit;
    }
  }
});
document.addEventListener("change", function(ev){
  var el = ev.target, act = el.getAttribute("data-act");
  var ufk = el.getAttribute && el.getAttribute("data-uf");
  if (ufk === "role" || ufk === "invite"){ syncUserForm(); return; }
  if (act === "switch-dealership"){
    var toDealer = el.value;
    /* If it asks first, its re-render puts the picker back on the current dealership until they choose. */
    leaveDeal(function(){ V.setDealership(toDealer); resetDealUi(); commit(); }, "switch");
    return;
  }
  if (act === "change-role"){
    var rt = userById(el.getAttribute("data-user")), newRole = el.value, oldRole = rt.role;
    if (newRole === oldRole || (V.isFinanceRole(newRole) && V.isFinanceRole(oldRole))) return;
    askConfirm("Change " + rt.name + "'s role?", rt.name + " will become a " + V.roleLabel(newRole) + ". Their access changes the next time they sign in or refresh.", "Change role", function(){
      toast("Updating role…","info");
      adminCall({ action:"update", id:rt.id, role:newRole, app:"command" })
        .then(function(){ rt.role = newRole; toast(rt.name + " is now a " + V.roleLabel(newRole) + ".","ok"); refreshUsers(); commit(); })
        .catch(function(e){ toast("Couldn't change the role: " + e.message,"err"); commit(); });
    });
    commit(); return;
  }
  if (act === "assign-dealership"){
    var target = userById(el.getAttribute("data-user"));
    target.dealershipId = el.value;
    adminCall({ action:"update", id:target.id, dealership_id:el.value }).catch(function(e){ toast(e.message,"err"); });
    commit(); return;
  }
  if (act === "dealer-brand"){
    if (state.ui.dealerForm){
      /* Keep what's already typed: picking a brand redraws the form. */
      var dfm = state.ui.dealerForm;
      document.querySelectorAll("[data-df]").forEach(function(inp){
        var k = inp.getAttribute("data-df"), v = inp.value;
        if (k === "brandKey") return;
        if (k === "taxStandard"){ dfm.tax = dfm.tax || {}; dfm.tax.standard = v === "" ? dfm.tax.standard : Number(v); }
        else if (k === "taxVrc"){ dfm.tax = dfm.tax || {}; dfm.tax.vrc = v === "" ? dfm.tax.vrc : Number(v); }
        else if (k === "apr"){ dfm.finance = dfm.finance || {}; dfm.finance.defaultApr = v === "" ? dfm.finance.defaultApr : Number(v); }
        else if (k === "term"){ dfm.finance = dfm.finance || {}; dfm.finance.defaultTerm = v === "" ? dfm.finance.defaultTerm : Number(v); }
        else dfm[k] = v;
      });
      state.ui.dealerForm.brandKey = el.value;
      state.ui.dealerForm.logoMark = C.brandOfDealer({ brandKey:el.value, customBrandName:state.ui.dealerForm.customBrandName }).mark;
    }
    commit(); return;
  }
  if (act === "toggle-term"){
    var tm = Number(el.getAttribute("data-term")), list = state.tx.finance.terms.slice();
    if (!state.tx.finance.rates) state.tx.finance.rates = {};
    if (el.checked){
      if (list.indexOf(tm) === -1) list.push(tm);
      if (state.tx.finance.rates[tm] === undefined) state.tx.finance.rates[tm] = state.config.finance.defaultApr;
    } else {
      list = list.filter(function(x){ return x !== tm; });
      delete state.tx.finance.rates[tm];
      if (state.tx.display.selection && state.tx.display.selection.term === tm) state.tx.display.selection = null;
    }
    state.tx.finance.terms = list.sort(function(a,b){ return a-b; });
    commit(); return;
  }
  if (act === "term-rate"){
    var trm = Number(el.getAttribute("data-term"));
    if (!state.tx.finance.rates) state.tx.finance.rates = {};
    state.tx.finance.rates[trm] = el.value === "" ? null : Number(el.value);
    commit(); return;
  }
  if (act === "toggle-package-list"){
    var pid2 = el.getAttribute("data-product"), pkgKey = el.getAttribute("data-package");
    var line2 = state.tx.lines.filter(function(l){ return l.productId === pid2; })[0];
    if (!line2){
      if (!el.checked) return;
      var prod2 = C.productById(state, pid2);
      if (!prod2) return;
      line2 = makeLine(prod2);
      state.tx.lines.push(line2);
    }
    if (!line2.packages) line2.packages = { preferred:false, essential:false, basic:false };
    var wasInAnyPkg = line2.packages.preferred || line2.packages.essential || line2.packages.basic;
    line2.packages[pkgKey] = el.checked;
    if (el.checked) line2.declined = false;
    /* The customer display lists products in the order they were selected
       into a package. A price typed in before any package is picked (or a
       product declined and later brought back) shouldn't count as "selected"
       yet — only the moment it first joins a package sets its display order,
       so move it to the end of the line-up right then. */
    if (el.checked && !wasInAnyPkg){
      state.tx.lines = state.tx.lines.filter(function(l){ return l.lineId !== line2.lineId; });
      state.tx.lines.push(line2);
    }
    /* Unchecking every package used to delete the whole line, which silently
       wiped out a price the FSM had already typed in — a price now only
       ever goes away if the FSM explicitly clears it (Reset) or removes the
       line, never as a side effect of package checkboxes. */
    if (state.tx.lines.length && state.tx.display.mode === "welcome") state.tx.display.mode = "package";
    if (!state.tx.lines.length && state.tx.display.mode === "package") state.tx.display.mode = "welcome";
    commit(); return;
  }
  if (act === "toggle-decline"){
    var pid3 = el.getAttribute("data-product");
    var line3 = state.tx.lines.filter(function(l){ return l.productId === pid3; })[0];
    if (el.checked){
      if (!line3){
        var prod3 = C.productById(state, pid3);
        if (!prod3) return;
        line3 = makeLine(prod3);
        state.tx.lines.push(line3);
      }
      /* Remember exactly which packages it was in so "Undo" can put it back
         without the FSM re-checking every box, and never remove the line
         while declined — that's what was silently wiping out the price and
         its position in the line-up on undo before. */
      line3.declinedFrom = C.clone(line3.packages || { preferred:false, essential:false, basic:false });
      line3.packages = { preferred:false, essential:false, basic:false };
      line3.declined = true;
    } else if (line3){
      line3.declined = false;
      var restored = line3.declinedFrom || { preferred:true, essential:false, basic:false };
      line3.packages = restored;
      line3.declinedFrom = null;
    }
    if (state.tx.lines.length && state.tx.display.mode === "welcome") state.tx.display.mode = "package";
    commit(); return;
  }
  if (act === "gift-dpk"){
    var gdp = state.ui.giftEdit;
    if (gdp){ gdp.pk[el.getAttribute("data-pkg")] = el.checked; commit(); }
    return;
  }
  if (act === "gift-pkg"){
    V.ensureOffers(state.tx);
    var gg = state.tx.offers.gifts[Number(el.getAttribute("data-idx"))];
    if (gg){ if (!gg.packages) gg.packages = {}; gg.packages[el.getAttribute("data-pkg")] = el.checked; }
    commit(); return;
  }
  if (act === "gift-showval"){
    V.ensureOffers(state.tx);
    var gv = state.tx.offers.gifts[Number(el.getAttribute("data-idx"))];
    if (gv) gv.showValue = el.checked;
    commit(); return;
  }
  if (act === "dealer-logo"){
    if (!V.isAdmin()) return;
    var lfile = el.files && el.files[0];
    if (!lfile) return;
    var lrd = new FileReader();
    lrd.onload = function(){
      var limg = new Image();
      limg.onload = function(){
        /* keep it crisp but small: at most 600 px wide / 200 px tall, PNG keeps transparency */
        var sc = Math.min(1, 600 / limg.width, 200 / limg.height);
        var lcv = document.createElement("canvas"); lcv.width = Math.round(limg.width * sc); lcv.height = Math.round(limg.height * sc);
        lcv.getContext("2d").drawImage(limg, 0, 0, lcv.width, lcv.height);
        var lout = lcv.toDataURL("image/png");
        if (lout.length > 180000) lout = lcv.toDataURL("image/webp", .9);
        if (lout.length > 180000){ toast("That logo is too detailed to store. Try a simpler or smaller file.","err"); return; }
        state.config.logo = lout; toast("Logo saved. It now appears on coupons and the worksheet.","ok"); commit();
      };
      limg.onerror = function(){ toast("That file couldn't be read as an image.","err"); };
      limg.src = lrd.result;
    };
    lrd.readAsDataURL(lfile);
    return;
  }
  if (act === "gift-photo"){
    var gidx = Number(el.getAttribute("data-idx")), gfile = el.files && el.files[0];
    if (!gfile) return;
    var rd = new FileReader();
    rd.onload = function(){
      var img = new Image();
      img.onload = function(){
        var max = 420, sc = Math.min(1, max / Math.max(img.width, img.height));
        var cv = document.createElement("canvas"); cv.width = Math.round(img.width*sc); cv.height = Math.round(img.height*sc);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        var q = 0.85, out = cv.toDataURL("image/webp", q);
        while (out.length > 90000 && q > 0.4){ q -= 0.15; out = cv.toDataURL("image/webp", q); }
        if (out.length > 120000){ toast("That photo is too detailed to store. Try a simpler or smaller image.","err"); return; }
        if (state.config.gifts[gidx]){ state.config.gifts[gidx].image = out; toast("Photo added.","ok"); commit(); }
      };
      img.onerror = function(){ toast("That file couldn't be read as an image.","err"); };
      img.src = rd.result;
    };
    rd.readAsDataURL(gfile);
    return;
  }
  if (act === "uc-app"){
    var au = userById(el.getAttribute("data-user")), aapp = el.getAttribute("data-app"), aon = !!el.checked;
    var aName = aapp === "cc" ? "Command Center" : "Axiom Pulse";
    var go = function(){
      var body = { action:"update", id:au.id, app:"command" };
      body[aapp === "cc" ? "cc_enabled" : "pulse_enabled"] = aon;
      toast("Updating…","info");
      adminCall(body).then(function(){
        if (aapp === "cc"){ au.ccOn = aon; if (au.role !== "Salesperson") au.active = aon; } else au.pulseOn = aon;
        toast(au.name + (aon ? " can now sign in to " : " can no longer sign in to ") + aName + ".","ok"); refreshUsers(); commit();
      }).catch(function(e){ toast("Couldn't change access: " + e.message,"err"); commit(); });
    };
    var otherOn = aapp === "cc" ? au.pulseOn : au.ccOn;
    if (!aon && !otherOn && au.role !== "Salesperson"){
      askConfirm("Turn off " + aName + "?", au.name + " has no other app switched on, so they won't be able to sign in at all.", "Turn off", go);
      commit(); return;
    }
    go(); return;
  }
  if (act === "fm-feature" && V.isAdmin()){
    var fu2 = el.getAttribute("data-user"), fk2 = el.getAttribute("data-feature"), fuser2 = userById(fu2), cfgB = state.config;
    if (fk2 === "offers" && cfgB.offerAccess && cfgB.offerAccess.mode === "selected"){
      cfgB.fmAccess = cfgB.fmAccess || {};
      state.users.filter(function(x){ return x.dealershipId === state.activeDealershipId && V.isFinanceRole(x.role); }).forEach(function(x){
        cfgB.fmAccess[x.id] = cfgB.fmAccess[x.id] || {}; cfgB.fmAccess[x.id].offers = (cfgB.offerAccess.users || []).indexOf(x.id) !== -1; });
      cfgB.offerAccess = { mode:"all", users:[] };
    }
    cfgB.fmAccess = cfgB.fmAccess || {}; cfgB.fmAccess[fu2] = cfgB.fmAccess[fu2] || {};
    cfgB.fmAccess[fu2][fk2] = !!el.checked;
    toast(fuser2.name + (el.checked ? " can now use " : " can no longer use ") + (V.FM_FEATURES.filter(function(f){ return f.key === fk2; })[0] || {}).label + ".", "ok");
    commit(); return;
  }
  if (act === "cp-pick"){
    var cpk = couponProducts()[Number(el.getAttribute("data-idx"))];
    if (cpk !== undefined){ couponState().chosen[cpk] = el.checked; render(); }
    return;
  }
  if (act === "offer-access-mode"){
    var oa = state.config.offerAccess || { mode:"all", users:[] };
    oa.mode = el.value === "selected" ? "selected" : "all"; if (!oa.users) oa.users = [];
    state.config.offerAccess = oa; commit(); return;
  }
  if (act === "offer-access-user"){
    var ob = state.config.offerAccess || { mode:"selected", users:[] }, ouid = el.getAttribute("data-user");
    ob.users = (ob.users || []).filter(function(x){ return x !== ouid; });
    if (el.checked) ob.users.push(ouid);
    state.config.offerAccess = ob; commit(); return;
  }
  if (act === "brand-color-input"){ state.config.brandColor = el.value; state.config.colorMode = "custom"; commit(); return; }
  if (act === "toggle-payment"){ state.tx.display.showPayment = el.checked; commit(); return; }
  if (act === "toggle-prices"){ state.tx.display.showPrices = el.checked; commit(); return; }
  if (act === "toggle-config"){ state.tx.display.showConfig = el.checked; commit(); return; }
  if (act === "report-preset"){
    state.ui.reports.period = el.value;
    var r = presetRange(el.value);
    state.ui.reports.from = r.from; state.ui.reports.to = r.to;
    commit(); return;
  }
  var bind = el.getAttribute("data-bind");
  if (!bind) return;
  var raw = el.type === "checkbox" ? el.checked : el.value;
  var num = el.getAttribute("data-type") === "num";
  if (el.hasAttribute("data-money")){
    raw = String(raw).replace(/[$,\s]/g, "");
    if (raw !== "" && isNaN(Number(raw))){ toast("That isn't a dollar amount — try again, e.g. 42995.","err"); commit(); return; }
  }
  if (bind.indexOf("newline:") === 0){
    var nparts = bind.split(":"), nprod = C.productById(state, nparts[1]);
    if (!nprod || raw === "") return;
    var nline = state.tx.lines.filter(function(l){ return l.productId === nprod.id; })[0];
    if (!nline){ nline = makeLine(nprod); state.tx.lines.push(nline); }
    nline.price = num ? Number(raw) : raw;
    var nconf = C.priceFor(nprod, nline);
    nline.priceOverridden = !(nline.price === null || nconf === null || Number(nline.price) === Number(nconf));
    commit(); return;
  }
  if (bind.indexOf("newcfg:") === 0){
    var cpart = bind.split(":"), cprod = C.productById(state, cpart[1]);
    if (!cprod || raw === "") return;
    var cline = state.tx.lines.filter(function(l){ return l.productId === cprod.id; })[0];
    if (!cline){ cline = makeLine(cprod); state.tx.lines.push(cline); }
    cline[cpart[2]] = Number(raw);
    if (cpart[2] !== "cost"){
      cline.cfgSet = cline.cfgSet || {}; cline.cfgSet[cpart[2]] = true;
      if (!cline.priceOverridden) cline.price = null;
    }
    commit(); return;
  }
  if (bind.indexOf("line:") === 0){
    var parts = bind.split(":"), ln2 = findLine(parts[1]), field = parts[2];
    if (!ln2) return;
    if (raw === "") ln2[field] = null; else ln2[field] = num ? Number(raw) : raw;
    if (field === "term" || field === "km" || field === "interval" || field === "deductible"){
      ln2.cfgSet = ln2.cfgSet || {}; ln2.cfgSet[field] = raw !== "";
    }
    if (field === "price"){
      var prod = C.productById(state, ln2.productId), conf = C.priceFor(prod, ln2);
      ln2.priceOverridden = !(ln2.price === null || conf === null || Number(ln2.price) === Number(conf));
    } else if (field !== "cost" && !ln2.priceOverridden) ln2.price = null;
    commit(); return;
  }
  var value = raw === "" ? (num ? null : "") : (num ? Number(raw) : raw);
  V.setPath(state, bind, value);
  if (bind === "config.brandKey" || bind === "config.customBrandName"){
    state.config.logoMark = C.brandOfDealer(state.config).mark;
  }
  commit();
});

/* Money fields: the plain number while editing, "$42,995.00" otherwise (see moneyInput). */
function moneyShown(el, n){ var t = C.money(n); return el.getAttribute("data-money") === "sign" ? t : t.replace("$", ""); }
document.addEventListener("focusin", function(ev){
  var el = ev.target;
  if (!el || !el.hasAttribute || !el.hasAttribute("data-money")) return;
  var raw = el.getAttribute("data-raw") || "";
  if (el.value !== raw){ el.value = raw; try { el.select(); } catch (e) {} }
});
document.addEventListener("focusout", function(ev){
  var el = ev.target;
  if (!el || !el.hasAttribute || !el.hasAttribute("data-money")) return;
  var v = String(el.value).replace(/[$,\s]/g, "");
  if (v !== "" && !isNaN(Number(v))) el.value = moneyShown(el, Number(v));
});

