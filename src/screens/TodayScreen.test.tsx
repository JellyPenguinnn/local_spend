import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProfileData } from "../lib/defaults";
import { TodayScreen } from "./TodayScreen";

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
  });

  it("reuses only the latest category and payment defaults", () => {
    const data = createDefaultProfileData();
    data.expenses = [
      {
        id: "exp_previous",
        amount: 18.4,
        currency: "SGD",
        date: "2026-07-09",
        categoryId: "cat_transport",
        title: "Grab",
        remark: null,
        paymentMethod: "Apple Pay",
        createdAt: "2026-07-09T10:00:00.000Z",
        updatedAt: "2026-07-09T10:00:00.000Z"
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
    expect(screen.getByLabelText("Category")).toHaveValue("cat_transport");
    expect(screen.getByLabelText("Payment")).toHaveValue("Apple Pay");
    expect(screen.getByLabelText("Description")).toHaveValue("");
  });
});
