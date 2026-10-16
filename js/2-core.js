/* =====================================================================
   Layer 2: STATE HELPERS + THE SHARED CALCULATION ENGINE
   One transaction, one engine. FSM display, customer display, prints,
   the emailed presentation and reporting all read these functions.
   ===================================================================== */
(function () {
"use strict";
var D = window.__DCC_DATA__;

function clone(o){ return JSON.parse(JSON.stringify(o)); }
function uid(p){ return p + "-" + Math.random().toString(36).slice(2,8); }
function money(n){ if (n === null || n === undefined || isNaN(n)) return "—";
  return "$" + Number(n).toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function money0(n){ if (n === null || n === undefined || isNaN(n)) return "—";
  return "$" + Math.round(Number(n)).toLocaleString("en-CA"); }
function km(n){ return Number(n).toLocaleString("en-CA") + " km"; }
function esc(s){ return String(s === null || s === undefined ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
/* The local calendar date (YYYY-MM-DD). toISOString() would give the UTC date,
   which in Ontario is already tomorrow from 8 PM (7 PM in winter). */
function localISO(d){ return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function todayISO(){ return localISO(new Date()); }
function fmtDate(iso){ if(!iso) return "—";
  var d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  return d.toLocaleDateString("en-CA",{year:"numeric",month:"short",day:"2-digit"}); }
function freqLabel(f){ return f === "biweekly" ? "bi-weekly" : "monthly"; }

function newTransaction(fsmUserId, dealershipId){
  return {
    id: uid("AX"), createdAt: todayISO(), type:"Finance", status:"Open",
    fsmUserId: fsmUserId || null, dealershipId: dealershipId || null,
    customer:{ id:null, name:"", phone:"", email:"", address:"" },
    vehicle:{ id:null, year:"", make:"", model:"", stock:"", vin:"", odometer:"", condition:"New", price:null },
    finance:{ tradeAllowance:0, tradePayout:0, downPayment:0, fees:[], feeAmount:0, rates:{}, terms:[], frequency:null },
    cash:{ tradeAllowance:0, tradePayout:0, downPayment:0, feeAmount:0 },
    lines:[],   /* { lineId, productId, term, km, interval, deductible, price, priceOverridden, packages{} } */
    display:{ mode:"welcome", showPayment:true, showPrices:false, showConfig:false, selection:null },
    offers:{ discount:{ enabled:false, scope:"package", type:"percent", deal:0, packages:{ preferred:0, essential:0, basic:0 } }, gifts:[] }
  };
}
function primaryTerm(tx){
  var ts = (tx.finance.terms || []).slice().sort(function(a,b){ return a-b; });
  return ts.length ? ts[0] : null;
}
function sortedTerms(tx){ return (tx.finance.terms || []).slice().sort(function(a,b){ return a-b; }); }

function productById(state, id){
  for (var i=0;i<state.products.length;i++) if (state.products[i].id === id) return state.products[i];
  return null;
}
function priceFor(product, line){
  if (!product || !product.pricing) return null;
  var p = product.pricing, total = Number(p.base || 0), part;
  function need(flag, key, val){
    if (!flag) return true;
    if (val === null || val === undefined || val === "") return false;
    part = p[key] ? p[key][val] : undefined;
    if (part === undefined) return false;
    total += part; return true;
  }
  if (!need(product.uses.term, "term", line.term)) return null;
  if (!need(product.uses.km, "km", line.km)) return null;
  if (!need(product.uses.interval, "interval", line.interval)) return null;
  if (!need(product.uses.deductible, "deductible", line.deductible)) return null;
  return Math.round(total);
}
function taxRateFor(product, taxCfg){
  if (!product || product.taxRule === "exempt") return 0;
  if (product.taxRule === "vrc") return Number(taxCfg.vrc)/100;
  return Number(taxCfg.standard)/100;
}
function periodsPerYear(freq){ return freq === "biweekly" ? 26 : 12; }
function payment(principal, aprPct, months, freq){
  if (!principal || principal <= 0 || !months) return 0;
  var ppy = periodsPerYear(freq), n = Math.round(months/12*ppy), r = (Number(aprPct)||0)/100/ppy;
  if (n <= 0) return 0;
  if (r === 0) return principal / n;
  return principal * r / (1 - Math.pow(1+r,-n));
}
/* A dealership's brand: a listed brand, or "custom" (its own name), with an optional
   header text that overrides the default lender line on the customer display. */
function brandOfDealer(d){
  d = d || {};
  var base;
  if (d.brandKey === "custom"){
    var nm = String(d.customBrandName || "").trim() || "Dealership";
    base = { key:"custom", label:nm, mark:nm.slice(0,3).toUpperCase(), color:"#2c5a9b", finLabel:"FINANCIAL SERVICES" };
  } else base = D.BRANDS[d.brandKey] || D.BRANDS.nissan;
  var t = String(d.headerTitle || "").trim();
  return t ? Object.assign({}, base, { finLabel:t.toUpperCase() }) : base;
}
function brandOf(state){ return brandOfDealer(state.config || {}); }
function packageLabel(state, suffix){
  return (brandOf(state).label + " " + suffix).toUpperCase();
}

/* -------- offers: a real discount and complimentary gifts --------
   The discount is a genuine price reduction: it lowers the package subtotal,
   the tax on it, the amount financed and the payments, and it flows into
   reports. Gifts are free to the customer; their cost (if entered) comes off
   the dealer's gross. Older deals have no offers, so read them defensively. */
function normOffers(o){
  o = o || {};
  var d = o.discount || {};
  var pk = d.packages || {};
  var vals = { preferred:Number(pk.preferred)||0, essential:Number(pk.essential)||0, basic:Number(pk.basic)||0 };
  var anyVal = (Number(d.deal) || 0) > 0 || vals.preferred > 0 || vals.essential > 0 || vals.basic > 0;
  return {
    discount:{ enabled: d.enabled === undefined ? anyVal : !!d.enabled,
      scope: d.scope === "deal" ? "deal" : "package", type: d.type === "amount" ? "amount" : "percent",
      deal: Number(d.deal) || 0, packages:vals },
    gifts: Array.isArray(o.gifts) ? o.gifts : []
  };
}
function discountFor(o, pkgKey, base){
  var d = o.discount, v = d.scope === "deal" ? d.deal : (d.packages[pkgKey] || 0);
  if (!d.enabled || !(v > 0) || !(base > 0)) return 0;
  var amt = d.type === "percent" ? base * Math.min(v, 100) / 100 : v;
  return Math.round(Math.min(amt, base) * 100) / 100;
}
function giftsFor(o, pkgKey){
  return o.gifts.filter(function(g){ return g && g.name && g.packages && g.packages[pkgKey]; });
}
function giftCostOf(list){ return Math.round(list.reduce(function(a, g){ return a + (Number(g.cost) || 0); }, 0) * 100) / 100; }

function hasListCost(prod){ return !!prod && prod.cost !== null && prod.cost !== undefined && prod.cost !== "" && !isNaN(Number(prod.cost)); }

/* -------- the single totals engine -------- */
function totals(state, tx){
  var taxCfg = state.config.tax, fin = state.config.finance;
  var lines = [], sub = 0, taxStd = 0, taxVrc = 0, cost = 0, unpriced = 0, i;
  /* Which package did the customer actually buy? Until one is recorded every packaged product counts
     (older deals); once recorded, only that package's products are "sold". "none" = nothing bought. */
  var selRaw = (tx.display && tx.display.selection) ? tx.display.selection.package : null;
  var selKey = (selRaw === "preferred" || selRaw === "essential" || selRaw === "basic" || selRaw === "none") ? selRaw : null;
  var presentedTerms = sortedTerms(tx);

  for (i=0;i<tx.lines.length;i++){
    var l = tx.lines[i], prod = productById(state, l.productId);
    if (!prod) continue;
    if (!l.packages) l.packages = { preferred:true, essential:false, basic:false };
    if (l.declined === undefined) l.declined = false;
    var configured = priceFor(prod, l);
    var price = (l.price === null || l.price === undefined || l.price === "") ? configured : Number(l.price);
    var rate = taxRateFor(prod, taxCfg);
    var priced = !(price === null || price === undefined || isNaN(price));
    var anyPkg = l.packages.preferred || l.packages.essential || l.packages.basic;
    if (!priced && !l.declined && anyPkg) unpriced++;
    var amount = priced ? price : 0;
    var tax = Math.round(amount*rate*100)/100;
    /* Cost is a flat dollar figure for providing this product on the deal —
       it does not scale with whichever term/km/deductible the customer
       picked. Real per-tier dealer cost sheets exist, but the FSM asked for
       one simple optional number rather than a full cost table; that's a
       future refinement (mirroring the pricing table) if ever needed. */
    /* Dealer cost comes from the product list; if the list has none, the Finance Manager can
       enter one for this deal only (line.cost). Missing cost still counts as $0. */
    var listCost = hasListCost(prod);
    var lineCost = priced ? (listCost ? Number(prod.cost) : (Number(l.cost) || 0)) : 0;
    var sold = !l.declined && anyPkg && (selKey === null || (selKey !== "none" && !!l.packages[selKey]));
    if (sold){
      if (prod.taxRule === "vrc") taxVrc += tax; else taxStd += tax;
      sub += amount; cost += lineCost;
    }
    var termForDay = (prod.uses.term && l.term) ? Number(l.term) : (primaryTerm(tx) || 60);
    var days = termForDay * 30.44;
    var perDay = (priced && days > 0) ? Math.round((amount/days)*100)/100 : null;
    var perDayByTerm = (presentedTerms.length ? presentedTerms : [termForDay]).map(function(tm){
      var d = tm * 30.44;
      return { term:tm, perDay: (priced && d > 0) ? Math.round((amount/d)*100)/100 : null };
    });
    lines.push({ lineId:l.lineId, product:prod, cfg:l, price: priced ? amount : null, configuredPrice:configured,
      sold:sold, costMissing: !listCost && !(Number(l.cost) > 0), overridden: !!l.priceOverridden, rate:rate, ratePct:Math.round(rate*10000)/100, tax:tax, perDayByTerm:perDayByTerm,
      total:Math.round((amount+tax)*100)/100, cost:lineCost, gross:priced?Math.round((amount-lineCost)*100)/100:null, perDay:perDay });
  }

  var productsSub = Math.round(sub*100)/100;
  var offers = normOffers(tx.offers);
  var aggDisc = 0, aggGifts;
  if (offers.discount.scope === "deal") aggDisc = discountFor(offers, null, productsSub);
  else if (selKey){
    var selBase = 0;
    lines.forEach(function(L){ if ((L.cfg.packages||{})[selKey] && L.price !== null) selBase += L.price; });
    aggDisc = Math.min(discountFor(offers, selKey, selBase), productsSub);
  }
  aggGifts = selKey ? giftsFor(offers, selKey)
    : offers.gifts.filter(function(g){ return g && g.name && g.packages && g.packages.preferred && g.packages.essential && g.packages.basic; });
  var aggGiftCost = giftCostOf(aggGifts);
  var aggFactor = productsSub > 0 ? (productsSub - aggDisc) / productsSub : 1;
  taxStd = taxStd * aggFactor; taxVrc = taxVrc * aggFactor;
  var productsNet = Math.round((productsSub - aggDisc)*100)/100;
  var productsTax = Math.round((taxStd+taxVrc)*100)/100;
  var productsTotal = Math.round((productsNet+productsTax)*100)/100;

  var vPrice = Number(tx.vehicle.price)||0;
  /* No vehicle price yet means there's no deal to speak of — don't let the
     admin fee/licensing/tax show up as a phantom balance on a brand new,
     untouched transaction before the FSM has entered anything. */
  var adminFee = vPrice > 0 ? (Number(fin.adminFee)||0) : 0, lic = vPrice > 0 ? (Number(fin.licensing)||0) : 0;
  var isCash = tx.type === "Cash";
  var src = isCash ? (tx.cash||{}) : tx.finance;
  var tradeAll = Number(src.tradeAllowance)||0, tradePay = Number(src.tradePayout)||0, down = Number(src.downPayment)||0;
  var fees = isCash ? [] : (tx.finance.fees || []);
  var feeAmount = Number(src.feeAmount) || 0;
  var feesTotal = Math.round((fees.reduce(function(sum, f){ return sum + (Number(f.amount)||0); }, 0) + feeAmount) * 100) / 100;
  var taxableVehicle = Math.max(0, vPrice + adminFee - tradeAll);
  var vehicleTax = Math.round(taxableVehicle*(Number(taxCfg.standard)/100)*100)/100;
  var baseAmount = Math.max(0, vPrice + adminFee + vehicleTax + lic - tradeAll + tradePay - down + feesTotal);
  var financed = isCash ? null : Math.round((baseAmount + productsTotal)*100)/100;
  var cashDueTotal = isCash ? Math.round((baseAmount + productsTotal)*100)/100 : null;

  var terms = isCash ? [] : presentedTerms, rates = isCash ? {} : (tx.finance.rates || {});
  var freq = isCash ? null : (tx.finance.frequency || null);

  function quotesFor(extraTotal){
    if (isCash || !freq || !terms.length) return [];
    return terms.map(function(tm){
      var rateRaw = rates[tm];
      var hasRate = !(rateRaw === undefined || rateRaw === null || rateRaw === "");
      var rate = hasRate ? Number(rateRaw) : null;
      var paymentsCount = Math.round(tm/12*periodsPerYear(freq));
      if (!hasRate){
        return { term:tm, frequency:freq, rate:null, basePayment:null, payment:null, difference:null, paymentsCount:paymentsCount };
      }
      var base = payment(baseAmount, rate, tm, freq);
      var full = payment(baseAmount + extraTotal, rate, tm, freq);
      return { term:tm, frequency:freq, rate:rate, basePayment:Math.round(base*100)/100,
        payment:Math.round(full*100)/100, difference:Math.round((full-base)*100)/100,
        paymentsCount:paymentsCount };
    });
  }

  /* -------- the three presentation packages -------- */
  var anyPackaged = lines.some(function(L){
    var p = L.cfg.packages || {}; return p.preferred || p.essential || p.basic;
  });
  var packages = D.PACKAGES.map(function(def){
    var pl = lines.filter(function(L){ return (L.cfg.packages||{})[def.key]; });
    var s = 0, tx1 = 0, c = 0, missing = false;
    pl.forEach(function(L){
      if (L.price === null) { missing = true; return; }
      s += L.price; tx1 += L.tax; c += L.cost;
    });
    var listSub = Math.round(s*100)/100;
    var disc = discountFor(offers, def.key, listSub);
    var pf = listSub > 0 ? (listSub - disc) / listSub : 1;
    var netSub = Math.round((listSub - disc)*100)/100, netTax = Math.round(tx1*pf*100)/100;
    var pGifts = giftsFor(offers, def.key), pGiftCost = giftCostOf(pGifts);
    var tot = Math.round((netSub+netTax)*100)/100;
    return { key:def.key, suffix:def.suffix, blurb:def.blurb, label:packageLabel(state, def.suffix),
      lines:pl, count:pl.length, hasUnpriced:missing,
      listSub:listSub, discount:disc, discountPct: listSub > 0 ? Math.round(disc/listSub*1000)/10 : 0,
      gifts:pGifts, giftCost:pGiftCost,
      sub:netSub, tax:netTax, total:tot,
      cost:c, gross:Math.round((netSub-c-pGiftCost)*100)/100, quotes:quotesFor(tot),
      dueTotal: isCash ? Math.round((baseAmount+tot)*100)/100 : null };
  });

  return {
    lines:lines, soldLines:lines.filter(function(L){ return L.sold; }), selectedPackage:selKey, unpricedCount:unpriced, packages:packages, packagesUsed:anyPackaged,
    productsSub:productsSub, productsDiscount:aggDisc, productsNet:productsNet, giftCost:aggGiftCost, offers:offers,
    taxStandard:Math.round(taxStd*100)/100, taxVrc:Math.round(taxVrc*100)/100,
    productsTax:productsTax, productsTotal:productsTotal, productCost:cost,
    productGross:Math.round((productsNet-cost-aggGiftCost)*100)/100,
    vehiclePrice:vPrice, adminFee:adminFee, licensing:lic, vehicleTax:vehicleTax,
    tradeAllowance:tradeAll, tradePayout:tradePay, downPayment:down,
    baseAmount:Math.round(baseAmount*100)/100, amountFinanced:financed, isCash:isCash, cashDueTotal:cashDueTotal,
    fees:fees, feeAmount:feeAmount, feesTotal:feesTotal, terms:terms, term:primaryTerm(tx), rates:rates, frequency:freq,
    quotes:quotesFor(productsTotal), baseQuotes:quotesFor(0)
  };
}

/* Each error also comes back as an "issue" saying which step it belongs to and which field
   to jump to, so the Finance screen can mark the problem fields and scroll to the first one.
   step "fm" is the Finance Manager picker in the toolbar; 5 is the customer's package choice. */
function validate(state, tx){
  var t = totals(state, tx), errs = [], warns = [], issues = [];
  function fail(msg, step, target, more){
    errs.push(msg);
    var it = { msg:msg, step:step, target:target };
    for (var k in (more || {})) it[k] = more[k];
    issues.push(it);
  }
  if (!tx.fsmUserId) fail("Assign a Finance Manager to this deal before completing it.", "fm", '[data-bind="tx.fsmUserId"]');
  if (!tx.customer.name) fail("Add a customer before completing the transaction.", 1, '[data-bind="tx.customer.name"]');
  if (!tx.vehicle.model || !tx.vehicle.stock) fail("Enter the vehicle model and stock number.", 2,
    !tx.vehicle.model ? '[data-bind="tx.vehicle.model"]' : '[data-bind="tx.vehicle.stock"]');
  if (!tx.vehicle.price) fail("Enter the vehicle selling price.", 2, '[data-bind="tx.vehicle.price"]');
  if (tx.type !== "Cash"){
    if (!t.terms.length) fail("Select at least one finance term to present.", 3, "#term-chips");
    if (!tx.finance.frequency) fail("Select a payment frequency.", 3, "#freq-chips");
    t.terms.forEach(function(tm){
      var r = (tx.finance.rates || {})[tm];
      if (r === undefined || r === null || r === "") fail("Enter the interest rate for " + tm + " months.", 3, '[data-act="term-rate"][data-term="' + tm + '"]');
    });
  }
  if (t.packagesUsed && !t.selectedPackage) fail("Select the package the customer chose, or \"Customer didn't buy a package\", before completing the deal.", 5, "#step-choice");
  if (!tx.lines.length) warns.push("No products are selected. The customer display will show the welcome screen only.");
  else if (!t.packagesUsed) warns.push("No product has been assigned to a package yet, so the customer display is showing every selected product as one package.");
  for (var i=0;i<t.lines.length;i++){
    var L = t.lines[i], p = L.product, c = L.cfg;
    if (c.declined) continue;
    if (!(c.packages && (c.packages.preferred || c.packages.essential || c.packages.basic))) continue;
    var row = '.mg-row[data-pid="' + p.id + '"]', at = function(f){ return '[data-bind="line:' + c.lineId + ':' + f + '"]'; };
    var opt = { product:p.id, row:row, cfg:true };
    if (p.uses.term && !c.term) fail(p.name + ": select a term.", 4, at("term"), opt);
    if (p.uses.km && !c.km) fail(p.name + ": select kilometres.", 4, at("km"), opt);
    if (p.uses.interval && !c.interval) fail(p.name + ": select a maintenance interval.", 4, at("interval"), opt);
    if (p.uses.deductible && (c.deductible === null || c.deductible === undefined || c.deductible === "")) fail(p.name + ": select a deductible.", 4, at("deductible"), opt);
    if (L.price === null) fail(p.name + ": price is not configured — enter a price to continue.", 4, at("price"), { product:p.id, row:row });
  }
  return { ok: errs.length === 0, errors:errs, issues:issues, warnings:warns, totals:t };
}

/* Key-order-independent JSON: a deal that has been through the database (which reorders
   keys) must still compare equal to the same deal on screen. */
function stableJSON(v){
  if (v === null || v === undefined || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return "[" + v.map(stableJSON).join(",") + "]";
  return "{" + Object.keys(v).filter(function(k){ return v[k] !== undefined; }).sort()
    .map(function(k){ return JSON.stringify(k) + ":" + stableJSON(v[k]); }).join(",") + "}";
}
/* What a deal "says", ignoring bookkeeping (status, dates, who saved it) and which screen the
   customer display is on. Two deals with the same signature need no saving. */
function dealSig(d){
  if (!d) return "";
  var c = clone(d);
  delete c.status; delete c.createdAt; delete c.savedAt; delete c.savedBy;
  if (c.display) delete c.display.mode;
  c.offers = normOffers(c.offers);
  return stableJSON(c);
}


/* ---------------- CASH CONVERSION (cash-to-finance comparison) ----------------
   Calendar-year total returns in CAD, 1990–2025.
   S&P 500: total return in USD (Damodaran, NYU Stern) converted to CAD with
   December USD/CAD averages (Federal Reserve EXCAUS).
   S&P/TSX Composite: total return from 2018; before 2018 the price return plus
   an estimated 2.5% a year of dividends. */
var MARKET_FIRST_YEAR = 1990;
var MARKETS = {
  sp500: { label:"S&P 500", long:"S&P 500 (in Canadian dollars)", returns:[-3.14,28.7,19.28,15.01,5.78,35.22,22.04,39.44,38.79,15.32,-5.96,-8.55,-22.94,8.08,2.82,-0.11,14.78,-8.34,-21.89,7.57,9.85,3.66,12.07,42.04,23.05,20.55,8.72,16.41,0.77,28.6,14.79,28.38,-13.01,24.49,32.62,14.04] },
  tsx:   { label:"TSX", long:"S&P/TSX Composite (Canada)", returns:[-15.46,10.35,-2.11,31.48,0,14.36,28.24,15.53,-0.69,32.22,8.68,-11.44,-11.47,26.79,14.98,24.41,17.01,9.66,-32.53,33.19,16.44,-8.17,6.5,12.05,9.92,-8.59,20.01,8.53,-8.89,22.88,5.6,25.09,-5.84,11.75,21.65,31.46] }
};
function periodRate(pct, ppy){ return Math.pow(1 + pct/100, 1/ppy) - 1; }
function monthlyFromAnnual(pct){ return periodRate(pct, 12); }
/* One growth rate per payment period (12 or 26 a year), from the yearly returns. */
function marketPeriods(key, ppy){
  var out = [];
  MARKETS[key].returns.forEach(function(r){ var m = periodRate(r, ppy); for (var i = 0; i < ppy; i++) out.push(m); });
  return out;
}
function caFreq(o){ return o.freq === "biweekly" ? "biweekly" : "monthly"; }
/* The customer's cash goes into an investment account today and every car
   payment is taken out of that account. Paying cash leaves $0 to invest, so
   what is left (less any loan still owing) is the advantage of financing:
     advantage = investment earnings − loan interest paid − cash discount given up
   Everything steps one payment period at a time (monthly or bi-weekly).
   `start` (periods since Jan of MARKET_FIRST_YEAR) only labels the years. */
var CA_MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function caPeriodLabel(s, ppy){ ppy = ppy || 12; return CA_MON[Math.floor((s % ppy) * 12 / ppy)] + " " + (MARKET_FIRST_YEAR + Math.floor(s/ppy)); }
function caRun(o, rates, start){
  var freq = caFreq(o), ppy = periodsPerYear(freq);
  var amount = Number(o.amount)||0, lost = Number(o.lost)||0, cash = Math.max(0, amount - lost);
  var term = Number(o.term)||0, apr = Number(o.apr)||0, N = rates.length, n = Math.round(term/12*ppy);
  var pmt = payment(amount, apr, term, freq), lr = apr/100/ppy;
  var acct = cash, bal = amount, earnTot = 0, intTot = 0, paidTot = 0, payCount = 0, growthAll = 1;
  /* Budget view: the cash stays invested untouched (unt) and payments come from income;
     the cash buyer invests those same payments instead (port). unt − loan owing − port = advantage. */
  var unt = cash, port = 0;
  /* Taxable account: earnings are taxed as they are earned (0 = TFSA / RRSP). */
  var keep = 1 - Math.min(60, Math.max(0, Number(o.tax)||0))/100;
  var acctPath = [acct], loanPath = [bal], untPath = [unt], portPath = [0], years = [];
  var yr = { start:acct, earn:0, pay:0, int:0, growth:1, from:1 };
  for (var t = 1; t <= N; t++){
    var g = rates[t-1] * keep, e = acct * g;
    acct += e; earnTot += e; yr.earn += e; yr.growth *= 1 + g; growthAll *= 1 + g;
    unt *= 1 + g; port *= 1 + g;
    if (t <= n && bal > 0){
      var i = bal * lr, p = t === n ? bal + i : Math.min(pmt, bal + i);
      bal = bal + i - p; acct -= p; intTot += i; paidTot += p; yr.pay += p; yr.int += i; payCount++; port += p;
    }
    acctPath.push(acct); loanPath.push(bal); untPath.push(unt); portPath.push(port);
    if (t % ppy === 0 || t === N){
      var label = typeof start === "number"
        ? caPeriodLabel(start + yr.from - 1, ppy) + " – " + caPeriodLabel(start + t - 1, ppy) : null;
      years.push({ n:years.length + 1, label:label, ret:(yr.growth - 1)*100, start:yr.start, earn:yr.earn,
        pay:yr.pay, int:yr.int, end:acct, owing:bal, periods:t - yr.from + 1, unt:unt, port:port });
      yr = { start:acct, earn:0, pay:0, int:0, growth:1, from:t + 1 };
    }
  }
  return { acctPath:acctPath, loanPath:loanPath, years:years, cash:cash, lost:lost, earnings:earnTot, ppy:ppy,
    interestPaid:intTot, paid:paidTot, payCount:payCount, pmt:pmt, untouchedEarnings:cash * (growthAll - 1),
    untPath:untPath, portPath:portPath, untEnd:unt, portEnd:port, acctEnd:acct, owing:bal, adv:acct - bal };
}
/* The dealer loan paid as scheduled for `months`, then paid off in full: interest paid so far,
   the balance still to pay, and the number of payment periods made. */
function loanPayoff(amount, apr, term, freq, months){
  var ppy = periodsPerYear(freq), n = Math.round(term/12*ppy), k = Math.min(n, Math.round(months/12*ppy));
  var pmt = payment(amount, apr, term, freq), r = (Number(apr)||0)/100/ppy, bal = amount, intTot = 0, paid = 0;
  for (var t = 1; t <= k && bal > 0.005; t++){ var i = bal*r, p = Math.min(pmt, bal + i); bal = bal + i - p; intTot += i; paid += p; }
  return { months:months, periods:k, interest:intTot, balance:Math.max(0, bal), paid:paid };
}
/* The same loan with one extra lump-sum payment in month `atMonth`: the interest it saves and
   how many payment periods sooner the loan ends. */
function loanExtra(amount, apr, term, freq, extra, atMonth){
  var ppy = periodsPerYear(freq), n = Math.round(term/12*ppy), at = Math.max(1, Math.min(n, Math.round(atMonth/12*ppy)));
  var pmt = payment(amount, apr, term, freq), r = (Number(apr)||0)/100/ppy, bal = amount, intTot = 0, last = n;
  for (var t = 1; t <= n; t++){
    var i = bal*r, p = Math.min(pmt, bal + i); bal = bal + i - p; intTot += i;
    if (t === at) bal = Math.max(0, bal - (Number(extra)||0));
    if (bal <= 0.005){ last = t; break; }
  }
  var base = pmt*n - amount;
  return { interest:intTot, baseInterest:base, saved:Math.max(0, base - intTot), periods:last, n:n, sooner:n - last, ppy:ppy };
}
/* ---------------- PAYOFF CALCULATOR (loan amortization with lump sums) ----------------
   Works the way lenders (and the dealership's old Excel payoff sheet) do: the payment is rounded to
   the cent, each period's interest is rounded to the cent, and the last payment is exactly what is
   left. Corrected from the sheet: totals come from the schedule itself (the sheet used the unrounded
   payment), there is no 156-payment limit, an extra payment can never take the balance below zero,
   and a due date on the 29th–31st stays in its own month. */
var AMORT_PPY = { monthly:12, semimonthly:24, biweekly:26, weekly:52 };
function r2(v){ return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
function amortDate(first, k, freq){
  var d = new Date(first + "T12:00:00");
  if (freq === "weekly" || freq === "biweekly"){ d.setDate(d.getDate() + (k - 1)*(freq === "weekly" ? 7 : 14)); return localISO(d); }
  var step = freq === "semimonthly" ? Math.floor((k - 1)/2) : k - 1, day = d.getDate();
  var m = new Date(d.getFullYear(), d.getMonth() + step, 1, 12);
  m.setDate(Math.min(day, new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()));
  if (freq === "semimonthly" && (k - 1) % 2 === 1) m.setDate(m.getDate() + 14);
  return localISO(m);
}
/* o: { amount, apr, months, freq, first (YYYY-MM-DD), lumps:[{ at:payment number, amount }], every } */
function amortSchedule(o){
  var amount = r2(Number(o.amount) || 0), apr = Number(o.apr) || 0, months = Number(o.months) || 0;
  var freq = AMORT_PPY[o.freq] ? o.freq : "monthly", ppy = AMORT_PPY[freq];
  if (!(amount > 0) || !(months > 0) || apr < 0) return null;
  var n = Math.max(1, Math.round(months/12*ppy)), r = apr/100/ppy;
  var pmt = r2(r === 0 ? amount/n : amount*r/(1 - Math.pow(1 + r, -n)));
  var first = /^\d{4}-\d{2}-\d{2}$/.test(o.first || "") ? o.first : todayISO();
  var lumps = {};
  (o.lumps || []).forEach(function(x){ var k = Math.round(Number(x.at)), a = Number(x.amount) || 0; if (k >= 1 && a > 0) lumps[k] = (lumps[k] || 0) + a; });
  var every = Math.max(0, Number(o.every) || 0);
  var rows = [], bal = amount, intTot = 0, paidTot = 0, extraTot = 0;
  for (var k = 1; k <= n && bal > 0.004; k++){
    var it = r2(bal*r), owed = r2(bal + it);
    var pay = (k === n || pmt >= owed) ? owed : pmt;
    var princ = r2(pay - it);
    var ex = Math.max(0, r2(Math.min((lumps[k] || 0) + every, bal - princ)));
    bal = r2(bal - princ - ex);
    intTot += it; paidTot += pay + ex; extraTot += ex;
    rows.push({ k:k, date:amortDate(first, k, freq), pay:pay, extra:ex, interest:it, principal:r2(princ + ex), balance:bal });
  }
  return { amount:amount, apr:apr, months:months, freq:freq, ppy:ppy, n:n, pmt:pmt, first:first, rows:rows, count:rows.length,
    interest:r2(intTot), paid:r2(paidTot), extra:r2(extraTot), last:rows.length ? rows[rows.length - 1].date : first };
}
/* The loan as scheduled next to the same loan with the extra payments. */
function amortCompare(o){
  var base = amortSchedule(Object.assign({}, o, { lumps:[], every:0 })), plan = amortSchedule(o);
  if (!base) return null;
  return { base:base, plan:plan, hasExtra:plan.extra > 0, saved:r2(base.interest - plan.interest), fewer:base.count - plan.count };
}
/* Customer's goal: paid off within `targetMonths`. Worked out on the loan alone (no other extras):
   the smallest lump sum paid with the first payment, or the smallest top-up on every payment,
   that ends the loan within the target number of payments. Found by halving, checked on the
   real (cent-rounded) schedule, so the answer is exact to the cent. */
function amortGoal(o, targetMonths){
  var plain = Object.assign({}, o, { lumps:[], every:0 }), base = amortSchedule(plain);
  if (!base) return null;
  var nt = Math.max(1, Math.round(targetMonths/12*base.ppy));
  if (nt >= base.count) return { reached:true, nt:nt, base:base };
  var solve = function(make){
    var ok = function(v){ return amortSchedule(make(v)).count <= nt; };
    var lo = 0, hi = base.amount;
    for (var i = 0; i < 60 && hi - lo > 0.001; i++){ var mid = (lo + hi)/2; if (ok(mid)) hi = mid; else lo = mid; }
    var v = Math.ceil(hi*100 - 1e-6)/100;
    while (v > 0.01 && ok(r2(v - 0.01))) v = r2(v - 0.01);
    while (!ok(v)) v = r2(v + 0.01);
    var sch = amortSchedule(make(v));
    return { amount:v, sched:sch, saved:r2(base.interest - sch.interest) };
  };
  return { reached:false, nt:nt, base:base,
    lump:solve(function(v){ return Object.assign({}, plain, { lumps:[{ at:1, amount:v }] }); }),
    every:solve(function(v){ return Object.assign({}, plain, { every:v }); }) };
}
/* Year-by-year totals of a schedule (year 1 = the first ppy payments). */
function amortYears(sch){
  var out = [];
  sch.rows.forEach(function(x){
    var y = Math.ceil(x.k / sch.ppy), cur = out[y - 1];
    if (!cur) cur = out[y - 1] = { year:y, paid:0, extra:0, interest:0, principal:0, balance:0, to:x.date };
    cur.paid = r2(cur.paid + x.pay + x.extra); cur.extra = r2(cur.extra + x.extra); cur.interest = r2(cur.interest + x.interest);
    cur.principal = r2(cur.principal + x.principal); cur.balance = x.balance; cur.to = x.date;
  });
  return out;
}
/* `N` is a number of payment periods. */
function caConst(o, annualPct, N){
  var m = periodRate(annualPct, periodsPerYear(caFreq(o))), r = [];
  for (var i = 0; i < N; i++) r.push(m);
  return caRun(o, r);
}
/* The steady yearly return at which financing and paying cash finish level (null if none in range). */
function caBreakEven(o, N){
  var lo = -30, hi = 60, flo = caConst(o, lo, N).adv, fhi = caConst(o, hi, N).adv;
  if (flo > 0 || fhi < 0) return null;
  for (var i = 0; i < 60; i++){
    var mid = (lo + hi)/2;
    if (caConst(o, mid, N).adv > 0) hi = mid; else lo = mid;
  }
  return (lo + hi)/2;
}
/* Compound (geometric) average yearly return of a market over its last `years`
   calendar years, or over all of them. The compound average is what an
   investor actually earned; the simple average overstates it. */
function marketAverage(key, years){
  var all = MARKETS[key].returns, list = years && years < all.length ? all.slice(-years) : all;
  var g = list.reduce(function(p, r){ return p * (1 + r/100); }, 1);
  var last = MARKET_FIRST_YEAR + all.length - 1;
  return { rate:(Math.pow(g, 1/list.length) - 1)*100, from:last - list.length + 1, to:last, years:list.length };
}
function cashAdvantage(o){
  var amount = Number(o.amount)||0, term = Number(o.term)||0, years = Number(o.years)||0;
  if (amount <= 0 || term <= 0 || years <= 0) return null;
  var freq = caFreq(o), ppy = periodsPerYear(freq);
  var months = Math.round(years * 12), N = Math.round(years * ppy), n = Math.round(term/12*ppy);
  var pmt = payment(amount, Number(o.apr)||0, term, freq);
  var base = { freq:freq, ppy:ppy, N:N, nPay:n, pmt:pmt, interest:pmt*n - amount, cash:Math.max(0, amount - (Number(o.lost)||0)), months:months,
    breakEven:caBreakEven(o, N) };
  if (o.invest === "sp500" || o.invest === "tsx"){
    var all = marketPeriods(o.invest, ppy), runs = [];
    if (N > all.length) return null;
    for (var s = 0; s + N <= all.length; s++) runs.push({ start:s, adv:caRun(o, all.slice(s, s + N)).adv });
    var sorted = runs.slice().sort(function(a, b){ return a.adv - b.adv; });
    var mid = sorted[Math.floor((sorted.length - 1)/2)];
    var ahead = runs.filter(function(r){ return r.adv > 0; }).length;
    /* The headline uses a steady average return (since 1990 by default, or the last
       10 / 5 years); every past period is still tested for the history facts. */
    var avg = marketAverage(o.invest, o.avgOver === "10" ? 10 : o.avgOver === "5" ? 5 : 0);
    var steady = caConst(o, avg.rate, N);
    return Object.assign(base, { kind:"history", market:o.invest, periods:runs.length, aheadPct:ahead/runs.length*100,
      median:mid.adv, worst:sorted[0].adv, best:sorted[sorted.length-1].adv,
      worstStart:caPeriodLabel(sorted[0].start, ppy), bestStart:caPeriodLabel(sorted[sorted.length-1].start, ppy),
      firstYear:MARKET_FIRST_YEAR, lastYear:MARKET_FIRST_YEAR + MARKETS[o.invest].returns.length - 1,
      rate:avg.rate, avgFrom:avg.from, avgTo:avg.to, avgYears:avg.years, avgOver:o.avgOver === "10" || o.avgOver === "5" ? o.avgOver : "all",
      run:steady, adv:steady.adv });
  }
  var rate = Number(o.rate);
  if (isNaN(rate) || o.rate === "" || o.rate === null || o.rate === undefined) return null;
  var r = caConst(o, rate, N);
  return Object.assign(base, { kind:"fixed", rate:rate, run:r, adv:r.adv });
}
/* One line of credit, one payment period at a time. Interest is charged on the
   whole balance each period, and any interest the payment does not cover is
   added to the balance (so it is charged interest too).
   pay: { mode:"match"|"custom"|"interest", amount }   draw: { amount, at }   rise: { points, at } (periods) */
function locSim(start, ratePct, pay, draw, rise, maxN, ppy){
  ppy = ppy || 12;
  var bal = start, intTot = 0, paidTot = 0, path = [bal], payoff = null;
  maxN = maxN || 30 * ppy;
  for (var t = 1; t <= maxN; t++){
    if (draw && draw.amount > 0 && t === draw.at) bal += draw.amount;
    var r = (ratePct + (rise && t >= rise.at ? rise.points : 0))/100/ppy, i = bal * r;
    var p = pay.mode === "interest" ? i : Math.max(0, Number(pay.amount)||0);
    if (pay.mode !== "interest" && p >= bal + i - 0.005){ paidTot += bal + i; intTot += i; bal = 0; path.push(0); payoff = t; break; }
    bal = bal + i - p; intTot += i; paidTot += p; path.push(bal);
  }
  return { path:path, payoff:payoff, interest:intTot, paid:paidTot, owing:bal };
}
/* Balance after a given number of periods (for "after N months you'd still owe…"). */
function locAt(sim, t){ return sim.path[Math.min(t, sim.path.length - 1)]; }
/* Line of credit vs dealer financing, both paid at the same frequency. The
   line-of-credit buyer pays cash at the dealership, so keeps any cash discount
   and borrows less. Payoff times are in payment periods (see ppy). */
function locCompare(o){
  var amount = Number(o.amount)||0, term = Number(o.term)||0, apr = Number(o.apr)||0;
  var locRate = Number(o.locRate), shock = Number(o.shock)||1;
  if (amount <= 0 || term <= 0 || isNaN(locRate) || o.locRate === "" || o.locRate === null || o.locRate === undefined) return null;
  var freq = caFreq(o), ppy = periodsPerYear(freq), n = Math.round(term/12*ppy);
  var lost = Number(o.lost)||0, locAmt = Math.max(0, amount - lost);
  var dPmt = payment(amount, apr, term, freq), dInt = dPmt*n - amount;
  var dealer = locSim(amount, apr, { mode:"custom", amount:dPmt }, null, null, n + 1, ppy);
  var mode = o.payMode === "interest" || o.payMode === "custom" ? o.payMode : "match";
  var amt = mode === "match" ? dPmt : mode === "custom" ? (Number(o.payAmount)||0) : null;
  if (mode === "custom" && !(amt > 0)) return null;
  var pay = { mode:mode, amount:amt };
  var dAmt = Number(o.drawAmount)||0, dYear = Number(o.drawYear)||0;
  var draw = dAmt > 0 && dYear > 0 ? { amount:dAmt, at:(dYear - 1)*ppy + 1, year:dYear } : null;
  var loc = locSim(locAmt, locRate, pay, draw, null, null, ppy);
  var risen = locSim(locAmt, locRate, pay, draw, { points:shock, at:ppy + 1 }, null, ppy);
  var minOnly = locSim(locAmt, locRate, { mode:"interest" }, draw, null, Math.max(n, loc.payoff || 0), ppy);
  var firstInterest = locAmt * locRate/100/ppy;
  return { term:term, n:n, ppy:ppy, freq:freq, lost:lost, shock:shock, payMode:mode, draw:draw,
    dealer:{ amount:amount, pmt:dPmt, interest:dInt, total:dPmt*n, path:dealer.path, payoff:n },
    loc:{ amount:locAmt, rate:locRate, pmt:mode === "interest" ? firstInterest : amt, payoff:loc.payoff, interest:loc.interest,
      path:loc.path, owingAtTerm:locAt(loc, n), grows:mode !== "interest" && amt <= firstInterest,
      riseInterest:risen.interest, risePayoff:risen.payoff, riseOwingAtTerm:locAt(risen, n),
      ioPmt:firstInterest, ioInterestAtTerm:firstInterest*n, minPath:minOnly.path },
    /* Positive = the line of credit costs less in total; negative = dealer financing costs less.
       Only meaningful when the line is actually paid off. */
    locCheaperBy:loc.payoff ? (dInt + lost) - loc.interest : null };
}

window.__DCC_CORE__ = { clone:clone, uid:uid, money:money, money0:money0, km:km, esc:esc, todayISO:todayISO, localISO:localISO,
  MARKETS:MARKETS, marketAverage:marketAverage, cashAdvantage:cashAdvantage, caConst:caConst, caBreakEven:caBreakEven, locCompare:locCompare, r2:r2, loanPayoff:loanPayoff, loanExtra:loanExtra, AMORT_PPY:AMORT_PPY, amortSchedule:amortSchedule, amortCompare:amortCompare, amortGoal:amortGoal, amortYears:amortYears, amortDate:amortDate,
  fmtDate:fmtDate, freqLabel:freqLabel, newTransaction:newTransaction, primaryTerm:primaryTerm, sortedTerms:sortedTerms,
  productById:productById, priceFor:priceFor, taxRateFor:taxRateFor, payment:payment, periodsPerYear:periodsPerYear,
  totals:totals, validate:validate, brandOf:brandOf, brandOfDealer:brandOfDealer, hasListCost:hasListCost, packageLabel:packageLabel,
  normOffers:normOffers, discountFor:discountFor, dealSig:dealSig };
})();
