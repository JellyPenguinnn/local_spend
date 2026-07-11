import { addDays, daysInMonth, formatLocalIsoDate, getMonthParts, parseLocalDate, previousMonthKey } from "./date";
import { roundMoney } from "./money";
import { categoryIcon, categoryName } from "./categories";
import { expenseBaseAmount } from "./currencies";
import type { Budget, Category, Expense, MonthlyAggregateForAi, RecurringRule } from "./types";

export interface CategoryTotal {
  categoryId: string;
  name: string;
  color: string;
  total: number;
  percent: number;
  count: number;
}

export interface MonthlySummary {
  month: string;
  total: number;
  averagePerDay: number;
  highestDay: { date: string; total: number } | null;
  topCategory: CategoryTotal | null;
  categoryTotals: CategoryTotal[];
  dailyTotals: Record<string, number>;
  previousMonthTotal: number | null;
  monthOverMonthDelta: number | null;
  deterministicComments: string[];
}

export interface SafeToSpendStatus {
  budget: Budget | null;
  spent: number;
  left: number;
  perDay: number;
  daysLeft: number;
  percent: number;
  projectedSpend: number;
  pace: "none" | "light" | "normal" | "high" | "over";
  paceLabel: string;
}

export interface UpcomingRecurringItem {
  id: string;
  title: string;
  amount: number;
  currency: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  paymentMethod?: string | null;
  nextDate: string;
  daysUntil: number;
  dueLabel: string;
  cadence: RecurringRule["cadence"];
}

export interface MonthlyInsightCard {
  id: string;
  title: string;
  value: string;
  body: string;
  tone: "neutral" | "good" | "warn" | "danger";
}

export interface ExpenseMemorySuggestion {
  categoryId: string;
  paymentMethod?: string | null;
  confidence: number;
  reason: string;
  matchedTitle: string;
}

export function expensesForMonth(expenses: Expense[], month: string): Expense[] {
  return expenses.filter((expense) => expense.date.startsWith(month));
}

export function getDailyTotals(expenses: Expense[]): Record<string, number> {
  return expenses.reduce<Record<string, number>>((totals, expense) => {
    totals[expense.date] = roundMoney((totals[expense.date] ?? 0) + expenseBaseAmount(expense));
    return totals;
  }, {});
}

