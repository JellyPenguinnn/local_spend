import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, RotateCcw } from "lucide-react";
import { hasDuplicateExpense, suggestFromExpenseHistory } from "../lib/analytics";
import { suggestCategoryLocal } from "../lib/categories";
import { parseLocalDate } from "../lib/date";
import { createId, nowIso } from "../lib/defaults";
import { parseMoney } from "../lib/money";
import type { AppSettings, Category, Expense, ExpenseDraft } from "../lib/types";

interface ExpenseFormProps {
  categories: Category[];
  settings: AppSettings;
  expenses: Expense[];
  defaultDate: string;
  initialDraft?: Partial<ExpenseDraft>;
  editingExpense?: Expense | null;
  compact?: boolean;
  hideDate?: boolean;
  hideTitleRow?: boolean;
  saveLabel?: string;
  onSave: (expense: Expense, mode: "add" | "edit") => void;
  onCancelEdit?: () => void;
}

export function ExpenseForm({
  categories,
  settings,
  expenses,
  defaultDate,
  initialDraft,
  editingExpense,
  compact = false,
  hideDate = false,
  hideTitleRow = false,
  saveLabel,
  onSave,
  onCancelEdit
}: ExpenseFormProps) {
  const defaultCategoryId = categories[0]?.id ?? "";
  const [draft, setDraft] = useState<ExpenseDraft>(() => ({
    amount: "",
    date: defaultDate,
    categoryId: defaultCategoryId,
    title: "",
    remark: "",
    paymentMethod: settings.paymentMethods[0] ?? "Other",
    ...initialDraft
  }));
  const [error, setError] = useState("");
  const [didSave, setDidSave] = useState(false);
  const amount = typeof draft.amount === "number" ? draft.amount : parseMoney(String(draft.amount));
  const suggestion = useMemo(() => suggestCategoryLocal(`${draft.title} ${draft.remark}`, categories), [categories, draft.remark, draft.title]);
  const memorySuggestion = useMemo(
    () => suggestFromExpenseHistory(`${draft.title} ${draft.remark}`, expenses, editingExpense?.id),
    [draft.remark, draft.title, editingExpense?.id, expenses]
  );
  const duplicate = amount !== null && hasDuplicateExpense(expenses, { amount, date: draft.date, title: draft.title }, editingExpense?.id);

  useEffect(() => {
    if (editingExpense) {
      setDraft({
        amount: editingExpense.amount,
        date: editingExpense.date,
        categoryId: editingExpense.categoryId,
        title: editingExpense.title ?? "",
        remark: editingExpense.remark ?? "",
        paymentMethod: editingExpense.paymentMethod ?? settings.paymentMethods[0] ?? "Other"
      });
    }
  }, [editingExpense, settings.paymentMethods]);

  useEffect(() => {
    if (!editingExpense) {
      setDraft((current) => ({
        ...current,
        date: initialDraft?.date ?? defaultDate,
        categoryId: initialDraft?.categoryId ?? current.categoryId,
        amount: initialDraft?.amount ?? current.amount,
        title: initialDraft?.title ?? current.title,
        remark: initialDraft?.remark ?? current.remark,
        paymentMethod: initialDraft?.paymentMethod ?? current.paymentMethod
      }));
    }
  }, [defaultDate, editingExpense, initialDraft]);

  function update<K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function submit() {
    if (didSave) return;
    const parsedAmount = typeof draft.amount === "number" ? draft.amount : parseMoney(String(draft.amount));
    if (parsedAmount === null) {
      setError("Enter a positive amount, up to 2 decimals.");
      return;
    }
    if (!draft.date) {
      setError("Choose a spending date.");
      return;
    }
    if (!draft.categoryId) {
      setError("Choose a category.");
      return;
    }
    const timestamp = nowIso();
    const expense: Expense = {
      id: editingExpense?.id ?? createId("exp"),
      amount: parsedAmount,
      currency: settings.currency,
      date: draft.date,
      categoryId: draft.categoryId,
      title: draft.title.trim() || null,
      remark: draft.remark.trim() || null,
      paymentMethod: draft.paymentMethod || null,
      createdAt: editingExpense?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
    setDidSave(true);
    window.setTimeout(() => {
      onSave(expense, editingExpense ? "edit" : "add");
      if (!editingExpense) {
        setDraft((current) => ({
          ...current,
          amount: "",
          title: "",
          remark: "",
          date: current.date,
          categoryId: current.categoryId,
          paymentMethod: current.paymentMethod
        }));
      }
    }, 180);
  }

  function applyMemorySuggestion() {
    if (!memorySuggestion) return;
    setDraft((current) => ({
      ...current,
      categoryId: memorySuggestion.categoryId,
      paymentMethod: memorySuggestion.paymentMethod ?? current.paymentMethod
    }));
    setError("");
  }

  return (
    <div className={compact ? "expense-form compact" : "expense-form"}>
      {!hideTitleRow && (
        <div className="form-title-row">
          <div>
            <h3>{editingExpense ? "Edit expense" : "Add expense"}</h3>
            {duplicate && <p className="form-note warning">This looks similar to an existing expense.</p>}
            {suggestion && suggestion.categoryId !== draft.categoryId && !editingExpense && (
              <button className="link-button" type="button" onClick={() => update("categoryId", suggestion.categoryId)}>
                Use suggested category: {categories.find((category) => category.id === suggestion.categoryId)?.name}
              </button>
            )}
            {memorySuggestion && !editingExpense && (memorySuggestion.categoryId !== draft.categoryId || memorySuggestion.paymentMethod !== draft.paymentMethod) && (
              <button className="smart-suggestion" type="button" onClick={applyMemorySuggestion}>
                <span>Smart match</span>
                <strong>
                  {categories.find((category) => category.id === memorySuggestion.categoryId)?.name}
                  {memorySuggestion.paymentMethod ? ` · ${memorySuggestion.paymentMethod}` : ""}
                </strong>
              </button>
            )}
          </div>
          {editingExpense && (
            <button className="icon-button" type="button" onClick={onCancelEdit} aria-label="Cancel editing" title="Cancel editing">
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      )}
      {hideTitleRow && duplicate && <p className="form-note warning">This looks similar to an existing expense.</p>}
      <div className="expense-grid">
        <label className="amount-field">
          <span>Amount</span>
          <input
            inputMode="decimal"
            value={draft.amount}
            placeholder="0.00"
            onChange={(event) => update("amount", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
        </label>
        {!hideDate && (
          <label>
            <span>Date</span>
            <div className="date-control">
              <input className="native-date-input" type="date" value={draft.date} onChange={(event) => update("date", event.target.value)} aria-label="Date" />
              <div className="date-display" aria-hidden="true">
                <strong>{formatDateForField(draft.date)}</strong>
                <CalendarDays size={17} />
              </div>
            </div>
          </label>
        )}
        <label>
          <span>Category</span>
          <select value={draft.categoryId} onChange={(event) => update("categoryId", event.target.value)}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Payment</span>
          <select value={draft.paymentMethod} onChange={(event) => update("paymentMethod", event.target.value)}>
            {settings.paymentMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <label className="span-2">
          <span>Description</span>
          <input value={draft.title} placeholder="Lunch, NTUC, Grab..." onChange={(event) => update("title", event.target.value)} />
        </label>
        <label className="span-2">
          <span>Remark</span>
          <input value={draft.remark} placeholder="Optional note" onChange={(event) => update("remark", event.target.value)} />
        </label>
      </div>
      {error && <p className="form-note danger">{error}</p>}
      <button className={didSave ? "primary-button save-button saved" : "primary-button save-button"} type="button" disabled={didSave} onClick={submit}>
        <Check size={17} />
        {didSave ? "Saved" : saveLabel ?? (editingExpense ? "Save changes" : "Save expense")}
      </button>
    </div>
  );
}

function formatDateForField(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Choose date";
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(parseLocalDate(value));
}
