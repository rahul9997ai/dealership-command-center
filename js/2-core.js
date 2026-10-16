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

/* ---------------- SALES TRACKER MATHS ----------------
   Selling days and the sales-performance numbers, the same way the sales managers' sheet works:
   Tracking = sold ÷ current selling day × total selling days, status AHEAD ≥ 100% / PACE ≥ 90% /
   BEHIND, required per day = (target − sold) ÷ selling days left. */
function easterSunday(y){
  var a = y % 19, b = Math.floor(y/100), c = y % 100, d = Math.floor(b/4), e = b % 4, f = Math.floor((b + 8)/25),
      g = Math.floor((b - f + 1)/3), h = (19*a + b - d - g + 15) % 30, i = Math.floor(c/4), k = c % 4,
      l = (32 + 2*e + 2*i - h - k) % 7, m = Math.floor((a + 11*h + 22*l)/451),
      mo = Math.floor((h + l - 7*m + 114)/31), da = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(y, mo - 1, da, 12);
}
function nthWeekday(y, m, dow, n){ var d = new Date(y, m, 1, 12); return new Date(y, m, 1 + (dow - d.getDay() + 7) % 7 + (n - 1)*7, 12); }
/* Days Ontario dealerships close: the statutory holidays plus the Civic Holiday. A holiday on a Sunday
   (or New Year's / Christmas / Boxing Day on a Saturday) also closes the next weekday. */
function ontarioHolidays(y){
  var out = {}, add = function(d, name, satToo){
    out[localISO(d)] = name;
    var dow = d.getDay();
    if (dow === 0 || (dow === 6 && satToo)){
      var n = new Date(d); n.setDate(n.getDate() + 1);
      while (n.getDay() === 0 || n.getDay() === 6 || out[localISO(n)]) n.setDate(n.getDate() + 1);
      out[localISO(n)] = name + " (observed)";
    }
  };
  var easter = easterSunday(y), gf = new Date(easter); gf.setDate(gf.getDate() - 2);
  var may25 = new Date(y, 4, 25, 12), vic = new Date(may25); vic.setDate(25 - ((may25.getDay() + 6) % 7 || 7));
  add(new Date(y, 0, 1, 12), "New Year's Day", true);
  add(nthWeekday(y, 1, 1, 3), "Family Day");
  add(gf, "Good Friday");
  add(vic, "Victoria Day");
  add(new Date(y, 6, 1, 12), "Canada Day");
  add(nthWeekday(y, 7, 1, 1), "Civic Holiday");
  add(nthWeekday(y, 8, 1, 1), "Labour Day");
  add(nthWeekday(y, 9, 1, 2), "Thanksgiving");
  add(new Date(y, 11, 25, 12), "Christmas Day", true);
  add(new Date(y, 11, 26, 12), "Boxing Day", true);
  return out;
}
/* month "YYYY-MM"; opts: { openWeekdays:[1..6], closed:[iso], open:[iso] } (manual changes win) */
function sellingDays(month, opts){
  opts = opts || {};
  var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1, last = new Date(y, m + 1, 0).getDate();
  var weekdays = opts.openWeekdays || [1,2,3,4,5,6], hol = ontarioHolidays(y), closed = opts.closed || [], open = opts.open || [];
  var days = [], total = 0;
  for (var d = 1; d <= last; d++){
    var dt = new Date(y, m, d, 12), iso = localISO(dt), reason = null, isOpen = weekdays.indexOf(dt.getDay()) !== -1;
    if (!isOpen) reason = dt.getDay() === 0 ? "Sunday" : "Closed";
    if (isOpen && hol[iso]){ isOpen = false; reason = hol[iso]; }
    if (closed.indexOf(iso) !== -1){ isOpen = false; reason = reason || "Closed"; }
    if (open.indexOf(iso) !== -1){ isOpen = true; reason = null; }
    if (isOpen) total++;
    days.push({ date:iso, day:d, dow:dt.getDay(), open:isOpen, reason:reason, holiday:hol[iso] || null });
  }
  return { month:month, days:days, total:total };
}
/* Selling days used up to and including `iso` (0 before the first one). */
function sellingDayOf(info, iso){ return info.days.filter(function(x){ return x.open && x.date <= iso; }).length; }
var SALE_STATUSES = ["pending","approved","scheduled","delivered","rdr","carry","declined","cancelled"];
function saleCounts(d){ return d && d.status !== "declined" && d.status !== "cancelled"; }
function saleIsUsed(d){ return d.type === "Used" || d.type === "As-is"; }
/* The date a deal counts on: sold date, or (when counting on delivery) the delivery date once delivered. */
function saleCountDate(d, countOn){
  if (countOn === "delivered") return (d.status === "delivered" || d.status === "rdr") ? (d.deliveredDate || d.soldDate) : null;
  return d.soldDate;
}
function salePct(track, target){ return target > 0 ? track/target : null; }
function saleStatus(pct){ return pct === null ? null : pct >= 1 ? "ahead" : pct >= 0.9 ? "pace" : "behind"; }
/* targets: { people:[{ name, n, u }], countOn }; range: { from, to } (inclusive ISO dates);
   day / total: selling day so far and selling days in the period. */
