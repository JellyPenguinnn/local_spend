import { createDefaultProfileData, normalizeAccentPalette, normalizeRecurringRules } from "./defaults";
import { normalizeCurrencyCode, normalizeEnabledCurrencies, normalizeExpenses } from "./currencies";
import {
  MAX_CATEGORY_ICON_LENGTH,
  MAX_CATEGORY_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_PAYMENT_METHOD_LENGTH,
  MAX_PAYMENT_METHODS,
  MAX_PROFILE_CATEGORIES,
  MAX_PROFILE_NAME_LENGTH,
  MAX_PROFILE_RECORDS,
  MAX_REMARK_LENGTH
} from "./dataLimits";
import { isValidLocalIsoDate } from "./date";
import type { AiProvider, Budget, Category, Expense, ProfileData, ProfileMeta, RecurringCadence, RecurringRule, ThemeKey, WallpaperImage } from "./types";
import { MAX_WALLPAPERS, clampWallpaperOpacity } from "./wallpaper";

export const MAX_BACKUP_FILE_BYTES = 12 * 1024 * 1024;

const MAX_WALLPAPER_BACKUP_BYTES = 1024 * 1024;

export interface LocalSpendBackup {
  app: "LocalSpend";
  version: 1 | 2;
  exportedAt: string;
  profile: Pick<ProfileMeta, "id" | "displayName">;
  data: ProfileData;
}

export interface ProfileDataSummary {
  expenses: number;
  budgets: number;
  recurringRules: number;
  categories: number;
  wallpapers: number;
}

export interface RestoreBackupResult {
  data: ProfileData | null;
  error?: string;
  profileName?: string;
  exportedAt?: string;
  summary?: ProfileDataSummary;
}

type ValidationResult<T> = { value: T; error?: never } | { value?: never; error: string };

export function createBackup(profile: ProfileMeta, data: ProfileData, exportedAt = new Date().toISOString()): string {
  const backup: LocalSpendBackup = {
    app: "LocalSpend",
    version: 2,
    exportedAt,
    profile: {
      id: profile.id,
      displayName: profile.displayName
    },
    data: {
      ...data,
      appSettings: {
        ...data.appSettings,
        lastBackupAt: exportedAt
      },
      aiSettings: {
        ...data.aiSettings,
        apiKeySaved: false
      }
    }
  };
  return `${JSON.stringify(backup)}\n`;
}

export function summarizeProfileData(data: ProfileData): ProfileDataSummary {
  return {
    expenses: data.expenses.length,
    budgets: data.budgets.length,
    recurringRules: data.recurringRules.length,
    categories: data.categories.length,
    wallpapers: data.appSettings.wallpapers.length
  };
}

export function restoreBackup(json: string): RestoreBackupResult {
  if (utf8ByteLength(json) > MAX_BACKUP_FILE_BYTES) {
    return { data: null, error: "This backup is too large. Choose a LocalSpend backup under 12 MB." };
  }

  try {
    const parsed = JSON.parse(json) as unknown;
    if (!isRecord(parsed) || parsed.app !== "LocalSpend" || ![1, 2].includes(Number(parsed.version)) || !isRecord(parsed.data)) {
      return { data: null, error: "This does not look like a LocalSpend backup." };
    }
    if (typeof parsed.exportedAt !== "string" || !Number.isFinite(Date.parse(parsed.exportedAt))) {
      return { data: null, error: "This backup is missing a valid export date." };
    }

    const restored = normalizeBackupData(parsed.data, parsed.exportedAt);
    if (!restored.value) return { data: null, error: restored.error ?? "This backup could not be restored." };
    const restoredData = restored.value;

    const profile = isRecord(parsed.profile) ? parsed.profile : null;
    const profileName = typeof profile?.displayName === "string" ? profile.displayName.trim().slice(0, MAX_PROFILE_NAME_LENGTH) : undefined;
    return {
      data: restoredData,
      profileName: profileName || undefined,
      exportedAt: parsed.exportedAt,
      summary: summarizeProfileData(restoredData)
    };
  } catch {
    return { data: null, error: "The backup file is not valid JSON." };
  }
}

