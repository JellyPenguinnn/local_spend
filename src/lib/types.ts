export type ViewKey = "today" | "calendar" | "summary" | "settings";

export type ThemeKey = "light" | "dark";

export type AiProvider = "none" | "ollama-local" | "gemini" | "groq" | "openrouter";

export type RecurringCadence = "daily" | "weekly" | "monthly" | "annually";

export type ExchangeRateSource = "base" | "ecb-reference" | "reference" | "cached" | "manual" | "legacy";

export interface ProfileMeta {
  id: string;
  displayName: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfilesState {
  activeProfileId: string | null;
  profiles: ProfileMeta[];
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  sortOrder: number;
  isDefault: boolean;
}

export interface Expense {
  id: string;
  /** Amount and currency as paid by the user. */
  amount: number;
  currency: string;
  /** Stable reporting value captured when the expense is saved. */
  baseAmount: number;
  baseCurrency: string;
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateSource: ExchangeRateSource;
  date: string;
  categoryId: string;
  title?: string | null;
  remark?: string | null;
  paymentMethod?: string | null;
  /** Stable link to the recurring occurrence that created or reconciled this expense. */
  recurringRuleId?: string | null;
  recurringOccurrenceDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  month: string;
  categoryId?: string | null;
  amount: number;
}

export interface RecurringRule {
  id: string;
  title: string;
  amount: number;
  currency: string;
  categoryId: string;
  remark?: string | null;
  paymentMethod?: string | null;
  cadence: RecurringCadence;
  dayOfMonth?: number | null;
  startDate: string;
  nextDate: string;
  discardedDates?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  /** Currency used by summaries, calendars, and budgets. */
  currency: string;
  enabledCurrencies: string[];
  theme: ThemeKey;
  accentColor: string;
  accentPalette: string[];
  paymentMethods: string[];
  wallpapers: WallpaperImage[];
  activeWallpaperId?: string | null;
  wallpaperOpacity: number;
  lastBackupAt?: string | null;
}

export interface WallpaperImage {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AiSettings {
  provider: AiProvider;
  baseUrl?: string | null;
  model?: string | null;
  timeoutMs: number;
  maxTokens: number;
  apiKeySaved: boolean;
}

export interface ProfileData {
  categories: Category[];
  expenses: Expense[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  appSettings: AppSettings;
  aiSettings: AiSettings;
}

export interface ExpenseDraft {
  amount: number | string;
  currency: string;
  baseAmount: number | string;
  date: string;
  categoryId: string;
  title: string;
  remark: string;
  paymentMethod: string;
}

export interface CategorySuggestion {
  categoryId: string;
  confidence: number;
  source: "local" | "ai";
  reason: string;
}

export interface ParsedExpenseDraft {
  amount?: number;
  currency?: string;
  date?: string;
  categoryId?: string;
  categoryConfidence?: number;
  title?: string;
  remark?: string;
  paymentMethod?: string;
  confidence: number;
  source: "local" | "ai";
}

export interface MonthlyAggregateForAi {
  month: string;
  currency: string;
  total: number;
  previousMonthTotal: number | null;
  topCategories: Array<{ name: string; total: number; percent: number }>;
  highSpendDays: Array<{ date: string; total: number }>;
}