function salesPerformance(deals, targets, range, day, total){
  targets = targets || {}; var countOn = targets.countOn === "delivered" ? "delivered" : "sold";
  var rows = {}, order = [], key = function(n){ return String(n || "").trim().toUpperCase(); };
  var row = function(name, storeOnly){
    var k = key(name);
    if (!rows[k]){ rows[k] = { name:k, tN:0, tU:0, sN:0, sU:0, front:0, fi:0, storeOnly:!!storeOnly }; order.push(k); }
    return rows[k];
  };
  (targets.people || []).forEach(function(p){ var r = row(p.name); r.tN = Number(p.n) || 0; r.tU = Number(p.u) || 0; });
  var store = { name:"DEALERSHIP", tN:0, tU:0, sN:0, sU:0, front:0, fi:0, deals:0 };
  (deals || []).forEach(function(d){
    if (!saleCounts(d)) return;
    var dt = saleCountDate(d, countOn);
    if (!dt || dt < range.from || dt > range.to) return;
    var used = saleIsUsed(d), sp = (d.salespeople && d.salespeople.length) ? d.salespeople : [{ name:"HOUSE", share:1 }];
    sp.forEach(function(s){
      var share = Number(s.share); if (!(share > 0)) share = 1/sp.length;
      var r = row(s.name, /^(HOUSE|MOBILE)/.test(key(s.name)));
      if (used) r.sU += share; else r.sN += share;
    });
    if (used) store.sU += 1; else store.sN += 1;
    store.front += Number(d.frontGross) || 0; store.fi += Number(d.fiGross) || 0; store.deals++;
  });
  var r2 = function(v){ return Math.round(v*100)/100; };
  var finish = function(r){
    r.sN = r2(r.sN); r.sU = r2(r.sU);
    r.tT = r.tN + r.tU; r.sT = r2(r.sN + r.sU);
    var tr = function(s){ return day > 0 ? Math.round(s/day*total) : null; };
    r.kN = tr(r.sN); r.kU = tr(r.sU); r.kT = r.kN === null ? null : r.kN + r.kU;
    r.pct = r.kT === null ? null : salePct(r.kT, r.tT);
    r.status = saleStatus(r.pct);
    r.perDay = r.tT > 0 ? (total - day > 0 ? Math.max(0, (r.tT - r.sT)/(total - day)) : null) : null;
    return r;
  };
  var people = order.map(function(k){ return rows[k]; });
  people.forEach(function(p){ if (!p.storeOnly){ store.tN += p.tN; store.tU += p.tU; } });
  people = people.map(finish);
  /* salespeople with targets first (as entered), then anyone else who sold, then House / Mobile */
  people.sort(function(a, b){ var ga = a.storeOnly ? 2 : (a.tT > 0 ? 0 : 1), gb = b.storeOnly ? 2 : (b.tT > 0 ? 0 : 1); return ga - gb; });
  return { store:finish(store), people:people, countOn:countOn, day:day, total:total };
}

/* ---------------- SALES INSIGHTS ----------------
   The GM dashboard: gross, units and deliveries for a period, each salesperson's scorecard, and
   year-end projections. A split deal splits its gross the same way it splits the unit. Losing money
   = a deal with front gross entered at $0 or less. */
