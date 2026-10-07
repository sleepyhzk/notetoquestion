// Dịch câu hỏi trắc nghiệm giữa tiếng Việt và tiếng Anh bằng AI (edge function `translate-quiz`).
// Bản dịch được lưu lại trên máy theo nội dung câu hỏi nên chuyển ngôn ngữ qua lại không phải gọi AI lần nữa.

import type { QuizQuestion } from '../types';
import { hashString } from './ids';
import type { Lang } from './language';

export type { Lang };

export interface TranslatedQuestion {
  question: string;
  options: string[];
  explanation: string;
  topic: string;
}

// ---------------- Lưu bản dịch ----------------

const CACHE_KEY = 'kien-thuc-translations-v1';
const CACHE_MAX = 1500; // giữ tối đa ngần này bản dịch, bỏ cái cũ nhất

interface CacheShape {
  order: string[];
  items: Record<string, TranslatedQuestion>;
}

/** Khoá theo ngôn ngữ đích + id + nội dung: câu hỏi bị sửa thì bản dịch cũ tự không dùng nữa. */
export function cacheKey(target: Lang, q: { id: string; question: string }): string {
  return `${target}:${q.id}:${hashString(q.question)}`;
}

function isTranslated(v: unknown): v is TranslatedQuestion {
  const t = v as TranslatedQuestion;
  return (
    !!t &&
    typeof t.question === 'string' &&
    Array.isArray(t.options) &&
    t.options.every((o) => typeof o === 'string') &&
    typeof t.explanation === 'string' &&
    typeof t.topic === 'string'
  );
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

export function readCache(keys: string[]): Record<string, TranslatedQuestion> {
  const cache = loadCache();
  const out: Record<string, TranslatedQuestion> = {};
  for (const k of keys) if (isTranslated(cache.items[k])) out[k] = cache.items[k];
  return out;
}

export function writeCache(entries: Record<string, TranslatedQuestion>): void {
  const cache = loadCache();
  for (const [k, v] of Object.entries(entries)) {
    if (!(k in cache.items)) cache.order.push(k);
    cache.items[k] = v;
  }
  while (cache.order.length > CACHE_MAX) {
    const oldest = cache.order.shift();
    if (oldest) delete cache.items[oldest];
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // đầy bộ nhớ: bỏ qua, chỉ mất khả năng dùng lại bản dịch
  }
}

// ---------------- Chia lô ----------------

/** Lô đầu nhỏ để câu đang làm có bản dịch sớm; các lô sau lớn hơn. Có giới hạn tổng số ký tự mỗi lô. */
export function planBatches(questions: QuizQuestion[], firstSize = 5, size = 12, maxChars = 8000): QuizQuestion[][] {
  const batches: QuizQuestion[][] = [];
  let current: QuizQuestion[] = [];
  let chars = 0;
  const limit = () => (batches.length === 0 ? firstSize : size);
  for (const q of questions) {
    const len = q.question.length + q.options.join('').length + q.explanation.length + q.topic.length;
    if (current.length > 0 && (current.length >= limit() || chars + len > maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(q);
    chars += len;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// ---------------- Gọi AI ----------------

export class TranslateError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

/** Dịch một lô. Trả về các câu dịch được, khoá theo cacheKey. Câu nào AI trả thiếu/hỏng sẽ không có trong kết quả. */
export async function translateBatch(questions: QuizQuestion[], target: Lang): Promise<Record<string, TranslatedQuestion>> {
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        target,
        // id theo vị trí trong lô: không phụ thuộc id gốc (có thể trùng giữa các nguồn)
        items: questions.map((q, i) => ({
          id: String(i),
          question: q.question,
          options: q.options,
          explanation: q.explanation,
          topic: q.topic,
        })),
      }),
    });
  } catch {
    throw new TranslateError('Không kết nối được tới máy chủ dịch.', true);
  }

  const data: unknown = await response.json().catch(() => null);
  const body = (data ?? {}) as { items?: unknown; error?: unknown };
  if (!response.ok || !Array.isArray(body.items)) {
    const message = typeof body.error === 'string' ? body.error : `Lỗi máy chủ (${response.status}).`;
    // Chưa deploy function (404), thiếu khoá AI (503), dữ liệu sai (400/401/403): thử lại cũng vô ích.
    throw new TranslateError(message, ![400, 401, 403, 404, 503].includes(response.status));
  }

  const out: Record<string, TranslatedQuestion> = {};
  for (const raw of body.items as (Partial<TranslatedQuestion> & { id?: unknown })[]) {
    const idx = typeof raw?.id === 'string' ? Number(raw.id) : NaN;
    const original = Number.isInteger(idx) ? questions[idx] : undefined;
    if (!original || !isTranslated(raw) || raw.options.length !== original.options.length) continue;
    out[cacheKey(target, original)] = {
      question: raw.question,
      options: raw.options,
      explanation: raw.explanation,
      topic: raw.topic || original.topic,
    };
  }
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface TranslateAllResult {
  translated: number;
  failed: number;
  error: string | null;
}

/**
 * Dịch các câu còn thiếu theo từng lô (2 lô chạy song song). Mỗi lô xong thì gọi onBatch ngay
 * để giao diện hiện bản dịch sớm. Thử lại 1 lần với lỗi tạm thời.
 */
export async function translateAll(
  questions: QuizQuestion[],
  target: Lang,
  onBatch: (entries: Record<string, TranslatedQuestion>) => void,
  isCancelled: () => boolean = () => false,
): Promise<TranslateAllResult> {
  const batches = planBatches(questions);
  const result: TranslateAllResult = { translated: 0, failed: 0, error: null };
  let next = 0;

  const worker = async () => {
    for (;;) {
      if (isCancelled()) return;
      const i = next++;
      if (i >= batches.length) return;
      const batch = batches[i];
      let entries: Record<string, TranslatedQuestion> | null = null;
      for (let attempt = 0; attempt < 2 && entries === null; attempt++) {
        try {
          entries = await translateBatch(batch, target);
        } catch (err) {
          const e = err as TranslateError;
          result.error = e.message || 'Không dịch được.';
          if (!e.retryable) break;
          await sleep(2000);
        }
      }
      const got = entries ?? {};
      const count = Object.keys(got).length;
      if (count > 0) {
        writeCache(got);
        onBatch(got);
      }
      result.translated += count;
      result.failed += batch.length - count;
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, batches.length) }, worker));
  if (result.failed === 0) result.error = null;
  return result;
}

/** Ghép bản dịch lên câu hỏi gốc; id và đáp án đúng giữ nguyên nên kết quả làm bài không bị ảnh hưởng. */
export function applyTranslation(q: QuizQuestion, t: TranslatedQuestion | undefined): QuizQuestion {
  if (!t || t.options.length !== q.options.length) return q;
  // optionExplanations (ngôn ngữ gốc) cố ý bị bỏ: AI sẽ phân tích lại bằng ngôn ngữ đang hiển thị.
  return { ...q, question: t.question, options: t.options, explanation: t.explanation, topic: t.topic, optionExplanations: undefined };
}
