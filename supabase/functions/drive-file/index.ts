// Google Drive sync for the Sales Tracker: reads a dealership's Excel sales logs from Google Drive, read-only.
// A Google service account (secret GOOGLE_SERVICE_ACCOUNT = its JSON key) is shared on each file as a Viewer.
// Actions:
//   info  : the service account's email address (to share the files with) - GM / Master
//   check : name and last-changed time of a Drive file, to confirm it's shared - GM / Master
//   fetch : the file itself (base64), unless it hasn't changed since `since` - Master, the store's GM, or a
//           Sales Manager with the Sales Tracker switch; only files listed in that dealership's driveSync.files
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_BYTES = 15 * 1024 * 1024;

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
type SA = { client_email: string; private_key: string };
function serviceAccount(): SA | null {
  try { const sa = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT") || ""); return sa && sa.client_email && sa.private_key ? sa : null; } catch { return null; }
}
async function googleToken(sa: SA): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + claim)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + head + "." + claim + "." + b64url(sig),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw new Error("Google sign-in failed (" + (j.error_description || j.error || res.status) + "). Check the service account key.");
  return j.access_token;
}
async function driveMeta(token: string, id: string, email: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,modifiedTime,size&supportsAllDrives=true`, { headers: { Authorization: "Bearer " + token } });
  if (res.status === 404 || res.status === 403) throw new Error(`Google Drive won't open that file. Share it with ${email} (Viewer) and check the link.`);
  if (!res.ok) throw new Error("Google Drive returned an error (" + res.status + ").");
  return await res.json() as { id: string; name: string; mimeType: string; modifiedTime: string; size?: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "You're signed out. Sign in again." }, 401);
    const { data: me } = await admin.from("profiles").select("id,name,role,dealership_id,active,cc_enabled").eq("id", u.user.id).single();
    if (!me || !me.active || me.cc_enabled === false) return json({ error: "Not allowed." }, 403);

    const body = await req.json();
    const action = String(body.action || "");
    const dealer = String(body.dealershipId || "");
    const master = me.role === "Master Administrator";
    const gm = master || (me.role === "General Manager" && me.dealership_id === dealer);
    const { data: d } = await admin.from("dealerships").select("data").eq("id", dealer).single();
    if (!d) return json({ error: "Dealership not found." }, 404);
    const sync = (d.data && d.data.driveSync) || {};
    const switched = (k: string) => !!(d.data && d.data.fmAccess && d.data.fmAccess[me.id] && d.data.fmAccess[me.id][k] === true);
    const sa = serviceAccount();
    if (!sa) return json({ error: "Google Drive sync isn't set up on the server yet (no service account key).", configured: false }, 503);

    if (action === "info"){
      if (!gm) return json({ error: "Only the General Manager can set up Google Drive sync." }, 403);
      return json({ ok: true, email: sa.client_email });
    }
    const fileId = String(body.fileId || "").trim();
    if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return json({ error: "That doesn't look like a Google Drive file link." }, 400);
    const gtoken = await googleToken(sa);
    if (action === "check"){
      if (!gm) return json({ error: "Only the General Manager can set up Google Drive sync." }, 403);
      const meta = await driveMeta(gtoken, fileId, sa.client_email);
      return json({ ok: true, meta });
    }
    if (action === "fetch"){
      const canSync = gm || (me.role === "Sales Manager" && me.dealership_id === dealer && switched("sales"));
      if (!canSync) return json({ error: "Not allowed to sync this dealership's sales log." }, 403);
      if (!sync.on || !(sync.files || []).some((f: { id: string }) => f.id === fileId)) return json({ error: "That file isn't set up for Google Drive sync." }, 403);
      const meta = await driveMeta(gtoken, fileId, sa.client_email);
      if (body.since && body.since === meta.modifiedTime) return json({ ok: true, unchanged: true, meta });
      if (Number(meta.size || 0) > MAX_BYTES) return json({ error: "That file is over 15 MB." }, 400);
      const url = meta.mimeType === "application/vnd.google-apps.spreadsheet"
        ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`
        : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
      const res = await fetch(url, { headers: { Authorization: "Bearer " + gtoken } });
      if (!res.ok) return json({ error: "Google Drive wouldn't send the file (" + res.status + ")." }, 502);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_BYTES) return json({ error: "That file is over 15 MB." }, 400);
      return json({ ok: true, meta, data: toBase64(bytes) });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error("drive-file failed", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
