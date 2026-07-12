import { ChevronRight } from "lucide-react";
import { getCurrencyTotals } from "../lib/analytics";
import { formatMoney } from "../lib/money";
import type { Expense } from "../lib/types";

interface CurrencyBreakdownProps {
  expenses: Expense[];
  baseCurrency: string;
  label?: string;
  onSelect?: (currency: string) => void;
}

export function CurrencyBreakdown({ expenses, baseCurrency, label = "By currency", onSelect }: CurrencyBreakdownProps) {
  const totals = getCurrencyTotals(expenses, baseCurrency);
  if (!totals.some((total) => !total.isBase)) return null;

  return (
    <div className="currency-breakdown" aria-label={label}>
      <span className="currency-breakdown-label">{label}</span>
      <div className="currency-breakdown-values">
        {totals.map((total) => {
          const content = (
            <>
              <strong>{formatMoney(total.amount, total.currency)}</strong>
              {onSelect && <ChevronRight size={13} aria-hidden="true" />}
            </>
          );

          return onSelect ? (
            <button
              className="currency-breakdown-chip interactive"
              type="button"
              key={total.currency}
              onClick={() => onSelect(total.currency)}
              aria-label={`Review ${total.count} ${total.currency} ${total.count === 1 ? "entry" : "entries"}`}
            >
              {content}
            </button>
          ) : (
            <span className="currency-breakdown-chip" key={total.currency}>
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}
