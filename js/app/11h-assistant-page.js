"use strict";
/* ---------------- AI ASSISTANT · FULL PAGE, FLOATING CHAT, EMAIL WRITER, MEMORY ----------------
   Who: the GM and Master always; anyone else the GM switches on ("AI Assistant" on their user card).
   - "AI Assistant" in the left pane opens this full page: Chat · Email writer · What it remembers.
   - A floating ✦ button (bottom right, every other screen) opens the same conversation in a small window.
   - Email writer: the GM picks the purpose (sales update, motivation, ownership update, coaching, recognition),
     the AI drafts it from the store's numbers, and it's laid out as a professional email to copy and send.
   - Memory: the assistant saves lasting facts people tell it (and anyone can type one); every answer reads them,
     so it gets more useful the more it's used and the more data is imported or synced.
   Customer details are never sent: salespeople's names, the store's numbers and the notes only. */
var AIP = { tab:"chat", mem:null, memLoading:false, memErr:null, memDraft:"",
  em:{ purpose:"update", to:"", who:"", tone:"Professional", points:"", table:true, busy:false, err:null, draft:null } };
var AI_PURPOSES = [
  ["update", "Sales performance update", "The sales team"],
  ["motivate", "Motivation for the team", "The sales team"],
  ["ownership", "Update to ownership / head office", "Ownership"],
  ["coach", "Coaching note to one salesperson", ""],
  ["recognise", "Recognition", "The sales team"],
  ["custom", "Something else", ""]
];
var AI_PAGE_CHIPS = ["Who needs help today, and what should I do with each?", "What should I cover in tomorrow's morning meeting?", "Where are we losing gross this month?",
  "How do we finish the month on target?", "Draft a short motivation message for the team for the rest of the month", "What should I tell ownership about this month?"];
