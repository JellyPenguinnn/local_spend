# Architecture Decisions

## Tauri 2 + React + TypeScript

Use Tauri 2, React, TypeScript, and Vite to match the requested stack and keep the desktop app lightweight on macOS.

## Rust-Owned SQLite Access

Use Rust `rusqlite` behind Tauri commands instead of calling the Tauri SQL plugin directly from UI components. This keeps profile isolation centralized: Rust resolves the active profile's own `localspend.sqlite` file and React receives only that profile's payload.

## Local Multi-Profile Model

Use `profiles.json` only for profile metadata and one SQLite database per profile under `profiles/<profile-id>/`. There is no remote login, cloud sync, SaaS account, telemetry, subscription, or ad feature.

## AI Is Optional

AI defaults to `none`. Local deterministic parsing, category rules, and monthly comments work without AI. Cloud AI requests require explicit provider setup, use JSON schema validation, and monthly insights send aggregates only.

## API Keys

Desktop builds use a Tauri command backed by the OS keyring crate for provider API keys. The Vite browser fallback stores keys in localStorage only so the UI can be exercised without Tauri; it is documented as less secure and not the production path.

## Appearance Model

LocalSpend uses a clean light/dark base with a profile-specific accent color. Instead of bundling cartoon or character wallpapers, users can import their own local wallpaper images. Imported wallpapers are compressed, stored with the active profile settings, capped at 5 images, and rendered behind the app with adjustable subtle-to-visible transparency.

## iPhone Use Path

LocalSpend keeps the Tauri macOS app, but the frontend is now mobile-first and installable as a PWA-style web app when hosted privately. This is the practical personal iPhone route without App Store distribution. Native iOS packaging with Tauri remains possible later, but sharing it with friends requires Apple's iOS signing/TestFlight flow.

## Frontend Size

The category donut chart is lazy-loaded so the daily tracker does not load Recharts on first open. This keeps the main web bundle smaller for iPhone use while preserving the Summary chart.

## Browser Persistence

The hosted PWA stores profile data and compressed wallpapers in IndexedDB. Profile metadata remains a very small localStorage record, and temporary unfinished expense drafts use a separate expiring local key. Existing PWA profile payloads migrate from localStorage to IndexedDB on first read. After user-initiated saves, the PWA requests persistent storage where supported; denial never blocks saving. Downloaded backups are not duplicated inside browser storage.

Complete JSON restore is validated before any write and rejected as a whole when core records are malformed. Restore and reset create a dated safety backup before replacing or clearing data. CSV remains an expense interchange format, not a full backup: imports validate records and suppress existing and within-file duplicates, while exports neutralize spreadsheet formula prefixes.

## Recurring Bill Occurrences

Recurring reminders are derived from each rule's start date and cadence, not only from a mutable next-due pointer. Every scheduled date is handled independently: an exact matching expense records it, while a user discard stores that date in the rule's `discardedDates` list. This prevents duplicate reminders, preserves missed-cycle reminders after schedule edits, and keeps later occurrences independent.

Materialized and reconciled bill expenses also store the originating rule id and scheduled occurrence date. This stable link means a later bill edit cannot resurrect an already-paid month. A manually entered matching bill with a changed amount is shown for explicit reconciliation instead of creating a silent duplicate.

Discarding is persistent during normal use so the reminder stays gone. Any deliberate edit-and-save of that bill clears its discarded dates and recalculates reminders; exact matching expenses still suppress already-recorded occurrences.

## Stable Multi-Currency Transactions

Each expense remains one record. It stores the original amount/currency plus a base amount, base currency, exchange rate, rate date, and source captured at save time. Calendar totals, summaries, category distribution, and budgets use the base amount; transaction details preserve and foreground the original amount.

Historical expenses are never revalued when reference rates change. Foreign entries try a dated ECB reference through Frankfurter and fall back to a locally cached or previously saved rate. Automatic conversions are read-only; a manual converted amount appears only when no suitable reference is available or when editing an existing manual conversion. The profile base currency is locked after spending, budgets, or recurring rules exist so reporting currencies cannot be mixed silently.

Current-date provider quotes use a 30-minute freshness window and are requested again automatically when a later form needs a stale quote. Historical quotes can be reused because the reference for that date is immutable. A provider result dated before the requested date is presented as the latest available reference, which is expected on weekends and closing days; only a failed network request that falls back locally is labelled as a saved offline rate.

Recurring rules store their original amount and currency. A confirmed foreign-currency occurrence obtains a dated reference rate and materializes as the same stable original/base snapshot used by manual expenses. If neither a dated nor prior cached rate is available offline, recording waits instead of silently treating the foreign amount as base currency.
