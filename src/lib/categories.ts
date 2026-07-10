import type { Category, CategorySuggestion } from "./types";

type CategoryKeyword = string | { keyword: string; weight: number };

const CATEGORY_ICONS: Record<string, string> = {
  "food & drinks": "🍜",
  transport: "🚌",
  groceries: "🛒",
  shopping: "🛍️",
  household: "🏠",
  "school / work": "💼",
  entertainment: "🎬",
  health: "✚",
  travel: "✈️",
  bills: "🧾",
  "rent / housing": "🏡",
  gifts: "🎁",
  transfer: "⇄",
  other: "•"
};

const CATEGORY_RULES: Array<{ categoryName: string; keywords: CategoryKeyword[] }> = [
  {
    categoryName: "Food & Drinks",
    keywords: [
      { keyword: "kopi", weight: 0.3 },
      { keyword: "teh", weight: 0.3 },
      { keyword: "coffee", weight: 0.24 },
      { keyword: "tea", weight: 0.18 },
      "bubble tea",
      { keyword: "lunch", weight: 0.08 },
      { keyword: "dinner", weight: 0.08 },
      { keyword: "breakfast", weight: 0.08 },
      { keyword: "supper", weight: 0.08 },
      { keyword: "snack", weight: 0.1 },
      { keyword: "koufu", weight: 0.34 },
      { keyword: "yakun", weight: 0.36 },
      { keyword: "ya kun", weight: 0.36 },
      { keyword: "toast box", weight: 0.34 },
      { keyword: "food court", weight: 0.24 },
      { keyword: "hawker", weight: 0.24 },
      { keyword: "caifan", weight: 0.28 },
      { keyword: "cai fan", weight: 0.28 },
      { keyword: "chicken rice", weight: 0.28 },
      { keyword: "mala", weight: 0.26 },
      { keyword: "mcd", weight: 0.34 },
      { keyword: "mcdonald", weight: 0.34 },
      { keyword: "macdonald", weight: 0.34 },
      { keyword: "kfc", weight: 0.34 },
      { keyword: "burger king", weight: 0.34 },
      { keyword: "subway", weight: 0.3 },
      { keyword: "starbucks", weight: 0.32 },
      { keyword: "restaurant", weight: 0.2 },
      { keyword: "cafe", weight: 0.22 },
      { keyword: "grabfood", weight: 0.38 },
      { keyword: "grab food", weight: 0.38 },
      { keyword: "foodpanda", weight: 0.38 },
      { keyword: "deliveroo", weight: 0.36 },
      { keyword: "kopitiam", weight: 0.32 },
      { keyword: "old chang kee", weight: 0.34 },
      { keyword: "breadtalk", weight: 0.3 },
      { keyword: "liho", weight: 0.3 },
      { keyword: "koi", weight: 0.3 },
      { keyword: "mixue", weight: 0.3 },
      { keyword: "mr bean", weight: 0.3 }
    ]
  },
  {
    categoryName: "Transport",
    keywords: [
      { keyword: "grab", weight: 0.3 },
      { keyword: "gojek", weight: 0.32 },
      { keyword: "tada", weight: 0.32 },
      { keyword: "taxi", weight: 0.3 },
      { keyword: "comfortdelgro", weight: 0.34 },
      { keyword: "cdg", weight: 0.28 },
      { keyword: "bus", weight: 0.34 },
      { keyword: "mrt", weight: 0.34 },
      { keyword: "train", weight: 0.24 },
      "transport",
      { keyword: "ezlink", weight: 0.34 },
      { keyword: "ez-link", weight: 0.34 },
      { keyword: "simplygo", weight: 0.34 },
      { keyword: "transitlink", weight: 0.34 },
      { keyword: "parking", weight: 0.26 },
      { keyword: "petrol", weight: 0.28 },
      { keyword: "fuel", weight: 0.26 },
      { keyword: "erp", weight: 0.26 },
      { keyword: "carpark", weight: 0.26 },
      { keyword: "zig", weight: 0.28 },
      { keyword: "shell", weight: 0.24 },
      { keyword: "caltex", weight: 0.24 },
      { keyword: "spc", weight: 0.24 },
      { keyword: "esso", weight: 0.24 }
    ]
  },
  {
    categoryName: "Groceries",
    keywords: [
      { keyword: "ntuc", weight: 0.38 },
      { keyword: "fairprice", weight: 0.38 },
      { keyword: "fair price", weight: 0.38 },
      { keyword: "grocery", weight: 0.28 },
      { keyword: "groceries", weight: 0.28 },
      { keyword: "sheng siong", weight: 0.36 },
      { keyword: "cold storage", weight: 0.36 },
      { keyword: "cs fresh", weight: 0.34 },
      { keyword: "supermarket", weight: 0.26 },
      { keyword: "giant", weight: 0.32 },
      { keyword: "donki", weight: 0.3 },
      { keyword: "don don donki", weight: 0.34 },
      { keyword: "redmart", weight: 0.34 },
      { keyword: "prime supermarket", weight: 0.34 },
      { keyword: "hao mart", weight: 0.32 }
    ]
  },
  {
    categoryName: "Shopping",
    keywords: [
      "shop",
      "shopping",
      { keyword: "shopee", weight: 0.38 },
      { keyword: "lazada", weight: 0.38 },
      { keyword: "uniqlo", weight: 0.34 },
      "clothes",
      "mall",
      { keyword: "amazon", weight: 0.34 },
      { keyword: "qoo10", weight: 0.34 },
      { keyword: "taobao", weight: 0.34 },
      { keyword: "shein", weight: 0.34 },
      { keyword: "zara", weight: 0.3 },
      { keyword: "muji", weight: 0.3 }
    ]
  },
  {
    categoryName: "Household",
    keywords: [
      "cleaning",
      "household",
      { keyword: "ikea", weight: 0.36 },
      "furniture",
      "home",
      "kitchen",
      "laundry",
      "detergent",
      "storage box",
      "daiso",
      "courts",
      "gain city",
      "best denki"
    ]
  },
  {
    categoryName: "School / Work",
    keywords: [
      "school",
      "office",
      "work",
      "book",
      "stationery",
      "course",
      { keyword: "udemy", weight: 0.34 },
      "printing",
      "laptop",
      "software",
      "notion",
      "coursera",
      "textbook",
      "exam",
      "popular bookstore",
      "popular"
    ]
  },
  {
    categoryName: "Entertainment",
    keywords: ["movie", { keyword: "netflix", weight: 0.36 }, { keyword: "spotify", weight: 0.36 }, "game", "concert", "entertainment", "cinema", "youtube", "disney", "steam", "ktv", "arcade"]
  },
  {
    categoryName: "Health",
    keywords: ["doctor", { keyword: "clinic", weight: 0.34 }, "medicine", "pharmacy", "health", "dental", "dentist", "hospital", "gym", "fitness", "guardian", "watsons", "polyclinic"]
  },
  {
    categoryName: "Travel",
    keywords: ["hotel", "flight", "airline", "travel", "airbnb", "passport", "visa fee", "scoot", "singapore airlines", "sia", "grab to airport", "airport"]
  },
  {
    categoryName: "Bills",
    keywords: [
      "bill",
      "utilities",
      "phone bill",
      "electricity",
      "water",
      "internet",
      "subscription",
      { keyword: "icloud", weight: 0.38 },
      "storage",
      "insurance",
      "singtel",
      "starhub",
      "m1",
      "sp services",
      "utility",
      "telco",
      "mobile plan",
      "myrepublic",
      "circles life",
      "gomo",
      "giga",
      "simba",
      "google one",
      "pub"
    ]
  },
  { categoryName: "Rent / Housing", keywords: [{ keyword: "rent", weight: 0.38 }, "housing", "mortgage", "landlord", "room", "hdb", "town council", "mcst", "condo maintenance"] },
  { categoryName: "Gifts", keywords: ["gift", "birthday", "present", "wedding", "angbao", "red packet", "treat"] },
  { categoryName: "Transfer", keywords: ["transfer to", "sent to", "send to", "top up", "remit", { keyword: "wise", weight: 0.34 }, "pay back", "repay"] }
];

