import { useMemo, useState } from "react";
import { CalendarDays, History, Plus } from "lucide-react";
import { getDailyTotals } from "../lib/analytics";
import { fallbackCategoryId } from "../lib/categories";
import { formatLocalIsoDate, parseLocalDate } from "../lib/date";
import { formatMoney } from "../lib/money";
import { materializeDueRecurring } from "../lib/recurring";
import { parseExpenseWithAiOrLocal, type AiSecretStore } from "../lib/ai/providers";
import type { Expense, ExpenseDraft, ProfileData, RecurringCadence } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { ExpenseForm } from "../components/ExpenseForm";
import { ExpenseList } from "../components/ExpenseList";
import { CategoryChip } from "../components/CategoryChip";
import { NaturalQuickAdd } from "../components/NaturalQuickAdd";

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
  const todayExpenses = useMemo(
    () => data.expenses.filter((expense) => expense.date === today).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.expenses, today]
  );
  const todayTotal = getDailyTotals(todayExpenses)[today] ?? 0;
  const recentTemplates = useMemo(() => getRecentTemplates(data.expenses), [data.expenses]);
  const dueRules = useMemo(
    () => data.recurringRules.filter((rule) => rule.isActive && rule.nextDate <= today).sort((a, b) => a.nextDate.localeCompare(b.nextDate) || b.amount - a.amount),
    [data.recurringRules, today]
  );
  const dueActionLabel = dueRules.length === 1 ? "Record bill" : "Record bills";

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
        date: today,
        categoryId: parsed.categoryId ?? fallbackCategoryId(data.categories),
        title: parsed.title ?? quickText,
        remark: parsed.source === "ai" ? "AI suggestion" : "",
        paymentMethod: parsed.paymentMethod ?? data.appSettings.paymentMethods[0] ?? "Other"
      });
      setIsEntryOpen(true);
      setQuickMessage(parsed.source === "ai" ? "AI suggestion ready. Check it before saving." : "Draft ready. Check it before saving.");
    } finally {
      setIsParsing(false);
    }
  }

  async function applyRecurring() {
    const result = materializeDueRecurring(data, today);
    await saveData(result.data);
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

  function applyRecentTemplate(expense: Expense) {
    setEditingExpense(null);
    setQuickText("");
    setQuickDraft({
      amount: expense.amount,
      date: today,
      categoryId: expense.categoryId,
      title: expense.title ?? "",
      remark: "",
      paymentMethod: expense.paymentMethod ?? data.appSettings.paymentMethods[0] ?? "Other"
    });
    setQuickMessage("Recent spend ready. Check it before saving.");
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

      {dueRules.length > 0 && (
        <section className="panel upcoming-panel">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Due bills</p>
            </div>
            <button type="button" className="secondary-button due-bills-action" onClick={() => void applyRecurring()}>
              {dueActionLabel}
            </button>
          </div>
          <div className="upcoming-list">
            {dueRules.map((item) => {
              const category = data.categories.find((entry) => entry.id === item.categoryId);
              return (
                <article className="upcoming-row" key={item.id}>
                  <CategoryChip category={category} label="" compact />
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {category?.name ?? "Category"} · {item.paymentMethod || "Payment"} · {CADENCE_LABELS[item.cadence]}
                    </span>
                    <span>{item.nextDate}</span>
                  </div>
                  <strong>{formatMoney(item.amount, item.currency || data.appSettings.currency)}</strong>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className={isEntryOpen || editingExpense ? "screen-grid today-grid entry-open" : "screen-grid today-grid entries-first"}>
        {(isEntryOpen || editingExpense) && (
        <section className="panel entry-panel">
          <button className="secondary-button entry-top-cancel" type="button" onClick={closeEntry}>
            Cancel
          </button>
          {!editingExpense && (
            <NaturalQuickAdd
              value={quickText}
              message={quickMessage}
              isParsing={isParsing}
              aiEnabled={data.aiSettings.provider !== "none"}
              autoFocus
              onChange={setQuickText}
              onDraft={() => void parseQuickAdd()}
            />
          )}
          {!editingExpense && !quickDraft && !quickText && recentTemplates.length > 0 && (
            <div className="recent-spend-shortcuts" aria-label="Recent spending shortcuts">
              <p className="eyebrow">Recent</p>
              <div>
                {recentTemplates.map((expense) => {
                  const category = data.categories.find((item) => item.id === expense.categoryId);
                  return (
                    <button type="button" key={expense.id} onClick={() => applyRecentTemplate(expense)}>
                      <History size={14} />
                      <span>{expense.title || category?.name || "Spend"}</span>
                      <strong>{formatMoney(expense.amount, expense.currency || data.appSettings.currency)}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <ExpenseForm
            categories={data.categories}
            settings={data.appSettings}
            expenses={data.expenses}
            defaultDate={today}
            initialDraft={quickDraft}
            editingExpense={editingExpense}
            hideDate
            hideTitleRow
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

function getRecentTemplates(expenses: Expense[]): Expense[] {
  const seen = new Set<string>();
  const templates: Expense[] = [];
  const sorted = [...expenses].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  for (const expense of sorted) {
    const key = `${expense.title?.trim().toLowerCase() || expense.categoryId}|${expense.categoryId}|${expense.paymentMethod ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    templates.push(expense);
    if (templates.length === 3) break;
  }

  return templates;
}
