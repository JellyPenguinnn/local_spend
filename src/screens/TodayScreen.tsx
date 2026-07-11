import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { getDailyTotals } from "../lib/analytics";
import { fallbackCategoryId } from "../lib/categories";
import { formatLocalIsoDate, parseLocalDate } from "../lib/date";
import { clearExpenseDraft, expenseDraftKey } from "../lib/drafts";
import { formatMoney } from "../lib/money";
import { mostUsedPaymentMethod } from "../lib/payments";
import {
  discardRecurringOccurrence,
  getDueRecurringOccurrences,
  getUpcomingRecurringOccurrences,
  reconcileRecurringOccurrence,
  recordRecurringOccurrence
} from "../lib/recurring";
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
  profileId: string;
  data: ProfileData;
  saveData: (data: ProfileData) => Promise<boolean>;
  upsertExpense: (expense: Expense) => Promise<boolean>;
  deleteExpense: (expenseId: string) => Promise<boolean>;
  secrets: AiSecretStore;
}

const CADENCE_LABELS: Record<RecurringCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  annually: "Annually"
};

export function TodayScreen({ profileId, data, saveData, upsertExpense, deleteExpense, secrets }: TodayScreenProps) {
  const today = formatLocalIsoDate();
  const todayLabel = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(parseLocalDate(today));
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [quickText, setQuickText] = useState("");
  const [quickDraft, setQuickDraft] = useState<Partial<ExpenseDraft> | undefined>();
  const [quickMessage, setQuickMessage] = useState("");
  const [quickCategoryNeedsReview, setQuickCategoryNeedsReview] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [pendingDiscardOccurrenceId, setPendingDiscardOccurrenceId] = useState<string | null>(null);
  const [recordingOccurrenceId, setRecordingOccurrenceId] = useState<string | null>(null);
  const [billRecordError, setBillRecordError] = useState<{ occurrenceId: string; message: string } | null>(null);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const todayExpenses = useMemo(
    () => data.expenses.filter((expense) => expense.date === today).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.expenses, today]
  );
  const todayTotal = getDailyTotals(todayExpenses)[today] ?? 0;
  const dueOccurrences = useMemo(
    () => getDueRecurringOccurrences(data.recurringRules, data.expenses, today),
    [data.expenses, data.recurringRules, today]
  );
  const upcomingOccurrences = useMemo(
    () => getUpcomingRecurringOccurrences(data.recurringRules, data.expenses, today, 7),
    [data.expenses, data.recurringRules, today]
  );
  const activeDraftKey = expenseDraftKey(profileId, editingExpense ? `edit.${editingExpense.id}` : `today.${today}`);

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
      setQuickCategoryNeedsReview(!parsed.categoryId || (parsed.categoryConfidence ?? 0) < 0.72);
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
      const saved = await saveData(result.data);
      if (saved) setPendingDiscardOccurrenceId(null);
    } finally {
      setRecordingOccurrenceId(null);
    }
  }

  async function discardBill(ruleId: string, occurrenceDate: string) {
    const saved = await saveData(discardRecurringOccurrence(data, ruleId, occurrenceDate, today));
    if (saved) {
      setPendingDiscardOccurrenceId(null);
      setBillRecordError(null);
    }
  }

  async function reconcileRecordedBill(ruleId: string, occurrenceDate: string, expenseId: string) {
    const saved = await saveData(reconcileRecurringOccurrence(data, ruleId, occurrenceDate, expenseId, today));
    if (saved) {
      setPendingDiscardOccurrenceId(null);
      setBillRecordError(null);
    }
  }

  function openEntry(expense?: Expense) {
    setEditingExpense(expense ?? null);
    setQuickDraft(undefined);
    setQuickMessage("");
    setQuickCategoryNeedsReview(false);
    setIsEntryOpen(true);
  }

  function closeEntry() {
    clearExpenseDraft(activeDraftKey);
    setEditingExpense(null);
    setQuickDraft(undefined);
    setQuickText("");
    setQuickMessage("");
    setQuickCategoryNeedsReview(false);
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
                    {occurrence.relatedExpense && occurrence.relatedExpense.amount !== item.amount && (
                      <span className="due-amount-mismatch">
                        Recorded {formatMoney(occurrence.relatedExpense.amount, occurrence.relatedExpense.currency)} · expected {formatMoney(item.amount, item.currency)}
                      </span>
                    )}
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
                        {occurrence.relatedExpense && occurrence.relatedExpense.amount !== item.amount ? (
                          <>
                            <button className="secondary-button" type="button" disabled={isRecording} onClick={() => void recordBill(item.id, occurrence.date)}>
                              Record expected
                            </button>
                            <button className="primary-button" type="button" onClick={() => void reconcileRecordedBill(item.id, occurrence.date, occurrence.relatedExpense!.id)}>
                              Use recorded
                            </button>
                          </>
                        ) : (
                          <button className="primary-button" type="button" disabled={isRecording} onClick={() => void recordBill(item.id, occurrence.date)}>
                            {isRecording ? "Recording…" : "Record"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {upcomingOccurrences.length > 0 && (
        <section className="panel upcoming-preview-panel">
          <button className="upcoming-toggle" type="button" onClick={() => setShowUpcoming((value) => !value)} aria-expanded={showUpcoming}>
            <span>
              <strong>Upcoming</strong>
              <small>Next 7 days · {upcomingOccurrences.length}</small>
            </span>
            {showUpcoming ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {showUpcoming && (
            <div className="upcoming-list compact-upcoming-list">
              {upcomingOccurrences.map((occurrence) => {
                const item = occurrence.rule;
                const category = data.categories.find((entry) => entry.id === item.categoryId);
                return (
                  <article className="upcoming-row" key={occurrence.id}>
                    <CategoryChip category={category} label="" compact />
                    <div>
                      <strong>{item.title}</strong>
                      <span>{formatDateLabel(occurrence.date)} · {CADENCE_LABELS[item.cadence]}</span>
                    </div>
                    <strong>{formatMoney(item.amount, item.currency || data.appSettings.currency)}</strong>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <div className={isEntryOpen || editingExpense ? "screen-grid today-grid entry-open" : "screen-grid today-grid entries-first"}>
        {(isEntryOpen || editingExpense) && (
        <section className="panel entry-panel">
          <FormBackAction onClick={closeEntry} />
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
                  onDraft={() => void parseQuickAdd()}
                />
              ) : null
            }
            saveLabel="Save"
            onCancelEdit={closeEntry}
            onSave={(expense) => upsertExpense(expense)}
            onSaved={closeEntry}
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
