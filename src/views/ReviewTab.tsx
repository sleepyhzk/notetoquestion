import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Trash2, Target, RefreshCw, NotebookPen, Star } from 'lucide-react';
import type { WrongAnswer, Note } from '../types';
import { NOTE_CATEGORIES } from '../types';
import { ReviewQuestionCard, type GoneReason } from '../components/ReviewQuestionCard';
import { countReview, isStarred, isWrong, snapshotOfItem, type QuestionSnapshot } from '../utils/review';
import { buildQuestionPrompt } from '../utils/askAI';
import { useAskAI } from '../context/AskAI';

interface ReviewTabProps {
  subjectId: string;
  wrongAnswers: WrongAnswer[];
  notes: Note[];
  reviewSelections: string[];
  onAddWrongAnswers: (subjectId: string, wrongs: WrongAnswer[]) => void;
  onResolveWrongAnswers: (subjectId: string, questionIds: string[]) => void;
  onToggleStar: (subjectId: string, snapshot: QuestionSnapshot, starred: boolean) => void;
  onRemoveWrongAnswer: (subjectId: string, questionId: string) => void;
  onClearWrongAnswers: (subjectId: string) => void;
  onToggleReviewSelection: (subjectId: string, noteId: string) => void;
}

type Filter = 'all' | 'wrong' | 'starred';

/** Câu đã rời danh sách trong lần xem này nhưng vẫn hiện để đọc kết quả. `index` = vị trí cũ để không nhảy lung tung. */
interface Gone {
  item: WrongAnswer;
  index: number;
  reason: GoneReason;
}