function aiMemLoad(force){
  if (!stOnline() || AIP.memLoading || (AIP.mem && !force) || !aiOn()) return;
  AIP.memLoading = true; AIP.memErr = null; var store = ST.store;
  stAiCall({ dealershipId:store, kind:"memory_list" }).then(function(r){ AIP.memLoading = false; if (ST.store !== store) return; AIP.mem = r.notes || []; render(); },
    function(e){ AIP.memLoading = false; AIP.memErr = e.message; render(); });
}
function aiChatBody(compact){
  var chips = compact ? AI_CHIPS : AI_PAGE_CHIPS;
  return !aiOn() ? aiOffNote() : (AIC.msgs.length ? AIC.msgs.map(function(m){ return '<div class="ai-msg ' + (m.role === "user" ? "u" : "a") + '">' + (m.role === "user" ? esc(m.content).replace(/\n/g, "<br>") : aiMd(m.content)) +
      (m.remembered && m.remembered.length ? '<div class="ai-mem-tag">✓ Remembered: ' + m.remembered.map(esc).join(" · ") + '</div>' : '') + '</div>'; }).join("") :
    '<div class="ai-hello"><b>Ask about ' + esc(state.config.name || "the store") + '</b><div>Answers come from the Sales Tracker (units, pace, gross, lead sources, carry-overs, deliveries including Pulse) and what it\'s been told to remember. Customer details are never sent.</div></div>' +
    '<div class="ai-chips">' + chips.map(function(c){ return '<button type="button" data-st="aichip" data-v="' + esc(c) + '">' + esc(c) + '</button>'; }).join("") + '</div>') +
    (AIC.busy ? '<div class="ai-msg a ai-typing"><i></i><i></i><i></i></div>' : '');
}
function aiComposer(){
  return aiOn() ? '<div class="ai-pf"><textarea rows="2" data-stf="aiDraft" placeholder="Ask anything about the store, a salesperson or the month… or tell it something to remember">' + esc(AIC.draft) + '</textarea><button type="button" class="btn primary" data-st="aisend"' + (AIC.busy ? " disabled" : "") + '>Send</button></div>' +
    '<div class="ai-foot">' + (aiReady() ? 'Sends salespeople\'s names, the store\'s numbers and the notes only. Each answer is a few cents.' : 'Loading the store\'s numbers…') + '</div>' : '';
}
/* ---- the floating button and window (every screen except the Assistant page) ---- */
function aiFab(){
  if (!state.config || !aiCan() || !aiOn() || state.route === "assistant" || (typeof ST !== "undefined" && ST.tv)) return "";
  if (AIC.open) return "";
  return '<button type="button" class="ai-fab" data-st="aichat" title="AI Assistant" aria-label="Open the AI Assistant"><span>✦</span></button>';
}
/* ---- the full page ---- */
function viewAssistant(){
  stSync(); aiEnsure();
  if (!aiCan()) return '<div class="card"><div class="card-b">The AI Assistant isn\'t switched on for you. Ask your General Manager.</div></div>';
  AIC.open = false;
  var tabs = [["chat","Chat"],["email","Email writer"],["memory","What it remembers"]];
  if (AIP.tab === "memory") aiMemLoad();
  if (AIC.scroll){ AIC.scroll = false; setTimeout(function(){ var l = document.querySelector(".aip-log"); if (l) l.scrollTop = l.scrollHeight; }, 0); }
  var head = '<div class="aip-head"><div><div class="st-eyebrow">AI Assistant</div><h2>' + esc(state.config.name || "") + '</h2><div class="st-hsub">Your assistant for the day-to-day: who needs help, what to watch, and emails written from the real numbers.</div></div>' +
    '<div class="st-sub" style="margin:0">' + tabs.map(function(t){ return '<button type="button" data-st="aiptab" data-v="' + t[0] + '" class="' + (AIP.tab === t[0] ? "on" : "") + '">' + t[1] + '</button>'; }).join("") + '</div></div>';
  if (!aiOn()) return '<div class="stx">' + head + aiOffNote() + '</div>';
  var body = AIP.tab === "email" ? aiEmailView() : AIP.tab === "memory" ? aiMemoryView() : aiChatView();
  return '<div class="stx aip">' + head + body + '</div>';
}
function aiChatView(){
  var f = aiReady() ? aiFigures() : [];
  return '<div class="aip-grid"><div class="st-card aip-chat"><div class="aip-ch"><b>Conversation</b>' + (AIC.msgs.length ? '<button type="button" class="btn sm ghost" data-st="aiclear">New conversation</button>' : '') + '</div>' +
      '<div class="ai-log aip-log">' + aiChatBody(false) + '</div>' + (AIC.err ? '<div class="st-err" style="margin:0 12px 8px">' + esc(AIC.err) + '</div>' : '') + aiComposer() + '</div>' +
    '<div class="aip-side"><div class="st-card"><div class="st-ch"><span class="st-ico b">◷</span><h3>Right now<small>from the Sales Tracker</small></h3></div>' +
      (f.length ? '<div class="aip-figs">' + f.map(function(x){ return '<div><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b><em>' + esc(x[2]) + '</em></div>'; }).join("") + '</div>' : '<div class="st-empty">Loading…</div>') + '</div>' +
      '<div class="st-card"><div class="st-ch"><span class="st-ico p">✉</span><h3>Need an email?<small>written from the numbers</small></h3></div>' +
        AI_PURPOSES.slice(0, 5).map(function(p){ return '<button type="button" class="aip-quick" data-st="aipemail" data-v="' + p[0] + '">' + esc(p[1]) + ' →</button>'; }).join("") + '</div>' +
      '<div class="st-card"><div class="st-ch"><span class="st-ico g">✓</span><h3>It learns<small>' + (AIP.mem ? AIP.mem.length + " note" + (AIP.mem.length === 1 ? "" : "s") : "store notes") + '</small></h3></div>' +
        '<div class="ins-sub" style="font-size:12px;line-height:1.5">Tell it things in the chat ("Paras is off until Nov 3", "sign my emails Rahul") and it remembers them for everyone at the store. Everything imported or synced also sharpens its answers.</div>' +
        '<button type="button" class="aip-quick" data-st="aiptab" data-v="memory">See what it remembers →</button></div></div></div>';
}
/* ---- email writer ---- */
function aiEmailPeople(){ return stPerf(aiMonth(), "month").people.filter(function(x){ return !x.storeOnly; }).map(function(x){ return x.name; }); }
function aiEmailView(){
  var E = AIP.em, pur = AI_PURPOSES.filter(function(p){ return p[0] === E.purpose; })[0] || AI_PURPOSES[0], people = aiEmailPeople();
  var seg = function(k, opts){ return '<div class="aip-seg">' + opts.map(function(o){ return '<button type="button" data-st="aipset" data-k="' + k + '" data-v="' + esc(o[0]) + '" class="' + (E[k] === o[0] ? "on" : "") + '">' + esc(o[1]) + '</button>'; }).join("") + '</div>'; };
  var form = '<div class="st-card aip-form">' +
    '<div class="ai-lab">What is it for?</div>' + seg("purpose", AI_PURPOSES.map(function(p){ return [p[0], p[1]]; })) +
    (E.purpose === "coach" ? '<div class="ai-lab">Salesperson</div><select class="st-tin ai-sel" data-stf="aipWho"><option value="">Pick a salesperson</option>' + people.map(function(n){ return '<option ' + (E.who === n ? "selected" : "") + '>' + esc(n) + '</option>'; }).join("") + '</select>'
      : '<div class="ai-lab">To</div><input class="st-tin ai-sel" data-stf="aipTo" value="' + esc(E.to || pur[2]) + '" placeholder="e.g. The sales team, Ownership, Head office">') +
    '<div class="ai-lab">Tone</div>' + seg("tone", [["Professional","Professional"],["Encouraging","Encouraging"],["Firm","Firm"],["Celebratory","Celebratory"]]) +
    '<div class="ai-lab">Points to include (optional)</div><textarea class="ai-note" rows="4" data-stf="aipPoints" placeholder="e.g. Saturday event, push on Used, thank Minh for the 3 deliveries yesterday">' + esc(E.points) + '</textarea>' +
    '<label class="ai-chk"><input type="checkbox" data-stf="aipTable" ' + (E.table ? "checked" : "") + '> Add the month\'s numbers table' + (E.purpose === "coach" ? " (their deals)" : "") + '</label>' +
    (E.err ? '<div class="st-err" style="margin-top:8px">' + esc(E.err) + '</div>' : '') +
    '<button type="button" class="btn primary" style="margin-top:12px;width:100%" data-st="aipdraft"' + (E.busy ? " disabled" : "") + '>' + (E.busy ? "Writing the email…" : E.draft ? "✦ Write it again" : "✦ Draft the email") + '</button>' +
    (E.busy ? '<div class="st-ai-prog"><i></i></div>' : '') + '</div>';
  var prev = E.draft ? '<div class="st-card aip-prev"><div class="aip-ch"><div><span class="ai-lab" style="margin:0">Subject</span><div class="aip-subj">' + esc(E.draft.subject || "") + '</div></div>' +
      '<span style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn sm" data-st="aipcopysubj">Copy subject</button><button type="button" class="btn sm" data-st="aipcopy" data-v="text">Copy plain text</button><button type="button" class="btn sm primary" data-st="aipcopy" data-v="html">Copy formatted email</button></span></div>' +
      '<div class="ai-mail-prev">' + aiEmailHtml(E.draft) + '</div><div class="ins-sub" style="margin-top:8px">Paste it into a new email in Outlook or Gmail, check it, and send it yourself. Nothing is sent from here.</div></div>'
    : '<div class="st-card aip-prev aip-empty"><span class="st-ico p">✉</span><div><b>Your email appears here</b><div class="ins-sub">Pick what it\'s for and press Draft. It\'s written from this month\'s real numbers, in a professional layout you can paste straight into Outlook or Gmail.</div></div></div>';
  return '<div class="aip-mail">' + form + prev + '</div>';
}
function aiEmailFacts(){
  var E = AIP.em, f = aiFacts();
  if (E.purpose === "coach" && E.who){ f.focusSalesperson = E.who; }
  return f;
}
function aiEmailDraft(){
  var E = AIP.em; if (E.busy) return;
  if (E.purpose === "coach" && !E.who){ E.err = "Pick the salesperson first."; render(); return; }
  if (!aiReady()){ toast("Still loading the store's numbers. Try again in a moment.", "err"); return; }
  var pur = AI_PURPOSES.filter(function(p){ return p[0] === E.purpose; })[0] || AI_PURPOSES[0];
  E.busy = true; E.err = null; render();
  stAiCall({ dealershipId:ST.store, kind:"email", facts:aiEmailFacts(), request:{ purpose:pur[1], to:E.purpose === "coach" ? E.who : (E.to || pur[2]), tone:E.tone, points:E.points } }).then(function(r){
    E.busy = false; E.draft = r.result || null; render(); }).catch(function(e){ E.busy = false; E.err = e.message; render(); });
}
/* the email itself: table-based so it pastes cleanly into Outlook and Gmail */
function aiEmailTable(){
  var E = AIP.em, month = aiMonth(), p = stPerf(month, "month"), s = p.store;
  var th = 'style="padding:7px 9px;font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e3e8ef;background:#f7f9fc;text-align:center"';
  var td = 'style="padding:7px 9px;border-bottom:1px solid #eef2f7;text-align:center;font-size:13px"', tdl = 'style="padding:7px 9px;border-bottom:1px solid #eef2f7;text-align:left;font-size:13px;font-weight:700"';
  var col = { ahead:"#059669", pace:"#d97706", behind:"#dc2626" };
  var badge = function(st){ return st ? '<span style="color:' + (col[st] || "#64748b") + ';font-weight:800;font-size:11px">' + st.toUpperCase() + '</span>' : '—'; };
  if (E.purpose === "coach" && E.who){
    var x = p.people.filter(function(q){ return q.name === E.who; })[0]; if (!x) return "";
    return '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:14px 0;border:1px solid #e3e8ef"><tr><th ' + th + '>Sold</th><th ' + th + '>Target</th><th ' + th + '>Tracking</th><th ' + th + '>Needed per day</th><th ' + th + '>Status</th></tr>' +
      '<tr><td ' + td + '><b>' + stF(x.sT) + '</b></td><td ' + td + '>' + (x.tT || "—") + '</td><td ' + td + '>' + (x.kT === null ? "—" : x.kT) + '</td><td ' + td + '>' + (x.perDay === null ? "—" : x.perDay.toFixed(1)) + '</td><td ' + td + '>' + badge(x.status) + '</td></tr></table>';
  }
  var rows = p.people.filter(function(x){ return !x.storeOnly; }).sort(function(a, b){ return b.sT - a.sT; });
  return '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:14px 0;border:1px solid #e3e8ef"><tr><th ' + th.replace("text-align:center", "text-align:left") + '>' + esc(stMonthName(month)) + '</th><th ' + th + '>New</th><th ' + th + '>Used</th><th ' + th + '>Sold</th><th ' + th + '>Target</th><th ' + th + '>Tracking</th><th ' + th + '>Status</th></tr>' +
    rows.map(function(r){ return '<tr><td ' + tdl + '>' + esc(r.name) + '</td><td ' + td + '>' + stF(r.sN) + '</td><td ' + td + '>' + stF(r.sU) + '</td><td ' + td + '><b>' + stF(r.sT) + '</b></td><td ' + td + '>' + (r.tT || "—") + '</td><td ' + td + '>' + (r.kT === null ? "—" : r.kT) + '</td><td ' + td + '>' + badge(r.status) + '</td></tr>'; }).join("") +
    '<tr><td ' + tdl.replace("font-weight:700", "font-weight:800;background:#f1f5ff") + '>Store</td><td ' + td + '>' + stF(s.sN) + '</td><td ' + td + '>' + stF(s.sU) + '</td><td ' + td + '><b>' + stF(s.sT) + '</b></td><td ' + td + '>' + (s.tT || "—") + '</td><td ' + td + '>' + (s.kT === null ? "—" : s.kT) + '</td><td ' + td + '>' + badge(s.status) + '</td></tr></table>' +
    '<div style="font-size:11px;color:#94a3b8;margin:-8px 0 12px">Selling day ' + p.day + ' of ' + p.total + ' · tracking = sold ÷ selling days used × selling days in the month</div>';
}
function aiEmailHtml(D){
  var me = V.currentUser(), ink = (V.brandInk && V.brandInk()) || { main:"#1d63ed" }, E = AIP.em;
  var para = (D.paragraphs || []).map(function(t){ return '<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#1f2937">' + esc(t) + '</p>'; }).join("");
  var hi = (D.highlights || []).length ? '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:4px 0 14px"><tr><td style="background:#f6f8fb;border-left:3px solid ' + ink.main + ';padding:10px 14px">' +
      (D.highlights || []).map(function(h){ return '<div style="font-size:13.5px;line-height:1.55;color:#1f2937;margin:3px 0">•&nbsp; ' + esc(h) + '</div>'; }).join("") + '</td></tr></table>' : '';
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:640px;padding:22px 26px;background:#ffffff">' +
    '<p style="margin:0 0 12px;font-size:14px;line-height:1.6">' + esc(D.greeting || "") + '</p>' + para + hi + (E.table ? aiEmailTable() : '') +
    '<p style="margin:14px 0 2px;font-size:14px;line-height:1.6">' + esc(D.closing || "Thanks,") + '</p>' +
    '<p style="margin:0;font-size:14px;line-height:1.5"><b>' + esc(me.name || "") + '</b><br><span style="color:#64748b;font-size:12.5px">' + esc(V.roleLabel ? V.roleLabel(me.role) : me.role) + ' · ' + esc(state.config.name || "") + '</span></p></div>';
}
function aiEmailText(D){
  var me = V.currentUser(), out = [D.greeting || "", ""];
  (D.paragraphs || []).forEach(function(t){ out.push(t, ""); });
  (D.highlights || []).forEach(function(h){ out.push("- " + h); }); if ((D.highlights || []).length) out.push("");
  out.push(D.closing || "Thanks,", me.name || "", (V.roleLabel ? V.roleLabel(me.role) : me.role) + " · " + (state.config.name || ""));
  return out.join("\n");
}
function aiCopy(html, text, okMsg){
  var done = false;
  try {
    if (html && navigator.clipboard && window.ClipboardItem){ navigator.clipboard.write([new ClipboardItem({ "text/html":new Blob([html], { type:"text/html" }), "text/plain":new Blob([text], { type:"text/plain" }) })]); done = true; }
    else if (navigator.clipboard){ navigator.clipboard.writeText(text); done = true; }
  } catch (e) { done = false; }
  toast(done ? okMsg : "This browser blocked copying.", done ? "ok" : "err");
}
/* ---- memory ---- */
function aiMemoryView(){
  var me = V.currentUser(), list = AIP.mem;
  return '<div class="aip-memwrap"><div class="st-card"><div class="st-ch"><span class="st-ico g">✓</span><h3>What the assistant remembers<small>' + esc(state.config.name || "") + ' · shared by everyone who uses the assistant here</small></h3>' + (list ? '<span class="cnt">' + list.length + '</span>' : '') + '</div>' +
      '<div class="aip-add"><input class="st-tin" data-stf="aipMem" value="' + esc(AIP.memDraft) + '" placeholder="Teach it something, e.g. Paras is on vacation until November 3" maxlength="400"><button type="button" class="btn primary" data-st="aipmemadd">Remember</button></div>' +
      (AIP.memErr ? '<div class="st-err">' + esc(AIP.memErr) + '</div>' : '') +
      (!list ? '<div class="st-empty">' + (AIP.memLoading ? "Loading…" : "") + '</div>' : !list.length ? '<div class="st-empty">Nothing yet. Tell the assistant about your people, goals and how you like things done, in the chat or here.</div>' :
        '<div class="aip-mems">' + list.map(function(n){ var can = V.isAdmin() || n.created_by === me.id;
          return '<div class="aip-mem"><div><div>' + esc(n.note) + '</div><div class="ins-sub">' + (n.source === "assistant" ? "Learned in a conversation with " : "Added by ") + esc(n.created_by_name || "someone") + ' · ' + esc(stDay(String(n.created_at).slice(0, 10))) + '</div></div>' +
            (can ? '<button type="button" class="st-act" data-st="aipmemdel" data-v="' + esc(n.id) + '" title="Forget this" aria-label="Forget this">✕</button>' : '') + '</div>'; }).join("") + '</div>') +
    '</div><div class="st-card"><div class="st-ch"><span class="st-ico b">◎</span><h3>How it gets smarter</h3></div><div class="ins-sub aip-how">' +
      '<p><b>From your data.</b> Every deal logged, imported or synced from Google Drive, every Pulse delivery and every month of targets gives it more to work from. Its answers use the whole year, not just today.</p>' +
      '<p><b>From what you tell it.</b> Lasting facts and preferences are saved here and used in every answer, email and brief for everyone at this store.</p>' +
      '<p><b>Private.</b> Customer details are never sent to the AI. Only salespeople\'s names, the store\'s numbers and these notes.</p></div></div></div>';
}
/* ---- events ---- */
function aipAct(act, el){
  var v = el.getAttribute("data-v"), E = AIP.em;
  switch (act){
    case "aiptab": AIP.tab = v; if (v === "memory") aiMemLoad(true); if (state.route !== "assistant"){ state.route = "assistant"; AIC.open = false; } window.scrollTo(0, 0); render(); return true;
    case "aipemail": AIP.tab = "email"; E.purpose = v; E.to = ""; E.draft = null; E.err = null; if (state.route !== "assistant"){ state.route = "assistant"; AIC.open = false; } window.scrollTo(0, 0); render(); return true;
    case "aipset": E[el.getAttribute("data-k")] = v; if (el.getAttribute("data-k") === "purpose"){ E.to = ""; E.err = null; } render(); return true;
    case "aipdraft": aiEmailDraft(); return true;
    case "aipcopy": if (!E.draft) return true; aiCopy(v === "html" ? aiEmailHtml(E.draft) : "", aiEmailText(E.draft), v === "html" ? "Copied. Paste it into a new email in Outlook or Gmail." : "Copied as plain text."); return true;
    case "aipcopysubj": if (E.draft) aiCopy("", E.draft.subject || "", "Subject copied."); return true;
    case "aipmemadd": {
      var note = String(AIP.memDraft || "").trim(); if (!note) return true;
      stAiCall({ dealershipId:ST.store, kind:"memory_add", note:note }).then(function(r){ AIP.memDraft = ""; AIP.mem = [r.note].concat(AIP.mem || []); toast("Remembered.", "ok"); render(); }, function(e){ toast(e.message, "err"); });
      return true;
    }
    case "aipmemdel":
      askConfirm("Forget this note?", "The assistant won't use it any more, for anyone at this store.", "Forget it", function(){
        stAiCall({ dealershipId:ST.store, kind:"memory_delete", id:v }).then(function(){ AIP.mem = (AIP.mem || []).filter(function(n){ return n.id !== v; }); toast("Forgotten.", "ok"); render(); }, function(e){ toast(e.message, "err"); }); });
      return true;
  }
  return false;
}
function aipField(ev){
  var el = ev.target; if (!el || !el.getAttribute) return; var k = el.getAttribute("data-stf"); if (!k) return;
  var E = AIP.em;
  if (k === "aipWho"){ if (ev.type === "change"){ E.who = el.value; E.err = null; render(); } return; }
  if (k === "aipTo"){ E.to = el.value; return; }
  if (k === "aipPoints"){ E.points = el.value; return; }
  if (k === "aipTable"){ if (ev.type === "change"){ E.table = !!el.checked; render(); } return; }
  if (k === "aipMem"){ AIP.memDraft = el.value; return; }
}
document.addEventListener("input", aipField);
document.addEventListener("change", aipField);
document.addEventListener("keydown", function(ev){
  if (ev.key === "Enter" && ev.target && ev.target.getAttribute && ev.target.getAttribute("data-stf") === "aipMem"){ ev.preventDefault(); aipAct("aipmemadd", ev.target); }
});
