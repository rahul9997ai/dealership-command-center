"use strict";
/* ---------------- REPORTS ---------------- */
function presetRange(period){
  var now = new Date(), to = C.todayISO(), from;
  if (period === "daily") from = to;
  else if (period === "weekly"){ var wk = new Date(now); wk.setDate(wk.getDate() - 6); from = C.localISO(wk); }
  else if (period === "monthly") from = to.slice(0,7) + "-01";
  else from = to.slice(0,4) + "-01-01";
  return { from:from, to:to };
}
function canSeeAllReports(){
  return V.isAdmin();
}
function filteredDeals(){
  var f = state.ui.reports;
  if (!f.from || !f.to){ var r = presetRange(f.period); f.from = f.from||r.from; f.to = f.to||r.to; }
  if (V.isMaster() && f.dealership === "all" && typeof cloud !== "undefined" && cloud.loaded && !cloud.dealsAll)
    ensureAllDeals().then(function(){ commit(); });
  var pool = (V.isMaster() && f.dealership === "all") ? V.allDeals() : V.dealsForStore();
  /* An FSM only ever sees their own deals here — "all" or someone else's
     selection is only honoured for a GM, FSM Manager or master admin. */
  var fsmFilter = canSeeAllReports() ? f.fsm : state.currentUserId;
  return pool.filter(function(d){
    if (d.createdAt < f.from || d.createdAt > f.to) return false;
    if (fsmFilter !== "all" && d.fsmUserId !== fsmFilter) return false;
    if (f.type !== "all" && d.type !== f.type) return false;
    if (f.product !== "all" && !C.totals(state, d).soldLines.some(function(L){ return L.product.id === f.product; })) return false;
    return true;
  });
}
function viewReports(){
  var f = state.ui.reports, deals = filteredDeals(), i, j;
  var gross = 0, retail = 0, productCount = 0, withProduct = 0, byFsm = {}, byProduct = {};
  for (i=0;i<deals.length;i++){
    var d = deals[i], t = C.totals(state, d);
    gross += t.productGross; retail += t.productsSub; productCount += t.soldLines.length;
    if (t.soldLines.length) withProduct++;
    if (!byFsm[d.fsmUserId]) byFsm[d.fsmUserId] = { deals:0, gross:0, retail:0, products:0 };
    byFsm[d.fsmUserId].deals++; byFsm[d.fsmUserId].gross += t.productGross;
    byFsm[d.fsmUserId].retail += t.productsSub; byFsm[d.fsmUserId].products += t.soldLines.length;
    for (j=0;j<t.soldLines.length;j++){
      var L = t.soldLines[j];
      if (!byProduct[L.product.id]) byProduct[L.product.id] = { n:0, retail:0, gross:0 };
      byProduct[L.product.id].n++; byProduct[L.product.id].retail += (L.price||0); byProduct[L.product.id].gross += (L.price||0)-L.cost;
    }
  }
  var fsmRows = Object.keys(byFsm).map(function(k){ return { u:userById(k), v:byFsm[k] }; }).sort(function(a,b){ return b.v.gross-a.v.gross; });
  var prodRows = Object.keys(byProduct).map(function(k){ return { p:C.productById(state,k), v:byProduct[k] }; }).sort(function(a,b){ return b.v.n-a.v.n; });
  var maxG = fsmRows.length ? Math.max(1, fsmRows[0].v.gross) : 1;

  var filters = `<div class="card" style="margin-bottom:16px"><div class="card-b"><div class="inline">
    <label class="f"><span>Period</span><select data-act="report-preset">
      ${["daily","weekly","monthly","yearly"].map(function(p){ return `<option value="${p}" ${f.period===p?"selected":""}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`; }).join("")}</select></label>
    <label class="f"><span>From</span><input type="date" value="${esc(f.from)}" data-bind="ui.reports.from"></label>
    <label class="f"><span>To</span><input type="date" value="${esc(f.to)}" data-bind="ui.reports.to"></label>
    ${V.isMaster() ? `<label class="f"><span>Dealership</span><select data-bind="ui.reports.dealership">
      <option value="active" ${f.dealership==="active"?"selected":""}>${esc(state.config.name)}</option>
      <option value="all" ${f.dealership==="all"?"selected":""}>All dealerships</option></select></label>` : ""}
    ${canSeeAllReports() ? `<label class="f"><span>Finance Manager</span><select data-bind="ui.reports.fsm">
      <option value="all">All Finance Managers</option>
      ${state.users.filter(function(u){ return V.isDealOwnerRole(u.role); }).map(function(u){
        return `<option value="${u.id}" ${f.fsm===u.id?"selected":""}>${esc(u.name)}</option>`; }).join("")}</select></label>`
      : `<label class="f"><span>FSM</span><input type="text" value="${esc(V.currentUser().name)} (you)" disabled></label>`}
    <label class="f"><span>Product</span><select data-bind="ui.reports.product">
      <option value="all">All products</option>
      ${state.products.map(function(p){ return `<option value="${p.id}" ${f.product===p.id?"selected":""}>${esc(p.name)}</option>`; }).join("")}</select></label>
    <label class="f"><span>Transaction type</span><select data-bind="ui.reports.type">
      ${["all","Finance","Cash"].map(function(x){ return `<option value="${x}" ${f.type===x?"selected":""}>${x==="all"?"All types":x}</option>`; }).join("")}</select></label>
  </div></div></div>`;

  var kpis = `<div class="grid g4" style="margin-bottom:16px">
    ${V.kpiCard("Transactions", deals.length, C.fmtDate(f.from)+" to "+C.fmtDate(f.to))}
    ${V.kpiCard("Product gross", money0(gross), money0(retail)+" retail")}
    ${V.kpiCard("Products sold", productCount, deals.length ? Math.round(productCount/deals.length*100)/100+" per deal" : "—")}
    ${V.kpiCard("Penetration", (deals.length?Math.round(withProduct/deals.length*100):0)+"%", withProduct+" deals with a product")}</div>`;

  var body = deals.length ? `<div class="grid g2">
    <div class="card"><div class="card-h"><h2>FSM performance</h2></div><div class="card-b"><div class="tablewrap"><table>
      <thead><tr><th>FSM</th><th class="right">Deals</th><th class="right">Products</th><th class="right">Retail</th><th class="right">Gross</th><th class="right">Per deal</th><th style="width:110px"></th></tr></thead>
      <tbody>${fsmRows.map(function(r){ return `<tr><td>${esc(r.u.name)}<div class="tiny muted">${esc(r.u.role)}</div></td>
        <td class="right num">${r.v.deals}</td><td class="right num">${r.v.products}</td><td class="right num">${money0(r.v.retail)}</td>
        <td class="right num">${money0(r.v.gross)}</td><td class="right num">${money0(r.v.gross/r.v.deals)}</td>
        <td><div class="bar"><i style="width:${Math.max(4,Math.round(r.v.gross/maxG*100))}%"></i></div></td></tr>`; }).join("")}
      </tbody></table></div></div></div>
    <div class="card"><div class="card-h"><h2>Product sales</h2></div><div class="card-b"><div class="tablewrap"><table>
      <thead><tr><th>Product</th><th class="right">Sold</th><th class="right">Retail</th><th class="right">Gross</th><th class="right">Penetration</th></tr></thead>
      <tbody>${prodRows.map(function(r){ return `<tr><td>${esc(r.p?r.p.name:"—")}</td><td class="right num">${r.v.n}</td>
        <td class="right num">${money0(r.v.retail)}</td><td class="right num">${money0(r.v.gross)}</td>
        <td class="right num">${Math.round(r.v.n/deals.length*100)}%</td></tr>`; }).join("")}
      </tbody></table></div></div></div></div>
    <div class="card" style="margin-top:16px"><div class="card-h"><h2>Transactions</h2>
      <div class="sp"><span class="muted small">${deals.length} in range</span></div></div>
      <div class="card-b"><div class="tablewrap"><table>
      <thead><tr><th>Date</th><th>Deal</th><th>Customer</th><th>Vehicle</th><th>Type</th><th>FSM</th><th class="right">Products</th><th class="right">Retail</th><th class="right">Gross</th><th></th></tr></thead>
      <tbody>${deals.slice().sort(function(a,b){ return a.createdAt<b.createdAt?1:-1; }).slice(0,60).map(function(d){
        var t = C.totals(state,d);
        var editable = state.completed.some(function(c){ return c.id === d.id; });
        return `<tr><td class="nowrap">${C.fmtDate(d.createdAt)}</td><td class="nowrap">${esc(d.id)}</td>
          <td>${esc(d.customer.name||"—")}</td><td>${esc(d.vehicle.year+" "+d.vehicle.model)}</td>
          <td><span class="tag">${esc(d.type)}</span></td><td>${esc(userById(d.fsmUserId).name)}</td>
          <td class="right num">${t.soldLines.length}</td><td class="right num">${money0(t.productsSub)}</td>
          <td class="right num">${money0(t.productGross)}</td>
          <td class="right nowrap">${V.isAdmin() ? `<button class="btn sm" data-act="deal-history" data-deal="${esc(d.id)}">History</button> ` : ""}${editable ? `<button class="btn sm" data-act="deal-open" data-deal="${esc(d.id)}">Open</button>
            <button class="btn sm danger" data-act="deal-delete" data-deal="${esc(d.id)}">Delete</button>` : ""}</td></tr>`; }).join("")}
      </tbody></table></div>
      ${deals.length>60?`<p class="small muted" style="margin-top:10px">Showing the 60 most recent of ${deals.length}.</p>`:""}</div></div>`
    : `<div class="card"><div class="empty">No transactions match these filters. Widen the date range or clear a filter.</div></div>`;
  return filters + kpis + body;
}