export function ReviewTab({
  subjectId,
  wrongAnswers,
  notes,
  reviewSelections,
  onAddWrongAnswers,
  onResolveWrongAnswers,
  onToggleStar,
  onRemoveWrongAnswer,
  onClearWrongAnswers,
  onToggleReviewSelection,
}: ReviewTabProps) {
  const askAI = useAskAI();
  const [filter, setFilter] = useState<Filter>('all');
  const [answers, setAnswers] = useState<Record<string, number>>({}); // đáp án đã chọn trong lần xem này
  const [gone, setGone] = useState<Record<string, Gone>>({});

  const counts = countReview(wrongAnswers);

  // Danh sách hiển thị = danh sách hiện tại + các câu vừa rời đi (chèn lại đúng vị trí cũ).
  const display = useMemo(() => {
    const present = new Set(wrongAnswers.map((w) => w.questionId));
    const rows: { item: WrongAnswer; gone: GoneReason | null }[] = wrongAnswers.map((item) => ({ item, gone: null }));
    const leftovers = Object.values(gone)
      .filter((g) => !present.has(g.item.questionId))
      .sort((a, b) => a.index - b.index);
    for (const g of leftovers) rows.splice(Math.min(g.index, rows.length), 0, { item: g.item, gone: g.reason });
    return rows.filter(({ item, gone: reason }) => {
      if (filter === 'all') return true;
      if (filter === 'starred') return isStarred(item) && !reason;
      return reason ? reason === 'correct' : isWrong(item);
    });
  }, [wrongAnswers, gone, filter]);

  const positionOf = (id: string) => Math.max(0, wrongAnswers.findIndex((w) => w.questionId === id));

  const handleAnswer = (item: WrongAnswer, optionIndex: number) => {
    if (answers[item.questionId] !== undefined) return;
    setAnswers((prev) => ({ ...prev, [item.questionId]: optionIndex }));
    if (optionIndex === item.correctIndex) {
      // Làm đúng: câu sai bị bỏ khỏi danh sách, câu gắn sao ở lại.
      if (!isStarred(item)) {
        setGone((prev) => ({ ...prev, [item.questionId]: { item, index: positionOf(item.questionId), reason: 'correct' } }));
      }
      onResolveWrongAnswers(subjectId, [item.questionId]);
    } else {
      onAddWrongAnswers(subjectId, [{ ...item, selectedIndex: optionIndex }]); // tăng số lần sai
    }
  };

  const retry = (id: string) =>
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const handleToggleStar = (item: WrongAnswer, isGone: GoneReason | null) => {
    const snap = snapshotOfItem(item);
    if (isGone) {
      // Thẻ của câu vừa rời danh sách (làm đúng / bỏ sao): bấm sao = gắn sao lại để đưa câu về danh sách.
      setGone((prev) => {
        const next = { ...prev };
        delete next[item.questionId];
        return next;
      });
      onToggleStar(subjectId, snap, true);
      return;
    }
    const currentlyStarred = isStarred(item);
    // Bỏ sao một câu không còn sai => câu sẽ rời danh sách: giữ lại thẻ một lúc để người dùng còn hoàn tác.
    if (currentlyStarred && !isWrong(item)) {
      setGone((prev) => ({
        ...prev,
        [item.questionId]: { item: { ...item, starred: false }, index: positionOf(item.questionId), reason: 'unstarred' },
      }));
    }
    onToggleStar(subjectId, snap, !currentlyStarred);
  };

  const dismiss = (id: string) =>
    setGone((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const chip = (value: Filter, label: string, count: number) => (
    <button
      key={value}
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        filter === value
          ? 'bg-primary-600 text-white'
          : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
      }`}
    >
      {label} ({count})
    </button>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Danh sách cần ôn tập: làm trực tiếp tại đây */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Cần ôn tập</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {counts.total > 0
                  ? `${counts.total} câu · ${counts.wrong} câu sai · ${counts.starred} gắn sao`
                  : 'Chưa có câu nào cần ôn'}
              </p>
            </div>
          </div>
          {counts.wrong > 0 && (
            <button
              onClick={() => {
                if (window.confirm(`Xóa ${counts.wrong} câu sai khỏi danh sách? Các câu đã gắn sao vẫn được giữ lại.`)) {
                  onClearWrongAnswers(subjectId);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Xóa câu sai
            </button>
          )}
        </div>

        {counts.total > 0 && (
          <>
            <div className="flex flex-wrap gap-2 mb-2">
              {chip('all', 'Tất cả', counts.total)}
              {chip('wrong', 'Câu sai', counts.wrong)}
              {chip('starred', '⭐ Gắn sao', counts.starred)}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Chọn đáp án để làm ngay. Làm đúng thì câu sai được bỏ khỏi danh sách; câu có <Star className="inline w-3 h-3 fill-amber-400 text-amber-400 -mt-0.5" /> vẫn ở lại cho tới khi bạn bỏ sao.
            </p>
          </>
        )}

        {display.length === 0 ? (
          <div className="card p-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-accent-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {counts.total === 0
                ? 'Chưa có câu nào. Câu làm sai sẽ tự vào đây, và bạn có thể bấm ⭐ ở bất kỳ câu nào khi làm trắc nghiệm để giữ lại ôn tập.'
                : filter === 'starred'
                ? 'Chưa có câu nào gắn sao. Bấm ⭐ ở câu hỏi để giữ lại ôn tập.'
                : 'Không có câu nào trong mục này.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {display.map(({ item, gone: reason }, rowIndex) => (
              <ReviewQuestionCard
                key={item.questionId}
                item={item}
                index={rowIndex}
                selected={answers[item.questionId] ?? null}
                gone={reason}
                onAnswer={(i) => handleAnswer(item, i)}
                onRetry={() => retry(item.questionId)}
                onToggleStar={() => handleToggleStar(item, reason)}
                onAskAI={() =>
                  askAI(
                    buildQuestionPrompt(item, {
                      answered: answers[item.questionId] !== undefined,
                      selectedIndex: answers[item.questionId] ?? null,
                    }),
                  )
                }
                onRemove={() => onRemoveWrongAnswer(subjectId, item.questionId)}
                onDismiss={() => dismiss(item.questionId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Review selection section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-lg bg-accent-50 dark:bg-accent-950/40 flex items-center justify-center">
            <Target className="w-5 h-5 text-accent-600 dark:text-accent-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Chọn ghi chú để ôn tập</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Tích chọn các ghi chú → hệ thống sinh quiz theo chủ đề đó
            </p>
          </div>
        </div>

        {notes.length === 0 ? (
          <div className="card p-6 text-center">
            <NotebookPen className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Chưa có ghi chú nào. Hãy tạo ghi chú ở tab "Ghi chú" rồi quay lại đây để chọn ôn tập.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => {
              const isSelected = reviewSelections.includes(note.id);
              const cat = NOTE_CATEGORIES.find((c) => c.value === note.category);
              return (
                <button
                  key={note.id}
                  onClick={() => onToggleReviewSelection(subjectId, note.id)}
                  className={`w-full card p-3 text-left flex items-center gap-3 transition-all ${
                    isSelected ? 'border-accent-400 dark:border-accent-600 bg-accent-50/30 dark:bg-accent-950/20' : ''
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected
                      ? 'border-accent-500 bg-accent-500'
                      : 'border-gray-300 dark:border-slate-600'
                  }`}>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium truncate">{note.title}</span>
                      {cat && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cat.color}`}>
                          {cat.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-1">
                      {note.content.slice(0, 80) || '(trống)'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tip */}
      <div className="card p-4 bg-primary-50/50 dark:bg-primary-950/20 border-primary-200 dark:border-primary-900">
        <div className="flex items-start gap-2.5">
          <RefreshCw className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-primary-700 dark:text-primary-300 leading-relaxed">
            Mẹo: Sau khi tích chọn ghi chú, chuyển sang tab "Trắc nghiệm" và chọn "Ôn theo ghi chú đã chọn" để làm quiz sinh theo chủ đề bạn muốn.
          </p>
        </div>
      </div>
    </div>
  );
}
