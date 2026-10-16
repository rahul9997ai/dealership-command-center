"use strict";
/* ---------------- SETTINGS ---------------- */
function viewSalespersonRedirect(){
  return `<div class="grid g2"><div class="card"><div class="card-h"><h2>Axiom Pulse</h2></div><div class="card-b">
    <div class="notice info">Your account is set up for deliveries, not Command Center. Sign in at
      <strong>pulse.rahulchamp.ca</strong> to see your assigned deliveries and enable notifications.</div>
    <button class="btn" data-act="logout" style="margin-top:12px">Sign out</button>
  </div></div></div>`;
}
function viewSettings(){
  var canEdit = V.isAdmin(), dis = canEdit ? "" : "disabled", b = V.brand();
  return `<div class="grid g2">
    <div class="card"><div class="card-h"><h2>This dealership</h2><div class="sp"><span class="tag">${esc(state.config.dealerCode)}</span></div></div><div class="card-b">
      <div class="inline">
        <label class="f"><span>Dealership name</span><input type="text" value="${esc(state.config.name)}" data-bind="config.name" ${dis}></label>
        <label class="f"><span>Brand</span><select data-bind="config.brandKey" ${dis}>
          ${Object.keys(D.BRANDS).map(function(k){ return `<option value="${k}" ${state.config.brandKey===k?"selected":""}>${esc(D.BRANDS[k].label)}</option>`; }).join("")}<option value="custom" ${state.config.brandKey==="custom"?"selected":""}>Other brand…</option></select></label>
        ${state.config.brandKey === "custom" ? `<label class="f"><span>Brand name</span><input type="text" value="${esc(state.config.customBrandName||"")}" data-bind="config.customBrandName" placeholder="e.g. Jeep" ${dis}></label>` : ""}
        <label class="f"><span>Logo mark</span><input type="text" maxlength="3" value="${esc(state.config.logoMark)}" data-bind="config.logoMark" ${dis}></label>
      </div>
      <div class="notice info">Customer display header: <strong style="margin-left:6px">${esc(b.finLabel)}</strong> · packages present as ${esc(C.packageLabel(state,"PREFERRED"))}, ${esc(C.packageLabel(state,"ESSENTIAL"))} and ${esc(C.packageLabel(state,"BASIC"))}</div>
      <label class="f" style="margin-top:12px"><span>Customer display header text (optional — leave blank to use the brand's default)</span><input type="text" value="${esc(state.config.headerTitle||"")}" data-bind="config.headerTitle" placeholder="e.g. FORD CREDIT CANADA" ${dis}></label>
      <div class="inline" style="margin-top:12px">
        <label class="f"><span>Address</span><input type="text" value="${esc(state.config.address)}" data-bind="config.address" ${dis}></label>
        <label class="f"><span>City, province, postal</span><input type="text" value="${esc(state.config.city)}" data-bind="config.city" ${dis}></label>
      </div>
      <div class="inline">
        <label class="f"><span>Phone</span><input type="text" value="${esc(state.config.phone)}" data-bind="config.phone" ${dis}></label>
        <label class="f"><span>Email</span><input type="text" value="${esc(state.config.email)}" data-bind="config.email" ${dis}></label>
      </div>
    </div></div>
    <div class="card"><div class="card-h"><h2>Tax and finance defaults</h2></div><div class="card-b">
      <div class="inline">
        <label class="f"><span>Standard tax rate (%)</span><input type="number" step="0.01" value="${esc(state.config.tax.standard)}" data-bind="config.tax.standard" data-type="num" ${dis}></label>
        <label class="f"><span>VRC coverage tax rate (%)</span><input type="number" step="0.01" value="${esc(state.config.tax.vrc)}" data-bind="config.tax.vrc" data-type="num" ${dis}></label>
      </div>
      <div class="inline">
        <label class="f"><span>Default rate (APR %)</span><input type="number" step="0.01" value="${esc(state.config.finance.defaultApr)}" data-bind="config.finance.defaultApr" data-type="num" ${dis}></label>
        <label class="f"><span>Default term</span><select data-bind="config.finance.defaultTerm" data-type="num" ${dis}>
          ${V.selectOptions([48,60,72,84,96], state.config.finance.defaultTerm, function(x){ return x+" Months"; })}</select></label>
        <label class="f"><span>Default frequency</span><select data-bind="config.finance.defaultFrequency" ${dis}>
          <option value="monthly" ${state.config.finance.defaultFrequency==="monthly"?"selected":""}>Monthly</option>
          <option value="biweekly" ${state.config.finance.defaultFrequency==="biweekly"?"selected":""}>Bi-weekly</option></select></label>
      </div>
      <div class="inline">
        <label class="f"><span>Administration fee</span><input type="number" value="${esc(state.config.finance.adminFee)}" data-bind="config.finance.adminFee" data-type="num" ${dis}></label>
        <label class="f"><span>Licensing</span><input type="number" value="${esc(state.config.finance.licensing)}" data-bind="config.finance.licensing" data-type="num" ${dis}></label>
      </div>
      <div class="notice info">Tax changes apply immediately to the open deal, both prints, the emailed presentation and every report, because all of them call the same calculation engine.</div>

    </div></div>
    <div class="card"><div class="card-h"><h2>Cash Conversion rates</h2></div><div class="card-b">
      <p class="muted small" style="max-width:66ch">Today's rates, offered to Finance Managers as one-tap choices in Cash Conversion. Update them when the banks change their rates; leave a box empty to hide it.</p>
      <div class="inline">${CA_PRESETS.map(function(cp){ var cr = (state.config.caRates || {})[cp[0]];
        return `<label class="f"><span>${esc(cp[1])} (%)</span><input type="number" step="0.01" min="0" value="${esc(cr === undefined || cr === null ? "" : cr)}" data-carate="${cp[0]}" ${dis}></label>`; }).join("")}</div>
    </div></div>
    <div class="card"><div class="card-h"><h2>Dealership logo</h2></div><div class="card-b">
      <p class="muted small" style="max-width:66ch">Shown on every coupon and on the printed worksheet. Use the dealership's own logo (a PNG with a transparent background looks best). Without one, the coupon shows the dealership name there instead.</p>
      <div class="logo-up">${state.config.logo && /^data:image\//.test(state.config.logo) ? `<div class="logo-prev"><img src="${esc(state.config.logo)}" alt="Dealership logo"></div>` : `<div class="logo-prev empty">No logo yet</div>`}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn ${canEdit ? "" : "disabled"}" style="cursor:${canEdit ? "pointer" : "not-allowed"}">${state.config.logo ? "Replace logo" : "Upload logo"}<input type="file" accept="image/png,image/jpeg,image/webp" data-act="dealer-logo" style="display:none" ${dis}></label>
        ${state.config.logo ? `<button type="button" class="btn danger" data-act="dealer-logo-remove" ${dis}>Remove</button>` : ""}</div></div>
    </div></div>
    <div class="card"><div class="card-h"><h2>Customer display colours</h2></div><div class="card-b">
      <p class="muted small" style="max-width:66ch">Used on the customer display, the full-screen view, the pop-out window, the printed customer copy, the Cash Conversion printout and the emailed package. Works in light and dark mode.</p>
      ${(function(){
        var mode = V.colorMode(), pal = b.pal;
        var seg = `<div class="color-mode" role="group" aria-label="Colour scheme">
          <button type="button" class="${mode==="brand"?"on":""}" data-act="color-mode" data-mode="brand" ${dis}>${esc(b.label)} colours</button>
          <button type="button" class="${mode==="custom"?"on":""}" data-act="color-mode" data-mode="custom" ${dis}>Colour of choice</button></div>`;
        if (mode === "brand"){
          var chip = function(c, n, role){ return `<span class="pal-chip"><i style="background:${c}"></i><span><b>${esc(n)}</b><small>${role} · ${c}</small></span></span>`; };
          return seg + (pal
            ? `<div class="pal-row">${chip(pal.main, pal.names[0], "Header and package titles")}${chip(pal.accent, pal.names[1], "Icons and highlights")}</div>`
            : `<div class="pal-row">${chip(b.color || "#2c5a9b", esc(b.label) + " colour", "Header, titles and highlights")}</div>
               <p class="muted small" style="margin:8px 0 0">There's no preset palette for this brand. Choose <strong>Colour of choice</strong> to pick your own.</p>`);
        }
        var cur = (state.config.brandColor || "").toLowerCase();
        return seg + `<div class="swatch-row" style="margin-top:12px">${D.COLOR_PRESETS.map(function(c){ var on = cur === c.color.toLowerCase();
            return `<button type="button" class="swatch ${on?"on":""}" data-act="brand-color" data-color="${c.color}" ${dis}><i style="background:${c.color}"></i>${esc(c.name)}</button>`; }).join("")}</div>
          <div class="inline" style="align-items:end">
            <label class="f"><span>Custom colour</span><input type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(state.config.brandColor||"") ? state.config.brandColor : (b.color || "#2c5a9b"))}" data-act="brand-color-input" ${dis} style="height:40px;padding:2px"></label>
          </div>`;
      })()}
    </div></div>
    <div class="card"><div class="card-h"><h2>Promotional offers</h2>
      <div class="sp"><button type="button" class="btn sm primary" data-act="gift-preset-add" ${dis}>Add an offer</button></div></div><div class="card-b">
      <div class="notice info" style="margin-bottom:12px">Which Finance Managers can add these offers to a deal is now set per person in <a href="#" data-act="route" data-route="users">Users &amp; access</a>.</div>
      <p class="muted small" style="max-width:60ch">Offers you list here appear as one-tap choices for the Finance Manager on each deal. Dealer cost is optional; it comes off the deal's gross in reports.</p>
      ${(state.config.gifts || []).map(function(g, i){ return `<div class="gift-row" style="grid-template-columns:2fr 1fr auto">
        <label class="f"><span>Offer</span><input type="text" value="${esc(g.name||"")}" data-bind="config.gifts.${i}.name" placeholder="e.g. Winter tire storage" ${dis}></label>
        <label class="f"><span>Dealer cost ($)</span><input type="number" min="0" value="${g.cost===null||g.cost===undefined?"":esc(g.cost)}" data-bind="config.gifts.${i}.cost" data-type="num" ${dis}></label>
        <button type="button" class="btn sm danger" data-act="gift-preset-remove" data-idx="${i}" ${dis}>Remove</button>
        <div class="gphoto" style="grid-column:1 / -1">${g.image && /^data:image\//.test(g.image) ? `<img src="${esc(g.image)}" alt="">` : ""}
          <label class="btn sm" style="cursor:pointer">${g.image ? "Change photo" : "Add photo (optional)"}<input type="file" accept="image/*" data-act="gift-photo" data-idx="${i}" style="display:none" ${dis}></label>
          ${g.image ? `<button type="button" class="btn sm" data-act="gift-photo-remove" data-idx="${i}" ${dis}>Remove photo</button>` : `<span class="tiny muted">No photo: a drawn illustration is used. Use your own photo or the maker's press image.</span>`}</div></div>`; }).join("") || `<div class="tiny muted">No offers yet. Add one, for example an oil change or a remote starter.</div>`}
    </div></div></div>`;
}

