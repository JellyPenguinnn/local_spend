import { aggregateForAi, summarizeMonth, suggestFromExpenseHistory } from "../analytics";
import { suggestCategoryLocal } from "../categories";
import { formatLocalIsoDate } from "../date";
import type { AiSettings, Category, CategorySuggestion, Expense, MonthlyAggregateForAi, ParsedExpenseDraft } from "../types";
import { categoryJsonSchema, expenseJsonSchema, insightsJsonSchema, mapAiExpenseToDraft, parseJsonObject, validateAiCategoryJson, validateAiExpenseJson, validateAiInsightsJson } from "./schema";
import { categoryPrompt, expenseParsePrompt, monthlyInsightPrompt } from "./prompts";
import { parseExpenseLocal } from "./localParser";

export interface AiSecretStore {
  getSecret(provider: string): Promise<string | null>;
}

export async function parseExpenseWithAiOrLocal(
  input: string,
  settings: AiSettings,
  categories: Category[],
  secrets: AiSecretStore,
  today = formatLocalIsoDate(),
  paymentMethods: string[] = [],
  expenses: Expense[] = []
): Promise<ParsedExpenseDraft | null> {
  const local = parseExpenseLocal(input, categories, today, paymentMethods);
  const enrichedLocal = enrichWithExpenseHistory(input, local, expenses);
  if (settings.provider === "none") {
    return enrichedLocal;
  }
  try {
    const prompt = expenseParsePrompt(input, today, categories);
    const raw = await requestJson(settings, prompt, expenseJsonSchema, secrets);
    const parsed = validateAiExpenseJson(parseJsonObject(raw));
    const category = parsed.categoryName
      ? categories.find((item) => item.name.toLowerCase() === parsed.categoryName?.toLowerCase())
      : undefined;
    const aiDraft = mapAiExpenseToDraft(parsed, category?.id ?? enrichedLocal?.categoryId);
    return enrichWithExpenseHistory(input, { ...aiDraft, currency: aiDraft.currency ?? enrichedLocal?.currency }, expenses);
  } catch {
    return enrichedLocal;
  }
}

function enrichWithExpenseHistory(input: string, draft: ParsedExpenseDraft | null, expenses: Expense[]): ParsedExpenseDraft | null {
  if (!draft || expenses.length === 0) return draft;
  const memory = suggestFromExpenseHistory(`${draft.title ?? ""} ${input}`, expenses);
  if (!memory) return draft;
  const categoryConfidence = draft.categoryConfidence ?? 0;
  const shouldUseMemoryCategory =
    !draft.categoryId ||
    memory.confidence > categoryConfidence + 0.03 ||
    (memory.confidence >= 0.8 && categoryConfidence < 0.86);
  return {
    ...draft,
    categoryId: shouldUseMemoryCategory ? memory.categoryId : draft.categoryId,
    categoryConfidence: shouldUseMemoryCategory ? memory.confidence : draft.categoryConfidence,
    paymentMethod: draft.paymentMethod ?? memory.paymentMethod ?? undefined,
    confidence: Math.max(draft.confidence, Math.min(0.96, memory.confidence))
  };
}

export async function suggestCategory(input: string, settings: AiSettings, categories: Category[], secrets: AiSecretStore): Promise<CategorySuggestion | null> {
  const local = suggestCategoryLocal(input, categories);
  if (local && local.confidence >= 0.72) {
    return local;
  }
  if (settings.provider === "none") {
    return local;
  }
  try {
    const raw = await requestJson(settings, categoryPrompt(input, categories), categoryJsonSchema, secrets);
    const parsed = validateAiCategoryJson(parseJsonObject(raw));
    const category = categories.find((item) => item.name.toLowerCase() === parsed.categoryName.toLowerCase());
    if (!category) return local;
    return {
      categoryId: category.id,
      confidence: parsed.confidence,
      reason: parsed.reason,
      source: "ai"
    };
  } catch {
    return local;
  }
}

export async function generateMonthlyAiInsights(aggregate: MonthlyAggregateForAi, settings: AiSettings, secrets: AiSecretStore): Promise<string[]> {
  if (settings.provider === "none") {
    return [];
  }
  const raw = await requestJson(settings, monthlyInsightPrompt(aggregate), insightsJsonSchema, secrets);
  return validateAiInsightsJson(parseJsonObject(raw)).comments;
}

export function aggregateFromDataForAi(
  expenses: Parameters<typeof summarizeMonth>[0],
  categories: Parameters<typeof summarizeMonth>[1],
  month: string,
  currency: string
): MonthlyAggregateForAi {
  return aggregateForAi(summarizeMonth(expenses, categories, month, currency), currency);
}

export async function testAiConnection(settings: AiSettings, secrets: AiSecretStore): Promise<string> {
  if (settings.provider === "none") {
    return "AI is disabled.";
  }
  const raw = await requestJson(
    settings,
    "Return JSON only: {\"comments\":[\"Connection works.\"]}",
    insightsJsonSchema,
    secrets
  );
  validateAiInsightsJson(parseJsonObject(raw));
  return "Connection works.";
}

async function requestJson(settings: AiSettings, prompt: string, schema: object, secrets: AiSecretStore): Promise<string> {
  const timeoutMs = settings.timeoutMs || 10000;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (settings.provider === "ollama-local") {
      return await requestOllama(settings, prompt, schema, controller.signal);
    }
    const apiKey = await secrets.getSecret(settings.provider);
    if (!apiKey) {
      throw new Error("Please save an API key first.");
    }
    if (settings.provider === "gemini") {
      return await requestGemini(settings, prompt, schema, apiKey, controller.signal);
    }
    if (settings.provider === "groq") {
      return await requestOpenAiCompatible(settings, prompt, schema, apiKey, settings.baseUrl || "https://api.groq.com/openai/v1", controller.signal);
    }
    if (settings.provider === "openrouter") {
      return await requestOpenAiCompatible(settings, prompt, schema, apiKey, settings.baseUrl || "https://openrouter.ai/api/v1", controller.signal);
    }
    throw new Error("Unsupported provider.");
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requestOllama(settings: AiSettings, prompt: string, schema: object, signal: AbortSignal): Promise<string> {
  const baseUrl = settings.baseUrl || "http://localhost:11434";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model || "llama3.2",
      prompt,
      stream: false,
      format: schema,
      options: { temperature: 0 }
    }),
    signal
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}.`);
  const json = (await response.json()) as { response?: string };
  if (!json.response) throw new Error("Ollama returned an empty response.");
  return json.response;
}

async function requestGemini(settings: AiSettings, prompt: string, schema: object, apiKey: string, signal: AbortSignal): Promise<string> {
  const model = settings.model || "gemini-2.5-flash-lite";
  const base = settings.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const response = await fetch(`${base.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        maxOutputTokens: settings.maxTokens || 450,
        temperature: 0.1
      }
    }),
    signal
  });
  if (!response.ok) throw new Error(`Gemini returned ${response.status}.`);
  const json = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

async function requestOpenAiCompatible(settings: AiSettings, prompt: string, schema: object, apiKey: string, baseUrl: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "localspend.local",
      "X-Title": "LocalSpend"
    },
    body: JSON.stringify({
      model: settings.model || "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "Return JSON only. No markdown." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      max_tokens: settings.maxTokens || 450,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "localspend_response",
          strict: true,
          schema
        }
      }
    }),
    signal
  });
  if (!response.ok) throw new Error(`Provider returned ${response.status}.`);
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Provider returned an empty response.");
  return text;
}
