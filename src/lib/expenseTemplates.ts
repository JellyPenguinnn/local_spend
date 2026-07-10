import type { Expense } from "./types";

export function getFrequentExpenseTemplates(expenses: Expense[], limit = 3): Expense[] {
  const templates = new Map<string, { count: number; latest: Expense }>();
  for (const expense of expenses) {
    const key = `${expense.title?.trim().toLowerCase() || expense.categoryId}|${expense.categoryId}|${expense.paymentMethod ?? ""}`;
    const existing = templates.get(key);
    templates.set(key, {
      count: (existing?.count ?? 0) + 1,
      latest: !existing || expense.updatedAt > existing.latest.updatedAt ? expense : existing.latest
    });
  }
  return [...templates.values()]
    .sort((a, b) => b.count - a.count || b.latest.updatedAt.localeCompare(a.latest.updatedAt))
    .slice(0, limit)
    .map((item) => item.latest);
}
