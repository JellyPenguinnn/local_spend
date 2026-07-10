import { beforeEach, describe, expect, it } from "vitest";
import { buildMonthlyInsightCards, calculateSafeToSpend, getCategoryTotals, getUpcomingRecurringItems, hasDuplicateExpense, summarizeMonth, suggestFromExpenseHistory } from "./analytics";
import { restoreBackup, createBackup } from "./backup";
import { suggestCategoryLocal } from "./categories";
import { exportExpensesCsv, importExpensesCsv } from "./csv";
import { resetSpendingData } from "./dataControls";
import { buildCalendarMonth, formatLocalIsoDate, previousMonthKey } from "./date";
import { createDefaultProfileData, normalizeAccentPalette, normalizeRecurringRules } from "./defaults";
import { parseExpenseLocal } from "./ai/localParser";
import { parseExpenseWithAiOrLocal } from "./ai/providers";
import { parseJsonObject, validateAiCategoryJson, validateAiExpenseJson, validateAiInsightsJson } from "./ai/schema";
import { formatCalendarCellAmount, formatMoney, parseMoney, roundMoney } from "./money";
import { getFrequentExpenseTemplates } from "./expenseTemplates";
import {
  advanceRecurringRulePastRecorded,
  discardRecurringOccurrence,
  getDueRecurringOccurrences,
  materializeDueRecurring,
  recordRecurringOccurrence,
  resolveRecurringRuleNextDate
} from "./recurring";
import { createRepository } from "./storage/repository";
import { MAX_WALLPAPERS, clampWallpaperOpacity, trimWallpapers } from "./wallpaper";
import type { Expense, ProfileMeta, RecurringRule, WallpaperImage } from "./types";

describe("money formatting and parsing", () => {
  it("rounds, parses, and formats SGD amounts", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(parseMoney("SGD 12.30")).toBe(12.3);
    expect(parseMoney("-2")).toBeNull();
    expect(formatMoney(6.5, "SGD")).toContain("SGD");
    expect(formatMoney(6.5, "SGD")).toContain("6.50");
  });

  it("formats calendar day totals without currency overflow", () => {
    expect(formatCalendarCellAmount(9.23)).toBe("9.23");
    expect(formatCalendarCellAmount(128.4)).toBe("128.40");
    expect(formatCalendarCellAmount(888.88)).toBe("888.88");
    expect(formatCalendarCellAmount(1234.56)).toBe("1235");
    expect(formatCalendarCellAmount(12345.67)).toBe("12.3k");
    expect(formatCalendarCellAmount(1234.56)).not.toContain("SGD");
  });
});

describe("frequent expense templates", () => {
  it("ranks by frequency and uses recency to break ties", () => {
    const expenses = [
      makeExpense("cat_transport", "2026-07-01", 2, "Bus"),
      makeExpense("cat_food_drinks", "2026-07-02", 5, "Yakun"),
      makeExpense("cat_transport", "2026-07-03", 2, "Bus"),
      makeExpense("cat_groceries", "2026-07-04", 12, "NTUC"),
      makeExpense("cat_food_drinks", "2026-07-05", 5.2, "Yakun"),
      makeExpense("cat_transport", "2026-07-06", 2.1, "Bus"),
      makeExpense("cat_shopping", "2026-07-07", 8, "Popular")
    ];
    const templates = getFrequentExpenseTemplates(expenses);
    expect(templates.map((expense) => expense.title)).toEqual(["Bus", "Yakun", "Popular"]);
    expect(templates[0].amount).toBe(2.1);
  });
});

describe("wallpaper settings", () => {
  it("caps saved wallpapers and clamps background visibility", () => {
    const wallpapers: WallpaperImage[] = Array.from({ length: 12 }, (_, index) => ({
      id: `wallpaper_${index}`,
      name: `Wallpaper ${index}`,
      dataUrl: "data:image/webp;base64,test",
      mimeType: "image/webp",
      sizeBytes: 1000,
      createdAt: "2026-07-09T00:00:00.000Z"
    }));
    expect(trimWallpapers(wallpapers)).toHaveLength(MAX_WALLPAPERS);
    expect(clampWallpaperOpacity(0.01)).toBe(0.12);
    expect(clampWallpaperOpacity(0.7)).toBe(0.55);
  });
});

