import { useMemo, useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { getDailyTotals } from "../lib/analytics";
import { fallbackCategoryId } from "../lib/categories";
import { formatLocalIsoDate, parseLocalDate } from "../lib/date";
import { formatMoney } from "../lib/money";
import { mostUsedPaymentMethod } from "../lib/payments";
import { discardRecurringOccurrence, getDueRecurringOccurrences, recordRecurringOccurrence } from "../lib/recurring";
import { parseExpenseWithAiOrLocal, type AiSecretStore } from "../lib/ai/providers";
import type { Expense, ExpenseDraft, ProfileData, RecurringCadence } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { ExpenseForm } from "../components/ExpenseForm";
import { ExpenseList } from "../components/ExpenseList";
import { CategoryChip } from "../components/CategoryChip";
import { FormBackAction } from "../components/FormBackAction";
import { NaturalQuickAdd } from "../components/NaturalQuickAdd";
import { fetchReferenceRate, latestCachedRate, latestKnownRate, normalizeCurrencyCode } from "../lib/currencies";

interface TodayScreenProps {
  data: ProfileData;
  saveData: (data: ProfileData) => Promise<void>;
  upsertExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
  secrets: AiSecretStore;
}

const CADENCE_LABELS: Record<RecurringCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  annually: "Annually"
};

