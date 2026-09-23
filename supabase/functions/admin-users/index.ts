import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["Master Administrator", "General Manager", "FSM Manager", "FSM", "Salesperson"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Not signed in" }, 401);
    const { data: me } = await admin.from("profiles").select("*").eq("id", u.user.id).single();
    if (!me || !me.active || !["Master Administrator", "General Manager", "FSM"].includes(me.role))
      return json({ error: "Not allowed" }, 403);
    const isMaster = me.role === "Master Administrator";
    // An FSM can only invite/manage Salesperson accounts in their own dealership
    // (delivery coordination in Axiom Pulse) — everything else stays GM/Master only.
    const isFsmOnly = me.role === "FSM";

    const body = await req.json();
    // Which app is asking? Pulse sends no "app", so fall back to the page's origin.
    const app: "command" | "pulse" = body.app === "pulse" || body.app === "command"
      ? body.app
      : ((req.headers.get("origin") || "").includes("pulse") ? "pulse" : "command");
    const canTouch = (target: { role: string; dealership_id: string | null }) => {
      if (isMaster) return true;
      if (isFsmOnly) return target.role === "Salesperson" && target.dealership_id === me.dealership_id;
      return target.role !== "Master Administrator" && target.dealership_id === me.dealership_id;
    };

    if (body.action === "list") {
      let q = admin.from("profiles").select("*").order("created_at");
      if (!isMaster) q = q.eq("dealership_id", me.dealership_id);
      if (isFsmOnly) q = q.eq("role", "Salesperson");
      const { data, error } = await q;
      if (error) throw error;
      return json({ users: data });
    }

    if (body.action === "create") {
      const { password, name, role, dealership_id, access_type, expires_at } = body;
      if (!password || !name || !ROLES.includes(role)) return json({ error: "Missing or invalid fields" }, 400);
      if (String(password).length < 8) return json({ error: "Temporary password must be at least 8 characters" }, 400);
      if (isFsmOnly && role !== "Salesperson") return json({ error: "FSM can only invite Salesperson accounts" }, 403);

      // Salesperson accounts sign in with a username, not a real email —
      // Supabase Auth still needs an email under the hood, so we generate a
      // hidden one deterministically from the username. The salesperson
      // never sees or uses it; the Pulse sign-in screen maps it back.
      let email: string;
      let username: string | null = null;
      if (role === "Salesperson") {
        username = String(body.username || "").trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
          return json({ error: "Username must be 3-30 characters: letters, numbers, dots, underscores or hyphens only" }, 400);
        }
        const { data: taken } = await admin.from("profiles").select("id").ilike("username", username).maybeSingle();
        if (taken) return json({ error: "That username is already taken" }, 400);
        email = `${username}@pulse.local`;
      } else {
        email = String(body.email || "").trim();
        if (!email) return json({ error: "Missing or invalid fields" }, 400);
      }

      const target = { role, dealership_id: isMaster ? (dealership_id ?? null) : me.dealership_id };
      if (!canTouch(target)) return json({ error: "Not allowed to create that user" }, 403);
      if (target.dealership_id) {
        const { data: dl } = await admin.from("dealerships").select("id").eq("id", target.dealership_id).maybeSingle();
        if (!dl) return json({ error: "That dealership isn't saved in the cloud yet. Wait a few seconds after creating it, refresh, then try again." }, 400);
      }
      // Access per app. Salespeople are Pulse-only; everyone else gets both unless told otherwise.
      const ccEnabled = role === "Salesperson" ? false : body.cc_enabled !== false;
      const pulseEnabled = body.pulse_enabled !== false;
      const ccType = (body.cc_access_type ?? access_type) === "demo" ? "demo" : "full";
      const ccExp = (body.cc_expires_at ?? expires_at) || null;
      if (ccEnabled && ccType === "demo" && !ccExp) return json({ error: "Demo access needs an expiry" }, 400);
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return json({ error: error.message }, 400);
      const { error: pe } = await admin.from("profiles").insert({
        id: created.user.id, email, username, name, role, dealership_id: target.dealership_id,
        cc_enabled: ccEnabled, cc_access_type: ccType, cc_expires_at: ccType === "demo" ? ccExp : null,
        pulse_enabled: pulseEnabled, pulse_access_type: "full", pulse_expires_at: null,
        must_change_password: true,
      });
      if (pe) { await admin.auth.admin.deleteUser(created.user.id); return json({ error: pe.message }, 400); }
      return json({ ok: true, id: created.user.id });
    }

    const { data: target } = await admin.from("profiles").select("*").eq("id", body.id).single();
    if (!target || !canTouch(target)) return json({ error: "Not allowed" }, 403);

    if (body.action === "update") {
      if (!isMaster && ["access_type", "expires_at", "cc_access_type", "cc_expires_at", "pulse_access_type", "pulse_expires_at"].some((k) => k in body))
        return json({ error: "Only the Master Administrator can extend or change demo access" }, 403);
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "role", "dealership_id", "cc_enabled", "cc_access_type", "cc_expires_at", "pulse_enabled", "pulse_access_type", "pulse_expires_at"])
        if (k in body) patch[k] = body[k];
      // Legacy names: access_type / expires_at mean Command Center; "active" means the calling app.
      if ("access_type" in body) patch.cc_access_type = body.access_type;
      if ("expires_at" in body) patch.cc_expires_at = body.expires_at;
      if ("active" in body) patch[app === "pulse" ? "pulse_enabled" : "cc_enabled"] = !!body.active;
      if (patch.role && !ROLES.includes(patch.role as string)) return json({ error: "Invalid role" }, 400);
      if (isFsmOnly && patch.role && patch.role !== "Salesperson") return json({ error: "Not allowed" }, 403);
      if (!isMaster) { delete patch.dealership_id; if (patch.role === "Master Administrator") return json({ error: "Not allowed" }, 403); }
      if (patch.dealership_id) {
        const { data: dl } = await admin.from("dealerships").select("id").eq("id", patch.dealership_id as string).maybeSingle();
        if (!dl) return json({ error: "That dealership doesn't exist in the cloud." }, 400);
      }
      if (patch.cc_access_type === "full") patch.cc_expires_at = null;
      if (patch.pulse_access_type === "full") patch.pulse_expires_at = null;
      const { error } = await admin.from("profiles").update(patch).eq("id", body.id);
      if (error) return json({ error: error.message }, 400);
      // Only block sign-in entirely when neither app has access left.
      if ("cc_enabled" in patch || "pulse_enabled" in patch) {
        const { data: after } = await admin.from("profiles").select("cc_enabled, pulse_enabled").eq("id", body.id).single();
        const anyApp = !!(after && (after.cc_enabled || after.pulse_enabled));
        await admin.auth.admin.updateUserById(body.id, { ban_duration: anyApp ? "none" : "876000h" });
      }
      return json({ ok: true });
    }

    if (body.action === "reset_password") {
      if (!body.password || String(body.password).length < 8) return json({ error: "Temporary password must be at least 8 characters" }, 400);
      const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password });
      if (error) return json({ error: error.message }, 400);
      await admin.from("profiles").update({ must_change_password: true }).eq("id", body.id);
      return json({ ok: true });
    }

    if (body.action === "delete") {
      if (body.id === me.id) return json({ error: "You can't delete yourself" }, 400);
      const { data: tgt } = await admin.from("profiles").select("role, dealership_id, cc_enabled, pulse_enabled").eq("id", body.id).single();
      if (!tgt) return json({ error: "User not found" }, 404);
      if (tgt.role === "Master Administrator") return json({ error: "A master administrator can't be removed" }, 403);
      if (!canTouch(tgt)) return json({ error: "Not allowed" }, 403);

      // Remove from just this app when the person also uses the other one.
      const hereOn = app === "pulse" ? tgt.pulse_enabled : tgt.cc_enabled;
      const otherOn = app === "pulse" ? tgt.cc_enabled : tgt.pulse_enabled;
      if (hereOn && otherOn) {
        const { error: re } = await admin.from("profiles").update({ [app === "pulse" ? "pulse_enabled" : "cc_enabled"]: false }).eq("id", body.id);
        if (re) return json({ error: re.message }, 400);
        return json({ ok: true, revoked: app, kept: true });
      }

      const { error } = await admin.auth.admin.deleteUser(body.id);
      if (error) {
        // Still referenced by other records, so it can't be erased: switch every app off and block sign-in.
        const { error: e2 } = await admin.from("profiles").update({ cc_enabled: false, pulse_enabled: false }).eq("id", body.id);
        if (e2) return json({ error: error.message }, 400);
        await admin.auth.admin.updateUserById(body.id, { ban_duration: "876000h" });
        return json({ ok: true, deactivated: true });
      }
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
