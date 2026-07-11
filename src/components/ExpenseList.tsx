import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { categoryName } from "../lib/categories";
import { expenseBaseAmount, isForeignExpense } from "../lib/currencies";
import { formatMoney } from "../lib/money";
import type { Category, Expense } from "../lib/types";
import { CategoryChip } from "./CategoryChip";

interface ExpenseListProps {
  expenses: Expense[];
  categories: Category[];
  currency: string;
  compact?: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (expenseId: string) => void;
}

export function ExpenseList({ expenses, categories, currency, compact = false, onEdit, onDelete }: ExpenseListProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (expenses.length === 0) {
    return <p className="muted small">No expenses here yet.</p>;
  }

  return (
    <div className={compact ? "expense-list compact-expense-list" : "expense-list"}>
      {expenses.map((expense) => {
        const category = categories.find((item) => item.id === expense.categoryId);
        return (
          <article className="expense-row" key={expense.id}>
            <CategoryChip category={category} label="" compact />
            <div className="expense-main">
              <div className="expense-title">
                <strong>{expense.title || categoryName(categories, expense.categoryId)}</strong>
                {!compact && <span>{expense.date}</span>}
              </div>
              <div className="expense-meta">
                <span>
                  {categoryName(categories, expense.categoryId)}
                  {expense.paymentMethod ? ` · ${expense.paymentMethod}` : ""}
                </span>
                {expense.remark && <span>Remark: {expense.remark}</span>}
              </div>
            </div>
            <div className="expense-amount-stack">
              <strong className="expense-amount">{formatMoney(expense.amount, expense.currency || currency)}</strong>
              {isForeignExpense(expense, currency) && <span>≈ {formatMoney(expenseBaseAmount(expense), currency)}</span>}
            </div>
            <div className={pendingDeleteId === expense.id ? "row-actions confirming" : "row-actions"}>
              {pendingDeleteId === expense.id ? (
                <>
                  <button className="secondary-button" type="button" onClick={() => setPendingDeleteId(null)}>
                    Cancel
                  </button>
                  <button
                    className="secondary-button danger-button"
                    type="button"
                    onClick={() => {
                      setPendingDeleteId(null);
                      onDelete(expense.id);
                    }}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button className="icon-button" type="button" onClick={() => onEdit(expense)} aria-label="Edit expense" title="Edit expense">
                    <Pencil size={16} />
                  </button>
                  <button className="icon-button danger-icon" type="button" onClick={() => setPendingDeleteId(expense.id)} aria-label="Delete expense" title="Delete expense">
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
