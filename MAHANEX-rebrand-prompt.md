# Mahan-EX rebrand prompt (for Ansh, Pulse and Flow)

Paste the prompt below into Claude Code inside each project (use **Sonnet**, not Opus: `/model` then pick Sonnet). Change only the first line for each project:

- Ansh: `PRODUCT NAME: Mahan-EX Ansh`
- Pulse: `PRODUCT NAME: Mahan-EX Pulse`
- Flow: `PRODUCT NAME: Mahan-EX Flow`

Files used by this prompt (all in the Dealership Command repo, branch main): https://github.com/rahul9997ai/dealership-command-center
Raw base: https://raw.githubusercontent.com/rahul9997ai/dealership-command-center/main/
- `icons/mh.svg` (app icon / favicon), `icons/mh-32.png`, `mh-180.png`, `mh-192.png`, `mh-512.png`
- `icons/mh-mark.svg` (the hexagon logo alone), `icons/mh-lockup.svg` (the logo with circuit lines, for large landing / sign-in screens)
- `js/mh-mark.js` (the same logo as a JavaScript function `mhMark({ traces, icon, label })` that returns inline SVG)

---

PRODUCT NAME: Mahan-EX Pulse

Rebrand this app from AXIOM to **Mahan-EX**. AXIOM is being dropped (another company holds AXIOM trademarks in dealership software). Do the whole rebrand in one pass, then show me what changed. Use the Sonnet model for this work.

**The brand**
- Company / family brand: **Mahan-EX** (from my parents Mahendra and Hansa; "Mahan" means great in Hindi). **Wherever the name is shown to a person, write it as "Mahan-EX"**: page titles, app names, headers, footers, emails (sender name, subject, sign-off), printouts, PDFs, exports, About screens, notifications. Not "Mahanex", "MaHanEX" or "MAHANEX". Only things nobody reads stay as they are: domains (mahanex.ai), code identifiers, file names, storage keys.
- This app's full name is the PRODUCT NAME above. Where the old app said "AXIOM <Something>" or "Axiom <Something>", use the PRODUCT NAME. The sister apps are: Mahan-EX Dealership Command (was "AXIOM Command Center"), Mahan-EX Pulse (was "AXIOM Pulse"), Mahan-EX Flow, Mahan-EX Ansh. Update any mention of them to the new names.
- **Logo = the Mahan-EX hexagon mark** (a chrome hexagon holding a neon M in cyan and H in amber that share a stem, joined by a glowing node on the H's crossbar), **plus the wordmark shown as MAHAN-EX** (MAHAN, a short designed dash, then EX; font Sora ExtraBold 800, letter-spacing about 0.09em). The hyphen is visual only: in text, domains, emails and the app name it is always "Mahan-EX".
- Where the mark goes: sign-in / landing screen (large, left of the wordmark, use the `traces` version), the app header or side menu (small, the mark alone), splash screens, the favicon and app icon. On a light page the mark's dark centre works as is; no extra background needed.
- Wordmark accent colour for EX and the dash: gold on dark backgrounds; on light pages use the page's own primary colour so it blends in (Dealership Command uses its headline blue #0A6CF0).
- Tagline: "Great minds, built with AI."
- Acronym (for an About / footer line): "Machine-Augmented Human Intelligence & eXecution".
- Colours: Midnight #0B1430 · Steel navy #1E2B4D · Chrome #D4E1F7 · Gold #F0B94A · Cyan #52E4FF · Amber #FFB324 · Paper #F6F8FC. Don't restyle the whole app; only brand surfaces (logo, header, sign-in, splash, emails, icons) take these.

**Using the logo**
- Easiest: copy `js/mh-mark.js` into this project (or paste its `mhMark` function into the app's script) and call `mhMark({ traces: true })` for the large version, `mhMark({ label: "" })` for the small decorative one. It returns an `<svg>` string; give it a width in CSS (the height follows).
- If this project can't run that function (static HTML without scripts, server-rendered templates, emails): paste the contents of `icons/mh-mark.svg` or `icons/mh-lockup.svg` inline, or `<img>` them.
- App icon / favicon / PWA: copy `icons/mh.svg` and the four PNGs. Add to the HTML head: `<link rel="icon" type="image/svg+xml" href="icons/mh.svg">`, `<link rel="icon" type="image/png" sizes="32x32" href="icons/mh-32.png">`, `<link rel="apple-touch-icon" href="icons/mh-180.png">`, `<meta name="theme-color" content="#0B1430">`. Update the manifest `name` / `short_name` to the PRODUCT NAME / "Mahan-EX" and its icons to `mh-192.png`, `mh-512.png` and `mh.svg`.

Wordmark HTML:
```html
<span class="mx-wm on-light" role="img" aria-label="Mahan-EX"><span class="mx-mahan">MAHAN</span><span class="mx-dash" aria-hidden="true"></span><span class="mx-ex">EX</span></span>
```
Use `on-dark` instead of `on-light` on dark backgrounds.

Wordmark CSS (load Sora 700/800 from Google Fonts: `https://fonts.googleapis.com/css2?family=Sora:wght@700;800&display=swap`):
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

**What to change**
1. Search the whole repo (case-insensitive) for `axiom`, `AXIOM`, `Axiom`, and the old product names. Change every user-visible place: page titles and `<title>`, headers, sign-in and sign-up screens, splash/loading screens, onboarding/tour text, empty states, toasts, settings/about pages, footers, PWA manifest, app store / meta descriptions, open-graph tags, README, printed or exported documents (PDF/CSV headers), and emails.
2. Replace any old AXIOM logo (SVG, image or text) and the old MX icons with the Mahan-EX hexagon mark and wordmark above; replace old icons with the files in `icons/`.
3. **Do not rename internal identifiers** that would break things or log people out: localStorage/sessionStorage keys (e.g. `axiom_theme`, `axiom_remember`), cookie names, CSS class names and ids that aren't user-visible, database table/column names, environment variable names, API routes, storage bucket names, file/folder names. Leave those exactly as they are, and tell me which ones you left.
4. Code comments can be updated where they describe the product name, but that's optional.

**Shared backend (important)**
- If this project uses the shared Supabase project `tbptlrewwxhggxxfdiks`: the Edge Functions `admin-users` and `request-password-reset` are **already rebranded and deployed** from the Dealership Command repo (admin-users version 29, request-password-reset version 22). Do NOT redeploy them from this repo unless you first pull the deployed code (Supabase `get_edge_function`), apply your change on top of it, and diff, because an older local copy would undo the rebrand and other changes. Ideally don't touch them at all.
- Any other email or SMS this app sends from its own functions: update the sender name, subject, header (MAHAN-EX: white MAHAN and gold -EX on #0B1430) and sign-off to Mahan-EX / the PRODUCT NAME, and the footer line to the acronym above.

**Check and ship**
- Run the project's tests/build. Open the app (dev server or preview) and check: sign-in screen, main screen header, dark and light mode if it has both, and one email template if it has any.
- Grep again for `axiom` and list every remaining hit with why it stays (internal key, etc.).
- Bump the version/build number if the project has one, commit with a clear message, and deploy the same way this project is normally deployed. Tell me the live URL to check.
