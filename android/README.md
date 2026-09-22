# Axiom Flow for Android (Google Play)

The Android app is a **Trusted Web Activity (TWA)**: a small, signed Android
app that opens `https://finance.rahulchamp.ca` full-screen in Chrome, with no
browser bar. There is no second codebase. Every deploy to the website updates
the Android app instantly, the same way it updates the iPhone home-screen app.

## What's in this repo for it

| File | Purpose |
|---|---|
| `manifest.webmanifest` | App name, icons and colours. Android/Chrome read `display_override: standalone`; iPhone Safari only reads `display: browser`, so iPhone home-screen icons keep opening exactly as before. |
| `sw.js`, `offline.html` | Service worker that only adds a "You're offline" page when there's no connection. All requests still go to the network; nothing is cached, so deploys are live immediately. |
| `icons/` | App icons (normal and maskable), plus an `apple-touch-icon` so a *newly added* iPhone home-screen icon shows the AXIOM "A" instead of a page screenshot. |
| `.well-known/assetlinks.json` | Proves to Android that the app and the website belong to the same owner. **You fill in one value (step 5).** Without it, the app shows a Chrome address bar at the top. |
| `.nojekyll` | Makes GitHub Pages publish the `.well-known` folder (Jekyll hides dot-folders by default). |
| `privacy.html`, `delete-account.html` | Privacy policy and account-deletion pages. Google Play requires both URLs. **Replace the `[BRACKETED]` placeholders first.** |
| `android/store/` | Play listing artwork: 512×512 icon and 1024×500 feature graphic. |

Package name (permanent, cannot change after the first upload): **`ca.rahulchamp.axiomflow`**

---

## Step 1: Deploy the site changes

Merge this branch into `main` so GitHub Pages publishes it. Then check that these URLs load:

- https://finance.rahulchamp.ca/manifest.webmanifest
- https://finance.rahulchamp.ca/.well-known/assetlinks.json
- https://finance.rahulchamp.ca/privacy.html

## Step 2: Create the Google Play developer account

1. Go to https://play.google.com/console/signup. Use a Google account you'll keep long-term (ideally a business one, not a personal Gmail you might lose).
2. Pick an account type (see "Personal vs organization" below). Pay the one-time **US$25** fee.
3. Complete identity verification (government ID; organizations also need a D-U-N-S number) and verify a phone number and contact email. Verification can take a few days.

