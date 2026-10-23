"use strict";
/* ---------------- USERS ---------------- */
/* Users & access: a clean list; clicking a person opens their user card, where every change to
   that account is made (role, dealership, what they can use, Pulse, password, status). */
function userAccessTags(u){
  var pulse = `<span class="tag ${u.pulseOn ? "ok" : ""}">Pulse · ${u.pulseOn ? "Full" : "Off"}</span>`;
  if (u.role === "Salesperson") return pulse;
  var cc = !u.ccOn ? `<span class="tag">Dealership Command · Off</span>`
    : u.demo ? `<span class="tag demo">Dealership Command · Demo${u.expiresAt ? " until " + esc(new Date(u.expiresAt).toLocaleDateString("en-CA",{month:"short",day:"numeric"})) : ""}</span>`
    : `<span class="tag ok">Dealership Command · Full</span>`;
  return cc + " " + pulse;
}
/* Account status across both apps: Dealership Command (ccOn) and Mahan-EX Pulse (pulseOn). */
function userStatus(u){
  if (u.role === "Master Administrator") return { cls:"ok", txt:"Active" };
  if (u.role === "Salesperson") return u.pulseOn ? { cls:"ok", txt:"Active" } : { cls:"danger", txt:"No access" };
  if (u.ccOn && u.pulseOn) return { cls:"ok", txt:"Active" };
  if (u.ccOn) return { cls:"ok", txt:"Dealership Command only" };
  if (u.pulseOn) return { cls:"warn", txt:"Pulse only" };
  return { cls:"danger", txt:"No access" };
}
/* Roles a Master or General Manager can switch someone between. Salespeople sign in with a
   username instead of an email, so they aren't converted here. */
