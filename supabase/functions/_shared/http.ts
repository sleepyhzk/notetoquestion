// Tiện ích dùng chung cho các edge function (CORS, JSON response, giới hạn tần suất).

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// ---- Giới hạn tần suất (in-memory, theo từng instance) ----
// Không thay thế được rate limit phía hạ tầng, nhưng đủ để chặn lạm dụng đơn giản
// và tiết kiệm quota Gemini.
const hits = new Map<string, number[]>();

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "";
  return fwd.split(",")[0].trim() || "unknown";
}

/** Trả true nếu được phép; false nếu vượt giới hạn `limit` lần / `windowMs`. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    // dọn bớt để Map không phình vô hạn
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }
  return true;
}

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Danh sách model Gemini, ưu tiên từ trái sang phải. Ghi đè bằng secret GEMINI_MODELS (phân cách bằng dấu phẩy). */
export function geminiModels(): string[] {
  const fromEnv = Deno.env.get("GEMINI_MODELS");
  if (fromEnv) {
    const list = fromEnv.split(",").map((m) => m.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  // Các dòng 2.0 / 2.5 đã hoặc sắp ngừng phục vụ. "gemini-flash-latest" là alias tự trỏ tới bản Flash mới nhất.
  return ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"];
}
