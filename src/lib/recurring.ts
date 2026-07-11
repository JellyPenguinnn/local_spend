import { addDays, addMonthsClamped, compareIsoDates } from "./date";
import { normalizeCurrencyCode, type ExchangeRateQuote } from "./currencies";
import { createId, nowIso } from "./defaults";
import { roundMoney } from "./money";
import type { Expense, ProfileData, RecurringRule } from "./types";

const MAX_OCCURRENCES = 10_000;

export interface RecurringOccurrence {
  id: string;
  ruleId: string;
  date: string;
  rule: RecurringRule;
  relatedExpense?: Expense;
}

export function nextRecurringDate(rule: RecurringRule, fromDate = rule.nextDate): string {
  if (rule.cadence === "daily") {
    return addDays(fromDate, 1);
  }
  if (rule.cadence === "weekly") {
    return addDays(fromDate, 7);
  }
  if (rule.cadence === "annually") {
    return addMonthsClamped(fromDate, 12, rule.dayOfMonth);
  }
  return addMonthsClamped(fromDate, 1, rule.dayOfMonth);
}

export function hasRecordedRecurringExpense(expenses: Expense[], rule: RecurringRule, occurrenceDate = rule.nextDate): boolean {
  const title = rule.title.trim().toLowerCase();
  const paymentMethod = rule.paymentMethod ?? "";
  return expenses.some((expense) => {
    if (expense.recurringRuleId === rule.id && expense.recurringOccurrenceDate === occurrenceDate) {
      return true;
    }
    return (
      expense.date === occurrenceDate &&
      expense.amount === rule.amount &&
      expense.currency === rule.currency &&
      (expense.title ?? "").trim().toLowerCase() === title &&
      expense.categoryId === rule.categoryId &&
      (expense.paymentMethod ?? "") === paymentMethod
    );
  });
}