function normalizeBackupData(raw: Record<string, unknown>, exportedAt: string): ValidationResult<ProfileData> {
  const fallback = createDefaultProfileData();
  const rawSettings = isRecord(raw.appSettings) ? raw.appSettings : {};
  const currency = normalizeCurrencyCode(rawSettings.currency, fallback.appSettings.currency);

  const categoriesResult = normalizeBackupCategories(raw.categories);
  if (!categoriesResult.value) return { error: categoriesResult.error ?? "This backup has invalid category data." };
  const categories = categoriesResult.value;
  const categoryIds = new Set(categories.map((category) => category.id));

  const expensesResult = normalizeBackupExpenses(raw.expenses, currency, categoryIds);
  if (!expensesResult.value) return { error: expensesResult.error ?? "This backup has invalid expense data." };
  const expenses = expensesResult.value;

  const budgetsResult = normalizeBackupBudgets(raw.budgets, categoryIds);
  if (!budgetsResult.value) return { error: budgetsResult.error ?? "This backup has invalid budget data." };

  const recurringResult = normalizeBackupRecurringRules(raw.recurringRules, expenses, categoryIds);
  if (!recurringResult.value) return { error: recurringResult.error ?? "This backup has invalid bill data." };
  const recurringRules = recurringResult.value;
  const recurringIds = new Set(recurringRules.map((rule) => rule.id));

  const wallpapersResult = normalizeBackupWallpapers(rawSettings.wallpapers);
  if (!wallpapersResult.value) return { error: wallpapersResult.error ?? "This backup has invalid wallpaper data." };
  const wallpapers = wallpapersResult.value;
  const activeWallpaperId =
    typeof rawSettings.activeWallpaperId === "string" && wallpapers.some((wallpaper) => wallpaper.id === rawSettings.activeWallpaperId)
      ? rawSettings.activeWallpaperId
      : null;
  const paymentMethods = normalizeTextList(rawSettings.paymentMethods, fallback.appSettings.paymentMethods, MAX_PAYMENT_METHODS, MAX_PAYMENT_METHOD_LENGTH);
  const rawAiSettings = isRecord(raw.aiSettings) ? raw.aiSettings : {};

  return {
    value: {
      categories,
      expenses: expenses.map((expense) =>
        expense.recurringRuleId && !recurringIds.has(expense.recurringRuleId)
          ? { ...expense, recurringRuleId: null, recurringOccurrenceDate: null }
          : expense
      ),
      budgets: budgetsResult.value,
      recurringRules,
      appSettings: {
        ...fallback.appSettings,
        ...rawSettings,
        currency,
        enabledCurrencies: normalizeEnabledCurrencies(rawSettings.enabledCurrencies, currency),
        theme: normalizeTheme(rawSettings.theme),
        accentColor: normalizeColor(rawSettings.accentColor, fallback.appSettings.accentColor),
        accentPalette: normalizeAccentPalette(rawSettings.accentPalette),
        paymentMethods,
        wallpapers,
        activeWallpaperId,
        wallpaperOpacity: clampWallpaperOpacity(typeof rawSettings.wallpaperOpacity === "number" ? rawSettings.wallpaperOpacity : undefined),
        lastBackupAt: exportedAt
      },
      aiSettings: {
        ...fallback.aiSettings,
        ...rawAiSettings,
        provider: normalizeAiProvider(rawAiSettings.provider),
        baseUrl: normalizeNullableText(rawAiSettings.baseUrl, 500) || null,
        model: normalizeNullableText(rawAiSettings.model, 120) || null,
        timeoutMs: normalizeInteger(rawAiSettings.timeoutMs, fallback.aiSettings.timeoutMs, 1000, 120_000),
        maxTokens: normalizeInteger(rawAiSettings.maxTokens, fallback.aiSettings.maxTokens, 50, 4000),
        apiKeySaved: false
      }
    }
  };
}

