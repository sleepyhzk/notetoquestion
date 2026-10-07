// Edge function: translate-quiz
// Dịch câu hỏi trắc nghiệm giữa tiếng Việt và tiếng Anh bằng Gemini.
// Giữ nguyên số đáp án và thứ tự đáp án để đáp án đúng (correctIndex) không bị lệch.

import { allow, clientKey, geminiModels, GEMINI_ENDPOINT, json, preflight } from "../_shared/http.ts";

interface InItem {
  id: string;
  question: string;
  options: string[];
  explanation: string;
  topic: string;
}

const MAX_ITEMS = 25;
const MAX_TOTAL_CHARS = 30000;
const MODEL_TIMEOUT_MS = 55_000;
const TOTAL_BUDGET_MS = 110_000;

const SYSTEM_INSTRUCTION =
  "You are a precise translator of university study materials between Vietnamese and English. " +
  "Translate faithfully and naturally without adding, removing or explaining anything. " +
  "Always return exactly one valid JSON array and nothing else (no markdown).";

const LANG_NAME: Record<string, string> = { en: "English", vi: "Vietnamese (tiếng Việt)" };

function buildPrompt(items: InItem[], target: string): string {
  return `Translate every multiple-choice question below into ${LANG_NAME[target]}.

STRICT RULES:
1. Return a JSON array with exactly one object per input item, using the SAME "id".
2. Each object has: "id", "question", "options", "explanation", "topic".
3. "options" MUST contain exactly the same number of strings, in exactly the same order as the input (the correct answer is identified by its position, so never reorder, merge, split or drop options).
4. Keep unchanged: code, commands, file names, formulas, numbers, units, abbreviations and acronyms (CPU, TCP/IP, LIFO...), and well-known technical terms that are normally left in English when writing Vietnamese.
5. Translate only natural-language text. Keep the meaning and the level of formality; do not "fix" or improve the content.
6. If a field is empty, return it empty.

INPUT:
${JSON.stringify(items)}`;
}

function extractJsonArray(text: string): unknown[] | null {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Chỉ giữ các câu dịch hợp lệ: đúng id, đúng số đáp án. */
function sanitize(output: unknown[], input: InItem[]): InItem[] {
  const byId = new Map(input.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const out: InItem[] = [];
  for (const raw of output) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const src = typeof r.id === "string" ? byId.get(r.id) : undefined;
    if (!src || seen.has(src.id)) continue;
    if (typeof r.question !== "string" || !r.question.trim()) continue;
    if (!Array.isArray(r.options) || r.options.length !== src.options.length) continue;
    if (!r.options.every((o) => typeof o === "string" && o.trim())) continue;
    seen.add(src.id);
    out.push({
      id: src.id,
      question: r.question.trim(),
      options: (r.options as string[]).map((o) => o.trim()),
      explanation: typeof r.explanation === "string" ? r.explanation.trim() : "",
      topic: typeof r.topic === "string" && r.topic.trim() ? r.topic.trim() : src.topic,
    });
  }
  return out;
}

async function callGemini(apiKey: string, model: string, items: InItem[], target: string): Promise<InItem[] | null> {
  try {
    const generationConfig: Record<string, unknown> = {
      temperature: 0.2,
      maxOutputTokens: 16000,
      responseMimeType: "application/json",
    };
    if (model.includes("2.5")) generationConfig.thinkingConfig = { thinkingBudget: 0 };

    const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: buildPrompt(items, target) }] }],
        generationConfig,
      }),
    });
    if (!response.ok) {
      console.error(`translate-quiz ${model} HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    const parsed = text ? extractJsonArray(text) : null;
    if (!parsed) return null;
    const valid = sanitize(parsed, items);
    // Quá nửa số câu hỏng thì coi như model này thất bại, thử model kế tiếp.
    return valid.length >= Math.ceil(items.length / 2) ? valid : null;
  } catch (err) {
    console.error(`translate-quiz ${model} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!allow(`translate:${clientKey(req)}`, 40, 60_000)) {
      return json({ error: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút." }, 429);
    }

    const body = (await req.json()) as { items?: unknown; target?: unknown };
    const target = body.target === "en" || body.target === "vi" ? body.target : null;
    if (!target) return json({ error: "Ngôn ngữ đích không hợp lệ." }, 400);
    if (!Array.isArray(body.items) || body.items.length === 0) return json({ error: "Không có câu hỏi để dịch." }, 400);
    if (body.items.length > MAX_ITEMS) return json({ error: `Mỗi lần chỉ dịch tối đa ${MAX_ITEMS} câu.` }, 400);

    const items: InItem[] = [];
    let total = 0;
    for (const raw of body.items as Record<string, unknown>[]) {
      if (
        typeof raw?.id !== "string" ||
        typeof raw.question !== "string" ||
        !Array.isArray(raw.options) ||
        raw.options.length < 2 ||
        raw.options.length > 8 ||
        !raw.options.every((o) => typeof o === "string")
      ) {
        return json({ error: "Dữ liệu câu hỏi không hợp lệ." }, 400);
      }
      const item: InItem = {
        id: raw.id,
        question: raw.question,
        options: raw.options as string[],
        explanation: typeof raw.explanation === "string" ? raw.explanation : "",
        topic: typeof raw.topic === "string" ? raw.topic : "",
      };
      total += item.question.length + item.explanation.length + item.options.join("").length;
      items.push(item);
    }
    if (total > MAX_TOTAL_CHARS) return json({ error: "Nội dung cần dịch quá dài." }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "AI chưa được cấu hình (thiếu GEMINI_API_KEY)." }, 503);

    const startedAt = Date.now();
    for (const model of geminiModels()) {
      if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;
      const translated = await callGemini(apiKey, model, items, target);
      if (translated) return json({ items: translated, model });
    }
    return json({ error: "AI không dịch được. Vui lòng thử lại." }, 502);
  } catch (err) {
    console.error("translate-quiz error:", err instanceof Error ? err.message : err);
    return json({ error: "Không thể xử lý yêu cầu." }, 500);
  }
});
