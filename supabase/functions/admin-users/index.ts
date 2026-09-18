import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["Master Administrator", "General Manager", "FSM Manager", "FSM"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Not signed in" }, 401);
    const { data: me } = await admin.from("profiles").select("*").eq("id", u.user.id).single();
    if (!me || !me.active || !["Master Administrator", "General Manager"].includes(me.role))
      return json({ error: "Not allowed" }, 403);
    const isMaster = me.role === "Master Administrator";

    const body = await req.json();
    const canTouch = (target: { role: string; dealership_id: string | null }) =>
      isMaster || (target.role !== "Master Administrator" && target.dealership_id === me.dealership_id);

    if (body.action === "list") {
      let q = admin.from("profiles").select("*").order("created_at");
      if (!isMaster) q = q.eq("dealership_id", me.dealership_id);
      const { data, error } = await q;
      if (error) throw error;
      return json({ users: data });
    }

    if (body.action === "create") {
      const { email, password, name, role, dealership_id, access_type, expires_at } = body;
      if (!email || !password || !name || !ROLES.includes(role)) return json({ error: "Missing or invalid fields" }, 400);
      if (String(password).length < 8) return json({ error: "Temporary password must be at least 8 characters" }, 400);
      const target = { role, dealership_id: isMaster ? (dealership_id ?? null) : me.dealership_id };
      if (!canTouch(target)) return json({ error: "Not allowed to create that user" }, 403);
      if (access_type === "demo" && !expires_at) return json({ error: "Demo access needs an expiry" }, 400);
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return json({ error: error.message }, 400);
      const { error: pe } = await admin.from("profiles").insert({
        id: created.user.id, email, name, role, dealership_id: target.dealership_id,
        access_type: access_type === "demo" ? "demo" : "full",
        expires_at: access_type === "demo" ? expires_at : null, must_change_password: true,
      });
      if (pe) { await admin.auth.admin.deleteUser(created.user.id); return json({ error: pe.message }, 400); }
      return json({ ok: true, id: created.user.id });
    }

    const { data: target } = await admin.from("profiles").select("*").eq("id", body.id).single();
    if (!target || !canTouch(target)) return json({ error: "Not allowed" }, 403);

    if (body.action === "update") {
      if (!isMaster && ("access_type" in body || "expires_at" in body))
        return json({ error: "Only the Master Administrator can extend or change demo access" }, 403);
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "role", "active", "access_type", "expires_at", "dealership_id"])
        if (k in body) patch[k] = body[k];
      if (patch.role && !ROLES.includes(patch.role as string)) return json({ error: "Invalid role" }, 400);
      if (!isMaster) { delete patch.dealership_id; if (patch.role === "Master Administrator") return json({ error: "Not allowed" }, 403); }
      if (patch.access_type === "full") patch.expires_at = null;
      const { error } = await admin.from("profiles").update(patch).eq("id", body.id);
      if (error) return json({ error: error.message }, 400);
      if ("active" in patch)
        await admin.auth.admin.updateUserById(body.id, { ban_duration: patch.active ? "none" : "876000h" });
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
      const { error } = await admin.auth.admin.deleteUser(body.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