function normalizeBackupCategories(value: unknown): ValidationResult<Category[]> {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PROFILE_CATEGORIES) {
    return { error: "This backup has invalid category data." };
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  const categories: Category[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) return { error: "This backup has invalid category data." };
    const id = normalizeRequiredText(item.id, 120);
    const name = normalizeRequiredText(item.name, MAX_CATEGORY_NAME_LENGTH);
    const color = typeof item.color === "string" && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color.toLowerCase() : null;
    const icon = normalizeNullableText(item.icon, MAX_CATEGORY_ICON_LENGTH);
    if (!id || !name || !color || icon === false || ids.has(id) || names.has(name.toLowerCase())) {
      return { error: "This backup has invalid or duplicate categories." };
    }
    ids.add(id);
    names.add(name.toLowerCase());
    categories.push({
      id,
      name,
      color,
      icon,
      sortOrder: Number.isInteger(item.sortOrder) ? Number(item.sortOrder) : index,
      isDefault: item.isDefault === true
    });
  }
  return { value: categories };
}

function normalizeBackupExpenses(value: unknown, baseCurrency: string, categoryIds: Set<string>): ValidationResult<Expense[]> {
  if (!Array.isArray(value) || value.length > MAX_PROFILE_RECORDS) return { error: "This backup has invalid expense data." };
  const normalized = normalizeExpenses(value, baseCurrency);
  if (normalized.length !== value.length) return { error: "This backup contains unreadable expense records." };
  const ids = new Set<string>();
  const expenses: Expense[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    const expense = normalized[index];
    if (!isRecord(raw) || !expense || ids.has(expense.id) || !isValidLocalIsoDate(expense.date) || !categoryIds.has(expense.categoryId)) {
      return { error: "This backup contains invalid or duplicate expense records." };
    }
    if (expense.baseCurrency !== baseCurrency || !isValidLocalIsoDate(expense.exchangeRateDate)) {
      return { error: "This backup contains incompatible currency data." };
    }
    const title = normalizeNullableText(raw.title, MAX_DESCRIPTION_LENGTH);
    const remark = normalizeNullableText(raw.remark, MAX_REMARK_LENGTH);
    const paymentMethod = normalizeNullableText(raw.paymentMethod, MAX_PAYMENT_METHOD_LENGTH);
    const recurringRuleId = normalizeNullableText(raw.recurringRuleId, 120);
    const recurringOccurrenceDate = normalizeNullableText(raw.recurringOccurrenceDate, 10);
    if (
      title === false ||
      remark === false ||
      paymentMethod === false ||
      recurringRuleId === false ||
      recurringOccurrenceDate === false ||
      (recurringOccurrenceDate !== null && !isValidLocalIsoDate(recurringOccurrenceDate)) ||
      !isValidTimestamp(expense.createdAt) ||
      !isValidTimestamp(expense.updatedAt)
    ) {
      return { error: "This backup contains invalid expense details." };
    }
    ids.add(expense.id);
    expenses.push({ ...expense, title, remark, paymentMethod, recurringRuleId, recurringOccurrenceDate });
  }
  return { value: expenses };
}

function normalizeBackupBudgets(value: unknown, categoryIds: Set<string>): ValidationResult<Budget[]> {
  if (!Array.isArray(value) || value.length > MAX_PROFILE_RECORDS) return { error: "This backup has invalid budget data." };
  const ids = new Set<string>();
  const budgets: Budget[] = [];
  for (const item of value) {
    if (!isRecord(item)) return { error: "This backup has invalid budget data." };
    const id = normalizeRequiredText(item.id, 120);
    const categoryId = normalizeNullableText(item.categoryId, 120);
    if (
      !id ||
      ids.has(id) ||
      typeof item.month !== "string" ||
      !isValidLocalIsoDate(`${item.month}-01`) ||
      categoryId === false ||
      (categoryId !== null && !categoryIds.has(categoryId)) ||
      typeof item.amount !== "number" ||
      !Number.isFinite(item.amount) ||
      item.amount <= 0
    ) {
      return { error: "This backup contains invalid or duplicate budgets." };
    }
    ids.add(id);
    budgets.push({ id, month: item.month, categoryId, amount: item.amount });
  }
  return { value: budgets };
}

