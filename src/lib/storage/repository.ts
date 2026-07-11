import { createDefaultProfileData, createId, normalizeAccentPalette, normalizeRecurringRules, nowIso } from "../defaults";
import { normalizeCurrencyCode, normalizeEnabledCurrencies, normalizeExpenses } from "../currencies";
import type { ProfileData, ProfileMeta, ProfilesState, ThemeKey } from "../types";
import { clampWallpaperOpacity, trimWallpapers } from "../wallpaper";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export interface LocalSpendRepository {
  listProfiles(): Promise<ProfilesState>;
  createProfile(input: { displayName: string; color?: string }): Promise<ProfilesState>;
  switchProfile(profileId: string): Promise<ProfilesState>;
  renameProfile(profileId: string, displayName: string, color?: string): Promise<ProfilesState>;
  deleteProfile(profileId: string): Promise<ProfilesState>;
  getProfileData(profileId: string): Promise<ProfileData>;
  saveProfileData(profileId: string, data: ProfileData): Promise<ProfileData>;
  resetProfileData(profileId: string): Promise<ProfileData>;
  saveProfileFile(profileId: string, kind: "backup" | "export", fileName: string, contents: string): Promise<string>;
  setAiSecret(profileId: string, provider: string, secret: string): Promise<boolean>;
  getAiSecret(profileId: string, provider: string): Promise<string | null>;
  clearAiSecret(profileId: string, provider: string): Promise<boolean>;
  hasAiSecret(profileId: string, provider: string): Promise<boolean>;
  dataRootPath(): Promise<string>;
}

