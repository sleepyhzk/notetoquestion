// Lấy phần giải thích chi tiết từng đáp án (vì sao đúng / vì sao sai) cho các câu chưa có sẵn.
// Kết quả được lưu trên máy theo nội dung câu hỏi nên mỗi câu chỉ phải hỏi AI một lần.

import { hashString } from './ids';
import type { Lang } from './language';

export interface ExplainInput {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  optionExplanations?: string[];
}

export interface DetailedExplanation {
  explanation: string;
  optionExplanations: string[];
}

// ---------------- Lưu kết quả ----------------

const CACHE_KEY = 'kien-thuc-explanations-v1';
const CACHE_MAX = 800;

interface CacheShape {
  order: string[];
  items: Record<string, DetailedExplanation>;
}

/** Khoá theo ngôn ngữ + nội dung (câu hỏi, đáp án, đáp án đúng): sửa câu hỏi thì kết quả cũ tự không dùng nữa. */
export function explainKey(lang: Lang, q: Pick<ExplainInput, 'id' | 'question' | 'options' | 'correctIndex'>): string {
  return `${lang}:${q.id}:${hashString(`${q.question}|${q.options.join('|')}|${q.correctIndex}`)}`;
}

export function isValidDetails(v: unknown, optionCount: number): v is string[] {
  return Array.isArray(v) && v.length === optionCount && v.every((o) => typeof o === 'string' && o.trim().length > 0);
}

function loadCache(): CacheShape {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CacheShape>;
      if (parsed && Array.isArray(parsed.order) && parsed.items && typeof parsed.items === 'object') {
        return { order: parsed.order, items: parsed.items };
      }
    }
  } catch {
    // cache hỏng -> bắt đầu lại
  }
  return { order: [], items: {} };
}

export function readExplainCache(key: string, optionCount: number): DetailedExplanation | null {
  const hit = loadCache().items[key];
  return hit && typeof hit.explanation === 'string' && isValidDetails(hit.optionExplanations, optionCount) ? hit : null;
}

export function writeExplainCache(key: string, value: DetailedExplanation): void {
  const cache = loadCache();
  if (!(key in cache.items)) cache.order.push(key);
  cache.items[key] = value;
  while (cache.order.length > CACHE_MAX) {
    const oldest = cache.order.shift();
    if (oldest) delete cache.items[oldest];
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // đầy bộ nhớ: bỏ qua
  }
}

// ---------------- Gọi AI ----------------

export class ExplainError extends Error {}

export async function fetchExplanation(q: ExplainInput, lang: Lang): Promise<DetailedExplanation> {
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/explain-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        lang,
        items: [{ id: '0', question: q.question, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation }],
      }),
    });
  } catch {
    throw new ExplainError('Không kết nối được tới máy chủ AI.');
  }
  const data: unknown = await response.json().catch(() => null);
  const body = (data ?? {}) as { items?: unknown; error?: unknown };
  if (!response.ok || !Array.isArray(body.items)) {
    throw new ExplainError(typeof body.error === 'string' ? body.error : `Lỗi máy chủ (${response.status}).`);
  }
  const item = (body.items as { id?: unknown; explanation?: unknown; optionExplanations?: unknown }[]).find((i) => i?.id === '0');
  if (!item || !isValidDetails(item.optionExplanations, q.options.length)) {
    throw new ExplainError('AI trả về phân tích không hợp lệ.');
  }
  return {
    explanation: typeof item.explanation === 'string' && item.explanation.trim() ? item.explanation : q.explanation,
    optionExplanations: item.optionExplanations,
  };
}
