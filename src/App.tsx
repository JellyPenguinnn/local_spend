import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, ChartPie, ClipboardList, Loader2, Settings, Upload } from "lucide-react";
import { createRepository } from "./lib/storage/repository";
import type { Expense, ProfileData, ProfilesState, ViewKey } from "./lib/types";
import { createDefaultProfileData } from "./lib/defaults";
import { TodayScreen } from "./screens/TodayScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { SummaryScreen } from "./screens/SummaryScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { clampWallpaperOpacity, contentOpacityTokens } from "./lib/wallpaper";
import { MAX_BACKUP_FILE_BYTES, restoreBackup } from "./lib/backup";
import { resolveRecurringRuleNextDate } from "./lib/recurring";

const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: typeof ClipboardList }> = [
  { key: "today", label: "Today", icon: ClipboardList },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "summary", label: "Summary", icon: ChartPie },
  { key: "settings", label: "Settings", icon: Settings }
];

const repository = createRepository();

export default function App() {
  const [profilesState, setProfilesState] = useState<ProfilesState>({ activeProfileId: null, profiles: [] });
  const [data, setData] = useState<ProfileData | null>(null);
  const [view, setView] = useState<ViewKey>("today");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const activeProfile = useMemo(
    () => profilesState.profiles.find((profile) => profile.id === profilesState.activeProfileId) ?? null,
    [profilesState]
  );
  const secrets = useMemo(
    () => ({
      getSecret(provider: string) {
        if (!activeProfile) return Promise.resolve(null);
        return repository.getAiSecret(activeProfile.id, provider);
      }
    }),
    [activeProfile]
  );

  const applyProfilesState = useCallback(async (state: ProfilesState) => {
    setProfilesState(state);
    const activeId = state.activeProfileId;
    if (!activeId) {
      setData(null);
      return;
    }
    const profileData = await repository.getProfileData(activeId);
    setData(profileData);
  }, []);

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    try {
      const state = await repository.listProfiles();
      await applyProfilesState(state);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load LocalSpend.");
    } finally {
      setIsLoading(false);
    }
  }, [applyProfilesState]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const settings = data?.appSettings;
    const activeWallpaper = settings?.wallpapers.find((wallpaper) => wallpaper.id === settings.activeWallpaperId);
    const theme = settings?.theme ?? "light";
    const accentColor = settings?.accentColor ?? "#315fbd";
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.wallpaper = activeWallpaper ? "on" : "off";
    document.documentElement.style.setProperty("--user-accent", accentColor);
    document.documentElement.style.setProperty("--wallpaper-image", activeWallpaper ? `url("${activeWallpaper.dataUrl}")` : "none");
    document.documentElement.style.setProperty("--wallpaper-opacity", activeWallpaper ? String(clampWallpaperOpacity(settings?.wallpaperOpacity)) : "0");
    const contentOpacity = contentOpacityTokens(settings?.contentOpacity);
    document.documentElement.style.setProperty("--content-opacity-soft", contentOpacity.soft);
    document.documentElement.style.setProperty("--content-opacity", contentOpacity.base);
    document.documentElement.style.setProperty("--content-opacity-strong", contentOpacity.strong);

    const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    themeColorMeta?.setAttribute("content", activeWallpaper ? accentColor : theme === "dark" ? "#171917" : "#fafaf7");
  }, [data?.appSettings]);

  async function saveData(nextData: ProfileData): Promise<boolean> {
    if (!profilesState.activeProfileId) return false;
    setError("");
    try {
      const saved = await repository.saveProfileData(profilesState.activeProfileId, nextData);
      setData(saved);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save changes.");
      return false;
    }
  }

  async function upsertExpense(expense: Expense): Promise<boolean> {
    if (!data) return false;
    const exists = data.expenses.some((item) => item.id === expense.id);
    return saveData({
      ...data,
      expenses: exists ? data.expenses.map((item) => (item.id === expense.id ? expense : item)) : [...data.expenses, expense]
    });
  }

  async function deleteExpense(expenseId: string): Promise<boolean> {
    if (!data) return false;
    const expenses = data.expenses.filter((expense) => expense.id !== expenseId);
    return saveData({
      ...data,
      expenses,
      recurringRules: data.recurringRules.map((rule) => resolveRecurringRuleNextDate(rule, expenses))
    });
  }

  async function createFirstProfile() {
    setIsLoading(true);
    setError("");
    try {
      const state = await repository.createProfile({ displayName: "My spending" });
      await applyProfilesState(state);
      setView("today");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not start LocalSpend.");
    } finally {
      setIsLoading(false);
    }
  }

  async function restoreFirstProfile(file: File): Promise<string | null> {
    if (file.size > MAX_BACKUP_FILE_BYTES) return "Choose a LocalSpend backup under 12 MB.";
    const restored = restoreBackup(await file.text());
    if (!restored.data) return restored.error ?? "Could not restore that backup.";
    let createdProfileId: string | null = null;
    try {
      const state = await repository.createProfile({ displayName: restored.profileName?.trim() || "My spending" });
      if (!state.activeProfileId) return "Could not create a local profile for this backup.";
      createdProfileId = state.activeProfileId;
      await repository.saveProfileData(state.activeProfileId, restored.data);
      await applyProfilesState(state);
      setView("today");
      return null;
    } catch (restoreError) {
      if (createdProfileId) {
        await repository.deleteProfile(createdProfileId).catch(() => undefined);
      }
      return restoreError instanceof Error ? restoreError.message : "Could not restore that backup.";
    }
  }

  if (isLoading) {
    return (
      <main className="loading-shell">
        <Loader2 className="spin" size={28} />
        <span>Opening LocalSpend…</span>
      </main>
    );
  }

  if (!activeProfile || !data) {
    return <FirstLaunch error={error} onCreate={() => void createFirstProfile()} onRestore={restoreFirstProfile} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <img src={`${import.meta.env.BASE_URL}localspend-icon.svg`} alt="" />
          </span>
          <div>
            <strong>LocalSpend</strong>
            <small>Private spending, kept on this device</small>
          </div>
        </div>
        <nav className="nav-list" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={view === item.key ? "active" : ""} type="button" onClick={() => setView(item.key)}>
                <Icon size={17} />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <main className="main-shell">
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        )}

        <div className="view-stage" key={view}>
          {view === "today" && <TodayScreen profileId={activeProfile.id} data={data} saveData={saveData} upsertExpense={upsertExpense} deleteExpense={deleteExpense} secrets={secrets} />}
          {view === "calendar" && <CalendarScreen profileId={activeProfile.id} data={data} upsertExpense={upsertExpense} deleteExpense={deleteExpense} secrets={secrets} />}
          {view === "summary" && <SummaryScreen data={data} saveData={saveData} />}
          {view === "settings" && (
            <SettingsScreen
              activeProfile={activeProfile}
              data={data ?? createDefaultProfileData()}
              repository={repository}
              saveData={saveData}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function FirstLaunch({ error, onCreate, onRestore }: { error: string; onCreate: () => void; onRestore: (file: File) => Promise<string | null> }) {
  const [restoreError, setRestoreError] = useState("");
  return (
    <main className="first-launch">
      <section className="first-card">
        <div className="first-launch-mark" aria-hidden="true">
          <img src={`${import.meta.env.BASE_URL}localspend-icon.svg`} alt="" />
        </div>
        <p className="first-launch-name">LocalSpend</p>
        <h1>Track spending, simply.</h1>
        <p className="first-launch-intro">No account or sign-in. Your spending stays on this device.</p>
        <div className="first-launch-actions">
          <button className="primary-button first-start-button" type="button" onClick={onCreate}>
            <span>Start tracking</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <label className="file-button first-restore-button">
            <Upload size={18} aria-hidden="true" />
            <span>Restore backup</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                void onRestore(file).then((message) => setRestoreError(message ?? ""));
              }}
            />
          </label>
        </div>
        {(error || restoreError) && <p className="form-note danger" role="alert">{restoreError || error}</p>}
      </section>
    </main>
  );
}
