"use strict";
/* ---------------- PRINTS ---------------- */
function docHeader(title, sub){
  var b = V.brand(), c = state.config;
  return `<div class="dh"><div class="dlogo">${esc(c.logoMark||b.mark)}</div>
    <div style="flex:1"><h1>${esc(c.name)}</h1>
      <div style="font-size:11px;color:#667085">${esc(b.finLabel)} · ${esc(c.address)} · ${esc(c.city)} · ${esc(c.phone)} · Dealer ${esc(c.dealerCode)}</div></div>
    <div style="text-align:right"><div style="font-weight:700">${esc(title)}</div>
      <div style="font-size:11px;color:#667085">${esc(sub)}</div></div></div>`;
}
function packagesOfLine(L){
  if (L.cfg.declined) return "DECLINED";
  var p = L.cfg.packages || {};
  return D.PACKAGES.filter(function(def){ return p[def.key]; }).map(function(def){ return def.suffix; }).join(", ") || "—";
}
/* Promotional offers and bundle savings, boxed so they stand out on the internal print.
   onlyKey = the package the customer chose (or null to list every package). */
function offersPrintBlock(t, onlyKey){
  var pk = t.packages.filter(function(p){ return !onlyKey || p.key === onlyKey; });
  var gifts = [], seen = {};
  pk.forEach(function(p){ (p.gifts || []).forEach(function(g){
    if (!seen[g.id]){ seen[g.id] = { g:g, pkgs:[] }; gifts.push(seen[g.id]); }
    seen[g.id].pkgs.push(p.label);
  }); });
  var disc = pk.filter(function(p){ return p.discount > 0; });
  if (!gifts.length && !disc.length) return "";
  var cap = function(x){ return String(x || "").split(" ").map(function(w){ return w.charAt(0) + w.slice(1).toLowerCase(); }).join(" "); };
  var rows = gifts.map(function(e){
    var c = Number(e.g.cost);
    return `<tr><td><span class="offertag">PROMO</span> <strong>${esc(e.g.name)}</strong></td><td>${esc(e.pkgs.map(cap).join(", "))}</td>
      <td style="text-align:right">${c > 0 ? money(c) : `<span style="color:#b45309;font-weight:700">No cost entered</span>`}</td></tr>`;
  }).concat(disc.map(function(p){
    return `<tr><td><span class="offertag">SAVINGS</span> <strong>Bundle savings</strong> — ${String(p.discountPct).replace(/\.0$/,"")}%</td><td>${esc(cap(p.label))}</td>
      <td style="text-align:right">−${money(p.discount)} <span style="color:#667085">(${money(p.listSub)} → ${money(p.sub)})</span></td></tr>`;
  })).join("");
  var totalCost = gifts.reduce(function(a, e){ return a + (Number(e.g.cost) || 0); }, 0);
  return `<div class="offerbox"><div class="offerbox-h"><span>Promotional offers &amp; savings</span>${gifts.length ? `<span>Offer cost ${money(totalCost)}</span>` : ""}</div>
    <table><thead><tr><th>Offer</th><th>Package</th><th style="text-align:right">Dealer cost / discount</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function internalPrintSelected(tx, t, u, pkg){
  var savedAt = new Date().toLocaleString("en-CA");
  var rows = pkg.lines.map(function(L){
    return `<tr><td>${esc(L.product.name)}</td>
      <td>${esc(pkg.label)}</td><td>${esc(V.lineConfigText(L))||"—"}</td>
      <td style="text-align:right">${L.price===null?"NOT SET":money(L.price)}</td>
      <td style="text-align:right">${L.gross===null?"—":money(L.gross)}</td></tr>`;
  }).join("");
  var termCols = tx.type==="Cash" ? "" : t.terms.map(function(tm){
    var r = (tx.finance.rates||{})[tm];
    var bq = t.baseQuotes.filter(function(x){ return x.term === tm; })[0];
    return `<div><div class="lbl">${tm} MONTHS</div><div>@ ${r!==undefined&&r!==null&&r!==""?r+"%":"—"} · ${bq&&bq.basePayment!==null?money(bq.basePayment)+" "+C.freqLabel(bq.frequency):"—"}</div></div>`;
  }).join("");
  var pkgQuotes = pkg.quotes.filter(function(q){ return q.payment !== null; });
  return `<div class="doc">
    ${docHeader("F&I Transaction Detail", "Deal "+tx.id+" · "+C.fmtDate(tx.createdAt))}
    <div class="cols">
      <div><div class="lbl">CUSTOMER</div><div><strong>${esc(tx.customer.name||"—")}</strong></div></div>
      <div><div class="lbl">VEHICLE</div><div><strong>${esc(tx.vehicle.year+" "+tx.vehicle.make+" "+tx.vehicle.model)}</strong></div></div>
      <div><div class="lbl">VIN</div><div>${esc(tx.vehicle.vin||"—")}</div></div>
      <div><div class="lbl">STOCK #</div><div>${esc(tx.vehicle.stock||"—")}</div></div>
      <div><div class="lbl">F&amp;I MANAGER</div><div>${esc(u.name)}</div></div>
      <div><div class="lbl">SAVED</div><div>${esc(savedAt)}</div></div>
    </div>
    <h3>Base Vehicle Payment</h3>
    <div class="cols">
      <div><div class="lbl">MODE</div><div>${esc(tx.type)}</div></div>
      <div><div class="lbl">VEHICLE PRICE</div><div>${money(t.vehiclePrice)}</div></div>
      <div><div class="lbl">TRADE-IN</div><div>${money(t.tradeAllowance)}</div></div>
      <div><div class="lbl">DOWN PAYMENT</div><div>${money(t.downPayment)}</div></div>
      ${termCols}
    </div>
    <div class="selectbox">
      ${tx.type==="Cash"
        ? `<div><div class="lbl">DEAL TYPE</div><div class="big">Paid in full</div></div>
           <div><div class="lbl">TOTAL DUE WITH SELECTED PACKAGE</div><div class="big">${money(pkg.dueTotal)}</div></div>`
        : `<div><div class="lbl">TERM${t.terms.length>1?"S":""} PRESENTED</div><div class="big">${t.terms.length?t.terms.map(function(tm){ return tm+" Months"; }).join(", "):"—"}</div></div>
           <div><div class="lbl">PAYMENT WITH SELECTED PACKAGE</div>
             ${pkgQuotes.length ? pkgQuotes.map(function(q){ return `<div class="big">${money(q.payment)} <span class="unit">${C.freqLabel(q.frequency)}</span></div>`; }).join("") : `<div class="big">—</div>`}
           </div>`}
    </div>
    <h3>Final Package</h3>
    <div class="cols">
      <div><div class="lbl">CUSTOMER SELECTED PACKAGE</div><div><strong>${esc(pkg.label)}</strong></div></div>
      <div><div class="lbl">${tx.type==="Cash"?"TOTAL DUE":"PACKAGE PAYMENT"}</div><div>${tx.type==="Cash" ? money(pkg.dueTotal) : (pkgQuotes.length ? money(pkgQuotes[0].payment)+" "+C.freqLabel(pkgQuotes[0].frequency) : "—")}</div></div>
    </div>
    ${offersPrintBlock(t, pkg.key)}
    <h3>Products &amp; Dispositions</h3>
    <table><thead><tr><th>Product</th><th>Package Selected</th><th>Coverage</th><th style="text-align:right">Deal Price</th><th style="text-align:right">Gross</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">Nothing is assigned to this package.</td></tr>`}</tbody></table>
    <div class="cols" style="margin-top:14px;margin-bottom:0">
      <div><div class="lbl">SELECTED PACKAGE TOTAL</div><div><strong>${money(pkg.total)}</strong></div></div>
      <div><div class="lbl">SELECTED PACKAGE GROSS</div><div><strong>${money(pkg.gross)}</strong></div></div>
    </div>
    <div class="watermark">INTERNAL COPY · NOT A CONTRACT</div></div>`;
}
function internalPrint(tx){
  var t = C.totals(state, tx), u = userById(tx.fsmUserId);
  var selKey = tx.display.selection ? tx.display.selection.package : null;
  var selPkg = selKey ? t.packages.filter(function(p){ return p.key === selKey; })[0] : null;
  if (selPkg) return internalPrintSelected(tx, t, u, selPkg);
  return `<div class="doc">
    ${docHeader("FSM transaction record — internal", "Deal "+tx.id+" · "+C.fmtDate(tx.createdAt))}
    <div class="cols">
      <div><div class="lbl">CUSTOMER</div><div><strong>${esc(tx.customer.name||"—")}</strong></div>
        <div>${esc(tx.customer.phone||"")}</div><div>${esc(tx.customer.email||"")}</div><div>${esc(tx.customer.address||"")}</div></div>
      <div><div class="lbl">VEHICLE</div><div><strong>${esc(tx.vehicle.year+" "+tx.vehicle.make+" "+tx.vehicle.model)}</strong></div>
        <div>Stock ${esc(tx.vehicle.stock||"—")} · ${esc(tx.vehicle.condition)}</div><div>VIN ${esc(tx.vehicle.vin||"—")}</div>
        <div>Odometer ${esc(tx.vehicle.odometer||0)} km</div></div>
      <div><div class="lbl">TRANSACTION</div><div>Type ${esc(tx.type)}</div>
        <div>${tx.type==="Cash" ? "Paid in full — no financing" : "Terms presented "+(t.terms.length?t.terms.join(", ")+" months":"—")}</div>
        ${tx.type==="Cash" ? "" : `<div>Rates ${t.terms.length ? t.terms.map(function(tm){ var r=(tx.finance.rates||{})[tm]; return tm+" mo @ "+(r!==undefined&&r!==null&&r!==""?r+"%":"—"); }).join(", ") : "—"} · ${t.frequency?C.freqLabel(t.frequency):"—"}</div>`}
        <div>Finance Manager ${esc(u.name)} (${esc(V.roleLabel(u.role))})</div></div>
    </div>
    ${offersPrintBlock(t, t.selectedPackage && t.selectedPackage !== "none" ? t.selectedPackage : null)}
    <h3>Products</h3>
    <table><thead><tr><th>Product</th><th>Term</th><th>Kilometres</th><th>Interval</th><th>Deductible</th><th>Packages</th>
      <th style="text-align:right">Retail</th><th style="text-align:right">Tax rate</th><th style="text-align:right">Tax</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${t.lines.length ? t.lines.map(function(L){ return `<tr>
        <td>${esc(L.product.name)}</td><td>${L.cfg.term?L.cfg.term+" Months":"—"}</td><td>${L.cfg.km?km(L.cfg.km):"—"}</td>
        <td>${L.cfg.interval?km(L.cfg.interval):"—"}</td>
        <td>${L.product.uses.deductible && L.cfg.deductible!==null && L.cfg.deductible!=="" ? "$"+L.cfg.deductible : "—"}</td>
        <td>${esc(packagesOfLine(L))}</td>
        <td style="text-align:right">${L.price===null?"NOT SET":money(L.price)}</td>
        <td style="text-align:right">${L.ratePct}%</td><td style="text-align:right">${money(L.tax)}</td>
        <td style="text-align:right">${money(L.total)}</td></tr>`; }).join("") : `<tr><td colspan="10">No products on this transaction.</td></tr>`}
      </tbody></table>
    <h3 style="margin-top:16px">Packages presented</h3>
    <table><thead><tr><th>Package</th><th style="text-align:right">Products</th><th style="text-align:right">Total with tax</th><th style="text-align:right">Gross</th>
      ${tx.type==="Cash" ? `<th style="text-align:right">Total due</th>` : t.terms.map(function(tm){ return `<th style="text-align:right">${tm} Months</th>`; }).join("")}</tr></thead>
      <tbody>${t.packages.map(function(p){ return `<tr><td>${esc(p.label)}</td><td style="text-align:right">${p.count}</td>
        <td style="text-align:right">${money(p.total)}</td><td style="text-align:right">${money(p.gross)}</td>
        ${tx.type==="Cash" ? `<td style="text-align:right"><strong>${money(p.dueTotal)}</strong></td>` : t.terms.map(function(tm){
          var q = p.quotes.filter(function(x){ return x.term === tm; })[0];
          return `<td style="text-align:right">${q?money(q.payment):"—"}</td>`; }).join("")}</tr>`; }).join("")}
      </tbody></table>
    <div class="cols" style="margin-top:16px">
      <div><div class="lbl">PRODUCT TOTALS</div>
        <div class="kv"><span class="k">Subtotal</span><span>${money(t.productsSub)}</span></div>
        ${t.productsDiscount > 0 ? `<div class="kv"><span class="k">Discount</span><span>−${money(t.productsDiscount)}</span></div>` : ""}
        <div class="kv"><span class="k">Standard tax ${state.config.tax.standard}%</span><span>${money(t.taxStandard)}</span></div>
        <div class="kv"><span class="k">VRC tax ${state.config.tax.vrc}%</span><span>${money(t.taxVrc)}</span></div>
        <div class="kv total"><span>Products total</span><span>${money(t.productsTotal)}</span></div>
        <div class="kv"><span class="k">Product cost</span><span>${money(t.productCost)}</span></div>
        ${t.giftCost > 0 ? `<div class="kv"><span class="k">Promotional offer cost</span><span>${money(t.giftCost)}</span></div>` : ""}
        <div class="kv"><span class="k">Product gross</span><span>${money(t.productGross)}</span></div></div>
      <div><div class="lbl">DEAL STRUCTURE</div>
        <div class="kv"><span class="k">Selling price</span><span>${money(t.vehiclePrice)}</span></div>
        <div class="kv"><span class="k">Administration fee</span><span>${money(t.adminFee)}</span></div>
        <div class="kv"><span class="k">Trade allowance</span><span>${money(t.tradeAllowance)}</span></div>
        <div class="kv"><span class="k">Trade payout</span><span>${money(t.tradePayout)}</span></div>
        <div class="kv"><span class="k">Vehicle tax ${state.config.tax.standard}%</span><span>${money(t.vehicleTax)}</span></div>
        <div class="kv"><span class="k">Licensing</span><span>${money(t.licensing)}</span></div>
        <div class="kv"><span class="k">${tx.type==="Cash"?"Deposit":"Cash down"}</span><span>${money(t.downPayment)}</span></div>
        ${t.fees.map(function(f){ return `<div class="kv"><span class="k">${esc(f.name)} (non-taxable)</span><span>${money(Number(f.amount)||0)}</span></div>`; }).join("")}
        ${t.feeAmount ? `<div class="kv"><span class="k">Fees (non-taxable)</span><span>${money(t.feeAmount)}</span></div>` : ""}
        <div class="kv total"><span>${tx.type==="Cash"?"Due at signing with all products":"Financed with all products"}</span><span>${money(tx.type==="Cash"?t.cashDueTotal:t.amountFinanced)}</span></div></div>
      <div><div class="lbl">${tx.type==="Cash"?"AMOUNT DUE":"PAYMENTS, ALL PRODUCTS"}</div>
        ${tx.type==="Cash"
          ? `<div class="kv"><span class="k">Paid in full at signing</span><span>${money(t.cashDueTotal)}</span></div>`
          : (t.quotes.length ? t.quotes.map(function(q){ return `<div class="kv"><span class="k">${q.term} months</span><span>${money(q.payment)} ${C.freqLabel(q.frequency)}</span></div>`; }).join("") : `<div class="kv"><span class="k">No term selected</span><span>—</span></div>`)}
        <div style="margin-top:18px;border-top:1px solid #111;padding-top:4px;font-size:10px;color:#667085">FSM signature</div></div>
    </div>
    <div class="watermark">INTERNAL COPY · NOT A CONTRACT</div></div>`;
}
function customerPrint(tx){
  var t = C.totals(state, tx), b = V.brand(), c = state.config;
  var shown = V.packagesToShow(t, tx);
  var ink = V.brandInk(), base = ink.hue, deep = ink.bandA, band = ink.bandB;
  var first = tx.customer.name ? tx.customer.name.split(" ")[0] : "";
  var veh = [tx.vehicle.year, tx.vehicle.make, tx.vehicle.model].filter(Boolean).join(" ");
  var fm = userById(tx.fsmUserId);
  var when = C.fmtDate(tx.createdAt || C.todayISO());
  var addr = [c.name, [c.address, c.city].filter(Boolean).join(", "), c.phone].filter(Boolean).map(esc).join(" · ");
  var blocks = shown.length ? shown.map(function(p){
    var items = p.lines.map(function(L){
      var cfg = V.lineConfigText(L, true);
      return `<div class="cb-item"><span class="cb-dot" style="background:${base}">✓</span><div><b>${esc(L.product.name)}</b>${cfg ? `<div class="cb-d">${esc(cfg)}</div>` : ""}</div></div>`;
    }).join("");
    var pay = "";
    if (tx.display.showPayment && tx.type === "Cash") pay = `<div class="cb-amt">${money(p.dueTotal)}</div><div class="cb-small">due in full at signing</div>`;
    else if (tx.display.showPayment && p.quotes && p.quotes.length) pay = p.quotes.map(function(q){
      return `<div class="cb-amt">${q.payment === null ? "—" : money(q.payment)}</div><div class="cb-small">${C.freqLabel(q.frequency)} · ${q.term} months · taxes included</div>`; }).join("");
    var chips = (p.discount > 0 ? `<div class="cb-chip">Bundle savings applied</div><br>` : "")
      + (p.gifts || []).map(function(g){ return `<div class="cb-chip">Promotional offer · ${esc(g.name)}</div>`; }).join("<br>");
    return `<div class="cb-main">
      <div class="cb-cov"><h3 style="color:${base}">Your coverage</h3>${items || `<div class="cb-small">No products in this package.</div>`}</div>
      <div class="cb-side"><div class="cb-pn" style="color:${base}">${esc(p.label)}</div>${pay}${chips}</div></div>`;
  }).join("") : `<p style="margin-top:22px">No protection products were selected on this deal.</p>`;
  return `<div class="doc custb">
    <div class="cb-band" style="background:linear-gradient(120deg,${deep},${band})">
      <div class="cb-row"><div class="cb-dn">${esc(c.name)}</div><div class="cb-fin">${esc(b.finLabel)}</div></div>
      <h1 class="cb-h">${first ? "Congratulations, " + esc(first) : "Your Protection Summary"}</h1>
      <div class="cb-sub">${veh ? "Your " + esc(veh) + " is protected. " : ""}Here is a summary of what you chose today.</div>
    </div>
    <div class="cb-body">
      <div class="cb-facts">
        <div><div class="cb-k">Prepared for</div><div class="cb-v">${esc(tx.customer.name || "—")}</div></div>
        <div><div class="cb-k">Vehicle</div><div class="cb-v">${esc(veh || "—")}</div></div>
        <div><div class="cb-k">Date</div><div class="cb-v">${esc(when)}</div></div>
        <div><div class="cb-k">Finance Manager</div><div class="cb-v">${esc(fm && fm.name && fm.name !== "Unassigned" ? fm.name : "—")}</div></div>
      </div>
      ${blocks}
      <div class="cb-sig"><div>Customer signature &amp; date</div><div>Finance Manager signature &amp; date</div></div>
    </div>
    <div class="cb-foot">${addr}<br>This summary is for your records and is not a contract. Full terms, conditions and claim instructions are in your signed coverage agreements.</div>
  </div>`;
}

