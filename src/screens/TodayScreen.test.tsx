import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultProfileData } from "../lib/defaults";
import { TodayScreen } from "./TodayScreen";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TodayScreen entry flow", () => {
  it("focuses amount while keeping natural entry visible as an alternative", () => {
    render(
      <TodayScreen
        data={createDefaultProfileData()}
        saveData={vi.fn().mockResolvedValue(undefined)}
        upsertExpense={vi.fn().mockResolvedValue(undefined)}
        deleteExpense={vi.fn().mockResolvedValue(undefined)}
        secrets={{ getSecret: vi.fn().mockResolvedValue(null) }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByLabelText("Amount")).toHaveFocus();
    expect(screen.getByPlaceholderText("kopi 2.20 yakun paynow")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fill" })).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toHaveValue("cat_food_drinks");
    expect(screen.getByLabelText("Payment")).toHaveValue("PayNow");
  });

  it("defaults to Food & Drinks and the most-used payment method", () => {
    const data = createDefaultProfileData();
    data.expenses = [
      {
        id: "exp_previous",
        amount: 18.4,
        currency: "SGD",
        baseAmount: 18.4,
        baseCurrency: "SGD",
        exchangeRate: 1,
        exchangeRateDate: "2026-07-09",
        exchangeRateSource: "base",
        date: "2026-07-09",
        categoryId: "cat_transport",
        title: "Grab",
        remark: null,
        paymentMethod: "Apple Pay",
        createdAt: "2026-07-09T10:00:00.000Z",
        updatedAt: "2026-07-09T10:00:00.000Z"
      },
      {
        id: "exp_previous_2",
        amount: 6.2,
        currency: "SGD",
        baseAmount: 6.2,
        baseCurrency: "SGD",
        exchangeRate: 1,
        exchangeRateDate: "2026-07-08",
        exchangeRateSource: "base",
        date: "2026-07-08",
        categoryId: "cat_food_drinks",
        title: "Lunch",
        remark: null,
        paymentMethod: "Apple Pay",
        createdAt: "2026-07-08T10:00:00.000Z",
        updatedAt: "2026-07-08T10:00:00.000Z"
      },
      {
        id: "exp_previous_3",
        amount: 3,
        currency: "SGD",
        baseAmount: 3,
        baseCurrency: "SGD",
        exchangeRate: 1,
        exchangeRateDate: "2026-07-07",
        exchangeRateSource: "base",
        date: "2026-07-07",
        categoryId: "cat_shopping",
        title: "Pen",
        remark: null,
        paymentMethod: "PayNow",
        createdAt: "2026-07-07T10:00:00.000Z",
        updatedAt: "2026-07-07T10:00:00.000Z"
      }
    ];
    render(
      <TodayScreen
        data={data}
        saveData={vi.fn().mockResolvedValue(undefined)}
        upsertExpense={vi.fn().mockResolvedValue(undefined)}
        deleteExpense={vi.fn().mockResolvedValue(undefined)}
        secrets={{ getSecret: vi.fn().mockResolvedValue(null) }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByLabelText("Amount")).toHaveValue("");
    expect(screen.getByLabelText("Category")).toHaveValue("cat_food_drinks");
    expect(screen.getByLabelText("Payment")).toHaveValue("Apple Pay");
    expect(screen.getByLabelText("Description")).toHaveValue("");
  });

  it("keeps a foreign amount while saving its SGD reporting equivalent", async () => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ date: "2026-07-10", base: "MYR", quote: "SGD", rate: 0.317 }) })
    );
    const upsertExpense = vi.fn().mockResolvedValue(undefined);
    render(
      <TodayScreen
        data={createDefaultProfileData()}
        saveData={vi.fn().mockResolvedValue(undefined)}
        upsertExpense={upsertExpense}
        deleteExpense={vi.fn().mockResolvedValue(undefined)}
        secrets={{ getSecret: vi.fn().mockResolvedValue(null) }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Spending currency"), { target: { value: "MYR" } });
    await screen.findByLabelText("In SGD");
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "18" } });
    expect(screen.getByLabelText("In SGD")).toHaveValue("5.71");
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Nasi lemak" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(upsertExpense).toHaveBeenCalledTimes(1));
    expect(upsertExpense.mock.calls[0][0]).toMatchObject({
      amount: 18,
      currency: "MYR",
      baseAmount: 5.71,
      baseCurrency: "SGD",
      exchangeRateSource: "ecb-reference"
    });
  });
});
