// Edge function: chat-ai — trợ lý học tập, gọi Gemini.
// Yêu cầu JWT (anon key của Supabase) + giới hạn tần suất để tránh bị lạm dụng quota.

import { allow, clientKey, geminiModels, GEMINI_ENDPOINT, json, preflight } from "../_shared/http.ts";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatContext = { subjectName?: string; semesterTitle?: string };

const MAX_HISTORY = 20;
const MAX_CONTENT_LENGTH = 4000;

const BASE_SYSTEM =
  "Bạn là trợ lý học tập AI thân thiện cho sinh viên đại học. Trả lời bằng tiếng Việt, rõ ràng, ngắn gọn nhưng có ví dụ khi cần. " +
  "Ưu tiên giải thích để người học tự hiểu, không bịa thông tin; nếu không chắc hãy nói rõ. " +
  "Bạn có thể dùng Markdown (in đậm, danh sách, khối code) để trình bày.";

function clean(text: unknown, max: number): string {
  return typeof text === "string" ? text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!allow(`chat:${clientKey(req)}`, 20, 60_000)) {
      return json({ error: "Bạn gửi quá nhanh. Vui lòng đợi một chút rồi thử lại." }, 429);
    }

    const body = (await req.json()) as { messages?: unknown; context?: ChatContext };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: "Nội dung hội thoại không hợp lệ." }, 400);
    }

    // Chỉ lấy MAX_HISTORY tin gần nhất (thay vì từ chối khi hội thoại dài).
    let valid: ChatMessage[] = body.messages
      .slice(-MAX_HISTORY)
      .map((m: { role?: unknown; content?: unknown }) => ({ role: m?.role, content: clean(m?.content, MAX_CONTENT_LENGTH) }))
      .filter((m): m is ChatMessage => (m.role === "user" || m.role === "assistant") && m.content.length > 0);

    // Gemini yêu cầu lượt đầu là của người dùng.
    while (valid.length > 0 && valid[0].role !== "user") valid = valid.slice(1);
    if (valid.length === 0) return json({ error: "Vui lòng nhập câu hỏi." }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "Trợ lý AI chưa được cấu hình." }, 503);

    const subject = clean(body.context?.subjectName, 120);
    const semester = clean(body.context?.semesterTitle, 120);
    const system = subject
      ? `${BASE_SYSTEM}\nNgười dùng đang xem môn "${subject}"${semester ? ` (${semester})` : ""}; ưu tiên trả lời trong ngữ cảnh môn học này khi phù hợp.`
      : BASE_SYSTEM;

    for (const model of geminiModels()) {
      try {
        const generationConfig: Record<string, unknown> = { temperature: 0.5, maxOutputTokens: 1500 };
        if (model.includes("2.5")) generationConfig.thinkingConfig = { thinkingBudget: 0 };

        const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: valid.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
            generationConfig,
          }),
        });
        if (!response.ok) {
          console.error(`chat-ai ${model} HTTP ${response.status}`);
          continue; // thử model kế tiếp
        }
        const data = await response.json();
        const reply: unknown = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
        if (typeof reply === "string" && reply.trim()) return json({ reply: reply.trim() });
      } catch (err) {
        console.error(`chat-ai ${model} error:`, err instanceof Error ? err.message : err);
      }
    }
    return json({ error: "AI đang bận. Vui lòng thử lại sau." }, 502);
  } catch {
    return json({ error: "Không thể kết nối với trợ lý AI." }, 500);
  }
});
