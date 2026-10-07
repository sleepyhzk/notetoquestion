import { AlertCircle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useDetailedExplanation } from '../hooks/useDetailedExplanation';
import type { ExplainInput } from '../utils/explain';
import { detectLang, questionText } from '../utils/language';

interface AnswerExplanationProps {
  q: ExplainInput;
  /** Đáp án người dùng đã chọn (null nếu không rõ). */
  selectedIndex: number | null;
}

/** Giải thích sau khi trả lời: ý chính + vì sao đáp án đúng đúng và TỪNG đáp án còn lại sai. */
export function AnswerExplanation({ q, selectedIndex }: AnswerExplanationProps) {
  // Phân tích bằng đúng ngôn ngữ của câu hỏi đang hiển thị (gốc hoặc bản dịch).
  const lang = detectLang(questionText(q));
  const { data, loading, error, retry } = useDetailedExplanation(q, lang);
  const summary = data?.explanation || q.explanation;

  return (
    <div className="mt-4 space-y-3 animate-scale-in">
      {summary && (
        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Giải thích</p>
              <p className="text-sm text-blue-900 dark:text-blue-200 leading-relaxed">{summary}</p>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 px-1 text-xs text-gray-500 dark:text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Đang phân tích từng đáp án…
        </div>
      )}

      {!loading && error && !data && (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-amber-600 dark:text-amber-400">
          Chưa phân tích được từng đáp án: {error}
          <button onClick={retry} className="underline font-medium">
            Thử lại
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Phân tích từng đáp án</p>
          {q.options.map((option, i) => {
            const isCorrect = i === q.correctIndex;
            const isPicked = selectedIndex === i;
            const tone = isCorrect
              ? 'border-accent-300 bg-accent-50 dark:border-accent-900 dark:bg-accent-950/40'
              : isPicked
              ? 'border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40'
              : 'border-gray-200 bg-gray-50 dark:border-slate-800 dark:bg-slate-900/60';
            const badge = isCorrect
              ? 'bg-accent-500 text-white'
              : isPicked
              ? 'bg-rose-500 text-white'
              : 'bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-gray-300';
            return (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${tone}`}>
                <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${badge}`}>
                  {String.fromCharCode(65 + i)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium">
                    <span className="break-words">{option}</span>
                    {isCorrect && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-700 dark:text-accent-300">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đáp án đúng
                      </span>
                    )}
                    {!isCorrect && isPicked && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                        <XCircle className="w-3.5 h-3.5" /> Bạn đã chọn — sai
                      </span>
                    )}
                    {!isCorrect && !isPicked && <span className="text-xs text-gray-400">Sai</span>}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{data.optionExplanations[i]}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
