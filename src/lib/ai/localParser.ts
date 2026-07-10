import { addDays, formatLocalIsoDate, parseLocalDate, toIsoDate } from "../date";
import { roundMoney } from "../money";
import { suggestCategoryLocal } from "../categories";
import type { Category, ParsedExpenseDraft } from "../types";

interface AmountMatch {
  amount: number;
  raw: string;
  index: number;
  score: number;
}

interface PaymentAlias {
  method: string;
  keywords: string[];
}

const DEFAULT_PAYMENT_ALIASES: PaymentAlias[] = [
  { method: "PayNow", keywords: ["paynow", "pay now", "paynow lah", "paynow qr"] },
  { method: "PayLah", keywords: ["paylah", "pay lah", "dbs paylah", "paylah qr"] },
  { method: "Apple Pay", keywords: ["apple pay", "applepay", "apple wallet"] },
  { method: "Credit Card", keywords: ["credit card", "cc", "visa", "mastercard", "master card", "amex", "card", "paywave"] },
  { method: "NETS", keywords: ["nets", "nets qr"] },
  { method: "Debit Card", keywords: ["debit card", "debit", "nets"] },
  { method: "Bank Transfer", keywords: ["bank transfer", "bank xfer", "ibanking", "internet banking", "fast transfer", "giro"] },
  { method: "Cash", keywords: ["cash", "coins", "notes"] },
  { method: "GrabPay", keywords: ["grabpay", "grab pay"] },
  { method: "Google Pay", keywords: ["google pay", "gpay"] },
  { method: "FavePay", keywords: ["favepay", "fave pay"] },
  { method: "ShopBack Pay", keywords: ["shopback pay", "shopback"] },
  { method: "OCBC Pay Anyone", keywords: ["ocbc pay anyone", "pay anyone"] },
  { method: "UOB TMRW", keywords: ["uob tmrrw", "uob tmrw"] }
];

const MONTHS = new Map(
  [
    "jan",
    "january",
    "feb",
    "february",
    "mar",
    "march",
    "apr",
    "april",
    "may",
    "jun",
    "june",
    "jul",
    "july",
    "aug",
    "august",
    "sep",
    "september",
    "oct",
    "october",
    "nov",
    "november",
    "dec",
    "december"
  ].map((name, index) => [name, Math.floor(index / 2)])
);

const MONTH_PATTERN = Array.from(MONTHS.keys()).sort((a, b) => b.length - a.length).join("|");
const MONEY_WORDS = ["sgd", "myr", "rm", "dollar", "dollars", "bucks"];
const WEEKDAYS: Map<string, number> = new Map(
  [
    ["sun", 0],
    ["sunday", 0],
    ["mon", 1],
    ["monday", 1],
    ["tue", 2],
    ["tues", 2],
    ["tuesday", 2],
    ["wed", 3],
    ["wednesday", 3],
    ["thu", 4],
    ["thur", 4],
    ["thurs", 4],
    ["thursday", 4],
    ["fri", 5],
    ["friday", 5],
    ["sat", 6],
    ["saturday", 6]
  ] as const
);
const WEEKDAY_PATTERN = Array.from(WEEKDAYS.keys()).sort((a, b) => b.length - a.length).join("|");

export function parseExpenseLocal(input: string, categories: Category[], today = formatLocalIsoDate(), paymentMethods: string[] = []): ParsedExpenseDraft | null {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const amountMatch = findAmount(text);
  if (!amountMatch) return null;

  const paymentAliases = buildPaymentAliases(paymentMethods);
  const categorySuggestion = suggestCategoryLocal(text, categories);
  const paymentMethod = parsePaymentMethod(text, paymentAliases);
  const date = parseNaturalDate(text, today);
  const title = cleanTitle(removeSlice(text, amountMatch.index, amountMatch.raw.length), categories, paymentAliases);

  const confidence = Math.min(
    0.94,
    0.56 +
      (categorySuggestion ? 0.16 : 0) +
      (paymentMethod ? 0.08 : 0) +
      (date !== today ? 0.04 : 0) +
      (title ? 0.06 : 0) +
      Math.min(0.1, amountMatch.score / 40)
  );

  return {
    amount: amountMatch.amount,
    date,
    categoryId: categorySuggestion?.categoryId,
    categoryConfidence: categorySuggestion?.confidence,
    title,
    paymentMethod,
    confidence,
    source: "local"
  };
}

