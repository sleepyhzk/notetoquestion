import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Brain,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronRight,
  Trophy,
  AlertCircle,
  Target,
  Loader2,
  Sparkles,
  Square,
  CheckSquare,
  Info,
  Play,
  Trash2,
  ArrowLeft,
  Languages,
  Star,
  ChevronDown,
  Bot,
} from 'lucide-react';
import type {
  QuizQuestion,
  QuizResult,
  QuizSession,
  SavedQuiz,
  WrongAnswer,
  Note,
} from '../types';
import { quizBank } from '../data/quizBank';
import { generateQuizFromNotes } from '../utils/quizGenerator';
import { questionId } from '../utils/ids';
import { snapshotOf, type QuestionSnapshot } from '../utils/review';
import { buildQuestionPrompt } from '../utils/askAI';
import { AnswerExplanation } from '../components/AnswerExplanation';
import { useAskAI } from '../context/AskAI';
import { chunkNotes, questionCeiling, type NoteChunk } from '../utils/chunkNotes';
import { detectLang, dominantLang, questionText, type Lang } from '../utils/language';
import { applyTranslation, cacheKey, readCache, translateAll, type TranslatedQuestion } from '../utils/translate';

interface QuizTabProps {
  subjectId: string;
  notes: Note[];
  wrongAnswers: WrongAnswer[];
  quizHistory: QuizSession[];
  reviewSelections: string[];
  savedQuizzes: SavedQuiz[];
  onSaveQuiz: (subjectId: string, quiz: SavedQuiz) => void;
  onDeleteSavedQuiz: (subjectId: string, quizId: string) => void;
  onAddQuizSession: (subjectId: string, session: QuizSession) => void;
  onAddWrongAnswers: (subjectId: string, wrongs: WrongAnswer[]) => void;
  onResolveWrongAnswers: (subjectId: string, questionIds: string[]) => void;
  onToggleStar: (subjectId: string, snapshot: QuestionSnapshot, starred: boolean) => void;
}

type QuizMode = 'menu' | 'taking' | 'result';
type QuizKind = 'bank' | 'saved' | 'review' | 'focus';
type Notice = { tone: 'info' | 'warn'; text: string };

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---- Lưu tiến trình làm bài: tải lại trang hay thoát ra vẫn làm tiếp được ----
interface StoredProgress {
  kind: QuizKind;
  savedId: string | null;
  questions: QuizQuestion[];
  currentIdx: number;
  answers: QuizResult[];
  selectedOption: number | null;
  showExplanation: boolean;
  savedAt: number;
}

const progressKey = (subjectId: string) => `kien-thuc-quiz-progress-v1:${subjectId}`;

function loadProgress(subjectId: string): StoredProgress | null {
  try {
    const raw = localStorage.getItem(progressKey(subjectId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredProgress>;
    if (
      !p ||
      !Array.isArray(p.questions) ||
      p.questions.length === 0 ||
      !p.questions.every((q) => q && typeof q.question === 'string' && Array.isArray(q.options) && typeof q.correctIndex === 'number') ||
      typeof p.currentIdx !== 'number' ||
      p.currentIdx < 0 ||
      p.currentIdx >= p.questions.length ||
      !Array.isArray(p.answers)
    ) {
      return null;
    }
    return {
      kind: (['bank', 'saved', 'review', 'focus'] as const).includes(p.kind as QuizKind) ? (p.kind as QuizKind) : 'bank',
      savedId: typeof p.savedId === 'string' ? p.savedId : null,
      questions: p.questions,
      currentIdx: p.currentIdx,
      answers: p.answers,
      selectedOption: typeof p.selectedOption === 'number' ? p.selectedOption : null,
      showExplanation: p.showExplanation === true,
      savedAt: typeof p.savedAt === 'number' ? p.savedAt : 0,
    };
  } catch {
    return null;
  }
}

function saveProgress(subjectId: string, progress: StoredProgress) {
  try {
    localStorage.setItem(progressKey(subjectId), JSON.stringify(progress));
  } catch {
    // đầy bộ nhớ: bỏ qua, chỉ mất khả năng làm tiếp
  }
}

function clearProgress(subjectId: string) {
  try {
    localStorage.removeItem(progressKey(subjectId));
  } catch {
    // bỏ qua
  }
}

const formatDateTime = (ts: number) => new Date(ts).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

/** Chuyển câu hỏi từ máy chủ thành QuizQuestion (bỏ câu sai định dạng). */
function mapServerQuestions(items: unknown[]): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  for (const raw of items as Partial<QuizQuestion>[]) {
    if (
      typeof raw?.question !== 'string' ||
      !Array.isArray(raw.options) ||
      raw.options.length < 2 ||
      typeof raw.correctIndex !== 'number' ||
      raw.correctIndex < 0 ||
      raw.correctIndex >= raw.options.length
    ) {
      continue;
    }
    out.push({
      // ID theo nội dung: cùng câu hỏi => cùng ID, khác câu hỏi => khác ID.
      id: questionId('ai', raw.question, raw.options as string[], raw.correctIndex),
      topic: 'Từ ghi chú',
      question: raw.question,
      options: raw.options as string[],
      correctIndex: raw.correctIndex,
      explanation: typeof raw.explanation === 'string' ? raw.explanation : '',
      optionExplanations:
        Array.isArray(raw.optionExplanations) &&
        raw.optionExplanations.length === raw.options.length &&
        raw.optionExplanations.every((o) => typeof o === 'string' && o.trim())
          ? raw.optionExplanations
          : undefined,
    });
  }
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Nhờ AI tạo câu hỏi bao quát một phần ghi chú. Thử lại 1 lần nếu lỗi tạm thời. */
async function fetchChunkQuestions(chunk: NoteChunk): Promise<{ questions: QuizQuestion[] } | { error: string }> {
  let lastError = 'AI không phản hồi.';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ notesContent: chunk.aiText, maxQuestions: questionCeiling(chunk.chars) }),
      });
      const data: unknown = await response.json().catch(() => null);
      const body = (data ?? {}) as { questions?: unknown; error?: unknown };
      if (response.ok && Array.isArray(body.questions)) {
        const questions = mapServerQuestions(body.questions);
        if (questions.length > 0) return { questions };
        lastError = 'AI trả về câu hỏi không hợp lệ.';
      } else {
        lastError = typeof body.error === 'string' ? body.error : `Lỗi máy chủ (${response.status}).`;
        // Lỗi cấu hình / dữ liệu: thử lại cũng vô ích.
        if ([400, 401, 403, 404, 503].includes(response.status)) break;
      }
    } catch {
      lastError = 'Không kết nối được tới máy chủ AI.';
    }
    await sleep(2000);
  }
  return { error: lastError };
}

