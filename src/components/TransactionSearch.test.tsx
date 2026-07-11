import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProfileData } from "../lib/defaults";
import type { Expense } from "../lib/types";
import { TransactionSearch } from "./TransactionSearch";

function expense(id: string, title: string, categoryId: string, amount: number, date: string): Expense {
  return {
    id,
    amount,
    currency: "SGD",
    baseAmount: amount,
    baseCurrency: "SGD",
    exchangeRate: 1,
    exchangeRateDate: date,
    exchangeRateSource: "base",
    date,
    categoryId,
    title,
    remark: null,
    paymentMethod: "PayNow",
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`
  };
}

describe("TransactionSearch", () => {
  it("searches records, totals results, and opens an entry", () => {
    const data = createDefaultProfileData();
    data.expenses = [
      expense("exp_grab", "Grab", "cat_transport", 14.8, "2026-07-10"),
      expense("exp_lunch", "Lunch", "cat_food_drinks", 6.5, "2026-07-09")
    ];
    const onEdit = vi.fn();
    render(<TransactionSearch data={data} onBack={vi.fn()} onEdit={onEdit} onDelete={vi.fn()} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "grab" } });
    expect(screen.getByText("1 entry")).toBeInTheDocument();
    expect(screen.getAllByText("SGD 14.80")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Edit expense" }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "exp_grab" }));
  });
});