describe("appearance settings", () => {
  it("keeps a clean eight-color accent palette", () => {
    expect(normalizeAccentPalette(["#ABCDEF", "#abcdef", "nope", "#123456", "#234567", "#345678", "#456789", "#56789a", "#6789ab"])).toEqual([
      "#abcdef",
      "#123456",
      "#234567",
      "#345678",
      "#456789",
      "#56789a",
      "#6789ab"
    ]);
  });
});

describe("date and calendar logic", () => {
  it("builds a stable month grid across boundaries", () => {
    const cells = buildCalendarMonth("2026-02", "2026-02-14");
    expect(cells).toHaveLength(42);
    expect(cells.filter((cell) => cell.isCurrentMonth)).toHaveLength(28);
    expect(cells.some((cell) => cell.isToday)).toBe(true);
    expect(previousMonthKey("2026-01")).toBe("2025-12");
  });

  it("formats local dates without utc date slicing", () => {
    const date = new Date("2026-07-06T16:30:00.000Z");
    expect(formatLocalIsoDate(date, "Asia/Singapore")).toBe("2026-07-07");
  });
});

describe("profile creation and data isolation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates profiles, switches active profile, and keeps data isolated", async () => {
    const repo = createRepository();
    const first = await repo.createProfile({ displayName: "Brian" });
    const firstId = first.activeProfileId!;
    const firstData = await repo.getProfileData(firstId);
    const expense = makeExpense(firstData.categories[0].id, "2026-07-07", 6.5, "Lunch");
    await repo.saveProfileData(firstId, { ...firstData, expenses: [expense] });

    const second = await repo.createProfile({ displayName: "Friend" });
    const secondId = second.activeProfileId!;
    expect((await repo.getProfileData(secondId)).expenses).toHaveLength(0);

    await repo.switchProfile(firstId);
    expect((await repo.getProfileData(firstId)).expenses[0].title).toBe("Lunch");
  });
});

describe("expense CRUD helpers and summaries", () => {
  it("detects duplicates and aggregates categories", () => {
    const data = createDefaultProfileData();
    const expense = makeExpense(data.categories[0].id, "2026-07-07", 10, "Lunch");
    expect(hasDuplicateExpense([expense], { amount: 10, date: "2026-07-07", title: "Lunch" })).toBe(true);
    const totals = getCategoryTotals([expense], data.categories);
    expect(totals[0].total).toBe(10);
  });

  it("calculates month-over-month comparison and deterministic comments", () => {
    const data = createDefaultProfileData();
    const expenses = [
      makeExpense(data.categories[0].id, "2026-06-05", 30, "Old food"),
      makeExpense(data.categories[0].id, "2026-07-01", 10, "Kopi"),
      makeExpense(data.categories[1].id, "2026-07-02", 5, "MRT")
    ];
    const summary = summarizeMonth(expenses, data.categories, "2026-07");
    expect(summary.total).toBe(15);
    expect(summary.previousMonthTotal).toBe(30);
    expect(summary.monthOverMonthDelta).toBe(-15);
    expect(summary.deterministicComments.some((comment) => comment.includes("less than last month"))).toBe(true);
  });

  it("calculates safe-to-spend, review cards, and upcoming recurring items", () => {
    const data = createDefaultProfileData();
    const budget = { id: "budget_1", month: "2026-07", categoryId: null, amount: 310 };
    const expense = makeExpense(data.categories[0].id, "2026-07-10", 100, "Lunch");
    const safe = calculateSafeToSpend([budget], [expense], "2026-07", "2026-07-10");
    expect(safe.left).toBe(210);
    expect(safe.perDay).toBe(9.55);
    expect(safe.pace).toBe("normal");

    const summary = summarizeMonth([expense], data.categories, "2026-07");
    const cards = buildMonthlyInsightCards(summary, safe, "SGD");
    expect(cards.map((card) => card.id)).toContain("budget-pace");

    const upcoming = getUpcomingRecurringItems(
      [
        {
          id: "rule_1",
          title: "Phone bill",
          amount: 20,
          currency: "SGD",
          categoryId: "cat_bills",
          remark: null,
          paymentMethod: "Credit Card",
          cadence: "monthly",
          dayOfMonth: 12,
          startDate: "2026-07-12",
          nextDate: "2026-07-12",
          isActive: true,
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-01T00:00:00Z"
        }
      ],
      data.categories,
      "2026-07-10",
      30
    );
    expect(upcoming[0].dueLabel).toBe("2 days");
  });

  it("suggests category and payment from past local entries", () => {
    const data = createDefaultProfileData();
    const expense = makeExpense(data.categories[1].id, "2026-07-07", 14.8, "Grab ride");
    const suggestion = suggestFromExpenseHistory("grab airport", [{ ...expense, paymentMethod: "Credit Card" }]);
    expect(suggestion?.categoryId).toBe(data.categories[1].id);
    expect(suggestion?.paymentMethod).toBe("Credit Card");
  });
});

