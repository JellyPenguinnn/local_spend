import { createId, nowIso } from "./defaults";
import { isValidLocalIsoDate } from "./date";
import { parseMoney, roundMoney } from "./money";
import type { Category, Expense } from "./types";

export const MAX_CSV_FILE_BYTES = 8 * 1024 * 1024;

const MAX_CSV_RECORDS = 100_000;
const MAX_TITLE_LENGTH = 240;
const MAX_REMARK_LENGTH = 1200;
const MAX_PAYMENT_METHOD_LENGTH = 80;

export interface CsvImportResult {
  expenses: Expense[];
  errors: string[];
}

export interface CsvMergeResult {
  expenses: Expense[];
  duplicateCount: number;
}

const CSV_HEADERS = [
  "date",
  "amount",
  "currency",
  "baseAmount",
  "baseCurrency",
  "exchangeRate",
  "exchangeRateDate",
  "exchangeRateSource",
  "category",
  "title",
  "remark",
  "paymentMethod"
];

export function exportExpensesCsv(expenses: Expense[], categories: Category[]): string {
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const rows = expenses
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((expense) => [
      expense.date,
      expense.amount.toFixed(2),
      expense.currency,
      expense.baseAmount.toFixed(2),
      expense.baseCurrency,
      expense.exchangeRate.toFixed(8).replace(/0+$/, "").replace(/\.$/, ""),
      expense.exchangeRateDate,
      expense.exchangeRateSource,
      categoryMap.get(expense.categoryId) ?? expense.categoryId,
      expense.title ?? "",
      expense.remark ?? "",
      expense.paymentMethod ?? ""
    ]);
  return `\uFEFF${[CSV_HEADERS, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

export function importExpensesCsv(csv: string, categories: Category[], fallbackCurrency: string): CsvImportResult {
  if (utf8ByteLength(csv) > MAX_CSV_FILE_BYTES) {
    return { expenses: [], errors: ["The CSV is too large. Choose a file under 8 MB."] };
  }
  const parsedCsv = parseCsv(csv);
  if (parsedCsv.error) return { expenses: [], errors: [parsedCsv.error] };
  const rows = parsedCsv.rows;
  const errors: string[] = [];
  if (rows.length === 0) {
    return { expenses: [], errors: ["The CSV file is empty."] };
  }
  if (rows.length - 1 > MAX_CSV_RECORDS) {
    return { expenses: [], errors: ["The CSV has too many rows. Import no more than 100,000 expenses at a time."] };
  }
  const headers = rows[0].map((header) => normalizeHeader(header));
  const dateIndex = headers.indexOf("date");
  const amountIndex = headers.indexOf("amount");
  const categoryIndex = headers.indexOf("category");
  const currencyIndex = headers.indexOf("currency");
  const baseAmountIndex = headers.indexOf("baseamount");
  const baseCurrencyIndex = headers.indexOf("basecurrency");
  const exchangeRateIndex = headers.indexOf("exchangerate");
  const exchangeRateDateIndex = headers.indexOf("exchangeratedate");
  const exchangeRateSourceIndex = headers.indexOf("exchangeratesource");
  const titleIndex = headers.indexOf("title");
  const remarkIndex = headers.indexOf("remark");
  const paymentIndex = headers.indexOf("paymentmethod");

  if (dateIndex < 0 || amountIndex < 0 || categoryIndex < 0) {
    return { expenses: [], errors: ["CSV must include date, amount, and category columns."] };
  }

  const categoryByName = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));
  const expenses: Expense[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every((cell) => cell.trim() === "")) {
      continue;
    }
    const line = index + 1;
    const date = row[dateIndex]?.trim();
    const amount = parseMoney(row[amountIndex] ?? "");
    const currency = (row[currencyIndex]?.trim() || fallbackCurrency).toUpperCase();
    const importedBaseAmount = baseAmountIndex >= 0 ? parseMoney(row[baseAmountIndex] ?? "") : null;
    const baseCurrency = (row[baseCurrencyIndex]?.trim() || fallbackCurrency).toUpperCase();
    const categoryText = decodeSpreadsheetText(row[categoryIndex]?.trim() ?? "");
    const categoryId = categoryByName.get(categoryText.toLowerCase()) ?? categories.find((category) => category.id === categoryText)?.id;
    const title = cleanOptional(decodeSpreadsheetText(row[titleIndex] ?? ""));
    const remark = cleanOptional(decodeSpreadsheetText(row[remarkIndex] ?? ""));
    const paymentMethod = cleanOptional(decodeSpreadsheetText(row[paymentIndex] ?? ""));

    if (!isValidLocalIsoDate(date)) {
      errors.push(`Line ${line}: date must be YYYY-MM-DD.`);
      continue;
    }
    if (amount === null) {
      errors.push(`Line ${line}: amount must be a positive number.`);
      continue;
    }
    if (!/^[A-Z]{3}$/.test(currency) || !/^[A-Z]{3}$/.test(baseCurrency)) {
      errors.push(`Line ${line}: currency must use a three-letter code.`);
      continue;
    }
    if (!categoryId) {
      errors.push(`Line ${line}: category "${categoryText}" was not found.`);
      continue;
    }
    if (baseCurrency !== fallbackCurrency.toUpperCase()) {
      errors.push(`Line ${line}: baseCurrency must match this profile's ${fallbackCurrency.toUpperCase()} base currency.`);
      continue;
    }
    if (currency !== baseCurrency && importedBaseAmount === null) {
      errors.push(`Line ${line}: baseAmount is required when currency differs from ${baseCurrency}.`);
      continue;
    }
    if (currency === baseCurrency && importedBaseAmount !== null && importedBaseAmount !== amount) {
      errors.push(`Line ${line}: baseAmount must equal amount when both use ${baseCurrency}.`);
      continue;
    }

    const exchangeRateDate = row[exchangeRateDateIndex]?.trim() || date;
    if (!isValidLocalIsoDate(exchangeRateDate)) {
      errors.push(`Line ${line}: exchangeRateDate must be YYYY-MM-DD.`);
      continue;
    }

    const baseAmount = importedBaseAmount ?? amount;
    const importedRate = exchangeRateIndex >= 0 && row[exchangeRateIndex]?.trim() ? Number(row[exchangeRateIndex]) : baseAmount / amount;
    if (!Number.isFinite(importedRate) || importedRate <= 0) {
      errors.push(`Line ${line}: exchangeRate must be a positive number.`);
      continue;
    }
    if (
      (title?.length ?? 0) > MAX_TITLE_LENGTH ||
      (remark?.length ?? 0) > MAX_REMARK_LENGTH ||
      (paymentMethod?.length ?? 0) > MAX_PAYMENT_METHOD_LENGTH
    ) {
      errors.push(`Line ${line}: description, remark, or payment text is too long.`);
      continue;
    }
    const exchangeRate = baseAmount / amount;
    const exchangeRateSourceText = row[exchangeRateSourceIndex]?.trim();

    const timestamp = nowIso();
    expenses.push({
      id: createId("exp"),
      date,
      amount: roundMoney(amount),
      currency,
      baseAmount: roundMoney(baseAmount),
      baseCurrency,
      exchangeRate,
      exchangeRateDate,
      exchangeRateSource: isExchangeRateSource(exchangeRateSourceText) ? exchangeRateSourceText : currency === baseCurrency ? "base" : "manual",
      categoryId,
      title,
      remark,
      paymentMethod,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }
  return { expenses, errors };
}

