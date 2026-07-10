import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProfileData } from "../lib/defaults";
import { TodayScreen } from "./TodayScreen";

describe("TodayScreen entry flow", () => {
  it("opens in manual mode with amount focused and keeps natural entry optional", () => {
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
    expect(screen.queryByPlaceholderText("kopi 2.20 yakun paynow")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Natural entry" }));
    expect(screen.getByPlaceholderText("kopi 2.20 yakun paynow")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Manual entry" })).toBeInTheDocument();
  });
});
