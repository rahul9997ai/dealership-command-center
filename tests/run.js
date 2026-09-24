/* Money-maths tests for the Command Center calculation engine.
   Run:  node tests/run.js
   It loads the data + core layers straight out of index.html, so it tests the code that ships. */
const fs = require("fs"), path = require("path"), vm = require("vm");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const script = html.split("<script>").pop().split("</script>")[0];
const marker = script.indexOf("Layer 3: STORE");
const core = script.slice(0, script.lastIndexOf("/*", marker));
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
/* --- brand headers and overrides --- */
eq("Ford header", C.brandOfDealer({ brandKey: "ford" }).finLabel, "FORD CREDIT FINANCIAL SERVICES");
eq("unknown brand falls back", C.brandOfDealer({ brandKey: "nope" }).key, "nissan");
eq("custom brand name", C.brandOfDealer({ brandKey: "custom", customBrandName: "Jeep" }).label, "Jeep");
eq("header override", C.brandOfDealer({ brandKey: "ford", headerTitle: "Ford Credit Canada" }).finLabel, "FORD CREDIT CANADA");
eq("Subaru exists", !!D.BRANDS.subaru, true);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
