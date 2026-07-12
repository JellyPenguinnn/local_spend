import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBackup } from "../lib/backup";
import { exportExpensesCsv } from "../lib/csv";
import { createDefaultProfileData } from "../lib/defaults";
import type { LocalSpendRepository } from "../lib/storage/repository";
import type { Expense, ProfileData, ProfileMeta } from "../lib/types";
import { SettingsScreen } from "./SettingsScreen";

const profile: ProfileMeta = {
  id: "profile_test",
  displayName: "Brian",
  color: "#4466d4",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z"
};

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:localspend") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Settings data controls", () => {
  it("creates a complete backup and records its date", async () => {
    const data = createDefaultProfileData();
    data.expenses = [makeExpense(data.categories[0].id, "2026-07-11", 6.5, "Lunch")];
    const repository = createRepositoryMock();
    const saveData = vi.fn().mockResolvedValue(true);
    renderDataSettings(data, repository, saveData);

    expect(screen.getByText("All data")).toBeInTheDocument();
    expect(screen.getByText("Expenses only")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Backup all" }));

    await waitFor(() => expect(repository.saveProfileFile).toHaveBeenCalledTimes(1));
    expect(repository.saveProfileFile).toHaveBeenCalledWith(
      profile.id,
      "backup",
      expect.stringMatching(/-backup\.json$/),
      expect.stringContaining('"app":"LocalSpend"')
    );
    await waitFor(() => expect(saveData).toHaveBeenCalledTimes(1));
    expect(saveData.mock.calls[0][0].appSettings.lastBackupAt).toEqual(expect.any(String));
  });

  it("previews restore contents and backs up current data before replacing it", async () => {
    const current = createDefaultProfileData();
    current.expenses = [makeExpense(current.categories[0].id, "2026-07-11", 6.5, "Current")];
    const restored = createDefaultProfileData();
    restored.expenses = [
      makeExpense(restored.categories[0].id, "2026-07-01", 5, "One"),
      makeExpense(restored.categories[1].id, "2026-07-02", 8, "Two")
    ];
    const repository = createRepositoryMock();
    const saveData = vi.fn().mockResolvedValue(true);
    renderDataSettings(current, repository, saveData);

    const json = createBackup(profile, restored, "2026-07-11T12:00:00.000Z");
    fireEvent.change(screen.getByLabelText("Restore all"), { target: { files: [textFile("backup.json", json, "application/json")] } });

    expect(await screen.findByText("Restore all data?")).toBeInTheDocument();
    expect(screen.getByText("2 entries · 0 bills · 14 categories")).toBeInTheDocument();
    expect(screen.getByText("Current data is backed up first, then replaced.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Backup & restore" }));

    await waitFor(() => expect(repository.saveProfileFile).toHaveBeenCalledWith(
      profile.id,
      "backup",
      expect.stringMatching(/-before-restore\.json$/),
      expect.any(String)
    ));
    await waitFor(() => expect(saveData).toHaveBeenCalledTimes(1));
    expect(saveData.mock.calls[0][0].expenses).toHaveLength(2);
  });

  it("clears an old restore preview when a newly chosen file is invalid", async () => {
    const data = createDefaultProfileData();
    const repository = createRepositoryMock();
    const saveData = vi.fn().mockResolvedValue(true);
    renderDataSettings(data, repository, saveData);

    const restoreInput = screen.getByLabelText("Restore all");
    fireEvent.change(restoreInput, {
      target: { files: [textFile("backup.json", createBackup(profile, data, "2026-07-11T12:00:00.000Z"), "application/json")] }
    });
    expect(await screen.findByText("Restore all data?")).toBeInTheDocument();

    fireEvent.change(restoreInput, { target: { files: [textFile("wrong.json", '{"app":"Other"}', "application/json")] } });
    expect(await screen.findByText("This does not look like a LocalSpend backup.")).toBeInTheDocument();
    expect(screen.queryByText("Restore all data?")).not.toBeInTheDocument();
  });

  it("backs up before reset and keeps categories and appearance", async () => {
    const data = createDefaultProfileData();
    data.expenses = [makeExpense(data.categories[0].id, "2026-07-11", 6.5, "Lunch")];
    data.budgets = [{ id: "budget_1", month: "2026-07", categoryId: null, amount: 500 }];
    const repository = createRepositoryMock();
    const saveData = vi.fn().mockResolvedValue(true);
    renderDataSettings(data, repository, saveData);

    fireEvent.click(screen.getByRole("button", { name: "Reset spending" }));
    expect(screen.getByText("1 entry · 0 bills · 1 budget")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Backup & reset" }));

    await waitFor(() => expect(repository.saveProfileFile).toHaveBeenCalledWith(
      profile.id,
      "backup",
      expect.stringMatching(/-before-reset\.json$/),
      expect.any(String)
    ));
    await waitFor(() => expect(saveData).toHaveBeenCalledTimes(1));
    const resetData = saveData.mock.calls[0][0];
    expect(resetData.expenses).toHaveLength(0);
    expect(resetData.budgets).toHaveLength(0);
    expect(resetData.categories).toEqual(data.categories);
    expect(resetData.appSettings.accentColor).toBe(data.appSettings.accentColor);
  });

  it("does not reset anything when the safety backup fails", async () => {
    const data = createDefaultProfileData();
    data.expenses = [makeExpense(data.categories[0].id, "2026-07-11", 6.5, "Lunch")];
    const repository = createRepositoryMock();
    vi.mocked(repository.saveProfileFile).mockRejectedValue(new Error("Backup could not be saved."));
    const saveData = vi.fn().mockResolvedValue(true);
    renderDataSettings(data, repository, saveData);

    fireEvent.click(screen.getByRole("button", { name: "Reset spending" }));
    fireEvent.click(screen.getByRole("button", { name: "Backup & reset" }));

    expect(await screen.findByText("Backup could not be saved.")).toBeInTheDocument();
    expect(saveData).not.toHaveBeenCalled();
  });

  it("imports only new CSV rows and enables their currency and payment method", async () => {
    const data = createDefaultProfileData();
    const existing = makeExpense(data.categories[0].id, "2026-07-10", 6.5, "Lunch");
    const foreign: Expense = {
      ...makeExpense(data.categories[1].id, "2026-07-11", 18, "Grab"),
      currency: "MYR",
      baseAmount: 5.71,
      baseCurrency: "SGD",
      exchangeRate: 5.71 / 18,
      exchangeRateDate: "2026-07-11",
      exchangeRateSource: "manual",
      paymentMethod: "Touch n Go"
    };
    data.expenses = [existing];
    data.appSettings.enabledCurrencies = ["SGD"];
    const repository = createRepositoryMock();
    const saveData = vi.fn().mockResolvedValue(true);
    renderDataSettings(data, repository, saveData);

    const csv = exportExpensesCsv([existing, foreign, foreign], data.categories);
    fireEvent.change(screen.getByLabelText("Import CSV"), { target: { files: [textFile("expenses.csv", csv, "text/csv")] } });

    expect(await screen.findByText("Import 1 entry?")).toBeInTheDocument();
    expect(screen.getByText("2 rows skipped as duplicate or invalid.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(saveData).toHaveBeenCalledTimes(1));
    const importedData = saveData.mock.calls[0][0];
    expect(importedData.expenses).toHaveLength(2);
    expect(importedData.appSettings.enabledCurrencies).toContain("MYR");
    expect(importedData.appSettings.paymentMethods).toContain("Touch n Go");
  });
});

describe("Settings organization", () => {
  it("groups categories and payment methods in one compact Spending section", () => {
    const data = createDefaultProfileData();
    render(<SettingsScreen activeProfile={profile} data={data} repository={createRepositoryMock()} saveData={vi.fn().mockResolvedValue(true)} />);

    expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recurring" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Spending" }));

    expect(screen.getByText("Categories")).toBeInTheDocument();
    expect(screen.getByText("Payment methods")).toBeInTheDocument();
    expect(screen.getByLabelText("Saved categories")).toBeInTheDocument();
    expect(screen.getByLabelText("Saved payment methods")).toBeInTheDocument();
  });

  it("keeps the visual guide optional beside the data controls", () => {
    const data = createDefaultProfileData();
    render(<SettingsScreen activeProfile={profile} data={data} repository={createRepositoryMock()} saveData={vi.fn().mockResolvedValue(true)} />);

    fireEvent.click(screen.getByRole("button", { name: "General" }));
    expect(screen.getByText("Data")).toBeInTheDocument();
    const guide = screen.getByRole("button", { name: /Quick guide/ });
    expect(guide).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(guide);

    expect(guide).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Record")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Understand")).toBeInTheDocument();
    expect(screen.getByText("Your data")).toBeInTheDocument();
  });

  it("keeps recurring setup focused on the original amount and currency", () => {
    const data = createDefaultProfileData();
    data.appSettings.enabledCurrencies = ["SGD", "MYR"];
    render(<SettingsScreen activeProfile={profile} data={data} repository={createRepositoryMock()} saveData={vi.fn().mockResolvedValue(true)} />);

    fireEvent.click(screen.getByRole("button", { name: "Recurring" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Bill currency"), { target: { value: "MYR" } });
    fireEvent.change(screen.getByLabelText("Bill amount"), { target: { value: "10" } });

    expect(screen.getByLabelText("Bill currency")).toHaveValue("MYR");
    expect(screen.getByLabelText("Bill amount")).toHaveValue("10");
    expect(screen.queryByLabelText("In SGD")).not.toBeInTheDocument();
  });
});

function renderDataSettings(data: ProfileData, repository: LocalSpendRepository, saveData: (data: ProfileData) => Promise<boolean>) {
  render(<SettingsScreen activeProfile={profile} data={data} repository={repository} saveData={saveData} />);
  fireEvent.click(screen.getByRole("button", { name: "General" }));
}

function textFile(name: string, contents: string, type: string): File {
  const file = new File([contents], name, { type });
  Object.defineProperty(file, "text", { value: async () => contents });
  return file;
}

function createRepositoryMock(): LocalSpendRepository {
  return {
    listProfiles: vi.fn(),
    createProfile: vi.fn(),
    switchProfile: vi.fn(),
    renameProfile: vi.fn(),
    deleteProfile: vi.fn(),
    getProfileData: vi.fn(),
    saveProfileData: vi.fn(),
    resetProfileData: vi.fn(),
    saveProfileFile: vi.fn().mockResolvedValue("saved"),
    setAiSecret: vi.fn(),
    getAiSecret: vi.fn(),
    clearAiSecret: vi.fn(),
    hasAiSecret: vi.fn(),
    dataRootPath: vi.fn()
  };
}

function makeExpense(categoryId: string, date: string, amount: number, title: string): Expense {
  return {
    id: `exp_${title}_${date}`,
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
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`
  };
}