export function suggestCategoryLocal(text: string, categories: Category[]): CategorySuggestion | null {
  const normalized = normalizeSearchText(text);
  let best: CategorySuggestion | null = null;

  for (const rule of CATEGORY_RULES) {
    const category = categories.find((item) => item.name.toLowerCase() === rule.categoryName.toLowerCase());
    if (!category) {
      continue;
    }
    const matches = rule.keywords.filter((keyword) => hasKeyword(normalized, keywordText(keyword)));
    if (matches.length === 0) {
      continue;
    }
    const score = matches.reduce((total, keyword) => total + keywordWeight(keyword), 0);
    const confidence = Math.min(0.95, 0.52 + score);
    if (!best || confidence > best.confidence) {
      best = {
        categoryId: category.id,
        confidence,
        source: "local",
        reason: `Matched ${matches.slice(0, 2).map(keywordText).join(", ")}`
      };
    }
  }

  return best;
}

function keywordText(keyword: CategoryKeyword): string {
  return typeof keyword === "string" ? keyword : keyword.keyword;
}

function keywordWeight(keyword: CategoryKeyword): number {
  if (typeof keyword !== "string") return keyword.weight;
  return normalizeSearchText(keyword).includes(" ") ? 0.2 : 0.16;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasKeyword(normalizedText: string, keyword: string): boolean {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return false;
  return ` ${normalizedText} `.includes(` ${normalizedKeyword} `);
}

export function categoryById(categories: Category[], categoryId: string): Category | undefined {
  return categories.find((category) => category.id === categoryId);
}

export function categoryName(categories: Category[], categoryId: string): string {
  return categoryById(categories, categoryId)?.name ?? "Uncategorized";
}

export function fallbackCategoryId(categories: Category[]): string {
  return categories.find((category) => category.name.toLowerCase() === "other")?.id ?? categories[0]?.id ?? "";
}

export function categoryIcon(category?: Category | null): string {
  if (category?.icon) return category.icon;
  return CATEGORY_ICONS[category?.name.toLowerCase() ?? ""] ?? "•";
}

export function canDeleteCategory(_category: Category, expenseCount: number): { ok: boolean; reason?: string } {
  if (expenseCount > 0) {
    return { ok: false, reason: "This category is used by expenses. Move those expenses first." };
  }
  return { ok: true };
}
