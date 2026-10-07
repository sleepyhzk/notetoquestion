// Edge function: generate-quiz
// Nhận nội dung ghi chú từ frontend và nhờ Gemini sinh câu hỏi trắc nghiệm.
// Nếu không có API key hoặc AI lỗi -> trả lỗi 5xx; frontend sẽ tự dùng bộ tạo câu cục bộ
// (src/utils/quizGenerator.ts). Không còn bản sao logic cục bộ ở đây.

import { allow, clientKey, corsHeaders, geminiModels, GEMINI_ENDPOINT, json, preflight } from "../_shared/http.ts";

interface QuizItem {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  /** Lý do cho TỪNG đáp án (đúng vì sao, sai vì sao), cùng thứ tự với options. Có thể thiếu nếu AI không trả về. */
  optionExplanations?: string[];
}

interface GenerateRequest {
  notesContent?: unknown;
  maxQuestions?: unknown;
}

// Mỗi lần gọi xử lý MỘT phần ghi chú (frontend đã chia nhỏ). Số câu tăng theo độ dài phần đó.
const MAX_NOTES_CHARS = 12000;
const MAX_QUESTIONS = 40;
const MODEL_TIMEOUT_MS = 90_000; // mỗi model tối đa 90s (đầu ra dài vì có giải thích từng đáp án)
const TOTAL_BUDGET_MS = 135_000; // Edge Function bị cắt ở ~150s nên tổng thời gian các lần thử không vượt mức này

const SYSTEM_INSTRUCTION =
  "Bạn là trợ lý tạo câu hỏi trắc nghiệm ôn tập cho sinh viên đại học. " +
  "Chỉ dựa vào nội dung ghi chú được cung cấp, không bịa thêm kiến thức ngoài ghi chú. " +
  "Viết câu hỏi, đáp án và giải thích bằng cùng ngôn ngữ với ghi chú (mặc định tiếng Việt). " +
  "Luôn trả về duy nhất một mảng JSON hợp lệ, không kèm markdown hay giải thích bên ngoài.";