export function QuizTab({
  subjectId,
  notes,
  wrongAnswers,
  quizHistory,
  reviewSelections,
  savedQuizzes,
  onSaveQuiz,
  onDeleteSavedQuiz,
  onAddQuizSession,
  onAddWrongAnswers,
  onResolveWrongAnswers,
  onToggleStar,
}: QuizTabProps) {
  const [mode, setMode] = useState<QuizMode>('menu');
  const [currentQuestions, setCurrentQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<QuizResult[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [showCreator, setShowCreator] = useState(false); // mặc định đóng mỗi lần vào tab
  // Ghi chú bị bỏ chọn (mặc định rỗng = dùng tất cả; ghi chú mới tạo tự được tính vào).
  const [excludedNoteIds, setExcludedNoteIds] = useState<string[]>([]);
  const lastKind = useRef<QuizKind>('bank'); // để nút "Làm lại" chạy đúng chế độ vừa làm
  const lastSavedId = useRef<string | null>(null); // bộ câu hỏi đã lưu đang làm, để "Làm lại" đúng bộ đó
  const [resume, setResume] = useState<StoredProgress | null>(() => loadProgress(subjectId));
  const askAI = useAskAI();

  // ---- Đổi ngôn ngữ câu hỏi (Việt <-> Anh) ----
  const [lang, setLang] = useState<Lang>('vi');
  const [translations, setTranslations] = useState<Record<string, TranslatedQuestion>>({});
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [translateRetry, setTranslateRetry] = useState(0);
  const translateRun = useRef(0);
  const currentIdxRef = useRef(0);

  const availableQuestions = useMemo(() => quizBank[subjectId] ?? [], [subjectId]);

  const quizNotes = useMemo(
    () => notes.filter((n) => !excludedNoteIds.includes(n.id) && n.content.trim().length > 0),
    [notes, excludedNoteIds],
  );

  const creatorOpen = showCreator || generating; // đang tạo thì giữ mở để thấy tiến độ
  const quizChars = useMemo(() => quizNotes.reduce((sum, n) => sum + n.content.trim().length, 0), [quizNotes]);

  const toggleQuizNote = (noteId: string) =>
    setExcludedNoteIds((prev) => (prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId]));

  const selectedReviewNotes = useMemo(
    () => notes.filter((n) => reviewSelections.includes(n.id)),
    [notes, reviewSelections],
  );

  // Lưu tiến trình sau mỗi thao tác khi đang làm bài; làm xong thì xoá.
  useEffect(() => {
    if (mode === 'taking' && currentQuestions.length > 0) {
      saveProgress(subjectId, {
        kind: lastKind.current,
        savedId: lastSavedId.current,
        questions: currentQuestions,
        currentIdx,
        answers,
        selectedOption,
        showExplanation,
        savedAt: Date.now(),
      });
    } else if (mode === 'result') {
      clearProgress(subjectId);
    }
  }, [mode, currentQuestions, currentIdx, answers, selectedOption, showExplanation, subjectId]);

  // Mỗi lần về menu, kiểm tra có bài làm dở để hiện nút "Làm tiếp".
  useEffect(() => {
    if (mode === 'menu') setResume(loadProgress(subjectId));
  }, [mode, subjectId]);

  /** Nếu đang có bài làm dở mà bắt đầu bài mới thì hỏi trước, tránh mất tiến trình ngoài ý muốn. */
  const confirmDiscardProgress = useCallback((): boolean => {
    if (!loadProgress(subjectId)) return true;
    const ok = window.confirm('Bạn đang làm dở một bài. Bắt đầu bài mới sẽ bỏ tiến trình của bài đó.\n\nTiếp tục?');
    if (ok) {
      clearProgress(subjectId);
      setResume(null);
    }
    return ok;
  }, [subjectId]);

  const resumeQuiz = useCallback(() => {
    const p = loadProgress(subjectId);
    if (!p) {
      setResume(null);
      return;
    }
    lastKind.current = p.kind;
    lastSavedId.current = p.savedId;
    setLang(dominantLang(p.questions));
    setCurrentQuestions(p.questions);
    setCurrentIdx(p.currentIdx);
    setAnswers(p.answers);
    setSelectedOption(p.selectedOption);
    setShowExplanation(p.showExplanation);
    setMode('taking');
  }, [subjectId]);

  const discardProgress = useCallback(() => {
    if (!window.confirm('Bỏ bài đang làm dở? Tiến trình sẽ bị xoá.')) return;
    clearProgress(subjectId);
    setResume(null);
  }, [subjectId]);

  currentIdxRef.current = currentIdx;

  // Khi đổi ngôn ngữ: câu nào đang khác ngôn ngữ đích thì dùng bản dịch đã lưu, thiếu thì nhờ AI dịch
  // (ưu tiên câu đang làm và các câu kế tiếp). Chuyển qua lại sau đó là tức thì vì bản dịch được lưu.
  useEffect(() => {
    if (mode !== 'taking' || currentQuestions.length === 0) {
      setTranslating(false);
      return;
    }
    const needed = currentQuestions.filter((q) => detectLang(questionText(q)) !== lang);
    if (needed.length === 0) {
      setTranslating(false);
      setTranslateError(null);
      return;
    }
    const cached = readCache(needed.map((q) => cacheKey(lang, q)));
    if (Object.keys(cached).length > 0) setTranslations((prev) => ({ ...prev, ...cached }));
    const total = currentQuestions.length;
    const start = currentIdxRef.current;
    const missing = needed
      .filter((q) => !cached[cacheKey(lang, q)])
      .sort((a, b) => ((currentQuestions.indexOf(a) - start + total) % total) - ((currentQuestions.indexOf(b) - start + total) % total));
    if (missing.length === 0) {
      setTranslating(false);
      setTranslateError(null);
      return;
    }

    const run = ++translateRun.current;
    setTranslating(true);
    setTranslateError(null);
    void translateAll(
      missing,
      lang,
      (entries) => {
        if (translateRun.current === run) setTranslations((prev) => ({ ...prev, ...entries }));
      },
      () => translateRun.current !== run,
    ).then((result) => {
      if (translateRun.current !== run) return;
      setTranslating(false);
      setTranslateError(result.failed > 0 ? result.error ?? 'Không dịch được một số câu.' : null);
    });
    return () => {
      translateRun.current++; // huỷ lượt dịch cũ khi đổi ngôn ngữ / thoát bài
    };
  }, [mode, currentQuestions, lang, translateRetry]);

  const beginQuiz = useCallback((questions: QuizQuestion[], kind: QuizKind, savedId: string | null = null) => {
    lastKind.current = kind;
    lastSavedId.current = savedId;
    setLang(dominantLang(questions));
    setCurrentQuestions(questions);
    setCurrentIdx(0);
    setAnswers([]);
    setSelectedOption(null);
    setShowExplanation(false);
    setMode('taking');
  }, []);

  const startReviewQuiz = useCallback(() => {
    if (wrongAnswers.length === 0) return;
    const reviewQuestions: QuizQuestion[] = wrongAnswers.map((w) => ({
      id: w.questionId,
      question: w.question,
      options: w.options,
      correctIndex: w.correctIndex,
      explanation: w.explanation,
      topic: w.topic,
    }));
    if (!confirmDiscardProgress()) return;
    setNotice(null);
    beginQuiz(shuffleArray(reviewQuestions).slice(0, Math.min(10, reviewQuestions.length)), 'review');
  }, [wrongAnswers, beginQuiz, confirmDiscardProgress]);

  const startNotesQuiz = useCallback(async () => {
    if (!confirmDiscardProgress()) return;
    setNotice(null);
    // Chia ghi chú đã chọn thành các phần vừa phải; mỗi phần AI phải bao quát HẾT kiến thức của nó,
    // nên số câu hỏi tăng theo lượng ghi chú thay vì bị khoá ở một con số cố định.
    const chunks = chunkNotes(quizNotes);
    const totalChars = chunks.reduce((sum, c) => sum + c.chars, 0);
    if (totalChars < 50) {
      setNotice({
        tone: 'warn',
        text:
          quizNotes.length === 0
            ? 'Hãy chọn ít nhất một ghi chú có nội dung.'
            : 'Nội dung ghi chú quá ngắn (cần ít nhất ~50 ký tự) để sinh câu hỏi.',
      });
      return;
    }
    setGenerating(true);
    setProgress({ done: 0, total: chunks.length });

    const results: { questions: QuizQuestion[]; source: 'ai' | 'local' }[] = new Array(chunks.length);
    let aiError = '';
    let done = 0;
    let next = 0;

    // 2 phần chạy song song: nhanh hơn mà không dồn dập quá giới hạn tốc độ của AI
    const worker = async () => {
      for (;;) {
        const i = next++;
        if (i >= chunks.length) return;
        const chunk = chunks[i];
        const ai = await fetchChunkQuestions(chunk);
        if ('questions' in ai) {
          results[i] = { questions: ai.questions, source: 'ai' };
        } else {
          aiError = aiError || ai.error;
          // AI lỗi ở phần này: dùng bộ tạo trên máy để vẫn bao quát hết ghi chú
          results[i] = { questions: generateQuizFromNotes(chunk.localText, '', questionCeiling(chunk.chars)), source: 'local' };
        }
        done++;
        setProgress({ done, total: chunks.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, chunks.length) }, worker));

    const seen = new Set<string>();
    const merged: QuizQuestion[] = [];
    for (const r of results) {
      for (const q of r.questions) {
        const key = q.question.trim().toLowerCase();
        if (seen.has(key) || seen.has(q.id)) continue;
        seen.add(key);
        seen.add(q.id);
        merged.push(q);
      }
    }

    setGenerating(false);
    setProgress(null);
    if (merged.length === 0) {
      setNotice({
        tone: 'warn',
        text: 'Chưa sinh được câu hỏi nào từ ghi chú này. Hãy viết đầy đủ câu hơn, ví dụ "Stack là cấu trúc dữ liệu LIFO", rồi thử lại.',
      });
      return;
    }
    const localParts = results.filter((r) => r.source === 'local').length;
    if (localParts > 0) {
      setNotice({
        tone: 'info',
        text: `${localParts}/${chunks.length} phần được sinh tự động trên máy (không dùng AI)${aiError ? ` — ${aiError}` : ''}. Chất lượng phần đó có thể thấp hơn bản AI.`,
      });
    }
    // Lưu lại bộ câu hỏi để lần sau làm tiếp / làm lại mà không phải tạo lại (và không bị mất khi tải lại trang).
    const titles = quizNotes.map((n) => n.title.trim() || 'Ghi chú không tiêu đề');
    const saved: SavedQuiz = {
      id: `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: titles.length > 1 ? `${titles[0]} và ${titles.length - 1} ghi chú khác` : titles[0],
      createdAt: Date.now(),
      source: localParts === 0 ? 'ai' : localParts === chunks.length ? 'local' : 'mixed',
      noteTitles: titles,
      questions: merged,
    };
    onSaveQuiz(subjectId, saved);
    setShowCreator(false);
    beginQuiz(shuffleArray(merged), 'saved', saved.id);
  }, [quizNotes, beginQuiz, confirmDiscardProgress, onSaveQuiz, subjectId]);

  const startSavedQuiz = useCallback(
    (quiz: SavedQuiz) => {
      if (!confirmDiscardProgress()) return;
      setNotice(null);
      beginQuiz(shuffleArray(quiz.questions), 'saved', quiz.id);
    },
    [beginQuiz, confirmDiscardProgress],
  );

  const startFocusQuiz = useCallback(() => {
    const topicSet = new Set<string>();
    selectedReviewNotes.forEach((n) => {
      const words = n.title.toLowerCase().split(/\s+/);
      words.forEach((w) => topicSet.add(w));
    });
    const matched = availableQuestions.filter((q) => {
      const qText = (q.topic + ' ' + q.question).toLowerCase();
      return [...topicSet].some((t) => t.length > 2 && qText.includes(t));
    });
    const pool = matched.length >= 3 ? matched : availableQuestions;
    if (pool.length === 0) return;
    if (!confirmDiscardProgress()) return;
    setNotice(null);
    beginQuiz(shuffleArray(pool).slice(0, Math.min(10, pool.length)), 'focus');
  }, [availableQuestions, selectedReviewNotes, beginQuiz, confirmDiscardProgress]);

  const restart = useCallback(() => {
    switch (lastKind.current) {
      case 'saved': {
        // Làm lại đúng bộ câu hỏi đã lưu (xáo thứ tự), không gọi AI nữa
        const quiz = savedQuizzes.find((q) => q.id === lastSavedId.current);
        beginQuiz(shuffleArray(quiz ? quiz.questions : currentQuestions), 'saved', quiz ? quiz.id : null);
        break;
      }
      case 'review':
        startReviewQuiz();
        break;
      case 'focus':
        startFocusQuiz();
        break;
      default:
        // Bài làm dở từ phiên bản cũ (trắc nghiệm tổng hợp): làm lại đúng bộ câu đó
        beginQuiz(shuffleArray(currentQuestions), lastKind.current);
    }
  }, [startReviewQuiz, startFocusQuiz, beginQuiz, savedQuizzes, currentQuestions]);

  const handleAnswer = useCallback(() => {
    if (selectedOption === null) return;
    const q = currentQuestions[currentIdx];
    const isCorrect = selectedOption === q.correctIndex;
    const result: QuizResult = {
      questionId: q.id,
      selectedIndex: selectedOption,
      isCorrect,
    };
    setAnswers((prev) => [...prev, result]);
    setShowExplanation(true);
  }, [selectedOption, currentQuestions, currentIdx]);

  const handleNext = useCallback(() => {
    if (currentIdx + 1 >= currentQuestions.length) {
      // Finish quiz
      const finalAnswers = [...answers];
      const correct = finalAnswers.filter((a) => a.isCorrect).length;
      const wrongs: WrongAnswer[] = finalAnswers
        .filter((a) => !a.isCorrect)
        .map((a) => {
          const q = currentQuestions.find((qq) => qq.id === a.questionId)!;
          return {
            questionId: q.id,
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            selectedIndex: a.selectedIndex,
            explanation: q.explanation,
            topic: q.topic,
            optionExplanations: q.optionExplanations,
            addedAt: Date.now(),
            attempts: 1,
          };
        });
      if (wrongs.length > 0) {
        onAddWrongAnswers(subjectId, wrongs);
      }
      // Câu từng sai nay trả lời đúng => gỡ khỏi danh sách cần ôn (trừ câu được gắn sao: câu đó ở lại).
      const wrongIds = new Set(wrongAnswers.map((w) => w.questionId));
      const mastered = finalAnswers.filter((a) => a.isCorrect && wrongIds.has(a.questionId)).map((a) => a.questionId);
      onResolveWrongAnswers(subjectId, mastered);
      const session: QuizSession = {
        id: `session-${Date.now()}`,
        date: Date.now(),
        score: correct,
        total: currentQuestions.length,
        results: finalAnswers,
      };
      onAddQuizSession(subjectId, session);
      setMode('result');
    } else {
      setCurrentIdx((prev) => prev + 1);
      setSelectedOption(null);
      setShowExplanation(false);
    }
  }, [currentIdx, currentQuestions, answers, subjectId, wrongAnswers, onAddWrongAnswers, onResolveWrongAnswers, onAddQuizSession]);

  const score = answers.filter((a) => a.isCorrect).length;
  const total = currentQuestions.length;
  const currentQ = currentQuestions[currentIdx];
  // Câu đang hiển thị: bản dịch nếu câu gốc khác ngôn ngữ đang chọn và đã có bản dịch. id/đáp án đúng giữ nguyên.
  const shownQ =
    currentQ && detectLang(questionText(currentQ)) !== lang
      ? applyTranslation(currentQ, translations[cacheKey(lang, currentQ)])
      : currentQ;
  const currentStarred = !!currentQ && wrongAnswers.some((w) => w.questionId === currentQ.id && w.starred === true);
  const awaitingTranslation = !!currentQ && shownQ === currentQ && detectLang(questionText(currentQ)) !== lang;

  // Phím Space: đã chọn đáp án thì xác nhận; đã xem giải thích thì sang câu tiếp theo.
  // Chưa chọn gì thì để Space hoạt động như bình thường (không chặn cuộn trang).
  useEffect(() => {
    if (mode !== 'taking') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (!showExplanation && selectedOption === null) return;
      e.preventDefault(); // không cuộn trang
      if (e.repeat) return; // giữ phím không được nhảy nhiều câu liên tiếp
      // Bỏ focus khỏi nút đang chọn để Space không bấm nhầm nút đó (ví dụ nút sao, nút VI/EN)
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (showExplanation) handleNext();
      else handleAnswer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, showExplanation, selectedOption, handleNext, handleAnswer]);

  if (mode === 'taking' && currentQ) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <button
              onClick={() => setMode('menu')}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              title="Thoát ra menu, tiến trình được lưu để làm tiếp"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Thoát & lưu
            </button>
            <span className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Câu {currentIdx + 1} / {total}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-accent-600 dark:text-accent-400 font-medium">{score} đúng</span>
            <span className="text-gray-400">·</span>
            <span className="text-rose-500 font-medium">{answers.length - score} sai</span>
          </div>
        </div>

        <div className="w-full h-2 bg-gray-200 dark:bg-slate-800 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentIdx + (showExplanation ? 1 : 0)) / total) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 mb-3 min-h-[28px]">
          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 min-w-0">
            {translating && awaitingTranslation && (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                <span className="truncate">Đang dịch sang {lang === 'en' ? 'English' : 'tiếng Việt'}…</span>
              </>
            )}
            {translating && !awaitingTranslation && (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                <span className="truncate">Đang dịch các câu còn lại…</span>
              </>
            )}
            {!translating && translateError && awaitingTranslation && (
              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-2 flex-wrap">
                Không dịch được: {translateError} Đang hiện bản gốc.
                <button onClick={() => setTranslateRetry((n) => n + 1)} className="underline font-medium">
                  Thử lại
                </button>
              </span>
            )}
          </div>
          <div
            className="inline-flex items-center rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden text-xs flex-shrink-0"
            role="group"
            aria-label="Ngôn ngữ câu hỏi"
          >
            <span className="px-2 text-gray-400">
              <Languages className="w-3.5 h-3.5" />
            </span>
            {(['vi', 'en'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                title={l === 'vi' ? 'Tiếng Việt' : 'English'}
                className={`px-2.5 py-1.5 font-semibold transition-colors ${
                  lang === l ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800'
                }`}
              >
                {l === 'vi' ? 'VI' : 'EN'}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-5 sm:p-6 mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <span className="inline-block px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 text-xs font-medium">
              {shownQ.topic}
            </span>
            <div className="flex items-center gap-1 -mt-1 -mr-1 flex-shrink-0">
              <button
                onClick={() =>
                  askAI(
                    buildQuestionPrompt(
                      { question: shownQ.question, options: shownQ.options, correctIndex: currentQ.correctIndex, explanation: shownQ.explanation },
                      { answered: showExplanation, selectedIndex: selectedOption },
                    ),
                  )
                }
                title={showExplanation ? 'Hỏi trợ lý AI để hiểu rõ câu này' : 'Hỏi AI để được gợi ý (chưa tiết lộ đáp án)'}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-950/30 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                <Bot className="w-5 h-5" />
                <span className="hidden sm:inline">Hỏi AI</span>
              </button>
            <button
              onClick={() => onToggleStar(subjectId, snapshotOf(currentQ), !currentStarred)}
              aria-pressed={currentStarred}
              title={currentStarred ? 'Bỏ sao: câu này sẽ rời mục Cần ôn tập (nếu không còn sai)' : 'Gắn sao: giữ câu này trong mục Cần ôn tập'}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors flex-shrink-0"
            >
              <Star className={`w-5 h-5 transition-colors ${currentStarred ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} />
              <span className="hidden sm:inline">{currentStarred ? 'Đã gắn sao' : 'Gắn sao'}</span>
            </button>
            </div>
          </div>
          <p className="text-base font-medium leading-relaxed mb-5">{shownQ.question}</p>
          <div className="space-y-2.5">
            {shownQ.options.map((option, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrect = idx === currentQ.correctIndex;
              let style = 'border-gray-200 dark:border-slate-800 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/30 dark:hover:bg-primary-950/20';
              if (showExplanation) {
                if (isCorrect) {
                  style = 'border-accent-500 bg-accent-50 text-accent-900 dark:bg-accent-950/70 dark:text-accent-50';
                } else if (isSelected && !isCorrect) {
                  style = 'border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950/70 dark:text-rose-50';
                } else {
                  style = 'border-gray-200 dark:border-slate-800 opacity-70';
                }
              } else if (isSelected) {
                style = 'border-primary-500 bg-primary-50 text-primary-900 dark:bg-primary-950/60 dark:text-primary-50';
              }
              return (
                <button
                  key={idx}
                  onClick={() => !showExplanation && setSelectedOption(idx)}
                  disabled={showExplanation}
                  className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-center gap-3 ${style}`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    showExplanation && isCorrect
                      ? 'bg-accent-500 text-white'
                      : showExplanation && isSelected && !isCorrect
                      ? 'bg-rose-500 text-white'
                      : isSelected
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400'
                  }`}>
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="text-sm flex-1">{option}</span>
                  {showExplanation && isCorrect && <CheckCircle2 className="w-5 h-5 text-accent-500 flex-shrink-0" />}
                  {showExplanation && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          {showExplanation && <AnswerExplanation q={shownQ} selectedIndex={selectedOption} />}
        </div>

        {!showExplanation ? (
          <button
            onClick={handleAnswer}
            disabled={selectedOption === null}
            className="w-full py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            Xác nhận đáp án
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-semibold tracking-wide">Space</span>
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="w-full py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
          >
            {currentIdx + 1 >= total ? 'Xem kết quả' : 'Câu tiếp theo'}
            <ChevronRight className="w-4 h-4" />
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-semibold tracking-wide">Space</span>
          </button>
        )}
      </div>
    );
  }

  if (mode === 'result') {
    const percentage = Math.round((score / total) * 100);
    const isPass = percentage >= 60;
    return (
      <div className="animate-fade-in text-center py-6">
        <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${
          isPass ? 'bg-accent-50 dark:bg-accent-950/40' : 'bg-amber-50 dark:bg-amber-950/40'
        }`}>
          {isPass ? (
            <Trophy className="w-10 h-10 text-accent-500" />
          ) : (
            <Target className="w-10 h-10 text-amber-500" />
          )}
        </div>
        <h3 className="text-xl font-bold mb-1">
          {isPass ? 'Hoàn thành xuất sắc!' : 'Cần cố gắng thêm!'}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          Bạn trả lời đúng {score}/{total} câu · {percentage}%
        </p>

        <div className="flex gap-3 justify-center mb-6">
          <div className="px-4 py-2 rounded-xl bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 text-sm font-medium">
            {score} đúng
          </div>
          <div className="px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-sm font-medium">
            {total - score} sai
          </div>
        </div>

        {total - score > 0 && (
          <div className="card p-4 mb-6 text-left">
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 mb-2">
              <AlertCircle className="w-4 h-4" />
              {total - score} câu sai đã được thêm vào "Cần ôn tập"
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Vào tab "Cần ôn tập" để xem lại. Trả lời đúng câu đó ở lần sau, nó sẽ tự được gỡ khỏi danh sách.
            </p>
          </div>
        )}

        {notice && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{notice.text}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setMode('menu')}
            className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-slate-800 font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          >
            Về menu
          </button>
          <button
            onClick={restart}
            disabled={generating}
            className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Làm lại
          </button>
        </div>
      </div>
    );
  }

  // Menu mode
  const hasQuestions = availableQuestions.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {resume && (
        <div className="card p-4 border-primary-300 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-950/20">
          <p className="font-medium text-sm mb-0.5">Bạn có một bài đang làm dở</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Câu {resume.currentIdx + 1}/{resume.questions.length} · {resume.answers.filter((a) => a.isCorrect).length} đúng ·{' '}
            {resume.savedAt ? formatDateTime(resume.savedAt) : ''}
          </p>
          <div className="flex gap-2">
            <button
              onClick={resumeQuiz}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              <Play className="w-4 h-4" /> Làm tiếp
            </button>
            <button
              onClick={discardProgress}
              className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
            >
              Bỏ bài này
            </button>
          </div>
        </div>
      )}

      {/* Tạo câu hỏi từ ghi chú: nằm đầu trang, mặc định đóng; mở ra mới chọn ghi chú */}
      <div>
        <div className="card p-4 border-violet-200 dark:border-violet-900">
          <button
            onClick={() => setShowCreator((v) => !v)}
            disabled={generating}
            aria-expanded={creatorOpen}
            className="w-full flex items-center gap-3 text-left disabled:cursor-default"
          >
            <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Tạo câu hỏi từ ghi chú</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {creatorOpen
                  ? 'Chọn ghi chú muốn ôn. Bộ câu hỏi bao quát toàn bộ kiến thức trong các ghi chú đã chọn, ghi chú càng dài thì càng nhiều câu.'
                  : 'Bấm để mở, chọn ghi chú và tạo bộ câu hỏi mới'}
              </p>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${creatorOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {creatorOpen && (
            <div className="mt-4 animate-scale-in">
            {notes.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Hãy tạo ghi chú ở tab Ghi chú trước để dùng tính năng này.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
                  <span className="text-gray-600 dark:text-gray-300">
                    Đã chọn <b>{quizNotes.length}</b>/{notes.length} ghi chú · {quizChars.toLocaleString('vi-VN')} ký tự
                  </span>
                  <span className="flex gap-3">
                    <button onClick={() => setExcludedNoteIds([])} className="text-violet-600 dark:text-violet-400 hover:underline" disabled={generating}>
                      Chọn tất cả
                    </button>
                    <button onClick={() => setExcludedNoteIds(notes.map((n) => n.id))} className="text-gray-500 hover:underline" disabled={generating}>
                      Bỏ chọn hết
                    </button>
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-800 p-1.5 space-y-0.5">
                  {notes.map((n) => {
                    const empty = n.content.trim().length === 0;
                    const checked = !excludedNoteIds.includes(n.id) && !empty;
                    return (
                      <button
                        key={n.id}
                        onClick={() => toggleQuizNote(n.id)}
                        disabled={empty || generating}
                        aria-pressed={checked}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm transition-colors disabled:opacity-50 ${
                          checked ? 'bg-violet-50 dark:bg-violet-950/30' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <span className="truncate flex-1">{n.title || 'Ghi chú không tiêu đề'}</span>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">
                          {empty ? 'trống' : `${n.content.trim().length.toLocaleString('vi-VN')} ký tự`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={startNotesQuiz}
                  disabled={quizNotes.length === 0 || generating}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating
                    ? progress
                      ? `Đang tạo câu hỏi… phần ${Math.min(progress.done + 1, progress.total)}/${progress.total}`
                      : 'Đang tạo câu hỏi…'
                    : `Tạo câu hỏi từ ${quizNotes.length} ghi chú đã chọn`}
                </button>
                {generating && progress && progress.total > 1 && (
                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-violet-500 transition-all duration-500"
                      style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                    />
                  </div>
                )}
              </>
            )}
            </div>
          )}
        </div>

        {savedQuizzes.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold text-base mb-0.5">Bộ câu hỏi đã lưu</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Mỗi bộ được lưu lại tự động, làm bao nhiêu lần cũng được và không mất khi tải lại trang.
            </p>
            <div className="space-y-2">
              {savedQuizzes.map((q) => (
                <div key={q.id} className="card p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{q.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {q.questions.length} câu · {formatDateTime(q.createdAt)} ·{' '}
                      {q.source === 'ai' ? 'AI' : q.source === 'local' ? 'Tạo trên máy' : 'AI + trên máy'}
                    </p>
                  </div>
                  <button
                    onClick={() => startSavedQuiz(q)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors flex-shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" /> Làm bài
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Xoá bộ câu hỏi "${q.title}" (${q.questions.length} câu)? Không thể hoàn tác.`)) {
                        onDeleteSavedQuiz(subjectId, q.id);
                      }
                    }}
                    className="p-2 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors flex-shrink-0"
                    aria-label={`Xoá bộ câu hỏi ${q.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {notice && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs ${
              notice.tone === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
                : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200'
            }`}
            role="status"
          >
            <Info className="w-4 h-4 flex-shrink-0 mt-px" />
            <span>{notice.text}</span>
          </div>
        )}
      </div>

      {/* Quiz mode selection */}
      <div>
        <h3 className="font-semibold text-base mb-1">Ôn tập</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Luyện lại câu sai, câu gắn sao hoặc theo ghi chú đã chọn
        </p>
        <div className="grid gap-3">
          <button
            onClick={startReviewQuiz}
            disabled={wrongAnswers.length === 0}
            className="group card p-4 text-left hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center flex-shrink-0">
                <Target className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Ôn tập câu sai & gắn sao</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {wrongAnswers.length > 0
                    ? `${wrongAnswers.length} câu cần ôn lại · ${wrongAnswers.filter((w) => w.starred).length} gắn sao`
                    : 'Chưa có câu sai hay câu gắn sao nào'}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-amber-500 transition-colors" />
            </div>
          </button>

          <button
            onClick={startFocusQuiz}
            disabled={!hasQuestions || selectedReviewNotes.length === 0}
            className="group card p-4 text-left hover:shadow-md hover:border-accent-300 dark:hover:border-accent-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-50 dark:bg-accent-950/40 flex items-center justify-center flex-shrink-0">
                <Target className="w-5 h-5 text-accent-600 dark:text-accent-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Ôn theo ghi chú đã chọn</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedReviewNotes.length > 0
                    ? `${selectedReviewNotes.length} ghi chú đã chọn · Sinh quiz theo chủ đề`
                    : 'Chọn ghi chú ở tab "Cần ôn tập" trước'}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-accent-500 transition-colors" />
            </div>
          </button>
        </div>
      </div>

      {/* Quiz history */}
      {quizHistory.length > 0 && (
        <div>
          <h3 className="font-semibold text-base mb-3">Lịch sử làm bài</h3>
          <div className="space-y-2">
            {quizHistory.slice().reverse().slice(0, 5).map((session) => {
              const pct = Math.round((session.score / session.total) * 100);
              return (
                <div key={session.id} className="card p-3 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    pct >= 60 ? 'bg-accent-50 dark:bg-accent-950/40' : 'bg-rose-50 dark:bg-rose-950/40'
                  }`}>
                    <span className={`text-sm font-bold ${
                      pct >= 60 ? 'text-accent-600 dark:text-accent-400' : 'text-rose-600 dark:text-rose-400'
                    }`}>{pct}%</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{session.score}/{session.total} câu đúng</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(session.date).toLocaleDateString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasQuestions && notes.length === 0 && (
        <div className="card p-6 text-center">
          <Loader2 className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-400 dark:text-gray-600">
            Tạo ghi chú ở tab "Ghi chú" rồi quay lại đây để hệ thống sinh câu hỏi trắc nghiệm cho bạn!
          </p>
        </div>
      )}
    </div>
  );
}