var SALE_OPEN = ["pending","approved","scheduled","carry"];
function saleIsOpen(d){ return !!d && SALE_OPEN.indexOf(d.status) !== -1; }
function saleDelivered(d){ return !!d && (d.status === "delivered" || d.status === "rdr"); }
function saleKey(n){ return String(n || "").trim().toUpperCase(); }
function saleStoreOnly(k){ return /^(HOUSE|MOBILE)/.test(saleKey(k)); }
function saleAmt(v){ if (v === null || v === undefined || v === "") return null; var n = Number(v); return isNaN(n) ? null : n; }
/* Totals for one period (inclusive ISO dates). countOn: "sold" or "delivered" (see saleCountDate). */
function salesAgg(deals, range, countOn){
  var store = { units:0, N:0, U:0, front:0, fi:0, losingN:0, losingAmt:0, delivered:0 }, people = {};
  var person = function(k){ return people[k] || (people[k] = { name:k, units:0, N:0, U:0, front:0, fi:0, losingN:0, losingAmt:0, storeOnly:saleStoreOnly(k) }); };
  (deals || []).forEach(function(d){
    if (saleDelivered(d)){ var dd = d.deliveredDate || d.soldDate; if (dd && dd >= range.from && dd <= range.to) store.delivered++; }
    if (!saleCounts(d)) return;
    var dt = saleCountDate(d, countOn); if (!dt || dt < range.from || dt > range.to) return;
    var used = saleIsUsed(d), f = saleAmt(d.frontGross), fi = saleAmt(d.fiGross), losing = f !== null && f <= 0;
    store.units++; if (used) store.U++; else store.N++;
    store.front += f || 0; store.fi += fi || 0;
    if (losing){ store.losingN++; store.losingAmt += f; }
    var sp = d.salespeople && d.salespeople.length ? d.salespeople : [{ name:"HOUSE", share:1 }];
    sp.forEach(function(s){
      var share = Number(s.share); if (!(share > 0)) share = 1/sp.length;
      var p = person(saleKey(s.name));
      p.units += share; if (used) p.U += share; else p.N += share;
      p.front += (f || 0)*share; p.fi += (fi || 0)*share;
      if (losing){ p.losingN++; p.losingAmt += f*share; }
    });
  });
  var r = function(v){ return Math.round(v*100)/100; };
  Object.keys(people).forEach(function(k){ var p = people[k]; p.units = r(p.units); p.N = r(p.N); p.U = r(p.U); p.front = r(p.front); p.fi = r(p.fi); p.losingAmt = r(p.losingAmt); });
  return { store:store, people:people };
}
function salesMonthAdd(m, n){ var d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1, 12); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }
/* Everything the Insights dashboard shows, for one store and one year.
   opts: { deals:[...], targets:{ "YYYY-MM": targets }, year:2026, today:"YYYY-MM-DD" }
   A month before the current one that has Sales Performance totals imported (targets.history) takes its
   units from those totals; gross and deliveries always come from the deals logged. */
