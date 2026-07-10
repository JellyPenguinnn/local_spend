# Product Spec

## Navigation

- Today: quick expense entry, natural language draft, today's list, recurring due actions.
- Calendar: monthly grid, daily totals, spending intensity, selected day details.
- Summary: monthly totals, average day, highest day, top category, donut chart, budgets, comments.
- Settings: appearance, currency, custom wallpapers, bills, categories, and payment methods.

## Profile Model

- First launch requires creating a local profile.
- `profiles.json` contains profile id, display name, color, timestamps, and active profile id.
- Every profile has a separate `profiles/<profile-id>/localspend.sqlite`.
- Switching profiles reloads only that profile's database.
- Delete profile requires confirmation and removes only that profile's local directory.

## Data Model

- `expenses`: id, amount, currency, date, category id, title, remark, payment method, timestamps.
- `categories`: id, name, color, optional icon, sort order, default flag.
- `budgets`: id, month, nullable category id, amount.
- `recurring_rules`: title, amount, cadence, start date, next due date, category, payment method, active flag.
- `app_settings`: currency, light/dark mode, accent color, payment methods, imported wallpapers, active wallpaper, wallpaper visibility.
- `ai_settings`: provider, base URL, model, timeout, max tokens, key-saved flag.

## Core Workflows

- Add, edit, delete expenses from Today and selected Calendar days.
- Calendar supports month/year boundaries and local `YYYY-MM-DD` dates.
- Month selection uses app-owned month/year controls from 2025 onward, so it works on iPhone even where native month inputs are limited.
- Summary calculates category distribution, month-over-month comparison, budget progress, and deterministic comments.
- Summary category boxes open a monthly category detail view showing each matching spend with date, title, and amount.
- Category management can add, rename, recolor, and safely remove unused categories.
- Recurring rules can generate due expenses after user confirmation.
- Bill `Start date` is editable and defines the schedule pattern. The app stores `Next Due` separately, advances it after recording, skips exact already-recorded bill expenses, and resolves edited past start dates forward instead of backfilling old reminders.
- `Record bill(s)` records at most one missing due occurrence per bill rule per tap. If several months are overdue, the reminder remains due after each confirmation so the user can choose whether to catch up one occurrence at a time instead of silently bulk-creating history.
- On narrow screens, Today prioritizes fast entry, navigation moves to the bottom, and panels stack for one-handed iPhone use.

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

## Import, Export, Backup, Restore

- CSV export/import applies only to active profile expenses.
- JSON backup/restore applies only to the active profile's data payload.
- Desktop exports/backups are also saved under the active profile's `exports/` or `backups/` folder.
- Reset clears only the active profile after confirmation.

## Acceptance Criteria

- First launch profile creation works.
- Profile switching does not mix expenses.
- Expense CRUD works from core screens.
- Calendar and Summary handle empty and populated months.
- Deterministic comments work without AI.
- CSV import/export and JSON backup/restore work on active profile only.
- AI settings do not require secrets in source code.
- Typecheck, lint, unit tests, web build, and feasible Tauri build pass or are reported.
