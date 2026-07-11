import { type ChangeEvent, type CSSProperties, useState } from "react";
import { CalendarDays, Check, Download, Pencil, Plus, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { CategoryChip } from "../components/CategoryChip";
import { FormBackAction } from "../components/FormBackAction";
import { createBackup, restoreBackup } from "../lib/backup";
import { canDeleteCategory } from "../lib/categories";
import { CURRENCY_OPTIONS, normalizeEnabledCurrencies } from "../lib/currencies";
import { exportExpensesCsv, importExpensesCsv } from "../lib/csv";
import { resetSpendingData as resetProfileSpendingData } from "../lib/dataControls";
import { compareIsoDates, formatLocalIsoDate, parseLocalDate } from "../lib/date";
import { createId, MAX_ACCENT_PALETTE_COLORS, normalizeAccentPalette, nowIso } from "../lib/defaults";
import { formatMoney, parseMoney } from "../lib/money";
import { advanceRecurringRulePastRecorded, hasRecordedRecurringExpense, linkRecordedRecurringExpenses, resolveRecurringRuleNextDate } from "../lib/recurring";
import { DEFAULT_WALLPAPER_OPACITY, MAX_WALLPAPERS, clampWallpaperOpacity, createWallpaperFromFile, formatBytes, trimWallpapers } from "../lib/wallpaper";
import type { Category, ProfileData, ProfileMeta, RecurringCadence, RecurringRule } from "../lib/types";
import type { LocalSpendRepository } from "../lib/storage/repository";

interface SettingsScreenProps {
  activeProfile: ProfileMeta;
  data: ProfileData;
  repository: LocalSpendRepository;
  saveData: (data: ProfileData) => Promise<boolean>;
}

type SettingsSection = "appearance" | "bills" | "categories" | "payments";
type PendingDelete =
  | { kind: "bill"; id: string }
  | { kind: "accent"; id: string }
  | { kind: "category"; id: string }
  | { kind: "payment"; id: string }
  | { kind: "wallpaper"; id: string };

const SETTINGS_SECTIONS: Array<{ key: SettingsSection; label: string }> = [
  { key: "appearance", label: "General" },
  { key: "bills", label: "Bills" },
  { key: "categories", label: "Categories" },
  { key: "payments", label: "Payments" }
];

const CADENCE_OPTIONS: Array<{ value: RecurringCadence; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "annually", label: "Annually" }
];

function cadenceLabel(cadence: RecurringCadence): string {
  return CADENCE_OPTIONS.find((option) => option.value === cadence)?.label ?? cadence;
}

function formatDateForField(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Choose date";
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(parseLocalDate(value));
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return slug || "profile";
}

function downloadTextFile(fileName: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function isDuplicateImportedExpense(expense: ProfileData["expenses"][number], existing: ProfileData["expenses"]): boolean {
  const title = expense.title?.trim().toLowerCase() ?? "";
  return existing.some((item) => {
    return (
      item.date === expense.date &&
      item.amount === expense.amount &&
      item.currency === expense.currency &&
      item.categoryId === expense.categoryId &&
      (item.title?.trim().toLowerCase() ?? "") === title
    );
  });
}

function backupIsDue(lastBackupAt: string | null | undefined, expenseCount: number): boolean {
  if (expenseCount === 0) return false;
  if (!lastBackupAt) return true;
  const timestamp = Date.parse(lastBackupAt);
  return !Number.isFinite(timestamp) || Date.now() - timestamp > 30 * 24 * 60 * 60 * 1000;
}

function backupLabel(lastBackupAt: string | null | undefined, expenseCount: number): string {
  if (expenseCount === 0 && !lastBackupAt) return "No backup needed yet.";
  if (!lastBackupAt) return "No backup yet. Save one before moving or resetting this app.";
  const timestamp = Date.parse(lastBackupAt);
  if (!Number.isFinite(timestamp)) return "Backup recommended.";
  const label = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(timestamp));
  return backupIsDue(lastBackupAt, expenseCount) ? `Last backup: ${label} · New backup recommended.` : `Last backup: ${label}`;
}