export function createRepository(): LocalSpendRepository {
  if (isTauriRuntime()) {
    return new TauriRepository();
  }
  return new BrowserRepository();
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

class TauriRepository implements LocalSpendRepository {
  listProfiles(): Promise<ProfilesState> {
    return invokeCommand("list_profiles");
  }

  createProfile(input: { displayName: string; color?: string }): Promise<ProfilesState> {
    return invokeCommand("create_profile", { input });
  }

  switchProfile(profileId: string): Promise<ProfilesState> {
    return invokeCommand("switch_profile", { profileId });
  }

  renameProfile(profileId: string, displayName: string, color?: string): Promise<ProfilesState> {
    return invokeCommand("rename_profile", { profileId, displayName, color });
  }

  deleteProfile(profileId: string): Promise<ProfilesState> {
    return invokeCommand("delete_profile", { profileId });
  }

  getProfileData(profileId: string): Promise<ProfileData> {
    return invokeCommand("get_profile_data", { profileId });
  }

  saveProfileData(profileId: string, data: ProfileData): Promise<ProfileData> {
    return invokeCommand("save_profile_data", { profileId, data });
  }

  resetProfileData(profileId: string): Promise<ProfileData> {
    return invokeCommand("reset_profile_data", { profileId });
  }

  saveProfileFile(profileId: string, kind: "backup" | "export", fileName: string, contents: string): Promise<string> {
    return invokeCommand("save_profile_file", { profileId, kind, fileName, contents });
  }

  setAiSecret(profileId: string, provider: string, secret: string): Promise<boolean> {
    return invokeCommand("set_ai_secret", { profileId, provider, secret });
  }

  getAiSecret(profileId: string, provider: string): Promise<string | null> {
    return invokeCommand("get_ai_secret", { profileId, provider });
  }

  clearAiSecret(profileId: string, provider: string): Promise<boolean> {
    return invokeCommand("clear_ai_secret", { profileId, provider });
  }

  hasAiSecret(profileId: string, provider: string): Promise<boolean> {
    return invokeCommand("has_ai_secret", { profileId, provider });
  }

  dataRootPath(): Promise<string> {
    return invokeCommand("data_root_path");
  }
}

class BrowserRepository implements LocalSpendRepository {
  async listProfiles(): Promise<ProfilesState> {
    return this.readProfiles();
  }

  async createProfile(input: { displayName: string; color?: string }): Promise<ProfilesState> {
    const state = this.readProfiles();
    const now = nowIso();
    const profile: ProfileMeta = {
      id: createId("profile"),
      displayName: input.displayName.trim(),
      color: input.color || nextProfileColor(state.profiles.length),
      createdAt: now,
      updatedAt: now
    };
    const next = {
      activeProfileId: profile.id,
      profiles: [...state.profiles, profile]
    };
    await this.writeProfileData(profile.id, createDefaultProfileData());
    await requestPersistentBrowserStorage();
    this.writeProfiles(next);
    return next;
  }

  async switchProfile(profileId: string): Promise<ProfilesState> {
    const state = this.readProfiles();
    if (!state.profiles.some((profile) => profile.id === profileId)) {
      throw new Error("Profile not found.");
    }
    const next = { ...state, activeProfileId: profileId };
    this.writeProfiles(next);
    return next;
  }

  async renameProfile(profileId: string, displayName: string, color?: string): Promise<ProfilesState> {
    const state = this.readProfiles();
    const next = {
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === profileId
          ? {
              ...profile,
              displayName: displayName.trim(),
              color: color || profile.color,
              updatedAt: nowIso()
            }
          : profile
      )
    };
    this.writeProfiles(next);
    return next;
  }

  async deleteProfile(profileId: string): Promise<ProfilesState> {
    const state = this.readProfiles();
    const profiles = state.profiles.filter((profile) => profile.id !== profileId);
    const next = {
      profiles,
      activeProfileId: state.activeProfileId === profileId ? profiles[0]?.id ?? null : state.activeProfileId
    };
    await deleteBrowserProfileData(profileId);
    localStorage.removeItem(dataKey(profileId));
    this.writeProfiles(next);
    return next;
  }

  async getProfileData(profileId: string): Promise<ProfileData> {
    return this.readProfileData(profileId);
  }

  async saveProfileData(profileId: string, data: ProfileData): Promise<ProfileData> {
    await this.writeProfileData(profileId, data);
    await requestPersistentBrowserStorage();
    return data;
  }

  async resetProfileData(profileId: string): Promise<ProfileData> {
    const data = createDefaultProfileData();
    await this.writeProfileData(profileId, data);
    return data;
  }

  async saveProfileFile(_profileId: string, _kind: "backup" | "export", fileName: string, _contents: string): Promise<string> {
    // The browser download is the backup. Keeping another full copy in web storage
    // wastes quota and can prevent later expense saves.
    return `browser-download:${fileName}`;
  }

  async setAiSecret(profileId: string, provider: string, secret: string): Promise<boolean> {
    localStorage.setItem(secretKey(profileId, provider), secret);
    return true;
  }

  async getAiSecret(profileId: string, provider: string): Promise<string | null> {
    return localStorage.getItem(secretKey(profileId, provider));
  }

  async clearAiSecret(profileId: string, provider: string): Promise<boolean> {
    localStorage.removeItem(secretKey(profileId, provider));
    return true;
  }

  async hasAiSecret(profileId: string, provider: string): Promise<boolean> {
    return localStorage.getItem(secretKey(profileId, provider)) !== null;
  }

  async dataRootPath(): Promise<string> {
    return supportsIndexedDb() ? "browser IndexedDB" : "browser localStorage fallback";
  }

  private readProfiles(): ProfilesState {
    const raw = localStorage.getItem("localspend.profiles");
    if (!raw) {
      return { activeProfileId: null, profiles: [] };
    }
    try {
      const parsed = JSON.parse(raw) as ProfilesState;
      return {
        activeProfileId: parsed.activeProfileId ?? null,
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : []
      };
    } catch {
      return { activeProfileId: null, profiles: [] };
    }
  }

  private writeProfiles(state: ProfilesState): void {
    localStorage.setItem("localspend.profiles", JSON.stringify(state));
  }

  private async readProfileData(profileId: string): Promise<ProfileData> {
    if (supportsIndexedDb()) {
      const stored = await readBrowserProfileData(profileId);
      if (stored) {
        return normalizeProfileData(stored);
      }
    }

    const raw = localStorage.getItem(dataKey(profileId));
    if (!raw) {
      const data = createDefaultProfileData();
      await this.writeProfileData(profileId, data);
      return data;
    }
    try {
      const data = normalizeProfileData(JSON.parse(raw) as Partial<ProfileData>);
      await this.writeProfileData(profileId, data);
      if (supportsIndexedDb()) {
        localStorage.removeItem(dataKey(profileId));
      }
      return data;
    } catch {
      throw new Error("Stored LocalSpend data could not be read. Restore a backup before adding new spending.");
    }
  }

  private async writeProfileData(profileId: string, data: ProfileData): Promise<void> {
    if (supportsIndexedDb()) {
      await writeBrowserProfileData(profileId, data);
      return;
    }
    localStorage.setItem(dataKey(profileId), JSON.stringify(data));
  }
}