function salesInsights(opts){
  var deals = opts.deals || [], tg = opts.targets || {}, year = Number(opts.year), today = opts.today;
  var cur = today.slice(0, 7), first = year + "-01", lastM = year + "-12";
  if (cur > lastM) cur = lastM;
  var months = [], rec = {}, m;
  for (m = salesMonthAdd(first, -5); m <= lastM; m = salesMonthAdd(m, 1)){
    var t = tg[m] || {}, info = sellingDays(m, { closed:t.closed || [], open:t.open || [], openWeekdays:t.openWeekdays });
    var used = m < cur ? info.total : m > cur ? 0 : (today.slice(0, 7) === cur ? sellingDayOf(info, today) : info.total);
    var agg = salesAgg(deals, { from:m + "-01", to:m + "-31" }, t.countOn === "delivered" ? "delivered" : "sold");
    var hist = m < today.slice(0, 7) && t.history && t.history.people ? t.history.people : null;
    var units = {}, N = 0, U = 0;
    if (hist) Object.keys(hist).forEach(function(k){ var h = hist[k], key = saleKey(k), n = Number(h.n) || 0, u = Number(h.u) || 0; units[key] = { units:n + u, N:n, U:u }; N += n; U += u; });
    else { Object.keys(agg.people).forEach(function(k){ var p = agg.people[k]; units[k] = { units:p.units, N:p.N, U:p.U }; }); N = agg.store.N; U = agg.store.U; }
    var r = { month:m, total:info.total, used:used, future:m > cur, N:N, U:U, units:N + U, people:units, fromHistory:!!hist,
      hasDeals:agg.store.units > 0 || agg.store.delivered > 0, gross:agg.store.front + agg.store.fi, front:agg.store.front, fi:agg.store.fi, delivered:agg.store.delivered, agg:agg,
      target:(t.people || []).reduce(function(a, p){ return a + (Number(p.n) || 0) + (Number(p.u) || 0); }, 0), grossTarget:Number(t.gross) || 0 };
    months.push(r); rec[m] = r;
  }
  var yearMonths = months.filter(function(r){ return r.month >= first; });
  var sofar = yearMonths.filter(function(r){ return !r.future; });
  var sum = function(list, f){ return list.reduce(function(a, r){ return a + (typeof f === "function" ? f(r) : r[f]); }, 0); };
  var yearDays = sum(yearMonths, "total"), usedDays = sum(sofar, "used"), leftDays = yearDays - usedDays;
  /* months with something recorded: units come from deals or imported totals, gross and deliveries from deals.
     A month with nothing recorded (before the tracker, nothing imported) is left out of the pace, not counted as 0. */
  var dataMonths = sofar.filter(function(r){ return r.hasDeals; }), dataDays = sum(dataMonths, "used");
  var unitMonths = sofar.filter(function(r){ return r.hasDeals || r.fromHistory; }), unitDays = sum(unitMonths, "used");
  var last3 = sofar.slice(-3), last3Data = last3.filter(function(r){ return r.hasDeals; }), last3Units = last3.filter(function(r){ return r.hasDeals || r.fromHistory; });
  var gapU = unitMonths.length < sofar.length, gapG = dataMonths.length < sofar.length;
  /* year-end: this year's pace (so far ÷ selling days used × selling days in the year) and the last 3 months' pace */
  var paceAll = function(f, list, days){ return days > 0 ? sum(list, f)/days*yearDays : null; };
  /* the last 3 months' rate for the rest of the year; when early months have no deals logged, for the whole year */
  var pace3 = function(f, list, ytd, whole){ var d = sum(list, "used"); return d > 0 ? (whole ? sum(list, f)/d*yearDays : ytd + sum(list, f)/d*leftDays) : null; };
  var ytdU = sum(sofar, "units"), ytdN = sum(sofar, "N"), ytdUu = sum(sofar, "U"), ytdG = sum(sofar, "gross"), ytdD = sum(sofar, "delivered");
  var rnd = function(v){ return v === null ? null : Math.round(v); };
  var proj = {
    units:{ pace:rnd(paceAll("units", unitMonths, unitDays)), last3:rnd(pace3("units", last3Units, ytdU, gapU)) },
    N:{ pace:rnd(paceAll("N", unitMonths, unitDays)), last3:rnd(pace3("N", last3Units, ytdN, gapU)) },
    U:{ pace:rnd(paceAll("U", unitMonths, unitDays)), last3:rnd(pace3("U", last3Units, ytdUu, gapU)) },
    gross:{ pace:rnd(paceAll("gross", dataMonths, dataDays)), last3:rnd(pace3("gross", last3Data, ytdG, gapG)) },
    delivered:{ pace:rnd(paceAll("delivered", dataMonths, dataDays)), last3:rnd(pace3("delivered", last3Data, ytdD, gapG)) },
    estimated:gapG, estimatedUnits:gapU, dataFrom:dataMonths.length ? dataMonths[0].month : null, unitsFrom:unitMonths.length ? unitMonths[0].month : null };
  var curRec = rec[cur];
  /* each salesperson */
  var roster = {};
  ((tg[cur] || {}).people || []).forEach(function(p){ roster[saleKey(p.name)] = 1; });
  sofar.forEach(function(r){ Object.keys(r.people).forEach(function(k){ if (r.people[k].units > 0) roster[k] = 1; }); });
  var people = Object.keys(roster).filter(function(k){ return k && !saleStoreOnly(k); });
  var storeFrontPvr = function(list){ var u = sum(list, function(r){ return r.agg.store.units; }); return u ? sum(list, "front")/u : null; };
  var score = function(k, list, ytd){
    var o = { name:k, units:0, N:0, U:0, front:0, fi:0, dealUnits:0, losingN:0, losingAmt:0 };
    list.forEach(function(r){ var u = r.people[k], a = r.agg.people[k];
      if (u){ o.units += u.units; o.N += u.N; o.U += u.U; }
      if (a){ o.front += a.front; o.fi += a.fi; o.dealUnits += a.units; o.losingN += a.losingN; o.losingAmt += a.losingAmt; } });
    var r2 = function(v){ return Math.round(v*100)/100; };
    o.units = r2(o.units); o.N = r2(o.N); o.U = r2(o.U); o.total = o.front + o.fi;
    o.frontPvr = o.dealUnits ? o.front/o.dealUnits : null; o.fiPvr = o.dealUnits ? o.fi/o.dealUnits : null; o.pvr = o.dealUnits ? o.total/o.dealUnits : null;
    var sp = storeFrontPvr(list); o.hold = o.frontPvr === null || sp === null ? null : o.frontPvr - sp;
    /* last 6 months' units; the current month at its pace so far, so a half-done month doesn't look like a drop */
    o.trend = months.filter(function(r){ return !r.future; }).slice(-6).map(function(r){ var u = r.people[k] ? r.people[k].units : 0;
      return r.month === cur && r.used > 0 && r.used < r.total ? Math.round(u/r.used*r.total*10)/10 : u; });
    /* year-end units: their pace × the year's selling days, the same way as the store. Someone who started
       after the records begin (a new hire) is projected from their first month instead. */
    var active = sofar.filter(function(r){ return r.people[k] && r.people[k].units > 0; }), start = active.length ? active[0].month : null;
    if (start && unitMonths.length && start <= unitMonths[0].month) start = unitMonths[0].month;
    var from = start ? unitMonths.filter(function(r){ return r.month >= start; }) : [], d = sum(from, "used"), yu = sum(from, function(r){ return r.people[k] ? r.people[k].units : 0; });
    var daysFrom = start && unitMonths.length && start === unitMonths[0].month ? yearDays : sum(yearMonths.filter(function(r){ return start && r.month >= start; }), "total");
    o.yearEnd = d > 0 ? Math.round(yu/d*daysFrom) : 0;
    if (!ytd && curRec){
      o.tracking = curRec.used > 0 ? o.units/curRec.used*curRec.total : null;
      var prev = [1, 2, 3].map(function(i){ var pr = rec[salesMonthAdd(cur, -i)]; return pr && pr.people[k] ? pr.people[k].units : 0; });
      o.last = prev[0]; o.avg3 = (prev[0] + prev[1] + prev[2])/3;
      o.growth = o.avg3 > 0 && o.tracking !== null ? o.tracking/o.avg3 : null;
    }
    return o;
  };
  var mtdList = curRec ? [curRec] : [];
  var sc = { mtd:people.map(function(k){ return score(k, mtdList, false); }), ytd:people.map(function(k){ return score(k, sofar, true); }) };
  ["mtd","ytd"].forEach(function(p){ sc[p].sort(function(a, b){ return b.units - a.units || b.total - a.total; }); });
  var periodTotals = function(list){
    var u = sum(list, function(r){ return r.agg.store.units; });
    return { units:sum(list, "units"), N:sum(list, "N"), U:sum(list, "U"), front:sum(list, "front"), fi:sum(list, "fi"), gross:sum(list, "gross"), delivered:sum(list, "delivered"),
      losingN:sum(list, function(r){ return r.agg.store.losingN; }), losingAmt:sum(list, function(r){ return r.agg.store.losingAmt; }),
      dealUnits:u, frontPvr:u ? sum(list, "front")/u : null, fiPvr:u ? sum(list, "fi")/u : null, pvr:u ? sum(list, "gross")/u : null,
      target:sum(list, "target"), grossTarget:sum(list, "grossTarget"), used:sum(list, "used"), total:sum(list, "total") };
  };
  var mtd = periodTotals(mtdList);
  if (curRec){ mtd.trackUnits = curRec.used ? Math.round(mtd.units/curRec.used*curRec.total) : null; mtd.trackGross = curRec.used ? Math.round(mtd.gross/curRec.used*curRec.total) : null; }
  return { year:year, cur:cur, months:yearMonths, all:months, yearDays:yearDays, usedDays:usedDays, leftDays:leftDays,
    mtd:mtd, ytd:periodTotals(sofar), proj:proj, scores:sc };
}

