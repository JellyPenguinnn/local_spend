import { type CSSProperties, useMemo, useState } from "react";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { buildCalendarMonth, formatMonthKey, parseLocalDate } from "../lib/date";
import { clearExpenseDraft, expenseDraftKey } from "../lib/drafts";
import { getDailyTotals } from "../lib/analytics";
import { fallbackCategoryId } from "../lib/categories";
import { formatCalendarCellAmount, formatMoney } from "../lib/money";
import { mostUsedPaymentMethod } from "../lib/payments";
import { parseExpenseWithAiOrLocal, type AiSecretStore } from "../lib/ai/providers";
import type { Expense, ExpenseDraft, ProfileData } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { ExpenseForm } from "../components/ExpenseForm";
import { ExpenseList } from "../components/ExpenseList";
import { FormBackAction } from "../components/FormBackAction";
import { MonthPicker } from "../components/MonthPicker";
import { NaturalQuickAdd } from "../components/NaturalQuickAdd";
import { TransactionSearch } from "../components/TransactionSearch";

interface CalendarScreenProps {
  profileId: string;
  data: ProfileData;
  upsertExpense: (expense: Expense) => Promise<boolean>;
  deleteExpense: (expenseId: string) => Promise<boolean>;
  secrets: AiSecretStore;
}

