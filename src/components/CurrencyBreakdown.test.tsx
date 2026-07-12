import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CurrencyBreakdown } from "./CurrencyBreakdown";
import type { Expense } from "../lib/types";

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense_1",
    amount: 10,
    currency: "SGD",
    baseAmount: 10,
    baseCurrency: "SGD",
    exchangeRate: 1,
    exchangeRateDate: "2026-07-12",
    exchangeRateSource: "base",
    date: "2026-07-12",
    categoryId: "cat_food_drinks",
    title: "Lunch",
    remark: null,
    paymentMethod: "PayNow",
    recurringRuleId: null,
    recurringOccurrenceDate: null,
    createdAt: "2026-07-12T04:00:00.000Z",
    updatedAt: "2026-07-12T04:00:00.000Z",
    ...overrides
  };
}

describe("CurrencyBreakdown", () => {
  it("stays hidden for a single base currency", () => {
    const { container } = render(<CurrencyBreakdown expenses={[expense()]} baseCurrency="SGD" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows native totals and opens a selected currency", () => {
    const onSelect = vi.fn();
    render(
      <CurrencyBreakdown
        expenses={[
          expense(),
          expense({ id: "expense_2", amount: 30, currency: "MYR", baseAmount: 9.15, exchangeRate: 0.305, exchangeRateSource: "ecb-reference" })
        ]}
        baseCurrency="SGD"
        onSelect={onSelect}
      />
    );

    expect(screen.getByText("By currency")).toBeInTheDocument();
    expect(screen.getByText("SGD 10.00")).toBeInTheDocument();
    expect(screen.getByText("MYR 30.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review 1 MYR entry" }));
    expect(onSelect).toHaveBeenCalledWith("MYR");
  });
});
