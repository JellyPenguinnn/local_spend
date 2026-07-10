import type { Expense } from "./types";

export function mostUsedPaymentMethod(expenses: Expense[], paymentMethods: string[]): string {
  const fallback = paymentMethods.find((method) => method.toLowerCase() === "paynow") ?? paymentMethods[0] ?? "Other";
  const allowed = new Set(paymentMethods);
  const usage = new Map<string, { count: number; latest: string }>();
  for (const expense of expenses) {
    const method = expense.paymentMethod;
    if (!method || !allowed.has(method)) continue;
    const current = usage.get(method);
    usage.set(method, {
      count: (current?.count ?? 0) + 1,
      latest: current && current.latest > expense.updatedAt ? current.latest : expense.updatedAt
    });
  }
  return [...usage.entries()].sort((a, b) => b[1].count - a[1].count || b[1].latest.localeCompare(a[1].latest))[0]?.[0] ?? fallback;
}
