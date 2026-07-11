import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, RefreshCw, RotateCcw } from "lucide-react";
import { hasDuplicateExpense, suggestFromExpenseHistory } from "../lib/analytics";
import { suggestCategoryLocal } from "../lib/categories";
import { fetchReferenceRate, latestKnownRate, normalizeCurrencyCode } from "../lib/currencies";
import { parseLocalDate } from "../lib/date";
import { createId, nowIso } from "../lib/defaults";
import { parseMoney, roundMoney } from "../lib/money";
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
  autoFocusAmount = false,
  afterAmount,
  saveLabel,
  onSave,
  onCancelEdit
}: ExpenseFormProps) {
  const amountInputRef = useRef<HTMLInputElement>(null);
  const defaultCategoryId = categories.find((category) => category.name.toLowerCase() === "food & drinks")?.id ?? categories[0]?.id ?? "";
  const defaultPaymentMethod = mostUsedPaymentMethod(expenses, settings.paymentMethods);
  const [draft, setDraft] = useState<ExpenseDraft>(() => ({
    amount: "",
    currency: settings.currency,
    baseAmount: "",
    date: defaultDate,
    categoryId: defaultCategoryId,
    title: "",
    remark: "",
    paymentMethod: defaultPaymentMethod,
    ...initialDraft
  }));
  const [error, setError] = useState("");
  const [didSave, setDidSave] = useState(false);
  const [rateState, setRateState] = useState<{ rate: number; date: string; source: ExchangeRateSource } | null>(null);
  const [rateStatus, setRateStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [isBaseAmountManual, setIsBaseAmountManual] = useState(false);
  const [rateRefreshNonce, setRateRefreshNonce] = useState(0);
  const amount = typeof draft.amount === "number" ? draft.amount : parseMoney(String(draft.amount));
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
      setDraft({
        amount: editingExpense.amount,
        currency: editingExpense.currency,
        baseAmount: editingExpense.baseAmount,
        date: editingExpense.date,
        categoryId: editingExpense.categoryId,
        title: editingExpense.title ?? "",
        remark: editingExpense.remark ?? "",
        paymentMethod: editingExpense.paymentMethod ?? defaultPaymentMethod
      });
      setRateState({
        rate: editingExpense.exchangeRate,
        date: editingExpense.exchangeRateDate,
        source: editingExpense.exchangeRateSource
      });
      setRateStatus("ready");
      setIsBaseAmountManual(editingExpense.exchangeRateSource === "manual");
    }
  }, [defaultPaymentMethod, editingExpense]);

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
      rateRefreshNonce === 0 &&
      draft.currency === editingExpense.currency &&
      draft.date === editingExpense.date &&
      editingExpense.baseCurrency === settings.currency
    ) {
      return;
    }

    let cancelled = false;
    setRateStatus("loading");
    setIsBaseAmountManual(false);
    void fetchReferenceRate(draft.currency, settings.currency, draft.date)
      .catch(() => latestKnownRate(expenses, draft.currency, settings.currency, draft.date))
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
  }, [draft.currency, draft.date, editingExpense, expenses, isForeignCurrency, rateRefreshNonce, settings.currency]);

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
    setRateRefreshNonce(0);
    setDraft((current) => ({ ...current, currency: value, baseAmount: value === settings.currency ? current.amount : "" }));
    setError("");
  }

  function updateBaseAmount(value: string) {
    setDraft((current) => ({ ...current, baseAmount: value }));
    setIsBaseAmountManual(true);
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
          baseAmount: "",
          title: "",
          remark: "",
          date: current.date,
          categoryId: current.categoryId,
          paymentMethod: current.paymentMethod
        }));
        setIsBaseAmountManual(false);
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
        <div className="amount-field">
          <div className="amount-label-row">
            <span>Amount</span>
            <select className="currency-select" value={draft.currency} onChange={(event) => updateCurrency(event.target.value)} aria-label="Spending currency">
              {currencyChoices.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
          <input
            ref={amountInputRef}
            aria-label="Amount"
            autoFocus={autoFocusAmount && !editingExpense}
            inputMode="decimal"
            value={draft.amount}
            placeholder="0.00"
            onChange={(event) => updateAmount(event.target.value)}
          />
        </div>
        {isForeignCurrency && (
          <div className="currency-conversion span-2">
            <label>
              <span>In {settings.currency}</span>
              <input inputMode="decimal" value={draft.baseAmount} placeholder="0.00" onChange={(event) => updateBaseAmount(event.target.value)} />
            </label>
            <div className="currency-rate-note">
              <span>{formatRateNote(rateStatus, rateState, draft.currency, settings.currency, isBaseAmountManual)}</span>
              <button
                className="icon-button currency-rate-refresh"
                type="button"
                onClick={() => setRateRefreshNonce((value) => value + 1)}
                aria-label="Refresh reference rate"
                title="Refresh reference rate"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>
        )}
        {afterAmount && <div className="span-2 expense-alternate-entry">{afterAmount}</div>}
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

function formatRateNote(
  status: "idle" | "loading" | "ready" | "unavailable",
  rate: { rate: number; date: string; source: ExchangeRateSource } | null,
  fromCurrency: string,
  toCurrency: string,
  isManual: boolean
): string {
  if (isManual) return "Using your converted amount";
  if (status === "loading") return "Finding the dated reference rate...";
  if (!rate || status === "unavailable") return "Reference unavailable. Enter the converted amount.";
  const source = rate.source === "cached" ? "Saved reference" : rate.source === "ecb-reference" ? "ECB reference" : "Reference rate";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rate.date)
    ? new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" }).format(parseLocalDate(rate.date))
    : rate.date;
  return `1 ${fromCurrency} = ${rate.rate.toFixed(4)} ${toCurrency} · ${source}, ${date}`;
}
