import type { ProfileData } from "../types";

export const BROWSER_PROFILE_SECTION_NAMES = [
  "categories",
  "expenses",
  "budgets",
  "recurringRules",
  "appSettings",
  "wallpapers",
  "aiSettings"
] as const;

export type BrowserProfileSectionName = (typeof BROWSER_PROFILE_SECTION_NAMES)[number];

export interface BrowserProfileSections {
  categories: ProfileData["categories"];
  expenses: ProfileData["expenses"];
  budgets: ProfileData["budgets"];
  recurringRules: ProfileData["recurringRules"];
  appSettings: ProfileData["appSettings"];
  wallpapers: ProfileData["appSettings"]["wallpapers"];
  aiSettings: ProfileData["aiSettings"];
}

export function splitBrowserProfileData(data: ProfileData): BrowserProfileSections {
  return {
    categories: data.categories,
    expenses: data.expenses,
    budgets: data.budgets,
    recurringRules: data.recurringRules,
    appSettings: { ...data.appSettings, wallpapers: [] },
    wallpapers: data.appSettings.wallpapers,
    aiSettings: data.aiSettings
  };
}

export function joinBrowserProfileSections(sections: BrowserProfileSections): ProfileData {
  return {
    categories: sections.categories,
    expenses: sections.expenses,
    budgets: sections.budgets,
    recurringRules: sections.recurringRules,
    appSettings: {
      ...sections.appSettings,
      wallpapers: sections.wallpapers
    },
    aiSettings: sections.aiSettings
  };
}

export function changedBrowserProfileSections(previous: ProfileData | undefined, next: ProfileData): BrowserProfileSectionName[] {
  if (!previous) return [...BROWSER_PROFILE_SECTION_NAMES];
  const changed: BrowserProfileSectionName[] = [];
  if (previous.categories !== next.categories) changed.push("categories");
  if (previous.expenses !== next.expenses) changed.push("expenses");
  if (previous.budgets !== next.budgets) changed.push("budgets");
  if (previous.recurringRules !== next.recurringRules) changed.push("recurringRules");
  if (previous.appSettings !== next.appSettings) changed.push("appSettings");
  if (previous.appSettings.wallpapers !== next.appSettings.wallpapers) changed.push("wallpapers");
  if (previous.aiSettings !== next.aiSettings) changed.push("aiSettings");
  return changed;
}