function findAmount(text: string): AmountMatch | null {
  const currencyCandidates = collectCurrencyAmounts(text);
  if (currencyCandidates.length > 0) {
    return currencyCandidates.sort(sortAmountCandidates)[0];
  }

  const candidates = [...collectDecimalAmounts(text), ...collectIntegerAmounts(text)];
  return candidates.sort(sortAmountCandidates)[0] ?? null;
}

function collectCurrencyAmounts(text: string): AmountMatch[] {
  const candidates: AmountMatch[] = [];
  const pattern = /(?:\b(?:sgd|myr|rm)\s*|\bs\$\s*|\$\s*)([0-9][0-9,]*(?:\.\d{1,2})?)\b|\b([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:sgd|myr|rm)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const rawAmount = match[1] ?? match[2];
    const amount = parseAmount(rawAmount);
    if (amount === null) continue;
    candidates.push({
      amount,
      raw: match[0],
      index: match.index ?? 0,
      score: 8 + (rawAmount.includes(".") ? 1 : 0)
    });
  }
  return candidates;
}

function collectDecimalAmounts(text: string): AmountMatch[] {
  const candidates: AmountMatch[] = [];
  for (const match of text.matchAll(/\b\d[\d,]*\.\d{1,2}\b/g)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const amount = parseAmount(raw);
    if (amount === null || isDateLikeNumber(text, index, raw)) continue;
    candidates.push({ amount, raw, index, score: scoreAmountCandidate(text, index, raw, 5) });
  }
  return candidates;
}

function collectIntegerAmounts(text: string): AmountMatch[] {
  const candidates: AmountMatch[] = [];
  for (const match of text.matchAll(/\b\d{1,6}\b/g)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const amount = parseAmount(raw);
    if (amount === null || isDateLikeNumber(text, index, raw)) continue;
    candidates.push({ amount, raw, index, score: scoreAmountCandidate(text, index, raw, 2) });
  }
  return candidates;
}

function parseAmount(raw: string): number | null {
  const amount = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return roundMoney(amount);
}

function scoreAmountCandidate(text: string, index: number, raw: string, base: number): number {
  const amount = Number(raw.replace(/,/g, ""));
  const previous = previousWord(text, index);
  const next = nextWord(text, index + raw.length);
  let score = base;
  if (amount >= 100) score += 0.8;
  if (["paid", "pay", "spent", "spend", "cost", "costs", "for"].includes(previous)) score += 0.7;
  if (MONEY_WORDS.includes(next)) score += 1.2;
  if (previous === "for" && amount <= 12) score -= 1.4;
  if (["pax", "people", "person", "persons"].includes(next)) score -= 1.8;
  return score;
}

function sortAmountCandidates(a: AmountMatch, b: AmountMatch): number {
  return b.score - a.score || a.index - b.index;
}

function isDateLikeNumber(text: string, index: number, raw: string): boolean {
  const amount = Number(raw.replace(/,/g, ""));
  const before = text[index - 1] ?? "";
  const after = text[index + raw.length] ?? "";
  const previous = previousWord(text, index);
  const next = nextWord(text, index + raw.length);
  const beforeText = text.slice(Math.max(0, index - 8), index).toLowerCase();

  if (["/", "-", ":"].includes(before) || ["/", "-", ":"].includes(after)) return true;
  if (amount >= 1900 && amount <= 2100) return true;
  if (amount <= 31 && (MONTHS.has(previous) || MONTHS.has(next))) return true;
  if (amount <= 31 && /\bon\s*$/.test(beforeText)) return true;
  if (amount <= 24 && ["am", "pm"].includes(next)) return true;

  return false;
}

