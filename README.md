# LocalSpend

[![Deploy PWA to GitHub Pages](https://github.com/JellyPenguinnn/local_spend/actions/workflows/pages.yml/badge.svg)](https://github.com/JellyPenguinnn/local_spend/actions/workflows/pages.yml)

LocalSpend is a local-first spending tracker for fast daily expense entry, monthly calendar review, category summaries, budgets, and recurring bill reminders. It is designed for personal use: clean, private, ad-free, and simple enough to use every day.

- Live PWA: [https://jellypenguinnn.github.io/local_spend/](https://jellypenguinnn.github.io/local_spend/)
- Main platform: iPhone-friendly PWA and macOS Tauri desktop app
- Default currency/date context: SGD and Singapore-style daily tracking
- Current release tag: `v1.0.1`

## Features

- **Today**: see today's total, add spending quickly, edit or delete entries, and record due bills.
- **Natural quick add**: type spending naturally, such as `yakun 5.70 paynow`, then confirm the draft before saving.
- **Calendar**: review monthly daily totals, select a day, and add or edit entries for that date.
- **Summary**: view monthly total, budget progress, category donut chart, and category-level spending details.
- **Bills**: create recurring bills or subscriptions with daily, weekly, monthly, or annual cadence.
- **Settings**: manage currency, light/dark mode, accent colors, wallpapers, bills, categories, payment methods, and data controls.
- **Data controls**: CSV import/export, JSON backup/restore, and safe local spending reset.
- **Custom look**: choose calm accent colors and import up to 5 local wallpapers.

## Privacy

LocalSpend is intentionally not a SaaS product.

- No ads, telemetry, analytics, cloud login, subscription, or payment features.
- Spending data stays local to the device/profile where it is entered.
- The PWA stores data in that browser/PWA install. Each friend's phone has separate local data.
- The macOS Tauri app stores each local profile in its own SQLite database.
- Imported wallpapers are stored locally with the active profile.
- Cloud AI provider settings are not exposed in the simplified v1 UI. Manual entry and local parsing work without cloud AI.

See [docs/PRIVACY.md](docs/PRIVACY.md) for the fuller privacy model.

## Tech Stack

- Tauri 2 for the macOS desktop shell
- React 19, TypeScript, and Vite for the frontend
- SQLite for desktop local persistence
- Browser local storage fallback for the hosted PWA
- Recharts for the category donut chart
- Vitest for unit tests
- ESLint for linting
- GitHub Actions and GitHub Pages for PWA deployment

## Install On iPhone

1. Open [https://jellypenguinnn.github.io/local_spend/](https://jellypenguinnn.github.io/local_spend/) in Safari.
2. Tap Share.
3. Tap **Add to Home Screen**.
4. Open LocalSpend from the new Home Screen icon.

The installed PWA does not depend on your Mac being awake. Data is stored locally on that iPhone, so deleting the PWA or clearing Safari website data can remove local data unless you export or back it up first.

## Local Development

### Prerequisites

- Node.js 22 or newer
- npm
- Rust and Cargo for Tauri desktop development
- macOS for macOS app or DMG builds

### Setup

```bash
npm install
```

Run the browser dev app:

```bash
npm run dev
```

Run the Tauri desktop app:

```bash
npm run tauri:dev
```

Preview the production web build on your local network:

```bash
npm run build
npm run preview:mobile
```

Do not add a trailing slash to the script name. Use `npm run preview:mobile`, not `npm run preview:mobile/`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server on `127.0.0.1:1420`. |
| `npm run tauri:dev` | Start the macOS Tauri app in development mode. |
| `npm run build` | Typecheck and build the production web app into `dist/`. |
| `npm run preview` | Preview the production build locally. |
| `npm run preview:mobile` | Preview the production build on `0.0.0.0:4173` for iPhone testing on the same network. |
| `npm run lint` | Run ESLint with zero warnings allowed. |
| `npm run test` | Run Vitest unit tests. |
| `npm run test:watch` | Run Vitest in watch mode. |

## Build

Build the web/PWA assets:

```bash
npm run build
```

Build a macOS app bundle:

```bash
npm run tauri -- build --bundles app
```

Build a macOS DMG:

```bash
npm run tauri -- build --bundles dmg
```

Unsigned local macOS builds may need Gatekeeper approval when shared. For wider macOS distribution, configure Apple Developer signing and notarization.

## GitHub Pages Deployment

The repository includes a GitHub Pages workflow at [.github/workflows/pages.yml](.github/workflows/pages.yml).

On pushes to `main`, GitHub Actions:

1. Installs dependencies with `npm ci`.
2. Runs lint, tests, and production build.
3. Builds with `VITE_BASE_PATH=/local_spend/`.
4. Publishes `dist/` to GitHub Pages.

GitHub Pages should use **GitHub Actions** as its source. After deployment, the PWA is available at:

```text
https://jellypenguinnn.github.io/local_spend/
```

## Data Model

Desktop profile data follows this layout under the app data directory:

```text
profiles.json
profiles/
  <profile-id>/
    localspend.sqlite
    backups/
    exports/
```

`profiles.json` stores profile metadata only. Spending records live in the active profile database. In browser/PWA mode, the app uses browser storage instead of SQLite so it can run from GitHub Pages.

## Data Controls

LocalSpend includes profile-scoped data controls in Settings:

- Export expenses as CSV.
- Import expenses from CSV.
- Create a JSON backup.
- Restore from a JSON backup.
- Reset local spending data after confirmation.

Back up before deleting the PWA, clearing Safari website data, resetting the app, or switching devices.

## Project Structure

```text
.
├── .github/workflows/      # GitHub Pages deployment
├── docs/                   # Product, privacy, research, and decisions
├── public/                 # PWA manifest and static assets
├── src/
│   ├── components/         # Shared UI components
│   ├── lib/                # Dates, money, NLP parsing, data, recurring logic
│   └── screens/            # Today, Calendar, Summary, Settings
├── src-tauri/              # Tauri shell, Rust commands, SQLite persistence
├── package.json
└── README.md
```

## Quality Checks

Run these before shipping changes:

```bash
npm run lint
npm run test
npm run build
```

For desktop changes, also run:

```bash
cd src-tauri
cargo test
```

## Known Limitations

- PWA data is local to the browser/PWA install and does not sync across phones.
- Browser/PWA storage is not a replacement for encrypted cloud backup; use JSON backup/export for important data.
- The hosted PWA uses browser storage, while the macOS Tauri app uses SQLite.
- Native iOS App Store/TestFlight distribution is not part of v1.
- Cloud AI provider setup is disabled in the simplified v1 UI; natural quick add uses local parsing.
- No license file has been added yet.

## Documentation

- [Product Spec](docs/PRODUCT_SPEC.md)
- [Privacy](docs/PRIVACY.md)
- [Architecture Decisions](docs/DECISIONS.md)
- [Research Notes](docs/research.md)