export function CalendarScreen({ profileId, data, upsertExpense, deleteExpense, secrets }: CalendarScreenProps) {
  const [month, setMonth] = useState(formatMonthKey());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [quickDraft, setQuickDraft] = useState<Partial<ExpenseDraft> | undefined>();
  const [quickMessage, setQuickMessage] = useState("");
  const [quickCategoryNeedsReview, setQuickCategoryNeedsReview] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const monthExpenses = useMemo(() => data.expenses.filter((expense) => expense.date.startsWith(month)), [data.expenses, month]);
  const dailyTotals = useMemo(() => getDailyTotals(monthExpenses), [monthExpenses]);
  const maxDaily = Math.max(1, ...Object.values(dailyTotals));
  const monthTotal = Object.values(dailyTotals).reduce((sum, value) => sum + value, 0);
  const selectedExpenses = selectedDate
    ? data.expenses.filter((expense) => expense.date === selectedDate).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  const selectedDateLabel = selectedDate
    ? new Intl.DateTimeFormat("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(parseLocalDate(selectedDate))
    : "";
  const cells = buildCalendarMonth(month);
  const activeDraftKey = selectedDate
    ? expenseDraftKey(profileId, editingExpense ? `edit.${editingExpense.id}` : `calendar.${selectedDate}`)
    : undefined;

  function closeSelectedDay() {
    clearExpenseDraft(activeDraftKey);
    setSelectedDate(null);
    setEditingExpense(null);
    setIsAdding(false);
    clearDraft();
  }

  function clearDraft() {
    setQuickText("");
    setQuickDraft(undefined);
    setQuickMessage("");
    setQuickCategoryNeedsReview(false);
    setIsParsing(false);
  }

  async function parseQuickAddForSelectedDay() {
    if (!selectedDate) return;
    if (!quickText.trim()) {
      setQuickMessage("Type a short expense first.");
      return;
    }
    setIsParsing(true);
    setQuickMessage("");
    try {
      const parsed = await parseExpenseWithAiOrLocal(quickText, data.aiSettings, data.categories, secrets, selectedDate, data.appSettings.paymentMethods, data.expenses);
      if (!parsed?.amount) {
        setQuickMessage("I could not find an amount.");
        return;
      }
      setQuickDraft({
        amount: parsed.amount,
        currency: parsed.currency ?? data.appSettings.currency,
        baseAmount: "",
        date: selectedDate,
        categoryId: parsed.categoryId ?? fallbackCategoryId(data.categories),
        title: parsed.title ?? quickText,
        remark: parsed.source === "ai" ? "AI suggestion" : "",
        paymentMethod: parsed.paymentMethod ?? mostUsedPaymentMethod(data.expenses, data.appSettings.paymentMethods)
      });
      setQuickCategoryNeedsReview(!parsed.categoryId || (parsed.categoryConfidence ?? 0) < 0.72);
      setQuickMessage(parsed.source === "ai" ? "AI suggestion ready. Check it before saving." : "Draft ready. Check it before saving.");
    } finally {
      setIsParsing(false);
    }
  }

  if (isSearching) {
    return (
      <TransactionSearch
        data={data}
        onBack={() => setIsSearching(false)}
        onEdit={(expense) => {
          setMonth(expense.date.slice(0, 7));
          setSelectedDate(expense.date);
          setEditingExpense(expense);
          setIsAdding(false);
          setIsSearching(false);
          clearDraft();
        }}
        onDelete={(expenseId) => void deleteExpense(expenseId)}
      />
    );
  }

  if (selectedDate) {
    const selectedTotal = dailyTotals[selectedDate] ?? 0;
    const selectedPanelLabel =
      isAdding || editingExpense
        ? ""
        : selectedExpenses.length === 0
          ? "No spending yet"
          : `Total spending: ${formatMoney(selectedTotal, data.appSettings.currency)}`;

    return (
      <div className="calendar-screen calendar-day-screen">
        <section className="hero-panel selected-day-hero">
          <button className="secondary-button back-button" type="button" onClick={closeSelectedDay}>
            <ArrowLeft size={16} />
            Calendar
          </button>
          <div>
            <p className="eyebrow">Selected day</p>
            <h2>{selectedDateLabel}</h2>
          </div>
          {!isAdding && !editingExpense && (
            <button
              className="primary-button day-hero-action"
              type="button"
              onClick={() => {
                setIsAdding(true);
                setEditingExpense(null);
                clearDraft();
              }}
            >
              <Plus size={17} />
              Add
            </button>
          )}
        </section>

        <section className={isAdding || editingExpense ? "panel day-panel day-panel-full day-panel-entry" : "panel day-panel day-panel-full"}>
          {selectedPanelLabel && (
            <div className="section-heading compact-heading single-line-heading">
              <p className="eyebrow">{selectedPanelLabel}</p>
            </div>
          )}
          {(isAdding || editingExpense) && (
            <>
              <FormBackAction
                onClick={() => {
                  clearExpenseDraft(activeDraftKey);
                  setEditingExpense(null);
                  setIsAdding(false);
                  clearDraft();
                }}
              />
              <ExpenseForm
                compact
                categories={data.categories}
                settings={data.appSettings}
                expenses={data.expenses}
                defaultDate={selectedDate}
                initialDraft={quickDraft}
                editingExpense={editingExpense}
                hideDate={!editingExpense}
                hideTitleRow
                autoFocusAmount={!editingExpense}
                draftStorageKey={activeDraftKey}
                initialCategoryNeedsReview={quickCategoryNeedsReview}
                afterAmount={
                  !editingExpense ? (
                    <NaturalQuickAdd
                      value={quickText}
                      message={quickMessage}
                      isParsing={isParsing}
                      aiEnabled={data.aiSettings.provider !== "none"}
                      onChange={setQuickText}
                      onDraft={() => void parseQuickAddForSelectedDay()}
                    />
                  ) : null
                }
                saveLabel="Save"
                onCancelEdit={() => {
                  setEditingExpense(null);
                  setIsAdding(false);
                  clearDraft();
                }}
                onSave={(expense) => upsertExpense(expense)}
                onSaved={() => {
                  setEditingExpense(null);
                  setIsAdding(false);
                  clearDraft();
                }}
              />
            </>
          )}
          {!isAdding && !editingExpense && selectedExpenses.length === 0 ? (
            <EmptyState title="No entries for this day" body="Use Add spend above only if you spent on this date." />
          ) : !isAdding && !editingExpense && selectedExpenses.length > 0 ? (
            <ExpenseList
              compact
              expenses={selectedExpenses}
              categories={data.categories}
              currency={data.appSettings.currency}
              onEdit={(expense) => {
                setEditingExpense(expense);
                setIsAdding(false);
                clearDraft();
              }}
              onDelete={(id) => void deleteExpense(id)}
            />
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="calendar-screen">
      <section className="hero-panel app-metric-hero calendar-hero">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2>{formatMoney(monthTotal, data.appSettings.currency)}</h2>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </section>

      <div className="screen-grid calendar-layout">
        <section className="panel calendar-panel">
          <div className="section-heading compact-heading">
            <h2>Daily pattern</h2>
            <div className="calendar-heading-actions">
              <span className="muted small">Darker days spent more</span>
              <button className="icon-button" type="button" onClick={() => setIsSearching(true)} aria-label="Search spending" title="Search spending">
                <Search size={17} />
              </button>
            </div>
          </div>
          <div className="weekday-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {cells.map((cell) => {
              const total = dailyTotals[cell.date] ?? 0;
              const intensity = total / maxDaily;
              return (
                <button
                  type="button"
                  className={[
                    "day-cell",
                    cell.isCurrentMonth ? "" : "outside",
                    cell.isToday ? "today" : "",
                    selectedDate === cell.date ? "selected" : ""
                  ].join(" ")}
                  key={cell.date}
                  onClick={() => {
                    if (!cell.isCurrentMonth) {
                      setMonth(cell.date.slice(0, 7));
                    }
                    setSelectedDate(cell.date);
                    setEditingExpense(null);
                    setIsAdding(false);
                    clearDraft();
                  }}
                  style={{ "--intensity": intensity } as CSSProperties}
                >
                  <span className="day-number">{cell.day}</span>
                  {total > 0 ? (
                    <strong className="calendar-day-amount" aria-label={formatMoney(total, data.appSettings.currency)}>
                      {formatCalendarCellAmount(total)}
                    </strong>
                  ) : (
                    <span className="muted tiny">No spend</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