export function findNewImportedExpenses(imported: Expense[], existing: Expense[]): CsvMergeResult {
  const expenses: Expense[] = [];
  let duplicateCount = 0;
  for (const expense of imported) {
    if (isDuplicateImportedExpense(expense, [...existing, ...expenses])) {
      duplicateCount += 1;
    } else {
      expenses.push(expense);
    }
  }
  return { expenses, duplicateCount };
}

function isDuplicateImportedExpense(expense: Expense, existing: Expense[]): boolean {
  const normalizedText = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";
  return existing.some((item) => {
    return (
      item.date === expense.date &&
      item.amount === expense.amount &&
      item.currency === expense.currency &&
      item.categoryId === expense.categoryId &&
      normalizedText(item.title) === normalizedText(expense.title) &&
      normalizedText(item.remark) === normalizedText(expense.remark) &&
      normalizedText(item.paymentMethod) === normalizedText(expense.paymentMethod)
    );
  });
}

function isExchangeRateSource(value: string | undefined): value is Expense["exchangeRateSource"] {
  return ["base", "ecb-reference", "reference", "cached", "manual", "legacy"].includes(value ?? "");
}

function csvEscape(value: string): string {
  const safeValue = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  if (/[",\n]/.test(safeValue)) {
    return `"${safeValue.replaceAll('"', '""')}"`;
  }
  return safeValue;
}

function parseCsv(csv: string): { rows: string[][]; error?: string } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (inQuotes) return { rows: [], error: "The CSV has an unfinished quoted value." };
  row.push(cell);
  rows.push(row);
  return { rows };
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s_-]/g, "");
}

function cleanOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function decodeSpreadsheetText(value: string): string {
  return /^'[=+\-@\t\r]/u.test(value) ? value.slice(1) : value;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