function normalizeBackupRecurringRules(value: unknown, expenses: Expense[], categoryIds: Set<string>): ValidationResult<RecurringRule[]> {
  if (!Array.isArray(value) || value.length > MAX_PROFILE_RECORDS) return { error: "This backup has invalid bill data." };
  const normalized = normalizeRecurringRules(value, expenses);
  if (normalized.length !== value.length) return { error: "This backup contains unreadable bill records." };
  const ids = new Set<string>();
  const rules: RecurringRule[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    const rule = normalized[index];
    if (!isRecord(raw) || !rule || ids.has(rule.id) || !categoryIds.has(rule.categoryId)) {
      return { error: "This backup contains invalid or duplicate bills." };
    }
    const title = normalizeRequiredText(rule.title, MAX_DESCRIPTION_LENGTH);
    const remark = normalizeNullableText(raw.remark, MAX_REMARK_LENGTH);
    const paymentMethod = normalizeNullableText(raw.paymentMethod, MAX_PAYMENT_METHOD_LENGTH);
    const discardedDates = Array.isArray(raw.discardedDates) ? raw.discardedDates : [];
    if (
      !title ||
      remark === false ||
      paymentMethod === false ||
      typeof rule.amount !== "number" ||
      !Number.isFinite(rule.amount) ||
      rule.amount <= 0 ||
      !/^[A-Z]{3}$/.test(normalizeCurrencyCode(rule.currency, "")) ||
      !isRecurringCadence(rule.cadence) ||
      !isValidLocalIsoDate(rule.startDate) ||
      !isValidLocalIsoDate(rule.nextDate) ||
      discardedDates.some((date) => !isValidLocalIsoDate(date)) ||
      !isValidTimestamp(rule.createdAt) ||
      !isValidTimestamp(rule.updatedAt)
    ) {
      return { error: "This backup contains invalid bill details." };
    }
    ids.add(rule.id);
    rules.push({ ...rule, title, remark, paymentMethod });
  }
  return { value: rules };
}

function normalizeBackupWallpapers(value: unknown): ValidationResult<WallpaperImage[]> {
  if (value === undefined) return { value: [] };
  if (!Array.isArray(value)) return { error: "This backup has invalid wallpaper data." };
  const wallpapers: WallpaperImage[] = [];
  const ids = new Set<string>();
  for (const item of value.slice(0, MAX_WALLPAPERS)) {
    if (!isRecord(item)) return { error: "This backup has invalid wallpaper data." };
    const id = normalizeRequiredText(item.id, 120);
    const name = normalizeRequiredText(item.name, 80);
    if (
      !id ||
      !name ||
      ids.has(id) ||
      typeof item.dataUrl !== "string" ||
      !/^data:image\/(webp|jpeg|png);base64,/i.test(item.dataUrl) ||
      utf8ByteLength(item.dataUrl) > MAX_WALLPAPER_BACKUP_BYTES ||
      typeof item.mimeType !== "string" ||
      !/^image\/(webp|jpeg|png)$/i.test(item.mimeType) ||
      typeof item.sizeBytes !== "number" ||
      !Number.isFinite(item.sizeBytes) ||
      item.sizeBytes <= 0 ||
      item.sizeBytes > MAX_WALLPAPER_BACKUP_BYTES ||
      typeof item.createdAt !== "string" ||
      !isValidTimestamp(item.createdAt)
    ) {
      return { error: "This backup contains an invalid wallpaper." };
    }
    ids.add(id);
    wallpapers.push({
      id,
      name,
      dataUrl: item.dataUrl,
      mimeType: item.mimeType.toLowerCase(),
      sizeBytes: item.sizeBytes,
      createdAt: item.createdAt
    });
  }
  return { value: wallpapers };
}

function normalizeTextList(value: unknown, fallback: string[], maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const result: string[] = [];
  for (const item of value) {
    const text = normalizeRequiredText(item, maxLength);
    if (text && !result.some((existing) => existing.toLowerCase() === text.toLowerCase())) result.push(text);
    if (result.length >= maxItems) break;
  }
  return result.length > 0 ? result : [...fallback];
}

function normalizeRequiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function normalizeNullableText(value: unknown, maxLength: number): string | null | false {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text.length > maxLength) return false;
  return text || null;
}

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function normalizeInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function normalizeTheme(theme: unknown): ThemeKey {
  return theme === "dark" ? "dark" : "light";
}

function normalizeAiProvider(value: unknown): AiProvider {
  return ["none", "ollama-local", "gemini", "groq", "openrouter"].includes(String(value)) ? (value as AiProvider) : "none";
}

function isRecurringCadence(value: unknown): value is RecurringCadence {
  return ["daily", "weekly", "monthly", "annually"].includes(String(value));
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
