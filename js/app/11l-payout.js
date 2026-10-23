"use strict";
/* ---------------- PAYOUT REQUEST ----------------
   A Finance or Sales Manager fills in a short form for one of four kinds of payout (ETO payout, trade lien payout,
   used vehicle purchase, refund). The app turns it into a finished requisition email for accounting, with the
   dealership's own subject-line pattern. "Email it to me" sends it to the person's own inbox (the send-requisition
   function; the pre-filled bank PAD form rides along as a PDF) and they forward it to accounting with their scans.
   Nothing is read by AI and there are no extra costs. Each email is logged (payout_requests) so its status can be followed.
   Access: General Manager and Master always; anyone else when the GM switches "Payout Request" on (fmAccess[user].payout).
   Settings (config.payout): accounting email, default Cc, approval lines, subject lines, PAD form details. */
var PO_PAD_BANKS = [["BNS","Scotiabank (BNS)"],["SDA","Scotia Dealer Advantage"],["CIBC","CIBC Auto Finance"],["RBC","Royal Bank (RBC)"],["TD","TD Auto Finance"],["DESJARDINS","Desjardins"]];
var PO_TYPES = {
  eto:{ label:"ETO Payout", title:"ETO payout", hint:"Early termination payoff of a customer's lease, paid to the lessor.", pays:["ACH","PAD"], payeeLbl:"Lessor / lender", carfax:true, amtLbl:"ETO payout amount", hst:false,
    f:[["dms","DMS #"],["stk","Stock # (ETO vehicle)"],["gt","Payout good through","date"],["pd","Per diem after that date"],["req","Required by","date"]],
    docs:[["Lender payout letter","Early termination payout letter from the lender"],["T.O. sheet","Turnover sheet prepared by the sales manager"],["Ownership of the ETO vehicle",""],["Bill of sale",""]] },
  lien:{ label:"Trade Lien Payout", title:"Trade lien payout", hint:"Paying off the lien on a customer's trade-in, or a lease payout, to the lienholder.", pays:["ACH","PAD","Cheque"], payeeLbl:"Lienholder", carfax:true, amtLbl:"Lien payout amount", hst:false,
    f:[["dms","DMS #"],["stk","Stock # (trade or purchase)"],["gt","Payout good through","date"],["pd","Per diem after that date"],["req","Required by","date"]],
    docs:[["Lender payout copy","Payout statement showing the amount and good-through date"],["T.O. sheet","Turnover sheet prepared by the sales manager"],["Bill of sale",""],["Ownership in customer's name",""],["Lien search","Carfax lien search, or a copy of it"]] },
  used:{ label:"Used Vehicle Purchase", title:"Used vehicle purchase", hint:"Buying a used vehicle for stock.", pays:["Cheque","ACH"], payeeLbl:"Pay to (seller)", carfax:true, amtLbl:"Purchase price", hst:true,
    f:[["dms","DMS vendor #"],["stk","Stock #"],["sellerType","Seller is"],["req","Required by","date"]],
    docs:[["Palidin scan (showing PASSED)",""],["Second piece of ID",""],["Articles of incorporation / business licence","Only if the seller is a business"],["OMVIC licence copy","Only if buying from a dealer"],["Copy of ownership",""],["Carfax report",""],["Lien check report (all provinces)",""],["Lien release letter","If a lien existed"],["V-Auto report",""],["UCDA offer to purchase",""],["Sold unit: customer bill of sale","If it was sold already"]] },
  refund:{ label:"Refund Request", title:"Refund to customer", hint:"Refund of a deposit or payment back to the customer.", pays:["Cheque","ACH"], payeeLbl:"Pay to", carfax:false, amtLbl:"Refund amount", hst:false,
    f:[["name","Customer name"],["veh","Vehicle (year, make, model)"],["dms","DMS # (customer account)"],["stk","Stock # (if applicable)"],["orig","Original payment method"],["reason","Reason for refund"],["req","Required by","date"]],
    docs:[["Receipt showing the original pay method",""],["Bill of sale",""],["A/R schedule","Showing the payment posted to the DMS"]] }
};
/* Dealer lease buyout lives on the Trade Lien Payout tab (s.kind === "buyout"): the lender is always Nissan Canada Inc. */
var PO_BUYOUT = { label:"Trade Lien Payout", title:"Dealer lease buyout", hint:"Buying out a dealer's lease from Nissan Canada Inc.", pays:["ACH","Cheque"], payeeLbl:"Lender", payeeFixed:"Nissan Canada Inc.", carfax:false, amtLbl:"Buyout amount", hst:false,
  f:[["dms","DMS #"],["stk","Stock #"],["gt","Payout good through","date"],["pd","Per diem after that date"],["req","Required by","date"]],
  docs:[["Wholesale bill of sale",""],["Payout quote from the lender",""],["Proof of funds",""]] };
var PO_TYPE_KEYS = ["eto", "lien", "used", "refund"];
var PO_SUBJECT_LABEL = { eto_ach:"ETO payout, manufacturer (ACH)", eto_pad:"ETO payout, bank (PAD)", lien_ach:"Trade lien, manufacturer (ACH)", lien_pad:"Trade lien, bank (PAD)", lien_chq:"Trade lien, cheque", used:"Used vehicle purchase", refund:"Refund to customer" };
var PO_STATUS = { draft:"Not sent", sent:"Sent", approved:"Approved", paid:"Paid", returned:"Returned" };
var PO = { tab:"eto", s:{}, log:null, logLoading:false, logStore:null, logErr:null, busy:false, msg:null, look:{} };

