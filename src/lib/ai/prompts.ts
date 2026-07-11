import type { Category, MonthlyAggregateForAi } from "../types";

export function expenseParsePrompt(input: string, today: string, categories: Category[]): string {
  return [
    "Parse one personal expense into JSON only.",
    `Today is ${today} in Asia/Singapore.`,
    `Allowed categories: ${categories.map((category) => category.name).join(", ")}.`,
    "If the text says yesterday, use the date before today.",
    "Keep title as a short description: merchant/item keywords only. Remove amount, date, category, and payment words from title.",
    "Return currency as a three-letter ISO code only when the text clearly states it, such as RM/MYR or SGD.",
    "Extract paymentMethod only when the text clearly names one. Do not invent extra details.",
    `Expense text: ${input}`
  ].join("\n");
}

export function categoryPrompt(text: string, categories: Category[]): string {
  return [
    "Suggest exactly one category for this expense. Return JSON only.",
    `Allowed categories: ${categories.map((category) => category.name).join(", ")}.`,
    "Use a confidence between 0 and 1.",
    `Expense text: ${text}`
  ].join("\n");
}

export function monthlyInsightPrompt(aggregate: MonthlyAggregateForAi): string {
  return [
    "Write 2 to 4 concise spending observations as JSON only.",
    "Use the provided monthly aggregate only. Do not ask for more data.",
    "Keep each comment practical and under 120 characters.",
    JSON.stringify(aggregate)
  ].join("\n");
}