describe("CSV import/export and backups", () => {
  it("exports and imports expenses by category name", () => {
    const data = createDefaultProfileData();
    const expense = makeExpense(data.categories[0].id, "2026-07-07", 6.5, "Lunch");
    const csv = exportExpensesCsv([expense], data.categories);
    const imported = importExpensesCsv(csv, data.categories, "SGD");
    expect(imported.errors).toHaveLength(0);
    expect(imported.expenses[0].amount).toBe(6.5);
    expect(imported.expenses[0].categoryId).toBe(data.categories[0].id);
  });

  it("reports CSV import errors without creating bad expenses", () => {
    const data = createDefaultProfileData();
    const imported = importExpensesCsv("date,amount,category\n07/07/2026,nope,Unknown", data.categories, "SGD");
    expect(imported.expenses).toHaveLength(0);
    expect(imported.errors).toContain("Line 2: date must be YYYY-MM-DD.");
  });

  it("serializes and restores JSON backups for active profile data", () => {
    const data = createDefaultProfileData();
    const profile: ProfileMeta = {
      id: "profile_test",
      displayName: "Test",
      color: "#4466d4",
      createdAt: "2026-07-07T00:00:00Z",
      updatedAt: "2026-07-07T00:00:00Z"
    };
    const json = createBackup(profile, data);
    const restored = restoreBackup(json);
    expect(restored.error).toBeUndefined();
    expect(restored.data?.categories).toHaveLength(data.categories.length);
    expect(restored.data?.aiSettings.apiKeySaved).toBe(false);
  });

  it("rejects invalid JSON backup data clearly", () => {
    const restored = restoreBackup('{"app":"Other"}');
    expect(restored.data).toBeNull();
    expect(restored.error).toBe("This does not look like a LocalSpend backup.");
  });

  it("resets spending data without clearing user settings", () => {
    const data = createDefaultProfileData();
    data.expenses = [makeExpense(data.categories[0].id, "2026-07-07", 6.5, "Lunch")];
    data.budgets = [{ id: "budget_1", month: "2026-07", categoryId: null, amount: 500 }];
    data.recurringRules = [
      {
        id: "rule_1",
        title: "iCloud",
        amount: 3.9,
        currency: "SGD",
        categoryId: "cat_school_work",
        paymentMethod: "Apple Pay",
        remark: null,
        cadence: "monthly",
        dayOfMonth: 5,
        startDate: "2026-07-05",
        nextDate: "2026-08-05",
        isActive: true,
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z"
      }
    ];
    data.appSettings.currency = "MYR";
    data.appSettings.paymentMethods = ["Touch n Go", "Cash"];
    const reset = resetSpendingData(data);
    expect(reset.expenses).toHaveLength(0);
    expect(reset.budgets).toHaveLength(0);
    expect(reset.recurringRules).toHaveLength(0);
    expect(reset.categories).toHaveLength(data.categories.length);
    expect(reset.appSettings.currency).toBe("MYR");
    expect(reset.appSettings.paymentMethods).toEqual(["Touch n Go", "Cash"]);
  });
});