function poT(tab){ var s = PO.s[tab]; return tab === "lien" && s && s.kind === "buyout" ? PO_BUYOUT : PO_TYPES[tab]; }
function poCfg(){ var c = state.config || {}; return c.payout || {}; }
function poLabelOf(k, d){ return k === "lien" && d && d.sub === "buyout" ? PO_BUYOUT.title : PO_TYPES[k] ? PO_TYPES[k].title : k; }
function poIso(d){ return C.localISO(d); }
function poPlusDays(n){ var d = new Date(C.todayISO() + "T12:00:00"); d.setDate(d.getDate() + n); return poIso(d); }
function poFmtDate(d){ if (!d) return ""; var x = new Date(d + "T12:00:00"); return isNaN(x) ? d : x.toLocaleDateString("en-CA", { month:"short", day:"numeric", year:"numeric" }); }
function poUsDate(d){ var m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[2] + "/" + m[3] + "/" + m[1] : String(d || ""); }
function poMoney(v){ return "$" + (Number(v) || 0).toLocaleString("en-CA", { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function poCan(){ return V.featureOn(V.currentUser(), "payout"); }
function poState(tab){
  var T = PO_TYPES[tab], cfg = poCfg();
  if (!PO.s[tab]) PO.s[tab] = { pay:T.pays[0], f:{ req:poPlusDays(3) }, payee:"", amount:"", hst:!!T.hst, carfax:"", notes:"", docs:{}, to:cfg.accountingEmail || "", cc:cfg.defaultCc || "", bank:"CIBC", loan:"", phone:"", dob:"", kind:"lien", padName:"", padVeh:"", padVin:"" };
  return PO.s[tab];
}
function poMe(){ var u = V.currentUser(); return { name:u.name || "", email:u.email || "" }; }
function poRoleLabel(){ var r = V.currentUser().role; return r === "FSM" || r === "FSM Manager" ? "Finance Manager" : r; }
function poSubject(tab){
  var s = poState(tab), key = tab === "lien" && s.kind === "buyout" ? (s.pay === "Cheque" ? "lien_chq" : "lien_ach") : C.payoutSubjectKey(tab, s.pay), tpl = (poCfg().subjects && poCfg().subjects[key]) || C.PAYOUT_SUBJECTS[key];
  return C.payoutSubject(tpl, { dms:s.f.dms, stk:s.f.stk, bank:s.payee, name:tab === "used" ? s.payee : s.f.name });
}
function poDocs(tab){ var T = poT(tab), s = poState(tab); return { on:T.docs.filter(function(d, i){ return s.docs[i]; }), off:T.docs.filter(function(d, i){ return !s.docs[i]; }) }; }
function poApprovers(){ var a = poCfg().approvers; return (a && a.length ? a : ["General Manager", "Regional Controller"]).filter(function(x){ return String(x || "").trim(); }); }
function poPadOn(tab){ var s = poState(tab); return s.pay === "PAD" && (tab === "eto" || tab === "lien"); }

/* ---- the email (all styles inline, so it survives Outlook, Gmail and forwarding) ---- */
function poEmailHtml(tab){
  var T = poT(tab), s = poState(tab), tt = C.payoutTotals(s.amount, s.hst), ds = poDocs(tab), cf = String(s.carfax || "").trim(), cfg = state.config || {};
  var td1 = "padding:7px 22px;width:38%;color:#64748b;font-size:13px;vertical-align:top;border-top:1px solid #f0f4f9", td2 = "padding:7px 22px 7px 0;font-size:13px;font-weight:700;vertical-align:top;border-top:1px solid #f0f4f9";
  var rows = "", add = function(k, v){ if (v) rows += '<tr><td style="' + td1 + '">' + esc(k) + '</td><td style="' + td2 + '">' + esc(v) + '</td></tr>'; };
  var f = s.f;
  add("Payable to", s.payee); add("Payment method", s.pay === "PAD" ? "PAD (bank debits the dealership account)" : s.pay);
  var has = function(k){ return T.f.some(function(x){ return x[0] === k; }); };
  add(tab === "used" ? "DMS vendor #" : "DMS #", f.dms); add("Stock #", f.stk); if (has("name")) add("Customer", f.name);
  if (has("veh")) add("Vehicle", f.veh); if (has("sellerType")) add("Seller is", f.sellerType); add("Original payment", f.orig); add("Reason", f.reason);
  if (f.gt) add("Payout good through", poFmtDate(f.gt) + (f.pd ? " · per diem " + f.pd + " after" : ""));
  add("Requested by", poMe().name + (poRoleLabel() ? " · " + poRoleLabel() : ""));
  var pad = poPadOn(tab);
  var h = '<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f0;border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#0b1b3a">' +
    '<div style="background:#0b1430;padding:18px 22px"><div style="font-size:11px;letter-spacing:.14em;color:#c9d9f0;text-transform:uppercase">' + esc(cfg.name || "Dealership") + '</div>' +
      '<div style="font-size:18px;font-weight:700;letter-spacing:.04em;color:#ffffff;margin-top:3px">' + (s.pay === "Cheque" ? "CHEQUE REQUISITION" : "PAYMENT REQUISITION") + '</div></div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #e3eaf4"><tr><td style="padding:16px 22px;vertical-align:bottom">' +
      '<div style="display:inline-block;background:#e8f1ff;color:#0a54c0;border-radius:6px;padding:3px 9px;font-size:12px;font-weight:700">' + esc(T.title.toUpperCase()) + '</div>' +
      '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;margin-top:6px">Amount to pay</div><div style="font-size:28px;font-weight:800">' + poMoney(tt.total) + '</div></td>' +
      '<td style="padding:16px 22px;text-align:right;vertical-align:bottom;font-size:12px;color:#64748b">Required by<div style="color:#b45309;font-size:14px;font-weight:700">' + esc(poFmtDate(f.req)) + '</div></td></tr></table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + rows + '</table>';
  if (T.carfax && cf) h += '<div style="margin:12px 22px;border:1.5px solid #f0b94a;background:#fff8e6;border-radius:9px;padding:11px 13px;font-size:13px"><b>Carfax report</b> (lien check)<br>' +
    '<a href="' + esc(cf) + '" style="display:inline-block;margin-top:7px;background:#0a6cf0;color:#ffffff;text-decoration:none;border-radius:7px;padding:7px 14px;font-weight:700;font-size:12.5px">Open the Carfax report</a>' +
    '<div style="color:#7a5a10;font-size:11px;margin-top:6px;word-break:break-all">' + esc(cf) + '</div></div>';
  var sec = 'style="padding:12px 22px 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;font-weight:700"';
  h += '<div ' + sec + '>Amount</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px"><tr><td style="padding:6px 22px">' + esc(T.amtLbl) + '</td><td style="padding:6px 22px;text-align:right">' + poMoney(tt.amount) + '</td></tr>' +
    (tt.hst ? '<tr><td style="padding:6px 22px">HST (13%)</td><td style="padding:6px 22px;text-align:right">' + poMoney(tt.hst) + '</td></tr>' : '') +
    '<tr><td style="padding:9px 22px;border-top:2px solid #0b1b3a;font-weight:800;font-size:15px">' + (s.pay === "Cheque" ? "Cheque amount" : "Total to pay") + '</td><td style="padding:9px 22px;border-top:2px solid #0b1b3a;text-align:right;font-weight:800;font-size:15px">' + poMoney(tt.total) + '</td></tr></table>';
  h += '<div ' + sec + '>Backup documents</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px">' +
    (pad ? '<tr><td style="padding:5px 22px;color:#047857">&#128206; Pre-filled bank PAD form (PDF) <span style="color:#64748b">attached to this email</span></td></tr>' : '') +
    ds.on.map(function(d){ return '<tr><td style="padding:5px 22px;color:#047857">&#10003; ' + esc(d[0]) + ' <span style="color:#64748b">attached</span></td></tr>'; }).join("") +
    ds.off.map(function(d){ return '<tr><td style="padding:5px 22px;color:#b45309;font-weight:700">&#10007; ' + esc(d[0]) + ' <span style="font-weight:400">not attached</span></td></tr>'; }).join("") + '</table>';
  if (String(s.notes || "").trim()) h += '<div ' + sec + '>Notes</div><div style="margin:6px 22px 10px;font-size:13px;background:#f8fafc;border-radius:8px;padding:9px 11px">' + esc(String(s.notes).trim()).replace(/\n/g, "<br>") + '</div>';
  h += '<div ' + sec + '>Approval</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px">' + poApprovers().map(function(a, i){
    return '<tr><td style="padding:9px 22px;font-weight:700;width:40%;border-top:1px solid #f0f4f9">' + esc(a) + '<div style="color:#64748b;font-weight:400;font-size:11.5px">' + (i === 0 ? 'Reply "APPROVED" to this email' : 'Required on every request') + '</div></td>' +
      '<td style="padding:9px 22px;border-top:1px solid #f0f4f9">&#9744; Approved &nbsp; Date: ________</td></tr>'; }).join("") + '</table>';
  h += '<div style="padding:12px 22px;background:#f5f8fc;border-top:1px solid #e3eaf4;font-size:11px;color:#7a8aa6">Prepared in Mahanex · Dealership Command · ' + esc(poFmtDate(C.todayISO())) + '</div></div>';
  return h;
}
function poEmailText(tab){
  var T = poT(tab), s = poState(tab), tt = C.payoutTotals(s.amount, s.hst), ds = poDocs(tab), cf = String(s.carfax || "").trim(), f = s.f, L = [];
  L.push((s.pay === "Cheque" ? "CHEQUE REQUISITION" : "PAYMENT REQUISITION") + " · " + T.title.toUpperCase(), "", "Amount to pay: " + poMoney(tt.total) + "   Required by: " + poFmtDate(f.req), "",
    "Payable to: " + (s.payee || ""), "Payment method: " + s.pay, (tab === "used" ? "DMS vendor #: " : "DMS #: ") + (f.dms || ""), "Stock #: " + (f.stk || ""));
  var has = function(k){ return T.f.some(function(x){ return x[0] === k; }); };
  if (has("name") && f.name) L.push("Customer: " + f.name);
  if (has("veh") && f.veh) L.push("Vehicle: " + f.veh);
  if (f.gt) L.push("Payout good through: " + poFmtDate(f.gt) + (f.pd ? " · per diem " + f.pd + " after" : ""));
  if (T.carfax && cf) L.push("", "CARFAX REPORT: " + cf);
  L.push("", "Amount: " + poMoney(tt.amount) + (tt.hst ? "   HST: " + poMoney(tt.hst) : "") + "   TOTAL: " + poMoney(tt.total), "");
  if (poPadOn(tab)) L.push("Attached: pre-filled bank PAD form (PDF)");
  L.push("Attached: " + (ds.on.map(function(d){ return d[0]; }).join(", ") || "none")); if (ds.off.length) L.push("NOT attached: " + ds.off.map(function(d){ return d[0]; }).join(", "));
  if (String(s.notes || "").trim()) L.push("", "Notes: " + String(s.notes).trim());
  L.push("", "Approvals: " + poApprovers().map(function(a){ return a + " ____"; }).join("   "), "", "Requested by " + poMe().name + (poRoleLabel() ? " · " + poRoleLabel() : ""));
  return L.join("\n");
}

/* ---- bank PAD forms: the bank's own blank PDF (forms/pad), filled from the request ---- */
var PO_PDF_LIB = { src:"https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js", sri:"sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI" };
var PO_PDF_JS = { src:"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", sri:"sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e", worker:"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js" };
var PO_LIBP = {};
function poScript(lib, name, ready){
  if (ready()) return Promise.resolve();
  if (PO_LIBP[name]) return PO_LIBP[name];
  PO_LIBP[name] = new Promise(function(res, rej){
    var el = document.createElement("script"); el.src = lib.src; el.integrity = lib.sri; el.crossOrigin = "anonymous"; el.async = true;
    el.onload = function(){ if (ready()) res(); else { PO_LIBP[name] = null; rej(new Error("The PDF tool didn't start.")); } };
    el.onerror = function(){ PO_LIBP[name] = null; el.remove(); rej(new Error("Couldn't load the PDF tool. Check the connection and try again.")); };
    document.head.appendChild(el);
  });
  return PO_LIBP[name];
}
function poPadData(tab){
  var s = poState(tab), cfg = state.config || {}, pd = poCfg().pad || {}, tt = C.payoutTotals(s.amount, s.hst);
  var phone = pd.phone || cfg.phone || "", digits = String(phone).replace(/\D/g, "");
  var fax = pd.fax || "", fd = String(fax).replace(/\D/g, "");
  return { customer:s.padName || "", loan:s.loan || "", vin:s.padVin || "", veh:s.padVeh || "", amount:tt.total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","), date:poUsDate(C.todayISO()), payDate:poUsDate(s.f.gt || C.todayISO()),
    dealer:cfg.name || "", contact:pd.contact || poMe().name, phone:phone, fax:fax, email:pd.email || cfg.email || "", routeone:pd.routeone || "", addr:[cfg.address, cfg.city].filter(Boolean).join(", "), city:pd.city || String(cfg.city || "").split(",")[0] || "",
    area:digits.length >= 10 ? digits.slice(-10, -7) : "", phone7:digits.length >= 7 ? digits.slice(-7, -4) + "-" + digits.slice(-4) : phone, fax7:fd.length >= 7 ? fd.slice(-7, -4) + "-" + fd.slice(-4) : fax, faxArea:fd.length >= 10 ? fd.slice(-10, -7) : "",
    custPhone:s.phone || "", dob:s.dob || "" };
}
function poPadPdf(tab){
  var s = poState(tab), bank = s.bank, d = poPadData(tab);
  var needPdfJs = bank === "DESJARDINS";
  return Promise.all([poScript(PO_PDF_LIB, "lib", function(){ return !!window.PDFLib; }), needPdfJs ? poScript(PO_PDF_JS, "js", function(){ return !!window.pdfjsLib; }) : Promise.resolve(),
    fetch("forms/pad/" + bank + ".pdf").then(function(r){ if (!r.ok) throw new Error("The " + bank + " form couldn't be loaded."); return r.arrayBuffer(); })]).then(function(rs){
    var buf = rs[2], PL = window.PDFLib;
    var fit = function(font, text, maxW, size, floor){ var sz = size; while (sz > (floor || 5.5) && font.widthOfTextAtSize(String(text), sz) > maxW) sz -= 0.5; return sz; };
    var fillFields = function(map){
      return PL.PDFDocument.load(buf).then(function(doc){
        var form = doc.getForm();
        return doc.embedFont(PL.StandardFonts.Helvetica).then(function(hf){
          Object.keys(map).forEach(function(k){ var fld = form.getTextField(k); fld.setText(map[k]); var w = fld.acroField.getWidgets()[0].getRectangle().width - 8, sz = fit(hf, map[k], w, 11); if (sz < 11) fld.setFontSize(sz); });
          return doc.save();
        });
      });
    };
    var overlay = function(items){
      return PL.PDFDocument.load(buf).then(function(doc){
        return doc.embedFont(PL.StandardFonts.Helvetica).then(function(font){
          var pages = doc.getPages();
          items.forEach(function(it){ var sz = it[4] || 10; if (it[5]) sz = fit(font, it[3], it[5], sz); if (String(it[3])) pages[it[0]].drawText(String(it[3]), { x:it[1], y:it[2], size:sz, font:font, color:PL.rgb(0.05, 0.1, 0.45) }); });
          return doc.save();
        });
      });
    };
    if (bank === "CIBC") return fillFields({ "Date MMDDYYYY":d.date, "Dealer Name the Dealer":d.dealer, "Dealer Contact Number":d.phone, "Dealer Fax Number":d.fax, "Applicant First & Last Name":d.customer, "Loan Account Number":d.loan, "Vehicle Identification Number":d.vin, "Applicant Phone Number":d.custPhone, "Amount":d.amount });
    if (bank === "SDA") return fillFields({ "Customer Name":d.customer, "Loan Number":d.loan, "Vehicle Identification Number":d.vin, "Dealer Name the Dealer":d.dealer, "Dealer Contact Number":d.phone, "Dealer Fax Number":d.fax, "Amount":d.amount, "Date":d.date });
    if (bank === "RBC") return fillFields({ "Text Field 12":d.loan, "Text Field 13":(d.veh + (d.vin ? " VIN " + d.vin : "")).trim(), "Text Field 30":d.dealer, "Text Field 29":d.contact, "Text Field 28":d.phone, "Text Field 27":d.email, "Text Field 31":d.amount, "Text Field 22":d.date });
    if (bank === "BNS") return overlay([[0, 232, 665, d.customer, 10, 380], [0, 232, 641, d.loan, 10, 380], [0, 232, 617, d.vin, 10, 380], [0, 232, 565, d.dealer, 10, 380], [0, 232, 540, d.contact, 10, 380], [0, 232, 516, d.phone, 10, 380], [0, 232, 491, d.fax, 10, 380], [0, 232, 343, "$" + d.amount, 10, 380], [1, 36, 62, d.payDate, 11]]);
    if (bank === "TD"){
      var yr = (String(d.veh).match(/\b(19|20)\d{2}\b/) || [""])[0], rest = String(d.veh).replace(yr, "").trim().split(/\s+/), make = rest[0] || "", model = rest.slice(1).join(" ");
      return overlay([[0, 154, 671, d.date], [0, 154, 598, d.dealer, 10, 440], [0, 136, 574, d.addr, 10, 440], [0, 138, 551, d.contact, 10, 440], [0, 140, 528, d.faxArea, 9], [0, 184, 528, d.fax7], [0, 140, 504, d.area, 9], [0, 184, 504, d.phone7],
        [0, 178, 442, d.customer, 10, 400], [0, 164, 419, yr, 9, 34], [0, 236, 419, make, 9, 33], [0, 308, 419, model, 9, 40], [0, 384, 419, d.vin, 9, 142], [0, 52, 293, d.amount]]);
    }
    /* Desjardins is locked, so pdf.js fills it */
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PO_PDF_JS.worker;
    return window.pdfjsLib.getDocument({ data:new Uint8Array(buf) }).promise.then(function(doc){
      return doc.getPage(1).then(function(page){ return page.getAnnotations(); }).then(function(ann){
        var val = { "NomMarchand":d.dealer, "NoDealer":d.routeone, "Description du véhicule  Marque":d.veh, "No didentification du véhicule":d.vin, "NomEmprunteur":d.customer, "Date de naissance":d.dob, "Transit  Folio":d.loan, "P1Texte1":d.payDate, "P1Texte2":d.amount, "P1Texte3":d.city, "P1Texte4":d.date };
        ann.filter(function(a){ return a.subtype === "Widget" && a.fieldType === "Tx" && val[a.fieldName] !== undefined && String(val[a.fieldName]) !== ""; }).forEach(function(a){ doc.annotationStorage.setValue(a.id, { value:val[a.fieldName] }); });
        ann.filter(function(a){ return a.subtype === "Widget" && a.fieldName === "Paiement" && a.rect[1] > 340; }).forEach(function(a){ doc.annotationStorage.setValue(a.id, { value:true }); });
        return doc.saveDocument();
      });
    });
  });
}
function poBase64(bytes){ var s = "", u = new Uint8Array(bytes); for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function poPadName(tab){ var s = poState(tab); return "PAD-" + s.bank + "-" + String(s.padName || "customer").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 30) + ".pdf"; }

/* ---- the page ---- */
function poTabsHtml(){
  return '<div class="po-tabs">' + PO_TYPE_KEYS.map(function(k){ return '<button type="button" data-po="tab" data-v="' + k + '" class="' + (PO.tab === k ? "on" : "") + '">' + esc(PO_TYPES[k].label) + '</button>'; }).join("") +
    '<span class="po-gap"></span><button type="button" data-po="tab" data-v="log" class="' + (PO.tab === "log" ? "on" : "") + '">Request log</button></div>';
}
function poField(k, label, val, type){ return '<div><label class="po-l" for="po-f-' + k + '">' + esc(label) + '</label><input id="po-f-' + k + '" data-pof="' + k + '" type="' + (type === "date" ? "date" : "text") + '" value="' + esc(val || "") + '" autocomplete="off"></div>'; }
function poLookHtml(tab){
  var L = PO.look[tab], s = poState(tab); if (!L || !L.deals || !L.deals.length || L.stock !== String(s.f.stk || "").trim() || !(tab === "refund" || poPadOn(tab))) return "";
  return '<div class="po-deal">' + L.deals.slice(0, 3).map(function(d, i){ return '<div><b>Found in the Sales Tracker:</b> ' + esc(d.customer || "") + ' · ' + esc(d.vehicle || "") + (d.soldDate ? ' · sold ' + esc(poFmtDate(d.soldDate)) : '') +
    ' <button type="button" class="po-btn sm" data-po="usedeal" data-v="' + i + '">Use customer and vehicle</button></div>'; }).join("") + '</div>';
}
function poFormHtml(){
  var tab = PO.tab, s = poState(tab), T = poT(tab), pad = poPadOn(tab);
  var fields = (tab === "lien" ? '<div class="po-w"><label class="po-l">What kind of lien payout?</label><div class="po-radios"><button type="button" data-po="kind" data-v="lien" class="' + (s.kind !== "buyout" ? "on" : "") + '">Trade lien payout</button><button type="button" data-po="kind" data-v="buyout" class="' + (s.kind === "buyout" ? "on" : "") + '">Dealer lease buyout</button></div></div>' : '') +
    '<div class="po-w"><label class="po-l">Payment method</label><div class="po-radios">' + T.pays.map(function(p){ return '<button type="button" data-po="pay" data-v="' + p + '" class="' + (s.pay === p ? "on" : "") + '">' + (p === "PAD" ? "PAD (bank debits us)" : p) + '</button>'; }).join("") + '</div></div>' +
    '<div class="po-w"><label class="po-l" for="po-x-payee">' + esc(T.payeeLbl) + '</label><input id="po-x-payee" data-pox="payee" type="text" value="' + esc(s.payee) + '" autocomplete="off"' + (T.payeeFixed ? ' readonly' : '') + '></div>' +
    T.f.map(function(f){ return poField(f[0], f[1], s.f[f[0]], f[2]); }).join("");
  var html = '<div class="po-card"><h3>' + esc(T.title) + '</h3><div class="po-hint">' + esc(T.hint) + '</div><div class="po-f">' + fields + '</div>' + poLookHtml(tab) + '</div>';
  if (T.carfax) html += '<div class="po-card"><h3>Carfax link</h3><div class="po-hint">Shown as a highlighted button in the email, so accounting opens the lien check in one click.</div><input id="po-x-carfax" data-pox="carfax" type="url" value="' + esc(s.carfax) + '" placeholder="Paste the Carfax report link"></div>';
  html += '<div class="po-card"><h3>Amount</h3><div class="po-f"><div><label class="po-l" for="po-x-amount">' + esc(T.amtLbl) + '</label><input id="po-x-amount" data-pox="amount" type="number" step="0.01" min="0" value="' + esc(s.amount) + '"></div>' +
    '<div><label class="po-l">HST</label><label class="po-chk"><input type="checkbox" data-pox="hst" ' + (s.hst ? "checked" : "") + '> Add 13% HST to this amount</label></div></div></div>';
  if (pad){
    var b = s.bank;
    html += '<div class="po-card"><h3>Bank PAD form</h3><div class="po-hint">The bank\'s own form, filled in from your request. The customer and vehicle go on the form only. They aren\'t in the email.</div><div class="po-f">' +
      '<div><label class="po-l" for="po-x-bank">Bank form</label><select id="po-x-bank" data-pox="bank">' + PO_PAD_BANKS.map(function(x){ return '<option value="' + x[0] + '" ' + (b === x[0] ? "selected" : "") + '>' + esc(x[1]) + '</option>'; }).join("") + '</select></div>' +
      '<div><label class="po-l" for="po-x-padName">Customer name</label><input id="po-x-padName" data-pox="padName" type="text" value="' + esc(s.padName) + '" autocomplete="off"></div>' +
      '<div><label class="po-l" for="po-x-padVeh">Vehicle (year, make, model)</label><input id="po-x-padVeh" data-pox="padVeh" type="text" value="' + esc(s.padVeh) + '" autocomplete="off"></div>' +
      '<div><label class="po-l" for="po-x-padVin">VIN</label><input id="po-x-padVin" data-pox="padVin" type="text" value="' + esc(s.padVin) + '" autocomplete="off"></div>' +
      '<div><label class="po-l" for="po-x-loan">Customer loan / account #</label><input id="po-x-loan" data-pox="loan" type="text" value="' + esc(s.loan) + '" autocomplete="off"></div>' +
      (b === "CIBC" ? '<div><label class="po-l" for="po-x-phone">Customer phone (CIBC asks for it)</label><input id="po-x-phone" data-pox="phone" type="text" value="' + esc(s.phone) + '"></div>' : '') +
      (b === "DESJARDINS" ? '<div><label class="po-l" for="po-x-dob">Customer date of birth (optional)</label><input id="po-x-dob" data-pox="dob" type="text" value="' + esc(s.dob) + '" placeholder="YYYY-MM-DD"></div>' : '') +
      '</div><div class="po-info"><b>Filled in for you:</b> the details above, plus amount, date, and the dealership name, contact, phone and fax (set once in Dealership settings).<br><b>Left blank on purpose:</b> the dealer\'s transit, institution and account numbers (accounting adds those) and the signature.</div>' +
      '<div class="po-row"><button type="button" class="po-btn p" data-po="padopen"' + (PO.busy ? " disabled" : "") + '>Open pre-filled PAD form (PDF)</button></div></div>';
  }
  html += '<div class="po-card"><h3>Documents you are attaching</h3><div class="po-hint">Tick what you\'ll attach to the email. The email lists what is attached and flags anything missing.</div>' +
    T.docs.map(function(d, i){ return '<label class="po-doc"><input type="checkbox" data-pod="' + i + '" ' + (s.docs[i] ? "checked" : "") + '><span>' + esc(d[0]) + (d[1] ? '<small>' + esc(d[1]) + '</small>' : '') + '</span></label>'; }).join("") + '</div>';
  html += '<div class="po-card"><h3>Forward to</h3><div class="po-f"><div class="po-w"><label class="po-l" for="po-x-to">Accounting</label><input id="po-x-to" data-pox="to" type="text" value="' + esc(s.to) + '" placeholder="accounting email (set a default in Dealership settings)"></div>' +
    '<div class="po-w"><label class="po-l" for="po-x-cc">Cc</label><input id="po-x-cc" data-pox="cc" type="text" value="' + esc(s.cc) + '" placeholder="GM, Regional Controller…"></div>' +
    '<div class="po-w"><label class="po-l" for="po-x-notes">Notes for accounting (optional)</label><textarea id="po-x-notes" data-pox="notes" rows="2" placeholder="Anything accounting should know">' + esc(s.notes) + '</textarea></div></div></div>';
  return html;
}
function poMailHtml(){
  var tab = PO.tab, s = poState(tab), me = poMe();
  return '<div class="po-mail"><div class="po-mh"><div class="po-r"><span>Sent to</span><b>you' + (me.email ? ' · ' + esc(me.email) : '') + '</b></div><div class="po-r"><span>Then forward to</span><b id="po-m-to">' + esc(s.to) + '</b></div><div class="po-r"><span>Cc</span><b id="po-m-cc">' + esc(s.cc) + '</b></div><div class="po-r po-subj"><span>Subject</span><b id="po-m-subj">' + esc(poSubject(tab)) + '</b></div></div>' +
    '<div class="po-mb"><div id="po-em">' + poEmailHtml(tab) + '</div></div>' +
    '<div class="po-mh po-ma"><div class="po-row"><button type="button" class="po-btn p" data-po="sendme"' + (PO.busy ? " disabled" : "") + '>' + (PO.busy ? "Sending…" : "✉ Email it to me") + '</button><button type="button" class="po-btn" data-po="copy">Copy email</button><button type="button" class="po-btn" data-po="draft">Open email draft</button><button type="button" class="po-btn" data-po="copysubj">Copy subject</button><button type="button" class="po-btn" data-po="copyaddr">Copy forward addresses</button></div>' +
    '<div class="po-msg" id="po-msg">' + (PO.msg || '"Email it to me" sends this to your own inbox with the subject already set' + (poPadOn(tab) ? ", and the pre-filled PAD form attached" : "") + '. Open it, press Forward, add accounting and your scans, and send.') + '</div></div></div>';
}
function poLogHtml(){
  poLoadLog();
  var rows = PO.log;
  var head = '<div class="po-card"><h3>Request log</h3><div class="po-hint">Every requisition you email to yourself is saved here, so you can see where it is. Mark it as the replies come in.' + (V.isAdmin() ? " You see everyone's." : "") + '</div>';
  if (PO.logErr) return head + '<div class="po-warn">' + esc(PO.logErr) + '</div></div>';
  if (!rows) return head + '<div class="po-empty">Loading…</div></div>';
  if (!rows.length) return head + '<div class="po-empty">Nothing yet. Fill in a request and press "Email it to me".</div></div>';
  return head + rows.map(function(r){ var d = r.data || {}, st = r.status || "sent";
    return '<div class="po-rq"><div class="po-m"><b>' + esc(poLabelOf(r.kind, d)) + ' · ' + esc(d.payee || "") + '</b><small>' + (d.stk ? 'Stock ' + esc(d.stk) + ' · ' : '') + esc(poFmtDate(String(r.created_at || "").slice(0, 10))) + (V.isAdmin() && r.created_by_name ? ' · ' + esc(r.created_by_name) : '') + '</small></div>' +
      '<span class="po-pill ' + st + '">' + esc(PO_STATUS[st] || st) + '</span><div class="po-amt">' + poMoney(d.total) + '</div><div class="po-acts">' +
      (st === "sent" ? '<button type="button" class="po-btn sm" data-po="mark" data-id="' + esc(r.id) + '" data-v="approved">Mark approved</button><button type="button" class="po-btn sm" data-po="mark" data-id="' + esc(r.id) + '" data-v="returned">Returned</button>' : '') +
      (st === "approved" ? '<button type="button" class="po-btn sm ok" data-po="mark" data-id="' + esc(r.id) + '" data-v="paid">Mark paid</button><button type="button" class="po-btn sm" data-po="mark" data-id="' + esc(r.id) + '" data-v="returned">Returned</button>' : '') +
      (st === "returned" ? '<button type="button" class="po-btn sm" data-po="mark" data-id="' + esc(r.id) + '" data-v="sent">Sent again</button>' : '') + '</div></div>'; }).join("") + '</div>';
}
function viewPayout(){
  if (!poCan()) return '<div class="card"><div class="card-b"><h2 style="margin:0 0 6px">Payout Request isn\'t switched on for you</h2><p class="muted" style="margin:0">Ask your General Manager to turn it on in Users &amp; access.</p></div></div>';
  var body = PO.tab === "log" ? poLogHtml() : '<div class="po-grid"><div>' + poFormHtml() + '</div>' + poMailHtml() + '</div>';
  return '<div class="po"><div class="po-top"><div class="po-eyebrow">Finance · Payout Request</div><h2>Payout Request</h2><div class="po-sub">Fill in the details and get a finished requisition email for accounting. Attach your scans in your own email, as you do today.</div></div>' + poTabsHtml() + body + '</div>';
}

/* ---- the log ---- */
function poLoadLog(force){
  var store = state.activeDealershipId;
  if (!force && (PO.log || PO.logLoading) && PO.logStore === store) return;
  if (!stOnline()){ PO.log = PO.log || []; PO.logStore = store; return; }
  PO.logLoading = true; PO.logStore = store; PO.logErr = null;
  sb.from("payout_requests").select("id,created_by_name,created_at,status,kind,data,emailed_at").eq("dealership_id", store).order("created_at", { ascending:false }).limit(100).then(function(r){
    PO.logLoading = false; if (PO.logStore !== store) return;
    if (r.error) PO.logErr = "Couldn't load the log: " + r.error.message; else PO.log = r.data || [];
    render();
  });
}
function poMark(id, status){
  var row = (PO.log || []).filter(function(r){ return r.id === id; })[0]; if (!row) return;
  sb.from("payout_requests").update({ status:status, updated_at:new Date().toISOString() }).eq("id", id).then(function(r){
    if (r.error){ toast("Couldn't update it: " + r.error.message, "err"); return; }
    row.status = status; toast("Marked " + (PO_STATUS[status] || status).toLowerCase() + ".", "ok"); render(); });
}

/* ---- actions ---- */
function poRefresh(){
  var tab = PO.tab, s = poState(tab), $ = function(i){ return document.getElementById(i); };
  if ($("po-m-to")) $("po-m-to").textContent = s.to; if ($("po-m-cc")) $("po-m-cc").textContent = s.cc;
  if ($("po-m-subj")) $("po-m-subj").textContent = poSubject(tab); if ($("po-em")) $("po-em").innerHTML = poEmailHtml(tab);
}
function poSay(msg){ PO.msg = msg; var m = document.getElementById("po-msg"); if (m) m.textContent = msg; }
function poCheck(tab){
  var s = poState(tab), tt = C.payoutTotals(s.amount, s.hst);
  if (!String(s.payee || "").trim()){ toast("Who is the payment to? Fill in the " + poT(tab).payeeLbl.toLowerCase() + ".", "err"); return false; }
  if (!(tt.total > 0)){ toast("Enter the amount.", "err"); return false; }
  return true;
}
function poOpenBlob(bytes, name){
  var url = URL.createObjectURL(new Blob([bytes], { type:"application/pdf" })), w = null;
  try { w = window.open(url, "_blank"); } catch (e) {}
  if (!w){ var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
}
function poPadOpen(){
  var tab = PO.tab; if (!poPadOn(tab) || PO.busy) return;
  PO.busy = true; render();
  poPadPdf(tab).then(function(bytes){ PO.busy = false; render(); poOpenBlob(bytes, poPadName(tab)); },
    function(e){ PO.busy = false; render(); toast(e.message || "Couldn't make the PAD form.", "err"); });
}
function poSendMe(){
  var tab = PO.tab, s = poState(tab);
  if (PO.busy || !poCheck(tab)) return;
  if (!stOnline()){ toast("Sign in online to send email. You can still copy it.", "err"); return; }
  var id = "pr-" + C.uid(), tt = C.payoutTotals(s.amount, s.hst), subject = poSubject(tab), store = state.activeDealershipId, me = V.currentUser();
  PO.busy = true; PO.msg = null; render();
  var snap = { type:tab, sub:tab === "lien" ? s.kind : "", pay:s.pay, payee:s.payee, stk:s.f.stk || "", dms:s.f.dms || "", name:s.f.name || "", total:tt.total, subject:subject, to:s.to, cc:s.cc, bank:poPadOn(tab) ? s.bank : "" };
  var attach = poPadOn(tab) ? poPadPdf(tab).then(function(b){ return [{ filename:poPadName(tab), content:poBase64(b) }]; }) : Promise.resolve([]);
  attach.then(function(attachments){
    return sb.from("payout_requests").insert({ id:id, dealership_id:store, created_by_name:me.name || "", status:"draft", kind:tab, data:snap }).then(function(ins){
      if (ins.error) throw new Error("Couldn't save the request: " + ins.error.message);
      return sb.auth.getSession();
    }).then(function(r){
      var sess = r.data && r.data.session; if (!sess) throw new Error("You're signed out. Sign in again.");
      return fetch(SB_URL + "/functions/v1/send-requisition", { method:"POST", headers:{ "Content-Type":"application/json", "apikey":SB_KEY, "Authorization":"Bearer " + sess.access_token },
        body:JSON.stringify({ dealershipId:store, requestId:id, subject:subject, html:poEmailHtml(tab), text:poEmailText(tab), attachments:attachments }) });
    }).then(function(res){ return res.json().then(function(j){ if (!res.ok || j.error) throw new Error(j.error || ("Error " + res.status)); return j; }); });
  }).then(function(j){
    return sb.from("payout_requests").update({ status:"sent", updated_at:new Date().toISOString() }).eq("id", id).then(function(){
      PO.busy = false; PO.msg = "✓ Sent to " + (j.to || "your inbox") + ". Check your inbox, press Forward, add accounting and your scans, and send. It's saved in the Request log.";
      toast("Sent to your inbox.", "ok"); poLoadLog(true); render(); });
  }, function(e){ PO.busy = false; render(); toast(e.message || "Couldn't send it.", "err"); });
}
function poCopy(){
  var tab = PO.tab; if (!poCheck(tab)) return;
  var html = document.getElementById("po-em").innerHTML, txt = poEmailText(tab);
  if (navigator.clipboard && window.ClipboardItem){
    navigator.clipboard.write([new ClipboardItem({ "text/html":new Blob([html], { type:"text/html" }), "text/plain":new Blob([txt], { type:"text/plain" }) })]).then(function(){ poSay("Copied. Paste it into a new Outlook or Gmail message, attach your scans and send."); toast("Email copied.", "ok"); },
      function(){ navigator.clipboard.writeText(txt).then(function(){ poSay("Copied as plain text."); }, function(){ poSay("Your browser blocked copying."); }); });
  } else if (navigator.clipboard){ navigator.clipboard.writeText(txt).then(function(){ poSay("Copied as plain text."); }); }
}
function poDraft(){
  var tab = PO.tab, s = poState(tab); if (!poCheck(tab)) return;
  location.href = "mailto:" + encodeURIComponent(s.to || "") + "?cc=" + encodeURIComponent(s.cc || "") + "&subject=" + encodeURIComponent(poSubject(tab)) + "&body=" + encodeURIComponent(poEmailText(tab));
}
function poLookup(tab, stock){
  stock = String(stock || "").trim();
  if (!stock || !stOnline()) return;
  if (PO.look[tab] && PO.look[tab].stock === stock) return;
  PO.look[tab] = { stock:stock, deals:[] };
  sb.from("sales_log").select("data").eq("dealership_id", state.activeDealershipId).ilike("data->>stockNo", stock.replace(/[%_\\]/g, "\\$&")).order("sold_on", { ascending:false }).limit(3).then(function(r){
    if (r.error || !r.data || !r.data.length) return;
    PO.look[tab] = { stock:stock, deals:r.data.map(function(x){ return x.data; }) }; render(); });
}
document.addEventListener("click", function(ev){
  var el = ev.target && ev.target.closest ? ev.target.closest("[data-po]") : null; if (!el) return;
  ev.preventDefault();
  var act = el.getAttribute("data-po"), v = el.getAttribute("data-v"), s = PO_TYPES[PO.tab] ? poState(PO.tab) : null;
  switch (act){
    case "tab": PO.tab = v; PO.msg = null; if (v === "log") poLoadLog(true); window.scrollTo(0, 0); break;
    case "pay": s.pay = v; PO.msg = null; break;
    case "padopen": poPadOpen(); return;
    case "sendme": poSendMe(); return;
    case "copy": poCopy(); return;
    case "draft": poDraft(); return;
    case "copysubj": if (navigator.clipboard) navigator.clipboard.writeText(poSubject(PO.tab)); poSay("Subject copied: " + poSubject(PO.tab)); return;
    case "copyaddr": if (navigator.clipboard) navigator.clipboard.writeText((s.to || "") + (s.cc ? "  Cc: " + s.cc : "")); poSay("Addresses copied. Paste them into the forward."); return;
    case "usedeal": { var L = PO.look[PO.tab], d = L && L.deals[Number(v)]; if (d){ if (PO.tab === "refund"){ s.f.name = d.customer || s.f.name; s.f.veh = d.vehicle || s.f.veh; } else { s.padName = d.customer || s.padName; s.padVeh = d.vehicle || s.padVeh; } } break; }
    case "kind": s.kind = v; s.docs = {}; s.carfax = v === "buyout" ? "" : s.carfax; s.pay = poT("lien").pays[0]; s.payee = v === "buyout" ? PO_BUYOUT.payeeFixed : ""; PO.msg = null; break;
    case "mark": poMark(el.getAttribute("data-id"), v); return;
    default: return;
  }
  render();
});
function poField2(ev){
  var el = ev.target; if (!el || !el.getAttribute) return;
  var kf = el.getAttribute("data-pof"), kx = el.getAttribute("data-pox"), kd = el.getAttribute("data-pod");
  if (!kf && !kx && kd === null) return;
  var tab = PO.tab, s = poState(tab);
  if (kf){ s.f[kf] = el.value; if (ev.type === "change" && kf === "stk") poLookup(tab, el.value); poRefresh(); return; }
  if (kd !== null){ if (ev.type !== "change") return; s.docs[kd] = !!el.checked; poRefresh(); return; }
  if (kx === "hst"){ if (ev.type !== "change") return; s.hst = !!el.checked; poRefresh(); return; }
  if (kx === "bank"){ if (ev.type !== "change") return; s.bank = el.value; render(); return; }
  s[kx] = el.value; poRefresh();
}
document.addEventListener("input", poField2);
document.addEventListener("change", poField2);

/* ---- Dealership settings tile ---- */
function poSetVal(path){ var o = state.config.payout || {}; path.split(".").forEach(function(p){ o = o ? o[p] : undefined; }); return o === undefined || o === null ? "" : o; }
function viewPayoutSettings(){
  var dis = V.isAdmin() ? "" : "disabled", cfg = poCfg(), ap = cfg.approvers && cfg.approvers.length ? cfg.approvers : ["General Manager", "Regional Controller"];
  var inp = function(label, path, ph, hint){ return '<label class="f"><span>' + esc(label) + '</span><input type="text" data-posf="' + path + '" value="' + esc(poSetVal(path)) + '" placeholder="' + esc(ph || "") + '" ' + dis + '>' + (hint ? '<small class="muted">' + esc(hint) + '</small>' : '') + '</label>'; };
  return '<div class="card"><div class="card-h"><h2>Payout requests</h2></div><div class="card-b">' +
    '<p class="muted small" style="margin:0 0 10px">The requisition email is built from these. Nothing here costs anything, and no AI reads your documents.</p>' +
    '<div class="inline">' + inp("Accounting email (forward to)", "accountingEmail", "accounting@yourdealership.ca") + inp("Default Cc", "defaultCc", "gm@…; regional.controller@…", "Separate several addresses with a semicolon") + '</div>' +
    '<div class="inline"><label class="f"><span>First approval line</span><input type="text" data-posf="approver0" value="' + esc(ap[0] || "") + '" ' + dis + '></label><label class="f"><span>Second approval line</span><input type="text" data-posf="approver1" value="' + esc(ap[1] || "") + '" ' + dis + '></label></div>' +
    '<h3 style="margin:16px 0 4px;font-size:14px">Subject lines</h3><p class="muted small" style="margin:0 0 6px">Use {dms}, {stk}, {bank} and {name}. A part with nothing filled in, such as "STK # {stk}", drops out of the subject.</p>' +
    Object.keys(PO_SUBJECT_LABEL).map(function(k){ var cur = (cfg.subjects && cfg.subjects[k]) || C.PAYOUT_SUBJECTS[k];
      return '<label class="f"><span>' + esc(PO_SUBJECT_LABEL[k]) + '</span><input type="text" data-posf="subjects.' + k + '" value="' + esc(cur) + '" ' + dis + ' style="font-family:ui-monospace,Consolas,monospace;font-size:12.5px"></label>'; }).join("") +
    '<h3 style="margin:16px 0 4px;font-size:14px">Bank PAD forms</h3><p class="muted small" style="margin:0 0 6px">Printed on the bank forms for you. The dealer\'s own bank account numbers are left for accounting.</p>' +
    '<div class="inline">' + inp("Dealer contact name", "pad.contact", "Name for the bank to call") + inp("Contact phone", "pad.phone", "905-555-0100") + '</div>' +
    '<div class="inline">' + inp("Fax number", "pad.fax", "905-555-0101") + inp("Email", "pad.email", "finance@yourdealership.ca") + '</div>' +
    '<div class="inline">' + inp("Dealertrack / RouteOne number (Desjardins)", "pad.routeone", "") + inp("City the forms are signed in", "pad.city", "Mississauga") + '</div>' +
  '</div></div>';
}
document.addEventListener("change", function(ev){
  var el = ev.target; if (!el || !el.getAttribute || !el.getAttribute("data-posf") || !V.isAdmin()) return;
  var path = el.getAttribute("data-posf"), c = state.config; c.payout = c.payout || {};
  if (path === "approver0" || path === "approver1"){
    var a = (c.payout.approvers && c.payout.approvers.length ? c.payout.approvers : ["General Manager", "Regional Controller"]).slice(); a[path === "approver0" ? 0 : 1] = el.value.trim(); c.payout.approvers = a;
  } else {
    var parts = path.split("."), o = c.payout; for (var i = 0; i < parts.length - 1; i++){ o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
    var last = parts[parts.length - 1], val = el.value.trim();
    if (parts[0] === "subjects" && (!val || val === C.PAYOUT_SUBJECTS[last])) delete o[last]; else o[last] = val;
  }
  PO.s = {}; /* so new requests pick up the new defaults */
  commit(); toast("Saved.", "ok");
});
