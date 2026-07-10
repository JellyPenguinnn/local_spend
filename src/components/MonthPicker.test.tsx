import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonthPicker } from "./MonthPicker";

describe("MonthPicker", () => {
  it("renders its selector in the document layer and chooses a month-year pair", () => {
    const onChange = vi.fn();
    render(<MonthPicker month="2026-07" onChange={onChange} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Choose month" }));

    const dialog = screen.getByRole("dialog", { name: "Choose month and year" });
    expect(dialog.parentElement).toBe(document.body.lastElementChild);

    fireEvent.click(screen.getByRole("button", { name: "2028" }));
    fireEvent.click(screen.getByRole("button", { name: "Dec" }));

    expect(onChange).toHaveBeenCalledWith("2028-12");
    expect(screen.queryByRole("dialog", { name: "Choose month and year" })).not.toBeInTheDocument();
  });

  it("closes with Escape", () => {
    render(<MonthPicker month="2026-07" onChange={vi.fn()} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Choose month" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Choose month and year" })).not.toBeInTheDocument();
  });
});
