// Edge function: explain-quiz
// Giải thích chi tiết một câu trắc nghiệm: vì sao đáp án đúng là đúng và vì sao TỪNG đáp án còn lại sai.
// Dùng cho các câu chưa có sẵn phần giải thích từng đáp án (bộ câu hỏi cũ, ngân hàng câu hỏi, câu tạo trên máy).

import { allow, clientKey, geminiModels, GEMINI_ENDPOINT, json, preflight } from "../_shared/http.ts";

interface InItem {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface OutItem {
  id: string;
  explanation: string;
  optionExplanations: string[];
}

const MAX_ITEMS = 5;
const MAX_TOTAL_CHARS = 12000;
const MODEL_TIMEOUT_MS = 40_000;
const TOTAL_BUDGET_MS = 100_000;

const SYSTEM_INSTRUCTION =
  "Bạn là gia sư đại học giải thích câu hỏi trắc nghiệm rõ ràng, chính xác, dễ hiểu. " +
  "Luôn trả về duy nhất một mảng JSON hợp lệ, không kèm markdown hay văn bản ngoài JSON.";

const LANG_NAME: Record<string, string> = { vi: "tiếng Việt", en: "English" };

function letter(i: number): string {
  return String.fromCharCode(65 + i);
}

function buildPrompt(items: InItem[], lang: string): string {
  const input = items.map((i) => ({
    id: i.id,
    question: i.question,
    options: i.options.map((o, idx) => `${letter(idx)}. ${o}`),
    correctAnswer: `${letter(i.correctIndex)}. ${i.options[i.correctIndex]}`,
    existingExplanation: i.explanation,
  }));
  return `Với mỗi câu trắc nghiệm bên dưới, hãy giải thích chi tiết bằng ${LANG_NAME[lang]}.

QUY TẮC BẮT BUỘC:
1. Trả về mảng JSON, mỗi câu một object với cùng "id": {"id","explanation","optionExplanations"}.
2. "optionExplanations" có ĐÚNG số phần tử bằng số đáp án, ĐÚNG thứ tự các đáp án (phần tử i giải thích đáp án thứ i). Không đổi thứ tự, không gộp, không bỏ sót.
3. Với đáp án ĐÚNG: giải thích vì sao đúng (1-2 câu, nêu cơ chế / lý do cụ thể).
4. Với MỖI đáp án SAI: giải thích cụ thể vì sao sai (1-2 câu): nó thực chất là gì hoặc khi nào thì nó mới đúng, và điểm khác với đáp án đúng. Không viết chung chung kiểu "đáp án này sai".
5. Không bắt đầu bằng chữ "Đúng:" hay "Sai:" và không lặp lại nguyên văn đáp án. Đi thẳng vào lý do.
6. "explanation" là 1-2 câu tóm tắt ý chính cần nhớ của câu hỏi.
7. Dựa vào "existingExplanation" và "correctAnswer" đã cho; không đổi đáp án đúng. Giữ nguyên thuật ngữ kỹ thuật, viết tắt, lệnh, code.

INPUT:
${JSON.stringify(input)}`;
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

/** Chỉ giữ kết quả hợp lệ: đúng id, đúng số đáp án, không rỗng. */
function sanitize(output: unknown[], input: InItem[]): OutItem[] {
  const byId = new Map(input.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const out: OutItem[] = [];
  for (const raw of output) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const src = typeof r.id === "string" ? byId.get(r.id) : undefined;
    if (!src || seen.has(src.id)) continue;
    if (!Array.isArray(r.optionExplanations) || r.optionExplanations.length !== src.options.length) continue;
    if (!r.optionExplanations.every((o) => typeof o === "string" && o.trim())) continue;
    seen.add(src.id);
    out.push({
      id: src.id,
      explanation: typeof r.explanation === "string" && r.explanation.trim() ? r.explanation.trim() : src.explanation,
      optionExplanations: (r.optionExplanations as string[]).map((o) => o.trim()),
    });
  }
  return out;
}

async function callGemini(apiKey: string, model: string, items: InItem[], lang: string, timeoutMs: number): Promise<OutItem[] | null> {
  try {
    const generationConfig: Record<string, unknown> = {
      temperature: 0.3,
      maxOutputTokens: 8000,
      responseMimeType: "application/json",
    };
    if (model.includes("2.5")) generationConfig.thinkingConfig = { thinkingBudget: 0 };

    const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: buildPrompt(items, lang) }] }],
        generationConfig,
      }),
    });
    if (!response.ok) {
      console.error(`explain-quiz ${model} HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    const parsed = text ? extractJsonArray(text) : null;
    if (!parsed) return null;
    const valid = sanitize(parsed, items);
    return valid.length >= Math.ceil(items.length / 2) ? valid : null;
  } catch (err) {
    console.error(`explain-quiz ${model} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!allow(`explain:${clientKey(req)}`, 40, 60_000)) {
      return json({ error: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút." }, 429);
    }

    const body = (await req.json()) as { items?: unknown; lang?: unknown };
    const lang = body.lang === "en" || body.lang === "vi" ? body.lang : null;
    if (!lang) return json({ error: "Ngôn ngữ không hợp lệ." }, 400);
    if (!Array.isArray(body.items) || body.items.length === 0) return json({ error: "Không có câu hỏi." }, 400);
    if (body.items.length > MAX_ITEMS) return json({ error: `Mỗi lần chỉ phân tích tối đa ${MAX_ITEMS} câu.` }, 400);

    const items: InItem[] = [];
    let total = 0;
    for (const raw of body.items as Record<string, unknown>[]) {
      if (
        typeof raw?.id !== "string" ||
        typeof raw.question !== "string" ||
        !Array.isArray(raw.options) ||
        raw.options.length < 2 ||
        raw.options.length > 8 ||
        !raw.options.every((o) => typeof o === "string") ||
        typeof raw.correctIndex !== "number" ||
        !Number.isInteger(raw.correctIndex) ||
        raw.correctIndex < 0 ||
        raw.correctIndex >= raw.options.length
      ) {
        return json({ error: "Dữ liệu câu hỏi không hợp lệ." }, 400);
      }
      const item: InItem = {
        id: raw.id,
        question: raw.question,
        options: raw.options as string[],
        correctIndex: raw.correctIndex,
        explanation: typeof raw.explanation === "string" ? raw.explanation : "",
      };
      total += item.question.length + item.explanation.length + item.options.join("").length;
      items.push(item);
    }
    if (total > MAX_TOTAL_CHARS) return json({ error: "Nội dung quá dài." }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "AI chưa được cấu hình (thiếu GEMINI_API_KEY)." }, 503);

    const startedAt = Date.now();
    for (const model of geminiModels()) {
      const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
      if (remaining < 10_000) break;
      const result = await callGemini(apiKey, model, items, lang, Math.min(MODEL_TIMEOUT_MS, remaining));
      if (result) return json({ items: result, model });
    }
    return json({ error: "AI chưa phân tích được. Vui lòng thử lại." }, 502);
  } catch (err) {
    console.error("explain-quiz error:", err instanceof Error ? err.message : err);
    return json({ error: "Không thể xử lý yêu cầu." }, 500);
  }
});