export function parseNaturalDate(text: string, today = formatLocalIsoDate()): string {
  const lower = text.toLowerCase();
  if (/\b(last night)\b/.test(lower)) return addDays(today, -1);
  if (/\b(yesterday|ytd)\b/.test(lower)) return addDays(today, -1);
  if (/\b(today|tdy)\b/.test(lower)) return today;
  if (/\b(tomorrow|tmr)\b/.test(lower)) return addDays(today, 1);

  const daysAgo = lower.match(/\b(\d{1,2})\s*(?:days?|d)\s+ago\b/);
  if (daysAgo) {
    return addDays(today, -Number(daysAgo[1]));
  }

  const weekday = lower.match(new RegExp(`\\b(last\\s+)?(${WEEKDAY_PATTERN})\\b`));
  if (weekday) {
    const targetDay = WEEKDAYS.get(weekday[2]);
    if (targetDay !== undefined) {
      const todayDay = parseLocalDate(today).getDay();
      let diff = (todayDay - targetDay + 7) % 7;
      if (weekday[1] || diff === 0) diff = diff === 0 ? 7 : diff;
      return addDays(today, -diff);
    }
  }

  const explicit = lower.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (explicit) {
    return safeToIsoDate(Number(explicit[1]), Number(explicit[2]) - 1, Number(explicit[3])) ?? today;
  }

  const slashDate = lower.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/);
  if (slashDate) {
    const base = parseLocalDate(today);
    const year = slashDate[3] ? normalizeYear(Number(slashDate[3])) : base.getFullYear();
    const parsed = safeToIsoDate(year, Number(slashDate[2]) - 1, Number(slashDate[1]));
    if (parsed) return parsed;
  }

  const dayMonth = lower.match(new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})(?:\\s+(\\d{2,4}))?\\b`));
  if (dayMonth) {
    const base = parseLocalDate(today);
    const monthIndex = MONTHS.get(dayMonth[2]);
    const year = dayMonth[3] ? normalizeYear(Number(dayMonth[3])) : base.getFullYear();
    if (monthIndex !== undefined) {
      return safeToIsoDate(year, monthIndex, Number(dayMonth[1])) ?? today;
    }
  }

  const monthDay = lower.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{2,4}))?\\b`));
  if (monthDay) {
    const base = parseLocalDate(today);
    const monthIndex = MONTHS.get(monthDay[1]);
    const year = monthDay[3] ? normalizeYear(Number(monthDay[3])) : base.getFullYear();
    if (monthIndex !== undefined) {
      return safeToIsoDate(year, monthIndex, Number(monthDay[2])) ?? today;
    }
  }

  return today;
}

