import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* Branded password-reset email for AXIOM apps (sent through Resend, not Supabase's default mailer).
   Public endpoint: it never says whether an address is registered. */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const APPS = {
  command: { name: "AXIOM Command Center", url: "https://finance.rahulchamp.ca/" },
  pulse: { name: "AXIOM Pulse", url: "https://pulse.rahulchamp.ca/" },
} as const;
const FROM_ADDRESS = "no-reply@rahulchamp.ca";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function emailHtml(appName: string, link: string, first: string) {
  return `<!doctype html><html><body style="margin:0;background:#eef2f8;font-family:Arial,Helvetica,sans-serif;color:#0b1b3a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f8;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dbe4f0">
<tr><td style="background:#1f4a86;padding:26px 30px">
  <div style="font-size:26px;font-weight:800;letter-spacing:.16em;color:#ffffff">AXIOM</div>
  <div style="font-size:11px;letter-spacing:.14em;color:#c9d9f0;margin-top:6px;text-transform:uppercase">${esc(appName)}</div>
</td></tr>
<tr><td style="padding:30px 30px 8px">
  <div style="font-size:20px;font-weight:700;margin-bottom:12px">Reset your password</div>
  <div style="font-size:14.5px;line-height:1.6;color:#33456a">Hi ${esc(first)}, we received a request to reset the password for your ${esc(appName)} account. Click the button below to choose a new one.</div>
</td></tr>
<tr><td style="padding:18px 30px 6px" align="left">
  <a href="${link}" style="display:inline-block;background:#1a72e8;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:9px">Reset password</a>
</td></tr>
<tr><td style="padding:14px 30px 26px">
  <div style="font-size:12.5px;line-height:1.6;color:#5a6b88">This link works for 1 hour and can be used once. If you didn't ask for this, you can ignore this email — your password won't change.</div>
</td></tr>
<tr><td style="background:#f5f8fc;padding:16px 30px;border-top:1px solid #e3eaf4">
  <div style="font-size:11px;color:#7a8aa6;letter-spacing:.04em">AXIOM · AI eXecutive Intelligence &amp; Operations Management</div>
</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const done = () => json({ ok: true });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const app = body.app === "pulse" ? "pulse" : "command";
    if (!/^\S+@\S+\.\S+$/.test(email) || email.endsWith("@pulse.local")) return done();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: p } = await admin.from("profiles").select("*").ilike("email", email.replace(/[%_\\]/g, (m) => "\\" + m)).maybeSingle();
    if (!p || p.role === "Salesperson" || p.active === false) return done();
    if (app === "command" && p.cc_enabled === false) return done();
    if (app === "pulse" && p.pulse_enabled === false) return done();

    // One reset email per minute per account.
    const { data: uu } = await admin.auth.admin.getUserById(p.id);
    if (!uu?.user?.email) return done();
    const last = uu.user.recovery_sent_at ? Date.parse(uu.user.recovery_sent_at) : 0;
    if (Date.now() - last < 60_000) return done();

    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "recovery", email: uu.user.email, options: { redirectTo: APPS[app].url },
    });
    const actionLink = link?.properties?.action_link;
    if (error || !actionLink) { console.error("generateLink failed", error?.message); return done(); }

    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) { console.error("RESEND_API_KEY is not set"); return done(); }
    const first = String(p.name || "there").split(" ")[0];
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${APPS[app].name} <${FROM_ADDRESS}>`,
        to: [uu.user.email],
        subject: "Reset your AXIOM password",
        html: emailHtml(APPS[app].name, actionLink, first),
        text: `Hi ${first},\n\nReset your ${APPS[app].name} password: ${actionLink}\n\nThis link works for 1 hour. If you didn't ask for this, ignore this email.\n\nAXIOM`,
      }),
    });
    if (!res.ok) console.error("Resend rejected the email", res.status, await res.text());
    return done();
  } catch (e) {
    console.error("request-password-reset error", (e as Error).message);
    return done();
  }
});
