"use strict";
/* ---------------- PRODUCT MASTER ---------------- */
function priceRange(p){
  if (!p.pricing) return null;
  var lo = Number(p.pricing.base||0), hi = lo;
  ["term","km","interval","deductible"].forEach(function(k){
    var map = p.pricing[k]; if (!map) return;
    var vals = Object.keys(map).map(function(x){ return Number(map[x]); });
    if (!vals.length) return;
    lo += Math.min.apply(null, vals); hi += Math.max.apply(null, vals);
  });
  return { min:lo, max:hi };
}
function viewProducts(){
  var canEdit = V.canEditProducts();
  var rows = state.products.map(function(p){
    var r = priceRange(p), bits = [];
    if (p.uses.term) bits.push("Terms " + p.terms[0] + "–" + p.terms[p.terms.length-1]);
    if (p.uses.km) bits.push("Up to " + km(p.kms[p.kms.length-1]));
    if (p.uses.interval) bits.push("Intervals " + p.intervals.map(function(x){ return (x/1000)+"k"; }).join("/"));
    if (p.uses.deductible) bits.push("Deductibles " + p.deductibles.map(function(x){ return "$"+x; }).join("/"));
    return `<tr><td><strong>${esc(p.name)}</strong><div class="tiny muted">${esc(p.code)} · ${esc(p.category)}</div></td>
      <td class="small">${esc(bits.join(" · ")||"Flat price")}</td>
      <td><span class="tag ${p.taxRule==="vrc"?"info":""}">${p.taxRule==="vrc"?"VRC "+state.config.tax.vrc+"%":p.taxRule==="exempt"?"Exempt":state.config.tax.standard+"%"}</span></td>
      <td class="right num">${r ? (r.min===r.max?money0(r.min):money0(r.min)+" – "+money0(r.max)) : `<span class="tag warn">Not configured</span>`}</td>
      <td><span class="tag ${p.active?"ok":""}">${p.active?"Active":"Inactive"}</span></td>
      <td class="right nowrap">
        <button class="btn sm" data-act="product-edit" data-product="${p.id}" ${canEdit?"":"disabled"}>Edit</button>
        <button class="btn sm" data-act="product-toggle" data-product="${p.id}" ${canEdit?"":"disabled"}>${p.active?"Deactivate":"Activate"}</button>
        <button class="btn sm danger" data-act="product-delete" data-product="${p.id}" ${canEdit?"":"disabled"}>Delete</button></td></tr>`;
  }).join("");
  return `<div class="card"><div class="card-h"><h2>Product master</h2>
    <div class="sp">${canEdit?"":`<span class="tag warn">Your role cannot change products</span>`}
      <button class="btn primary" data-act="product-new" ${canEdit?"":"disabled"}>Add a product</button></div></div>
    <div class="card-b">
      <p class="muted small" style="max-width:74ch">Products, terms, kilometres, deductibles, intervals, pricing and the tax rule are configuration, not code. The description and benefit wording set here is what appears in the emailed presentation; it never appears on the customer display.</p>
      <div class="tablewrap"><table><thead><tr><th>Product</th><th>Configuration rules</th><th>Tax</th><th class="right">Retail range</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      ${state.products.length ? "" : `<div class="emptystate"><h3>No products yet</h3><p class="muted small" style="max-width:56ch;margin:0 auto 14px">This dealership starts with an empty product list. Add the products you sell for your brand and store, or start from a template and edit it.</p>
        <button class="btn primary" data-act="product-new" ${canEdit?"":"disabled"}>Add your first product</button>
        <button class="btn" data-act="product-template" ${canEdit?"":"disabled"}>Start from a template</button></div>`}
    </div></div>`;
}
/* Generic starting wording per category, so a new product isn't left with
   blank email copy — the FSM can always edit it, this is just a head start. */
