# Mahanex rebrand prompt (for Ansh, Pulse and Flow)

Paste the prompt below into Claude Code inside each project. Change only the first line for each project:

- Ansh: `PRODUCT NAME: Mahanex Ansh`
- Pulse: `PRODUCT NAME: Mahanex Pulse`
- Flow: `PRODUCT NAME: Mahanex Flow`

---

PRODUCT NAME: Mahanex Pulse

Rebrand this app from AXIOM to **Mahanex**. AXIOM is being dropped (another company holds AXIOM trademarks in dealership software). Do the whole rebrand in one pass, then show me what changed.

**The brand**
- Company / family brand: **Mahanex** (from my parents Mahendra and Hansa; "Mahan" means great in Hindi). Always written "Mahanex" in text, never "MaHanEX", "Mahan-ex" or "MAHANEX" in sentences.
- This app's full name is the PRODUCT NAME above. Where the old app said "AXIOM <Something>" or "Axiom <Something>", use the PRODUCT NAME. The sister apps are: Mahanex Dealership Command (was "AXIOM Command Center"), Mahanex Pulse (was "AXIOM Pulse"), Mahanex Flow, Mahanex Ansh. Update any mention of them to the new names.
- Logo = a wordmark only, **shown as MAHAN-EX**: MAHAN, a short designed dash, then EX, with the dash and EX in the accent colour. No symbol, no circle. Font: Sora ExtraBold (800), letter-spacing about 0.09em. The hyphen is visual only: in text, domains, emails and the app name it is always "Mahanex".
- Accent colour for EX and the dash: gold on dark backgrounds; on light pages use the page's own primary colour so the logo blends in (Dealership Command uses its headline blue #0A6CF0).
- Small spaces (app icon, favicon, avatar): **MX**, M in chrome and X in gold, on midnight navy (#0B1430), rounded square.
- Tagline: "Great minds, built with AI."
- Acronym (for an About / footer line): "Management AI for Human Advancement & Next-gen EXecution".
- Colours: Midnight #0B1430 · Steel navy #1E2B4D · Chrome #D4E1F7 · Gold #F0B94A · Paper #F6F8FC. Don't restyle the whole app; only brand surfaces (logo, header, sign-in, splash, emails, icons) take these.

**Wordmark code (adapt to this project's framework)**

HTML:
```html
<span class="mx-wm on-light" role="img" aria-label="Mahanex"><span class="mx-mahan">MAHAN</span><span class="mx-dash" aria-hidden="true"></span><span class="mx-ex">EX</span></span>
```
Use `on-dark` instead of `on-light` on dark backgrounds.

CSS (load Sora 700/800 from Google Fonts: `https://fonts.googleapis.com/css2?family=Sora:wght@700;800&display=swap`):
```css
.mx-wm{display:inline-flex;align-items:baseline;gap:0;font-family:"Sora",system-ui,sans-serif;font-weight:800;letter-spacing:.09em;line-height:1}
.mx-wm .mx-mahan,.mx-wm .mx-ex{-webkit-background-clip:text;background-clip:text;color:transparent}
.mx-wm.on-light .mx-mahan{background-image:linear-gradient(180deg,#1d3263 0%,#0b1b3a 100%)}
.mx-wm.on-light .mx-ex{background-image:linear-gradient(180deg,#1a86ff 0%,#0a6cf0 100%)} /* or gold: #f6c560 -> #e3a52f -> #c98a12 */
.mx-wm .mx-dash{display:inline-block;width:.34em;height:.11em;margin:0 .1em 0 .02em;border-radius:.06em;align-self:center;transform:translateY(-.04em)}
.mx-wm.on-light .mx-dash{background:linear-gradient(90deg,#1a86ff,#0a6cf0)}
.mx-wm.on-dark .mx-dash{background:linear-gradient(90deg,#ffd27a,#e3a52f)}
.mx-wm.on-dark .mx-mahan{background-image:linear-gradient(180deg,#ffffff 0%,#d4e1f7 42%,#4f6c9c 52%,#e7efff 100%)}
.mx-wm.on-dark .mx-ex{background-image:linear-gradient(180deg,#fff6d6 0%,#ffd27a 42%,#a6650a 53%,#ffe29a 100%)}
```
Plain-text or email fallback (no gradients): `MAHAN<span style="color:#F0B94A">-EX</span>` in white on #0B1430, or in #1E2B4D on white.

On a light background MAHAN should match the page's main heading colour (navy #0B1B3A) and EX plus the dash take the page's primary accent (or a clean gold, never brown).

App icon / favicon: use exactly this SVG (also save it as `icons/mx.svg`):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B1430"/><text x="32" y="43" text-anchor="middle" font-family="Sora,Montserrat,Arial Black,Arial,sans-serif" font-weight="800" font-size="28" letter-spacing="0.5"><tspan fill="#DBE5F8">M</tspan><tspan fill="#F0B94A">X</tspan></text></svg>
```
PNG sizes (32, 180, 192, 512): render a page with a full #0B1430 background and "MX" in Sora 800 (M #DBE5F8, X #F0B94A) at about 46% of the width, e.g. with headless Edge/Chrome `--headless=new --window-size=N,N --screenshot`. Add to the HTML head: `<link rel="icon" type="image/svg+xml" href="icons/mx.svg">`, `<link rel="icon" type="image/png" sizes="32x32" href="icons/mx-32.png">`, `<link rel="apple-touch-icon" href="icons/mx-180.png">`, `<meta name="theme-color" content="#0B1430">`. Ready-made files are in the Dealership Command repo (github.com/rahul9997ai/dealership-command-center, branch main, folder `icons/`: mx.svg, mx-32.png, mx-180.png, mx-192.png, mx-512.png); copying them is the easiest route. Otherwise generate an SVG: a #0B1430 rounded square (corner radius about 22% of the size) with "MX" centred in Sora 800, M in #DBE5F8 and X in #F0B94A, and use it for the favicon, apple-touch-icon and PWA manifest icons (regenerate PNG sizes if the project has them). Update the manifest `name`/`short_name` to the PRODUCT NAME / "Mahanex".

**What to change**
1. Search the whole repo (case-insensitive) for `axiom`, `AXIOM`, `Axiom`, and the old product names. Change every user-visible place: page titles and `<title>`, headers, sign-in and sign-up screens, splash/loading screens, onboarding/tour text, empty states, toasts, settings/about pages, footers, PWA manifest, app store / meta descriptions, open-graph tags, README, printed or exported documents (PDF/CSV headers), and emails.
2. Replace any old AXIOM logo (SVG, image or text) with the Mahanex wordmark above; replace old icons with the MX icon.
3. **Do not rename internal identifiers** that would break things or log people out: localStorage/sessionStorage keys (e.g. `axiom_theme`, `axiom_remember`), cookie names, CSS class names and ids that aren't user-visible, database table/column names, environment variable names, API routes, storage bucket names, file/folder names. Leave those exactly as they are, and tell me which ones you left.
4. Code comments can be updated where they describe the product name, but that's optional.

**Shared backend (important)**
- If this project uses the shared Supabase project `tbptlrewwxhggxxfdiks`: the Edge Functions `admin-users` and `request-password-reset` are **already rebranded and deployed** from the Dealership Command repo (admin-users version 28, request-password-reset version 21). Do NOT redeploy them from this repo unless you first pull the deployed code (Supabase `get_edge_function`), apply your change on top of it, and diff, because an older local copy would undo the rebrand and other changes. Ideally don't touch them at all.
- Any other email or SMS this app sends from its own functions: update the sender name, subject, header (MAHAN-EX: white MAHAN and gold -EX on #0B1430) and sign-off to Mahanex / the PRODUCT NAME.

**Check and ship**
- Run the project's tests/build. Open the app (dev server or preview) and check: sign-in screen, main screen header, dark and light mode if it has both, and one email template if it has any.
- Grep again for `axiom` and list every remaining hit with why it stays (internal key, etc.).
- Bump the version/build number if the project has one, commit with a clear message, and deploy the same way this project is normally deployed. Tell me the live URL to check.
