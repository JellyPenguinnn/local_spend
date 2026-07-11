# Research Notes

Researched on 2026-07-07.

## Tauri 2 and macOS

- Tauri 2 supports web frontends such as React/Vite and is intended for small native desktop bundles. The official quick start recommends `npm create tauri-app@latest` and documents the Vite flow: https://v2.tauri.app/start/
- Tauri's SQL plugin supports SQLite and migrations, with database paths relative to app config when using the JS plugin: https://v2.tauri.app/plugin/sql/
- For this app, Rust-owned `rusqlite` commands are simpler than exposing SQL directly to the UI because profile database paths must be isolated and explicit.
- Tauri can build macOS `.app` bundles with `tauri build --bundles app`: https://v2.tauri.app/distribute/macos-application-bundle/
- Tauri can build DMG installers with `tauri build --bundles dmg`: https://v2.tauri.app/distribute/dmg/

## SQLite in Tauri

- Official Tauri SQL plugin supports SQLite, MySQL, and PostgreSQL and can run migrations atomically: https://v2.tauri.app/plugin/sql/
- LocalSpend uses SQLite per profile and deterministic initialization/migration from Rust so profile switching cannot accidentally reuse a shared connection string.

## React Chart Option

- Recharts is a React/D3 chart library with native SVG, declarative components, and minimal dependencies; it is suitable for a simple donut chart: https://github.com/recharts/recharts

## AI Provider Options

- Ollama exposes a local HTTP API, defaults to local use, and supports JSON mode or JSON schema via the `format` parameter: https://docs.ollama.com/api and https://github.com/ollama/ollama/blob/main/docs/api.md
- Gemini supports structured JSON output via JSON Schema, and rate limits vary by model and tier; model names should remain user-editable: https://ai.google.dev/gemini-api/docs/structured-output and https://ai.google.dev/gemini-api/docs/rate-limits
- Groq supports structured outputs with strict and best-effort JSON schema modes on supported models: https://console.groq.com/docs/structured-outputs
- OpenRouter supports structured outputs for compatible models using `response_format` with JSON schema, but support varies by model/provider: https://openrouter.ai/docs/guides/features/structured-outputs

## API Key Storage

- Tauri Stronghold is the official secret/key storage plugin option and uses a secret management engine: https://v2.tauri.app/plugin/stronghold/
- Tauri Store is persistent key-value storage, but it is not the right place for raw API keys: https://v2.tauri.app/plugin/store/
- LocalSpend uses OS keyring-backed Tauri commands for desktop API keys and documents the browser fallback as development-only.

## macOS Sharing Basics

- A DMG is the common outside-App-Store sharing format where users drag the app into Applications: https://v2.tauri.app/distribute/dmg/
- For broad sharing, the app should eventually be signed and notarized with Apple tooling; unsigned builds may trigger Gatekeeper warnings.

## iPhone Personal Use and Sharing

- Safari web apps can be configured with web app metadata and launched from the Home Screen, which makes a private hosted web build the lowest-friction iPhone path for personal/friend testing: https://developer.apple.com/documentation/safari-developer-tools/configuring-web-applications
- TestFlight is Apple's supported beta-sharing path for native iOS apps. External tester sharing requires uploading a build to App Store Connect and beta review before public/external testing: https://developer.apple.com/testflight/
- Tauri 2 has iOS mobile target prerequisites, but a native iOS build still needs the Apple/Xcode signing and distribution flow: https://v2.tauri.app/start/prerequisites/#ios
- LocalSpend therefore supports a mobile-first PWA-style web build now, while native iOS/TestFlight can be a later packaging project if needed.

## Spending Tracker UX Inspiration

- PocketGuard is repeatedly described as a straightforward personal option because it gives users a quick central view of available money and spending context instead of starting with dense reports: https://www.techradar.com/best/best-expense-trackers
- YNAB's product idea centers budgeting around simple daily decisions, such as assigning money to jobs and handling overspending flexibly, which supports a calm task-first interface rather than a generic finance dashboard: https://en.wikipedia.org/wiki/YNAB
- Splitwise-style expense apps work well for casual users because the flow is transparent, editable, and focused on one task at a time: https://www.androidcentral.com/apps-software/the-app-splitwise-is-the-best-hack-to-split-group-trip-expenses-in-2026
- LocalSpend should borrow the product patterns, not the visual identity: immediate entry, one clear primary action, friendly microcopy, progressive detail, and compact summary signals.

## Premium Mobile Visual Pass

Researched on 2026-07-08.

