import { useEffect, useState } from 'react';
import {
  explainKey,
  fetchExplanation,
  isValidDetails,
  readExplainCache,
  writeExplainCache,
  type DetailedExplanation,
  type ExplainInput,
} from '../utils/explain';
import type { Lang } from '../utils/language';

/**
 * Cung cấp phần giải thích từng đáp án cho một câu hỏi:
 *  1. Câu đã có sẵn optionExplanations (tạo bằng AI lúc sinh bộ câu hỏi) -> dùng ngay.
 *  2. Đã từng hỏi AI -> lấy từ bộ nhớ trên máy.
 *  3. Chưa có -> hỏi AI một lần rồi lưu lại.
 */
export function useDetailedExplanation(q: ExplainInput, lang: Lang) {
  const key = explainKey(lang, q);
  const stored = isValidDetails(q.optionExplanations, q.options.length) ? q.optionExplanations : null;

  const [fetched, setFetched] = useState<Record<string, DetailedExplanation>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (stored) {
      setLoading(false);
      setError(null);
      return;
    }
    const cached = readExplainCache(key, q.options.length);
    if (cached) {
      setFetched((prev) => ({ ...prev, [key]: cached }));
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchExplanation(q, lang)
      .then((result) => {
        if (cancelled) return;
        writeExplainCache(key, result);
        setFetched((prev) => ({ ...prev, [key]: result }));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Không phân tích được.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // q/lang đã được phản ánh trong `key`; chỉ chạy lại khi câu hỏi (key) hoặc nút "Thử lại" thay đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stored, retryCount]);

  const data: DetailedExplanation | null = stored
    ? { explanation: q.explanation, optionExplanations: stored }
    : fetched[key] ?? null;

  return { data, loading, error, retry: () => setRetryCount((n) => n + 1) };
}