function buildPrompt(notesContent: string, maxQuestions: number): string {
  return `Hãy đọc kỹ "Nội dung ghi chú" bên dưới và tạo bộ câu hỏi trắc nghiệm BAO QUÁT TOÀN BỘ kiến thức trong đó.

QUY TẮC BẮT BUỘC:
1. Chỉ dựa vào nội dung ghi chú; mỗi câu hỏi phải trả lời được từ chính văn bản đó. Các dòng bắt đầu bằng "## " là tiêu đề ghi chú, dùng làm ngữ cảnh, không phải kiến thức để hỏi.
2. BAO QUÁT HẾT: mọi định nghĩa, khái niệm, quy tắc, công thức, ví dụ, so sánh, số liệu và ý quan trọng đều phải có ít nhất một câu hỏi. Không bỏ sót ý nào, không dồn vào một đoạn.
3. Số câu phụ thuộc vào lượng kiến thức: tạo VỪA ĐỦ để phủ hết (thường 1 câu cho mỗi ý chính), tối đa ${maxQuestions} câu. Không tạo câu trùng ý hoặc câu thừa chỉ để đủ số.
4. Câu hỏi rõ ràng, tự đứng được (không viết "theo đoạn trên"). Đáp án nhiễu hợp lý, cùng kiểu với đáp án đúng, không đánh đố vô lý.
5. Mỗi câu có đúng 4 đáp án khác nhau; "correctIndex" là chỉ số (0-3) của đáp án đúng. Phân bố vị trí đáp án đúng ngẫu nhiên.
6. "explanation" tóm tắt ngắn gọn (1-2 câu) ý chính cần nhớ, bám sát ghi chú.
7. "optionExplanations" là mảng 4 chuỗi, phần tử thứ i giải thích đáp án thứ i trong "options" (cùng thứ tự):
   - Đáp án ĐÚNG: vì sao đúng (1-2 câu, nêu lý do/cơ chế cụ thể).
   - Mỗi đáp án SAI: vì sao sai (1-2 câu): nó thực chất là gì hoặc khi nào mới đúng, khác đáp án đúng ở điểm nào. Không viết chung chung kiểu "đáp án này sai". Nếu ghi chú không nói rõ, hãy giải thích bằng kiến thức chuẩn, ngắn gọn.
   - Đi thẳng vào lý do, không mở đầu bằng "Đúng:" hay "Sai:".

ĐỊNH DẠNG: mảng JSON thuần túy, ví dụ:
[{"question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"...","optionExplanations":["vì sao A đúng","vì sao B sai","vì sao C sai","vì sao D sai"]}]

NỘI DUNG GHI CHÚ:
---
${notesContent}
---`;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Bóc JSON khỏi phản hồi (kể cả khi model bọc trong ```json ... ```). */
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

/** Kiểm tra từng câu, loại câu hỏng, rồi xáo trộn đáp án (model hay đặt đáp án đúng ở vị trí đầu). */
function sanitize(items: unknown[], max: number): QuizItem[] {
  const out: QuizItem[] = [];
  const seenQuestions = new Set<string>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const q = raw as Record<string, unknown>;
    if (typeof q.question !== "string" || !q.question.trim()) continue;
    if (!Array.isArray(q.options) || q.options.length !== 4) continue;
    if (!q.options.every((o) => typeof o === "string" && o.trim())) continue;
    const options = (q.options as string[]).map((o) => o.trim());
    if (new Set(options.map((o) => o.toLowerCase())).size !== 4) continue; // đáp án trùng nhau
    const ci = q.correctIndex;
    if (typeof ci !== "number" || !Number.isInteger(ci) || ci < 0 || ci > 3) continue;
    if (typeof q.explanation !== "string" || !q.explanation.trim()) continue;
    const key = q.question.trim().toLowerCase();
    if (seenQuestions.has(key)) continue;
    seenQuestions.add(key);

    // Xáo trộn đáp án (model hay đặt đáp án đúng ở vị trí đầu). Lý do từng đáp án phải đi cùng đáp án của nó.
    const order = shuffle([0, 1, 2, 3]);
    const item: QuizItem = {
      question: q.question.trim(),
      options: order.map((i) => options[i]),
      correctIndex: order.indexOf(ci),
      explanation: q.explanation.trim(),
    };
    const ox = q.optionExplanations;
    if (Array.isArray(ox) && ox.length === 4 && ox.every((o) => typeof o === "string" && o.trim())) {
      item.optionExplanations = order.map((i) => (ox as string[])[i].trim());
    }
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

async function callGemini(apiKey: string, model: string, prompt: string, max: number, timeoutMs: number): Promise<QuizItem[] | null> {
  try {
    const generationConfig: Record<string, unknown> = {
      temperature: 0.4,
      maxOutputTokens: 32000,
      responseMimeType: "application/json",
      topP: 0.9,
    };
    // Dòng 2.5 có "thinking" ăn vào ngân sách token -> tắt để đủ chỗ cho JSON.
    if (model.includes("2.5")) generationConfig.thinkingConfig = { thinkingBudget: 0 };

    const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });
    if (!response.ok) {
      console.error(`Gemini ${model} HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    if (!text) return null;
    const items = extractJsonArray(text);
    if (!items) return null;
    const valid = sanitize(items, max);
    return valid.length > 0 ? valid : null;
  } catch (err) {
    console.error(`Gemini ${model} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!allow(`quiz:${clientKey(req)}`, 40, 60_000)) {
      return json({ error: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút." }, 429);
    }

    const body = (await req.json()) as GenerateRequest;
    const notesContent = typeof body.notesContent === "string" ? body.notesContent.trim() : "";
    const requested = typeof body.maxQuestions === "number" ? Math.floor(body.maxQuestions) : 15;
    const maxQuestions = Math.min(Math.max(requested, 1), MAX_QUESTIONS);

    if (notesContent.length < 30) {
      return json({ error: "Nội dung ghi chú quá ngắn để sinh câu hỏi." }, 400);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json({ error: "AI chưa được cấu hình (thiếu GEMINI_API_KEY).", source: "none" }, 503);
    }

    const prompt = buildPrompt(notesContent.slice(0, MAX_NOTES_CHARS), maxQuestions);
    const startedAt = Date.now();
    for (const model of geminiModels()) {
      const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
      if (remaining < 15_000) break;
      const questions = await callGemini(apiKey, model, prompt, maxQuestions, Math.min(MODEL_TIMEOUT_MS, remaining));
      if (questions) return json({ questions, source: "gemini", model });
    }

    return json({ error: "AI không sinh được câu hỏi hợp lệ.", source: "none" }, 502);
  } catch (err) {
    console.error("generate-quiz error:", err instanceof Error ? err.message : err);
    return json({ error: "Không thể xử lý yêu cầu." }, 500);
  }
});