const BROWSER_DB_NAME = "localspend";
const BROWSER_DB_VERSION = 1;
const BROWSER_PROFILE_STORE = "profileData";
let browserDbPromise: Promise<IDBDatabase> | null = null;
let browserPersistenceRequested = false;

function supportsIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

async function requestPersistentBrowserStorage(): Promise<void> {
  if (browserPersistenceRequested || typeof navigator === "undefined" || !navigator.storage?.persist) return;
  browserPersistenceRequested = true;
  try {
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return;
    await navigator.storage.persist();
  } catch {
    // Persistence is best-effort; explicit backups remain the recovery path.
  }
}

function openBrowserDatabase(): Promise<IDBDatabase> {
  if (browserDbPromise) return browserDbPromise;
  browserDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(BROWSER_DB_NAME, BROWSER_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BROWSER_PROFILE_STORE)) {
        request.result.createObjectStore(BROWSER_PROFILE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser storage."));
    request.onblocked = () => reject(new Error("Browser storage is busy in another LocalSpend window."));
  });
  return browserDbPromise;
}

async function readBrowserProfileData(profileId: string): Promise<Partial<ProfileData> | null> {
  const database = await openBrowserDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(BROWSER_PROFILE_STORE, "readonly").objectStore(BROWSER_PROFILE_STORE).get(profileId);
    request.onsuccess = () => resolve((request.result as Partial<ProfileData> | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read browser data."));
  });
}

async function writeBrowserProfileData(profileId: string, data: ProfileData): Promise<void> {
  const database = await openBrowserDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BROWSER_PROFILE_STORE, "readwrite");
    transaction.objectStore(BROWSER_PROFILE_STORE).put(data, profileId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save browser data."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage stopped the save."));
  });
}

async function deleteBrowserProfileData(profileId: string): Promise<void> {
  if (!supportsIndexedDb()) return;
  const database = await openBrowserDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BROWSER_PROFILE_STORE, "readwrite");
    transaction.objectStore(BROWSER_PROFILE_STORE).delete(profileId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove browser data."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage stopped the delete."));
  });
}

function normalizeProfileData(data: Partial<ProfileData>): ProfileData {
  const fallback = createDefaultProfileData();
  const currency = normalizeCurrencyCode(data.appSettings?.currency, fallback.appSettings.currency);
  const theme = normalizeTheme(data.appSettings?.theme);
  const wallpapers = trimWallpapers(Array.isArray(data.appSettings?.wallpapers) ? data.appSettings.wallpapers : []);
  const activeWallpaperId =
    data.appSettings?.activeWallpaperId && wallpapers.some((wallpaper) => wallpaper.id === data.appSettings?.activeWallpaperId) ? data.appSettings.activeWallpaperId : null;
  const expenses = normalizeExpenses(data.expenses, currency);
  return {
    categories: Array.isArray(data.categories) && data.categories.length > 0 ? data.categories : fallback.categories,
    expenses,
    budgets: Array.isArray(data.budgets) ? data.budgets : [],
    recurringRules: normalizeRecurringRules(data.recurringRules, expenses),
    appSettings: {
      ...fallback.appSettings,
      ...(data.appSettings ?? {}),
      currency,
      enabledCurrencies: normalizeEnabledCurrencies(data.appSettings?.enabledCurrencies, currency),
      theme,
      accentColor: data.appSettings?.accentColor ?? fallback.appSettings.accentColor,
      accentPalette: normalizeAccentPalette(data.appSettings?.accentPalette),
      paymentMethods: data.appSettings?.paymentMethods?.length ? data.appSettings.paymentMethods : fallback.appSettings.paymentMethods,
      wallpapers,
      activeWallpaperId,
      wallpaperOpacity: clampWallpaperOpacity(data.appSettings?.wallpaperOpacity),
      lastBackupAt: typeof data.appSettings?.lastBackupAt === "string" ? data.appSettings.lastBackupAt : null
    },
    aiSettings: {
      ...fallback.aiSettings,
      ...(data.aiSettings ?? {})
    }
  };
}

function normalizeTheme(theme: unknown): ThemeKey {
  if (theme === "dark") return "dark";
  return "light";
}

function dataKey(profileId: string): string {
  return `localspend.data.${profileId}`;
}

function secretKey(profileId: string, provider: string): string {
  return `localspend.secret.${profileId}.${provider}`;
}

function nextProfileColor(index: number): string {
  const colors = ["#4466d4", "#3a9a6f", "#c36a4d", "#8a66bf", "#2f8f9d", "#b98b28"];
  return colors[index % colors.length];
}