- Apple's iOS 26/Liquid Glass direction emphasizes translucent materials, depth, fluid response, and a clear hierarchy between content and controls. LocalSpend should borrow the material feel while keeping enough tint and contrast for readability: https://developer.apple.com/documentation/technologyoverviews/liquid-glass and https://www.theverge.com/news/682636/apple-liquid-design-glass-theme-wwdc-2025
- Later reporting on Liquid Glass feedback highlights that high transparency can hurt readability, so LocalSpend should use frosted materials with stronger surface opacity and contrast rather than fully transparent glass: https://www.businessinsider.com/apple-ios-26-liquid-glass-design-changes-beta-3-2025-7
- Rocket Money foregrounds subscriptions, everyday spending, budgets, and spending insights; Monarch highlights budgets, recurring bills/subscriptions, reports, dashboard, and transactions; Copilot presents budgets, cash flow, and subscription spotting with highly polished compact cards. LocalSpend already has those core local-first concepts, so the visual pass should make them feel calmer and more premium rather than adding more dashboard content: https://www.rocketmoney.com/ , https://www.monarchmoney.com/features , https://www.copilot.money/

## Bills and Subscriptions Logic

Researched on 2026-07-09.

- Rocket Money, Monarch, Copilot, and PocketGuard all present subscriptions or bills as forward-looking recurring items that help users avoid surprises, not as hidden automatic spending imports: https://www.rocketmoney.com/ , https://www.monarchmoney.com/features , https://www.copilot.money/ , https://pocketguard.com/
- YNAB-style scheduled transactions reinforce the idea that recurring items should be visible, reviewable, and user-controlled rather than silently mixed into actual spending: https://support.ynab.com/en_us/scheduled-transactions-a-guide-BygrAIFA9
- LocalSpend therefore uses reminder-first recurring bills: `Start date` defines the cadence pattern, `Next Due` tracks the next unpaid occurrence, exact existing records are skipped, edits do not backfill old history, and `Record bill(s)` records at most one missing occurrence per bill rule per tap.

## Natural Language Spending Entry

Researched on 2026-07-10.

- Finance apps and APIs still store transactions as structured fields: date, payee/title, amount, currency, category, and notes. Lunch Money's transaction object uses fields such as `date`, `payee`, `amount`, `currency`, `category_id`, and `notes`, which maps well to LocalSpend's draft fields: https://lunchmoney.dev/
- Actual Budget's rules show a practical pattern for high-accuracy finance text: clean payee names first, then learn categories from previous user behavior. It also notes automatic rules can rename payees and categorize transactions based on what the user has done before: https://actualbudget.org/docs/budgeting/rules/
- General NLP date parsers such as Chrono and Duckling handle short phrases like today, yesterday, last Friday, 5 days ago, currency/amount, and numerals through deterministic parsers/refiners rather than broad free-form guessing: https://github.com/wanasit/chrono and https://github.com/facebook/duckling
- LocalSpend should keep NLP local-first and lightweight: extract amount/date/payment/category deterministically, strip those slot words from the title, then use active-profile history to learn merchant/title -> category/payment. AI remains optional fallback only.
- A slot-filling approach is a better fit than free-form generation for this app: parse the expense into stable slots (`amount`, `date`, `paymentMethod`, `category`, `description`) and ask the user to confirm before saving. Microsoft Recognizers-Text and Duckling use this style for numbers, dates, and currency-like entities: https://github.com/microsoft/Recognizers-Text and https://github.com/facebook/duckling
- Rule-based matching remains useful for small private domains when the label set is known. spaCy's EntityRuler/Matcher guidance supports pattern-based entity recognition when rules are precise and domain-specific: https://spacy.io/usage/rule-based-matching
- Singapore daily spending needs local aliases: PayNow/PayLah, contactless transport terms such as SimplyGo/EZ-Link, and local merchants such as FairPrice, Sheng Siong, food courts, delivery apps, telcos, and town council payments. Sources: PayNow overview from the Association of Banks in Singapore https://www.abs.org.sg/consumer-banking/pay-now and SimplyGo transit payment context https://www.simplygo.com.sg/
- Final LocalSpend design: normalize text, extract amount while avoiding date-like numbers, parse local dates in Asia/Singapore, detect payment methods only from active profile methods and clear aliases, use weighted category rules with weak generic food words and strong merchant/category words, clean a short `description`, then let active-profile history override weak category guesses. Unknown text falls back to `Other` rather than Food & Drinks.

## Settings and Account Scope

Researched on 2026-07-10.

