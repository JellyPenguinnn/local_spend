# AGENTS.md

This file is the fixed operating contract for Codex working on this repository. Do not modify this file unless the user explicitly asks.

## Mission

Build `LocalSpend`, a local-first macOS spending tracker that is clean, fast, private, ad-free, easy to use, and friendly for personal use.

The app should help the user and their friends track daily spending, review spending by monthly calendar, understand monthly category distribution, and receive short useful spending comments.

This is not a commercial SaaS product. Do not build cloud accounts, subscriptions, ads, analytics, or payment features.

## Default stack

Use this stack unless there is a strong technical blocker:

* Tauri 2 desktop app
* React + TypeScript + Vite frontend
* SQLite local database
* Minimal CSS/Tailwind-style utility styling
* Lightweight chart library such as Recharts
* Vitest for logic/unit tests
* Playwright or equivalent smoke tests if feasible

Do not add heavy dependencies unless they clearly reduce implementation risk.

## Product principles

* Local-first by default.
* No ads.
* No tracking.
* No analytics.
* No telemetry.
* Clean, calm, minimalist UI.
* Main flows must work without AI.
* AI features must be optional, disabled by default, and privacy-conscious.
* Do not upload the full spending database to any AI provider.
* Only send the minimum selected text or monthly aggregate needed for the requested AI feature.
* API keys must never be committed.
* Do not store API keys in plain source files.
* Prefer OS keychain/keyring or local ignored config for development.
* Do not use copyrighted character artwork, logos, names, or assets.
* For “Stitch-like” design, implement only a generic cute blue alien/pastel theme.

## Core app requirements

The finished app must include:

* Daily expense entry:

  * amount
  * date
  * category
  * optional title/merchant
  * optional remark
  * optional payment method
* Category management with sensible defaults.
* Monthly calendar view:

  * daily total visible
  * spending intensity indicator
  * click a day to view/add/edit expenses
* Monthly summary:

  * total spending
  * category breakdown donut chart
  * top categories
  * month-over-month comparison if previous data exists
  * short concise comments
* Search/filter by date, category, text, and amount range.
* Edit/delete expenses safely.
* Recurring expense support for common bills/subscriptions if feasible.
* Budget targets by month and/or category if feasible.
* CSV import/export.
* Local backup/restore as JSON.
* Settings page:

  * currency default SGD
  * theme selection
  * category settings
  * AI provider settings
  * profile management
* Themes:

  * Minimal
  * Soft Color
  * Starlight / 星星人
  * Cute Blue Alien, original and non-copyrighted

## Sharing and profile separation

The app should be shareable with friends for personal use, but it is not a commercial cloud product.

Use a local multi-profile model, not a cloud account system.

Required behavior:

* On first launch, user creates a local profile.
* Each profile has a display name.
* Each profile has its own separate local SQLite database file.
* Switching profiles must never mix spending records.
* The currently active profile should be clearly visible in the UI.
* A profile switcher should be available in the app header or Settings.
* Each profile can have its own:

  * expenses
  * categories
  * budgets
  * recurring rules
  * themes
  * AI settings
  * backup/export files
* Export, import, backup, and restore must operate only on the active profile unless explicitly stated.
* AI requests must only use data from the active profile.
* Never implement a remote login system unless the user explicitly asks later.
* Optional local PIN/password protection may be added, but do not present it as strong security unless proper encryption is implemented.
* If encryption is added, document the design clearly in `docs/PRIVACY.md`.

Preferred storage layout:

```text
app-data/
  profiles.json
  profiles/
    <profile-id>/
      localspend.sqlite
      backups/
      exports/
```

`profiles.json` should store only profile metadata, not spending records.

## Default categories

Create these default categories for each new profile:

* Food & Drinks
* Transport
* Groceries
* Shopping
* Household
* School / Work
* Entertainment
* Health
* Travel
* Bills
* Rent / Housing
* Gifts
* Transfer
* Other

## Default payment methods

Create these default payment methods:

* PayNow
* PayLah
* Apple Pay
* Credit Card
* Debit Card
* Bank Transfer
* Cash
* Other

## AI features

Implement AI only after the core tracker works.

Preferred AI features:

1. Natural language quick add
   Example: “lunch 6.50 at koufu yesterday” becomes a draft expense.

2. Smart categorization
   Suggest category from merchant/title/remark using local rules first, optional AI fallback second.

3. Monthly insight comment
   Generate 2–4 concise, specific observations from monthly aggregates only.

4. Budget suggestion
   Suggest small practical improvements based on category totals and trend.

AI architecture requirements:

* Provider-agnostic interface.
* Supported provider modes:

  * none
  * ollama-local
  * gemini
  * groq
  * openrouter
* Configurable base URL, model, API key, timeout, and max tokens.
* JSON-only model outputs with schema validation.
* Graceful fallback when AI fails.
* Clear UI label when AI is used.
* Never block manual expense entry because AI is unavailable.
* Never send another profile’s data to AI.

## Working discipline

Before coding:

1. Inspect the repository.
2. If empty, scaffold the project.
3. If not empty, understand existing structure before editing.
4. Do focused online research only for current framework/provider/API details.
5. Save concise findings in `docs/research.md`.

During coding:

* Work in small coherent changes.
* Prefer simple, readable code over clever abstractions.
* Keep components small.
* Keep business logic outside UI components where practical.
* Validate money/date/category inputs.
* Use migrations for database schema changes.
* Add tests for non-trivial logic.
* Update `TASKS.md` as work progresses.
* Update `BLOCKERS.md` only for real blockers.
* Update `docs/DECISIONS.md` for major architecture decisions.
* Do not blindly rewrite working code.
* Do not run unrelated commands.
* Do not perform broad refactors unless needed for the task.
* Do not claim success without running checks.

## Verification gates

Do not claim the project is complete until these pass or are honestly reported:

* dependencies install successfully
* app starts in development mode
* TypeScript/type checks pass
* lint/format checks pass if configured
* unit tests pass
* database migration/init works from a clean state
* first-launch profile creation works
* profile switching works
* profile data isolation works
* add/edit/delete expense works
* calendar monthly view works
* donut chart summary works
* deterministic monthly comments work
* CSV export works
* JSON backup/restore works
* AI settings do not commit secrets
* production build succeeds
* README has setup, dev, build, test, and usage instructions

## Final response discipline

When reporting back to the user:

* State what was built.
* State exact commands run.
* State verification results.
* State any known limitations.
* Keep the report concise and useful.
* Do not include long internal reasoning.
