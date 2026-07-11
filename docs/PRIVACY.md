# Privacy

LocalSpend is built for local personal use.

## What Stays Local

- Profiles
- Expenses
- Categories
- Budgets
- Recurring rules
- Theme and profile settings
- Imported wallpaper images
- Backups and exports

The app does not include telemetry, analytics, ads, subscription payments, server accounts, or cloud sync.

## Profile Isolation

`profiles.json` stores only profile metadata. Spending records live in separate SQLite files:

```text
profiles/<profile-id>/localspend.sqlite
```

The active profile id controls which database file is opened. Switching profiles reloads from a different SQLite file, so records are not shared across profiles.

In the hosted PWA, each browser installation keeps its own profile data in atomic IndexedDB sections under the LocalSpend site origin. Existing single-record IndexedDB and earlier localStorage profile payloads migrate locally; no migration data is sent to a server. The PWA requests persistent browser storage after user saves when supported, but deleting the PWA or clearing Safari website data can still remove the local copy, so JSON backups remain important.

Complete JSON backups are generated locally and include the active profile's entries, bills, budgets, categories, payment methods, currencies, and appearance. API keys are never included. Restore and reset download a safety copy before destructive changes. CSV files contain expenses only and are sanitized to reduce spreadsheet formula-injection risk.

## Wallpapers

Custom wallpapers are user-imported, compressed, and saved locally with the active profile. LocalSpend keeps at most 5 wallpaper images per profile to control storage use. The selected wallpaper and light/dark appearance mode are profile settings. Wallpapers may be included in JSON backups for that profile.

## AI Privacy

AI is disabled by default. Manual spending entry, category rules, and monthly comments work without AI.

When AI is enabled:

- Natural language quick add sends only the text the user entered.
- Category fallback sends only short title/merchant/remark text.
- Monthly insights send monthly aggregates only.
- Data from other profiles is never included.

## Exchange Rates

Selecting a foreign spending currency may request a dated reference rate from Frankfurter with the ECB provider selected. The request contains only the two ISO currency codes and transaction date; it does not include the amount, description, category, payment method, profile, or any spending history.

The same minimal lookup applies when the user records a foreign-currency recurring bill.

Returned rates are cached locally. Current-date quotes are considered fresh for 30 minutes and are requested again automatically when a later form needs a stale quote. Automatic conversions are shown as read-only reporting values. If the service is unavailable, LocalSpend uses a suitable previously saved rate when available and labels it as an offline rate, or asks for the base-currency equivalent manually so entry remains usable without the rate service.

## Secrets

Desktop builds store provider API keys with the OS keyring command. Keys are never committed to source. Browser-only development fallback stores keys in localStorage for convenience and is not strong secret storage.

## Encryption

LocalSpend does not claim database encryption. Optional PIN/password protection is not implemented. If database encryption is added later, the encryption design should be documented here before release.