export function SettingsScreen({ activeProfile, data, repository, saveData }: SettingsScreenProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [status, setStatus] = useState("");
  const [newMethod, setNewMethod] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#4f8fcf");
  const [newCategoryIcon, setNewCategoryIcon] = useState("");
  const [isAddingBill, setIsAddingBill] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [isEditingPayments, setIsEditingPayments] = useState(false);
  const [isEditingAccentPalette, setIsEditingAccentPalette] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{ fileName: string; data: ProfileData } | null>(null);
  const [pendingCsvImport, setPendingCsvImport] = useState<{ fileName: string; count: number; errors: string[]; expenses: ProfileData["expenses"] } | null>(null);
  const [isResettingData, setIsResettingData] = useState(false);
  const accentPalette = normalizeAccentPalette(data.appSettings.accentPalette);
  const currentAccent = data.appSettings.accentColor.toLowerCase();
  const isAccentSaved = accentPalette.includes(currentAccent);
  const defaultBillCategoryId = data.categories.find((category) => category.name.toLowerCase() === "bills")?.id ?? data.categories[0]?.id ?? "";
  const [recurringDraft, setRecurringDraft] = useState<{
    title: string;
    amount: string;
    currency: string;
    categoryId: string;
    paymentMethod: string;
    cadence: RecurringCadence;
    startDate: string;
  }>({
    title: "",
    amount: "",
    currency: data.appSettings.currency,
    categoryId: defaultBillCategoryId,
    paymentMethod: data.appSettings.paymentMethods[0] ?? "Other",
    cadence: "monthly",
    startDate: formatLocalIsoDate()
  });
  const today = formatLocalIsoDate();
  const editingRule = editingRuleId ? (data.recurringRules.find((rule) => rule.id === editingRuleId) ?? null) : null;
  const recurringDraftTitle = recurringDraft.title.trim();
  const recurringDraftAmount = parseMoney(recurringDraft.amount);
  const billCurrencyChoices = data.appSettings.enabledCurrencies.includes(recurringDraft.currency)
    ? data.appSettings.enabledCurrencies
    : [...data.appSettings.enabledCurrencies, recurringDraft.currency];
  const recurringScheduleChanged =
    !editingRule || editingRule.startDate !== recurringDraft.startDate || editingRule.cadence !== recurringDraft.cadence;
  const recurringDraftStartRulePreview: RecurringRule | null =
    recurringDraftAmount !== null && recurringDraftTitle.length > 0 && recurringDraft.categoryId && /^\d{4}-\d{2}-\d{2}$/.test(recurringDraft.startDate)
      ? {
          id: editingRule?.id ?? "rule_preview",
          title: recurringDraftTitle,
          amount: recurringDraftAmount,
          currency: recurringDraft.currency,
          categoryId: recurringDraft.categoryId,
          paymentMethod: recurringDraft.paymentMethod,
          remark: null,
          cadence: recurringDraft.cadence,
          dayOfMonth: Number(recurringDraft.startDate.slice(8, 10)),
          startDate: recurringDraft.startDate,
          nextDate: recurringDraft.startDate,
          discardedDates: [],
          isActive: editingRule?.isActive ?? true,
          createdAt: editingRule?.createdAt ?? "",
          updatedAt: editingRule?.updatedAt ?? ""
        }
      : null;
  const recurringDraftSaveRulePreview = recurringDraftStartRulePreview
    ? {
        ...recurringDraftStartRulePreview,
        startDate: recurringDraftStartRulePreview.startDate,
        nextDate: recurringScheduleChanged ? recurringDraftStartRulePreview.startDate : (editingRule?.nextDate ?? recurringDraftStartRulePreview.startDate)
      }
    : null;
  const recurringDraftAdvanceCutoff =
    recurringDraftSaveRulePreview && compareIsoDates(recurringDraftSaveRulePreview.nextDate, today) <= 0 ? today : recurringDraftSaveRulePreview?.nextDate;
  const recurringDraftAlreadyRecorded = recurringDraftStartRulePreview ? hasRecordedRecurringExpense(data.expenses, recurringDraftStartRulePreview) : false;
  const isBaseCurrencyLocked = data.expenses.length > 0 || data.budgets.length > 0 || data.recurringRules.length > 0;
  const recurringDraftNextUnrecordedDate =
    recurringDraftSaveRulePreview && recurringDraftAdvanceCutoff
      ? (recurringScheduleChanged
          ? resolveRecurringRuleNextDate(recurringDraftSaveRulePreview, data.expenses, today)
          : advanceRecurringRulePastRecorded(recurringDraftSaveRulePreview, data.expenses, recurringDraftAdvanceCutoff)
        ).nextDate
      : null;

  async function updateSettings(patch: Partial<ProfileData["appSettings"]>) {
    return saveData({
      ...data,
      appSettings: {
        ...data.appSettings,
        ...patch
      }
    });
  }

  async function changeBaseCurrency(currency: string) {
    if (currency === data.appSettings.currency) return;
    if (isBaseCurrencyLocked) return;
    await updateSettings({
      currency,
      enabledCurrencies: normalizeEnabledCurrencies(data.appSettings.enabledCurrencies, currency)
    });
    setStatus("");
  }

  async function addSpendingCurrency(currency: string) {
    if (!currency) return;
    await updateSettings({
      enabledCurrencies: normalizeEnabledCurrencies([...data.appSettings.enabledCurrencies, currency], data.appSettings.currency)
    });
    setStatus("");
  }

  async function removeSpendingCurrency(currency: string) {
    if (currency === data.appSettings.currency) return;
    await updateSettings({
      enabledCurrencies: normalizeEnabledCurrencies(
        data.appSettings.enabledCurrencies.filter((item) => item !== currency),
        data.appSettings.currency
      )
    });
    setStatus("");
  }

  async function exportJsonBackup() {
    const contents = createBackup(activeProfile, data);
    const fileName = `localspend-${slugify(activeProfile.displayName)}-${dateStamp()}-backup.json`;
    await repository.saveProfileFile(activeProfile.id, "backup", fileName, contents);
    downloadTextFile(fileName, contents, "application/json");
    await updateSettings({ lastBackupAt: nowIso() });
    setStatus("");
  }

  async function exportCsv() {
    const contents = exportExpensesCsv(data.expenses, data.categories);
    const fileName = `localspend-${slugify(activeProfile.displayName)}-${dateStamp()}-expenses.csv`;
    await repository.saveProfileFile(activeProfile.id, "export", fileName, contents);
    downloadTextFile(fileName, contents, "text/csv");
    setStatus("");
  }

  async function prepareJsonRestore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const result = restoreBackup(await file.text());
    if (!result.data) {
      setStatus(result.error ?? "Could not read that backup.");
      return;
    }
    setPendingRestore({ fileName: file.name, data: result.data });
    setPendingCsvImport(null);
    setIsResettingData(false);
    setStatus("");
  }

  async function confirmJsonRestore() {
    if (!pendingRestore) return;
    if (!(await saveData(pendingRestore.data))) return;
    setPendingRestore(null);
    setStatus("");
  }

  async function prepareCsvImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const result = importExpensesCsv(await file.text(), data.categories, data.appSettings.currency);
    const expenses = result.expenses.filter((expense) => !isDuplicateImportedExpense(expense, data.expenses));
    if (expenses.length === 0) {
      setStatus(result.errors.length > 0 ? result.errors[0] : "No new expenses found.");
      return;
    }
    setPendingCsvImport({ fileName: file.name, count: expenses.length, errors: result.errors, expenses });
    setPendingRestore(null);
    setIsResettingData(false);
    setStatus("");
  }

  async function confirmCsvImport() {
    if (!pendingCsvImport) return;
    const saved = await saveData({
      ...data,
      expenses: [...data.expenses, ...pendingCsvImport.expenses]
    });
    if (!saved) return;
    setPendingCsvImport(null);
    setStatus("");
  }

  async function resetSpendingData() {
    if (!(await saveData(resetProfileSpendingData(data)))) return;
    setIsResettingData(false);
    setStatus("");
  }

  async function saveAccentToPalette() {
    if (isAccentSaved) return;
    if (accentPalette.length >= MAX_ACCENT_PALETTE_COLORS) {
      return;
    }
    if (!(await updateSettings({ accentPalette: [...accentPalette, currentAccent] }))) return;
    setStatus("");
  }

  async function removeAccentFromPalette(color: string) {
    const removedColor = color.toLowerCase();
    const nextPalette = accentPalette.filter((item) => item !== removedColor);
    if (nextPalette.length === 0) {
      setStatus("Keep at least one saved color.");
      return;
    }
    if (!(await updateSettings({
      accentPalette: nextPalette,
      accentColor: currentAccent === removedColor ? nextPalette[0] : data.appSettings.accentColor
    }))) return;
    setPendingDelete(null);
    setStatus("");
  }

  async function importWallpaper(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (data.appSettings.wallpapers.length >= MAX_WALLPAPERS) {
      setStatus("");
      return;
    }
    try {
      const wallpaper = await createWallpaperFromFile(file);
      if (!(await updateSettings({
        wallpapers: trimWallpapers([wallpaper, ...data.appSettings.wallpapers]),
        activeWallpaperId: wallpaper.id,
        wallpaperOpacity: data.appSettings.wallpaperOpacity || DEFAULT_WALLPAPER_OPACITY
      }))) return;
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import that wallpaper.");
    }
  }

  async function selectWallpaper(wallpaperId: string | null) {
    await updateSettings({
      activeWallpaperId: wallpaperId
    });
    setPendingDelete(null);
    setStatus("");
  }

  function requestWallpaperRemoval(wallpaperId: string) {
    setStatus("");
    setPendingDelete({ kind: "wallpaper", id: wallpaperId });
  }

  async function removeWallpaper(wallpaperId: string) {
    const wallpapers = data.appSettings.wallpapers.filter((wallpaper) => wallpaper.id !== wallpaperId);
    if (!(await updateSettings({
      wallpapers,
      activeWallpaperId: data.appSettings.activeWallpaperId === wallpaperId ? (wallpapers[0]?.id ?? null) : data.appSettings.activeWallpaperId
    }))) return;
    setPendingDelete(null);
    setStatus("");
  }

  async function addPaymentMethod() {
    const method = newMethod.trim();
    if (!method) return;
    if (data.appSettings.paymentMethods.some((item) => item.toLowerCase() === method.toLowerCase())) {
      setStatus("That payment method is already in your list.");
      return;
    }
    if (!(await updateSettings({ paymentMethods: [...data.appSettings.paymentMethods, method] }))) return;
    setNewMethod("");
    setIsAddingPayment(false);
    setStatus("");
  }

  function requestPaymentMethodRemoval(method: string) {
    if (data.appSettings.paymentMethods.length <= 1) {
      setStatus("Keep at least one payment method.");
      return;
    }
    setStatus("");
    setPendingDelete({ kind: "payment", id: method });
  }

  async function removePaymentMethod(method: string) {
    const paymentMethods = data.appSettings.paymentMethods.filter((item) => item !== method);
    if (!(await updateSettings({ paymentMethods }))) return;
    if (recurringDraft.paymentMethod === method) {
      setRecurringDraft({ ...recurringDraft, paymentMethod: paymentMethods[0] ?? "Other" });
    }
    setPendingDelete(null);
    setStatus("");
  }

  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    if (data.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      setStatus("That category already exists.");
      return;
    }
    const category: Category = {
      id: createId("cat"),
      name,
      color: newCategoryColor,
      icon: newCategoryIcon.trim() || null,
      sortOrder: data.categories.length,
      isDefault: false
    };
    if (!(await saveData({ ...data, categories: [...data.categories, category] }))) return;
    setNewCategoryName("");
    setNewCategoryIcon("");
    setIsAddingCategory(false);
    setStatus("");
  }

  function requestCategoryDelete(category: Category) {
    const expenseCount = data.expenses.filter((expense) => expense.categoryId === category.id).length;
    const ruleCount = data.recurringRules.filter((rule) => rule.categoryId === category.id).length;
    if (data.categories.length <= 1) {
      setStatus("Keep at least one category.");
      return;
    }
    const allowed = canDeleteCategory(category, expenseCount);
    if (!allowed.ok) {
      setStatus(allowed.reason ?? "This category cannot be removed.");
      return;
    }
    if (ruleCount > 0) {
      setStatus("This category is used by a bill or subscription. Remove that rule first.");
      return;
    }
    setStatus("");
    setPendingDelete({ kind: "category", id: category.id });
  }

  async function deleteCategory(category: Category) {
    const categories = data.categories.filter((item) => item.id !== category.id);
    const saved = await saveData({
      ...data,
      categories,
      budgets: data.budgets.filter((budget) => budget.categoryId !== category.id)
    });
    if (!saved) return;
    if (recurringDraft.categoryId === category.id) {
      setRecurringDraft({ ...recurringDraft, categoryId: categories[0]?.id ?? "" });
    }
    setPendingDelete(null);
    setStatus("");
  }

  function requestRecurringRuleDelete(rule: RecurringRule) {
    setStatus("");
    setPendingDelete({ kind: "bill", id: rule.id });
  }

  async function deleteRecurringRule(rule: RecurringRule) {
    const saved = await saveData({
      ...data,
      expenses: data.expenses.map((expense) =>
        expense.recurringRuleId === rule.id
          ? { ...expense, recurringRuleId: null, recurringOccurrenceDate: null }
          : expense
      ),
      recurringRules: data.recurringRules.filter((item) => item.id !== rule.id)
    });
    if (!saved) return;
    setPendingDelete(null);
    setStatus("");
  }

  function resetRecurringDraft() {
    setRecurringDraft({
      title: "",
      amount: "",
      currency: data.appSettings.currency,
      categoryId: defaultBillCategoryId,
      paymentMethod: data.appSettings.paymentMethods[0] ?? "Other",
      cadence: "monthly",
      startDate: formatLocalIsoDate()
    });
  }

  function startAddingBill() {
    setEditingRuleId(null);
    resetRecurringDraft();
    setPendingDelete(null);
    setIsAddingBill(true);
    setStatus("");
  }

  function startEditingBill(rule: RecurringRule) {
    setEditingRuleId(rule.id);
    setRecurringDraft({
      title: rule.title,
      amount: String(rule.amount),
      currency: rule.currency,
      categoryId: rule.categoryId,
      paymentMethod: rule.paymentMethod ?? data.appSettings.paymentMethods[0] ?? "Other",
      cadence: rule.cadence,
      startDate: rule.startDate
    });
    setPendingDelete(null);
    setIsAddingBill(true);
    setStatus("");
  }

  function closeBillForm() {
    setIsAddingBill(false);
    setEditingRuleId(null);
    resetRecurringDraft();
  }

  async function saveRecurringRule() {
    const amount = parseMoney(recurringDraft.amount);
    if (amount === null || !recurringDraft.title.trim() || !recurringDraft.categoryId || !recurringDraft.startDate) {
      setStatus("Fill in description, amount, category, and start date.");
      return;
    }
    const timestamp = nowIso();
    const existingRule = editingRuleId ? data.recurringRules.find((rule) => rule.id === editingRuleId) : null;
    const scheduleChanged = !existingRule || existingRule.startDate !== recurringDraft.startDate || existingRule.cadence !== recurringDraft.cadence;
    const rule: RecurringRule = {
      id: existingRule?.id ?? createId("rule"),
      title: recurringDraft.title.trim(),
      amount,
      currency: recurringDraft.currency,
      categoryId: recurringDraft.categoryId,
      paymentMethod: recurringDraft.paymentMethod,
      remark: null,
      cadence: recurringDraft.cadence,
      dayOfMonth: Number(recurringDraft.startDate.slice(8, 10)),
      startDate: recurringDraft.startDate,
      nextDate: scheduleChanged ? recurringDraft.startDate : (existingRule?.nextDate ?? recurringDraft.startDate),
      discardedDates: [],
      isActive: existingRule?.isActive ?? true,
      createdAt: existingRule?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
    const expensesWithStableLinks = linkRecordedRecurringExpenses(data.expenses, existingRule ?? rule);
    const advanceCutoff = compareIsoDates(rule.nextDate, today) <= 0 ? today : rule.nextDate;
    const normalizedRule = scheduleChanged
      ? resolveRecurringRuleNextDate(rule, expensesWithStableLinks, today)
      : advanceRecurringRulePastRecorded(rule, expensesWithStableLinks, advanceCutoff);
    const saved = await saveData({
      ...data,
      expenses: expensesWithStableLinks,
      recurringRules: existingRule ? data.recurringRules.map((item) => (item.id === existingRule.id ? normalizedRule : item)) : [...data.recurringRules, normalizedRule]
    });
    if (!saved) return;
    closeBillForm();
    setStatus("");
  }

  return (
    <div className="settings-screen">
      <section className="settings-tabs" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={activeSection === section.key ? "active" : ""}
            onClick={() => {
              setActiveSection(section.key);
              setStatus("");
              setPendingDelete(null);
              setPendingRestore(null);
              setPendingCsvImport(null);
              setIsResettingData(false);
              setIsEditingCategories(false);
              setIsEditingPayments(false);
              setIsEditingAccentPalette(false);
            }}
          >
            {section.label}
          </button>
        ))}
      </section>
      {status && <p className="form-note warning settings-status" role="status" aria-live="polite">{status}</p>}

      {activeSection === "appearance" && (
        <div className="appearance-blocks">
          <section className="panel settings-panel appearance-block">
            <label className="base-currency-field">
              <span>Main currency</span>
              <select
                value={data.appSettings.currency}
                disabled={isBaseCurrencyLocked}
                aria-label="Main currency"
                aria-describedby="main-currency-help"
                onChange={(event) => void changeBaseCurrency(event.target.value)}
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="settings-help" id="main-currency-help">
              Totals and budgets use this currency{isBaseCurrencyLocked ? ". Locked after your first record." : "."}
            </p>
            <div className="enabled-currency-field">
              <div className="currency-field-head">
                <span>Other currencies</span>
                {data.appSettings.enabledCurrencies.length < CURRENCY_OPTIONS.length && (
                  <select className="currency-add-select" value="" onChange={(event) => void addSpendingCurrency(event.target.value)} aria-label="Add spending currency">
                    <option value="">Add</option>
                    {CURRENCY_OPTIONS.filter((option) => !data.appSettings.enabledCurrencies.includes(option.code)).map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {data.appSettings.enabledCurrencies.some((currency) => currency !== data.appSettings.currency) && (
                <div className="currency-chip-row">
                  {data.appSettings.enabledCurrencies
                    .filter((currency) => currency !== data.appSettings.currency)
                    .map((currency) => (
                      <span className="currency-chip" key={currency}>
                        {currency}
                        <button type="button" onClick={() => void removeSpendingCurrency(currency)} aria-label={`Remove ${currency}`} title={`Remove ${currency}`}>
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                </div>
              )}
            </div>
          </section>
          <section className="panel settings-panel appearance-block">
            <div className="mode-field">
              <span>Mode</span>
              <div className="mode-toggle" role="group" aria-label="Appearance mode">
                <button
                  type="button"
                  className={data.appSettings.theme === "light" ? "mode-option active" : "mode-option"}
                  onClick={() => void updateSettings({ theme: "light" })}
                >
                  Light
                </button>
                <button
                  type="button"
                  className={data.appSettings.theme === "dark" ? "mode-option active" : "mode-option"}
                  onClick={() => void updateSettings({ theme: "dark" })}
                >
                  Dark
                </button>
              </div>
            </div>
          </section>
          <section className="panel settings-panel appearance-block">
            <div className="accent-card-head">
              <span>Accent color</span>
              <button
                className={isEditingAccentPalette ? "secondary-button compact-toggle active accent-manage-button" : "icon-button accent-edit-toggle"}
                type="button"
                onClick={() => {
                  setIsEditingAccentPalette((current) => !current);
                  setPendingDelete(null);
                  setStatus("");
                }}
                aria-label={isEditingAccentPalette ? "Done editing accent colors" : "Edit accent colors"}
                title={isEditingAccentPalette ? "Done" : "Edit accent colors"}
              >
                {isEditingAccentPalette ? "Done" : <Pencil size={16} />}
              </button>
            </div>
            <div className={isEditingAccentPalette ? "accent-picker-row editing" : "accent-picker-row"}>
              <label className="color-field">
                <input
                  className="accent-color-input"
                  type="color"
                  value={data.appSettings.accentColor}
                  style={{ backgroundColor: data.appSettings.accentColor }}
                  onChange={(event) => void updateSettings({ accentColor: event.target.value })}
                />
              </label>
              {isEditingAccentPalette && !isAccentSaved && (
                <button
                  className="secondary-button accent-save-button"
                  type="button"
                  onClick={() => void saveAccentToPalette()}
                  disabled={accentPalette.length >= MAX_ACCENT_PALETTE_COLORS}
                >
                  Save
                </button>
              )}
              {isEditingAccentPalette && isAccentSaved && <span className="accent-saved-pill">Saved</span>}
            </div>
            {isEditingAccentPalette && accentPalette.length >= MAX_ACCENT_PALETTE_COLORS && !isAccentSaved && (
              <p className="form-note warning accent-card-note">Maximum 8 colors can be saved.</p>
            )}
            <div className={isEditingAccentPalette ? "accent-preset-row editing" : "accent-preset-row"} aria-label="Accent color presets">
              {accentPalette.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={currentAccent === color ? "accent-preset active" : "accent-preset"}
                  style={{ "--preset-color": color } as CSSProperties}
                  onClick={() => {
                    if (isEditingAccentPalette) {
                      if (accentPalette.length > 1) {
                        setPendingDelete({ kind: "accent", id: color });
                        setStatus("");
                      }
                      return;
                    }
                    void updateSettings({ accentColor: color });
                  }}
                  aria-label={isEditingAccentPalette ? `Remove ${color} accent` : `Use ${color} accent`}
                  title={isEditingAccentPalette ? "Remove color" : color}
                >
                  {isEditingAccentPalette && accentPalette.length > 1 ? <span className="accent-remove-mark" aria-hidden="true">×</span> : null}
                  {!isEditingAccentPalette && currentAccent === color && <Check className="accent-preset-check" size={15} />}
                </button>
              ))}
            </div>
            {pendingDelete?.kind === "accent" && (
              <div className="accent-confirm-row">
                <span>Remove saved color?</span>
                <button className="secondary-button" type="button" onClick={() => setPendingDelete(null)}>
                  Cancel
                </button>
                <button className="secondary-button danger-button" type="button" onClick={() => void removeAccentFromPalette(pendingDelete.id)}>
                  Remove
                </button>
              </div>
            )}
          </section>
          <section className="panel settings-panel appearance-block">
            <div className="wallpaper-section">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Wallpaper</p>
                <h2>Custom background</h2>
              </div>
            </div>
            {data.appSettings.activeWallpaperId && (
              <label className="wallpaper-opacity-control">
                <span>Visibility</span>
                <input
                  type="range"
                  min="0.12"
                  max="0.55"
                  step="0.01"
                  value={clampWallpaperOpacity(data.appSettings.wallpaperOpacity)}
                  onChange={(event) => void updateSettings({ wallpaperOpacity: Number(event.target.value) })}
                />
              </label>
            )}
            <div className="wallpaper-actions">
              <label className={data.appSettings.wallpapers.length >= MAX_WALLPAPERS ? "file-button wallpaper-import disabled" : "file-button wallpaper-import"}>
                <Plus size={16} />
                Import image
                <input type="file" accept="image/*" disabled={data.appSettings.wallpapers.length >= MAX_WALLPAPERS} onChange={(event) => void importWallpaper(event)} />
              </label>
            </div>
            {data.appSettings.wallpapers.length >= MAX_WALLPAPERS && <p className="form-note warning wallpaper-card-note">Max 5 images. Remove one before importing.</p>}
            <div className="wallpaper-grid">
              <button type="button" className={!data.appSettings.activeWallpaperId ? "wallpaper-card active" : "wallpaper-card"} onClick={() => void selectWallpaper(null)}>
                <span className="wallpaper-thumb clean" />
                <strong>Clean</strong>
              </button>
              {data.appSettings.wallpapers.map((wallpaper) => {
                const isActive = data.appSettings.activeWallpaperId === wallpaper.id;
                const isDeleting = pendingDelete?.kind === "wallpaper" && pendingDelete.id === wallpaper.id;
                return (
                  <article className={isActive ? "wallpaper-card active saved" : "wallpaper-card saved"} key={wallpaper.id}>
                    <button type="button" onClick={() => void selectWallpaper(wallpaper.id)} aria-label={`Use ${wallpaper.name} wallpaper`}>
                      <span className="wallpaper-thumb" style={{ backgroundImage: `url("${wallpaper.dataUrl}")` }} />
                      <strong>{wallpaper.name}</strong>
                      <small>{formatBytes(wallpaper.sizeBytes)}</small>
                    </button>
                    {isDeleting ? (
                      <div className="wallpaper-confirm">
                        <button className="secondary-button" type="button" onClick={() => setPendingDelete(null)}>
                          Cancel
                        </button>
                        <button className="secondary-button danger-button" type="button" onClick={() => void removeWallpaper(wallpaper.id)}>
                          Delete
                        </button>
                      </div>
                    ) : (
                      <button className="icon-button danger-icon" type="button" onClick={() => requestWallpaperRemoval(wallpaper.id)} aria-label={`Remove ${wallpaper.name} wallpaper`}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
            </div>
          </section>
          <section className="panel settings-panel appearance-block data-control-card">
            <div className="account-card-head">
              <span>Data</span>
            </div>
            <div className="data-action-grid">
              <button className="secondary-button" type="button" onClick={() => void exportJsonBackup()}>
                <Download size={16} />
                Backup
              </button>
              <label className="file-button data-file-button">
                <Upload size={16} />
                Restore
                <input type="file" accept="application/json,.json" onChange={(event) => void prepareJsonRestore(event)} />
              </label>
              <button className="secondary-button" type="button" onClick={() => void exportCsv()}>
                <Download size={16} />
                Export CSV
              </button>
              <label className="file-button data-file-button">
                <Upload size={16} />
                Import CSV
                <input type="file" accept=".csv,text/csv" onChange={(event) => void prepareCsvImport(event)} />
              </label>
            </div>
            <p className={backupIsDue(data.appSettings.lastBackupAt, data.expenses.length) ? "form-note warning backup-freshness" : "muted small backup-freshness"}>
              {backupLabel(data.appSettings.lastBackupAt, data.expenses.length)}
            </p>
            {pendingRestore && (
              <div className="data-confirm-box">
                <span>Restore {pendingRestore.fileName}?</span>
                <div>
                  <button className="secondary-button" type="button" onClick={() => setPendingRestore(null)}>
                    Cancel
                  </button>
                  <button className="secondary-button danger-button" type="button" onClick={() => void confirmJsonRestore()}>
                    Restore
                  </button>
                </div>
              </div>
            )}
            {pendingCsvImport && (
              <div className="data-confirm-box">
                <span>
                  Import {pendingCsvImport.count} expenses
                  {pendingCsvImport.errors.length > 0 ? `, ${pendingCsvImport.errors.length} skipped` : ""}?
                </span>
                <div>
                  <button className="secondary-button" type="button" onClick={() => setPendingCsvImport(null)}>
                    Cancel
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void confirmCsvImport()}>
                    Import
                  </button>
                </div>
              </div>
            )}
            <div className="data-reset-row">
              {isResettingData ? (
                <div className="data-confirm-box danger">
                  <span>Clear spending, budgets, and bills?</span>
                  <div>
                    <button className="secondary-button" type="button" onClick={() => setIsResettingData(false)}>
                      Cancel
                    </button>
                    <button className="secondary-button danger-button" type="button" onClick={() => void resetSpendingData()}>
                      Reset
                    </button>
                  </div>
                </div>
              ) : (
                <button className="secondary-button danger-button data-reset-button" type="button" onClick={() => setIsResettingData(true)}>
                  <RotateCcw size={16} />
                  Reset spending
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {activeSection === "bills" && (
        <section className="panel settings-panel">
          {!isAddingBill ? (
            <div className="bill-section-head">
              <p className="eyebrow">Subscriptions</p>
              <button className="secondary-button bill-add-button" type="button" onClick={startAddingBill}>
                <Plus size={16} />
                Add
              </button>
            </div>
          ) : (
            <div className="settings-subpanel settings-inline-form bill-inline-form">
              <FormBackAction onClick={closeBillForm} />
              <div className="filter-grid">
                <label>
                  <span>Description</span>
                  <input value={recurringDraft.title} onChange={(event) => setRecurringDraft({ ...recurringDraft, title: event.target.value })} />
                </label>
                <div className="bill-amount-field">
                  <span className="amount-field-label">Amount</span>
                  <div className="money-input-control" role="group" aria-label="Bill amount and currency">
                    <select
                      className="currency-select"
                      value={recurringDraft.currency}
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, currency: event.target.value })}
                      aria-label="Bill currency"
                    >
                      {billCurrencyChoices.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                    <input
                      inputMode="decimal"
                      value={recurringDraft.amount}
                      placeholder="0.00"
                      aria-label="Bill amount"
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, amount: event.target.value })}
                    />
                  </div>
                </div>
                <label>
                  <span>Category</span>
                  <select value={recurringDraft.categoryId} onChange={(event) => setRecurringDraft({ ...recurringDraft, categoryId: event.target.value })}>
                    {data.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Payment</span>
                  <select value={recurringDraft.paymentMethod} onChange={(event) => setRecurringDraft({ ...recurringDraft, paymentMethod: event.target.value })}>
                    {data.appSettings.paymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Cadence</span>
                  <select value={recurringDraft.cadence} onChange={(event) => setRecurringDraft({ ...recurringDraft, cadence: event.target.value as RecurringCadence })}>
                    {CADENCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Start date</span>
                  <div className="date-control">
                    <input
                      className="native-date-input"
                      type="date"
                      value={recurringDraft.startDate}
                      onChange={(event) => setRecurringDraft({ ...recurringDraft, startDate: event.target.value })}
                      aria-label="Start date"
                    />
                    <div className="date-display" aria-hidden="true">
                      <strong>{formatDateForField(recurringDraft.startDate)}</strong>
                      <CalendarDays size={17} />
                    </div>
                  </div>
                </label>
              </div>
              {recurringDraftAlreadyRecorded && recurringDraftNextUnrecordedDate && (
                <p className="form-note warning bill-card-note">
                  Bill already recorded for this start date. Next due will be {formatDateForField(recurringDraftNextUnrecordedDate)}.
                </p>
              )}
              <button className="primary-button bill-save-button" type="button" onClick={() => void saveRecurringRule()}>
                <Check size={17} />
                Save
              </button>
            </div>
          )}
          {!isAddingBill && (
          <div className="rule-list compact-expense-list bill-entry-list">
            {data.recurringRules.length === 0 ? (
              <p className="muted small">No recurring bills yet.</p>
            ) : (
              data.recurringRules.map((rule) => {
                const category = data.categories.find((item) => item.id === rule.categoryId);
                const isDeleting = pendingDelete?.kind === "bill" && pendingDelete.id === rule.id;
                return (
                  <article className="expense-row bill-entry-row" key={rule.id}>
                    <CategoryChip category={category} label="" compact />
                    <div className="expense-main">
                      <div className="expense-title">
                        <strong>{rule.title}</strong>
                      </div>
                      <div className="expense-meta">
                        <span>
                          {category?.name ?? "Category"} · {rule.paymentMethod || "Payment"} · {cadenceLabel(rule.cadence)}
                        </span>
                        <span>Next Due: {formatDateForField(rule.nextDate)}</span>
                      </div>
                    </div>
                    <strong className="expense-amount">{formatMoney(rule.amount, rule.currency || data.appSettings.currency)}</strong>
                    <div className={isDeleting ? "row-actions confirming" : "row-actions"}>
                      {isDeleting ? (
                        <>
                          <button className="secondary-button" type="button" onClick={() => setPendingDelete(null)}>
                            Cancel
                          </button>
                          <button className="secondary-button danger-button" type="button" onClick={() => void deleteRecurringRule(rule)}>
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="icon-button" type="button" onClick={() => startEditingBill(rule)} aria-label={`Edit ${rule.title}`} title="Edit bill">
                            <Pencil size={16} />
                          </button>
                          <button className="icon-button danger-icon" type="button" onClick={() => requestRecurringRuleDelete(rule)} aria-label={`Delete ${rule.title}`} title="Delete bill">
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
          )}
        </section>
      )}

      {activeSection === "categories" && (
        <section className="panel settings-panel">
          <div className="settings-meta-row">
            <div className="settings-title-actions">
              <span className="muted small">{data.categories.length} total</span>
              <button
                className={isEditingCategories ? "secondary-button compact-toggle active" : "icon-button"}
                type="button"
                onClick={() => {
                  setIsEditingCategories((current) => !current);
                  setPendingDelete(null);
                }}
                aria-label={isEditingCategories ? "Done editing categories" : "Edit categories"}
                title={isEditingCategories ? "Done" : "Edit categories"}
              >
                {isEditingCategories ? "Done" : <Pencil size={16} />}
              </button>
            </div>
          </div>
          <div className="settings-list category-settings-list">
            {data.categories.map((category) => {
              const isDeleting = pendingDelete?.kind === "category" && pendingDelete.id === category.id;
              return (
                <article className="settings-list-row category-display-row" key={category.id}>
                  <span className="category-icon-preview" style={{ "--category-color": category.color } as CSSProperties}>
                    {category.icon ?? "•"}
                  </span>
                  <div>
                    <strong>{category.name}</strong>
                  </div>
                  <div className={isDeleting ? "row-actions confirming settings-confirm-actions" : "row-actions settings-confirm-actions"}>
                    {isDeleting ? (
                      <>
                        <button className="secondary-button" type="button" onClick={() => setPendingDelete(null)}>
                          Cancel
                        </button>
                        <button className="secondary-button danger-button" type="button" onClick={() => void deleteCategory(category)}>
                          Delete
                        </button>
                      </>
                    ) : isEditingCategories ? (
                      <button className="icon-button danger-icon" type="button" onClick={() => requestCategoryDelete(category)} aria-label={`Delete ${category.name}`} title="Delete category">
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          {!isAddingCategory ? (
            <button
              className="add-card-button settings-bottom-add"
              type="button"
              onClick={() => {
                setIsAddingCategory(true);
                setStatus("");
              }}
            >
              <Plus size={17} />
              Add category
            </button>
          ) : (
            <div className="settings-subpanel settings-inline-form settings-bottom-form">
              <div className="add-row category-add-row settings-add-row">
                <input value={newCategoryName} placeholder="New category" onChange={(event) => setNewCategoryName(event.target.value)} />
                <input value={newCategoryIcon} placeholder="Icon" onChange={(event) => setNewCategoryIcon(event.target.value.slice(0, 2))} />
                <input type="color" value={newCategoryColor} onChange={(event) => setNewCategoryColor(event.target.value)} aria-label="New category color" />
              </div>
              <div className="settings-form-actions">
                <button className="primary-button" type="button" onClick={() => void addCategory()}>
                  Save
                </button>
                <button className="secondary-button" type="button" onClick={() => setIsAddingCategory(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {activeSection === "payments" && (
        <section className="panel settings-panel">
          <div className="settings-meta-row">
            <div className="settings-title-actions">
              <span className="muted small">{data.appSettings.paymentMethods.length} total</span>
              <button
                className={isEditingPayments ? "secondary-button compact-toggle active" : "icon-button"}
                type="button"
                onClick={() => {
                  setIsEditingPayments((current) => !current);
                  setPendingDelete(null);
                }}
                aria-label={isEditingPayments ? "Done editing payment methods" : "Edit payment methods"}
                title={isEditingPayments ? "Done" : "Edit payment methods"}
              >
                {isEditingPayments ? "Done" : <Pencil size={16} />}
              </button>
            </div>
          </div>
          <div className="settings-list payment-settings-list">
            {data.appSettings.paymentMethods.map((method) => {
              const isDeleting = pendingDelete?.kind === "payment" && pendingDelete.id === method;
              return (
                <article className="settings-list-row payment-settings-row" key={method}>
                  <div className="payment-dot" aria-hidden="true" />
                  <div>
                    <strong>{method}</strong>
                  </div>
                  <div className={isDeleting ? "row-actions confirming settings-confirm-actions" : "row-actions settings-confirm-actions"}>
                    {isDeleting ? (
                      <>
                        <button className="secondary-button" type="button" onClick={() => setPendingDelete(null)}>
                          Cancel
                        </button>
                        <button className="secondary-button danger-button" type="button" onClick={() => void removePaymentMethod(method)}>
                          Delete
                        </button>
                      </>
                    ) : isEditingPayments ? (
                      <button className="icon-button danger-icon" type="button" onClick={() => requestPaymentMethodRemoval(method)} aria-label={`Remove ${method}`} title="Remove payment method">
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          {!isAddingPayment ? (
            <button
              className="add-card-button settings-bottom-add"
              type="button"
              onClick={() => {
                setIsAddingPayment(true);
                setStatus("");
              }}
            >
              <Plus size={17} />
              Add payment method
            </button>
          ) : (
            <div className="settings-subpanel settings-inline-form settings-bottom-form">
              <div className="add-row settings-add-row">
                <input value={newMethod} placeholder="New payment method" onChange={(event) => setNewMethod(event.target.value)} />
              </div>
              <div className="settings-form-actions">
                <button className="primary-button" type="button" onClick={() => void addPaymentMethod()}>
                  Save
                </button>
                <button className="secondary-button" type="button" onClick={() => setIsAddingPayment(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
