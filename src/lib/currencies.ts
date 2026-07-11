import { roundMoney } from "./money";
import { formatLocalIsoDate } from "./date";
import type { ExchangeRateSource, Expense } from "./types";

export interface CurrencyOption {
  code: string;
  label: string;
}

export interface ExchangeRateQuote {
  rate: number;
  date: string;
  source: Extract<ExchangeRateSource, "base" | "ecb-reference" | "reference" | "cached">;
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: "SGD", label: "SGD - Singapore dollar" },
  { code: "MYR", label: "MYR - Malaysian ringgit" },
  { code: "USD", label: "USD - US dollar" },
  { code: "EUR", label: "EUR - Euro" },
  { code: "GBP", label: "GBP - British pound" },
  { code: "JPY", label: "JPY - Japanese yen" },
  { code: "AUD", label: "AUD - Australian dollar" },
  { code: "CAD", label: "CAD - Canadian dollar" },
  { code: "CNY", label: "CNY - Chinese yuan" },
  { code: "HKD", label: "HKD - Hong Kong dollar" },
  { code: "THB", label: "THB - Thai baht" },
  { code: "IDR", label: "IDR - Indonesian rupiah" },
  { code: "PHP", label: "PHP - Philippine peso" },
  { code: "KRW", label: "KRW - South Korean won" },
  { code: "TWD", label: "TWD - Taiwan dollar" }
];

const RATE_CACHE_KEY = "localspend.exchange-rates.v1";
const CURRENT_RATE_CACHE_TTL_MS = 30 * 60 * 1000;

interface CachedExchangeRate {
  rate: number;
  date: string;
  source?: ExchangeRateQuote["source"];
  fetchedAt?: string;
}

export function normalizeCurrencyCode(value: unknown, fallback = "SGD"): string {
  if (typeof value !== "string") return fallback;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
}

export function normalizeEnabledCurrencies(value: unknown, baseCurrency: string): string[] {
  const base = normalizeCurrencyCode(baseCurrency);
  const source = Array.isArray(value) ? value : base === "SGD" ? ["SGD", "MYR"] : [base];
  const currencies = source
    .map((item) => normalizeCurrencyCode(item, ""))
    .filter((item, index, all) => Boolean(item) && all.indexOf(item) === index && CURRENCY_OPTIONS.some((option) => option.code === item));
  if (!currencies.includes(base)) currencies.unshift(base);
  return currencies.length > 0 ? currencies : [base];
}

export function expenseBaseAmount(expense: Expense): number {
  return roundMoney(Number.isFinite(expense.baseAmount) ? expense.baseAmount : expense.amount);
}

export function normalizeExpenses(value: unknown, baseCurrency: string): Expense[] {
  if (!Array.isArray(value)) return [];
  const base = normalizeCurrencyCode(baseCurrency);
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const expense = item as Partial<Expense>;
    if (
      typeof expense.id !== "string" ||
      typeof expense.amount !== "number" ||
      !Number.isFinite(expense.amount) ||
      expense.amount <= 0 ||
      typeof expense.date !== "string" ||
      typeof expense.categoryId !== "string" ||
      typeof expense.createdAt !== "string" ||
      typeof expense.updatedAt !== "string"
    ) {
      return [];
    }
    const currency = normalizeCurrencyCode(expense.currency, base);
    const storedBaseCurrency = normalizeCurrencyCode(expense.baseCurrency, base);
    const baseAmount =
      typeof expense.baseAmount === "number" && Number.isFinite(expense.baseAmount) && expense.baseAmount > 0
        ? roundMoney(expense.baseAmount)
        : roundMoney(expense.amount);
    const exchangeRate =
      typeof expense.exchangeRate === "number" && Number.isFinite(expense.exchangeRate) && expense.exchangeRate > 0
        ? expense.exchangeRate
        : currency === storedBaseCurrency
          ? 1
          : baseAmount / expense.amount;
    return [
      {
        ...expense,
        amount: roundMoney(expense.amount),
        currency,
        baseAmount,
        baseCurrency: storedBaseCurrency,
        exchangeRate,
        exchangeRateDate: typeof expense.exchangeRateDate === "string" ? expense.exchangeRateDate : expense.date,
        exchangeRateSource: normalizeExchangeRateSource(expense.exchangeRateSource, currency === storedBaseCurrency ? "base" : "legacy")
      } as Expense
    ];
  });
}

export function isForeignExpense(expense: Expense, reportingCurrency: string): boolean {
  return normalizeCurrencyCode(expense.currency) !== normalizeCurrencyCode(reportingCurrency);
}

