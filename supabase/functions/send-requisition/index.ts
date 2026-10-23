// Payout Request: emails the finished requisition to the signed-in person's OWN inbox (never to anyone else), so they can
// forward it to accounting with their scans. The PAD form, when there is one, rides along as a PDF attachment.
// Allowed: Master, the store's General Manager, or anyone the GM switched "Payout Request" on for. No AI, no extra cost
// (Resend, the same sender as the password emails). At most 20 emails per person per hour.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const FROM_ADDRESS = "no-reply@rahulchamp.ca";
const MAX_HTML = 200_000, MAX_ATTACH = 3_000_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "You're signed out. Sign in again." }, 401);
    const { data: me } = await admin.from("profiles").select("id,name,role,dealership_id,email,active,cc_enabled").eq("id", u.user.id).single();
    if (!me || !me.active || me.cc_enabled === false) return json({ error: "Not allowed." }, 403);

    const body = await req.json();
    const dealer = String(body.dealershipId || "");
    const master = me.role === "Master Administrator";
    let ok = master;
    let dealerName = "Dealership Command";
    if (!master) {
      const { data: d } = await admin.from("dealerships").select("data").eq("id", dealer).single();
      if (!d || me.dealership_id !== dealer) return json({ error: "Not allowed." }, 403);
      const acc = d.data && d.data.fmAccess && d.data.fmAccess[me.id];
      ok = me.role === "General Manager" || (acc && acc.payout === true);
      dealerName = String((d.data && d.data.name) || dealerName);
    }
    if (!ok) return json({ error: "Payout Request isn't switched on for you." }, 403);

    const to = String(u.user.email || me.email || "").trim();
    if (!/^\S+@\S+\.\S+$/.test(to) || to.toLowerCase().endsWith("@pulse.local")) return json({ error: "Your account has no email address to send to." }, 400);

    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin.from("payout_requests").select("id", { count: "exact", head: true }).eq("created_by", me.id).gte("emailed_at", since);
    if ((count || 0) >= 20) return json({ error: "That's 20 emails in the last hour. Try again a little later." }, 429);

    const subject = String(body.subject || "").replace(/[\r\n]+/g, " ").slice(0, 300).trim();
    let html = String(body.html || ""), text = String(body.text || "").slice(0, 20_000);
    if (!subject || !html) return json({ error: "Nothing to send." }, 400);
    if (html.length > MAX_HTML) return json({ error: "That email is too large." }, 400);
    html = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "");

    const attachments: { filename: string; content: string }[] = [];
    let total = 0;
    for (const a of (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 4)) {
      const content = String(a.content || ""), filename = String(a.filename || "attachment.pdf").replace(/[^\w.\- ]/g, "_").slice(0, 80);
      total += content.length;
      if (total > MAX_ATTACH) return json({ error: "The attachment is too large." }, 400);
      if (content) attachments.push({ filename, content });
    }

    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "Email isn't set up on the server (no sending key)." }, 503);
    const safeName = dealerName.replace(/[<>"]/g, "").slice(0, 60);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${safeName} via Mahan-EX <${FROM_ADDRESS}>`, to: [to], reply_to: to, subject, html, text, attachments: attachments.length ? attachments : undefined }),
    });
    if (!res.ok) { console.error("Resend rejected the email", res.status, await res.text()); return json({ error: "The email couldn't be sent. Try again in a minute." }, 502); }

    const requestId = String(body.requestId || "");
    if (requestId) await admin.from("payout_requests").update({ emailed_at: new Date().toISOString() }).eq("id", requestId).eq("created_by", me.id);
    const masked = to.replace(/^(.{2}).*(@.*)$/, "$1***$2");
    return json({ ok: true, to: masked });
  } catch (e) {
    console.error("send-requisition", (e as Error).message);
    return json({ error: "Something went wrong." }, 500);
  }
});
