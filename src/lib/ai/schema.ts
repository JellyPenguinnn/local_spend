import type { ParsedExpenseDraft } from "../types";

export interface AiExpenseJson {
  amount: number;
  currency?: string;
  date: string;
  categoryName?: string;
  title?: string;
  remark?: string;
  paymentMethod?: string;
  confidence: number;
}

export interface AiCategoryJson {
  categoryName: string;
  confidence: number;
  reason: string;
}

export interface AiInsightsJson {
  comments: string[];
}

export const expenseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    amount: { type: "number" },
    currency: { type: "string", description: "ISO 4217 code only when explicitly stated" },
    date: { type: "string", description: "Local date in YYYY-MM-DD format" },
    categoryName: { type: "string" },
    title: { type: "string" },
    remark: { type: "string" },
    paymentMethod: { type: "string" },
    confidence: { type: "number" }
  },
  required: ["amount", "date", "confidence"]
};

export const categoryJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    categoryName: { type: "string" },
    confidence: { type: "number" },
    reason: { type: "string" }
  },
  required: ["categoryName", "confidence", "reason"]
};

export const insightsJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    comments: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" }
    }
  },
  required: ["comments"]
};

export function parseJsonObject(value: string): unknown {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("AI returned text instead of JSON.");
    }
    return JSON.parse(match[0]);
  }
}

export function validateAiExpenseJson(value: unknown): AiExpenseJson {
  if (!isRecord(value)) throw new Error("AI expense response was not an object.");
  if (typeof value.amount !== "number" || value.amount <= 0) throw new Error("AI response did not include a valid amount.");
  if (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw new Error("AI response did not include a valid date.");
  if (typeof value.confidence !== "number") throw new Error("AI response did not include confidence.");
  return {
    amount: value.amount,
    currency: normalizeCurrency(value.currency),
    date: value.date,
    categoryName: optionalString(value.categoryName),
    title: optionalString(value.title),
    remark: optionalString(value.remark),
    paymentMethod: optionalString(value.paymentMethod),
    confidence: clamp01(value.confidence)
  };
}

export function validateAiCategoryJson(value: unknown): AiCategoryJson {
  if (!isRecord(value)) throw new Error("AI category response was not an object.");
  if (typeof value.categoryName !== "string") throw new Error("AI response did not include a category name.");
  return {
    categoryName: value.categoryName,
    confidence: typeof value.confidence === "number" ? clamp01(value.confidence) : 0.4,
    reason: typeof value.reason === "string" ? value.reason : "AI suggestion"
  };
}

export function validateAiInsightsJson(value: unknown): AiInsightsJson {
  if (!isRecord(value) || !Array.isArray(value.comments)) {
    throw new Error("AI response did not include comments.");
  }
  const comments = value.comments.filter((comment): comment is string => typeof comment === "string").map((comment) => comment.trim()).filter(Boolean);
  if (comments.length === 0) {
    throw new Error("AI returned no usable comments.");
  }
  return { comments: comments.slice(0, 4) };
}

export function mapAiExpenseToDraft(value: AiExpenseJson, categoryId?: string): ParsedExpenseDraft {
  return {
    amount: value.amount,
    currency: value.currency,
    date: value.date,
    categoryId,
    categoryConfidence: categoryId ? value.confidence : undefined,
    title: value.title,
    remark: value.remark,
    paymentMethod: value.paymentMethod,
    confidence: value.confidence,
    source: "ai"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeCurrency(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : undefined;
}
