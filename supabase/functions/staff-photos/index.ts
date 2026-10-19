// Staff photos for the Showroom TV podium: reads a public staff / "meet our team" page and lists the pictures
// on it with the words around each one, so the app can propose which photo belongs to which salesperson.
// The General Manager approves every match in the app before anything is saved.
// Actions (General Manager of that dealership, or Master Administrator):
//   scan  : { dealershipId, url }  -> { images: [{ src, alt, file, before, after }] }
//   image : { dealershipId, url }  -> { dataUrl }   (one picture, so the browser can crop it; size-capped)
// Only public https pages are fetched: private / internal addresses are refused and redirects are re-checked.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MAX_PAGE = 3 * 1024 * 1024;
const MAX_IMG = 4 * 1024 * 1024;
const UA = "Mozilla/5.0 (compatible; MahanexDealershipCommand/1.0; staff photo import)";

function privateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") || l.startsWith("::ffff:192.168.") || l.startsWith("::ffff:169.254.");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => isNaN(n))) return true;
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
}
async function checkUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("That doesn't look like a web address."); }
  if (u.protocol !== "https:") throw new Error("Use the page's https:// address.");
  if (u.username || u.password) throw new Error("That web address isn't allowed.");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) throw new Error("That web address isn't allowed.");
  if (u.port && u.port !== "443") throw new Error("That web address isn't allowed.");
  const ips: string[] = [];
  for (const t of ["A", "AAAA"] as const) { try { ips.push(...await Deno.resolveDns(h, t)); } catch { /* none of that type */ } }
  if (!ips.length) throw new Error("That website couldn't be found.");
  if (ips.some(privateIp)) throw new Error("That web address isn't allowed.");
  return u;
}
async function safeFetch(raw: string, accept: string, limit: number): Promise<{ res: Response; bytes: Uint8Array; url: URL }> {
  let url = await checkUrl(raw);
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en-CA,en;q=0.8" }, signal: AbortSignal.timeout(15000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await checkUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`The website answered with an error (${res.status}).`);
    const len = Number(res.headers.get("content-length") || 0);
    if (len > limit) throw new Error("That file is too large.");
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = []; let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); throw new Error("That file is too large."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total); let o = 0;
    for (const c of chunks) { bytes.set(c, o); o += c.length; }
    return { res, bytes, url };
  }
  throw new Error("The website redirected too many times.");
}
function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const plain = (html: string) => decode(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp("[\\s\"']" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? "") : "";
}

function scanPage(html: string, base: URL) {
  const out: { src: string; alt: string; file: string; before: string; after: string }[] = [];
  const tags: { idx: number; end: number; tag: string }[] = [];
  const re = /<img\b[^>]*>/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && tags.length < 600) tags.push({ idx: m.index, end: m.index + m[0].length, tag: m[0] });
  const seen = new Set<string>();
  tags.forEach((t, i) => {
    let src = attr(t.tag, "data-src") || attr(t.tag, "data-lazy-src") || attr(t.tag, "data-original") || attr(t.tag, "src");
    if (!src || src.startsWith("data:")) {
      const ss = attr(t.tag, "data-srcset") || attr(t.tag, "srcset");
      if (ss) src = ss.split(",").map((x) => x.trim().split(/\s+/)[0]).filter(Boolean).pop() || "";
    }
    if (!src || src.startsWith("data:")) return;
    let abs: URL; try { abs = new URL(src, base); } catch { return; }
    if (abs.protocol !== "https:") return;
    const file = decodeURIComponent(abs.pathname.split("/").pop() || "").replace(/[-_.]+/g, " ");
    if (/\.(svg|gif|ico)(\?|$)/i.test(abs.pathname) || /(^|[^a-z])(logo|icon|sprite|banner|badge|flag|arrow|spacer|pixel|placeholder|facebook|twitter|instagram|youtube|google)([^a-z]|$)/i.test(abs.pathname + " " + attr(t.tag, "class"))) return;
    const w = Number(attr(t.tag, "width")), h = Number(attr(t.tag, "height"));
    if ((w && w < 60) || (h && h < 60)) return;
    if (seen.has(abs.href)) return; seen.add(abs.href);
    const prevEnd = i ? tags[i - 1].end : Math.max(0, t.idx - 1500);
    const nextIdx = i + 1 < tags.length ? tags[i + 1].idx : Math.min(html.length, t.end + 1500);
    out.push({
      src: abs.href,
      alt: (attr(t.tag, "alt") + " " + attr(t.tag, "title")).trim().slice(0, 120),
      file: file.slice(0, 80),
      before: plain(html.slice(Math.max(prevEnd, t.idx - 1500), t.idx)).slice(-160),
      after: plain(html.slice(t.end, Math.min(nextIdx, t.end + 1500))).slice(0, 160),
    });
  });
  return out.slice(0, 300);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "You're signed out. Sign in again." }, 401);
    const { data: me } = await admin.from("profiles").select("id,role,dealership_id,active,cc_enabled").eq("id", u.user.id).single();
    if (!me || !me.active || me.cc_enabled === false) return json({ error: "Not allowed." }, 403);
    const body = await req.json();
    const dealer = String(body.dealershipId || "");
    const allowed = me.role === "Master Administrator" || (me.role === "General Manager" && me.dealership_id === dealer);
    if (!allowed) return json({ error: "Only the General Manager can import staff photos." }, 403);
    const action = String(body.action || "");

    if (action === "scan") {
      const { res, bytes, url } = await safeFetch(String(body.url || "").trim(), "text/html,application/xhtml+xml", MAX_PAGE);
      if (!/html|xml/i.test(res.headers.get("content-type") || "text/html")) return json({ error: "That address isn't a web page." }, 400);
      const html = new TextDecoder().decode(bytes);
      const images = scanPage(html, url);
      return json({ ok: true, images, page: url.href });
    }
    if (action === "image") {
      const { res, bytes } = await safeFetch(String(body.url || "").trim(), "image/jpeg,image/png,image/webp,image/*;q=0.8", MAX_IMG);
      const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return json({ error: "That picture isn't a JPG, PNG or WebP." }, 400);
      return json({ ok: true, dataUrl: `data:${type};base64,${toBase64(bytes)}` });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || "Something went wrong." }, 400);
  }
});
