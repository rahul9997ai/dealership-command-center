/* Money-maths tests for the Command Center calculation engine.
   Run:  node tests/run.js
   It loads the data + core layers straight from js/, so it tests the code that ships. */
const fs = require("fs"), path = require("path"), vm = require("vm");
/* The data and calculation layers live in their own files, loaded first by index.html. */
const core = ["1-data.js", "2-core.js"].map(function (f) { return fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"); }).join("\n");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(core, sandbox);
const C = sandbox.window.__DCC_CORE__, D = sandbox.window.__DCC_DATA__;

let pass = 0, fail = 0;
function eq(name, got, want, tol = 0.005) {
  const ok = typeof want === "number" ? Math.abs(got - want) <= tol : got === want;
  if (ok) pass++; else { fail++; console.log("FAIL  " + name + "\n      got " + got + ", want " + want); }
}

const cfg = { brandKey: "nissan", tax: { standard: 13, vrc: 8 }, finance: { defaultApr: 6.9, defaultTerm: 72, defaultFrequency: "monthly", adminFee: 0, licensing: 0 } };
const products = [
  { id: "a", name: "A", uses: {}, taxRule: "standard", cost: 200, pricing: { base: 1000 } },
  { id: "b", name: "B", uses: {}, taxRule: "standard", cost: 100, pricing: { base: 500 } },
  { id: "v", name: "V", uses: {}, taxRule: "vrc", cost: 0, pricing: { base: 1000 } },
  { id: "x", name: "X", uses: {}, taxRule: "exempt", cost: 0, pricing: { base: 400 } },
];
function build(lines, over) {
  const state = { config: cfg, products };
  const tx = C.newTransaction("u1", "d1");
  tx.vehicle.price = 40000;
  tx.finance.terms = [72]; tx.finance.rates = { 72: 6.9 }; tx.finance.frequency = "monthly";
  tx.lines = lines.map((l, i) => ({ lineId: "L" + i, productId: l[0], packages: l[1], price: null }));
  Object.assign(tx, over || {});
  return { state, tx, t: C.totals(state, tx) };
}
const P = { preferred: true, essential: false, basic: false };
const noOffers = { discount: { enabled: false, scope: "package", type: "percent", deal: 0, packages: { preferred: 0, essential: 0, basic: 0 } }, gifts: [] };

/* --- payment formula against independently computed references --- */
eq("payment 30000 @6.9% 72mo monthly", C.payment(30000, 6.9, 72, "monthly"), 510.03);
eq("payment 45200 @4.99% 84mo bi-weekly", C.payment(45200, 4.99, 84, "biweekly"), 294.48);
eq("payment 12000 @0% 60mo monthly", C.payment(12000, 0, 60, "monthly"), 200);
eq("payment 20000 @3.5% 48mo monthly", C.payment(20000, 3.5, 48, "monthly"), 447.12);
eq("payment of nothing", C.payment(0, 5, 60, "monthly"), 0);

/* --- taxes --- */
let t = build([["a", P]]).t;
eq("HST 13% on 1000", t.productsTax, 130);
eq("vehicle tax 13% on 40000", t.vehicleTax, 5200);
eq("amount financed = 40000 + 5200 + 1130", t.amountFinanced, 46330);
t = build([["v", P]]).t;
eq("VRC 8% on 1000", t.productsTax, 80);
t = build([["x", P]]).t;
eq("exempt product pays no tax", t.productsTax, 0);
t = build([["a", P], ["b", P]]).t;
eq("two products subtotal", t.productsSub, 1500);
eq("two products gross (1500 - 300 cost)", t.productGross, 1200);

/* --- declined products do not count --- */
{
  const s2 = build([["a", P], ["b", P]]);
  s2.tx.lines[1].declined = true;
  eq("declined product excluded from subtotal", C.totals(s2.state, s2.tx).productsSub, 1000);
}

/* --- packages --- */
{
  const s = build([["a", { preferred: true, essential: true, basic: false }], ["b", P]]);
  eq("Preferred subtotal", s.t.packages[0].sub, 1500);
  eq("Essential subtotal", s.t.packages[1].sub, 1000);
  eq("Basic empty", s.t.packages[2].sub, 0);
  eq("Essential total incl. tax", s.t.packages[1].total, 1130);
}

/* --- discount: percent, per package --- */
{
  const s = build([["a", P], ["b", P]]);
  s.tx.offers = { discount: { enabled: true, scope: "package", type: "percent", deal: 0, packages: { preferred: 10, essential: 0, basic: 0 } }, gifts: [] };
  const t2 = C.totals(s.state, s.tx), p = t2.packages[0];
  eq("10% off 1500 = 150 discount", p.discount, 150);
  eq("discounted subtotal 1350", p.sub, 1350);
  eq("tax on discounted subtotal (13% of 1350)", p.tax, 175.5);
  eq("package total 1525.50", p.total, 1525.5);
  eq("gross after discount (1350 - 300)", p.gross, 1050);
  eq("payment falls when discounted", t2.packages[0].quotes[0].payment < s.t.packages[0].quotes[0].payment, true);
}
/* --- discount switched off means nothing changes --- */
{
  const s = build([["a", P]]);
  s.tx.offers = { discount: { enabled: false, scope: "package", type: "percent", deal: 0, packages: { preferred: 50, essential: 0, basic: 0 } }, gifts: [] };
  eq("disabled discount is ignored", C.totals(s.state, s.tx).packages[0].discount, 0);
}
/* --- discount: dollar amount, capped at the package price --- */
{
  const s = build([["b", P]]);
  s.tx.offers = { discount: { enabled: true, scope: "package", type: "amount", deal: 0, packages: { preferred: 9999, essential: 0, basic: 0 } }, gifts: [] };
  const p = C.totals(s.state, s.tx).packages[0];
  eq("dollar discount capped at package price", p.discount, 500);
  eq("never below zero", p.sub, 0);
}
/* --- whole-deal discount applies to every package and to the deal totals --- */
{
  const s = build([["a", { preferred: true, essential: true, basic: false }]]);
  s.tx.offers = { discount: { enabled: true, scope: "deal", type: "amount", deal: 100, packages: { preferred: 0, essential: 0, basic: 0 } }, gifts: [] };
  const t2 = C.totals(s.state, s.tx);
  eq("deal discount on Preferred", t2.packages[0].discount, 100);
  eq("deal discount on Essential", t2.packages[1].discount, 100);
  eq("deal-level discount", t2.productsDiscount, 100);
  eq("deal-level tax reduced (13% of 900)", t2.productsTax, 117);
  eq("financed reflects discount", t2.amountFinanced, 40000 + 5200 + 900 + 117);
}
/* --- gifts: free to the customer, cost comes off gross --- */
{
  const s = build([["a", P]]);
  s.tx.offers = { discount: noOffers.discount,
    gifts: [{ id: "g", name: "Oil change", value: 90, cost: 45, showValue: false, packages: { preferred: true, essential: false, basic: false } }] };
  const t2 = C.totals(s.state, s.tx);
  eq("gift does not change the price", t2.packages[0].total, 1130);
  eq("gift attached to Preferred only", t2.packages[0].gifts.length, 1);
  eq("gift not on Essential", t2.packages[1].gifts.length, 0);
  eq("gift cost reduces package gross (800 - 45)", t2.packages[0].gross, 755);
}
/* --- old deals without offers still work --- */
{
  const s = build([["a", P]]);
  delete s.tx.offers;
  eq("deal without offers", C.totals(s.state, s.tx).packages[0].total, 1130);
}
/* --- cash deals --- */
{
  const s = build([["a", P]], { type: "Cash", cash: { tradeAllowance: 0, tradePayout: 0, downPayment: 5000, feeAmount: 0 } });
  eq("cash due = 40000 + 5200 + 1130 - 5000", s.t.cashDueTotal, 41330);
  eq("cash deals have no financed amount", s.t.amountFinanced, null);
}
/* --- trade-in reduces the taxable vehicle amount --- */
{
  const s = build([], { finance: { tradeAllowance: 10000, tradePayout: 0, downPayment: 0, fees: [], feeAmount: 0, rates: { 72: 6.9 }, terms: [72], frequency: "monthly" } });
  eq("vehicle tax after 10000 trade", s.t.vehicleTax, 3900);
}
/* --- only the package the customer chose counts as sold --- */
{
  const mk = (sel) => {
    const s = build([["a", { preferred: true, essential: true, basic: false }], ["b", P], ["v", { preferred: false, essential: false, basic: true }]]);
    if (sel) s.tx.display.selection = { package: sel };
    return C.totals(s.state, s.tx);
  };
  let t3 = mk(null);
  eq("no selection: every packaged product counts (older deals)", t3.soldLines.length, 3);
  eq("no selection: subtotal", t3.productsSub, 2500);
  t3 = mk("preferred");
  eq("Preferred chosen: products sold", t3.soldLines.length, 2);
  eq("Preferred chosen: subtotal (1000 + 500)", t3.productsSub, 1500);
  eq("Preferred chosen: tax", t3.productsTax, 195);
  eq("Preferred chosen: gross (1500 - 300 cost)", t3.productGross, 1200);
  t3 = mk("essential");
  eq("Essential chosen: only product A", t3.soldLines.length, 1);
  eq("Essential chosen: subtotal", t3.productsSub, 1000);
  t3 = mk("basic");
  eq("Basic chosen: VRC product taxed at 8%", t3.productsTax, 80);
  t3 = mk("none");
  eq("No package bought: nothing sold", t3.soldLines.length, 0);
  eq("No package bought: no product revenue", t3.productsSub, 0);
  eq("No package bought: financed = vehicle only", t3.amountFinanced, 45200);
  eq("the packages themselves still price independently", mk("none").packages[0].sub, 1500);
  const sd = build([["a", P], ["b", P]]);
  sd.tx.lines[1].declined = true;
  eq("declined product never counts as sold", C.totals(sd.state, sd.tx).soldLines.length, 1);
  const v = build([["a", P]]);
  eq("must record the chosen package before completing", C.validate(v.state, v.tx).ok, false);
  v.tx.display.selection = { package: "preferred" };
  eq("validation message mentions the package", C.validate(v.state, v.tx).errors.some((e) => /package the customer chose/.test(e)), false);
}

/* --- per-deal dealer cost when the product list has none --- */
{
  const prods = products.concat([{ id: "n", name: "N", uses: {}, taxRule: "standard", cost: null, pricing: { base: 800 } }]);
  const st = { config: cfg, products: prods };
  const tx = C.newTransaction("u1", "d1"); tx.vehicle.price = 40000; tx.finance.terms = [72]; tx.finance.rates = { 72: 6.9 }; tx.finance.frequency = "monthly";
  tx.lines = [{ lineId: "L0", productId: "n", packages: P, price: null }, { lineId: "L1", productId: "a", packages: P, price: null, cost: 999 }];
  let t4 = C.totals(st, tx);
  eq("no list cost and none entered: counts as 0", t4.productCost, 200);
  eq("flagged as missing cost", t4.lines[0].costMissing, true);
  eq("list cost wins over a per-deal cost", t4.lines[1].cost, 200);
  tx.lines[0].cost = 350;
  t4 = C.totals(st, tx);
  eq("per-deal cost used when list has none", t4.lines[0].cost, 350);
  eq("gross uses per-deal cost (1800 - 550)", t4.productGross, 1250);
  eq("no longer flagged", t4.lines[0].costMissing, false);
}

/* --- brand headers and overrides --- */
eq("Ford header", C.brandOfDealer({ brandKey: "ford" }).finLabel, "FORD CREDIT FINANCIAL SERVICES");
eq("unknown brand falls back", C.brandOfDealer({ brandKey: "nope" }).key, "nissan");
eq("custom brand name", C.brandOfDealer({ brandKey: "custom", customBrandName: "Jeep" }).label, "Jeep");
eq("header override", C.brandOfDealer({ brandKey: "ford", headerTitle: "Ford Credit Canada" }).finLabel, "FORD CREDIT CANADA");
eq("Subaru exists", !!D.BRANDS.subaru, true);

/* --- Sales Tracker: selling days and performance maths (matches the sales managers' sheet) --- */
{
  eq("ST Easter 2026", C.localISO(C.easterSunday(2026)), "2026-04-05");
  eq("ST Easter 2027", C.localISO(C.easterSunday(2027)), "2027-03-28");
  const h26 = C.ontarioHolidays(2026);
  eq("ST Family Day 2026", h26["2026-02-16"], "Family Day");
  eq("ST Good Friday 2026", h26["2026-04-03"], "Good Friday");
  eq("ST Victoria Day 2026", h26["2026-05-18"], "Victoria Day");
  eq("ST Civic Holiday 2026", h26["2026-08-03"], "Civic Holiday");
  eq("ST Labour Day 2026", h26["2026-09-07"], "Labour Day");
  eq("ST Thanksgiving 2026", h26["2026-10-12"], "Thanksgiving");
  eq("ST Victoria Day 2027 (May 24)", C.ontarioHolidays(2027)["2027-05-24"], "Victoria Day");
  eq("ST Christmas 2027 on a Saturday closes Monday", C.ontarioHolidays(2027)["2027-12-27"], "Christmas Day (observed)");
  eq("ST Canada Day 2029 on a Sunday closes Monday", C.ontarioHolidays(2029)["2029-07-02"], "Canada Day (observed)");
  eq("ST August 2026 = 25 selling days (their sheet)", C.sellingDays("2026-08").total, 25);
  eq("ST September 2026 = 25 selling days (their sheet)", C.sellingDays("2026-09").total, 25);
  eq("ST October 2026 = 26 selling days (their sheet)", C.sellingDays("2026-10").total, 26);
  const oct = C.sellingDays("2026-10");
  eq("ST Oct 16 is selling day 13", C.sellingDayOf(oct, "2026-10-16"), 13);
  eq("ST Oct 12 counts as day 9 still (closed)", C.sellingDayOf(oct, "2026-10-12"), 9);
  eq("ST a closed day can be opened", C.sellingDays("2026-10", { open:["2026-10-12"] }).total, 27);
  eq("ST an open day can be closed", C.sellingDays("2026-10", { closed:["2026-10-31"] }).total, 25);
  const deals = [
    { soldDate:"2026-10-02", status:"delivered", type:"New", salespeople:[{ name:"Arun", share:1 }], frontGross:1000, fiGross:500 },
    { soldDate:"2026-10-03", status:"pending", type:"Used", salespeople:[{ name:"ARUN", share:1 }] },
    { soldDate:"2026-10-04", status:"approved", type:"As-is", salespeople:[{ name:"Keegan", share:0.5 }, { name:"Abbas", share:0.5 }] },
    { soldDate:"2026-10-05", status:"declined", type:"New", salespeople:[{ name:"Arun", share:1 }] },
    { soldDate:"2026-10-06", status:"cancelled", type:"New", salespeople:[{ name:"Arun", share:1 }] },
    { soldDate:"2026-09-29", status:"carry", type:"New", salespeople:[{ name:"Arun", share:1 }] },
    { soldDate:"2026-10-07", status:"delivered", type:"New", salespeople:[{ name:"HOUSE", share:1 }], frontGross:2000 }
  ];
  const tg = { people:[{ name:"ARUN", n:10, u:8 }, { name:"KEEGAN", n:10, u:8 }, { name:"ABBAS", n:10, u:8 }] };
  const p = C.salesPerformance(deals, tg, { from:"2026-10-01", to:"2026-10-31" }, 10, 26);
  const arun = p.people.find(x => x.name === "ARUN"), keegan = p.people.find(x => x.name === "KEEGAN"), house = p.people.find(x => x.name === "HOUSE");
  eq("ST Arun sold N (declined/cancelled/last month don't count)", arun.sN, 1);
  eq("ST Arun sold U", arun.sU, 1);
  eq("ST As-is counts as Used, split 0.5", keegan.sU, 0.5);
  eq("ST Arun tracking N = round(1/10*26)", arun.kN, 3);
  eq("ST Arun % to target", Math.round(arun.pct * 100), Math.round((3 + 3)/18 * 100));
  eq("ST Arun status", arun.status, "behind");
  eq("ST Arun needs per day", arun.perDay, (18 - 2)/16, 0.0001);
  eq("ST House is store-only", house.storeOnly, true);
  eq("ST store sold N (whole units)", p.store.sN, 2);
  eq("ST store sold U", p.store.sU, 2);
  eq("ST store target = salespeople only", p.store.tT, 54);
  eq("ST store gross", p.store.front + p.store.fi, 3500);
  eq("ST House listed last", p.people[p.people.length - 1].name, "HOUSE");
  eq("ST status bands", [C.saleStatus(1), C.saleStatus(0.95), C.saleStatus(0.89)].join(","), "ahead,pace,behind");
  const dl = C.salesPerformance(deals, Object.assign({ countOn:"delivered" }, tg), { from:"2026-10-01", to:"2026-10-31" }, 10, 26);
  eq("ST counting on delivery", dl.store.sT, 2);
  eq("ST day 0 has no tracking yet", C.salesPerformance(deals, tg, { from:"2026-10-01", to:"2026-10-31" }, 0, 26).store.kT, null);
  /* their August sheet: ARUN sold N 7, U 12 on day 25 of 25 → tracking 7 / 12, 106% of 18 */
  const aug = C.salesPerformance(Array.from({ length:19 }, (_, i) => ({ soldDate:"2026-08-10", status:"delivered", type:i < 7 ? "New" : "Used", salespeople:[{ name:"ARUN", share:1 }] })),
    { people:[{ name:"ARUN", n:10, u:8 }] }, { from:"2026-08-01", to:"2026-08-31" }, 25, 25);
  eq("ST matches the August sheet (ARUN 106%, AHEAD)", Math.round(aug.people[0].pct * 100) + " " + aug.people[0].status, "106 ahead");
}
/* --- Payoff calculator: matches the dealership's Excel sheet example --- */
{
  const o = { amount: 31790.13, apr: 7.99, months: 84, freq: "biweekly", first: "2026-02-06" };
  const base = C.amortSchedule(o);
  eq("AM bi-weekly payment (sheet D14)", base.pmt, 228.31);
  eq("AM 7 years bi-weekly = 182 payments (sheet stops at 156)", base.count, 182);
  eq("AM first period interest (sheet F21)", base.rows[0].interest, 97.69);
  eq("AM balance after payment 1 (sheet H21)", base.rows[0].balance, 31659.51);
  eq("AM pays off to zero", base.rows[base.count - 1].balance, 0);
  eq("AM principal paid = loan", base.rows.reduce((a, x) => a + x.principal, 0), 31790.13, 0.01);
  eq("AM total paid = loan + interest", base.paid, 31790.13 + base.interest, 0.01);
  eq("AM schedule interest close to sheet's 9,762.10", Math.abs(base.interest - 9762.10) < 2, true);
  const plan = C.amortSchedule(Object.assign({}, o, { lumps: [{ at: 2, amount: 26300 }] }));
  eq("AM lump sum: balance after payment 2 (sheet H22)", plan.rows[1].balance, 5228.49);
  eq("AM lump sum: total interest (sheet H6)", plan.interest, 396.46);
  eq("AM lump sum: number of payments (sheet H8)", plan.count, 26);
  eq("AM lump sum: total payments (sheet H5)", plan.paid, 32186.59);
  eq("AM bi-weekly dates step 14 days (sheet B22)", plan.rows[1].date, "2026-02-20");
  const big = C.amortSchedule(Object.assign({}, o, { lumps: [{ at: 3, amount: 99999 }] }));
  eq("AM lump larger than balance stops at zero", big.rows[big.count - 1].balance, 0);
  eq("AM lump larger than balance ends the loan that payment", big.count, 3);
  const cmp = C.amortCompare(Object.assign({}, o, { lumps: [{ at: 2, amount: 26300 }] }));
  eq("AM compare: interest saved", cmp.saved, cmp.base.interest - 396.46, 0.01);
  eq("AM compare: payments saved", cmp.fewer, 156);
  const m = C.amortSchedule({ amount: 10000, apr: 6, months: 12, freq: "monthly", first: "2026-01-31" });
  eq("AM month-end date stays in February", m.rows[1].date, "2026-02-28");
  eq("AM month-end date returns to the 31st", m.rows[2].date, "2026-03-31");
  eq("AM 0% loan", C.amortSchedule({ amount: 1200, apr: 0, months: 12, freq: "monthly" }).interest, 0);
  const yrs = C.amortYears(base);
  eq("AM 7 years of yearly totals", yrs.length, 7);
  eq("AM yearly interest adds up", yrs.reduce((a, y) => a + y.interest, 0), base.interest, 0.01);
  const ev = C.amortSchedule(Object.assign({}, o, { every: 50 }));
  eq("AM extra on every payment shortens the loan", ev.count < 182 && ev.interest < base.interest, true);
}
/* --- Payoff calculator: customer's goal (paid off in X months) --- */
{
  const o = { amount: 31790.13, apr: 7.99, months: 84, freq: "biweekly", first: "2026-10-28" };
  const g = C.amortGoal(o, 36);
  eq("GOAL 36 months bi-weekly = 78 payments", g.nt, 78);
  eq("GOAL lump sum ends the loan within 78 payments", g.lump.sched.count <= 78, true);
  eq("GOAL one cent less is not enough", C.amortSchedule(Object.assign({}, o, { lumps: [{ at: 1, amount: g.lump.amount - 0.01 }] })).count > 78, true);
  eq("GOAL top-up ends the loan within 78 payments", g.every.sched.count <= 78, true);
  eq("GOAL one cent less top-up is not enough", C.amortSchedule(Object.assign({}, o, { every: g.every.amount - 0.01 })).count > 78, true);
  eq("GOAL lump saves interest", g.lump.saved > 0 && g.every.saved > 0, true);
  /* closed form check: the lump leaves exactly what 77 more payments of 228.31 repay */
  const r = 0.0799 / 26, b1 = 31790.13 - (228.31 - 97.69), pv = 228.31 * (1 - Math.pow(1 + r, -77)) / r;
  eq("GOAL lump close to the annuity formula", Math.abs(g.lump.amount - (b1 - pv)) < 2, true);
  eq("GOAL longer than the term needs nothing", C.amortGoal(o, 96).reached, true);
  const m = C.amortGoal({ amount: 40000, apr: 6.49, months: 72, freq: "monthly", first: "2026-11-01" }, 24);
  eq("GOAL monthly 24 months", m.lump.sched.count, 24);
}
/* --- Cash Conversion: early payoff, extra payment, tax on earnings --- */
{
  const po = C.loanPayoff(45000, 1.99, 60, "monthly", 12);
  eq("CC payoff 12 payments made", po.periods, 12);
  eq("CC payoff interest + principal = paid", po.paid - (45000 - po.balance), po.interest, 0.01);
  eq("CC payoff interest after 12 months", Math.round(po.interest), 817, 1);
  eq("CC payoff at full term leaves nothing", C.loanPayoff(45000, 1.99, 60, "monthly", 60).balance, 0, 0.05);
  const ex = C.loanExtra(31790.13, 7.99, 84, "biweekly", 26300, 1);
  eq("CC extra payment saves most of the interest", ex.saved > 0.9 * ex.baseInterest, true);
  eq("CC extra payment shortens the loan", ex.sooner > 100, true);
  eq("CC no extra payment saves nothing", C.loanExtra(45000, 1.99, 60, "monthly", 0, 6).saved, 0, 0.05);
  eq("CC extra larger than balance ends the loan that period", C.loanExtra(45000, 1.99, 60, "monthly", 99999, 6).periods, 6);
  const base = { amount: 45000, apr: 1.99, term: 60, lost: 0, years: 5, invest: "gic", rate: 3.5 };
  const free = C.cashAdvantage(base), taxed = C.cashAdvantage(Object.assign({}, base, { tax: 30 }));
  eq("CC tax lowers the result", taxed.adv < free.adv, true);
  eq("CC 30% tax = 3.5% earning 2.45%", Math.round(taxed.adv), Math.round(C.cashAdvantage(Object.assign({}, base, { rate: 2.45 })).adv), 15);
  eq("CC tax raises the break-even", taxed.breakEven > free.breakEven, true);
}
/* --- Cash Conversion: cash vs finance & invest, line of credit --- */
{
  const base = { amount: 45000, apr: 1.99, term: 60, lost: 0, years: 5 };
  const gic = C.cashAdvantage(Object.assign({}, base, { invest: "gic", rate: 3.5 }));
  eq("CA payment 45000 @1.99% 60mo", gic.pmt, 788.55);
  eq("CA interest", Math.round(gic.interest), 2313);
  eq("CA GIC 3.5% advantage", Math.round(gic.adv), 1894, 1);
  eq("CA break-even ~ APR (effective)", gic.breakEven, 2.008, 0.01);
  eq("CA at break-even rate both paths level", C.caConst(base, gic.breakEven, 60).adv, 0, 0.5);
  const lost = C.cashAdvantage(Object.assign({}, base, { lost: 2000, invest: "gic", rate: 3.5 }));
  eq("CA cash discount lost flips GIC result", Math.round(lost.adv), -481, 1);
  eq("CA no rate -> no result", C.cashAdvantage(Object.assign({}, base, { invest: "custom", rate: "" })), null);
  eq("CA zero investment return = minus interest", C.caConst(Object.assign({}, base, { apr: 0 }), 0, 60).adv, 0, 0.01);
  const longer = C.cashAdvantage(Object.assign({}, base, { invest: "gic", rate: 3.5, years: 10 }));
  eq("CA longer horizon grows the gap", longer.adv > gic.adv, true);
  const shorter = C.caConst(Object.assign({}, base, { years: 2 }), 0, 24);
  eq("CA shorter horizon subtracts loan balance (0% return, 1.99% loan)", shorter.adv < 0, true);
  const sp = C.cashAdvantage(Object.assign({}, base, { invest: "sp500" }));
  eq("CA S&P windows 1990-2025 for 5 years", sp.periods, 373);
  eq("CA S&P percent in range", sp.aheadPct > 0 && sp.aheadPct < 100, true);
  eq("CA worst <= median <= best", sp.worst <= sp.median && sp.median <= sp.best, true);
  eq("CA dataset length", C.MARKETS.sp500.returns.length === 36 && C.MARKETS.tsx.returns.length === 36, true);
  /* the account view: advantage = earnings - interest paid - discount given up */
  const rr = gic.run;
  eq("CA account identity", rr.adv, rr.earnings - rr.interestPaid - rr.lost, 0.01);
  eq("CA loan fully repaid at term", rr.owing, 0, 0.01);
  eq("CA interest paid = loan interest", rr.interestPaid, gic.interest, 0.05);
  eq("CA year rows", rr.years.length, 5);
  eq("CA years chain", rr.years[1].start, rr.years[0].end, 0.001);
  const rl = lost.run;
  eq("CA identity with discount lost", rl.adv, rl.earnings - rl.interestPaid - 2000, 0.01);
  const sh = C.caConst(Object.assign({}, base, { years: 2 }), 5, 24);
  eq("CA identity mid-loan", sh.adv, sh.earnings - sh.interestPaid, 0.01);
  eq("CA mid-loan still owes", sh.owing > 0, true);
  /* markets: headline uses the compound average since 1990 (default), last 10 or last 5 years */
  eq("CA S&P average since 1990", C.marketAverage("sp500", 0).rate, 11.23, 0.01);
  eq("CA S&P average last 10 years", C.marketAverage("sp500", 10).rate, 14.75, 0.01);
  eq("CA S&P average last 5 years", C.marketAverage("sp500", 5).rate, 16.03, 0.01);
  eq("CA TSX average since 1990", C.marketAverage("tsx", 0).rate, 8.64, 0.01);
  eq("CA last 5 years = 2021-2025", C.marketAverage("sp500", 5).from, 2021);
  eq("CA market default = since 1990", sp.rate, C.marketAverage("sp500", 0).rate, 1e-9);
  eq("CA market result = steady average", sp.adv, C.caConst(base, sp.rate, 60).adv, 0.01);
  const sp5 = C.cashAdvantage(Object.assign({}, base, { invest: "sp500", avgOver: "5" }));
  eq("CA last-5 option uses 2021-2025 average", sp5.rate, C.marketAverage("sp500", 5).rate, 1e-9);
  eq("CA history facts unchanged by average choice", sp5.aheadPct, sp.aheadPct, 1e-9);

  const same = C.locCompare({ amount: 45000, apr: 4.99, term: 60, lost: 0, locRate: 4.99 });
  eq("LOC same rate, matched payment = same cost", same.locCheaperBy, 0, 0.5);
  eq("LOC same rate pays off on time", same.loc.payoff, 60);
  const lc = C.locCompare({ amount: 45000, apr: 4.99, term: 60, lost: 0, locRate: 5.45 });
  eq("LOC dealer payment", lc.dealer.pmt, 849.00);
  eq("LOC higher rate, same payment -> later payoff", lc.loc.payoff > 60, true);
  eq("LOC higher rate costs more", lc.locCheaperBy < 0, true);
  eq("LOC rate rise costs more", lc.loc.riseInterest > lc.loc.interest, true);
  eq("LOC interest-only payment", lc.loc.ioPmt, 204.38);
  const io = C.locCompare({ amount: 45000, apr: 4.99, term: 60, locRate: 5.45, payMode: "interest" });
  eq("LOC interest-only never paid off", io.loc.payoff, null);
  eq("LOC interest-only still owes all", io.loc.owingAtTerm, 45000, 0.01);
  const low = C.locCompare({ amount: 45000, apr: 4.99, term: 60, locRate: 5.45, payMode: "custom", payAmount: 150 });
  eq("LOC payment below interest flagged", low.loc.grows, true);
  eq("LOC unpaid interest compounds onto balance", low.loc.owingAtTerm > 45000, true);
  const cu = C.locCompare({ amount: 45000, apr: 4.99, term: 60, locRate: 4.99, payMode: "custom", payAmount: 600 });
  eq("LOC smaller payment -> longer and dearer", cu.loc.payoff > 60 && cu.locCheaperBy < 0, true);
  const dr = C.locCompare({ amount: 45000, apr: 4.99, term: 60, locRate: 4.99, drawAmount: 5000, drawYear: 2 });
  eq("LOC extra withdrawal adds to balance in month 13", dr.loc.path[13] > dr.loc.path[12] + 4000, true);
  eq("LOC extra withdrawal extends payoff", dr.loc.payoff > 60, true);
  /* "How it's worked out" box: cash + earnings - payments - still owing = result */
  const box = (r) => r.cash + r.earnings - r.paid - r.owing;
  eq("CA box adds up", box(rr), rr.adv, 0.01);
  eq("CA box adds up with discount lost", box(rl), rl.adv, 0.01);
  eq("CA box adds up mid-loan", box(sh), sh.adv, 0.01);
  eq("CA payments counted", rr.payCount, 60);
  eq("CA payments total = principal + interest", rr.paid, 45000 + rr.interestPaid, 0.01);
  {
    const s30 = C.cashAdvantage({ amount: 30000, apr: 7.99, term: 60, lost: 0, years: 5, invest: "sp500" }).run;
    eq("CA $30k example result at 11.23% average", Math.round(s30.adv), 3114, 1);
    eq("CA $30k example identity", s30.adv, s30.earnings - s30.interestPaid, 0.01);
    eq("CA earnings counted only on what is left (less than untouched)", s30.earnings < s30.untouchedEarnings, true);
    eq("CA $30k untouched earnings at 11.23%", s30.untouchedEarnings, 30000 * (Math.pow(1.1123, 5) - 1), 15);
  }

  /* "Keep it invested" view: untouched cash − loan owing − payments invested instead = same result */
  const keep = (r) => r.untEnd - r.owing - r.portEnd;
  eq("CA keep-invested view = same result", keep(rr), rr.adv, 0.01);
  eq("CA keep-invested view with discount lost", keep(rl), rl.adv, 0.01);
  eq("CA keep-invested view mid-loan", keep(sh), sh.adv, 0.01);
  {
    const ex = C.cashAdvantage({ amount: 30000, apr: 4.99, term: 60, lost: 0, years: 5, invest: "gic", rate: 3.25 }).run;
    eq("CA Excel example: untouched $30k at 3.25%", ex.untEnd, 30000 * Math.pow(1.0325, 5), 0.01);
    eq("CA Excel example: payments invested beat untouched cash", ex.portEnd > ex.untEnd, true);
    eq("CA Excel example: both views agree", keep(ex), ex.adv, 0.01);
    eq("CA Excel example: borrowing 4.99% to earn 3.25% loses", ex.adv < 0, true);
  }

  /* bi-weekly: 26 payments a year, same rule as the Finance page */
  const bw = C.cashAdvantage(Object.assign({}, base, { freq: "biweekly", invest: "gic", rate: 3.5 }));
  eq("CA bi-weekly payment matches deal desk", bw.pmt, C.payment(45000, 1.99, 60, "biweekly"));
  eq("CA bi-weekly 130 payments", bw.nPay, 130);
  eq("CA bi-weekly identity", bw.run.adv, bw.run.earnings - bw.run.interestPaid, 0.01);
  eq("CA bi-weekly loan repaid", bw.run.owing, 0, 0.01);
  eq("CA bi-weekly interest close to monthly", Math.abs(bw.interest - gic.interest) < 60, true);
  eq("CA bi-weekly year rows", bw.run.years.length, 5);
  const bwsp = C.cashAdvantage(Object.assign({}, base, { freq: "biweekly", invest: "sp500" }));
  eq("CA bi-weekly history windows", bwsp.periods, 26*36 - 130 + 1);
  const bwl = C.locCompare({ amount: 45000, apr: 4.99, term: 60, locRate: 4.99, freq: "biweekly" });
  eq("LOC bi-weekly same rate = same cost", bwl.locCheaperBy, 0, 0.5);
  eq("LOC bi-weekly pays off in 130 payments", bwl.loc.payoff, 130);
  eq("LOC bi-weekly interest-only payment", bwl.loc.ioPmt, 45000*0.0499/26, 0.001);
  const bwd = C.locCompare({ amount: 45000, apr: 4.99, term: 60, locRate: 4.99, freq: "biweekly", drawAmount: 5000, drawYear: 2 });
  eq("LOC bi-weekly draw lands at start of year 2", bwd.loc.path[27] > bwd.loc.path[26] + 4000, true);

  const lc2 = C.locCompare({ amount: 45000, apr: 4.99, term: 60, lost: 2000, locRate: 4.99 });
  eq("LOC keeps cash discount -> smaller loan", lc2.loc.amount, 43000);
  eq("LOC keeps cash discount -> cheaper", lc2.locCheaperBy > 0, true);
  eq("LOC no rate -> null", C.locCompare({ amount: 45000, apr: 4.99, term: 60, locRate: "" }), null);
}

/* --- dates are the local calendar day, not UTC (8 PM in Ontario is already tomorrow in UTC) --- */
eq("localISO uses local date", C.localISO(new Date(2026, 9, 10, 23, 30)), "2026-10-10");
eq("localISO pads month and day", C.localISO(new Date(2026, 0, 5, 0, 5)), "2026-01-05");
{ const d = new Date(); eq("todayISO = local today", C.todayISO(), C.localISO(d)); }

/* --- validation issues point at the right step and field --- */
{
  const v = build([["a", P]]);
  v.tx.customer.name = ""; v.tx.vehicle.model = ""; v.tx.finance.rates = {};
  const r = C.validate(v.state, v.tx);
  eq("one issue per error", r.issues.length, r.errors.length);
  eq("issues carry the same messages", r.issues.every((x, i) => x.msg === r.errors[i]), true);
  const step = (re) => (r.issues.find((x) => re.test(x.msg)) || {}).step;
  eq("missing customer -> step 1", step(/Add a customer/), 1);
  eq("missing model -> step 2", step(/model and stock/), 2);
  eq("missing rate -> step 3", step(/interest rate for 72/), 3);
  eq("missing package choice -> step 5", step(/package the customer chose/), 5);
  eq("rate issue targets that term's rate box", r.issues.find((x) => /interest rate/.test(x.msg)).target, '[data-act="term-rate"][data-term="72"]');
  const t = build([["a", P]]);
  t.tx.lines[0].price = null; t.state = { config: cfg, products: [{ id: "a", name: "A", uses: { term: true }, terms: [36, 60], taxRule: "standard", cost: 1, pricing: null }] };
  const r2 = C.validate(t.state, t.tx);
  const term = r2.issues.find((x) => /select a term/.test(x.msg));
  eq("product option issue opens that product's options", term && term.cfg && term.product, "a");
  eq("product option issue targets its select", term && term.target, '[data-bind="line:L0:term"]');
}

/* --- Sales Insights: gross split with the unit, losing money, history, projections --- */
{
  const sp = (n, s) => ({ name:n, share:s === undefined ? 1 : s });
  const deals = [
    { soldDate:"2026-10-02", status:"delivered", deliveredDate:"2026-10-03", type:"New", salespeople:[sp("ARUN")], frontGross:3000, fiGross:1000 },
    { soldDate:"2026-10-05", status:"pending", type:"Used", salespeople:[sp("ARUN", 0.5), sp("BILAL", 0.5)], frontGross:2000, fiGross:500 },
    { soldDate:"2026-10-06", status:"delivered", type:"Used", salespeople:[sp("BILAL")], frontGross:0, fiGross:1500 },
    { soldDate:"2026-10-07", status:"scheduled", type:"New", salespeople:[sp("BILAL")], frontGross:-750, fiGross:0 },
    { soldDate:"2026-10-08", status:"pending", type:"New", salespeople:[sp("BILAL")], frontGross:null, fiGross:null },
    { soldDate:"2026-10-09", status:"declined", type:"New", salespeople:[sp("ARUN")], frontGross:-5000, fiGross:0 },
    { soldDate:"2026-09-10", status:"delivered", type:"New", salespeople:[sp("ARUN")], frontGross:1000, fiGross:1000 },
    { soldDate:"2026-09-11", status:"delivered", type:"Used", salespeople:[sp("ARUN")], frontGross:1000, fiGross:1000 },
  ];
  const a = C.salesAgg(deals, { from:"2026-10-01", to:"2026-10-31" }, "sold");
  eq("INS declined deals don't count", a.store.units, 5);
  eq("INS store gross = front + F&I of counted deals", a.store.front + a.store.fi, 7250);
  eq("INS a split deal splits its gross", a.people.ARUN.front, 4000);
  eq("INS split share of units", a.people.BILAL.units, 3.5);
  eq("INS $0 front gross is losing money", a.people.BILAL.losingN, 2);
  eq("INS losing amount", a.people.BILAL.losingAmt, -750);
  eq("INS no front gross entered isn't losing", a.store.losingN, 2);
  eq("INS deliveries counted on delivery date", a.store.delivered, 2);
  const targets = {
    "2026-08": { history:{ people:{ ARUN:{ n:7, u:12 }, BILAL:{ n:3, u:4 } } } },
    "2026-10": { people:[{ name:"ARUN", n:10, u:8 }, { name:"BILAL", n:10, u:8 }], gross:100000 },
  };
  const ins = C.salesInsights({ deals, targets, year:2026, today:"2026-10-16" });
  const aug = ins.months.filter((m) => m.month === "2026-08")[0];
  eq("INS imported Sales Performance totals give past months' units", aug.units, 26);
  eq("INS history marks the month", aug.fromHistory, true);
  eq("INS a month with no deals has no gross", aug.hasDeals, false);
  eq("INS year to date units = history + logged", ins.ytd.units, 26 + 2 + 5);
  eq("INS year to date gross from logged deals", ins.ytd.gross, 4000 + 7250);
  eq("INS year selling days", ins.yearDays, ins.months.reduce((t, m) => t + m.total, 0));
  const octDays = C.sellingDays("2026-10"), day = C.sellingDayOf(octDays, "2026-10-16");
  eq("INS month tracking units", ins.mtd.trackUnits, Math.round(5/day*octDays.total));
  const arun = ins.scores.mtd.filter((p) => p.name === "ARUN")[0];
  eq("INS last month's units", arun.last, 2);
  eq("INS 3-month average", arun.avg3, (2 + 0 + 19)/3);
  eq("INS growth = tracking ÷ 3-month average", arun.growth, (1.5/day*octDays.total)/((2 + 0 + 19)/3));
  eq("INS front per vehicle", arun.frontPvr, 4000/1.5);
  const sep = C.sellingDays("2026-09").total, aug2 = C.sellingDays("2026-08").total;
  eq("INS gross pace uses only months with deals logged", ins.proj.gross.pace, Math.round((4000 + 7250)/(sep + day)*ins.yearDays));
  eq("INS gross projection flagged as estimated", ins.proj.estimated, true);
  eq("INS months with nothing recorded are left out of the unit pace", ins.proj.units.pace, Math.round((26 + 2 + 5)/(aug2 + sep + day)*ins.yearDays));
  eq("INS store-only HOUSE isn't a salesperson", ins.scores.mtd.some((p) => p.name === "HOUSE"), false);
  eq("INS salesperson year-end matches the store's method", arun.yearEnd, Math.round((19 + 2 + 1.5)/(aug2 + sep + day)*ins.yearDays));
  const late = C.salesInsights({ deals:deals.concat([{ soldDate:"2026-10-03", status:"delivered", type:"New", salespeople:[sp("NEWBIE")], frontGross:1000, fiGross:0 }]), targets, year:2026, today:"2026-10-16" });
  const nb = late.scores.ytd.filter((p) => p.name === "NEWBIE")[0];
  eq("INS a new hire is projected from their first month", nb.yearEnd, Math.round(1/day*late.months.filter((m) => m.month >= "2026-10").reduce((t, m) => t + m.total, 0)));
}
/* --- Excel import: dates as typed, headers found anywhere, statuses and money read --- */
{
  eq("IMP 9TH SEP on a September 2026 tab", C.impDate("9TH SEP", 2026, 9), "2026-09-09");
  eq("IMP 31ST AUG on the September tab", C.impDate("31ST AUG", 2026, 9), "2026-08-31");
  eq("IMP DEC row on a January tab is last year", C.impDate("28TH DEC", 2027, 1), "2026-12-28");
  eq("IMP an Excel day number", C.impDate(46274, 2026, 9), "2026-09-09");
  eq("IMP ISO date", C.impDate("2026-10-03", null, null), "2026-10-03");
  eq("IMP day after month", C.impDate("Sep 9", 2026, 9), "2026-09-09");
  eq("IMP 31 SEP isn't a date", C.impDate("31ST SEP", 2026, 9), null);
  eq("IMP money with $ and commas", C.impMoney("$1,250.50"), 1250.5);
  eq("IMP a dash is no amount", C.impMoney("-"), null);
  eq("IMP negative in brackets", C.impMoney("(250)"), -250);
  eq("IMP month from a perf title", C.impMonthOf("AUGUST 2026 SALES PERFORMANCE").m, 8);
  const rows = [["Pre-Owned sales log"], ["September 2026 — 401Dixie Nissan"], [], ["S #","Day","Date","Stock #","RDR","CPO","Stock Source","Customer #","Salesperson","F&I Manager","Customer Name","Vehicle","Status","F/C","Front G.P","Posted","Disc./Unit","F&I GP/Unit","2nd T.O","Source","Close Type","App (Y/N)","Sec.Pack","Trade","Tire Sale"],
    [1,"TUESDAY","18TH AUG","M0304","","Y","Traderev","","Abbas","Rahul","JUSTIN POYSER","2024 ROGUE","Delivered","Finance",-1000,"","",9000,"","Phone","1st Visit","","","N",""],
    [2,"THURSDAY","3RD SEP","I0050","Y","","Internal","","Arun","Salma","MUHAMMAD ABDULLAH","2023 GV80","Delivered","Finance","2,500","","","-","","Walk In","Be-Back","Y","","Y",""],
    [3,"","","M0400","","","","","","","","","Sch. Delivery","Cash","","","","","","","","","","",""],
    [4,"","","","","","","","","","","","","","","","","","","","","","","",""]];
  const sh = C.impLogSheet("September 2026", rows, { type:"Used", leads:["Walk in","E-Lead","Phone"], closes:["1st visit","Be-back"], stocks:["Internal","Trade in","Auction / TradeRev"] });
  eq("IMP header found below the summary", sh.header.row, 3);
  eq("IMP month from the tab name", sh.month, "2026-09");
  eq("IMP rows read (blank rows skipped)", sh.rows.length, 3);
  const d0 = sh.rows[0].deal, d1 = sh.rows[1].deal;
  eq("IMP an August row on the September tab keeps its date", d0.soldDate, "2026-08-18");
  eq("IMP negative front gross", d0.frontGross, -1000);
  eq("IMP salesperson upper-cased", d0.salespeople[0].name, "ABBAS");
  eq("IMP RDR = Y counts as delivered (no scanned status)", d1.status + ":" + !!d1.flags.rdr, "delivered:true");
  const mr = C.impMerge([
    { deal:{ id:"a", customer:"Kyle Thackwary", soldDate:"2026-08-22", stockNo:"LOCATE", status:"approved", salespeople:[{ name:"ABBAS", share:1 }] }, tab:"Aug" },
    { deal:{ id:"b", customer:"Mashal Khan", soldDate:"2026-08-24", stockNo:"LOCATE", status:"approved", salespeople:[{ name:"ARUN", share:1 }] }, tab:"Aug" },
    { deal:{ id:"c", customer:"KYLE THACKWARY", soldDate:"2026-08-22", stockNo:"T20980", status:"delivered", salespeople:[{ name:"ABBAS", share:1 }] }, tab:"Sep" },
    { deal:{ id:"b", customer:"Mashal Khan", soldDate:"2026-08-24", stockNo:"LOCATE", status:"scheduled", salespeople:[{ name:"ARUN", share:1 }] }, tab:"Sep" },
    { deal:{ id:"d", customer:"Kyle Thackwary", soldDate:"2026-10-02", stockNo:"T21100", status:"pending", salespeople:[{ name:"ABBAS", share:1 }] }, tab:"Oct" }]);
  eq("IMP a re-logged deal is one deal (latest tab wins)", mr.rows.map((r) => r.deal.id + ":" + r.deal.status).join(","), "c:delivered,b:scheduled,d:pending");
  eq("IMP merged count", mr.merged, 2);
  eq("IMP F&I dash = none", d1.fiGross, null);
  eq("IMP lead source matched", d1.leadSource, "Walk in");
  eq("IMP close type matched", d1.closeType, "Be-back");
  eq("IMP ticks read", d1.flags.appt && d1.flags.trade, true);
  eq("IMP stock source matched", d0.stockSource, "Auction / TradeRev");
  eq("IMP delivered deals get a delivery date", d1.deliveredDate, "2026-09-03");
  eq("IMP a row without a date can't be imported", sh.rows[2].bad, true);
  eq("IMP Sch. Delivery read", sh.rows[2].deal.status, "scheduled");
  eq("IMP the same row gives the same id", C.impLogSheet("September 2026", rows, { type:"Used" }).rows[0].deal.id, d0.id);
  eq("IMP a sheet without a sales log is ignored", C.impLogSheet("Read Me", [["Hello"], ["World"]], {}), null);
  eq("IMP pre-owned file name = Used", C.impTypeFromName("2026 NISSAN PRE-OWNED LOG.xlsx"), "Used");
  eq("IMP new car file name = New", C.impTypeFromName("2026 New Car Log.xlsx"), "New");
  eq("IMP a neutral name decides nothing", C.impTypeFromName("Sales log.xlsx"), null);
  eq("IMP auto type from the file name", C.impLogSheet("September 2026", rows, { type:"auto", file:"2026 NISSAN PRE-OWNED LOG.xlsx" }).rows[0].deal.type, "Used");
  const nl = [["NEW VEHICLE SALES — OCTOBER 2026"], ["Deal Date","Stk","Buyer","Sales Person","Sales Person 2","Year Make Model","Front End Gross","F&I Income","Bank","Del Date","Status"],
    ["10/03/2026","N24001","Dana Wu","Arun","Bilal","2026 Rogue SV","$1,850","1,200","TD","10/06/2026","Delivered"],
    ["10/04/2026","N24002","Sam Ko","Thinh","","2026 Kicks","(300)","","","","Sold"]];
  const ns = C.impLogSheet("Sheet1", nl, { type:"auto", file:"New Car Log 2026.xlsx" });
  eq("IMP different headings recognised", ns && ns.rows.length, 2);
  eq("IMP New from the file name", ns.rows[0].deal.type, "New");
  eq("IMP a second salesperson splits 50/50", ns.rows[0].deal.salespeople.length + ":" + ns.rows[0].deal.salespeople[1].share, "2:0.5");
  eq("IMP delivery date column used", ns.rows[0].deal.deliveredDate, "2026-10-06");
  eq("IMP F&I income read as F&I gross", ns.rows[0].deal.fiGross, 1200);
  eq("IMP Sold status = pending", ns.rows[1].deal.status, "pending");
  eq("IMP year from the title row", ns.month, "2026-10");
  const nm = C.impLogSheet("Sheet1", nl, { type:"auto", file:"New Car Log 2026.xlsx", headMap:{ "bank":"", "front end gross":"fiGross", "f&i income":"frontGross" } });
  eq("IMP a corrected column wins", nm.rows[0].deal.frontGross + ":" + nm.rows[0].deal.fiGross, "1200:1850");
  eq("IMP a column can be switched off", nm.rows[0].deal.lender, "");
  const odd = [["Who","Unit","When","Gross"], ["Arun","N1","2026-10-02","500"]];
  eq("IMP an unknown layout isn't guessed", C.impLogSheet("Sheet1", odd, {}), null);
  const forced = C.impLogSheet("Sheet1", odd, { headerRow:C.impGuessHeader(odd), headMap:{ who:"sp", unit:"stockNo", when:"soldDate", gross:"frontGross" } });
  eq("IMP a tab read by hand with the columns picked", forced.rows[0].deal.salespeople[0].name + ":" + forced.rows[0].deal.soldDate + ":" + forced.rows[0].deal.frontGross, "ARUN:2026-10-02:500");
  eq("IMP no type anywhere is flagged", forced.typeUnknown, true);
  /* AI reading: what is sent, codes it worked out, rows it skipped */
  const desk = [["NEW CAR DESK LOG · OCT 2026"], ["DT","STK","CUST","SLSP","FE","BE","N/U/D","MGR","STAT","PH"],
    ["9-Oct","N24118","DANA WU","ARUN","1850","2100","N","RAHUL","DEL","416-555-0199"],
    ["9-Oct","D0412","SAM KO","BILAL","-500","1450","D","SALMA","PEND","sam@example.com"],
    ["10-Oct","N24121","PRIYA SHAH","THINH","0","2950","N","DAVID","CXL",""],
    ["","TOTAL","","","1350","6500","","","",""]];
  const mk = C.impMaskTab(desk, ["ARUN","BILAL","THINH","RAHUL","SALMA","DAVID"]);
  const sentText = JSON.stringify(mk.lines);
  eq("AI customer names never sent", /DANA|PRIYA|SAM KO/.test(sentText), false);
  eq("AI phone and email never sent", /416-555|example\.com/.test(sentText), false);
  eq("AI names replaced consistently", mk.lines[2][1][2], "Customer 1");
  eq("AI salespeople still sent", mk.lines[2][1][3], "ARUN");
  eq("AI headings still sent", mk.lines[1][1].join(","), "DT,STK,CUST,SLSP,FE,BE,N/U/D,MGR,STAT,PH");
  eq("AI lines numbered as in the sheet", mk.lines[1][0], 2);
  eq("AI masked column named", mk.masked.join(","), "CUST");
  const ai = C.impLogSheet("OCT", desk, { type:"auto", file:"NEW CAR DESK LOG.xlsx", headerRow:1,
    headMap:{ dt:"soldDate", stk:"stockNo", cust:"customer", slsp:"sp", fe:"frontGross", be:"fiGross", "n/u/d":"type", mgr:"fiManager", stat:"status", ph:"" },
    typeMap:{ D:"Used" }, statusMap:{ PEND:"pending", CXL:"cancelled" }, skipLines:[6] });
  eq("AI-read tab rows (totals row skipped)", ai.rows.length, 3);
  eq("AI code D read as Used", ai.rows[1].deal.type, "Used");
  eq("AI code CXL read as cancelled", ai.rows[2].deal.status, "cancelled");
  eq("AI date 9-Oct uses the year from the file", ai.rows[0].deal.soldDate, "2026-10-09");
  const docRows = C.impDocDeals({ deals:[{ soldDate:"2026-10-14", stockNo:"n24133", customer:"Patel", vehicle:"26 Kicks", salesperson:"keegan", salesperson2:"", fiManager:"Rahul", status:"delivered",
    dealType:"finance", vehicleType:"", frontGross:"1150", fiGross:"2,400", lender:"RBC", deliveredDate:"", notes:"", unsure:["frontGross"], unsureNote:"1,150 or 1,190" }] }, { year:2026, file:"recap.pdf" });
  eq("AI page deal read", docRows[0].deal.stockNo + ":" + docRows[0].deal.salespeople[0].name + ":" + docRows[0].deal.fiGross, "N24133:KEEGAN:2400");
  eq("AI unsure fields kept", docRows[0].unsure.join(","), "frontGross");
  eq("AI missing New/Used flagged", docRows[0].typeMissing, true);
  eq("AI delivered deal gets its delivery date", docRows[0].deal.deliveredDate, "2026-10-14");
  const perf = C.impPerfSheet("SALES PERFORMANCE", [["AUGUST 2026 SALES PERFORMANCE","","","","","","","","","","","Current Selling Day",25], [],
    ["Salesperson","Target N","Target U","Target Total","Sold N","Sold U","Sold Total"], ["DEALERSHIP",50,40,90,56,39,95], ["ARUN",10,8,18,7,12,19], ["ABBAS",10,8,18,17,6,23], [], ["HOUSE",0,0,0,3,3,6]]);
  eq("IMP perf month from the title", perf.month, "2026-08");
  eq("IMP perf people (store row left out)", perf.people.length, 3);
  eq("IMP perf sold used", perf.people[0].su, 12);
}

/* --- deal signature: ignores bookkeeping and key order, sees real changes --- */
{
  const a = build([["a", P]]).tx;
  const b = JSON.parse(JSON.stringify(a));
  b.status = "Completed"; b.createdAt = "2020-01-01"; b.savedAt = "x"; b.savedBy = "u9"; b.display.mode = "thankyou";
  eq("bookkeeping fields don't count as a change", C.dealSig(a), C.dealSig(b));
  const reordered = {}; Object.keys(a).reverse().forEach((k) => { reordered[k] = a[k]; });
  eq("key order doesn't count as a change", C.dealSig(a), C.dealSig(reordered));
  const c = JSON.parse(JSON.stringify(a)); c.vehicle.price = 40001;
  eq("a price change is a change", C.dealSig(a) === C.dealSig(c), false);
  const d = JSON.parse(JSON.stringify(a)); d.display.selection = { package: "preferred" };
  eq("recording the package choice is a change", C.dealSig(a) === C.dealSig(d), false);
  const e = JSON.parse(JSON.stringify(a)); delete e.offers;
  eq("an older deal without offers matches its normalised self", C.dealSig(e), C.dealSig(Object.assign({}, e, { offers: C.normOffers(undefined) })));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