function cleanTitle(value: string, categories: Category[], paymentAliases: PaymentAlias[]): string | undefined {
  let cleaned = value
    .replace(/\b(?:yesterday|ytd|today|tdy|tomorrow)\b/gi, " ")
    .replace(/\b(?:last night|tmr)\b/gi, " ")
    .replace(/\b\d{1,2}\s*(?:days?|d)\s+ago\b/gi, " ")
    .replace(new RegExp(`\\b(?:last\\s+)?(?:${WEEKDAY_PATTERN})\\b`, "gi"), " ")
    .replace(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/g, " ")
    .replace(new RegExp(`\\b(?:on\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_PATTERN})(?:\\s+\\d{2,4})?\\b`, "gi"), " ")
    .replace(new RegExp(`\\b(?:${MONTH_PATTERN})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{2,4})?\\b`, "gi"), " ");

  for (const alias of paymentAliases) {
    for (const keyword of alias.keywords) {
      cleaned = removeKeyword(cleaned, keyword);
    }
  }

  cleaned = moveMerchantToFront(cleaned);
  cleaned = removeExplicitCategoryWords(cleaned, categories);

  cleaned = cleaned
    .replace(/\b([a-z]+)'s\b/gi, "$1")
    .replace(/\b(?:paid|pay|spent|spend|buy|bought|purchase|category|cat|as|via|using|use|by)\b/gi, " ")
    .replace(/\b(?:at|from|on)\b/gi, " ")
    .replace(/\b(?:sgd|myr|rm|dollars?|bucks)\b/gi, " ")
    .replace(/[$]/g, " ")
    .replace(/[,:;!()"]/g, " ")
    .replace(/\s*[|·]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return undefined;
  return truncateTitle(cleaned, 48);
}

function moveMerchantToFront(value: string): string {
  const match = value.trim().match(/^(.*?)\s+(?:at|from|@)\s+(.+)$/i);
  if (!match) return value;
  const item = match[1].trim();
  const merchant = match[2].trim();
  if (!item || !merchant) return value;
  return `${merchant} ${item}`;
}

function removeExplicitCategoryWords(value: string, categories: Category[]): string {
  let cleaned = value;
  const words = new Set<string>();
  for (const category of categories) {
    for (const part of category.name.split(/[&/]/)) {
      const word = part.trim();
      if (word.length >= 4) words.add(word);
    }
  }
  for (const word of words) {
    if (countWords(cleaned) <= 1) break;
    cleaned = removeKeyword(cleaned, word);
  }
  return cleaned;
}

function parsePaymentMethod(value: string, paymentAliases: PaymentAlias[]): string | undefined {
  const normalized = normalizeSearchText(value);
  let best: { method: string; score: number } | undefined;
  for (const alias of paymentAliases) {
    for (const keyword of alias.keywords) {
      if (!hasKeyword(normalized, keyword)) continue;
      const score = normalizeSearchText(keyword).length;
      if (!best || score > best.score) {
        best = { method: alias.method, score };
      }
    }
  }
  return best?.method;
}

function buildPaymentAliases(paymentMethods: string[]): PaymentAlias[] {
  const available = new Map(paymentMethods.map((method) => [method.toLowerCase(), method]));
  const aliases: PaymentAlias[] = [];

  for (const alias of DEFAULT_PAYMENT_ALIASES) {
    const method = available.get(alias.method.toLowerCase()) ?? (paymentMethods.length === 0 ? alias.method : null);
    if (method) aliases.push({ method, keywords: alias.keywords });
  }

  for (const method of paymentMethods) {
    const trimmed = method.trim();
    if (!trimmed) continue;
    aliases.push({
      method: trimmed,
      keywords: Array.from(new Set([trimmed, trimmed.replace(/\s+/g, ""), normalizeSearchText(trimmed)]))
    });
  }

  const seen = new Set<string>();
  return aliases.map((alias) => ({
    method: alias.method,
    keywords: alias.keywords.filter((keyword) => {
      const key = `${alias.method.toLowerCase()}::${normalizeSearchText(keyword)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return Boolean(normalizeSearchText(keyword));
    })
  }));
}

function removeKeyword(value: string, keyword: string): string {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return value;
  return value.replace(new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}(?=$|[^a-z0-9])`, "gi"), " ");
}

function hasKeyword(normalizedText: string, keyword: string): boolean {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return false;
  return ` ${normalizedText} `.includes(` ${normalizedKeyword} `);
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeToIsoDate(year: number, monthIndex: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2100 || monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const iso = toIsoDate(year, monthIndex, day);
  const parsed = parseLocalDate(iso);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== monthIndex || parsed.getDate() !== day) return null;
  return iso;
}

function normalizeYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function previousWord(text: string, index: number): string {
  return text
    .slice(0, index)
    .trim()
    .split(/\s+/)
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z]/g, "") ?? "";
}

function nextWord(text: string, index: number): string {
  return text
    .slice(index)
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/[^a-z]/g, "") ?? "";
}

function removeSlice(text: string, index: number, length: number): string {
  return `${text.slice(0, index)} ${text.slice(index + length)}`;
}

function countWords(value: string): number {
  return normalizeSearchText(value).split(" ").filter(Boolean).length;
}

function truncateTitle(title: string, maxLength: number): string {
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength).replace(/\s+\S*$/, "").trim() || title.slice(0, maxLength).trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
