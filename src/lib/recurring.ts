import { addDays, addMonthsClamped, compareIsoDates } from "./date";
import { createId, nowIso } from "./defaults";
import type { Expense, ProfileData, RecurringRule } from "./types";

export function nextRecurringDate(rule: RecurringRule): string {
  if (rule.cadence === "daily") {
    return addDays(rule.nextDate, 1);
  }
  if (rule.cadence === "weekly") {
    return addDays(rule.nextDate, 7);
  }
  if (rule.cadence === "annually") {
    return addMonthsClamped(rule.nextDate, 12, rule.dayOfMonth);
  }
  return addMonthsClamped(rule.nextDate, 1, rule.dayOfMonth);
}

export function hasRecordedRecurringExpense(expenses: Expense[], rule: RecurringRule): boolean {
  const title = rule.title.trim().toLowerCase();
  const paymentMethod = rule.paymentMethod ?? "";
  return expenses.some((expense) => {
    return (
      expense.date === rule.nextDate &&
      expense.amount === rule.amount &&
      (expense.title ?? "").trim().toLowerCase() === title &&
      expense.categoryId === rule.categoryId &&
      (expense.paymentMethod ?? "") === paymentMethod
    );
  });
}

export function advanceRecurringRulePastRecorded(rule: RecurringRule, expenses: Expense[], today: string): RecurringRule {
  let working = { ...rule };
  while (compareIsoDates(working.nextDate, today) <= 0 && hasRecordedRecurringExpense(expenses, working)) {
    working = {
      ...working,
      nextDate: nextRecurringDate(working)
    };
  }
  return working;
}

export function resolveRecurringRuleNextDate(rule: RecurringRule, expenses: Expense[], today: string): RecurringRule {
  let working = { ...rule };
  while (compareIsoDates(working.nextDate, today) < 0) {
    working = {
      ...working,
      nextDate: nextRecurringDate(working)
    };
  }
  return advanceRecurringRulePastRecorded(working, expenses, today);
}

export function materializeDueRecurring(data: ProfileData, today: string): { data: ProfileData; created: Expense[] } {
  const created: Expense[] = [];
  const updatedRules = data.recurringRules.map((rule) => {
    if (!rule.isActive) {
      return rule;
    }
    let working = { ...rule };
    if (compareIsoDates(working.nextDate, today) > 0) {
      return working;
    }
    const timestamp = nowIso();
    while (compareIsoDates(working.nextDate, today) <= 0 && hasRecordedRecurringExpense(data.expenses.concat(created), working)) {
      working = {
        ...working,
        nextDate: nextRecurringDate(working),
        updatedAt: timestamp
      };
    }
    if (compareIsoDates(working.nextDate, today) <= 0) {
      created.push({
        id: createId("exp"),
        amount: working.amount,
        currency: working.currency,
        date: working.nextDate,
        categoryId: working.categoryId,
        title: working.title,
        remark: working.remark ?? null,
        paymentMethod: working.paymentMethod ?? null,
        createdAt: timestamp,
        updatedAt: timestamp
      });
      working = {
        ...working,
        nextDate: nextRecurringDate(working),
        updatedAt: timestamp
      };
    }
    return working;
  });

  return {
    data: {
      ...data,
      expenses: [...data.expenses, ...created],
      recurringRules: updatedRules
    },
    created
  };
}