var CHANGEABLE_ROLES = [["FSM","Finance Manager"],["Sales Manager","Sales Manager"],["General Manager","General Manager"]];
function userCanUseSummary(u){
  if (u.role === "General Manager" || u.role === "Master Administrator") return `<span class="muted">Everything</span>`;
  if (u.role === "Sales Manager"){
    var on = V.SM_FEATURES.filter(function(f){ return V.featureOn(u, f.key); }).map(function(f){ return f.key === "insights" ? "Dashboard" : f.label; });
    return `<span class="muted">${on.length ? esc(on.join(" + ")) : "Nothing switched on"}</span>`;
  }
  if (!V.isFinanceRole(u.role)) return `<span class="muted">Pulse only</span>`;
  var off = V.FM_FEATURES.filter(function(f){ return !V.featureOn(u, f.key); });
  if (!off.length) return `<span class="muted">Everything</span>`;
  return `<span class="tag" title="Turned off: ${esc(off.map(function(f){ return f.label; }).join(", "))}">${V.FM_FEATURES.length - off.length} of ${V.FM_FEATURES.length}</span>`;
}
function viewUsers(scope){
  var hq = scope === "hq";
  var isFsmOnly = V.isFinanceManager();
  var canEdit = V.isAdmin() || isFsmOnly;
  /* Salespeople are Pulse-only accounts, so they're left out of the GM/Master list; a Finance
     Manager's own view is the exception, since that's where they manage their salespeople. */
  var rows = V.storeUsers().filter(function(u){
    if (u.id === "u0") return false;
    if (hq) return !u.dealershipId;
    if (u.dealershipId !== state.activeDealershipId) return false;
    return isFsmOnly ? u.role === "Salesperson" : u.role !== "Salesperson";
  }).map(function(u){
    var dealer = u.dealershipId ? V.dealershipById(u.dealershipId).name : "All dealerships";
    return `<tr class="u-row" data-act="user-card" data-user="${u.id}" title="Open ${esc(u.name)}'s card">
      <td><button type="button" class="u-name" data-act="user-card" data-user="${u.id}">${esc(u.name)}</button><div class="tiny muted">${u.username ? "@" + esc(u.username) : esc(u.email)}</div></td>
      <td>${esc(V.roleLabel(u.role))}${u.demo ? ` <span class="tag demo">DEMO</span>` : ""}${u.mustChange ? ` <span class="tag warn">Temp password</span>` : ""}</td>
      <td>${esc(dealer)}</td>
      <td>${userCanUseSummary(u)}</td>
      <td class="nowrap">${userAccessTags(u)}</td>
      <td>${(function(){ var st = userStatus(u); return `<span class="tag ${st.cls}">${st.txt}</span>`; })()}</td>
      <td class="right"><span class="u-open" aria-hidden="true">›</span></td></tr>`;
  }).join("");
  var count = (rows.match(/class="u-row"/g) || []).length, storeName = state.config ? state.config.name : "";
  return `<div class="card"><div class="card-h"><h2>${hq ? "Head-office users" : esc(storeName) + " · " + count + (count === 1 ? " person" : " people")}</h2>
    <div class="sp">${canEdit?"":`<span class="tag warn">Only a general manager can change access</span>`}
      <button class="btn primary" data-act="user-new" ${canEdit?"":"disabled"}>${hq ? "Add a user" : "Add a user to this store"}</button></div></div>
    <div class="card-b">
      <p class="muted small" style="margin:0 0 14px;line-height:1.55">${hq ? "People who aren't tied to one dealership, such as Master administrators. Each store's staff are listed inside that store, under Manage › Users &amp; access." : "Only this dealership's people. A Master can move someone to another store from their card."} A General Manager and Finance Managers work inside one dealership. Invite users by email — they set their own password from a link in the invite. A demo user has the full functionality of their role until the expiry you set, and sees a notice and countdown each time they sign in.</p>
      <p class="small" style="margin:-6px 0 12px"><strong>Click a person</strong> to open their card and change their access.</p>
      <div class="tablewrap"><table class="u-table"><thead><tr><th>User</th><th>Role</th><th>Dealership</th><th>Can use</th><th>Access</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="tiny muted" style="margin:10px 0 0;text-align:right">App build ${esc(window.DCC_BUILD || "")}</p></div></div>`;
}
/* The user card: every change to one account in one place. */
function userCardModal(){
  var id = state.ui.userCard;
  if (!id) return "";
  var u = state.users.filter(function(x){ return x.id === id; })[0];
  if (!u){ state.ui.userCard = null; return ""; }
  var isFsmOnly = V.isFinanceManager(), canEdit = V.isAdmin() || isFsmOnly;
  var me = u.id === state.currentUserId, master = u.role === "Master Administrator";
  var dealer = u.dealershipId ? V.dealershipById(u.dealershipId).name : "All dealerships";
  var cur = V.isFinanceRole(u.role) ? "FSM" : u.role;
  var roleField = (V.isAdmin() && !me && !master && u.role !== "Salesperson" && CHANGEABLE_ROLES.some(function(r){ return r[0] === cur; }))
    ? `<select data-act="change-role" data-user="${u.id}">${CHANGEABLE_ROLES.map(function(r){ return `<option value="${r[0]}" ${cur === r[0] ? "selected" : ""}>${r[1]}</option>`; }).join("")}</select>`
    : `<div class="uc-val">${esc(V.roleLabel(u.role))}</div>`;
  var dealerField = (V.isMaster() && !master)
    ? `<select data-act="assign-dealership" data-user="${u.id}">${state.dealerships.map(function(d){ return `<option value="${d.id}" ${u.dealershipId===d.id?"selected":""}>${esc(d.name)}</option>`; }).join("")}</select>`
    : `<div class="uc-val">${esc(dealer)}</div>`;
  var features = "";
  if (V.isFinanceRole(u.role)){
    var here = u.dealershipId === state.activeDealershipId;
    features = `<div class="uc-sec"><h3>What they can use</h3>
      ${here ? `<div class="uc-feats">${V.FM_FEATURES.map(function(f){ var on = V.featureOn(u, f.key);
        return `<label class="uc-feat ${on ? "on" : ""}"><span>${esc(f.label)}</span>
          <span class="uc-sw"><input type="checkbox" data-act="fm-feature" data-user="${u.id}" data-feature="${f.key}" ${on ? "checked" : ""} ${V.isAdmin() ? "" : "disabled"}><i></i></span></label>`; }).join("")}</div>
        <p class="tiny muted" style="margin:8px 0 0">Changes apply straight away; anything switched off disappears from their menu.</p>`
      : `<p class="small muted" style="margin:0">Open ${esc(dealer)} from Dealerships to change what they can use there.</p>`}</div>`;
  } else if (u.role === "Sales Manager"){
    var shere = u.dealershipId === state.activeDealershipId;
    features = `<div class="uc-sec"><h3>What they can use</h3>
      ${shere ? `<div class="uc-feats">${V.SM_FEATURES.map(function(f){ var on = V.featureOn(u, f.key);
          return `<label class="uc-feat ${on ? "on" : ""}"><span>${esc(f.label)}<small>${esc(f.sub)}</small></span>
          <span class="uc-sw"><input type="checkbox" data-act="fm-feature" data-user="${u.id}" data-feature="${f.key}" ${on ? "checked" : ""} ${V.isAdmin() ? "" : "disabled"}><i></i></span></label>`; }).join("")}</div>
        <p class="tiny muted" style="margin:8px 0 0">Off until you turn it on. The database checks the same switches, so a hidden screen can't be reached another way.</p>`
        : `<p class="small muted" style="margin:0">Open ${esc(dealer)} from Dealerships to change what they can use there.</p>`}</div>`;
  } else if (u.role === "General Manager" || master){
    features = `<div class="uc-sec"><h3>What they can use</h3><p class="small muted" style="margin:0">Everything in Dealership Command for ${master ? "every dealership" : esc(dealer)}.</p></div>`;
  }
  var accessBtns = (u.demo && V.isMaster() ? `<button class="btn sm" data-act="demo-extend" data-user="${u.id}">Extend demo</button>
      <button class="btn sm primary" data-act="demo-convert" data-user="${u.id}">Make full access</button>` : "");
  var sw = function(app, label, on, sub, can){
    return `<label class="uc-feat ${on ? "on" : ""} ${can ? "" : "off"}"><span>${label}<small>${sub}</small></span>
      <span class="uc-sw"><input type="checkbox" data-act="uc-app" data-app="${app}" data-user="${u.id}" ${on ? "checked" : ""} ${can ? "" : "disabled"}><i></i></span></label>`; };
  var ccSub = !u.ccOn ? "Off" : u.demo ? "Demo" + (u.expiresAt ? " until " + new Date(u.expiresAt).toLocaleDateString("en-CA",{month:"short",day:"numeric"}) : "") : "Full access";
  var appSwitches = master ? `<p class="small muted" style="margin:0">The Master Administrator always has both apps.</p>`
    : `<div class="uc-feats">
        ${u.role === "Salesperson" ? "" : u.role === "Sales Manager" ? sw("cc", "Dealership Command", u.ccOn, (u.ccOn ? "On" : "Off") + " · follows the switches above (on while Sales Tracker, Dashboard or Worksheet is on)", false) : sw("cc", "Dealership Command", u.ccOn, ccSub, canEdit && !isFsmOnly && !me)}
        ${sw("pulse", "Mahan-EX Pulse", u.pulseOn, u.pulseOn ? "Full access" : "Off", canEdit && !me && (!isFsmOnly || u.role === "Salesperson"))}</div>
      ${!u.ccOn && !u.pulseOn && u.role !== "Salesperson" ? `<p class="tiny" style="margin:8px 0 0;color:var(--danger)">Both apps are off, so they can't sign in at all.</p>`
        : `<p class="tiny muted" style="margin:8px 0 0">Each app is separate: turning Dealership Command off leaves Pulse working, and the other way round.</p>`}`;
  return `<div class="modal-bg" data-act="user-card-close"><div class="modal ucard" role="dialog" aria-label="${esc(u.name)}">
    <div class="modal-h"><div class="uc-who"><div class="avatar">${esc(u.initials || "?")}</div><div><h2>${esc(u.name)}</h2>
      <div class="tiny muted">${u.username ? "@" + esc(u.username) : esc(u.email)}</div></div></div>
      <div class="sp">${(function(){ var st = userStatus(u); return `<span class="tag ${st.cls}">${st.txt}</span>`; })()}<button class="btn" data-act="user-card-close">Close</button></div></div>
    <div class="modal-b">
      <div class="uc-grid"><label class="f"><span>Role</span>${roleField}</label><label class="f"><span>Dealership</span>${dealerField}</label></div>
      ${features}
      <div class="uc-sec"><h3>Apps they can sign in to</h3>${appSwitches}
        ${accessBtns ? `<div class="uc-btns">${accessBtns}${u.demo && u.expiresAt ? ` <span class="tiny muted">Dealership Command demo ends ${esc(new Date(u.expiresAt).toLocaleString("en-CA",{dateStyle:"medium",timeStyle:"short"}))}</span>` : ""}</div>` : ""}</div>
      <div class="uc-sec"><h3>Account</h3><div class="uc-btns">
        <button class="btn sm" data-act="user-setpw" data-user="${u.id}" ${canEdit?"":"disabled"}>Reset password</button>
        <span style="flex:1"></span>
        <button class="btn sm danger" data-act="user-delete" data-user="${u.id}" ${canEdit&&!me&&!master?"":"disabled"}>Remove user</button></div></div>
    </div></div></div>`;
}
function userModal(){
  if (!state.ui.userForm) return "";
  var fsmMode = V.currentUser().role === "FSM";
  return `<div class="modal-bg" data-act="close-modal-bg"><div class="modal" style="max-width:640px">
    <div class="modal-h"><h2>Invite a user</h2><div class="sp">
      <button class="btn" data-act="user-cancel">Cancel</button>
      <button class="btn primary" data-act="user-save">Create user</button></div></div>
    <div class="modal-b">
      <div class="inline">
        <label class="f"><span>Full name</span><input type="text" data-uf="name" placeholder="e.g. Alexis Nadeau"></label>
        <label class="f"><span>Role</span><select data-uf="role" ${fsmMode?"disabled":""}>
          ${fsmMode ? "<option>Salesperson</option>" : `<option value="FSM">Finance Manager</option><option>General Manager</option><option>Salesperson</option>
          ${V.isMaster()?"<option>Master Administrator</option>":""}`}</select></label>
      </div>
      <div class="inline">
        <label class="f" id="ufEmailBox"><span>Email</span><input type="text" data-uf="email" placeholder="name@dealership.ca" autocapitalize="off"></label>
        <label class="f" id="ufUserBox" style="display:none"><span>Username</span><input type="text" data-uf="username" placeholder="e.g. alexis.n" autocapitalize="off" autocorrect="off"></label>
        <label class="f"><span>Dealership</span><select data-uf="dealership" ${V.isMaster() && !state.ui.hq ? "disabled" : ""}>
          ${state.dealerships.map(function(d){ return `<option value="${d.id}" ${d.id===state.activeDealershipId?"selected":""}>${esc(d.name)}</option>`; }).join("")}</select></label>
      </div>
      <label class="f" id="ufPwBox" style="display:none"><span>Temporary password (at least 8 characters)</span>
        <div class="inline" style="gap:8px"><input type="text" data-uf="password" placeholder="At least 8 characters" autocomplete="off" spellcheck="false"><button type="button" class="btn sm" data-act="uf-genpw">Generate</button></div></label>
      <div id="ufAccessBox">
        <div class="divider"></div>
        <div class="f"><span>Dealership Command access</span>
          <div class="chiprow">
            <button type="button" class="btn sm on" data-act="uf-access" data-val="full">Full access</button>
            <button type="button" class="btn sm" data-act="uf-access" data-val="demo">Demo (time limited)</button>
          </div><input type="hidden" data-uf="access" value="full"></div>
        <div id="ufDemoBox" class="f" style="display:none"><span>Demo ends</span>
          ${wheelPicker(state.ui.inviteSel || (state.ui.inviteSel = defaultWheelSel(Date.now() + 7*86400000)), "invite")}
        </div>
        <label class="switch" style="margin:10px 0 6px"><input type="checkbox" data-uf="pulse" checked> Also give Mahan-EX Pulse access (same login)</label>
        <label class="switch"><input type="checkbox" data-uf="invite" checked> Email them an invite with a link to set their own password</label>
      </div>
      <p class="small muted" id="ufNote" style="margin-bottom:0"></p>
    </div></div></div>`;
}
/* Show only the fields that apply: a Salesperson has a username and a password you share;
   everyone else has an email and, by default, an invite link to set their own password. */
function syncUserForm(){
  var root = document.querySelector(".modal");
  if (!root) return;
  var roleEl = root.querySelector('[data-uf="role"]'), inv = root.querySelector('[data-uf="invite"]');
  var sp = !!roleEl && roleEl.value === "Salesperson", emailing = !sp && !!(inv && inv.checked);
  function show(id, on){ var e = root.querySelector(id); if (e) e.style.display = on ? "" : "none"; }
  show("#ufEmailBox", !sp); show("#ufUserBox", sp); show("#ufPwBox", !emailing); show("#ufAccessBox", !sp);
  var note = root.querySelector("#ufNote");
  if (note) note.textContent = sp
    ? "A Salesperson signs in to Mahan-EX Pulse with a username and this password. Share both with them yourself; they can't be emailed."
    : emailing ? "They'll get an email with a button to set their own password, then sign in and get a short welcome walkthrough."
    : "No email will be sent. Share the temporary password with them; they'll choose their own the first time they sign in.";
}
function saveUser(){
  var root = document.querySelector(".modal");
  if (!root) return;
  function f(k){ var el = root.querySelector('[data-uf="'+k+'"]'); return el ? el : null; }
  var name = f("name").value.trim(), pw = f("password").value.trim();
  var role = f("role").value;
  var wantInvite = role !== "Salesperson" && !!(f("invite") && f("invite").checked);
  if (!name){ toast("Enter the user's name.","err"); return; }
  /* When emailing an invite the person sets their own password, so we use a random placeholder one. */
  if (wantInvite && !pw) pw = genTempPassword() + "!9";
  if (pw.length < 8){ toast("The temporary password needs at least 8 characters.","err"); return; }
  var payload = { action:"create", password:pw, name:name, role:role,
    dealership_id: role === "Master Administrator" ? null : (f("dealership").value || null) };
  if (role === "Salesperson"){
    var usernameEl = f("username");
    var username = usernameEl ? usernameEl.value.trim().toLowerCase() : "";
    if (!/^[a-z0-9._-]{3,30}$/.test(username)){ toast("Username must be 3-30 characters: letters, numbers, dots, underscores or hyphens only.","err"); return; }
    payload.username = username;
  } else {
    var emailEl = f("email");
    var email = emailEl ? emailEl.value.trim().toLowerCase() : "";
    if (!/^\S+@\S+\.\S+$/.test(email)){ toast("Enter a valid email address.","err"); return; }
    payload.email = email;
  }
  var access = f("access").value;
  var expDate = wheelDate(state.ui.inviteSel || defaultWheelSel(Date.now() + 7*86400000));
  if (access === "demo" && !(expDate.getTime() > Date.now())){ toast("Pick a demo end date and time in the future.","err"); return; }
  payload.access_type = access;
  payload.expires_at = access === "demo" ? expDate.toISOString() : null;
  var pulseBox = f("pulse");
  payload.pulse_enabled = role === "Salesperson" ? true : !!(pulseBox && pulseBox.checked);
  payload.cc_enabled = role !== "Salesperson";
  payload.app = "command";
  var inviteBox = f("invite");
  payload.send_invite = wantInvite;
  toast("Creating user…","info");
  adminCall(payload)
  .then(function(r){
    state.ui.userForm = false;
    var first = name.split(" ")[0];
    if (role !== "Salesperson"){
      inviteSecret = { title:"User created", first:first, email:payload.email, password:pw, url:"https://finance.rahulchamp.ca/", emailed:!!(r && r.invite_sent), setOwn:wantInvite };
    } else toast("User created — share the temporary username and password with " + first + ".","ok");
    refreshUsers(); commit(); })
  .catch(function(e){ toast(e.message, "err"); });
}