**Personal vs organization**
- **Personal:** fastest to open. New personal accounts must run a **closed test with at least 12 testers opted in for 14 days in a row** before Google lets you publish to production. Dealership staff make good testers.
- **Organization:** requires a registered business and a free **D-U-N-S number** (https://www.dnb.com/duns/get-a-duns.html, can take up to ~30 days). No 12-tester rule. The store shows your business name instead of your personal name.

## Step 3: Build the Android package with PWABuilder

1. Open https://www.pwabuilder.com, enter `https://finance.rahulchamp.ca`, and click **Start**.
2. Click **Package for stores → Android → Generate package**, then open **Options**:
   - **Package ID:** `ca.rahulchamp.axiomflow`
   - **App name:** `Axiom Flow`, **Launcher name:** `Axiom Flow`
   - **Version:** `1.0.0`, **version code:** `1`
   - **Display mode:** `Standalone`
   - **Status bar / nav colour:** `#0c1d33`, **splash background:** `#070c14`
   - **Signing key:** *Create new*. Fill in your name/organization. Choose strong passwords and **save them in a password manager**.
3. Download the zip. It contains:
   - `*.aab`: the file you upload to Google Play
   - `*.apk`: for installing on your own phone to test
   - `signing.keystore` + `signing-key-info.txt`: **your upload key. Back these up in two safe places and never commit them to GitHub.** Every future update must be signed with them. If you lose them, Google can reset the key, but only after a support request.
   - `assetlinks.json`: holds your upload-key fingerprint

## Step 4: Create the app in Play Console

1. **Create app:** name `Axiom Flow`, type **App**, **Free**, and accept the declarations.
2. **Store listing:**
   - Short description (max 80 characters): `The F&I command center for dealership finance teams.`
   - Full description: see the draft below.
   - App icon: `android/store/app-icon-512.png`. Feature graphic: `android/store/feature-graphic.png`.
   - Phone screenshots: at least 2. Take them on an Android phone after installing the test APK, or in Chrome's mobile emulator.
   - Category: **Business**. Contact email: your support email.
3. **App content** (Policy → App content):
   - **Privacy policy:** `https://finance.rahulchamp.ca/privacy.html`
   - **App access:** choose *All or some functionality is restricted*. Give Google's reviewers a working login (create a **Demo** user in Users and access with a long expiry). This is the most common reason login-only apps get rejected.
   - **Ads:** No ads.
   - **Content rating:** fill in the questionnaire (a business app with no user-generated content is rated Everyone).
   - **Target audience:** 18+.
   - **Data safety:** see the answers below.
   - **Account deletion:** `https://finance.rahulchamp.ca/delete-account.html`
   - **Financial features declaration:** if asked, the app does not offer loans or process payments; it only tracks dealership deals.
4. **Testing → Closed testing** (or Internal testing first):
   - Create a release, upload the `.aab`, and accept **Play App Signing**.
   - Add testers' Gmail addresses and share the opt-in link.
   - On a personal account, keep 12+ testers opted in for 14 days, then apply for production access.

## Step 5: Link the app to the website (removes the address bar)

1. In Play Console, go to **Test and release → Setup → App signing** (the exact menu path may differ).
2. Copy the **SHA-256 certificate fingerprint** under *App signing key certificate*.
3. In `.well-known/assetlinks.json`, replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FROM_PLAY_CONSOLE` with that value. Also add the upload-key fingerprint from PWABuilder's `assetlinks.json` as a second entry in the list, so the APK you sideload for testing is verified too:
   ```json
   "sha256_cert_fingerprints": ["AB:CD:…(app signing)…", "12:34:…(upload key)…"]
   ```
4. Deploy, then check with Google's tool:
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://finance.rahulchamp.ca&relation=delegate_permission/common.handle_all_urls`

## Step 6: Production

When testing is done, go to **Production → Create release**, choose the same `.aab` (or a new build), and send it for review. First reviews usually take a few days.

**Updating the app later:** website changes need nothing. Only rebuild in PWABuilder when you change the icon, name, colours or package settings, or when Google raises the required Android version (target API level). When you rebuild: use the same package ID, bump the version code, and sign with the **same** `signing.keystore`.

---

## Data safety form: suggested answers

The answers are based on what the app actually does today. Check them again if features change.

- Does the app collect or share user data? **Yes, collects** (not shared with third parties; service providers such as Supabase do not count as "sharing").
- Encrypted in transit? **Yes.** Can users request deletion? **Yes.**
- Data types:
  - **Personal info → Name, Email address, User IDs:** collected, required, used for *App functionality* and *Account management*.
  - **Financial info → Other financial info** (deal and product amounts about dealership customers): collected, required, used for *App functionality*.
- Not collected: location, contacts, photos, audio, device IDs for ads, web browsing history.

## Full description (draft)

> Axiom Flow is the F&I command center for automotive dealerships. Finance
> managers build and present protection-product menus, show customers a clean
> customer-facing display, and track every deal from signing to delivery.
> Managers see their team's performance at a glance, and salespeople follow
> their customers' deliveries in Axiom Pulse.
>
> Axiom Flow is for dealership staff. Accounts are created by your
> dealership's administrator.

## Known differences inside the Android app

- **Customer Display** opens in a Chrome tab on top of the app, not a separate window. Close it to return to the app.
- **Print** opens Android's print / save-as-PDF sheet.
