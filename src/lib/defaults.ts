import type { AiSettings, AppSettings, Category, Expense, ProfileData, RecurringRule } from "./types";

export const DEFAULT_CURRENCY = "SGD";
export const DEFAULT_TIME_ZONE = "Asia/Singapore";
export const MAX_ACCENT_PALETTE_COLORS = 8;

export const DEFAULT_ACCENT_PALETTE = ["#2f5f8f", "#5d8b68", "#347f82", "#565d66", "#b76e79", "#725d8e", "#c6794f", "#7a6a42"];

export const DEFAULT_PAYMENT_METHODS = [
  "PayNow",
  "PayLah",
  "Apple Pay",
  "Credit Card",
  "Debit Card",
  "Bank Transfer",
  "Cash",
  "Other"
];

export const DEFAULT_CATEGORIES: Category[] = [
  ["cat_food_drinks", "Food & Drinks", "#ec7a5c", "🍜"],
  ["cat_transport", "Transport", "#4f8fcf", "🚌"],
  ["cat_groceries", "Groceries", "#53a86b", "🛒"],
  ["cat_shopping", "Shopping", "#c27ac9", "🛍️"],
  ["cat_household", "Household", "#b89b49", "🏠"],
  ["cat_school_work", "School / Work", "#5d8f86", "💼"],
  ["cat_entertainment", "Entertainment", "#e0a23b", "🎬"],
  ["cat_health", "Health", "#d45f75", "✚"],
  ["cat_travel", "Travel", "#4aa6b5", "✈️"],
  ["cat_bills", "Bills", "#8175cc", "🧾"],
  ["cat_rent_housing", "Rent / Housing", "#9a7d5a", "🏡"],
  ["cat_gifts", "Gifts", "#ef8bc2", "🎁"],
  ["cat_transfer", "Transfer", "#79808a", "⇄"],
  ["cat_other", "Other", "#8a98a8", "•"]
].map(([id, name, color, icon], index) => ({
  id,
  name,
  color,
  icon,
  sortOrder: index,
  isDefault: true
}));

export const DEFAULT_APP_SETTINGS: AppSettings = {
  currency: DEFAULT_CURRENCY,
  theme: "light",
  accentColor: "#315fbd",
  accentPalette: DEFAULT_ACCENT_PALETTE,
  paymentMethods: DEFAULT_PAYMENT_METHODS,
  wallpapers: [],
  activeWallpaperId: null,
  wallpaperOpacity: 0.34
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "none",
  baseUrl: null,
  model: null,
  timeoutMs: 10000,
  maxTokens: 450,
  apiKeySaved: false
};

export function createDefaultProfileData(): ProfileData {
  return {
    categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
    expenses: [],
    budgets: [],
    recurringRules: [],
    appSettings: {
      ...DEFAULT_APP_SETTINGS,
      accentPalette: [...DEFAULT_ACCENT_PALETTE],
      paymentMethods: [...DEFAULT_PAYMENT_METHODS]
    },
    aiSettings: { ...DEFAULT_AI_SETTINGS }
  };
}

export function normalizeAccentPalette(value: unknown): string[] {
  const source = Array.isArray(value) ? value : DEFAULT_ACCENT_PALETTE;
  const palette: string[] = [];
  for (const item of source) {
    if (typeof item !== "string") continue;
    const color = item.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(color)) continue;
    if (!palette.includes(color)) {
      palette.push(color);
    }
    if (palette.length >= MAX_ACCENT_PALETTE_COLORS) break;
  }
  return palette.length > 0 ? palette : [...DEFAULT_ACCENT_PALETTE];
}

export function normalizeRecurringRules(value: unknown, expenses: Expense[] = []): RecurringRule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const rule = item as Partial<RecurringRule>;
    if (
      typeof rule.id !== "string" ||
      typeof rule.title !== "string" ||
      typeof rule.amount !== "number" ||
      typeof rule.currency !== "string" ||
      typeof rule.categoryId !== "string" ||
      typeof rule.cadence !== "string" ||
      typeof rule.nextDate !== "string" ||
      typeof rule.createdAt !== "string" ||
      typeof rule.updatedAt !== "string"
    ) {
      return [];
    }
    const title = rule.title;
    const amount = rule.amount;
    const categoryId = rule.categoryId;
    const nextDate = rule.nextDate;
    const inferredStartDate = expenses
      .filter((expense) => {
        return (
          expense.amount === amount &&
          (expense.title ?? "").trim().toLowerCase() === title.trim().toLowerCase() &&
          expense.categoryId === categoryId &&
          (expense.paymentMethod ?? "") === (rule.paymentMethod ?? "")
        );
      })
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
    return [
      {
        ...rule,
        startDate: typeof rule.startDate === "string" ? rule.startDate : (inferredStartDate ?? nextDate),
        discardedDates: Array.isArray(rule.discardedDates)
          ? [...new Set(rule.discardedDates.filter((date): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort()
          : [],
        isActive: rule.isActive !== false
      } as RecurringRule
    ];
  });
}

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
