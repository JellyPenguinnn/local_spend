# LocalSpend

LocalSpend is a local-first spending tracker for quick daily entry, monthly calendar review, category summaries, budgets, CSV import/export, JSON backup/restore, and optional privacy-conscious AI helpers. It runs as a macOS Tauri app and has a mobile-first web/PWA layout for iPhone personal use.

It is intentionally not a SaaS product: there are no cloud accounts, ads, subscriptions, telemetry, analytics, or payment features.

## Privacy Model

- Spending data is stored locally.
- Each local profile has its own SQLite database file.
- `profiles.json` stores only profile metadata such as display name and active profile id.
- Import, export, backup, restore, AI requests, and reset actions operate only on the active profile.
- AI is disabled by default. When enabled, monthly AI insights send monthly aggregates only, not the full transaction database.
- API keys are saved through the desktop keyring command when running in Tauri. Browser-only dev fallback keeps keys in local browser storage for convenience and should not be used as secure storage.

## App Data Layout

On macOS the Tauri app stores data under the app data directory using:

```text
profiles.json
profiles/
  <profile-id>/
    localspend.sqlite
    backups/
    exports/
```

For browser-only Vite development, LocalSpend uses a localStorage fallback so the UI remains testable without the desktop shell.

## Setup

Install dependencies:

```bash
npm install
```

Run the web dev UI:

```bash
npm run dev
```

Preview the production web build on your local network for iPhone testing:

```bash
npm run build
npm run preview:mobile
```

Open `http://172.20.10.2:4173/` in Safari on the iPhone when your Mac is on that local IP, then use Share -> Add to Home Screen. The preview command keeps port `4173` fixed; if your Mac gets a different local IP, reserve `172.20.10.2` in your router/hotspot or open the shown network URL instead. For friend testing, host the `dist/` folder on a private HTTPS URL and share that URL.

### GitHub Pages PWA Hosting

This repo includes a GitHub Pages workflow at `.github/workflows/pages.yml`.

For the `JellyPenguinnn/local_spend` repository, pushes to `main` build the app with `VITE_BASE_PATH=/local_spend/` and publish the PWA from `dist/`.

After the first successful workflow run, enable or confirm GitHub Pages in the repository settings with Source set to GitHub Actions. The public PWA URL should be:

```text
https://jellypenguinnn.github.io/local_spend/
```

Open that URL on iPhone Safari, then use Share -> Add to Home Screen. The installed PWA does not depend on your Mac being awake. Each phone stores its own LocalSpend data locally in Safari/browser storage.

Run the Tauri desktop app:

```bash
npm run tauri:dev
```

Run checks:

```bash
npm run lint
npm run test
npm run build
cd src-tauri && cargo test
```

Build a macOS app bundle:

```bash
npm run tauri -- build --bundles app
```

Build a DMG for sharing outside the App Store:

```bash
npm run tauri -- build --bundles dmg
```

Unsigned local builds may need macOS Gatekeeper approval when shared. For wider sharing, sign and notarize the app with an Apple Developer account.

## Main Workflows

1. Create a local profile on first launch.
2. Add spending from Today with amount, date, category, title, remark, and payment method.
3. Review daily totals in Calendar.
4. Review monthly totals, donut chart, budget progress, and concise comments in Summary.
5. Use Settings for appearance, custom wallpapers, recurring bills, categories, and payment methods.

## AI Provider Setup

AI is optional and disabled by default. Supported provider modes:

- `none`
- `ollama-local`
- `gemini`
- `groq`
- `openrouter`

Use Settings to choose a provider, base URL, model, timeout, max tokens, and API key. Ollama defaults to `http://localhost:11434`; cloud providers require your own API key. Model names are editable because provider availability and free tiers change over time.

## Known Limitations

- The browser-only fallback uses localStorage instead of SQLite and is for development convenience only.
- The iPhone/PWA path stores data in that iPhone browser profile; it does not share the macOS SQLite profile database.
- A native iOS build for friends requires Apple's iOS signing/TestFlight-style flow and is separate from the macOS DMG.
- AI calls require network access for cloud providers or a running local Ollama server.
- Builds are unsigned unless you configure Apple signing and notarization.
