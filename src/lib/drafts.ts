import type { ExpenseDraft } from "./types";

const DRAFT_PREFIX = "localspend.draft.v1";
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function expenseDraftKey(profileId: string, context: string): string {
  return `${DRAFT_PREFIX}.${profileId}.${context}`;
}

export function loadExpenseDraft(key: string): Partial<ExpenseDraft> | null {
  try {
    pruneExpiredExpenseDrafts();
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; draft?: Partial<ExpenseDraft> } | Partial<ExpenseDraft>;
    if ("draft" in parsed) {
      if (typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt > DRAFT_MAX_AGE_MS) {
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

export function pruneExpiredExpenseDrafts(now = Date.now()): number {
  let removed = 0;
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(`${DRAFT_PREFIX}.`)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { savedAt?: unknown };
        if (typeof parsed.savedAt === "number" && now - parsed.savedAt > DRAFT_MAX_AGE_MS) {
          localStorage.removeItem(key);
          removed += 1;
        }
      } catch {
        localStorage.removeItem(key);
        removed += 1;
      }
    }
  } catch {
    // Draft cleanup is best-effort and must never block entry.
  }
  return removed;
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
