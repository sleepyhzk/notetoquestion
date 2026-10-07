import { Bot, CheckCircle2, RotateCcw, Star, Trash2, X, XCircle } from 'lucide-react';
import type { WrongAnswer } from '../types';
import { isStarred } from '../utils/review';
import { AnswerExplanation } from './AnswerExplanation';

export type GoneReason = 'correct' | 'unstarred';

interface ReviewQuestionCardProps {
  item: WrongAnswer;
  index: number;
  /** Đáp án người dùng vừa chọn trong lần xem này (null = chưa làm). */
  selected: number | null;
  /** Câu đã rời danh sách (làm đúng / bỏ sao) nhưng vẫn hiện lại để người dùng đọc kết quả. */
  gone: GoneReason | null;
  onAnswer: (optionIndex: number) => void;
  onRetry: () => void;
  onToggleStar: () => void;
  onAskAI: () => void;
  onRemove: () => void;
  onDismiss: () => void;
}

export function ReviewQuestionCard({
  item,
  index,
  selected,
  gone,
  onAnswer,
  onRetry,
  onToggleStar,
  onAskAI,
  onRemove,
  onDismiss,
}: ReviewQuestionCardProps) {
  const answered = selected !== null;
  const correct = answered && selected === item.correctIndex;
  const starred = isStarred(item) && gone !== 'unstarred';

  return (
    <div className={`card p-4 transition-opacity ${gone ? 'opacity-90' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 text-xs text-gray-500 dark:text-gray-400">
              {item.topic}
            </span>
            {item.wrong !== false && !gone && (
              <span className="inline-block px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-600 dark:text-rose-400">
                Sai {Math.max(item.attempts ?? 1, 1)} lần
              </span>
            )}
            {starred && (
              <span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-700 dark:text-amber-300">
                Đã gắn sao
              </span>
            )}
          </div>
          <p className="text-sm font-medium leading-relaxed">{item.question}</p>
        </div>
        <button
          onClick={onToggleStar}
          aria-pressed={starred}
          aria-label={starred ? 'Bỏ sao' : 'Gắn sao'}
          title={starred ? 'Bỏ sao: câu rời danh sách nếu không còn sai' : 'Gắn sao: giữ câu này trong danh sách ôn tập'}
          className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors flex-shrink-0"
        >
          <Star className={`w-5 h-5 transition-colors ${starred ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} />
        </button>
      </div>

      <div className="mt-3 sm:ml-10 space-y-2">
        {item.options.map((opt, i) => {
          const isCorrect = i === item.correctIndex;
          const isPicked = selected === i;
          let style =
            'border-gray-200 dark:border-slate-800 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/40 dark:hover:bg-primary-950/30';
          if (answered) {
            if (isCorrect) style = 'border-accent-500 bg-accent-50 text-accent-900 dark:bg-accent-950/70 dark:text-accent-50';
            else if (isPicked) style = 'border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950/70 dark:text-rose-50';
            else style = 'border-gray-200 dark:border-slate-800 opacity-70';
          }
          return (
            <button
              key={i}
              onClick={() => onAnswer(i)}
              disabled={answered || !!gone}
              className={`w-full text-left p-2.5 rounded-xl border-2 text-sm flex items-center gap-2.5 transition-all ${style} ${
                answered || gone ? 'cursor-default' : ''
              }`}
            >
              <span className="w-6 h-6 rounded-md bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1">{opt}</span>
              {answered && isCorrect && <CheckCircle2 className="w-4 h-4 text-accent-500 flex-shrink-0" />}
              {answered && isPicked && !isCorrect && <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="mt-3 sm:ml-10 space-y-2 animate-scale-in">
          <div
            className={`p-3 rounded-lg text-xs font-medium ${
              correct
                ? 'bg-accent-50 text-accent-800 dark:bg-accent-950/50 dark:text-accent-200'
                : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
            }`}
          >
            {correct
              ? starred
                ? 'Chính xác! Câu này được giữ lại trong danh sách vì bạn đã gắn sao.'
                : 'Chính xác! Câu này đã được bỏ khỏi danh sách cần ôn.'
              : 'Chưa đúng. Câu này vẫn ở trong danh sách, hãy xem giải thích rồi làm lại.'}
          </div>
          <AnswerExplanation q={{ ...item, id: item.questionId }} selectedIndex={selected} />
          <div className="flex items-center gap-3">
            {!correct && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Làm lại câu này
              </button>
            )}
            {gone && (
              <button onClick={onDismiss} className="flex items-center gap-1.5 text-xs text-gray-500 hover:underline ml-auto">
                <X className="w-3.5 h-3.5" /> Ẩn câu này
              </button>
            )}
          </div>
        </div>
      )}

      {gone === 'unstarred' && !answered && (
        <div className="mt-3 sm:ml-10 flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800/60 text-xs text-gray-600 dark:text-gray-300">
          <span className="flex-1">Đã bỏ sao: câu này đã rời khỏi danh sách ôn tập.</span>
          <button onClick={onToggleStar} className="font-medium text-amber-600 dark:text-amber-400 hover:underline">
            Gắn lại sao
          </button>
          <button onClick={onDismiss} className="text-gray-500 hover:underline">
            Ẩn
          </button>
        </div>
      )}

      <div className="mt-3 sm:ml-10 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          onClick={onAskAI}
          className="flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          <Bot className="w-3.5 h-3.5" />
          Hỏi AI về câu này
        </button>
        {!gone && (
          <button
            onClick={onRemove}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-rose-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Đã thuộc — xóa khỏi danh sách
          </button>
        )}
      </div>
    </div>
  );
}
