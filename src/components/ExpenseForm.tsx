import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, MessageSquarePlus, RotateCcw } from "lucide-react";
import { hasDuplicateExpense, suggestFromExpenseHistory } from "../lib/analytics";
import { suggestCategoryLocal } from "../lib/categories";
import { formatExchangeRateNote, normalizeCurrencyCode, resolveReferenceRate } from "../lib/currencies";
import { parseLocalDate } from "../lib/date";
import { createId, nowIso } from "../lib/defaults";
import { clearExpenseDraft, loadExpenseDraft, saveExpenseDraft } from "../lib/drafts";
import { MAX_DESCRIPTION_LENGTH, MAX_REMARK_LENGTH } from "../lib/dataLimits";
import { formatCompactMoney, parseMoney, roundMoney } from "../lib/money";
import { mostUsedPaymentMethod } from "../lib/payments";
import type { AppSettings, Category, ExchangeRateSource, Expense, ExpenseDraft } from "../lib/types";

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
  autoFocusAmount?: boolean;
  afterAmount?: ReactNode;
  saveLabel?: string;
  draftStorageKey?: string;
  initialCategoryNeedsReview?: boolean;
  onSave: (expense: Expense, mode: "add" | "edit") => Promise<boolean>;
  onSaved?: () => void;
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
  autoFocusAmount = false,
  afterAmount,
  saveLabel,
  draftStorageKey,
  initialCategoryNeedsReview = false,
  onSave,
  onSaved,
  onCancelEdit
}: ExpenseFormProps) {
  const amountInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const categoryInputRef = useRef<HTMLSelectElement>(null);
  const savedTimeoutRef = useRef<number | null>(null);
  const defaultCategoryId = categories.find((category) => category.name.toLowerCase() === "food & drinks")?.id ?? categories[0]?.id ?? "";
  const defaultPaymentMethod = mostUsedPaymentMethod(expenses, settings.paymentMethods);
  const [draft, setDraft] = useState<ExpenseDraft>(() => {
    const persisted = draftStorageKey ? loadExpenseDraft(draftStorageKey) : null;
    return {
      amount: "",
      currency: settings.currency,
      baseAmount: "",
      date: defaultDate,
      categoryId: defaultCategoryId,
      title: "",
      remark: "",
      paymentMethod: defaultPaymentMethod,
      ...initialDraft,
      ...persisted
    };
  });
  const [error, setError] = useState("");
  const [didSave, setDidSave] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDuplicateConfirmationVisible, setIsDuplicateConfirmationVisible] = useState(false);
  const [isRemarkOpen, setIsRemarkOpen] = useState(Boolean(editingExpense?.remark || initialDraft?.remark));
  const [categoryNeedsReview, setCategoryNeedsReview] = useState(initialCategoryNeedsReview);
  const [rateState, setRateState] = useState<{ rate: number; date: string; source: ExchangeRateSource } | null>(null);
  const [rateStatus, setRateStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [isBaseAmountManual, setIsBaseAmountManual] = useState(false);
  const amount = typeof draft.amount === "number" ? draft.amount : parseMoney(String(draft.amount));
  const convertedAmount = typeof draft.baseAmount === "number" ? draft.baseAmount : parseMoney(String(draft.baseAmount));
  const isForeignCurrency = normalizeCurrencyCode(draft.currency) !== normalizeCurrencyCode(settings.currency);
  const currencyChoices = settings.enabledCurrencies.includes(draft.currency) ? settings.enabledCurrencies : [...settings.enabledCurrencies, draft.currency];
  const suggestion = useMemo(() => suggestCategoryLocal(`${draft.title} ${draft.remark}`, categories), [categories, draft.remark, draft.title]);
  const memorySuggestion = useMemo(
    () => suggestFromExpenseHistory(`${draft.title} ${draft.remark}`, expenses, editingExpense?.id),
    [draft.remark, draft.title, editingExpense?.id, expenses]
  );
  const duplicate = amount !== null && hasDuplicateExpense(expenses, { amount, currency: draft.currency, date: draft.date, title: draft.title }, editingExpense?.id);

  useEffect(() => {
    if (editingExpense) {
      const persisted = draftStorageKey ? loadExpenseDraft(draftStorageKey) : null;
      setDraft({
        amount: editingExpense.amount,
        currency: editingExpense.currency,
        baseAmount: editingExpense.baseAmount,
        date: editingExpense.date,
        categoryId: editingExpense.categoryId,
        title: editingExpense.title ?? "",
        remark: editingExpense.remark ?? "",
        paymentMethod: editingExpense.paymentMethod ?? defaultPaymentMethod,
        ...persisted
      });
      setRateState({
        rate: editingExpense.exchangeRate,
        date: editingExpense.exchangeRateDate,
        source: editingExpense.exchangeRateSource
      });
      setRateStatus("ready");
      setIsBaseAmountManual(editingExpense.exchangeRateSource === "manual");
      setIsRemarkOpen(Boolean(editingExpense.remark || persisted?.remark));
    }
  }, [defaultPaymentMethod, draftStorageKey, editingExpense]);

  useEffect(() => {
    if (draft.remark) setIsRemarkOpen(true);
  }, [draft.remark]);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current !== null) window.clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!editingExpense) {
      setDraft((current) => ({
        ...current,
        date: initialDraft?.date ?? defaultDate,
        categoryId: initialDraft?.categoryId ?? current.categoryId,
        amount: initialDraft?.amount ?? current.amount,
        currency: initialDraft?.currency ?? current.currency,
        baseAmount: initialDraft?.baseAmount ?? current.baseAmount,
        title: initialDraft?.title ?? current.title,
        remark: initialDraft?.remark ?? current.remark,
        paymentMethod: initialDraft?.paymentMethod ?? current.paymentMethod
      }));
    }
  }, [defaultDate, editingExpense, initialDraft]);

  useEffect(() => {
    setCategoryNeedsReview(initialCategoryNeedsReview);
  }, [initialCategoryNeedsReview, initialDraft]);

  useEffect(() => {
    if (!duplicate) setIsDuplicateConfirmationVisible(false);
  }, [duplicate]);

  useEffect(() => {
    if (draftStorageKey && !didSave) {
      saveExpenseDraft(draftStorageKey, draft);
    }
  }, [didSave, draft, draftStorageKey]);

  useEffect(() => {
    if (autoFocusAmount && !editingExpense) {
      amountInputRef.current?.focus({ preventScroll: true });
    }
  }, [autoFocusAmount, editingExpense]);

  useEffect(() => {
    if (!isForeignCurrency) {
      setRateState({ rate: 1, date: draft.date, source: "base" });
      setRateStatus("ready");
      setIsBaseAmountManual(false);
      setDraft((current) => ({ ...current, baseAmount: current.amount }));
      return;
    }

    if (
      editingExpense &&
      draft.currency === editingExpense.currency &&
      draft.date === editingExpense.date &&
      editingExpense.baseCurrency === settings.currency
    ) {
      return;
    }

    let cancelled = false;
    setRateStatus("loading");
    setIsBaseAmountManual(false);
    void resolveReferenceRate(draft.currency, settings.currency, draft.date, expenses)
      .then((quote) => {
        if (cancelled) return;
        if (!quote) {
          setRateState(null);
          setRateStatus("unavailable");
          setDraft((current) => ({ ...current, baseAmount: "" }));
          return;
        }
        setRateState(quote);
        setRateStatus("ready");
        setDraft((current) => {
          const parsed = typeof current.amount === "number" ? current.amount : parseMoney(String(current.amount));
          return { ...current, baseAmount: parsed === null ? "" : roundMoney(parsed * quote.rate) };
        });
      });
    return () => {
      cancelled = true;
    };
  }, [draft.currency, draft.date, editingExpense, expenses, isForeignCurrency, settings.currency]);

  function update<K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function updateAmount(value: string) {
    setDraft((current) => {
      const parsed = parseMoney(value);
      const baseAmount = !isBaseAmountManual && rateState && parsed !== null ? roundMoney(parsed * rateState.rate) : current.baseAmount;
      return { ...current, amount: value, baseAmount };
    });
    setError("");
  }

  function updateCurrency(value: string) {
    setRateState(null);
    setRateStatus("idle");
    setIsBaseAmountManual(false);
    setDraft((current) => ({ ...current, currency: value, baseAmount: value === settings.currency ? current.amount : "" }));
    setError("");
  }

  function updateCategory(value: string) {
    update("categoryId", value);
    setCategoryNeedsReview(false);
  }

  function updateBaseAmount(value: string) {
    setDraft((current) => ({ ...current, baseAmount: value }));
    setIsBaseAmountManual(true);
    setError("");
  }

  async function submit() {
    if (didSave || isSaving) return;
    const parsedAmount = typeof draft.amount === "number" ? draft.amount : parseMoney(String(draft.amount));
    if (parsedAmount === null) {
      setError("Enter a positive amount, up to 2 decimals.");
      amountInputRef.current?.focus();
      return;
    }
    if (!draft.date) {
      setError("Choose a spending date.");
      dateInputRef.current?.focus();
      return;
    }
    if (!draft.categoryId) {
      setError("Choose a category.");
      categoryInputRef.current?.focus();
      return;
    }
    if (draft.title.trim().length > MAX_DESCRIPTION_LENGTH) {
      setError(`Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`);
      return;
    }
    if (draft.remark.trim().length > MAX_REMARK_LENGTH) {
      setError(`Keep the remark under ${MAX_REMARK_LENGTH} characters.`);
      return;
    }
    const parsedBaseAmount = isForeignCurrency
      ? typeof draft.baseAmount === "number"
        ? draft.baseAmount
        : parseMoney(String(draft.baseAmount))
      : parsedAmount;
    if (parsedBaseAmount === null) {
      setError(`Enter the ${settings.currency} equivalent so totals stay accurate.`);
      return;
    }
    const exchangeRate = isForeignCurrency ? parsedBaseAmount / parsedAmount : 1;
    if (duplicate && !editingExpense && !isDuplicateConfirmationVisible) {
      setIsDuplicateConfirmationVisible(true);
      return;
    }
    const timestamp = nowIso();
    const expense: Expense = {
      id: editingExpense?.id ?? createId("exp"),
      amount: parsedAmount,
      currency: normalizeCurrencyCode(draft.currency, settings.currency),
      baseAmount: roundMoney(parsedBaseAmount),
      baseCurrency: settings.currency,
      exchangeRate,
      exchangeRateDate: isForeignCurrency ? (isBaseAmountManual ? draft.date : (rateState?.date ?? draft.date)) : draft.date,
      exchangeRateSource: isForeignCurrency ? (isBaseAmountManual ? "manual" : (rateState?.source ?? "manual")) : "base",
      date: draft.date,
      categoryId: draft.categoryId,
      title: draft.title.trim() || null,
      remark: draft.remark.trim() || null,
      paymentMethod: draft.paymentMethod || null,
      recurringRuleId: editingExpense?.recurringRuleId ?? null,
      recurringOccurrenceDate: editingExpense?.recurringOccurrenceDate ?? null,
      createdAt: editingExpense?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
    setIsSaving(true);
    const saved = await onSave(expense, editingExpense ? "edit" : "add");
    if (!saved) {
      setError("Could not save. Your entry is still here so you can try again.");
      setIsSaving(false);
      return;
    }
    clearExpenseDraft(draftStorageKey);
    setDidSave(true);
    setIsSaving(false);
    savedTimeoutRef.current = window.setTimeout(() => onSaved?.(), 220);
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

  const suggestedCategoryId = memorySuggestion?.categoryId ?? suggestion?.categoryId;
  const suggestedPaymentMethod = memorySuggestion?.paymentMethod;
  const shouldShowSmartSuggestion =
    !editingExpense &&
    Boolean(suggestedCategoryId) &&
    (suggestedCategoryId !== draft.categoryId || Boolean(suggestedPaymentMethod && suggestedPaymentMethod !== draft.paymentMethod));

  return (
    <form
      className={compact ? "expense-form compact" : "expense-form"}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {!hideTitleRow && (
        <div className="form-title-row">
          <div>
            <h3>{editingExpense ? "Edit expense" : "Add expense"}</h3>
          </div>
          {editingExpense && (
            <button className="icon-button" type="button" onClick={onCancelEdit} aria-label="Cancel editing" title="Cancel editing">
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      )}
      <div className="expense-grid">
        <div className="amount-field">
          <span className="amount-field-label">Amount</span>
          <div className="money-input-control" role="group" aria-label="Amount and currency">
            <select className="currency-select" value={draft.currency} onChange={(event) => updateCurrency(event.target.value)} aria-label="Spending currency">
              {currencyChoices.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
            <input
              ref={amountInputRef}
              aria-label="Amount"
              autoFocus={autoFocusAmount && !editingExpense}
              autoComplete="off"
              enterKeyHint="next"
              inputMode="decimal"
              value={draft.amount}
              placeholder="0.00"
              onChange={(event) => updateAmount(event.target.value)}
            />
          </div>
        </div>
        {isForeignCurrency && (
          <div className="currency-conversion span-2">
            {rateStatus === "unavailable" || isBaseAmountManual ? (
              <label className="currency-conversion-manual">
                <span>In {settings.currency}</span>
                <input inputMode="decimal" value={draft.baseAmount} placeholder="0.00" onChange={(event) => updateBaseAmount(event.target.value)} />
              </label>
            ) : (
              <div className="currency-conversion-value">
                <span>In {settings.currency}</span>
                <output className="currency-conversion-output" aria-label={`In ${settings.currency}`} aria-live="polite">
                  {formatCompactMoney(convertedAmount ?? 0, settings.currency)}
                </output>
              </div>
            )}
            <div className="currency-rate-note">
              <span>{formatExchangeRateNote(rateStatus, rateState, draft.currency, settings.currency, draft.date, { isManual: isBaseAmountManual })}</span>
            </div>
          </div>
        )}
        {afterAmount && <div className="span-2 expense-alternate-entry">{afterAmount}</div>}
        {!hideDate && (
          <label>
            <span>Date</span>
            <div className="date-control">
              <input ref={dateInputRef} className="native-date-input" type="date" value={draft.date} onChange={(event) => update("date", event.target.value)} aria-label="Date" />
              <div className="date-display" aria-hidden="true">
                <strong>{formatDateForField(draft.date)}</strong>
                <CalendarDays size={17} />
              </div>
            </div>
          </label>
        )}
        <label className={categoryNeedsReview ? "field-needs-review" : ""}>
          <span>
            Category
            {categoryNeedsReview && <small>Check</small>}
          </span>
          <select ref={categoryInputRef} value={draft.categoryId} onChange={(event) => updateCategory(event.target.value)}>
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
          <input autoComplete="off" enterKeyHint="next" maxLength={MAX_DESCRIPTION_LENGTH} value={draft.title} placeholder="Lunch, NTUC, Grab..." onChange={(event) => update("title", event.target.value)} />
        </label>
        {shouldShowSmartSuggestion && (
          <button
            className="smart-suggestion span-2"
            type="button"
            onClick={() => {
              if (memorySuggestion) {
                applyMemorySuggestion();
              } else if (suggestion) {
                updateCategory(suggestion.categoryId);
              }
            }}
          >
            <span>{memorySuggestion ? "Matched previous entry" : "Suggested category"}</span>
            <strong>
              {categories.find((category) => category.id === suggestedCategoryId)?.name}
              {suggestedPaymentMethod ? ` · ${suggestedPaymentMethod}` : ""}
            </strong>
          </button>
        )}
        {isRemarkOpen ? (
          <label className="span-2">
            <span>Remark</span>
            <input autoComplete="off" enterKeyHint="done" maxLength={MAX_REMARK_LENGTH} value={draft.remark} placeholder="Optional note" onChange={(event) => update("remark", event.target.value)} />
          </label>
        ) : (
          <button className="optional-field-toggle span-2" type="button" onClick={() => setIsRemarkOpen(true)}>
            <MessageSquarePlus size={16} />
            Add remark
          </button>
        )}
      </div>
      {isDuplicateConfirmationVisible && duplicate && (
        <p className="form-note warning" role="status">
          {draft.title.trim()
            ? "Possible duplicate: the same amount and description are already recorded for this date."
            : "Possible duplicate: the same amount is already recorded for this date."}
        </p>
      )}
      {error && <p className="form-note danger" role="alert">{error}</p>}
      <p className="sr-only" aria-live="polite">{didSave ? "Expense saved." : isSaving ? "Saving expense." : ""}</p>
      <button className={didSave ? "primary-button save-button saved" : "primary-button save-button"} type="submit" disabled={didSave || isSaving}>
        <Check size={17} />
        {didSave
          ? "Saved"
          : isSaving
            ? "Saving…"
            : isDuplicateConfirmationVisible && duplicate && !editingExpense
              ? "Save anyway"
              : saveLabel ?? (editingExpense ? "Save changes" : "Save expense")}
      </button>
    </form>
  );
}

function formatDateForField(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Choose date";
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(parseLocalDate(value));
}
