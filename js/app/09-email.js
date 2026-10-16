"use strict";
/* ---------------- EMAILED PRESENTATION ----------------
   The email is where the persuasive product wording lives. It carries the
   package the customer is interested in, the term or terms selected, the
   payment, and a plain explanation of each product in that package.      */
function buildEmail(tx){
  var t = C.totals(state, tx), b = V.brand(), c = state.config, u = userById(tx.fsmUserId);
  var sel = state.ui.email;
  var shown = V.packagesToShow(t).filter(function(p){ return sel.pkg === "all" || sel.pkg === p.key; });
  var first = tx.customer.name ? tx.customer.name.split(" ")[0] : "there";
  var vehicle = (tx.vehicle.year + " " + tx.vehicle.make + " " + tx.vehicle.model).trim();
  var L = [];
  L.push("Hi " + first + ",");
  L.push("");
  L.push("Thanks for your time today at " + c.name + ". Here is the protection we looked at for your " + vehicle + ", with the payments exactly as they appeared on screen. Nothing here is a commitment; it is so you can read it at your own pace.");
  L.push("");
  shown.forEach(function(p){
    L.push(p.label);
    L.push(new Array(p.label.length + 1).join("-"));
    if (tx.type === "Cash"){
      L.push("Total due in full with this package: " + money(p.dueTotal));
      L.push("");
    } else {
      var quotes = p.quotes.filter(function(q){ return sel.term === "all" || Number(sel.term) === q.term; });
      if (quotes.length){
        L.push("Payment with this package:");
        quotes.forEach(function(q){
          if (q.payment === null){ L.push("  - " + q.term + " months: rate still to be entered"); return; }
          L.push("  - " + money(q.payment) + " " + C.freqLabel(q.frequency) + " over " + q.term + " months at " + q.rate + "%"
            + " (" + money(q.difference) + " more than the vehicle on its own)");
        });
        L.push("");
      }
    }
    if (p.discount > 0) L.push("Bundle savings applied, already reflected in the payment above.");
    if (p.gifts && p.gifts.length){
      L.push("Promotional Offer, included at no additional charge: " + p.gifts.map(function(g){ return g.name; }).join(", "));
    }
    if ((p.discount > 0) || (p.gifts && p.gifts.length)) L.push("");
    L.push("What is included:");
    p.lines.forEach(function(line){
      var cfg = V.lineConfigText(line, true);
      L.push("");
      L.push("  " + line.product.name + (cfg ? " (" + cfg + ")" : ""));
      if (line.product.desc) L.push("    " + line.product.desc);
      if (line.product.benefit) L.push("    Why it matters: " + line.product.benefit);
    });
    L.push("");
  });
  L.push("Every payment above is exactly what we reviewed together, taxes included.");
  L.push("If you want any of this added, or want to swap between the packages, reply to this email or call me at " + c.phone + " and I will have it ready before you come in.");
  L.push("");
  L.push(u.name);
  L.push(V.roleLabel(u.role) + ", " + c.name);
  L.push(b.finLabel);
  L.push(c.phone + " · " + c.email);
  L.push("");
  L.push("This summary is for information only and is not a contract or a binding quote.");
  var subjectPkg = shown.length === 1 ? shown[0].label : "protection options";
  return {
    to: tx.customer.email || "",
    subject: "Your " + subjectPkg + " for the " + vehicle + " — " + c.name,
    body: L.join("\n")
  };
}
function buildEmailHtml(tx){
  var t = C.totals(state, tx), b = V.brand(), c = state.config, u = userById(tx.fsmUserId);
  var sel = state.ui.email;
  var shown = V.packagesToShow(t).filter(function(p){ return sel.pkg === "all" || sel.pkg === p.key; }).map(function(p){
    var q = sel.term === "all" ? p.quotes : p.quotes.filter(function(x){ return String(x.term) === String(sel.term); });
    return { key:p.key, label:p.label, lines:p.lines, quotes:q, dueTotal:p.dueTotal, discount:p.discount, discountPct:p.discountPct, gifts:p.gifts, sub:p.sub, listSub:p.listSub };
  });
  var first = tx.customer.name ? tx.customer.name.split(" ")[0] : "there";
  var vehicle = (tx.vehicle.year + " " + tx.vehicle.make + " " + tx.vehicle.model).trim();
  var ink = V.brandInk(), brandColor = ink.bandA;

  var pkgCardsHtml = shown.map(function(p){
    var rowsHtml = p.lines.map(function(L){
      var cfgTxt = V.lineConfigText(L, true);
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #e3e8ef">
        <div style="font-weight:700;font-size:14px;color:#0d1b2e">${esc(L.product.name)}${cfgTxt?` <span style="font-weight:400;color:#667085;font-size:12px">(${esc(cfgTxt)})</span>`:""}</div>
        ${L.product.benefit ? `<div style="color:#475467;font-size:12.5px;margin-top:4px;line-height:1.5">${esc(L.product.benefit)}</div>` : ""}
      </td></tr>`;
    }).join("");
    var payHtml = tx.type === "Cash"
      ? `<div style="margin-top:10px"><div style="text-align:center;background:#eef2f7;border-radius:8px;padding:10px 8px">
          <div style="font-size:10px;color:#667085;letter-spacing:.04em">TOTAL DUE IN FULL</div>
          <div style="font-size:18px;font-weight:700;color:#0d1b2e;margin-top:2px">${money(p.dueTotal)}</div>
        </div></div>`
      : (p.quotes.length ? `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      ${p.quotes.map(function(q){
        return `<div style="flex:1;min-width:110px;text-align:center;background:#eef2f7;border-radius:8px;padding:10px 8px">
          <div style="font-size:10px;color:#667085;letter-spacing:.04em">${q.term} MONTHS</div>
          <div style="font-size:18px;font-weight:700;color:#0d1b2e;margin-top:2px">${q.payment===null?"—":money(q.payment)}</div>
          <div style="font-size:10px;color:#667085">${q.payment===null?"rate pending":C.freqLabel(q.frequency)}</div>
        </div>`;
      }).join("")}</div>` : "");
    var offerHtml = ((p.discount > 0) ? `<div style="margin-top:10px;padding:9px 12px;border-radius:8px;background:#e9f6ef;color:#0a7546;font-size:13px"><strong>Bundle savings applied</strong> — already reflected in the payment above.</div>` : "")
      + ((p.gifts && p.gifts.length) ? `<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:#fff4d6;border:1px solid #e4c26a;color:#5a3f06;font-size:13px"><div style="font-size:10px;font-weight:700;letter-spacing:.14em">PROMOTIONAL OFFER</div>${p.gifts.map(function(g){ return `<div style="font-weight:700;font-size:14px;margin-top:3px">${esc(g.name)}</div>`; }).join("")}<div style="font-size:11.5px;margin-top:2px">Included with this package at no additional charge.</div></div>` : "");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;border:1px solid #dde3ec;border-radius:10px;overflow:hidden">
      <tr><td style="background:${brandColor};color:#ffffff;padding:12px 16px;font-weight:700;font-size:13px;letter-spacing:.06em">${esc(p.label)}</td></tr>
      <tr><td style="padding:14px 16px;background:#ffffff">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>${payHtml}${offerHtml}
      </td></tr></table>`;
  }).join("");

  var html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#0d1b2e">
    <div style="background:${brandColor};padding:18px 20px">
      <div style="color:#ffffff;font-size:18px;font-weight:700">${esc(vehicle)}</div>
    </div>
    <div style="padding:22px 20px 8px">
      <div style="font-size:11px;letter-spacing:.1em;color:#667085;text-transform:uppercase">${esc(b.finLabel)}</div>
      <p style="font-size:14px;line-height:1.6;margin-top:14px">Hi ${esc(first)},</p>
      <p style="font-size:14px;line-height:1.6">Thanks for your time today at ${esc(c.name)}. Here is the protection we looked at for your ${esc(vehicle)}, with the payments exactly as they appeared on screen. Nothing here is a commitment — it's so you can read it at your own pace.</p>
    </div>
    <div style="padding:0 20px">${pkgCardsHtml}</div>
    <div style="padding:4px 20px 20px">
      <p style="font-size:12.5px;color:#475467;line-height:1.6">Every payment above is exactly what we reviewed together, taxes included. If you'd like any of this added, or want to swap between packages, reply to this email or call me at ${esc(c.phone)} and I'll have it ready before you come in.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px">
        <tr><td style="font-weight:700;font-size:13px">${esc(u.name)}</td></tr>
        <tr><td style="font-size:12px;color:#475467">${esc(V.roleLabel(u.role))}, ${esc(c.name)}</td></tr>
        <tr><td style="font-size:12px;color:#475467">${esc(b.finLabel)}</td></tr>
        <tr><td style="font-size:12px;color:#475467">${esc(c.phone)} · ${esc(c.email)}</td></tr>
      </table>
      <p style="font-size:10.5px;color:#98a2b3;letter-spacing:.08em;margin-top:18px;text-align:center">THIS SUMMARY IS FOR INFORMATION ONLY AND IS NOT A CONTRACT OR BINDING QUOTE.</p>
    </div>
  </div>`;
  var subjectPkg = shown.length === 1 ? shown[0].label : "protection options";
  return { to: tx.customer.email || "", subject: "Your " + subjectPkg + " for the " + vehicle + " — " + c.name, html: html };
}
function emailModal(){
  if (!state.ui.modal || state.ui.modal.kind !== "email") return "";
  var tx = state.tx, t = C.totals(state, tx);
  var opts = V.packagesToShow(t);
  var mailHtml = buildEmailHtml(tx);
  var mailText = buildEmail(tx);
  return `<div class="modal-bg" data-act="close-modal-bg"><div class="modal wide">
    <div class="modal-h"><h2>Email the package to the customer</h2><div class="sp">
      <button class="btn" data-act="close-modal">Close</button>
      <button class="btn" data-act="copy-email-html">Copy formatted email</button>
      <button class="btn" data-act="copy-email-text">Copy plain text</button>
      <button class="btn primary" data-act="send-email">Open in email app</button></div></div>
    <div class="modal-b">
      <div class="inline">
        <label class="f"><span>To</span><input type="text" value="${esc(mailText.to)}" data-bind="tx.customer.email" placeholder="customer@example.ca"></label>
        <label class="f"><span>Package the customer is interested in</span><select data-bind="ui.email.pkg">
          <option value="all" ${state.ui.email.pkg==="all"?"selected":""}>Every package presented</option>
          ${opts.map(function(p){ return `<option value="${p.key}" ${state.ui.email.pkg===p.key?"selected":""}>${esc(p.label)}</option>`; }).join("")}</select></label>
        <label class="f"><span>Term</span><select data-bind="ui.email.term">
          <option value="all" ${state.ui.email.term==="all"?"selected":""}>Every term presented</option>
          ${t.terms.map(function(tm){ return `<option value="${tm}" ${String(state.ui.email.term)===String(tm)?"selected":""}>${tm} months</option>`; }).join("")}</select></label>
      </div>
      <label class="f"><span>Subject</span><input type="text" id="emailSubject" value="${esc(mailHtml.subject)}"></label>
      <div class="small muted" style="margin-bottom:6px">Preview — a generic vehicle graphic and the persuasive product wording, formatted for pasting straight into an email. This never appears on the customer display.</div>
      <div style="background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid var(--border)">${mailHtml.html}</div>
      <details style="margin-top:12px"><summary class="small muted" style="cursor:pointer">HTML source</summary>
        <textarea class="mailbox" id="emailHtmlSource" style="margin-top:8px" readonly>${esc(mailHtml.html)}</textarea></details>
      <details style="margin-top:8px"><summary class="small muted" style="cursor:pointer">Plain text version</summary>
        <textarea class="mailbox" id="emailBody" style="margin-top:8px" readonly>${esc(mailText.body)}</textarea></details>
      <p class="small muted" style="margin-top:10px">Most email programs don't accept rich formatting through a plain "mailto" link, so "Open in email app" sends the plain-text version below. Use "Copy formatted email" and paste (Ctrl/Cmd+V) directly into a Gmail or Outlook message to keep the graphic and layout.</p>
    </div></div></div>`;
}
function printModal(){
  var m = state.ui.modal;
  if (!m || (m.kind !== "internal" && m.kind !== "customer" && m.kind !== "cashadv" && m.kind !== "coupon" && m.kind !== "worksheet")) return "";
  if (m.kind === "worksheet") return `<div class="modal-bg" data-act="close-modal-bg"><div class="modal wide">
    <div class="modal-h"><h2>Purchase Proposal · print double-sided on letter</h2>
      <div class="sp"><button class="btn" data-act="close-modal">Close</button>
      <button class="btn primary" data-act="do-print">Print</button></div></div>
    <div class="modal-b">${wsDoc()}</div></div></div>`;
  if (m.kind === "coupon") return `<div class="modal-bg" data-act="close-modal-bg"><div class="modal wide">
    <div class="modal-h"><h2>Coupon · ${couponState().copies === 3 ? "3 per A4 sheet" : "1 on A4"}</h2>
      <div class="sp"><button class="btn" data-act="close-modal">Close</button>
      <button class="btn primary" data-act="do-print">Print</button></div></div>
    <div class="modal-b">${couponSheet(couponState())}</div></div></div>`;
  if (m.kind === "cashadv") return `<div class="modal-bg" data-act="close-modal-bg"><div class="modal wide">
    <div class="modal-h"><h2>Cash vs finance comparison</h2>
      <div class="sp"><button class="btn" data-act="close-modal">Close</button>
      <button class="btn primary" data-act="do-print">Print</button></div></div>
    <div class="modal-b">${cashAdvPrint()}</div></div></div>`;
  return `<div class="modal-bg" data-act="close-modal-bg"><div class="modal wide">
    <div class="modal-h"><h2>${m.kind==="internal"?"Internal transaction print":"Customer copy"}</h2>
      <div class="sp"><button class="btn" data-act="close-modal">Close</button>
      <button class="btn primary" data-act="do-print">Print</button></div></div>
    <div class="modal-b">${m.kind==="internal"?internalPrint(state.tx):customerPrint(state.tx)}</div></div></div>`;
}
var pendingConfirm = null;
function askConfirm(title, message, yesLabel, onYes){
  pendingConfirm = onYes;
  state.ui.confirm = { title:title, message:message, yes:yesLabel };
  commit();
}
function showNotice(title, message){
  pendingConfirm = null;
  state.ui.confirm = { title:title, message:message, notice:true };
  commit();
}
/* Several ways forward plus Cancel: choices = [{ label, kind:"primary"|"danger"|"", go:fn }]. */
var pendingChoices = null;
function askChoice(title, message, choices){
  pendingConfirm = null; pendingChoices = choices;
  state.ui.confirm = { title:title, message:message, choices:choices.map(function(c){ return { label:c.label, kind:c.kind || "" }; }) };
  commit();
}
function confirmModal(){
  var c = state.ui.confirm;
  if (!c) return "";
  if (c.choices){
    return `<div class="modal-bg" data-act="confirm-bg"><div class="modal" style="max-width:540px">
      <div class="modal-h"><h2>${esc(c.title)}</h2></div>
      <div class="modal-b"><p style="margin:0">${esc(c.message)}</p>
        <div class="confirm-a"><button class="btn" data-act="confirm-no">Cancel</button>${c.choices.map(function(ch, i){
          return `<button class="btn ${esc(ch.kind)}" data-act="confirm-choice" data-idx="${i}">${esc(ch.label)}</button>`; }).join("")}</div></div></div></div>`;
  }
  return `<div class="modal-bg" data-act="confirm-bg"><div class="modal" style="max-width:460px">
    <div class="modal-h"><h2>${esc(c.title)}</h2><div class="sp">
      ${c.notice ? `<button class="btn primary" data-act="confirm-no">OK</button>` : `<button class="btn" data-act="confirm-no">Cancel</button>
      <button class="btn danger" data-act="confirm-yes">${esc(c.yes)}</button>`}</div></div>
    <div class="modal-b"><p style="margin:0">${esc(c.message)}</p></div></div></div>`;
}
function cdDrawer(){
  if (!state.ui.cdPreview || !state.tx || state.route !== "finance") return "";
  var m = state.tx.display.mode;
  return `<div class="cd-drawer" role="complementary" aria-label="Customer display preview">
    <div class="cd-drawer-h"><span class="live"></span><strong>CUSTOMER DISPLAY · preview</strong>
      <span class="sp">
        <button class="btn sm ${m==="welcome"?"on":""}" data-act="cd-mode" data-mode="welcome">Welcome</button>
        <button class="btn sm ${m==="package"?"on":""}" data-act="cd-mode" data-mode="package">Present</button>
        <button class="btn sm ${m==="thankyou"?"on":""}" data-act="cd-mode" data-mode="thankyou">Thank you</button>
        <button class="btn sm" data-act="cd-preview-close">Close</button></span></div>
    <div class="cd-drawer-b">${V.renderCustomerDisplay(state.tx)}</div></div>`;
}
function renderOverlay(){
  if (caState && caState.present && state.route === "cashadv"){
    return `<div class="present-mode">${caCustomerHtml()}</div>
      <button class="btn dark present-exit" data-act="ca-exit-present">Exit full screen</button>`;
  }
  if (state.ui.present){
    return `<div class="present-mode">${V.renderCustomerDisplay(state.tx)}</div>
      <button class="btn dark present-exit" data-act="exit-present">Exit full screen</button>`;
  }
  /* The confirm dialog goes last so it always sits on top of whatever opened it (e.g. Saved deals). */
  return userCardModal() + printModal() + emailModal() + caEmailModal() + productModal() + userModal() + dealerModal() + extendModal() + demoChip() + demoNoticeModal() + tourHtml() + resetPwModal() + historyModal() + inviteModal() + savedModal() + cdDrawer() + confirmModal();
}

