import { createId, nowIso } from "./defaults";
import { parseMoney, roundMoney } from "./money";
import type { Category, Expense } from "./types";

export interface CsvImportResult {
  expenses: Expense[];
  errors: string[];
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
  return [CSV_HEADERS, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function importExpensesCsv(csv: string, categories: Category[], fallbackCurrency: string): CsvImportResult {
  const rows = parseCsv(csv);
  const errors: string[] = [];
  if (rows.length === 0) {
    return { expenses: [], errors: ["The CSV file is empty."] };
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
    const categoryText = row[categoryIndex]?.trim() ?? "";
    const categoryId = categoryByName.get(categoryText.toLowerCase()) ?? categories.find((category) => category.id === categoryText)?.id;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Line ${line}: date must be YYYY-MM-DD.`);
      continue;
    }
    if (amount === null) {
      errors.push(`Line ${line}: amount must be a positive number.`);
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

    const baseAmount = importedBaseAmount ?? amount;
    const importedRate = exchangeRateIndex >= 0 ? Number(row[exchangeRateIndex]) : Number.NaN;
    const exchangeRate = Number.isFinite(importedRate) && importedRate > 0 ? importedRate : baseAmount / amount;
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
      exchangeRateDate: row[exchangeRateDateIndex]?.trim() || date,
      exchangeRateSource: isExchangeRateSource(exchangeRateSourceText) ? exchangeRateSourceText : currency === baseCurrency ? "base" : "manual",
      categoryId,
      title: cleanOptional(row[titleIndex]),
      remark: cleanOptional(row[remarkIndex]),
      paymentMethod: cleanOptional(row[paymentIndex]),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }
  return { expenses, errors };
}

function isExchangeRateSource(value: string | undefined): value is Expense["exchangeRateSource"] {
  return ["base", "ecb-reference", "reference", "cached", "manual", "legacy"].includes(value ?? "");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function parseCsv(csv: string): string[][] {
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
  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function cleanOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
