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

## Recurring Bill Occurrences

Recurring reminders are derived from each rule's start date and cadence, not only from a mutable next-due pointer. Every scheduled date is handled independently: an exact matching expense records it, while a user discard stores that date in the rule's `discardedDates` list. This prevents duplicate reminders, preserves missed-cycle reminders after schedule edits, and keeps later occurrences independent.

Discarding is persistent during normal use so the reminder stays gone. Any deliberate edit-and-save of that bill clears its discarded dates and recalculates reminders; exact matching expenses still suppress already-recorded occurrences.