/* ---------------- EXCEL IMPORT ----------------
   Reads the sheets the sales office already keeps: a sales log (one row per vehicle, header row found
   automatically) and the Sales Performance workbook (monthly totals per salesperson). Rows arrive as
   arrays of cell values. */
var IMP_MON = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
function impText(v){ return String(v === null || v === undefined ? "" : v).replace(/\s+/g, " ").trim(); }
function impHead(v){ return impText(v).toLowerCase().replace(/[^a-z0-9#&\/]+/g, " ").replace(/\s+/g, " ").trim(); }
function impYmd(y, m, d){ var dt = new Date(y, m - 1, d, 12); return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? localISO(dt) : null; }
/* "September 2026", "SEP SALES PERFORMANCE", "AUGUST 2026 SALES PERFORMANCE" → { m:9, y:2026 } (either may be null) */
function impMonthOf(text){
  var t = impText(text).toUpperCase(), mm = t.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\b/), yy = t.match(/\b(20\d{2})\b/);
  return { m:mm ? IMP_MON.indexOf(mm[1]) + 1 : null, y:yy ? Number(yy[1]) : null };
}
/* A sold date as typed: "9TH SEP", "Sep 9", "2026-09-09", "9/9/2026", an Excel day number or a Date.
   Without a year, the tab's year is used (a December row on a January tab is the year before). */
function impDate(v, tabYear, tabMonth){
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : localISO(v);
  if (typeof v === "number"){
    if (v > 20000 && v < 80000){ var d = new Date(Math.round((v - 25569)*86400000)); return impYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    return null;
  }
  var t = impText(v).toUpperCase(), m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return impYmd(+m[1], +m[2], +m[3]);
  if ((m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/))){
    var a = +m[1], b = +m[2], y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return a > 12 ? impYmd(y, b, a) : impYmd(y, a, b);
  }
  var yy = t.match(/\b(20\d{2})\b/), rest = t.replace(/\b20\d{2}\b/, " "), mon = rest.match(/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/), day = rest.match(/\b(\d{1,2})(?:ST|ND|RD|TH)?\b/);
  if (!mon || !day) return null;
  var mo = IMP_MON.indexOf(mon[1]) + 1, yr = yy ? +yy[1] : tabYear;
  if (!yr) return null;
  if (!yy && tabMonth){ if (mo - tabMonth > 6) yr--; else if (tabMonth - mo > 6) yr++; }
  return impYmd(yr, mo, +day[1]);
}
function impMoney(v){
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : Math.round(v*100)/100;
  var t = impText(v).replace(/[$,\s]/g, ""), neg = /^\(.*\)$/.test(t) || /^[-−]/.test(t);
  t = t.replace(/[()−-]/g, "");
  if (!t || isNaN(Number(t))) return null;
  return (neg ? -1 : 1)*Math.round(Number(t)*100)/100;
}
function impYes(v){ return /^(y|yes|true|x|✓|1)$/i.test(impText(v)); }
var IMP_LOG_COLS = [
  ["soldDate", /^(sold )?date( sold)?$/], ["stockNo", /^stock ?(#|no|number)$/], ["customerNo", /^(customer|cust) ?(#|no|number)$/],
  ["customer", /^(customer|cust)( name)?$/], ["sp", /^sales ?(person|rep|consultant|c)$/], ["fiManager", /^(f ?& ?i|fi|finance) ?(manager|mgr)?$/],
  ["vehicle", /^vehicle/], ["status", /^(deal )?status$/], ["dealType", /^(f\/c|f\/l\/c|deal type|finance\/cash|fin\/cash)$/],
  ["frontGross", /^front( g ?p| gross)?$/], ["fiGross", /^(f ?& ?i|fi) (g ?p|gross)/], ["leadSource", /^(lead )?source$/],
  ["closeType", /^close( type)?$/], ["stockSource", /^stock source$/], ["rdr", /^rdr$/], ["appt", /^app(t|ointment)?( y\/n)?$/],
  ["secPack", /^sec ?pack/], ["trade", /^trade( in)?$/], ["tire", /^tire/], ["secondTO", /^2nd t ?o/], ["posted", /^posted$/],
  ["type", /^(n\/u|new\/used|new or used|type)$/], ["lender", /^(lender|bank)$/], ["notes", /^(notes?|comments?)$/]];
var IMP_COL_LABEL = { soldDate:"Date sold", stockNo:"Stock #", customerNo:"Customer #", customer:"Customer", sp:"Salesperson", fiManager:"F&I manager", vehicle:"Vehicle",
  status:"Status", dealType:"Deal", frontGross:"Front gross", fiGross:"F&I gross", leadSource:"Lead source", closeType:"Close", stockSource:"Stock source", rdr:"Del / scanned",
  appt:"Appointment", secPack:"Security pack", trade:"Trade-in", tire:"Tire & wheel", secondTO:"2nd turnover", posted:"Posted", type:"New / Used", lender:"Lender", notes:"Notes" };
/* the first row (in the top 80) that has these headings; returns { row, cols:{ field:index }, heads:{ field:text } } */
function impFindHeader(rows, table, need){
  for (var i = 0; i < Math.min(rows.length, 80); i++){
    var r = rows[i] || [], cols = {}, heads = {};
    for (var c = 0; c < r.length; c++){
      var h = impHead(r[c]); if (!h) continue;
      for (var j = 0; j < table.length; j++){ if (cols[table[j][0]] === undefined && table[j][1].test(h)){ cols[table[j][0]] = c; heads[table[j][0]] = impText(r[c]); break; } }
    }
    if (need.every(function(f){ return cols[f] !== undefined; })) return { row:i, cols:cols, heads:heads };
  }
  return null;
}
function impPick(text, list, other){
  var t = impText(text).toLowerCase().replace(/[^a-z0-9]/g, ""); if (!t) return "";
  for (var i = 0; i < list.length; i++){ var l = list[i].toLowerCase().replace(/[^a-z0-9]/g, ""); if (l === t || l.indexOf(t) !== -1 || t.indexOf(l) !== -1) return list[i]; }
  return other === undefined ? "" : other;
}
var IMP_STATUS = { delivered:"delivered", "delscanned":"rdr", scanned:"rdr", rdr:"rdr", declined:"declined", cancelled:"cancelled", canceled:"cancelled", carryover:"carry", carry:"carry",
  pending:"pending", approved:"approved", schdelivery:"scheduled", scheduleddelivery:"scheduled", scheduled:"scheduled", sched:"scheduled" };
function impHash(s){ var h = 2166136261; for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
/* One sales-log tab. opts: { type:"Used"|"New"|"file", leads:[..], closes:[..], stocks:[..], store:"id", file:"name" }
   Returns null when the tab has no sales-log header, else { name, month, header, rows:[{ line, deal, issues:[], bad }] }. */
function impLogSheet(name, rows, opts){
  opts = opts || {};
  var hdr = impFindHeader(rows, IMP_LOG_COLS, ["stockNo", "sp"]);
  if (!hdr || (hdr.cols.soldDate === undefined && hdr.cols.customer === undefined)) return null;
  var tab = impMonthOf(name);
  if (!tab.y) for (var k = 0; k < Math.min(hdr.row, 4) && !tab.y; k++) (rows[k] || []).forEach(function(c){ var mo = impMonthOf(c); if (mo.y && !tab.y){ tab.y = mo.y; if (!tab.m) tab.m = mo.m; } });
  var cell = function(r, f){ var c = hdr.cols[f]; return c === undefined ? "" : r[c]; };
  var out = [];
  for (var i = hdr.row + 1; i < rows.length; i++){
    var r = rows[i] || [];
    var stock = impText(cell(r, "stockNo")).toUpperCase(), cust = impText(cell(r, "customer")), sp = saleKey(cell(r, "sp")), rawDate = cell(r, "soldDate");
    if (!stock && !cust && !sp) continue;
    if (!stock && !cust) continue;
    var issues = [], sold = impDate(rawDate, tab.y, tab.m), st = impText(cell(r, "status")), status = IMP_STATUS[st.toLowerCase().replace(/[^a-z]/g, "")];
    if (!sold) issues.push(impText(rawDate) ? "Date not readable (" + impText(rawDate) + ")" : "No date");
    if (!status){ if (st) issues.push("Status \"" + st + "\" read as Pending"); else issues.push("No status · imported as Pending"); status = "pending"; }
    if (status === "delivered" && impYes(cell(r, "rdr"))) status = "rdr";
    if (!sp){ issues.push("No salesperson · counted as HOUSE"); sp = "HOUSE"; }
    if (!cust) issues.push("No customer name");
    var tc = impText(cell(r, "type")), type = opts.type === "New" || opts.type === "Used" ? opts.type : /^n(ew)?$/i.test(tc) ? "New" : /as.?is/i.test(tc) ? "As-is" : "Used";
    var front = impMoney(cell(r, "frontGross")), fi = impMoney(cell(r, "fiGross"));
    var deal = { id:"X" + impHash([opts.store || "", stock, sold || "", cust.toUpperCase(), sp].join("|")) + impHash(stock + "|" + sold).slice(0, 3),
      soldDate:sold || "", status:status, statusDates:{}, type:type, dealType:impPick(cell(r, "dealType"), ["Finance", "Lease", "Cash"]),
      salespeople:[{ name:sp, share:1 }], stockNo:stock, customerNo:impText(cell(r, "customerNo")), customer:cust, vehicle:impText(cell(r, "vehicle")),
      fiManager:impText(cell(r, "fiManager")), fiUserId:"", frontGross:front, fiGross:fi, lender:impText(cell(r, "lender")),
      leadSource:impPick(cell(r, "leadSource"), opts.leads || [], "Other"), closeType:impPick(cell(r, "closeType"), opts.closes || []),
      stockSource:impPick(cell(r, "stockSource"), opts.stocks || [], "Other"),
      flags:{}, deliveryAt:"", deliveredDate:"", notes:impText(cell(r, "notes")), importedFrom:(opts.file ? opts.file + " · " : "") + name };
    if (!impText(cell(r, "leadSource"))) deal.leadSource = "";
    if (!impText(cell(r, "stockSource"))) deal.stockSource = "";
    ["appt","trade","secondTO","secPack","tire","posted"].forEach(function(f){ if (impYes(cell(r, f))) deal.flags[f] = true; });
    if (sold){ deal.statusDates[status] = sold; if (status === "delivered" || status === "rdr") deal.deliveredDate = sold; }
    out.push({ line:i + 1, deal:deal, issues:issues, bad:!sold });
  }
  return { name:name, month:tab.y && tab.m ? tab.y + "-" + ("0" + tab.m).slice(-2) : null, header:hdr, rows:out };
}
var IMP_PERF_COLS = [["sp", /^sales ?(person|rep|consultant|c)$/], ["tn", /^target n(ew)?$/], ["tu", /^target u(sed)?$/], ["sn", /^sold n(ew)?$/], ["su", /^sold u(sed)?$/]];
/* One Sales Performance tab → { name, month:"YYYY-MM"|null, people:[{ name, tn, tu, sn, su }] } or null. */
function impPerfSheet(name, rows){
  var hdr = impFindHeader(rows, IMP_PERF_COLS, ["sp", "sn", "su"]);
  if (!hdr) return null;
  var mo = { m:null, y:null };
  for (var k = 0; k < hdr.row; k++) (rows[k] || []).forEach(function(c){ var x = impMonthOf(c); if (x.m && !mo.m){ mo.m = x.m; } if (x.y && !mo.y) mo.y = x.y; });
  var tn = impMonthOf(name); if (!mo.m) mo.m = tn.m; if (!mo.y) mo.y = tn.y;
  var num = function(v){ var n = impMoney(v); return n === null ? 0 : n; };
  var people = [];
  for (var i = hdr.row + 1; i < rows.length; i++){
    var r = rows[i] || [], nm = saleKey(r[hdr.cols.sp]);
    if (!nm || /^(DEALERSHIP|TOTAL|STORE)/.test(nm)) continue;
    var p = { name:nm, tn:hdr.cols.tn === undefined ? 0 : num(r[hdr.cols.tn]), tu:hdr.cols.tu === undefined ? 0 : num(r[hdr.cols.tu]), sn:num(r[hdr.cols.sn]), su:num(r[hdr.cols.su]) };
    if (p.tn || p.tu || p.sn || p.su) people.push(p);
  }
  return { name:name, month:mo.m && mo.y ? mo.y + "-" + ("0" + mo.m).slice(-2) : null, people:people };
}

window.__DCC_CORE__ = { easterSunday:easterSunday, ontarioHolidays:ontarioHolidays, sellingDays:sellingDays, sellingDayOf:sellingDayOf, SALE_STATUSES:SALE_STATUSES, saleCounts:saleCounts, saleIsUsed:saleIsUsed, saleCountDate:saleCountDate, salePct:salePct, saleStatus:saleStatus, salesPerformance:salesPerformance, SALE_OPEN:SALE_OPEN, saleIsOpen:saleIsOpen, saleDelivered:saleDelivered, saleKey:saleKey, saleStoreOnly:saleStoreOnly, salesAgg:salesAgg, salesMonthAdd:salesMonthAdd, salesInsights:salesInsights,
  impText:impText, impMonthOf:impMonthOf, impDate:impDate, impMoney:impMoney, impFindHeader:impFindHeader, impLogSheet:impLogSheet, impPerfSheet:impPerfSheet, IMP_LOG_COLS:IMP_LOG_COLS, IMP_COL_LABEL:IMP_COL_LABEL, clone:clone, uid:uid, money:money, money0:money0, km:km, esc:esc, todayISO:todayISO, localISO:localISO,
  MARKETS:MARKETS, marketAverage:marketAverage, cashAdvantage:cashAdvantage, caConst:caConst, caBreakEven:caBreakEven, locCompare:locCompare, r2:r2, loanPayoff:loanPayoff, loanExtra:loanExtra, AMORT_PPY:AMORT_PPY, amortSchedule:amortSchedule, amortCompare:amortCompare, amortGoal:amortGoal, amortYears:amortYears, amortDate:amortDate,
  fmtDate:fmtDate, freqLabel:freqLabel, newTransaction:newTransaction, primaryTerm:primaryTerm, sortedTerms:sortedTerms,
  productById:productById, priceFor:priceFor, taxRateFor:taxRateFor, payment:payment, periodsPerYear:periodsPerYear,
  totals:totals, validate:validate, brandOf:brandOf, brandOfDealer:brandOfDealer, hasListCost:hasListCost, packageLabel:packageLabel,
  normOffers:normOffers, discountFor:discountFor, dealSig:dealSig };
})();
