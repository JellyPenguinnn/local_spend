# Product Spec

## Navigation

- Today: quick expense entry, natural language draft, today's list, recurring due actions.
- Calendar: monthly grid, daily totals, spending intensity, selected day details.
- Summary: monthly totals, average day, highest day, top category, donut chart, budgets, comments.
- Settings: Appearance, Recurring, Spending setup, and General help/data controls.

## Profile Model

- First launch requires creating a local profile.
- `profiles.json` contains profile id, display name, color, timestamps, and active profile id.
- Every profile has a separate `profiles/<profile-id>/localspend.sqlite`.
- Switching profiles reloads only that profile's database.
- Delete profile requires confirmation and removes only that profile's local directory.

## Data Model

- `expenses`: id, original amount/currency, base amount/currency, exchange rate/date/source, date, category id, title, remark, payment method, timestamps.
- `categories`: id, name, color, optional icon, sort order, default flag.
- `budgets`: id, month, nullable category id, amount.
- `recurring_rules`: title, amount, cadence, start date, next due date, category, payment method, active flag.
- `app_settings`: base currency, enabled spending currencies, light/dark mode, accent color, payment methods, imported wallpapers, active wallpaper, wallpaper visibility.
- `ai_settings`: provider, base URL, model, timeout, max tokens, key-saved flag.

## Core Workflows

- Add, edit, delete expenses from Today and selected Calendar days.
- Entry defaults to the profile base currency. Choosing another enabled currency reveals a compact base equivalent populated from a dated reference rate and editable to the actual card/cash conversion.
- Expense details show the original amount first and an approximate base equivalent second. Calendar, Summary, category totals, and budgets always use the saved base amount.
- Existing expenses keep stable historical totals; saved conversions are not recalculated when market rates change.
- Calendar supports month/year boundaries and local `YYYY-MM-DD` dates.
- Month selection uses app-owned month/year controls from 2025 onward, so it works on iPhone even where native month inputs are limited.
- Summary calculates category distribution, month-over-month comparison, budget progress, and deterministic comments.
- Summary category boxes open a monthly category detail view showing each matching spend with date, title, and amount.
- Spending setup keeps compact category and payment-method controls together; both support progressive add flows and confirmed removal.
- Recurring rules keep setup focused on the original amount and currency. When an occurrence is due, Today shows its dated reporting-currency equivalent before confirmation; every recorded foreign occurrence captures its own conversion snapshot.
- Bill `Start date` is editable and defines the schedule pattern. The app stores `Next Due` separately, advances it after recording, skips exact already-recorded bill expenses, and resolves edited past start dates forward instead of backfilling old reminders.
- `Record bill(s)` records at most one missing due occurrence per bill rule per tap. If several months are overdue, the reminder remains due after each confirmation so the user can choose whether to catch up one occurrence at a time instead of silently bulk-creating history.
- On narrow screens, Today prioritizes fast entry, navigation moves to the bottom, and panels stack for one-handed iPhone use.
- Long forms use one compact Back action at the top and one clear Save action at the bottom.

## AI Workflows

- Natural language quick add creates a draft expense for user confirmation.
- Smart categorization uses local keyword rules first and AI only when enabled and low confidence.
- Monthly AI insight sends category totals, total spend, previous month delta, and high-spend days only.
- Provider modes: none, Ollama local, Gemini, Groq, OpenRouter.

## Appearance

- Clean light/dark base with a profile-specific currency, accent color picker, and calm preset accents.
- Users can optionally import their own wallpaper images for an adjustable app background.
- Imported wallpapers are compressed, stored locally with the active profile, capped at 5 images, and removable.
- LocalSpend does not bundle copyrighted character wallpapers, logos, or online assets.

## Settings Organization

- Appearance contains currencies, light/dark mode, accent colors, and wallpaper.
- Recurring manages scheduled bills and subscriptions.
- Spending contains categories and payment methods in one compact view.
- General contains an optional visual quick guide and profile-scoped data controls.

## Import, Export, Backup, Restore

- CSV export/import applies only to active profile expenses.
- CSV stores original and base amounts plus exchange-rate metadata so mixed-currency history can be restored accurately.
- CSV import validates dates and money values, skips duplicates, and safely preserves text that spreadsheet apps could otherwise interpret as formulas.
- JSON backup/restore applies only to the active profile and includes expenses, bills, budgets, categories, payment methods, currencies, appearance, and wallpapers. API secrets are excluded.
- Restore validates the complete backup before changing data, previews its contents, and downloads a safety backup of the current profile first.
- Desktop exports/backups are also saved under the active profile's `exports/` or `backups/` folder.
- Reset downloads a safety backup, then clears expenses, budgets, and recurring bills for only the active profile after confirmation. Categories and appearance remain.

## Acceptance Criteria

- First launch profile creation works.
- Profile switching does not mix expenses.
- Expense CRUD works from core screens.
- Calendar and Summary handle empty and populated months.
- Deterministic comments work without AI.
- CSV import/export and validated JSON backup/restore work on the active profile only.
- AI settings do not require secrets in source code.
- Typecheck, lint, unit tests, web build, and feasible Tauri build pass or are reported.
