import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { searchExpenses } from "../lib/analytics";
import { expenseBaseAmount } from "../lib/currencies";
import { parseLocalDate } from "../lib/date";
import { formatMoney, parseMoney } from "../lib/money";
import type { Expense, ProfileData } from "../lib/types";
import { EmptyState } from "./EmptyState";
import { ExpenseList } from "./ExpenseList";
import { FormBackAction } from "./FormBackAction";

interface TransactionSearchProps {
  data: ProfileData;
  onBack: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expenseId: string) => void;
}

const EMPTY_FILTERS = {
  text: "",
  categoryId: "",
  startDate: "",
  endDate: "",
  minAmount: "",
  maxAmount: ""
};

export function TransactionSearch({ data, onBack, onEdit, onDelete }: TransactionSearchProps) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = [filters.categoryId, filters.startDate, filters.endDate, filters.minAmount, filters.maxAmount].filter(Boolean).length;
  const results = useMemo(
    () =>
      searchExpenses(data.expenses, data.categories, {
        text: filters.text,
        categoryId: filters.categoryId || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        minAmount: filters.minAmount ? parseMoney(filters.minAmount) : null,
        maxAmount: filters.maxAmount ? parseMoney(filters.maxAmount) : null
      }),
    [data.categories, data.expenses, filters]
  );
  const groups = useMemo(() => {
    const grouped = new Map<string, Expense[]>();
    for (const expense of results) {
      const entries = grouped.get(expense.date) ?? [];
      entries.push(expense);
      grouped.set(expense.date, entries);
    }
    return [...grouped.entries()];
  }, [results]);
  const resultTotal = results.reduce((sum, expense) => sum + expenseBaseAmount(expense), 0);

  return (
    <div className="transaction-search focused-subview">
      <section className="panel search-panel">
        <FormBackAction onClick={onBack} />
        <div className="search-title-row">
          <div>
            <p className="eyebrow">Calendar</p>
            <h2>Search spending</h2>
          </div>
          <button
            className={showFilters ? "secondary-button active" : "secondary-button"}
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal size={16} />
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
          </button>
        </div>

        <label className="search-input-row">
          <Search size={18} aria-hidden="true" />
          <input
            autoFocus
            type="search"
            value={filters.text}
            placeholder="Description, category or payment"
            onChange={(event) => setFilters({ ...filters, text: event.target.value })}
          />
          {filters.text && (
            <button className="icon-button" type="button" onClick={() => setFilters({ ...filters, text: "" })} aria-label="Clear search" title="Clear search">
              <X size={16} />
            </button>
          )}
        </label>

        {showFilters && (
          <div className="filter-grid search-filter-grid">
            <label className="span-2">
              <span>Category</span>
              <select value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}>
                <option value="">All categories</option>
                {data.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>From</span>
              <input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
            </label>
            <label>
              <span>Minimum ({data.appSettings.currency})</span>
              <input inputMode="decimal" value={filters.minAmount} onChange={(event) => setFilters({ ...filters, minAmount: event.target.value })} />
            </label>
            <label>
              <span>Maximum ({data.appSettings.currency})</span>
              <input inputMode="decimal" value={filters.maxAmount} onChange={(event) => setFilters({ ...filters, maxAmount: event.target.value })} />
            </label>
            {activeFilterCount > 0 && (
              <button className="secondary-button span-2" type="button" onClick={() => setFilters({ ...EMPTY_FILTERS, text: filters.text })}>
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="search-results-heading" aria-live="polite">
          <strong>{results.length} {results.length === 1 ? "entry" : "entries"}</strong>
          <span>{formatMoney(resultTotal, data.appSettings.currency)}</span>
        </div>

        {results.length === 0 ? (
          <EmptyState title="No matching spending" body="Try another word or clear a filter." />
        ) : (
          <div className="search-result-groups">
            {groups.map(([date, expenses]) => (
              <section className="search-date-group" key={date}>
                <h3>{formatSearchDate(date)}</h3>
                <ExpenseList
                  compact
                  expenses={expenses}
                  categories={data.categories}
                  currency={data.appSettings.currency}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatSearchDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(parseLocalDate(value));
}
