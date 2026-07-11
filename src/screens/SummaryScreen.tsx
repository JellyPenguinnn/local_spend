import { lazy, Suspense, useMemo, useState } from "react";
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { budgetProgress, calculateSafeToSpend, summarizeMonth } from "../lib/analytics";
import { categoryName } from "../lib/categories";
import { expenseBaseAmount, isForeignExpense } from "../lib/currencies";
import { createId } from "../lib/defaults";
import { formatMonthKey, parseLocalDate } from "../lib/date";
import { formatMoney, parseMoney } from "../lib/money";
import type { Budget, ProfileData } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { MonthPicker } from "../components/MonthPicker";
import { CategoryChip } from "../components/CategoryChip";

const CategoryDonut = lazy(() => import("../components/CategoryDonut"));

function formatDetailDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" }).format(parseLocalDate(value));
}

interface SummaryScreenProps {
  data: ProfileData;
  saveData: (data: ProfileData) => Promise<boolean>;
}

export function SummaryScreen({ data, saveData }: SummaryScreenProps) {
  const [month, setMonth] = useState(formatMonthKey());
  const [budgetInput, setBudgetInput] = useState("");
  const [isBudgetEditorOpen, setIsBudgetEditorOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [drilldownCategoryId, setDrilldownCategoryId] = useState<string | null>(null);
  const summary = useMemo(
    () => summarizeMonth(data.expenses, data.categories, month, data.appSettings.currency),
    [data.appSettings.currency, data.categories, data.expenses, month]
  );
  const totalBudget = budgetProgress(data.budgets, data.expenses, month, null);
  const safeToSpend = useMemo(() => calculateSafeToSpend(data.budgets, data.expenses, month), [data.budgets, data.expenses, month]);
  const drilldownCategory = summary.categoryTotals.find((category) => category.categoryId === drilldownCategoryId) ?? null;
  const drilldownExpenses = useMemo(
    () =>
      drilldownCategoryId
        ? data.expenses
            .filter((expense) => expense.date.startsWith(month) && expense.categoryId === drilldownCategoryId)
            .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        : [],
    [data.expenses, drilldownCategoryId, month]
  );
  const drilldownGroups = useMemo(() => {
    const groups = new Map<string, typeof drilldownExpenses>();
    for (const expense of drilldownExpenses) {
      const list = groups.get(expense.date) ?? [];
      list.push(expense);
      groups.set(expense.date, list);
    }
    return [...groups.entries()].map(([date, expenses]) => ({ date, expenses }));
  }, [drilldownExpenses]);
  const leftPercent = totalBudget.budget && totalBudget.budget.amount > 0
    ? Math.max(0, Math.round(((totalBudget.budget.amount - totalBudget.spent) / totalBudget.budget.amount) * 100))
    : null;
  const budgetRemaining = totalBudget.budget ? totalBudget.budget.amount - totalBudget.spent : null;

  function openBudgetEditor() {
    setBudgetInput(totalBudget.budget ? totalBudget.budget.amount.toFixed(2) : "");
    setIsBudgetEditorOpen(true);
  }

  async function saveBudget() {
    const amount = parseMoney(budgetInput);
    if (amount === null) return;
    const existing = data.budgets.find((budget) => budget.month === month && !budget.categoryId);
    const nextBudget: Budget = {
      id: existing?.id ?? createId("budget"),
      month,
      categoryId: null,
      amount
    };
    const saved = await saveData({
      ...data,
      budgets: existing ? data.budgets.map((budget) => (budget.id === existing.id ? nextBudget : budget)) : [...data.budgets, nextBudget]
    });
    if (!saved) return;
    setBudgetInput("");
    setIsBudgetEditorOpen(false);
  }

  if (drilldownCategoryId) {
    const title = drilldownCategory?.name ?? categoryName(data.categories, drilldownCategoryId);
    const total = drilldownCategory?.total ?? drilldownExpenses.reduce((sum, expense) => sum + expenseBaseAmount(expense), 0);
    return (
      <div className="summary-screen">
        <section className="hero-panel app-metric-hero summary-hero category-detail-hero">
          <button className="secondary-button back-button" type="button" onClick={() => setDrilldownCategoryId(null)}>
            <ArrowLeft size={17} />
            Back
          </button>
          <div>
            <p className="eyebrow">Category</p>
            <h2>{title}</h2>
            <span className="muted">Total: {formatMoney(total, data.appSettings.currency)}</span>
          </div>
        </section>

        <section className="panel category-detail-panel">
          <div className="section-heading compact-heading category-detail-heading">
            <div>
              <p className="eyebrow">Entries</p>
            </div>
            <span className="muted small">{drilldownExpenses.length} total</span>
          </div>
          {drilldownExpenses.length === 0 ? (
            <EmptyState title="No entries" body="No spending found for this category in this month." />
          ) : (
            <div className="category-detail-list">
              {drilldownGroups.map((group) => (
                <section className="category-date-group" key={group.date}>
                  <h3>{formatDetailDate(group.date)}</h3>
                  {group.expenses.map((expense) => (
                    <article className="category-detail-row" key={expense.id}>
                      <div>
                        <strong>{expense.title || title}</strong>
                        {expense.remark && <span>Remark: {expense.remark}</span>}
                      </div>
                      <span className="category-detail-amount">
                        <strong>{formatMoney(expense.amount, expense.currency || data.appSettings.currency)}</strong>
                        {isForeignExpense(expense, data.appSettings.currency) && <small>≈ {formatMoney(expenseBaseAmount(expense), data.appSettings.currency)}</small>}
                      </span>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="summary-screen">
      <section className="hero-panel app-metric-hero summary-hero">
        <div>
          <p className="eyebrow">Summary</p>
          <h2>{formatMoney(summary.total, data.appSettings.currency)}</h2>
          {summary.monthOverMonthDelta !== null && (
            <span className={summary.monthOverMonthDelta > 0 ? "month-comparison up" : summary.monthOverMonthDelta < 0 ? "month-comparison down" : "month-comparison flat"}>
              {summary.monthOverMonthDelta > 0 ? <ArrowUpRight size={15} /> : summary.monthOverMonthDelta < 0 ? <ArrowDownRight size={15} /> : <ArrowRight size={15} />}
              {formatMonthComparison(summary.monthOverMonthDelta, summary.comparisonMode, data.appSettings.currency)}
            </span>
          )}
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </section>

      <div className="screen-grid summary-grid">
        <section className="panel budget-panel">
          <button className="secondary-button compact-budget-button" type="button" onClick={openBudgetEditor}>
            {totalBudget.budget ? "Reset" : "Set budget"}
          </button>
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Monthly budget</p>
              <h2 className={budgetRemaining !== null && budgetRemaining < 0 ? "budget-remaining-value over" : "budget-remaining-value"}>
                {budgetRemaining === null
                  ? "No budget set"
                  : budgetRemaining < 0
                    ? `${formatMoney(Math.abs(budgetRemaining), data.appSettings.currency)} over`
                    : `${formatMoney(budgetRemaining, data.appSettings.currency)} left`}
              </h2>
            </div>
          </div>
          <p className="muted budget-summary-line">
            {safeToSpend.budget && leftPercent !== null
              ? `${leftPercent}% remaining of ${formatMoney(safeToSpend.budget.amount, data.appSettings.currency)}`
              : "Set a monthly limit to see what remains."}
          </p>
          {safeToSpend.budget && leftPercent !== null && (
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Budget remaining"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={leftPercent}
            >
              <span style={{ width: `${leftPercent}%` }} />
            </div>
          )}
          {isBudgetEditorOpen && (
            <div className="inline-input budget-editor-row">
              <input value={budgetInput} placeholder="Monthly budget" inputMode="decimal" onChange={(event) => setBudgetInput(event.target.value)} />
              <button className="secondary-button" type="button" onClick={() => void saveBudget()}>
                Save
              </button>
            </div>
          )}
        </section>

        <section className="panel chart-panel">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Categories</p>
              <h2>Distribution</h2>
            </div>
          </div>
          {summary.categoryTotals.length === 0 ? (
            <EmptyState title="No chart yet" body="Add expenses and your category donut will appear here." />
          ) : (
            <>
              <div className="donut-wrap">
                <div className="donut-canvas">
                  <Suspense fallback={<div className="chart-loading">Preparing chart...</div>}>
                    <CategoryDonut totals={summary.categoryTotals} selectedCategoryId={selectedCategoryId} onSelect={setSelectedCategoryId} />
                  </Suspense>
                </div>
                <div className="category-total-list distribution-legend">
                  {summary.categoryTotals.map((category) => (
                    <button
                      className={selectedCategoryId === category.categoryId ? "category-total-row active" : "category-total-row"}
                      type="button"
                      key={category.categoryId}
                      onClick={() => {
                        setSelectedCategoryId(category.categoryId);
                        setDrilldownCategoryId(category.categoryId);
                      }}
                    >
                      <CategoryChip category={data.categories.find((entry) => entry.id === category.categoryId)} label="" compact />
                      <strong>{category.name}</strong>
                      <span>
                        {formatMoney(category.total, data.appSettings.currency)} ({category.percent}%)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function formatMonthComparison(delta: number, mode: "same-period" | "full-month", currency: string): string {
  if (delta === 0) return mode === "same-period" ? "Unchanged from this point last month" : "Same as previous month";
  const direction = delta < 0 ? "less" : "more";
  const comparison = mode === "same-period" ? "than this point last month" : "than previous month";
  return `${formatMoney(Math.abs(delta), currency)} ${direction} ${comparison}`;
}