export function getCategoryTotals(expenses: Expense[], categories: Category[]): CategoryTotal[] {
  const total = expenses.reduce((sum, expense) => sum + expenseBaseAmount(expense), 0);
  const map = new Map<string, { total: number; count: number }>();
  for (const expense of expenses) {
    const current = map.get(expense.categoryId) ?? { total: 0, count: 0 };
    current.total += expenseBaseAmount(expense);
    current.count += 1;
    map.set(expense.categoryId, current);
  }
  return [...map.entries()]
    .map(([categoryId, value]) => {
      const category = categories.find((item) => item.id === categoryId);
      const categoryTotal = roundMoney(value.total);
      return {
        categoryId,
        name: category?.name ?? "Uncategorized",
        color: category?.color ?? "#8a98a8",
        total: categoryTotal,
        percent: total > 0 ? Math.round((categoryTotal / total) * 1000) / 10 : 0,
        count: value.count
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function summarizeMonth(expenses: Expense[], categories: Category[], month: string, currency = "SGD"): MonthlySummary {
  const current = expensesForMonth(expenses, month);
  const previous = expensesForMonth(expenses, previousMonthKey(month));
  const dailyTotals = getDailyTotals(current);
  const categoryTotals = getCategoryTotals(current, categories);
  const total = roundMoney(current.reduce((sum, expense) => sum + expenseBaseAmount(expense), 0));
  const previousMonthTotal = previous.length > 0 ? roundMoney(previous.reduce((sum, expense) => sum + expenseBaseAmount(expense), 0)) : null;
  const highestDay = Object.entries(dailyTotals)
    .map(([date, dayTotal]) => ({ date, total: dayTotal }))
    .sort((a, b) => b.total - a.total)[0] ?? null;
  const averagePerDay = roundMoney(total / Math.max(1, new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()));
  const monthOverMonthDelta = previousMonthTotal === null ? null : roundMoney(total - previousMonthTotal);

  const summary: MonthlySummary = {
    month,
    total,
    averagePerDay,
    highestDay,
    topCategory: categoryTotals[0] ?? null,
    categoryTotals,
    dailyTotals,
    previousMonthTotal,
    monthOverMonthDelta,
    deterministicComments: []
  };
  summary.deterministicComments = buildDeterministicComments(summary, currency);
  return summary;
}

export function buildDeterministicComments(summary: MonthlySummary, currency = "SGD"): string[] {
  if (summary.total <= 0) {
    return ["No spending recorded for this month yet."];
  }
  const comments: string[] = [];
  if (summary.topCategory) {
    comments.push(`${summary.topCategory.name} is your largest category this month.`);
  }
  const highSpendDays = Object.values(summary.dailyTotals).filter((value) => value >= summary.averagePerDay * 2 && value > 0).length;
  if (highSpendDays >= 3) {
    comments.push(`Spending is concentrated on ${highSpendDays} high-spend days.`);
  } else if (summary.highestDay) {
    comments.push(`Your highest spending day was ${summary.highestDay.date}.`);
  }
  if (summary.monthOverMonthDelta !== null) {
    if (summary.monthOverMonthDelta < 0) {
      comments.push(`You spent less than last month by ${currency} ${Math.abs(summary.monthOverMonthDelta).toFixed(2)}.`);
    } else if (summary.monthOverMonthDelta > 0) {
      comments.push(`You spent more than last month by ${currency} ${summary.monthOverMonthDelta.toFixed(2)}.`);
    } else {
      comments.push("Your spending matched last month exactly.");
    }
  }
  return comments.slice(0, 4);
}

export function budgetProgress(budgets: Budget[], expenses: Expense[], month: string, categoryId?: string | null): { budget: Budget | null; spent: number; percent: number } {
  const budget = budgets.find((item) => item.month === month && (item.categoryId ?? null) === (categoryId ?? null)) ?? null;
  const relevant = expensesForMonth(expenses, month).filter((expense) => !categoryId || expense.categoryId === categoryId);
  const spent = roundMoney(relevant.reduce((sum, expense) => sum + expenseBaseAmount(expense), 0));
  const percent = budget && budget.amount > 0 ? Math.min(999, Math.round((spent / budget.amount) * 100)) : 0;
  return { budget, spent, percent };
}

export function calculateSafeToSpend(budgets: Budget[], expenses: Expense[], month: string, today = formatLocalIsoDate()): SafeToSpendStatus {
  const progress = budgetProgress(budgets, expenses, month, null);
  const { daysInSelectedMonth, elapsedDays, remainingDays } = monthDayPosition(month, today);
  const left = progress.budget ? roundMoney(progress.budget.amount - progress.spent) : 0;
  const projectedSpend = elapsedDays > 0 ? roundMoney((progress.spent / elapsedDays) * daysInSelectedMonth) : progress.spent;
  const perDay = progress.budget ? roundMoney(Math.max(0, left) / remainingDays) : 0;

  if (!progress.budget) {
    return {
      budget: null,
      spent: progress.spent,
      left: 0,
      perDay: 0,
      daysLeft: remainingDays,
      percent: progress.percent,
      projectedSpend,
      pace: "none",
      paceLabel: "No budget"
    };
  }

  if (left < 0) {
    return {
      budget: progress.budget,
      spent: progress.spent,
      left,
      perDay: 0,
      daysLeft: remainingDays,
      percent: progress.percent,
      projectedSpend,
      pace: "over",
      paceLabel: "Over budget"
    };
  }

  const projectedRatio = progress.budget.amount > 0 ? projectedSpend / progress.budget.amount : 0;
  const pace = projectedRatio <= 0.75 ? "light" : projectedRatio <= 1.05 ? "normal" : "high";
  const paceLabel = pace === "light" ? "Light pace" : pace === "normal" ? "On pace" : "High pace";

  return {
    budget: progress.budget,
    spent: progress.spent,
    left,
    perDay,
    daysLeft: remainingDays,
    percent: progress.percent,
    projectedSpend,
    pace,
    paceLabel
  };
}

export function getUpcomingRecurringItems(rules: RecurringRule[], categories: Category[], today = formatLocalIsoDate(), windowDays = 30): UpcomingRecurringItem[] {
  const endDate = addDays(today, windowDays);
  return rules
    .filter((rule) => rule.isActive && rule.nextDate <= endDate)
    .map((rule) => {
      const category = categories.find((item) => item.id === rule.categoryId);
      const daysUntil = diffCalendarDays(today, rule.nextDate);
      return {
        id: rule.id,
        title: rule.title,
        amount: rule.amount,
        currency: rule.currency,
        categoryId: rule.categoryId,
        categoryName: category?.name ?? "Uncategorized",
        categoryColor: category?.color ?? "#8a98a8",
        categoryIcon: categoryIcon(category),
        paymentMethod: rule.paymentMethod,
        nextDate: rule.nextDate,
        daysUntil,
        dueLabel: dueLabel(daysUntil),
        cadence: rule.cadence
      };
    })
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate) || b.amount - a.amount);
}

export function buildMonthlyInsightCards(summary: MonthlySummary, safeToSpend: SafeToSpendStatus, currency: string): MonthlyInsightCard[] {
  const cards: MonthlyInsightCard[] = [];

  if (summary.topCategory) {
    cards.push({
      id: "largest-category",
      title: "Largest category",
      value: `${summary.topCategory.name} · ${summary.topCategory.percent}%`,
      body: `${formatAmount(summary.topCategory.total, currency)} across ${summary.topCategory.count} entr${summary.topCategory.count === 1 ? "y" : "ies"}.`,
      tone: "neutral"
    });
  } else {
    cards.push({
      id: "largest-category",
      title: "Largest category",
      value: "No spending yet",
      body: "Add a few expenses and this review will become useful.",
      tone: "neutral"
    });
  }

  if (summary.monthOverMonthDelta === null) {
    cards.push({
      id: "month-change",
      title: "Biggest change",
      value: "No previous month",
      body: "Once last month has data, LocalSpend will compare the trend.",
      tone: "neutral"
    });
  } else if (summary.monthOverMonthDelta < 0) {
    cards.push({
      id: "month-change",
      title: "Biggest change",
      value: `${formatAmount(Math.abs(summary.monthOverMonthDelta), currency)} lower`,
      body: "You are spending less than last month so far.",
      tone: "good"
    });
  } else if (summary.monthOverMonthDelta > 0) {
    cards.push({
      id: "month-change",
      title: "Biggest change",
      value: `${formatAmount(summary.monthOverMonthDelta, currency)} higher`,
      body: "Spending is above last month. Check the categories carrying the increase.",
      tone: "warn"
    });
  } else {
    cards.push({
      id: "month-change",
      title: "Biggest change",
      value: "Flat",
      body: "This month currently matches last month.",
      tone: "neutral"
    });
  }

  const highSpendDays = Object.entries(summary.dailyTotals)
    .map(([date, total]) => ({ date, total }))
    .filter((day) => day.total >= summary.averagePerDay * 2 && day.total > 0)
    .sort((a, b) => b.total - a.total);
  const highest = summary.highestDay;
  cards.push({
    id: "high-spend-days",
    title: "High-spend days",
    value: highSpendDays.length > 0 ? `${highSpendDays.length} day${highSpendDays.length === 1 ? "" : "s"}` : highest ? "1 peak day" : "None yet",
    body: highest ? `${highest.date} is the highest day at ${formatAmount(highest.total, currency)}.` : "No spending day stands out yet.",
    tone: highSpendDays.length >= 3 ? "warn" : "neutral"
  });

  cards.push({
    id: "budget-pace",
    title: "Budget pace",
    value: safeToSpend.budget ? safeToSpend.paceLabel : "No budget",
    body: safeToSpend.budget
      ? `${formatAmount(Math.max(0, safeToSpend.left), currency)} left, about ${formatAmount(safeToSpend.perDay, currency)} per day.`
      : "Set a monthly budget to see safe-to-spend guidance.",
    tone: safeToSpend.pace === "over" ? "danger" : safeToSpend.pace === "high" ? "warn" : safeToSpend.pace === "light" ? "good" : "neutral"
  });

  return cards;
}

export function suggestFromExpenseHistory(text: string, expenses: Expense[], ignoreId?: string): ExpenseMemorySuggestion | null {
  const queryTokens = meaningfulTokens(text);
  if (queryTokens.length === 0) return null;

  let best: (ExpenseMemorySuggestion & { score: number; date: string }) | null = null;
  for (const expense of expenses) {
    if (expense.id === ignoreId) continue;
    const title = expense.title?.trim();
    if (!title) continue;
    const candidateTokens = meaningfulTokens(`${title} ${expense.remark ?? ""}`);
    if (candidateTokens.length === 0) continue;
    const score = scoreTokenOverlap(queryTokens, candidateTokens);
    if (score <= 0) continue;
    const confidence = Math.min(0.96, 0.58 + score * 0.11);
    const suggestion = {
      categoryId: expense.categoryId,
      paymentMethod: expense.paymentMethod,
      confidence,
      reason: `Previously used for ${title}`,
      matchedTitle: title,
      score,
      date: expense.date
    };
    if (!best || suggestion.score > best.score || (suggestion.score === best.score && suggestion.date > best.date)) {
      best = suggestion;
    }
  }

  if (!best) return null;
  return {
    categoryId: best.categoryId,
    paymentMethod: best.paymentMethod,
    confidence: best.confidence,
    reason: best.reason,
    matchedTitle: best.matchedTitle
  };
}

export function searchExpenses(
  expenses: Expense[],
  categories: Category[],
  filters: { text?: string; categoryId?: string; startDate?: string; endDate?: string; minAmount?: number | null; maxAmount?: number | null }
): Expense[] {
  const text = filters.text?.trim().toLowerCase();
  return expenses
    .filter((expense) => {
      if (filters.categoryId && expense.categoryId !== filters.categoryId) return false;
      if (filters.startDate && expense.date < filters.startDate) return false;
      if (filters.endDate && expense.date > filters.endDate) return false;
      const reportingAmount = expenseBaseAmount(expense);
      if (filters.minAmount != null && reportingAmount < filters.minAmount) return false;
      if (filters.maxAmount != null && reportingAmount > filters.maxAmount) return false;
      if (text) {
        const haystack = [
          expense.title,
          expense.remark,
          expense.paymentMethod,
          categoryName(categories, expense.categoryId)
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      return true;
    })
    .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
}

export function hasDuplicateExpense(expenses: Expense[], draft: { amount: number; currency?: string; date: string; title?: string | null }, ignoreId?: string): boolean {
  const title = draft.title?.trim().toLowerCase() ?? "";
  return expenses.some((expense) => {
    if (expense.id === ignoreId) return false;
    return (
      expense.date === draft.date &&
      expense.amount === draft.amount &&
      (!draft.currency || expense.currency === draft.currency) &&
      (expense.title?.trim().toLowerCase() ?? "") === title
    );
  });
}

export function aggregateForAi(summary: MonthlySummary, currency: string): MonthlyAggregateForAi {
  return {
    month: summary.month,
    currency,
    total: summary.total,
    previousMonthTotal: summary.previousMonthTotal,
    topCategories: summary.categoryTotals.slice(0, 6).map((category) => ({
      name: category.name,
      total: category.total,
      percent: category.percent
    })),
    highSpendDays: Object.entries(summary.dailyTotals)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  };
}

function monthDayPosition(month: string, today: string): { daysInSelectedMonth: number; elapsedDays: number; remainingDays: number } {
  const { year, monthIndex } = getMonthParts(month);
  const daysInSelectedMonth = daysInMonth(year, monthIndex);
  const todayMonth = today.slice(0, 7);
  if (month === todayMonth) {
    const currentDay = Math.min(daysInSelectedMonth, Math.max(1, parseLocalDate(today).getDate()));
    return {
      daysInSelectedMonth,
      elapsedDays: currentDay,
      remainingDays: Math.max(1, daysInSelectedMonth - currentDay + 1)
    };
  }
  if (month < todayMonth) {
    return { daysInSelectedMonth, elapsedDays: daysInSelectedMonth, remainingDays: 1 };
  }
  return { daysInSelectedMonth, elapsedDays: 0, remainingDays: daysInSelectedMonth };
}

function diffCalendarDays(from: string, to: string): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / dayMs);
}

function dueLabel(daysUntil: number): string {
  if (daysUntil < 0) return "Overdue";
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `${daysUntil} days`;
}

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

function meaningfulTokens(text: string): string[] {
  const stopWords = new Set(["the", "and", "with", "for", "from", "this", "that", "today", "yesterday", "spend", "expense", "payment", "cash", "card"]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stopWords.has(token) && !/^\d+$/.test(token));
}

function scoreTokenOverlap(queryTokens: string[], candidateTokens: string[]): number {
  const candidateSet = new Set(candidateTokens);
  let score = 0;
  for (const token of queryTokens) {
    if (candidateSet.has(token)) {
      score += 2;
    } else if (candidateTokens.some((candidate) => candidate.includes(token) || token.includes(candidate))) {
      score += 1;
    }
  }
  return score;
}