var CATEGORY_TEMPLATES = {
  "mechanical": {
    desc: "Mechanical coverage on the components that cost the most to repair, including parts, labour and diagnostic time, honoured at any authorized dealer.",
    benefit: "One covered repair usually costs more than the whole program. This keeps a large repair bill from landing on you later, and it can transfer to the next owner, which helps protect resale value." },
  "maintenance": {
    desc: "Prepays your scheduled maintenance visits at today's prices, including inspections and routine service.",
    benefit: "Service prices go up every year — this locks in today's price, the work is done by factory trained technicians, and your maintenance record stays complete, which is exactly what a buyer or an appraiser wants to see." },
  "road hazard": {
    desc: "Repairs or replaces tires and rims damaged by potholes, nails, glass and other road hazards, with no limit on the number of claims.",
    benefit: "A tire and rim on this vehicle can run several hundred dollars, and our roads are hard on both. There's no claim limit, so one bad pothole can already pay for the coverage." },
  "appearance": {
    desc: "Protects the paint and interior from acid rain, road salt, stains and everyday wear.",
    benefit: "This keeps the finish and interior looking the way they do today, which shows up directly in what the vehicle is worth at trade in." },
  "security": {
    desc: "Vehicle identification and a recovery service that works with police to help locate your vehicle if it's stolen.",
    benefit: "This makes your vehicle far less attractive to a thief, and if it does go missing you get help recovering it." },
  "insurance": {
    desc: "If your vehicle is written off as a total loss, this coverage helps put you into a comparable replacement vehicle rather than settling for depreciated value.",
    benefit: "Your insurer only pays what the vehicle was worth the day of the loss — this covers that gap instead of leaving you shopping with less than you started with." },
  "loan": {
    desc: "Covers the gap between your insurance settlement and the balance remaining on your finance contract if the vehicle is stolen or written off.",
    benefit: "On a longer term, what you owe can stay above the vehicle's value for years. This closes that gap so a total loss doesn't follow you financially." },
  "convenience": {
    desc: "Replaces lost, stolen or damaged keys and remotes, including cutting, programming and roadside lockout assistance.",
    benefit: "A single replacement key for this vehicle can run a few hundred dollars once cut and programmed — this gets you back on the road the same day." }
};
function categoryTemplate(category, name){
  var key = String(category||"").trim().toLowerCase();
  var t = CATEGORY_TEMPLATES[key] || {
    desc: "Protects your vehicle and gives you added peace of mind for the life of the coverage.",
    benefit: "This coverage is designed to protect your investment and can save you real money if something goes wrong." };
  var nm = name || "This coverage";
  return { desc: nm + " provides " + t.desc.charAt(0).toLowerCase() + t.desc.slice(1), benefit: t.benefit };
}
function numListInput(label, key, arr){
  return `<label class="f"><span>${esc(label)}</span><input type="text" data-pf="${key}" value="${arr?arr.join(", "):""}" placeholder="comma separated"></label>`;
}
function adderGrid(label, key, options, map){
  if (!options || !options.length) return "";
  return `<div style="margin-bottom:12px"><div class="small muted" style="margin-bottom:5px">${esc(label)}</div>
    <div class="cfgrid">${options.map(function(o){
      var v = map && map[o] !== undefined ? map[o] : 0;
      return `<label class="f"><span>${esc(String(o))}</span><input type="number" data-pa="${key}:${o}" value="${v}"></label>`; }).join("")}</div></div>`;
}
function productModal(){
  var p = state.ui.productEdit;
  if (!p) return "";
  var isNew = !p.id;
  return `<div class="modal-bg" data-act="close-modal-bg"><div class="modal wide">
    <div class="modal-h"><h2>${isNew?"Add a product":"Edit "+esc(p.name)}</h2>
      <div class="sp"><button class="btn" data-act="product-cancel">Cancel</button>
      <button class="btn primary" data-act="product-save">${isNew?"Add product":"Save changes"}</button></div></div>
    <div class="modal-b">
      <div class="inline">
        <label class="f"><span>Product name</span><input type="text" data-pf="name" value="${esc(p.name||"")}"></label>
        <label class="f"><span>Code</span><input type="text" data-pf="code" value="${esc(p.code||"")}"></label>
        <label class="f"><span>Category</span><input type="text" data-pf="category" value="${esc(p.category||"")}"></label>
        <label class="f"><span>Tax rule</span><select data-pf="taxRule">
          <option value="standard" ${p.taxRule==="standard"?"selected":""}>Standard ${state.config.tax.standard}%</option>
          <option value="vrc" ${p.taxRule==="vrc"?"selected":""}>VRC coverage ${state.config.tax.vrc}%</option>
          <option value="exempt" ${p.taxRule==="exempt"?"selected":""}>Exempt</option></select></label>
      </div>
      <label class="f"><span>What it covers (used in the email only)</span><textarea data-pf="desc" rows="2">${esc(p.desc||"")}</textarea></label>
      <label class="f"><span>Why it is worth it (persuasive wording used in the email)</span><textarea data-pf="benefit" rows="3">${esc(p.benefit||"")}</textarea></label>
      <div class="inline">
        <label class="switch"><input type="checkbox" data-pf="use-term" ${p.uses.term?"checked":""}> Uses a term</label>
        <label class="switch"><input type="checkbox" data-pf="use-km" ${p.uses.km?"checked":""}> Uses kilometres</label>
        <label class="switch"><input type="checkbox" data-pf="use-interval" ${p.uses.interval?"checked":""}> Uses a service interval</label>
        <label class="switch"><input type="checkbox" data-pf="use-deductible" ${p.uses.deductible?"checked":""}> Uses a deductible</label>
        <label class="switch"><input type="checkbox" data-pf="active" ${p.active?"checked":""}> Active</label>
      </div>
      <div class="divider"></div>
      <div class="inline">
        ${numListInput("Term options (months, max 120)","terms",p.terms)}
        ${numListInput("Kilometre options","kms",p.kms)}
        ${numListInput("Service intervals (km)","intervals",p.intervals)}
        ${numListInput("Deductible options ($)","deductibles",p.deductibles)}
      </div>
      <div class="inline">
        <label class="f"><span>Base retail price (blank = not configured)</span><input type="number" data-pf="base" value="${p.pricing?p.pricing.base:""}"></label>
        <label class="f"><span>Dealer cost (optional, $)</span><input type="number" step="0.01" data-pf="cost" value="${p.cost===null||p.cost===undefined?"":p.cost}" placeholder="Leave blank if unknown"></label>
      </div>
      <p class="small muted">Cost is a single flat dollar figure regardless of which term, kilometres or deductible get picked — it's used to show gross profit on reports and internal print. Leave it blank if you don't track cost; gross will just show as full retail. If you ever need cost to vary by term or kilometres the way price does, ask and we can add a cost table to match.</p>
      <p class="small muted">Adders are added to the base price for each option the FSM picks. Change an option list above and save to regenerate this grid.</p>
      ${adderGrid("Term adders (months)","term",p.uses.term?p.terms:null,p.pricing&&p.pricing.term)}
      ${adderGrid("Kilometre adders","km",p.uses.km?p.kms:null,p.pricing&&p.pricing.km)}
      ${adderGrid("Interval adders","interval",p.uses.interval?p.intervals:null,p.pricing&&p.pricing.interval)}
      ${adderGrid("Deductible adders","deductible",p.uses.deductible?p.deductibles:null,p.pricing&&p.pricing.deductible)}
    </div></div></div>`;
}
function parseList(s){
  if (!s) return [];
  return String(s).split(",").map(function(x){ return Number(String(x).replace(/[^0-9.\-]/g,"")); }).filter(function(x){ return !isNaN(x); });
}
function saveProduct(){
  var p = state.ui.productEdit, root = document.querySelector(".modal");
  if (!p || !root) return;
  function f(k){ return root.querySelector('[data-pf="'+k+'"]'); }
  var name = f("name").value.trim();
  if (!name){ toast("Give the product a name before saving.","err"); return; }
  p.name = name;
  p.code = f("code").value.trim() || name.slice(0,3).toUpperCase();
  p.category = f("category").value.trim() || "General";
  p.taxRule = f("taxRule").value;
  p.desc = f("desc").value.trim();
  p.benefit = f("benefit").value.trim();
  p.active = f("active").checked;
  var costRaw = f("cost").value;
  p.cost = costRaw === "" ? null : (Number(costRaw) || 0);
  p.uses = { term:f("use-term").checked, km:f("use-km").checked, interval:f("use-interval").checked, deductible:f("use-deductible").checked };
  p.terms = parseList(f("terms").value).filter(function(x){ return x>0 && x<=120; });
  p.kms = parseList(f("kms").value);
  p.intervals = parseList(f("intervals").value);
  p.deductibles = parseList(f("deductibles").value);
  var baseRaw = f("base").value;
  if (baseRaw === "") p.pricing = null;
  else {
    var pricing = { base:Number(baseRaw)||0, term:{}, km:{}, interval:{}, deductible:{} };
    var adders = root.querySelectorAll("[data-pa]");
    for (var i=0;i<adders.length;i++){
      var parts = adders[i].getAttribute("data-pa").split(":");
      pricing[parts[0]][parts[1]] = Number(adders[i].value)||0;
    }
    ["term","km","interval","deductible"].forEach(function(k){
      var list = k==="term"?p.terms:k==="km"?p.kms:k==="interval"?p.intervals:p.deductibles;
      if (!p.uses[k]){ delete pricing[k]; return; }
      list.forEach(function(o){ if (pricing[k][o] === undefined) pricing[k][o] = 0; });
    });
    p.pricing = pricing;
  }
  if (!p.id){ p.id = C.uid("p"); state.products.push(p); }
  else for (var j=0;j<state.products.length;j++) if (state.products[j].id === p.id) state.products[j] = p;
  state.ui.productEdit = null;
  toast("Product saved.","ok");
  commit();
}

