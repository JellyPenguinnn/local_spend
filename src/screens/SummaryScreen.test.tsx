import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProfileData } from "../lib/defaults";
import { formatMonthKey } from "../lib/date";
import type { Expense } from "../lib/types";
import { SummaryScreen } from "./SummaryScreen";

describe("SummaryScreen mixed-currency review", () => {
  it("opens the monthly entries for a selected native currency", () => {
    const data = createDefaultProfileData();
    const month = formatMonthKey();
    const expense: Expense = {
      id: "expense_myr",
      amount: 30,
      currency: "MYR",
      baseAmount: 9.15,
      baseCurrency: "SGD",
      exchangeRate: 0.305,
      exchangeRateDate: `${month}-02`,
      exchangeRateSource: "ecb-reference",
      date: `${month}-02`,
      categoryId: "cat_transport",
      title: "Petrol",
      remark: null,
      paymentMethod: "PayNow",
      recurringRuleId: null,
      recurringOccurrenceDate: null,
      createdAt: `${month}-02T04:00:00.000Z`,
      updatedAt: `${month}-02T04:00:00.000Z`
    };
    data.expenses = [expense];

    render(<SummaryScreen data={data} saveData={vi.fn(async () => true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Review 1 MYR entry" }));

    expect(screen.getByRole("heading", { name: "MYR" })).toBeInTheDocument();
    expect(screen.getByText("Total: MYR 30.00")).toBeInTheDocument();
    expect(screen.getByText("≈ SGD 9.15 for reporting")).toBeInTheDocument();
    expect(screen.getByText("Petrol")).toBeInTheDocument();
  });
});
