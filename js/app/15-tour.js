"use strict";
/* ---------------- FIRST-LOGIN WALKTHROUGH ---------------- */
var TOUR_STEPS = [
  { sel:null, title:"Welcome to the Finance module", text:"This one-minute tour shows how a deal flows from customer to signed paperwork. Use Next to move along, or Skip any time." },
  { sel:"#step-1", title:"1 · Customer", text:"Start with who you're helping. Name, phone and email feed the customer display, the printed copy and the emailed package." },
  { sel:"#step-2", title:"2 · Vehicle", text:"Enter the vehicle and its selling price. That price drives every payment and total the customer sees." },
  { sel:"#step-3", title:"3 · Finance or Cash setup", text:"Flip between Finance and Cash. Finance: pick the terms to present, set each rate and the payment frequency. Cash: enter any trade and deposit and it shows one total due." },
  { sel:"#step-4", title:"4 · Products & packages", text:"Type a price beside each product — it stays until you change it. Tick it into the Preferred, Essential or Basic column to place it in that package, or Decline to show the customer what they're waiving. Each column shows its running total. Tab jumps straight to the next price box. At the top of this card, record the package the customer chose." },
  { sel:"#step-5", title:"5 · Present & close", text:"Compare every package at every term, choose whether the customer sees payments and prices, check what's left, then complete the deal." },
  { sel:".fin-toolbar", title:"Your action bar", text:"This bar stays pinned while you scroll: the customer display, Print & send (email, internal print, customer copy), Deal (new, save, saved deals), what's left to finish, and Complete transaction." },
  { sel:null, title:"You're all set", text:"That's the core flow. Reports (left menu) lists your completed deals, and you can reopen or edit any of them. Enjoy AXIOM." }
];
function maybeStartTour(){
  if (!state.auth || state.auth.onboarded || state.ui.tour || !state.config) return;
  state.route = "finance";
  state.ui.tour = { i:0, scrolled:-1 };
}
function tourEnd(){
  state.ui.tour = null;
  if (state.auth) state.auth.onboarded = true;
  var me = userById(state.currentUserId); if (me) me.onboarded = true;
  if (sb) sb.rpc("mark_onboarded").then(function(){}, function(){});
  commit();
}
function tourStep(delta){
  var t = state.ui.tour; if (!t) return;
  var n = t.i + delta;
  if (n >= TOUR_STEPS.length){ tourEnd(); return; }
  if (n < 0) n = 0;
  state.ui.tour = { i:n, scrolled:-1 };
  commit();
}
function tourHtml(){
  var t = state.ui.tour; if (!t) return "";
  var st = TOUR_STEPS[t.i], last = t.i === TOUR_STEPS.length - 1;
  var dots = TOUR_STEPS.map(function(x, k){ return `<span class="td ${k===t.i?"on":(k<t.i?"done":"")}"></span>`; }).join("");
  return `<div class="tour-block"></div>${st.sel ? `<div class="tour-spot" id="tourSpot"></div>` : `<div class="tour-dim"></div>`}
    <div class="tour-bar" id="tourBar"><div class="tour-top"><span class="tour-count">Step ${t.i+1} of ${TOUR_STEPS.length}</span><div class="tour-dots">${dots}</div></div>
      <h3>${esc(st.title)}</h3><p>${esc(st.text)}</p>
      <div class="tour-btns"><button class="btn sm" data-act="tour-skip">${last?"Close":"Skip tour"}</button><span style="flex:1"></span>
        ${t.i>0?`<button class="btn sm" data-act="tour-back">Back</button>`:""}
        <button class="btn sm primary" data-act="tour-next">${last?"Finish":(t.i===0?"Start tour":"Next")}</button></div></div>`;
}
function positionTour(){
  var t = state.ui.tour; if (!t) return;
  var st = TOUR_STEPS[t.i], spot = document.getElementById("tourSpot"), bar = document.getElementById("tourBar");
  var vh = window.innerHeight, bh = bar ? bar.offsetHeight : 200;
  function placeBar(top){ if (!bar) return; bar.style.top = top + "px"; bar.style.bottom = "auto"; }
  if (!st.sel || !spot){ placeBar(Math.max(12, (vh - bh) / 2)); return; }
  var el = document.querySelector(st.sel);
  if (!el){ spot.style.display = "none"; placeBar(Math.max(12, (vh - bh) / 2)); return; }
  if (t.scrolled !== t.i){
    t.scrolled = t.i;
    el.scrollIntoView({ block:"start" });
    window.scrollBy(0, -96);
  }
  var r = el.getBoundingClientRect(), pad = 8;
  var maxSpot = vh - bh - 44 - Math.max(r.top, 0) - pad;
  var spotH = Math.min(r.height, Math.max(120, maxSpot));
  spot.style.display = "";
  spot.style.left = (r.left - pad) + "px"; spot.style.top = (r.top - pad) + "px";
  spot.style.width = (r.width + pad*2) + "px"; spot.style.height = (spotH + pad*2) + "px";
  var bottomEdge = r.top + spotH + pad;
  if (vh - bottomEdge >= bh + 24) placeBar(bottomEdge + 16);
  else if (r.top - pad >= bh + 24) placeBar(r.top - pad - bh - 16);
  else placeBar(Math.max(12, vh - bh - 14));
}
window.addEventListener("scroll", function(){ if (state.ui.tour) positionTour(); }, { passive:true });
window.addEventListener("resize", function(){ if (state.ui.tour) positionTour(); });
document.addEventListener("keydown", function(ev){
  if (!state.ui.tour) return;
  if (ev.key === "ArrowRight" || ev.key === "Enter"){ ev.preventDefault(); tourStep(1); }
  else if (ev.key === "ArrowLeft"){ ev.preventDefault(); tourStep(-1); }
  else if (ev.key === "Escape"){ ev.preventDefault(); tourEnd(); }
});

function copyEmailText(){
  var box = document.getElementById("emailBody");
  var text = box ? box.value : buildEmail(state.tx).body;
  var done = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text); done = true; } } catch (e) {}
  if (!done && box){
    try { box.focus(); box.select(); done = document.execCommand("copy"); } catch (e) { done = false; }
  }
  toast(done ? "Plain text copied to the clipboard." : "Copy was blocked — select the text and copy it manually.", done ? "ok" : "err");
}
function copyEmailHtml(){
  var mail = buildEmailHtml(state.tx), text = buildEmail(state.tx).body, done = false;
  try {
    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem){
      var htmlBlob = new Blob([mail.html], { type:"text/html" });
      var textBlob = new Blob([text], { type:"text/plain" });
      navigator.clipboard.write([ new ClipboardItem({ "text/html":htmlBlob, "text/plain":textBlob }) ]);
      done = true;
    }
  } catch (e) { done = false; }
  if (!done){
    try { if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text); done = true; } } catch (e) {}
  }
  toast(done ? "Formatted email copied — paste it (Ctrl/Cmd+V) into your email draft." : "Rich copy isn't supported in this browser — use the HTML source box instead.", done ? "ok" : "err");
}
function sendEmail(){
  var subject = document.getElementById("emailSubject");
  var text = buildEmail(state.tx).body;
  var to = state.tx.customer.email || "";
  var href = "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent(subject ? subject.value : "") +
    "&body=" + encodeURIComponent(text);
  var opened = null;
  try { opened = window.open(href, "_blank"); } catch (e) { opened = null; }
  if (!opened) toast("The browser blocked the mail app. Use Copy formatted email instead.","err");
  else toast("Opening your email app with the plain-text version.","ok");
}

