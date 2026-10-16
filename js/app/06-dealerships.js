"use strict";
/* ---------------- DEALERSHIPS (master administrator) ---------------- */
function viewDealerships(){
  var month = C.todayISO().slice(0,7), deals = V.allDeals ? V.allDeals() : [];
  if (typeof loadMonthCounts === "function") loadMonthCounts();
  var counts = (typeof cloud !== "undefined" && cloud.monthCounts && cloud.monthCounts.month === month) ? cloud.monthCounts.by : null;
  var cards = state.dealerships.map(function(d){
    var b = C.brandOfDealer(d), ink = (b.pal && b.pal.main) || b.color || "#2c5a9b";
    var people = state.users.filter(function(u){ return u.dealershipId === d.id && u.role !== "Master Administrator"; }).length;
    var mtd = counts ? (counts[d.id] || 0) : deals.filter(function(x){ return x.dealershipId === d.id && String(x.createdAt || "").slice(0,7) === month; }).length;
    return `<div class="dcard" role="button" tabindex="0" data-act="switch-to-dealership" data-dealership="${d.id}" title="Open ${esc(d.name)}">
        <span class="go">Open ›</span>
        <div class="t"><div class="dm" style="background:${esc(ink)}">${esc(d.logoMark || b.mark || "")}</div><div><div class="nm">${esc(d.name)}</div><div class="bd">${esc(b.label)}${d.city ? " · " + esc(d.city) : ""}</div></div></div>
        <div class="st"><div><b>${people}</b>${people === 1 ? "person" : "people"}</div><div><b>${mtd}</b>deals this month</div><div><span class="tag ${d.active ? "ok" : "danger"}">${d.active ? "Active" : "Inactive"}</span></div></div>
        <div class="dcard-tools"><button class="btn sm" data-act="dealer-edit" data-dealership="${d.id}">Edit</button>
          <button class="btn sm danger" data-act="dealer-delete" data-dealership="${d.id}" ${state.dealerships.length<=1?"disabled":""}>Delete</button></div></div>`;
  }).join("");
  return `<div class="card"><div class="card-h"><h2>Dealerships</h2>
    <div class="sp"><button class="btn primary" data-act="dealer-new">Create a dealership</button></div></div>
    <div class="card-b">
      <p class="muted small" style="max-width:76ch;margin:0 0 14px"><strong>Click a dealership to open its own Command Center.</strong> Each one carries its own brand, taxes, finance defaults, products and people; you manage its users and settings from inside it.</p>
      <div class="dgrid">${cards}<button type="button" class="dcard add" data-act="dealer-new">+ Create a dealership</button></div></div></div>`;
}
function dealerModal(){
  var d = state.ui.dealerForm;
  if (!d) return "";
  var isNew = !d.id;
  var b = C.brandOfDealer(d);
  return `<div class="modal-bg" data-act="close-modal-bg"><div class="modal">
    <div class="modal-h"><h2>${isNew?"Create a dealership":"Edit "+esc(d.name)}</h2>
      <div class="sp"><button class="btn" data-act="dealer-cancel">Cancel</button>
      <button class="btn primary" data-act="dealer-save">${isNew?"Create dealership":"Save changes"}</button></div></div>
    <div class="modal-b">
      <div class="inline">
        <label class="f"><span>Dealership name</span><input type="text" data-df="name" value="${esc(d.name||"")}" placeholder="e.g. Lakeshore Ford"></label>
        <label class="f"><span>Brand</span><select data-act="dealer-brand" data-df="brandKey">
          ${Object.keys(D.BRANDS).map(function(k){ return `<option value="${k}" ${d.brandKey===k?"selected":""}>${esc(D.BRANDS[k].label)}</option>`; }).join("")}<option value="custom" ${d.brandKey==="custom"?"selected":""}>Other brand…</option></select></label>
        ${d.brandKey === "custom" ? `<label class="f"><span>Brand name</span><input type="text" data-df="customBrandName" value="${esc(d.customBrandName||"")}" placeholder="e.g. Jeep"></label>` : ""}
        <label class="f"><span>Logo mark</span><input type="text" maxlength="3" data-df="logoMark" value="${esc(d.logoMark||"")}"></label>
        <label class="f"><span>Dealer code</span><input type="text" data-df="dealerCode" value="${esc(d.dealerCode||"")}"></label>
      </div>
      <div class="notice info">Customer display header: <strong style="margin-left:6px">${esc(b.finLabel)}</strong></div>
      <label class="f" style="margin-top:12px"><span>Customer display header text (optional — leave blank to use the brand's default)</span><input type="text" data-df="headerTitle" value="${esc(d.headerTitle||"")}" placeholder="e.g. FORD CREDIT CANADA"></label>
      <div class="inline" style="margin-top:12px">
        <label class="f"><span>Address</span><input type="text" data-df="address" value="${esc(d.address||"")}"></label>
        <label class="f"><span>City, province, postal</span><input type="text" data-df="city" value="${esc(d.city||"")}"></label>
      </div>
      <div class="inline">
        <label class="f"><span>Phone</span><input type="text" data-df="phone" value="${esc(d.phone||"")}"></label>
        <label class="f"><span>Email</span><input type="text" data-df="email" value="${esc(d.email||"")}"></label>
      </div>
      <div class="inline">
        <label class="f"><span>Standard tax (%)</span><input type="number" step="0.01" data-df="taxStandard" value="${d.tax.standard}"></label>
        <label class="f"><span>VRC tax (%)</span><input type="number" step="0.01" data-df="taxVrc" value="${d.tax.vrc}"></label>
        <label class="f"><span>Default rate (APR %)</span><input type="number" step="0.01" data-df="apr" value="${d.finance.defaultApr}"></label>
        <label class="f"><span>Default term</span><input type="number" data-df="term" value="${d.finance.defaultTerm}"></label>
      </div>
    </div></div></div>`;
}
function saveDealer(){
  var d = state.ui.dealerForm, root = document.querySelector(".modal");
  if (!d || !root) return;
  function f(k){ return root.querySelector('[data-df="'+k+'"]'); }
  var name = f("name").value.trim();
  if (!name){ toast("Give the dealership a name.","err"); return; }
  d.name = name;
  d.brandKey = f("brandKey").value;
  var cbn = f("customBrandName"); if (cbn) d.customBrandName = cbn.value.trim();
  d.headerTitle = f("headerTitle") ? f("headerTitle").value.trim() : (d.headerTitle || "");
  d.logoMark = (f("logoMark").value.trim() || C.brandOfDealer(d).mark).toUpperCase();
  d.dealerCode = f("dealerCode").value.trim() || "DLR-" + Math.floor(1000+Math.random()*8999);
  d.address = f("address").value.trim();
  d.city = f("city").value.trim();
  d.phone = f("phone").value.trim();
  d.email = f("email").value.trim();
  d.tax = { standard:Number(f("taxStandard").value)||13, vrc:Number(f("taxVrc").value)||8 };
  d.finance.defaultApr = Number(f("apr").value)||0;
  d.finance.defaultTerm = Number(f("term").value)||72;
  var wasNew = !d.id;
  if (wasNew){
    d.id = C.uid("d"); d.active = true;
    state.dealerships.push(d);
    toast("Dealership created. You're now signed into it — add a general manager or salesperson from Users and access.","ok");
  } else {
    for (var i=0;i<state.dealerships.length;i++) if (state.dealerships[i].id === d.id) state.dealerships[i] = d;
    if (d.id === state.activeDealershipId) state.config = d;
    toast("Dealership saved.","ok");
  }
  state.ui.dealerForm = null;
  if (wasNew) V.setDealership(d.id);
  commit();
}
function deleteDealer(id){
  if (state.dealerships.length <= 1){ toast("Keep at least one dealership.","err"); return; }
  cloud.del.d.push(id); delete state.cloud.productsByDealer[id];
  state.dealerships = state.dealerships.filter(function(d){ return d.id !== id; });
  state.users.forEach(function(u){ if (u.dealershipId === id) u.active = false; });
  if (state.activeDealershipId === id){
    if (state.dealerships.length) V.setDealership(state.dealerships[0].id);
    else { state.activeDealershipId = null; state.config = null; state.tx = null; }
  }
  toast("Dealership removed. Its users were deactivated.","ok");
  commit();
}