export function getDueRecurringOccurrences(rules: RecurringRule[], expenses: Expense[], today: string): RecurringOccurrence[] {
  return rules
    .flatMap((rule) => (rule.isActive ? getRuleOccurrencesThrough(rule, today) : []))
    .filter(({ rule, date }) => !isOccurrenceHandled(rule, expenses, date))
    .map((occurrence) => ({
      ...occurrence,
      relatedExpense: findRecurringExpenseCandidate(expenses, occurrence.rule, occurrence.date) ?? undefined
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.rule.title.localeCompare(b.rule.title));
}

export function getUpcomingRecurringOccurrences(
  rules: RecurringRule[],
  expenses: Expense[],
  today: string,
  windowDays = 7
): RecurringOccurrence[] {
  const endDate = addDays(today, windowDays);
  const overdueRuleIds = new Set(getDueRecurringOccurrences(rules, expenses, today).map((occurrence) => occurrence.ruleId));
  return rules
    .filter((rule) => rule.isActive && !overdueRuleIds.has(rule.id))
    .flatMap((rule) => getRuleOccurrencesThrough(rule, endDate).filter((occurrence) => occurrence.date > today && !isOccurrenceHandled(rule, expenses, occurrence.date)).slice(0, 1))
    .sort((a, b) => a.date.localeCompare(b.date) || a.rule.title.localeCompare(b.rule.title));
}

export function advanceRecurringRulePastRecorded(rule: RecurringRule, expenses: Expense[], _today: string): RecurringRule {
  return resolveRecurringRuleNextDate(rule, expenses);
}

export function resolveRecurringRuleNextDate(rule: RecurringRule, expenses: Expense[], _today?: string): RecurringRule {
  let date = rule.startDate;
  for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
    if (!isOccurrenceHandled(rule, expenses, date)) {
      return { ...rule, nextDate: date };
    }
    date = nextRecurringDate(rule, date);
  }
  return rule;
}

export function recordRecurringOccurrence(
  data: ProfileData,
  ruleId: string,
  occurrenceDate: string,
  today: string,
  conversion?: ExchangeRateQuote | null
): { data: ProfileData; created: Expense | null } {
  const rule = data.recurringRules.find((item) => item.id === ruleId);
  if (!rule || !rule.isActive || compareIsoDates(occurrenceDate, today) > 0 || !isScheduledOccurrence(rule, occurrenceDate)) {
    return { data, created: null };
  }

  const alreadyRecorded = hasRecordedRecurringExpense(data.expenses, rule, occurrenceDate);
  const baseCurrency = normalizeCurrencyCode(data.appSettings.currency);
  const ruleCurrency = normalizeCurrencyCode(rule.currency, baseCurrency);
  const isForeignCurrency = ruleCurrency !== baseCurrency;
  if (!alreadyRecorded && isForeignCurrency && (!conversion || !Number.isFinite(conversion.rate) || conversion.rate <= 0)) {
    return { data, created: null };
  }
  const exchangeRate = isForeignCurrency ? (conversion?.rate ?? 1) : 1;
  const timestamp = nowIso();
  const created: Expense | null = alreadyRecorded
    ? null
    : {
        id: createId("exp"),
        amount: rule.amount,
        currency: ruleCurrency,
        baseAmount: roundMoney(rule.amount * exchangeRate),
        baseCurrency,
        exchangeRate,
        exchangeRateDate: isForeignCurrency ? (conversion?.date ?? occurrenceDate) : occurrenceDate,
        exchangeRateSource: isForeignCurrency ? (conversion?.source ?? "cached") : "base",
        date: occurrenceDate,
        categoryId: rule.categoryId,
        title: rule.title,
        remark: rule.remark ?? null,
        paymentMethod: rule.paymentMethod ?? null,
        recurringRuleId: rule.id,
        recurringOccurrenceDate: occurrenceDate,
        createdAt: timestamp,
        updatedAt: timestamp
      };
  const expenses = created ? [...data.expenses, created] : data.expenses;
  const updatedRule = resolveRecurringRuleNextDate(
    {
      ...rule,
      discardedDates: (rule.discardedDates ?? []).filter((date) => date !== occurrenceDate),
      updatedAt: timestamp
    },
    expenses
  );

  return {
    data: {
      ...data,
      expenses,
      recurringRules: data.recurringRules.map((item) => (item.id === ruleId ? updatedRule : item))
    },
    created
  };
}

export function reconcileRecurringOccurrence(data: ProfileData, ruleId: string, occurrenceDate: string, expenseId: string, today: string): ProfileData {
  const rule = data.recurringRules.find((item) => item.id === ruleId);
  const expense = data.expenses.find((item) => item.id === expenseId);
  if (!rule || !expense || compareIsoDates(occurrenceDate, today) > 0 || !isScheduledOccurrence(rule, occurrenceDate)) {
    return data;
  }
  const candidate = findRecurringExpenseCandidate(data.expenses, rule, occurrenceDate);
  if (!candidate || candidate.id !== expenseId) return data;
  const timestamp = nowIso();
  const expenses = data.expenses.map((item) =>
    item.id === expenseId
      ? { ...item, recurringRuleId: rule.id, recurringOccurrenceDate: occurrenceDate, updatedAt: timestamp }
      : item
  );
  const updatedRule = resolveRecurringRuleNextDate({ ...rule, updatedAt: timestamp }, expenses);
  return {
    ...data,
    expenses,
    recurringRules: data.recurringRules.map((item) => (item.id === ruleId ? updatedRule : item))
  };
}

export function linkRecordedRecurringExpenses(expenses: Expense[], rule: RecurringRule): Expense[] {
  return expenses.map((expense) => {
    if (expense.recurringRuleId || !isScheduledOccurrence(rule, expense.date) || !isExactRecurringExpense(expense, rule)) {
      return expense;
    }
    return {
      ...expense,
      recurringRuleId: rule.id,
      recurringOccurrenceDate: expense.date
    };
  });
}

export function discardRecurringOccurrence(data: ProfileData, ruleId: string, occurrenceDate: string, today: string): ProfileData {
  const rule = data.recurringRules.find((item) => item.id === ruleId);
  if (!rule || !rule.isActive || compareIsoDates(occurrenceDate, today) > 0 || !isScheduledOccurrence(rule, occurrenceDate)) {
    return data;
  }

  const timestamp = nowIso();
  const updatedRule = resolveRecurringRuleNextDate(
    {
      ...rule,
      discardedDates: [...new Set([...(rule.discardedDates ?? []), occurrenceDate])].sort(),
      updatedAt: timestamp
    },
    data.expenses
  );
  return {
    ...data,
    recurringRules: data.recurringRules.map((item) => (item.id === ruleId ? updatedRule : item))
  };
}

export function materializeDueRecurring(data: ProfileData, today: string): { data: ProfileData; created: Expense[] } {
  let working: ProfileData = {
    ...data,
    recurringRules: data.recurringRules.map((rule) => (rule.isActive ? resolveRecurringRuleNextDate(rule, data.expenses) : rule))
  };
  const created: Expense[] = [];
  const firstDueByRule = new Map<string, RecurringOccurrence>();
  for (const occurrence of getDueRecurringOccurrences(working.recurringRules, working.expenses, today)) {
    if (!firstDueByRule.has(occurrence.ruleId)) {
      firstDueByRule.set(occurrence.ruleId, occurrence);
    }
  }

  for (const occurrence of firstDueByRule.values()) {
    const result = recordRecurringOccurrence(working, occurrence.ruleId, occurrence.date, today);
    working = result.data;
    if (result.created) created.push(result.created);
  }

  return { data: working, created };
}

function getRuleOccurrencesThrough(rule: RecurringRule, endDate: string): RecurringOccurrence[] {
  const occurrences: RecurringOccurrence[] = [];
  let date = rule.startDate;
  for (let index = 0; index < MAX_OCCURRENCES && compareIsoDates(date, endDate) <= 0; index += 1) {
    occurrences.push({ id: `${rule.id}:${date}`, ruleId: rule.id, date, rule });
    date = nextRecurringDate(rule, date);
  }
  return occurrences;
}

function isOccurrenceHandled(rule: RecurringRule, expenses: Expense[], date: string): boolean {
  return (rule.discardedDates ?? []).includes(date) || hasRecordedRecurringExpense(expenses, rule, date);
}

function isScheduledOccurrence(rule: RecurringRule, targetDate: string): boolean {
  let date = rule.startDate;
  for (let index = 0; index < MAX_OCCURRENCES && compareIsoDates(date, targetDate) <= 0; index += 1) {
    if (date === targetDate) return true;
    date = nextRecurringDate(rule, date);
  }
  return false;
}

function findRecurringExpenseCandidate(expenses: Expense[], rule: RecurringRule, occurrenceDate: string): Expense | null {
  const title = rule.title.trim().toLowerCase();
  const paymentMethod = rule.paymentMethod ?? "";
  return (
    expenses.find(
      (expense) =>
        expense.date === occurrenceDate &&
        (!expense.recurringRuleId || expense.recurringRuleId === rule.id) &&
        expense.currency === rule.currency &&
        (expense.title ?? "").trim().toLowerCase() === title &&
        expense.categoryId === rule.categoryId &&
        (expense.paymentMethod ?? "") === paymentMethod
    ) ?? null
  );
}

function isExactRecurringExpense(expense: Expense, rule: RecurringRule): boolean {
  return (
    expense.amount === rule.amount &&
    expense.currency === rule.currency &&
    (expense.title ?? "").trim().toLowerCase() === rule.title.trim().toLowerCase() &&
    expense.categoryId === rule.categoryId &&
    (expense.paymentMethod ?? "") === (rule.paymentMethod ?? "")
  );
}
