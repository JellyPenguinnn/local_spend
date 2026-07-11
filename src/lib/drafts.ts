import type { ExpenseDraft } from "./types";

const DRAFT_PREFIX = "localspend.draft.v1";

export function expenseDraftKey(profileId: string, context: string): string {
  return `${DRAFT_PREFIX}.${profileId}.${context}`;
}

export function loadExpenseDraft(key: string): Partial<ExpenseDraft> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; draft?: Partial<ExpenseDraft> } | Partial<ExpenseDraft>;
    if ("draft" in parsed) {
      if (typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed.draft && typeof parsed.draft === "object" ? parsed.draft : null;
    }
    return parsed && typeof parsed === "object" ? (parsed as Partial<ExpenseDraft>) : null;
  } catch {
    return null;
  }
}

export function saveExpenseDraft(key: string, draft: ExpenseDraft): void {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), draft }));
  } catch {
    // A draft is a convenience layer; a storage restriction must not block entry.
  }
}

export function clearExpenseDraft(key?: string): void {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore unavailable session storage.
  }
}
