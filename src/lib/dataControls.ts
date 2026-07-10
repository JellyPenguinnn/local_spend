import type { ProfileData } from "./types";

export function resetSpendingData(data: ProfileData): ProfileData {
  return {
    ...data,
    expenses: [],
    budgets: [],
    recurringRules: []
  };
}
