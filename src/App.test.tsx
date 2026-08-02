import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createDefaultProfileData } from "./lib/defaults";

const repository = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  createProfile: vi.fn(),
  getProfileData: vi.fn(),
  getAiSecret: vi.fn()
}));

vi.mock("./lib/storage/repository", () => ({
  createRepository: () => repository
}));

vi.mock("./screens/TodayScreen", () => ({ TodayScreen: () => <div>Today is ready</div> }));
vi.mock("./screens/CalendarScreen", () => ({ CalendarScreen: () => null }));
vi.mock("./screens/SummaryScreen", () => ({ SummaryScreen: () => null }));
vi.mock("./screens/SettingsScreen", () => ({ SettingsScreen: () => null }));

describe("first use", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.listProfiles.mockResolvedValue({ activeProfileId: null, profiles: [] });
    repository.createProfile.mockResolvedValue({
      activeProfileId: "profile-local",
      profiles: [
        {
          id: "profile-local",
          displayName: "My spending",
          color: "#315fbd",
          createdAt: "2026-08-02T00:00:00.000Z",
          updatedAt: "2026-08-02T00:00:00.000Z"
        }
      ]
    });
    repository.getProfileData.mockResolvedValue(createDefaultProfileData());
    repository.getAiSecret.mockResolvedValue(null);
  });

  it("starts without presenting account or profile creation", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Track spending, simply." })).toBeInTheDocument();
    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
    expect(screen.getByText("No account or sign-in. Your spending stays on this device.")).toBeInTheDocument();
    expect(screen.getByText("Restore backup")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start tracking" }));

    await waitFor(() => expect(repository.createProfile).toHaveBeenCalledWith({ displayName: "My spending" }));
    expect(await screen.findByText("Today is ready")).toBeInTheDocument();
  });
});
