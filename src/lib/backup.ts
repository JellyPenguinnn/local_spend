import { createDefaultProfileData, normalizeAccentPalette, normalizeRecurringRules } from "./defaults";
import { normalizeCurrencyCode, normalizeEnabledCurrencies, normalizeExpenses } from "./currencies";
import type { ProfileData, ProfileMeta, ThemeKey } from "./types";
import { clampWallpaperOpacity, trimWallpapers } from "./wallpaper";

export interface LocalSpendBackup {
  app: "LocalSpend";
  version: 1 | 2;
  exportedAt: string;
  profile: Pick<ProfileMeta, "id" | "displayName">;
  data: ProfileData;
}

export function createBackup(profile: ProfileMeta, data: ProfileData): string {
  const backup: LocalSpendBackup = {
    app: "LocalSpend",
    version: 2,
    exportedAt: new Date().toISOString(),
    profile: {
      id: profile.id,
      displayName: profile.displayName
    },
    data
  };
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function restoreBackup(json: string): { data: ProfileData | null; error?: string; profileName?: string } {
  try {
    const parsed = JSON.parse(json) as Partial<LocalSpendBackup>;
    if (parsed.app !== "LocalSpend" || ![1, 2].includes(parsed.version ?? 0) || !parsed.data) {
      return { data: null, error: "This does not look like a LocalSpend backup." };
    }
    const fallback = createDefaultProfileData();
    const data = parsed.data;
    const restoredTheme = normalizeTheme(data.appSettings?.theme);
    const wallpapers = trimWallpapers(Array.isArray(data.appSettings?.wallpapers) ? data.appSettings.wallpapers : []);
    const activeWallpaperId =
      data.appSettings?.activeWallpaperId && wallpapers.some((wallpaper) => wallpaper.id === data.appSettings?.activeWallpaperId) ? data.appSettings.activeWallpaperId : null;
    const currency = normalizeCurrencyCode(data.appSettings?.currency, fallback.appSettings.currency);
    const expenses = normalizeExpenses(data.expenses, currency);
    return {
      data: {
        categories: Array.isArray(data.categories) && data.categories.length > 0 ? data.categories : fallback.categories,
        expenses,
        budgets: Array.isArray(data.budgets) ? data.budgets : [],
        recurringRules: normalizeRecurringRules(data.recurringRules, expenses),
        appSettings: {
          ...fallback.appSettings,
          ...(data.appSettings ?? {}),
          currency,
          enabledCurrencies: normalizeEnabledCurrencies(data.appSettings?.enabledCurrencies, currency),
          theme: restoredTheme,
          accentColor: data.appSettings?.accentColor ?? fallback.appSettings.accentColor,
          accentPalette: normalizeAccentPalette(data.appSettings?.accentPalette),
          paymentMethods: data.appSettings?.paymentMethods?.length ? data.appSettings.paymentMethods : fallback.appSettings.paymentMethods,
          wallpapers,
          activeWallpaperId,
          wallpaperOpacity: clampWallpaperOpacity(data.appSettings?.wallpaperOpacity)
        },
        aiSettings: {
          ...fallback.aiSettings,
          ...(data.aiSettings ?? {}),
          apiKeySaved: false
        }
      },
      profileName: typeof parsed.profile?.displayName === "string" ? parsed.profile.displayName : undefined
    };
  } catch {
    return { data: null, error: "The backup file is not valid JSON." };
  }
}

function normalizeTheme(theme: unknown): ThemeKey {
  if (theme === "dark") return "dark";
  return "light";
}
