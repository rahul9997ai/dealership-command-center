/* =====================================================================
   Layer 4: PRODUCTS, REPORTS, USERS, DEALERSHIPS, SETTINGS,
            PRINTS, EMAIL, ROUTER, EVENTS, BOOT
   ===================================================================== */
"use strict";
var D = window.__DCC_DATA__, C = window.__DCC_CORE__, V = window.__DCC_VIEW1__;
var state = V.state, esc = C.esc, money = C.money, money0 = C.money0, km = C.km;
var userById = V.userById, commit = V.commit, toast = V.toast;


/* The app's own styles as text (for the pop-out customer windows, which need them inline). */
function appCssText(){
  var out = [];
  Array.prototype.forEach.call(document.styleSheets, function(sh){
    try { Array.prototype.forEach.call(sh.cssRules, function(r){ out.push(r.cssText); }); } catch (e) {}
  });
  return out.join("\n");
}
