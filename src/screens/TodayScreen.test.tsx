import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultProfileData } from "../lib/defaults";
import { formatLocalIsoDate } from "../lib/date";
import { TodayScreen } from "./TodayScreen";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("TodayScreen entry flow", () => {
  it("focuses amount while keeping natural entry visible as an alternative", () => {
    render(
      <TodayScreen
        profileId="profile_test"
        data={createDefaultProfileData()}
        saveData={vi.fn().mockResolvedValue(true)}
        upsertExpense={vi.fn().mockResolvedValue(true)}
        deleteExpense={vi.fn().mockResolvedValue(true)}
        secrets={{ getSecret: vi.fn().mockResolvedValue(null) }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByLabelText("Amount")).toHaveFocus();
    expect(screen.getByRole("group", { name: "Amount and currency" })).toContainElement(screen.getByLabelText("Spending currency"));
    expect(screen.getByRole("group", { name: "Amount and currency" })).toContainElement(screen.getByLabelText("Amount"));
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByLabelText("Or enter naturally")).toHaveAttribute("placeholder", "kopi 2.20 yakun paynow");
    expect(screen.getByRole("button", { name: "Fill" })).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toHaveValue("cat_food_drinks");
    expect(screen.getByLabelText("Payment")).toHaveValue("PayNow");
    expect(screen.getByRole("button", { name: "Add remark" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Remark")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add remark" }));
    expect(screen.getByLabelText("Remark")).toBeInTheDocument();
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
        profileId="profile_test"
        data={data}
        saveData={vi.fn().mockResolvedValue(true)}
        upsertExpense={vi.fn().mockResolvedValue(true)}
        deleteExpense={vi.fn().mockResolvedValue(true)}
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
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ date: "2026-07-10", base: "MYR", quote: "SGD", rate: 0.317 }) });
    vi.stubGlobal(
      "fetch",
      fetchMock
    );
    const upsertExpense = vi.fn().mockResolvedValue(true);
    render(
      <TodayScreen
        profileId="profile_test"
        data={createDefaultProfileData()}
        saveData={vi.fn().mockResolvedValue(true)}
        upsertExpense={upsertExpense}
        deleteExpense={vi.fn().mockResolvedValue(true)}
        secrets={{ getSecret: vi.fn().mockResolvedValue(null) }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Spending currency"), { target: { value: "MYR" } });
    const convertedAmount = await screen.findByLabelText("In SGD");
    expect(await screen.findByText(/Latest reference, 10 Jul/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Refresh reference rate" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "18" } });
    expect(convertedAmount.tagName).toBe("OUTPUT");
    expect(convertedAmount).toHaveTextContent("SGD 5.71");
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

  it("asks for a manual reporting amount only when no reference rate is available", async () => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const upsertExpense = vi.fn().mockResolvedValue(true);
    render(
      <TodayScreen
        profileId="profile_test"
        data={createDefaultProfileData()}
        saveData={vi.fn().mockResolvedValue(true)}
        upsertExpense={upsertExpense}
        deleteExpense={vi.fn().mockResolvedValue(true)}
        secrets={{ getSecret: vi.fn().mockResolvedValue(null) }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Spending currency"), { target: { value: "MYR" } });
    expect(await screen.findByText("Reference unavailable. Enter the converted amount.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "18" } });
    const manualAmount = screen.getByLabelText("In SGD");
    expect(manualAmount.tagName).toBe("INPUT");
    fireEvent.change(manualAmount, { target: { value: "5.80" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Nasi lemak" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(upsertExpense).toHaveBeenCalledTimes(1));
    expect(upsertExpense.mock.calls[0][0]).toMatchObject({
      amount: 18,
      currency: "MYR",
      baseAmount: 5.8,
      baseCurrency: "SGD",
      exchangeRateSource: "manual"
    });
  });

  it("records a foreign-currency bill with a dated SGD snapshot", async () => {
    localStorage.clear();
    const today = formatLocalIsoDate();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ date: today, base: "MYR", quote: "SGD", rate: 0.317 }) });
    vi.stubGlobal("fetch", fetchMock);
    const data = createDefaultProfileData();
    data.recurringRules = [
      {
        id: "rule_myr",
        title: "Mobile plan",
        amount: 50,
        currency: "MYR",
        categoryId: "cat_bills",
        remark: null,
        paymentMethod: "Credit Card",
        cadence: "monthly",
        dayOfMonth: Number(today.slice(8, 10)),
        startDate: today,
        nextDate: today,
        discardedDates: [],
        isActive: true,
        createdAt: `${today}T00:00:00.000Z`,
        updatedAt: `${today}T00:00:00.000Z`
      }
    ];
    const saveData = vi.fn().mockResolvedValue(true);

    render(
      <TodayScreen
        profileId="profile_test"
        data={data}
        saveData={saveData}
        upsertExpense={vi.fn().mockResolvedValue(true)}
        deleteExpense={vi.fn().mockResolvedValue(true)}
        secrets={{ getSecret: vi.fn().mockResolvedValue(null) }}
      />
    );

    expect(await screen.findByText("≈ SGD 15.85")).toBeInTheDocument();
    expect(screen.getByText(/Dated rate/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(saveData).toHaveBeenCalledTimes(1));
    expect(saveData.mock.calls[0][0].expenses[0]).toMatchObject({
      amount: 50,
      currency: "MYR",
      baseAmount: 15.85,
      baseCurrency: "SGD",
      exchangeRateSource: "ecb-reference"
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(`date=${today}`);
  });

  it("keeps the form and values when persistence fails", async () => {
    render(
      <TodayScreen
        profileId="profile_failure"
        data={createDefaultProfileData()}
        saveData={vi.fn().mockResolvedValue(false)}
        upsertExpense={vi.fn().mockResolvedValue(false)}
        deleteExpense={vi.fn().mockResolvedValue(false)}
        secrets={{ getSecret: vi.fn().mockResolvedValue(null) }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "8.40" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Lunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your entry is still here");
    expect(screen.getByLabelText("Amount")).toHaveValue("8.40");
    expect(screen.getByLabelText("Description")).toHaveValue("Lunch");
  });

  it("restores an unfinished draft after leaving and returning", () => {
    const props = {
      profileId: "profile_draft",
      data: createDefaultProfileData(),
      saveData: vi.fn().mockResolvedValue(true),
      upsertExpense: vi.fn().mockResolvedValue(true),
      deleteExpense: vi.fn().mockResolvedValue(true),
      secrets: { getSecret: vi.fn().mockResolvedValue(null) }
    };
    const first = render(<TodayScreen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "4.60" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Kopi" } });
    first.unmount();

    render(<TodayScreen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByLabelText("Amount")).toHaveValue("4.60");
    expect(screen.getByLabelText("Description")).toHaveValue("Kopi");
  });

  it("surfaces a previous merchant match inside the focused form", () => {
    const data = createDefaultProfileData();
    data.expenses = [
      {
        id: "exp_grab_history",
        amount: 12,
        currency: "SGD",
        baseAmount: 12,
        baseCurrency: "SGD",
        exchangeRate: 1,
        exchangeRateDate: "2026-07-10",
        exchangeRateSource: "base",
        date: "2026-07-10",
        categoryId: "cat_transport",
        title: "Grab",
        remark: null,
        paymentMethod: "PayNow",
        createdAt: "2026-07-10T10:00:00.000Z",
        updatedAt: "2026-07-10T10:00:00.000Z"
      }
    ];
    render(
      <TodayScreen
        profileId="profile_memory"
        data={data}
        saveData={vi.fn().mockResolvedValue(true)}
        upsertExpense={vi.fn().mockResolvedValue(true)}
        deleteExpense={vi.fn().mockResolvedValue(true)}
        secrets={{ getSecret: vi.fn().mockResolvedValue(null) }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Grab" } });
    expect(screen.getByRole("button", { name: "Matched previous entry Transport · PayNow" })).toBeInTheDocument();
  });

  it("makes an exact duplicate deliberate without blocking legitimate repeats", () => {
    const data = createDefaultProfileData();
    const today = formatLocalIsoDate();
    data.expenses = [
      {
        id: "exp_same",
        amount: 2.2,
        currency: "SGD",
        baseAmount: 2.2,
        baseCurrency: "SGD",
        exchangeRate: 1,
        exchangeRateDate: today,
        exchangeRateSource: "base",
        date: today,
        categoryId: "cat_food_drinks",
        title: "Yakun",
        remark: null,
        paymentMethod: "PayNow",
        createdAt: `${today}T08:00:00.000Z`,
        updatedAt: `${today}T08:00:00.000Z`
      }
    ];
    render(
      <TodayScreen
        profileId="profile_duplicate"
        data={data}
        saveData={vi.fn().mockResolvedValue(true)}
        upsertExpense={vi.fn().mockResolvedValue(true)}
        deleteExpense={vi.fn().mockResolvedValue(true)}
        secrets={{ getSecret: vi.fn().mockResolvedValue(null) }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "2.20" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Yakun" } });

    expect(screen.getByText("The same amount and description are already recorded for this date.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save anyway" })).toBeInTheDocument();
  });
});