- Apple's settings guidance reinforces that app settings should be focused, understandable, and connected to actual user-controlled behavior: https://developer.apple.com/design/human-interface-guidelines/settings/
- Material Design coverage emphasizes consistency while still allowing a product to keep its own personality, which supports keeping Settings predictable but not overstuffed: https://www.wired.com/story/android-p-material-design-google-io
- LocalSpend has no remote login, sync, subscription, or cloud identity, so an account settings area would be misleading. The settings tab uses `General` for appearance, currency, wallpaper, and data controls only.
- Local-first software emphasizes user control and local data ownership, so LocalSpend should expose backup/export/restore/reset in the app rather than hiding data portability: https://www.wired.com/story/collaborative-software-wary-cloud and https://en.wikipedia.org/wiki/Local-first_software
- Destructive data actions should use confirmation because they can remove user records; LocalSpend keeps this as an in-app confirmation layer instead of a browser/OS alert: https://en.wikipedia.org/wiki/Confirmation_dialog

## Wallpaper-Aware Theme Layer

Researched on 2026-07-10.

- Apple HIG color/material guidance supports using color to clarify state and hierarchy while keeping text legible; LocalSpend should avoid large saturated color fields and use accent color mainly for actions, selected states, and fine edges: https://developer.apple.com/design/human-interface-guidelines/color and https://developer.apple.com/design/human-interface-guidelines/materials
- Microsoft Mica is a useful reference for wallpaper-aware personalization: it treats wallpaper as the base layer, then puts low-opacity content/card layers above it for hierarchy and readability instead of applying backdrop effects to every element: https://learn.microsoft.com/en-us/windows/apps/design/style/mica
- Material Design 3 color roles reinforce separating neutral surfaces from primary/accent roles. LocalSpend should keep neutral readable surfaces, with selected/action elements using the accent more strongly: https://m3.material.io/styles/color/roles
- Implementation direction: use a frosted `material` layer for panels and rows, a stronger `material-raised` layer for active tabs/date pills, subtle accent borders/shadows for identity, and saturated accent only for primary actions/progress.

## Mixed-Currency Spending

Researched on 2026-07-10.

- BudgetBakers Wallet keeps currencies attached to their original accounts and supports automatic or manually adjusted exchange rates. This confirms that the paid amount should be preserved instead of overwritten by a conversion: https://support.budgetbakers.com/hc/en-us/articles/7149418777746-Multiple-Currencies-Exchange-Rates
- YNAB recommends separate plans for separate currencies, which avoids exchange-rate ambiguity but fragments a single monthly view. That is too heavy for LocalSpend's common SGD-with-occasional-MYR use case: https://support.ynab.com/en_us/using-multiple-currencies-in-ynab-a-guide-SyBF6PHno
- The ECB publishes working-day reference rates for both MYR and SGD and notes that reference rates are informational, not necessarily the rate used for an actual card or cash transaction: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
- Frankfurter provides a browser-safe, no-key API over central-bank data, supports historical dates, and allows an ECB-only provider filter: https://frankfurter.dev/ and https://frankfurter.dev/providers/ecb/
- LocalSpend therefore stores one transaction with two values: original amount/currency and a dated base-currency snapshot. Summaries and budgets use the snapshot; details and exports preserve the amount paid. A user can override the reference conversion to match a bank statement or cash exchange rate.

## Final Daily-Use Audit

Researched on 2026-07-11.

- Apple recommends using interruptive alerts sparingly and reserving confirmation for actions where data loss is meaningful. LocalSpend keeps inline confirmations for permanent deletion while using quiet, contextual feedback for ordinary form guidance: https://developer.apple.com/design/human-interface-guidelines/alerts
- Actual Budget's category learning applies prior payee behavior to reduce repeated categorization work while leaving the user in control. LocalSpend follows the smaller local-first version of this pattern by surfacing active-profile merchant matches inside the expense form: https://actualbudget.org/docs/transactions/payees/ and https://actualbudget.org/docs/budgeting/rules/
- Actual's duplicate reconciliation checks amount, nearby dates, and payees before import. LocalSpend's manual-entry guard is intentionally narrower and clearer: an exact same-date, amount, currency, and description match is labelled before the user deliberately chooses `Save anyway`: https://actualbudget.org/docs/api/reference/
- Current-month comparisons should not compare a partial month with an entire previous month. LocalSpend now compares current spending through today with the same elapsed period in the previous month; completed historical months continue to use full-month comparisons.

## Exchange-Rate Freshness

Researched on 2026-07-11.

- ECB reference rates are normally published around 16:00 CET on working days, excluding TARGET closing days. A Friday quote is therefore the correct latest available reference on Saturday or Sunday: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
- Frankfurter exposes the latest working-day data and historical dates over a no-key API. Its returned quote date can legitimately be earlier than the requested calendar date on weekends and holidays: https://frankfurter.dev/
- LocalSpend now keeps current-date quotes fresh for 30 minutes, lets the refresh action bypass cache, preserves immutable historical quotes, and labels genuine offline fallback separately from the latest available provider reference.