export function latestKnownRate(expenses: Expense[], fromCurrency: string, toCurrency: string, onOrBeforeDate: string): ExchangeRateQuote | null {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  const match = expenses
    .filter(
      (expense) =>
        expense.currency === from &&
        expense.baseCurrency === to &&
        expense.date <= onOrBeforeDate &&
        Number.isFinite(expense.exchangeRate) &&
        expense.exchangeRate > 0
    )
    .sort((a, b) => b.exchangeRateDate.localeCompare(a.exchangeRateDate) || b.date.localeCompare(a.date))[0];
  return match
    ? {
        rate: match.exchangeRate,
        date: match.exchangeRateDate,
        source: "cached"
      }
    : null;
}

export function latestCachedRate(fromCurrency: string, toCurrency: string, onOrBeforeDate: string): ExchangeRateQuote | null {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  const prefix = `${from}:${to}:`;
  const match = Object.entries(readRateCache())
    .flatMap(([key, quote]) => {
      if (!key.startsWith(prefix) || !Number.isFinite(quote.rate) || quote.rate <= 0 || typeof quote.date !== "string") return [];
      const requestedDate = key.slice(prefix.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || requestedDate > onOrBeforeDate) return [];
      return [{ requestedDate, quote }];
    })
    .sort((a, b) => b.requestedDate.localeCompare(a.requestedDate))[0];

  return match
    ? {
        rate: match.quote.rate,
        date: match.quote.date,
        source: "cached"
      }
    : null;
}

export async function fetchReferenceRate(
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<ExchangeRateQuote> {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  if (from === to) return { rate: 1, date, source: "base" };

  const cacheKey = `${from}:${to}:${date}`;
  const cached = readRateCache()[cacheKey];
  if (isReusableCachedRate(cached, date)) {
    return {
      rate: cached.rate,
      date: cached.date,
      source: normalizeCachedSource(cached.source)
    };
  }

  let quote: ExchangeRateQuote;
  try {
    quote = await requestRate(from, to, date, true);
  } catch (error) {
    if (!(error instanceof ProviderCoverageError)) throw error;
    quote = await requestRate(from, to, date, false);
  }
  writeRateCache(cacheKey, quote);
  return quote;
}

async function requestRate(from: string, to: string, date: string, ecbOnly: boolean): Promise<ExchangeRateQuote> {
  const query = new URLSearchParams({ date });
  if (ecbOnly) query.set("providers", "ECB");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  let response: Response;
  try {
    response = await fetch(`https://api.frankfurter.dev/v2/rate/${from}/${to}?${query.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    if (ecbOnly && [400, 404, 422].includes(response.status)) throw new ProviderCoverageError();
    throw new Error("Reference rate unavailable.");
  }
  const value = (await response.json()) as { date?: unknown; rate?: unknown };
  if (
    typeof value.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
    value.date > date ||
    typeof value.rate !== "number" ||
    !Number.isFinite(value.rate) ||
    value.rate <= 0
  ) {
    throw new Error("Reference rate response was invalid.");
  }
  return {
    rate: value.rate,
    date: value.date,
    source: ecbOnly ? "ecb-reference" : "reference"
  };
}

class ProviderCoverageError extends Error {}

function readRateCache(): Record<string, CachedExchangeRate> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(RATE_CACHE_KEY) ?? "{}") as Record<string, CachedExchangeRate>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRateCache(key: string, quote: ExchangeRateQuote): void {
  if (typeof localStorage === "undefined") return;
  const cache = readRateCache();
  cache[key] = { rate: quote.rate, date: quote.date, source: quote.source, fetchedAt: new Date().toISOString() };
  const entries = Object.entries(cache).slice(-180);
  localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

function isReusableCachedRate(cached: CachedExchangeRate | undefined, requestedDate: string): cached is CachedExchangeRate {
  if (!cached || !Number.isFinite(cached.rate) || cached.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(cached.date)) return false;
  if (requestedDate < formatLocalIsoDate()) return true;
  if (!cached.fetchedAt) return false;
  const fetchedAt = Date.parse(cached.fetchedAt);
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt >= 0 && Date.now() - fetchedAt < CURRENT_RATE_CACHE_TTL_MS;
}

function normalizeCachedSource(source: ExchangeRateQuote["source"] | undefined): ExchangeRateQuote["source"] {
  return source === "ecb-reference" || source === "reference" ? source : "cached";
}

function normalizeExchangeRateSource(value: unknown, fallback: ExchangeRateSource): ExchangeRateSource {
  if (["base", "ecb-reference", "reference", "cached", "manual", "legacy"].includes(String(value))) {
    return value as ExchangeRateSource;
  }
  return fallback;
}