describe("AI parsing and local category rules", () => {
  it("validates JSON-only AI schemas", () => {
    const expense = validateAiExpenseJson(parseJsonObject('{"amount":12.5,"date":"2026-07-07","confidence":0.8}'));
    expect(expense.amount).toBe(12.5);
    const category = validateAiCategoryJson(parseJsonObject('{"categoryName":"Transport","confidence":0.7,"reason":"grab"}'));
    expect(category.categoryName).toBe("Transport");
    const insights = validateAiInsightsJson(parseJsonObject('{"comments":["Food is high.","You stayed under budget."]}'));
    expect(insights.comments).toHaveLength(2);
  });

  it("uses local rules before AI for common spending text", () => {
    const data = createDefaultProfileData();
    const suggestion = suggestCategoryLocal("grab 14.80 yesterday transport", data.categories);
    expect(suggestion?.categoryId).toBe("cat_transport");
    const parsed = parseExpenseLocal("kopi 2.20 at koufu yesterday", data.categories, "2026-07-07");
    expect(parsed?.amount).toBe(2.2);
    expect(parsed?.date).toBe("2026-07-06");
    expect(parsed?.categoryId).toBe("cat_food_drinks");
  });

  it("parses SGD text and payment methods into a clean draft", () => {
    const data = createDefaultProfileData();
    const parsed = parseExpenseLocal("mcdonald lunch SGD 7.95 paynow", data.categories, "2026-07-07");
    expect(parsed?.amount).toBe(7.95);
    expect(parsed?.paymentMethod).toBe("PayNow");
    expect(parsed?.categoryId).toBe("cat_food_drinks");
    expect(parsed?.title).toBe("mcdonald lunch");
  });

  it("does not treat calendar dates as the amount", () => {
    const data = createDefaultProfileData();
    const parsed = parseExpenseLocal("on 1 July rent 900 bank transfer", data.categories, "2026-07-07");
    expect(parsed?.amount).toBe(900);
    expect(parsed?.date).toBe("2026-07-01");
    expect(parsed?.paymentMethod).toBe("Bank Transfer");
  });

  it("keeps payment words separate from categories", () => {
    const data = createDefaultProfileData();
    const bus = parseExpenseLocal("bus 1.28 paynow", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(bus?.amount).toBe(1.28);
    expect(bus?.paymentMethod).toBe("PayNow");
    expect(bus?.categoryId).toBe("cat_transport");
    expect(bus?.title).toBe("bus");

    const yakun = parseExpenseLocal("yakun 5.70 paynow", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(yakun?.categoryId).toBe("cat_food_drinks");
    expect(yakun?.title).toBe("yakun");
  });

  it("uses specific NLP category signals instead of defaulting to food", () => {
    const data = createDefaultProfileData();
    const shopee = parseExpenseLocal("shopee 18.90 paylah", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(shopee?.categoryId).toBe("cat_shopping");

    const fairPrice = parseExpenseLocal("fair price groceries 16.30 paynow", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(fairPrice?.categoryId).toBe("cat_groceries");
    expect(fairPrice?.title).toBe("fair price");

    const clinic = parseExpenseLocal("clinic 42 cash", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(clinic?.categoryId).toBe("cat_health");

    const icloud = parseExpenseLocal("icloud 3.90 apple pay", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(icloud?.categoryId).toBe("cat_bills");

    const spotify = parseExpenseLocal("spotify 12.98 credit card", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(spotify?.categoryId).toBe("cat_entertainment");

    const foodpanda = parseExpenseLocal("foodpanda 18.20 paylah", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(foodpanda?.categoryId).toBe("cat_food_drinks");

    const simplygo = parseExpenseLocal("simplygo 1.80 nets", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(simplygo?.categoryId).toBe("cat_transport");
    expect(simplygo?.paymentMethod).toBe("Debit Card");

    const singtel = parseExpenseLocal("singtel 29.90 credit card", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(singtel?.categoryId).toBe("cat_bills");

    const townCouncil = parseExpenseLocal("town council 88 bank transfer", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(townCouncil?.categoryId).toBe("cat_rent_housing");

    const mixedSignal = parseExpenseLocal("lunch shopee 12.50 paynow", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(mixedSignal?.categoryId).toBe("cat_shopping");
  });

  it("parses common Singapore-style quick entries", () => {
    const data = createDefaultProfileData();
    const mrt = parseExpenseLocal("mrt $1.80 cash ytd", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(mrt?.amount).toBe(1.8);
    expect(mrt?.date).toBe("2026-07-06");
    expect(mrt?.paymentMethod).toBe("Cash");
    expect(mrt?.categoryId).toBe("cat_transport");

    const ntuc = parseExpenseLocal("ntuc 45.30 credit card", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(ntuc?.categoryId).toBe("cat_groceries");
    expect(ntuc?.paymentMethod).toBe("Credit Card");
    expect(ntuc?.title).toBe("ntuc");
  });

  it("cleans natural titles into short merchant or item text", () => {
    const data = createDefaultProfileData();
    const kopi = parseExpenseLocal("kopi 2.20 at koufu yesterday", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(kopi?.title).toBe("koufu kopi");

    const lunch = parseExpenseLocal("lunch with friend 12.50", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(lunch?.title).toBe("lunch with friend");

    const bill = parseExpenseLocal("iCloud 3.90 apple pay bills", data.categories, "2026-07-07", data.appSettings.paymentMethods);
    expect(bill?.categoryId).toBe("cat_bills");
    expect(bill?.paymentMethod).toBe("Apple Pay");
    expect(bill?.title).toBe("iCloud");
  });

  it("understands weekday shorthand as the most recent matching day", () => {
    const data = createDefaultProfileData();
    const parsed = parseExpenseLocal("toast box 6.20 last fri paylah", data.categories, "2026-07-08", data.appSettings.paymentMethods);
    expect(parsed?.date).toBe("2026-07-03");
    expect(parsed?.paymentMethod).toBe("PayLah");
    expect(parsed?.title).toBe("toast box");
  });

  it("learns category and payment from previous local entries", async () => {
    const data = createDefaultProfileData();
    const previous = makeExpense("cat_food_drinks", "2026-07-06", 10.5, "mcd");
    previous.paymentMethod = "Credit Card";
    const parsed = await parseExpenseWithAiOrLocal(
      "mcd 8.20",
      data.aiSettings,
      data.categories,
      { getSecret: async () => null },
      "2026-07-07",
      data.appSettings.paymentMethods,
      [previous]
    );
    expect(parsed?.categoryId).toBe("cat_food_drinks");
    expect(parsed?.paymentMethod).toBe("Credit Card");
    expect(parsed?.title).toBe("mcd");
  });

  it("lets exact local history override weak category guesses", async () => {
    const data = createDefaultProfileData();
    const previous = makeExpense("cat_food_drinks", "2026-07-06", 9.8, "grab");
    previous.paymentMethod = "Credit Card";
    const parsed = await parseExpenseWithAiOrLocal(
      "grab 8.20",
      data.aiSettings,
      data.categories,
      { getSecret: async () => null },
      "2026-07-07",
      data.appSettings.paymentMethods,
      [previous]
    );
    expect(parsed?.categoryId).toBe("cat_food_drinks");
    expect(parsed?.paymentMethod).toBe("Credit Card");
  });
});

describe("recurring rules", () => {
  it("materializes due recurring rules and advances the next date", () => {
    const data = createDefaultProfileData();
    const rule = {
      id: "rule_1",
      title: "Phone bill",
      amount: 20,
      currency: "SGD",
      categoryId: "cat_bills",
      remark: null,
      paymentMethod: "Credit Card",
      cadence: "monthly" as const,
      dayOfMonth: 5,
      startDate: "2026-07-05",
      nextDate: "2026-07-05",
      isActive: true,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z"
    };
    const result = materializeDueRecurring({ ...data, recurringRules: [rule] }, "2026-07-07");
    expect(result.created).toHaveLength(1);
    expect(result.data.recurringRules[0].nextDate).toBe("2026-08-05");
  });

  it("records only one missing occurrence per recurring rule confirmation", () => {
    const data = createDefaultProfileData();
    const rule = makeRecurringRule({ nextDate: "2026-07-05" });
    const first = materializeDueRecurring({ ...data, recurringRules: [rule] }, "2026-12-09");
    expect(first.created).toHaveLength(1);
    expect(first.created[0].date).toBe("2026-07-05");
    expect(first.data.recurringRules[0].nextDate).toBe("2026-08-05");

    const second = materializeDueRecurring(first.data, "2026-12-09");
    expect(second.created).toHaveLength(1);
    expect(second.created[0].date).toBe("2026-08-05");
    expect(second.data.recurringRules[0].nextDate).toBe("2026-09-05");
  });

  it("advances a recurring rule when the due expense already exists", () => {
    const data = createDefaultProfileData();
    const existing = { ...makeExpense("cat_bills", "2026-07-05", 20, "Phone bill"), paymentMethod: "Credit Card" };
    const rule = {
      id: "rule_1",
      title: "Phone bill",
      amount: 20,
      currency: "SGD",
      categoryId: "cat_bills",
      remark: null,
      paymentMethod: "Credit Card",
      cadence: "monthly" as const,
      dayOfMonth: 5,
      startDate: "2026-07-05",
      nextDate: "2026-07-05",
      isActive: true,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z"
    };
    const result = materializeDueRecurring({ ...data, expenses: [existing], recurringRules: [rule] }, "2026-07-09");
    expect(result.created).toHaveLength(0);
    expect(result.data.expenses).toHaveLength(1);
    expect(result.data.recurringRules[0].nextDate).toBe("2026-08-05");

    const editedRule = advanceRecurringRulePastRecorded(rule, [existing], "2026-07-09");
    expect(editedRule.nextDate).toBe("2026-08-05");
  });

  it("shows every unresolved occurrence from a past start date", () => {
    const rule = makeRecurringRule({ startDate: "2026-06-03", nextDate: "2026-06-03", dayOfMonth: 3 });
    const dueDates = getDueRecurringOccurrences([rule], [], "2026-07-10").map((occurrence) => occurrence.date);
    expect(dueDates).toEqual(["2026-06-03", "2026-07-03"]);
    expect(resolveRecurringRuleNextDate(rule, [], "2026-07-10").nextDate).toBe("2026-06-03");
  });

  it("suppresses exact recorded dates after a start-date edit", () => {
    const existingJuly = { ...makeExpense("cat_bills", "2026-07-05", 20, "Phone bill"), paymentMethod: "Credit Card" };
    const julyRule = makeRecurringRule({ startDate: "2026-07-05", nextDate: "2026-07-05", dayOfMonth: 5 });
    expect(getDueRecurringOccurrences([julyRule], [existingJuly], "2026-07-10")).toHaveLength(0);
    expect(resolveRecurringRuleNextDate(julyRule, [existingJuly], "2026-07-10").nextDate).toBe("2026-08-05");

    const juneRule = { ...julyRule, startDate: "2026-06-05", nextDate: "2026-06-05", discardedDates: [] };
    const dueDates = getDueRecurringOccurrences([juneRule], [existingJuly], "2026-07-10").map((occurrence) => occurrence.date);
    expect(dueDates).toEqual(["2026-06-05"]);
    expect(resolveRecurringRuleNextDate(juneRule, [existingJuly], "2026-07-10").nextDate).toBe("2026-06-05");
  });

  it("keeps discarded occurrences dismissed and advances after recording", () => {
    const data = createDefaultProfileData();
    const rule = makeRecurringRule({ startDate: "2026-06-03", nextDate: "2026-06-03", dayOfMonth: 3 });
    const withRule = { ...data, recurringRules: [rule] };

    const discarded = discardRecurringOccurrence(withRule, rule.id, "2026-06-03", "2026-07-10");
    expect(discarded.recurringRules[0].discardedDates).toEqual(["2026-06-03"]);
    expect(getDueRecurringOccurrences(discarded.recurringRules, discarded.expenses, "2026-07-10").map((item) => item.date)).toEqual(["2026-07-03"]);

    const recorded = recordRecurringOccurrence(discarded, rule.id, "2026-07-03", "2026-07-10");
    expect(recorded.created?.date).toBe("2026-07-03");
    expect(recorded.data.recurringRules[0].nextDate).toBe("2026-08-03");
  });

  it("keeps future starts future and skips exact records due today", () => {
    const futureRule = makeRecurringRule({ startDate: "2026-12-20", nextDate: "2026-12-20" });
    expect(resolveRecurringRuleNextDate(futureRule, [], "2026-12-09").nextDate).toBe("2026-12-20");

    const todayRule = makeRecurringRule({ startDate: "2026-12-09", nextDate: "2026-12-09" });
    const existing = { ...makeExpense("cat_bills", "2026-12-09", 20, "Phone bill"), paymentMethod: "Credit Card" };
    expect(resolveRecurringRuleNextDate(todayRule, [existing], "2026-12-09").nextDate).toBe("2027-01-09");
  });

  it("ignores inactive recurring rules", () => {
    const data = createDefaultProfileData();
    const rule = makeRecurringRule({ nextDate: "2026-07-05", isActive: false });
    const result = materializeDueRecurring({ ...data, recurringRules: [rule] }, "2026-07-09");
    expect(result.created).toHaveLength(0);
    expect(result.data.recurringRules[0].nextDate).toBe("2026-07-05");
  });

  it("clamps monthly recurring dates for shorter months", () => {
    const data = createDefaultProfileData();
    const rule = makeRecurringRule({ startDate: "2026-01-31", nextDate: "2026-01-31", dayOfMonth: 31 });
    const result = materializeDueRecurring({ ...data, recurringRules: [rule] }, "2026-02-01");
    expect(result.created).toHaveLength(1);
    expect(result.data.recurringRules[0].nextDate).toBe("2026-02-28");
  });

  it("infers missing recurring start dates from exact recorded expenses", () => {
    const existing = { ...makeExpense("cat_bills", "2026-07-05", 20, "Phone bill"), paymentMethod: "Credit Card" };
    const normalized = normalizeRecurringRules(
      [
        {
          id: "rule_1",
          title: "Phone bill",
          amount: 20,
          currency: "SGD",
          categoryId: "cat_bills",
          remark: null,
          paymentMethod: "Credit Card",
          cadence: "monthly",
          dayOfMonth: 5,
          nextDate: "2026-08-05",
          isActive: true,
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-01T00:00:00Z"
        }
      ],
      [existing]
    );
    expect(normalized[0].startDate).toBe("2026-07-05");
    expect(normalized[0].nextDate).toBe("2026-08-05");
    expect(normalized[0].discardedDates).toEqual([]);
  });

  it("supports daily and annual recurring cadence", () => {
    const data = createDefaultProfileData();
    const baseRule = {
      id: "rule_1",
      title: "Subscription",
      amount: 5,
      currency: "SGD",
      categoryId: "cat_bills",
      remark: null,
      paymentMethod: "Credit Card",
      dayOfMonth: 5,
      startDate: "2026-07-05",
      isActive: true,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z"
    };

    const daily = materializeDueRecurring(
      {
        ...data,
        recurringRules: [{ ...baseRule, cadence: "daily" as const, nextDate: "2026-07-05" }]
      },
      "2026-07-07"
    );
    expect(daily.created).toHaveLength(1);
    expect(daily.data.recurringRules[0].nextDate).toBe("2026-07-06");

    const annual = materializeDueRecurring(
      {
        ...data,
        recurringRules: [{ ...baseRule, id: "rule_2", cadence: "annually" as const, dayOfMonth: 28, startDate: "2026-02-28", nextDate: "2026-02-28" }]
      },
      "2026-03-01"
    );
    expect(annual.created).toHaveLength(1);
    expect(annual.data.recurringRules[0].nextDate).toBe("2027-02-28");
  });
});

function makeRecurringRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  const startDate = overrides.startDate ?? "2026-07-05";
  return {
    id: "rule_1",
    title: "Phone bill",
    amount: 20,
    currency: "SGD",
    categoryId: "cat_bills",
    remark: null,
    paymentMethod: "Credit Card",
    cadence: "monthly",
    dayOfMonth: Number(startDate.slice(8, 10)),
    startDate,
    nextDate: "2026-07-05",
    isActive: true,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides
  };
}

function makeExpense(categoryId: string, date: string, amount: number, title: string): Expense {
  return {
    id: `exp_${title}_${date}`,
    amount,
    currency: "SGD",
    date,
    categoryId,
    title,
    remark: null,
    paymentMethod: "Cash",
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`
  };
}
