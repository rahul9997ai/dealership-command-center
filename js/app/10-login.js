"use strict";
/* ---------------- ONBOARDING (no dealership yet) ---------------- */
function renderOnboarding(){
  var canCreate = V.isMaster();
  return `<div class="card"><div class="card-b"><div class="uc">
    <div class="bigtag">GET STARTED</div>
    <h2>No dealership has been set up yet</h2>
    <p class="muted" style="max-width:54ch">Dealership Command is ready, but no dealership exists yet. ${canCreate
      ? "Create your first dealership to pick its brand, taxes and finance defaults — the Finance module and customer display unlock as soon as it exists."
      : "Your account isn't linked to a dealership that exists yet. Ask your administrator to check that your account is assigned to the right dealership."}</p>
    ${canCreate ? `<button class="btn primary" data-act="dealer-new">Create a dealership</button>` : ""}
  </div></div></div>`;
}

/* ---------------- AXIOM LOGIN ---------------- */
function axiomMarkSvg(size){
  /* An "A" whose crossbar is a rising arrow — see, understand, act — in a
     graphite tile with a champagne rim. Two solid legs, one gold accent. */
  var u = "m" + Math.random().toString(36).slice(2,8);
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mahanex">
    <defs>
      <linearGradient id="${u}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#23262e"/><stop offset="1" stop-color="#0e1014"/></linearGradient>
      <linearGradient id="${u}rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efdcae"/><stop offset=".5" stop-color="#b8965a"/><stop offset="1" stop-color="#e6cf98"/></linearGradient>
      <linearGradient id="${u}leg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbf2"/><stop offset="1" stop-color="#d9cfba"/></linearGradient>
      <linearGradient id="${u}arw" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#c9a25e"/><stop offset="1" stop-color="#f3dfa8"/></linearGradient>
      <radialGradient id="${u}sh" cx=".3" cy=".1" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <filter id="${u}gl" filterUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect x="2" y="2" width="96" height="96" rx="27" fill="url(#${u}bg)"/>
    <rect x="2" y="2" width="96" height="96" rx="27" fill="url(#${u}sh)"/>
    <rect x="2.8" y="2.8" width="94.4" height="94.4" rx="26.2" fill="none" stroke="url(#${u}rim)" stroke-width="1.6"/>
    <path d="M22 81 L50 20 L78 81" fill="none" stroke="url(#${u}leg)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <g filter="url(#${u}gl)" fill="none" stroke="url(#${u}arw)" stroke-linecap="round" stroke-linejoin="round">
      <path d="M36.5 67 H46.5 L57.5 56" stroke-width="5.6"/>
      <path d="M50.5 55.5 H58 V63" stroke-width="5"/>
    </g>
  </svg>`;
}
function axiomTargetSvg(){
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="#5fd4f4" stroke-width="1.6"/>
    <circle cx="12" cy="12" r="4.5" stroke="#a78bfa" stroke-width="1.6"/>
    <circle cx="12" cy="12" r="1.4" fill="#fff"/>
  </svg>`;
}
function axiomGlobeSvg(){
  /* Not a literal photoreal render (that needs a rendered/video asset, which
     would break the single self-contained-file, zero-dependency setup) —
     this pushes the same wireframe-globe idea further: a glowing core,
     five independently-timed rings for real parallax depth, a denser node
     network with connecting lines, and a soft outer bloom. */
  var nodes = [
    {x:200,y:42,r:4.5,c:"#38bdf8",d:".2s"}, {x:358,y:150,r:4,c:"#a78bfa",d:"1.4s"},
    {x:358,y:250,r:4,c:"#fff",d:"2.6s"}, {x:200,y:358,r:4.5,c:"#38bdf8",d:".8s"},
    {x:42,y:250,r:4,c:"#a78bfa",d:"2s"}, {x:42,y:150,r:4,c:"#fff",d:"3.2s"},
    {x:116,y:20,r:3,c:"#a78bfa",d:".5s"}, {x:284,y:20,r:3,c:"#38bdf8",d:"1.1s"},
    {x:392,y:116,r:3,c:"#fff",d:"1.7s"}, {x:392,y:284,r:3,c:"#a78bfa",d:"2.3s"},
    {x:284,y:392,r:3,c:"#38bdf8",d:"2.9s"}, {x:116,y:392,r:3,c:"#fff",d:"3.5s"},
    {x:20,y:284,r:3,c:"#a78bfa",d:"1.3s"}, {x:20,y:116,r:3,c:"#38bdf8",d:"1.9s"}
  ];
  var lines = [[0,6],[0,7],[1,7],[1,8],[2,9],[2,10],[3,10],[3,11],[4,11],[4,12],[5,12],[5,13],[0,13],[1,2],[4,5]];
  var lineSvg = lines.map(function(pair){
    var a = nodes[pair[0]], b = nodes[pair[1]];
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(255,255,255,.14)" stroke-width="1"/>`;
  }).join("");
  var dotSvg = nodes.map(function(p){ return `<circle class="axiom-dot" cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${p.c}" style="animation-delay:${p.d}"/>`; }).join("");
  return `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="axiomCoreGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#5fd4f4" stop-opacity=".35"/><stop offset="60%" stop-color="#6d4fe0" stop-opacity=".12"/><stop offset="100%" stop-color="#6d4fe0" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle class="axiom-core" cx="200" cy="200" r="130" fill="url(#axiomCoreGrad)"/>
    <circle cx="200" cy="200" r="150" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1"/>
    <g class="axiom-ring1"><ellipse cx="200" cy="200" rx="150" ry="42" fill="none" stroke="rgba(167,139,250,.5)" stroke-width="1.1"/></g>
    <g class="axiom-ring2"><ellipse cx="200" cy="200" rx="150" ry="70" fill="none" stroke="rgba(95,212,244,.48)" stroke-width="1.1"/></g>
    <g class="axiom-ring3"><ellipse cx="200" cy="200" rx="150" ry="100" fill="none" stroke="rgba(255,255,255,.24)" stroke-width="1"/></g>
    <g class="axiom-ring4"><ellipse cx="200" cy="200" rx="150" ry="128" fill="none" stroke="rgba(167,139,250,.3)" stroke-width="1"/></g>
    <g class="axiom-ring5"><ellipse cx="200" cy="200" rx="120" ry="150" fill="none" stroke="rgba(95,212,244,.22)" stroke-width="1"/></g>
    ${lineSvg}
    ${dotSvg}
  </svg>`;
}
/* ---------------- AXIOM LANDING PAGE ---------------- */
/* ---------------- LANDING PAGE (split layout) ----------------
   LandingPage
   ├─ HeroSection: BrandHeader · HeroCopy · FeatureGrid · HeroPhotography · Quote · TrustIndicators
   └─ LoginSection: AxiomBrand · LoginCard · LoginBenefits · closing message */
function axi(n){
  var i = {
    user:'<circle cx="12" cy="8" r="3.8" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    lock:'<rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.2 10.5V7.8a3.8 3.8 0 017.6 0v2.7" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    shieldO:'<path d="M12 2.8l7.5 2.8v5.6c0 4.6-3.2 8.3-7.5 10-4.3-1.7-7.5-5.4-7.5-10V5.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.6 12l2.4 2.4 4.4-4.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    dealer:'<circle cx="8.6" cy="8.6" r="2.7" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="15.6" cy="8.6" r="2.7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 18.5c0-3 2.4-4.8 5.6-4.8 1.4 0 2.6.3 3.4.9.8-.6 2-.9 3.4-.9 3.2 0 5.6 1.8 5.6 4.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    barsO:'<path d="M5 20v-5M10.5 20V9M16 20V4M2.5 20.5h19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    shield:'<path d="M12 2.5l8 3v6.2c0 5-3.4 8.9-8 10.6-4.6-1.7-8-5.6-8-10.6V5.5z" fill="currentColor"/><path d="M8.4 12.2l2.5 2.5 4.7-4.9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    bolt:'<path d="M13.5 2L4.5 13.5h6l-1.5 8.5 9-11.5h-6z" fill="currentColor"/>',
    bars:'<rect x="4" y="12" width="3.6" height="8" fill="currentColor"/><rect x="10.2" y="7" width="3.6" height="13" fill="currentColor"/><rect x="16.4" y="3" width="3.6" height="17" fill="currentColor"/>',
    people:'<circle cx="8" cy="8" r="3.3" fill="currentColor"/><circle cx="16.6" cy="8.6" r="2.8" fill="currentColor"/><path d="M1.8 20.5c0-3.8 2.8-6.2 6.2-6.2s6.2 2.4 6.2 6.2zM13.6 20.5c.2-2.3 1.7-4.1 3.7-4.7 2.6.2 4.9 2 4.9 4.7z" fill="currentColor"/>',
    gear:'<path fill-rule="evenodd" fill="currentColor" d="M12 2l1.8 2.7 3.2-.7.6 3.2 2.8 1.7-1.5 2.9 1.5 2.9-2.8 1.7-.6 3.2-3.2-.7L12 22l-1.8-2.7-3.2.7-.6-3.2-2.8-1.7 1.5-2.9-1.5-2.9 2.8-1.7.6-3.2 3.2.7zM12 8.4a3.6 3.6 0 100 7.2 3.6 3.6 0 000-7.2z"/>',
    target:'<circle cx="11" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="11" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M11 13L21 3M16 3h5v5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
  }[n];
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${i}</svg>`;
}
/* AXIOM lockup: the A monogram carries a blue lightning swoosh and reads as
   the first letter, followed by "XIOM". tone = "light" (on dark) or "dark". */
function axMark(tone){
  var a = tone === "light" ? "#ffffff" : tone === "blue" ? `url(#lga${tone})` : "#0b1426";
  var w = tone === "blue" ? "#5cc8ff" : `url(#lg${tone})`;
  return `<svg class="lp2-mark" viewBox="0 0 132 110" aria-hidden="true">
      <defs><linearGradient id="lg${tone}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0a55e6"/><stop offset="1" stop-color="#2f9bff"/></linearGradient>
      <linearGradient id="lga${tone}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0a4fe0"/><stop offset="1" stop-color="#1f8cff"/></linearGradient></defs>
      <path d="M4 106L50 6h24l50 100h-27L62 38 31 106z" fill="${a}"/>
      <path d="M14 92L74 70l-8-9 62-24-42 32 12 4-56 24z" fill="${w}"/>
    </svg>`;
}
/* Mahanex wordmark, shown as MAHAN-EX (the name itself is written Mahanex): MAHAN in steel (chrome on dark), EX in the accent. tone = "blue"/"dark" (light page) or "light" (dark page). */
function axLogo(tone){
  return `<div class="lp2-logo mx-wm ${tone === "light" ? "on-dark" : "on-light"}" role="img" aria-label="Mahanex"><span class="mx-mahan">MAHAN</span><span class="mx-dash" aria-hidden="true"></span><span class="mx-ex">EX</span></div>`;
}
/* Decorative geometric "A" — pure SVG, no raster image. */
function axGeoA(){
  var dots=""; for (var r=0;r<12;r++) for (var c=0;c<9;c++) dots += `<circle cx="${1552+c*11}" cy="${220+r*18}" r="1.5"/>`;
  return `<svg class="axl-geo" viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="gW1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfe0f7" stop-opacity="0"/><stop offset=".5" stop-color="#bcd5f5" stop-opacity=".7"/><stop offset="1" stop-color="#cfe0f7" stop-opacity="0"/></linearGradient>
      <linearGradient id="gW2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset="1" stop-color="#cfe1f8" stop-opacity=".5"/></linearGradient>
    </defs>
    <path d="M0 560 C300 640 700 900 1100 930 L0 941 Z" fill="url(#gW2)" opacity=".8"/>
    <path d="M1672 120 C1560 300 1450 700 900 941 L1672 941 Z" fill="#d9e8fb" opacity=".45"/>
    <path d="M1672 60 C1600 260 1500 620 1100 941" stroke="#ffffff" stroke-width="2" fill="none" opacity=".9"/>
    <path d="M0 590 C420 640 900 860 1180 941" stroke="url(#gW1)" stroke-width="1.5" fill="none"/>
    <path d="M0 640 C420 700 900 880 1300 941" stroke="url(#gW1)" stroke-width="1.5" fill="none"/>
    <path d="M0 170 C60 230 120 330 130 460" stroke="#ffffff" stroke-width="2" fill="none" opacity=".9"/>
    <path d="M1672 720 C1400 700 1100 780 700 941" stroke="#ffffff" stroke-width="2.5" fill="none" opacity=".9"/>
    <g fill="#9fbde6" opacity=".55">${dots}</g>
  </svg>`;
}
function axLanding(cardHtml){
  var feats = [
    ["gear","F&amp;I Operations","Simplify. Automate.<br>Close Faster."],
    ["bars","Performance","Real Data.<br>Real Growth."],
    ["people","Team","Empower People.<br>Build Success."],
    ["target","Growth","Drive More<br>Profitability."]
  ].map(function(f){ return `<div class="axl-feat"><span class="ic">${axi(f[0])}</span><b>${f[1]}</b><em>${f[2]}</em></div>`; }).join("");
  var trust = [["shield","Secure"],["bolt","Reliable"],["bars","Built for Dealers"],["people","Always Improving"]]
    .map(function(t){ return `<span class="axl-t">${axi(t[0])}<span>${t[1]}</span></span>`; }).join("");
  return `<div class="axl">
    <div class="axl-bg" aria-hidden="true">${axGeoA()}</div>
    <header class="axl-head">
      <div class="axl-brand" aria-label="Mahanex">
        <div class="axl-lockup">${axLogo("blue")}</div>
        <p class="axl-desc">Management AI for Human Advancement &amp; Next-gen EXecution</p>
        <div class="axl-sig" role="img" aria-label="by Rahul Champaneri"><span>by Rahul Champaneri</span></div>
      </div>
      <nav class="axl-nav" aria-label="Principles"><span>People</span><i></i><span>Process</span><i></i><span>Performance</span><i></i><span>Profit</span></nav>
    </header>
    <main class="axl-main">
      <section class="axl-hero">
        <div class="axl-label"><span>Dealership Command</span><i></i></div>
        <h1>Smarter Tools.<br><em>Stronger Dealerships.</em></h1>
        <p class="axl-lead">Everything you need to manage F&amp;I, track performance and empower your team — in one place.</p>
      </section>
      <section class="axl-side">${cardHtml}</section>
    </main>
    <div class="axl-feats">${feats}</div>
    <footer class="axl-foot">
      <div class="axl-trust">${trust}</div>
      <div class="axl-tagline"><i></i><span>From FSM&#39;s Mind to FSM&#39;s Desk</span></div>
    </footer>
    ${state.ui.toast ? `<div class="axl-toast ${state.ui.toast.kind==="err"?"err":""}" role="status">${esc(state.ui.toast.msg)}</div>` : ""}
  </div>`;
}
function renderLogin(){
  var err = state.ui.loginError, checking = !!state.ui.authChecking;
  var remember = true; try { remember = localStorage.getItem("axiom_remember") !== "0"; } catch (e) {}
  var benefits = `<div class="axl-ben"><div>${axi("shield")}<span>Secure<br>Access</span></div><div>${axi("people")}<span>Dealer<br>Focused</span></div><div>${axi("bars")}<span>Greater<br>Tomorrow</span></div></div>`;
  var forgotCard = `<div class="axl-card">
        <h2>Reset your password</h2>
        <p class="axl-sub">Enter your work email and we'll send you a reset link.</p>
        ${state.ui.forgotMsg ? `<div class="axl-ok" role="status">${esc(state.ui.forgotMsg)}</div>` : ""}
        <div class="axl-field">${axi("user")}<input type="text" id="resetEmail" placeholder="Email" autocomplete="email" spellcheck="false" aria-label="Email"></div>
        <button type="button" class="axl-btn" data-act="do-reset" ${state.ui.forgotBusy ? "disabled" : ""}>${state.ui.forgotBusy ? "Sending…" : "Send reset link"}</button>
        <p class="axl-sub" style="margin:14px 0 0;font-size:12px">Salespeople: ask your manager to reset your password.</p>
        <div class="axl-row" style="justify-content:center;margin:12px 0 0"><a class="axl-link" data-act="back-login">Back to sign in</a></div>
      </div>`;
  var card = checking
    ? `<div class="axl-card axl-wait"><div class="axl-spin"></div><h2>Signing you in</h2><p class="axl-sub">Restoring your secure session…</p></div>`
    : state.ui.forgot ? forgotCard
    : `<div class="axl-card">
        <h2>Welcome Back</h2>
        <p class="axl-sub">Sign in to Dealership Command</p>
        ${err ? `<div class="axl-err" role="alert">${esc(err)}</div>` : ""}
        <div class="axl-field">${axi("user")}<input type="text" id="loginEmail" placeholder="Email or username" autocomplete="username" spellcheck="false" aria-label="Email or username"></div>
        <div class="axl-field">${axi("lock")}<input type="password" id="loginPassword" placeholder="Password" autocomplete="current-password" aria-label="Password">
          <button type="button" class="axl-eye" data-act="toggle-pw" aria-label="Show or hide password">${axi("eye")}</button></div>
        <div class="axl-row"><label class="axl-check"><input type="checkbox" id="loginRemember" ${remember ? "checked" : ""}><span class="bx"></span>Remember me</label>
          <a class="axl-link" data-act="forgot-password">Forgot password?</a></div>
        <button type="button" class="axl-btn" data-act="do-login">Sign In</button>
        ${benefits}
      </div>`;
  return axLanding(card);
}