export function TodayScreen({ data, saveData, upsertExpense, deleteExpense, secrets }: TodayScreenProps) {
  const today = formatLocalIsoDate();
  const todayLabel = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(parseLocalDate(today));
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [quickText, setQuickText] = useState("");
  const [quickDraft, setQuickDraft] = useState<Partial<ExpenseDraft> | undefined>();
  const [quickMessage, setQuickMessage] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [pendingDiscardOccurrenceId, setPendingDiscardOccurrenceId] = useState<string | null>(null);
  const [recordingOccurrenceId, setRecordingOccurrenceId] = useState<string | null>(null);
  const [billRecordError, setBillRecordError] = useState<{ occurrenceId: string; message: string } | null>(null);
  const todayExpenses = useMemo(
    () => data.expenses.filter((expense) => expense.date === today).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.expenses, today]
  );
  const todayTotal = getDailyTotals(todayExpenses)[today] ?? 0;
  const dueOccurrences = useMemo(
    () => getDueRecurringOccurrences(data.recurringRules, data.expenses, today),
    [data.expenses, data.recurringRules, today]
  );

  async function parseQuickAdd() {
    if (!quickText.trim()) {
      setQuickMessage("Type a short expense first.");
      return;
    }
    setIsParsing(true);
    setQuickMessage("");
    try {
      const parsed = await parseExpenseWithAiOrLocal(quickText, data.aiSettings, data.categories, secrets, today, data.appSettings.paymentMethods, data.expenses);
      if (!parsed?.amount) {
        setQuickMessage("I could not find an amount.");
        return;
      }
      setQuickDraft({
        amount: parsed.amount,
        currency: parsed.currency ?? data.appSettings.currency,
        baseAmount: "",
        date: today,
        categoryId: parsed.categoryId ?? fallbackCategoryId(data.categories),
        title: parsed.title ?? quickText,
        remark: parsed.source === "ai" ? "AI suggestion" : "",
        paymentMethod: parsed.paymentMethod ?? mostUsedPaymentMethod(data.expenses, data.appSettings.paymentMethods)
      });
      setIsEntryOpen(true);
      setQuickMessage(parsed.source === "ai" ? "AI suggestion ready. Check it before saving." : "Draft ready. Check it before saving.");
    } finally {
      setIsParsing(false);
    }
  }

  async function recordBill(ruleId: string, occurrenceDate: string) {
    const occurrenceId = `${ruleId}:${occurrenceDate}`;
    const rule = data.recurringRules.find((item) => item.id === ruleId);
    if (!rule) return;
    setRecordingOccurrenceId(occurrenceId);
    setBillRecordError(null);
    try {
      const isForeignCurrency = normalizeCurrencyCode(rule.currency) !== normalizeCurrencyCode(data.appSettings.currency);
      const conversion = isForeignCurrency
        ? await fetchReferenceRate(rule.currency, data.appSettings.currency, occurrenceDate).catch(
            () => latestCachedRate(rule.currency, data.appSettings.currency, occurrenceDate) ?? latestKnownRate(data.expenses, rule.currency, data.appSettings.currency, occurrenceDate)
          )
        : null;
      if (isForeignCurrency && !conversion) {
        setBillRecordError({ occurrenceId, message: `Could not convert ${rule.currency} while offline. Try again when connected.` });
        return;
      }
      const result = recordRecurringOccurrence(data, ruleId, occurrenceDate, today, conversion);
      await saveData(result.data);
      setPendingDiscardOccurrenceId(null);
    } finally {
      setRecordingOccurrenceId(null);
    }
  }

  async function discardBill(ruleId: string, occurrenceDate: string) {
    await saveData(discardRecurringOccurrence(data, ruleId, occurrenceDate, today));
    setPendingDiscardOccurrenceId(null);
    setBillRecordError(null);
  }

  function openEntry(expense?: Expense) {
    setEditingExpense(expense ?? null);
    setQuickDraft(undefined);
    setQuickMessage("");
    setIsEntryOpen(true);
  }

  function closeEntry() {
    setEditingExpense(null);
    setQuickDraft(undefined);
    setQuickText("");
    setQuickMessage("");
    setIsEntryOpen(false);
  }

  return (
    <div className="today-screen">
      <section className="hero-panel app-metric-hero today-hero">
        <div>
          <p className="eyebrow">Today</p>
          <h2>{formatMoney(todayTotal, data.appSettings.currency)}</h2>
        </div>
        <div className="hero-side-stack">
          <div className="hero-meta-pill" aria-label={`Today is ${todayLabel}`}>
            <CalendarDays size={17} />
            <strong>{todayLabel}</strong>
          </div>
        </div>
      </section>

      {dueOccurrences.length > 0 && (
        <section className="panel upcoming-panel">
          <div className="section-heading compact-heading">
            <p className="eyebrow">Due bills</p>
            <span className="muted small">{dueOccurrences.length} pending</span>
          </div>
          <div className="upcoming-list">
            {dueOccurrences.map((occurrence) => {
              const item = occurrence.rule;
              const category = data.categories.find((entry) => entry.id === item.categoryId);
              const isDiscarding = pendingDiscardOccurrenceId === occurrence.id;
              const isRecording = recordingOccurrenceId === occurrence.id;
              return (
                <article className="upcoming-row due-occurrence-row" key={occurrence.id}>
                  <CategoryChip category={category} label="" compact />
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {category?.name ?? "Category"} · {item.paymentMethod || "Payment"} · {CADENCE_LABELS[item.cadence]}
                    </span>
                    <span>Due {formatDateLabel(occurrence.date)}</span>
                    {billRecordError?.occurrenceId === occurrence.id && <span className="due-rate-error">{billRecordError.message}</span>}
                  </div>
                  <strong>{formatMoney(item.amount, item.currency || data.appSettings.currency)}</strong>
                  <div className="due-occurrence-actions">
                    {isDiscarding ? (
                      <>
                        <button className="secondary-button" type="button" onClick={() => setPendingDiscardOccurrenceId(null)}>
                          Cancel
                        </button>
                        <button className="secondary-button danger-button" type="button" onClick={() => void discardBill(item.id, occurrence.date)}>
                          Discard
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="secondary-button" type="button" onClick={() => setPendingDiscardOccurrenceId(occurrence.id)}>
                          Discard
                        </button>
                        <button className="primary-button" type="button" disabled={isRecording} onClick={() => void recordBill(item.id, occurrence.date)}>
                          {isRecording ? "Recording…" : "Record"}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className={isEntryOpen || editingExpense ? "screen-grid today-grid entry-open" : "screen-grid today-grid entries-first"}>
        {(isEntryOpen || editingExpense) && (
        <section className="panel entry-panel">
          <FormBackAction label="Back to entries" onClick={closeEntry} />
          <ExpenseForm
            categories={data.categories}
            settings={data.appSettings}
            expenses={data.expenses}
            defaultDate={today}
            initialDraft={quickDraft}
            editingExpense={editingExpense}
            hideDate
            hideTitleRow
            autoFocusAmount
            afterAmount={
              !editingExpense ? (
                <NaturalQuickAdd
                  value={quickText}
                  message={quickMessage}
                  isParsing={isParsing}
                  aiEnabled={data.aiSettings.provider !== "none"}
                  onChange={setQuickText}
                  onDraft={() => void parseQuickAdd()}
                />
              ) : null
            }
            saveLabel="Save"
            onCancelEdit={closeEntry}
            onSave={(expense) => {
              void upsertExpense(expense);
              setEditingExpense(null);
              setQuickDraft(undefined);
              setQuickText("");
              setQuickMessage("");
              setIsEntryOpen(false);
            }}
          />
        </section>
        )}

        {!(isEntryOpen || editingExpense) && (
        <section className="panel activity-panel">
          <div className="section-heading compact-heading single-line-heading">
            <p className="eyebrow">Today’s entries</p>
            {todayExpenses.length > 0 && (
              <button className="secondary-button compact-add-button" type="button" onClick={() => openEntry()}>
                <Plus size={16} />
                Add
              </button>
            )}
          </div>
          {todayExpenses.length === 0 ? (
            <div className="empty-action">
              <EmptyState title="No entries today" body="Add once you spend." />
              <button className="primary-button" type="button" onClick={() => openEntry()}>
                <Plus size={17} />
                Add
              </button>
            </div>
          ) : (
            <ExpenseList compact expenses={todayExpenses} categories={data.categories} currency={data.appSettings.currency} onEdit={openEntry} onDelete={(id) => void deleteExpense(id)} />
          )}
        </section>
        )}
      </div>
    </div>
  );
}

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(parseLocalDate(date));
}
