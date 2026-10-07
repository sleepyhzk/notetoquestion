import { useState, useEffect, useCallback } from 'react';
import type {
  AppData,
  ExerciseLink,
  Note,
  NoteFolder,
  QuizSession,
  SavedQuiz,
  WrongAnswer,
} from '../types';
import { applyDecisions, type Decision } from '../sync/records';
import { clearWrong, markWrong, removeOne, resolveCorrect, setStar, type QuestionSnapshot } from '../utils/review';

const STORAGE_KEY = 'kien-thuc-dai-hoc-data-v3';

function emptyData(): AppData {
  return {
    notes: {},
    noteFolders: {},
    customExercises: {},
    quizHistory: {},
    wrongAnswers: {},
    reviewSelections: {},
    savedQuizzes: {},
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Chuẩn hoá dữ liệu bất kỳ (từ localStorage / file nhập) về đúng AppData; bỏ phần sai kiểu. */
function normalizeData(input: unknown): AppData {
  const out = emptyData();
  if (!isRecord(input)) return out;
  for (const key of Object.keys(out) as (keyof AppData)[]) {
    const section = input[key];
    if (!isRecord(section)) continue;
    for (const [subjectId, value] of Object.entries(section)) {
      if (!Array.isArray(value)) continue;
      // reviewSelections là danh sách id (chuỗi); các mục còn lại là object. Bỏ phần tử sai kiểu để UI không sập.
      (out[key] as Record<string, unknown[]>)[subjectId] = value.filter((item) =>
        key === 'reviewSelections' ? typeof item === 'string' : isRecord(item),
      );
    }
  }
  return out;
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeData(JSON.parse(raw));
  } catch {
    // dữ liệu hỏng -> bắt đầu lại từ rỗng
  }
  return emptyData();
}

/** Gộp hai danh sách theo khoá; phần tử của `incoming` ghi đè phần tử cũ cùng khoá. */
function mergeById<T>(current: T[], incoming: T[], keyOf: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of current) map.set(keyOf(item), item);
  for (const item of incoming) map.set(keyOf(item), item);
  return [...map.values()];
}

function mergeData(current: AppData, incoming: AppData): AppData {
  const result = emptyData();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyFns: Record<keyof AppData, (item: any) => string> = {
    notes: (n: Note) => n.id,
    noteFolders: (f: NoteFolder) => f.id,
    customExercises: (e: ExerciseLink) => e.id,
    quizHistory: (q: QuizSession) => q.id,
    wrongAnswers: (w: WrongAnswer) => w.questionId,
    reviewSelections: (id: string) => id,
    savedQuizzes: (q: SavedQuiz) => q.id,
  };
  for (const key of Object.keys(result) as (keyof AppData)[]) {
    const subjects = new Set([...Object.keys(current[key]), ...Object.keys(incoming[key])]);
    for (const subjectId of subjects) {
      (result[key] as Record<string, unknown[]>)[subjectId] = mergeById(
        (current[key] as Record<string, unknown[]>)[subjectId] ?? [],
        (incoming[key] as Record<string, unknown[]>)[subjectId] ?? [],
        keyFns[key],
      );
    }
  }
  return result;
}

export type ImportMode = 'merge' | 'replace';
export type ImportResult = { ok: true; notes: number } | { ok: false; error: string };

const countNotes = (d: AppData) => Object.values(d.notes).reduce((sum, list) => sum + list.length, 0);

export function useAppData() {
  const [data, setData] = useState<AppData>(loadData);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setStorageError(null);
    } catch {
      setStorageError('Không thể lưu dữ liệu vào trình duyệt (bộ nhớ đầy hoặc đang ở chế độ riêng tư). Hãy xuất file sao lưu ngay để khỏi mất ghi chú.');
    }
  }, [data]);

  // Xin trình duyệt không tự xoá dữ liệu khi thiếu dung lượng (không phải trình duyệt nào cũng hỗ trợ).
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  // === Bộ câu hỏi đã lưu ===
  const addSavedQuiz = useCallback((subjectId: string, quiz: SavedQuiz) => {
    setData((prev) => ({
      ...prev,
      savedQuizzes: {
        ...prev.savedQuizzes,
        [subjectId]: [quiz, ...(prev.savedQuizzes[subjectId] ?? []).filter((q) => q.id !== quiz.id)],
      },
    }));
  }, []);

  const deleteSavedQuiz = useCallback((subjectId: string, quizId: string) => {
    setData((prev) => ({
      ...prev,
      savedQuizzes: {
        ...prev.savedQuizzes,
        [subjectId]: (prev.savedQuizzes[subjectId] ?? []).filter((q) => q.id !== quizId),
      },
    }));
  }, []);

  const getSavedQuizzes = useCallback((subjectId: string) => data.savedQuizzes[subjectId] ?? [], [data.savedQuizzes]);

  // === Đồng bộ đám mây ===
  const applyRemote = useCallback((decisions: Decision[]) => {
    setData((prev) => applyDecisions(prev, decisions));
  }, []);

  /** Xoá toàn bộ dữ liệu trên máy (dùng khi trình duyệt đổi sang tài khoản khác). */
  const clearAllLocal = useCallback(() => {
    setData(emptyData());
  }, []);

  // === Sao lưu / khôi phục ===
  const exportData = useCallback((): string => {
    return JSON.stringify(
      { app: 'kien-thuc-dai-hoc', version: 3, exportedAt: new Date().toISOString(), data },
      null,
      2,
    );
  }, [data]);

  const importData = useCallback((text: string, mode: ImportMode): ImportResult => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'File không phải JSON hợp lệ.' };
    }
    // Chấp nhận cả file xuất từ app ({ data: {...} }) lẫn dữ liệu thô.
    const payload = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : parsed;
    if (!isRecord(payload) || !('notes' in payload || 'quizHistory' in payload || 'wrongAnswers' in payload)) {
      return { ok: false, error: 'File không đúng định dạng sao lưu của ứng dụng.' };
    }
    const incoming = normalizeData(payload);
    setData((prev) => (mode === 'replace' ? incoming : mergeData(prev, incoming)));
    return { ok: true, notes: countNotes(incoming) };
  }, []);

  // === Note Folders ===
  const getNoteFolders = useCallback(
    (subjectId: string): NoteFolder[] => {
      return data.noteFolders[subjectId] ?? [];
    },
    [data.noteFolders],
  );

  const addNoteFolder = useCallback((subjectId: string, folder: NoteFolder) => {
    setData((prev) => ({
      ...prev,
      noteFolders: {
        ...prev.noteFolders,
        [subjectId]: [...(prev.noteFolders[subjectId] ?? []), folder],
      },
    }));
  }, []);

  const deleteNoteFolder = useCallback((subjectId: string, folderId: string) => {
    setData((prev) => ({
      ...prev,
      noteFolders: {
        ...prev.noteFolders,
        [subjectId]: (prev.noteFolders[subjectId] ?? []).filter((f) => f.id !== folderId),
      },
      notes: {
        ...prev.notes,
        [subjectId]: (prev.notes[subjectId] ?? []).map((n) =>
          n.folderId === folderId ? { ...n, folderId: null } : n,
        ),
      },
    }));
  }, []);

  // === Notes (multi-notes) ===
  const getNotes = useCallback(
    (subjectId: string): Note[] => {
      return data.notes[subjectId] ?? [];
    },
    [data.notes],
  );

  const addNote = useCallback((subjectId: string, note: Note) => {
    setData((prev) => ({
      ...prev,
      notes: {
        ...prev.notes,
        [subjectId]: [...(prev.notes[subjectId] ?? []), note],
      },
    }));
  }, []);

  const updateNote = useCallback((subjectId: string, noteId: string, updates: Partial<Note>) => {
    setData((prev) => ({
      ...prev,
      notes: {
        ...prev.notes,
        [subjectId]: (prev.notes[subjectId] ?? []).map((n) =>
          n.id === noteId ? { ...n, ...updates, updatedAt: Date.now() } : n,
        ),
      },
    }));
  }, []);

  const deleteNote = useCallback((subjectId: string, noteId: string) => {
    setData((prev) => ({
      ...prev,
      notes: {
        ...prev.notes,
        [subjectId]: (prev.notes[subjectId] ?? []).filter((n) => n.id !== noteId),
      },
    }));
  }, []);

  // === Exercises ===
  const addExercise = useCallback((subjectId: string, exercise: ExerciseLink) => {
    setData((prev) => ({
      ...prev,
      customExercises: {
        ...prev.customExercises,
        [subjectId]: [...(prev.customExercises[subjectId] ?? []), exercise],
      },
    }));
  }, []);

  const removeExercise = useCallback((subjectId: string, exerciseId: string) => {
    setData((prev) => ({
      ...prev,
      customExercises: {
        ...prev.customExercises,
        [subjectId]: (prev.customExercises[subjectId] ?? []).filter(
          (ex) => ex.id !== exerciseId,
        ),
      },
    }));
  }, []);

  const getCustomExercises = useCallback(
    (subjectId: string): ExerciseLink[] => {
      return data.customExercises[subjectId] ?? [];
    },
    [data.customExercises],
  );

  // === Quiz ===
  const getQuizHistory = useCallback(
    (subjectId: string): QuizSession[] => {
      return data.quizHistory[subjectId] ?? [];
    },
    [data.quizHistory],
  );

  const addQuizSession = useCallback((subjectId: string, session: QuizSession) => {
    setData((prev) => ({
      ...prev,
      quizHistory: {
        ...prev.quizHistory,
        [subjectId]: [...(prev.quizHistory[subjectId] ?? []).slice(-9), session],
      },
    }));
  }, []);

  // === Wrong answers ===
  const getWrongAnswers = useCallback(
    (subjectId: string): WrongAnswer[] => {
      return data.wrongAnswers[subjectId] ?? [];
    },
    [data.wrongAnswers],
  );

  const setWrongList = useCallback((subjectId: string, update: (list: WrongAnswer[]) => WrongAnswer[]) => {
    setData((prev) => ({
      ...prev,
      wrongAnswers: { ...prev.wrongAnswers, [subjectId]: update(prev.wrongAnswers[subjectId] ?? []) },
    }));
  }, []);

  /** Ghi nhận câu làm sai (câu đã có thì tăng số lần sai). */
  const addWrongAnswers = useCallback(
    (subjectId: string, wrongs: WrongAnswer[]) => {
      if (wrongs.length > 0) setWrongList(subjectId, (list) => markWrong(list, wrongs));
    },
    [setWrongList],
  );

  /** Câu làm đúng: câu sai thì bỏ khỏi danh sách, câu có gắn sao thì ở lại. */
  const resolveWrongAnswers = useCallback(
    (subjectId: string, questionIds: string[]) => {
      if (questionIds.length > 0) setWrongList(subjectId, (list) => resolveCorrect(list, questionIds));
    },
    [setWrongList],
  );

  /** Gắn / bỏ sao một câu hỏi (câu chưa có trong danh sách sẽ được thêm khi gắn sao). */
  const toggleStar = useCallback(
    (subjectId: string, snapshot: QuestionSnapshot, starred: boolean) => {
      setWrongList(subjectId, (list) => setStar(list, snapshot, starred));
    },
    [setWrongList],
  );

  /** Xoá hẳn một câu khỏi danh sách (kể cả câu gắn sao). */
  const removeWrongAnswer = useCallback(
    (subjectId: string, questionId: string) => setWrongList(subjectId, (list) => removeOne(list, questionId)),
    [setWrongList],
  );

  /** Xoá mọi câu sai; câu gắn sao vẫn giữ. */
  const clearWrongAnswers = useCallback(
    (subjectId: string) => setWrongList(subjectId, (list) => clearWrong(list)),
    [setWrongList],
  );

  // === Review selections ===
  const getReviewSelections = useCallback(
    (subjectId: string): string[] => {
      return data.reviewSelections[subjectId] ?? [];
    },
    [data.reviewSelections],
  );

  const toggleReviewSelection = useCallback((subjectId: string, noteId: string) => {
    setData((prev) => {
      const current = prev.reviewSelections[subjectId] ?? [];
      const isSelected = current.includes(noteId);
      return {
        ...prev,
        reviewSelections: {
          ...prev.reviewSelections,
          [subjectId]: isSelected
            ? current.filter((id) => id !== noteId)
            : [...current, noteId],
        },
      };
    });
  }, []);

  return {
    rawData: data,
    addSavedQuiz,
    deleteSavedQuiz,
    getSavedQuizzes,
    applyRemote,
    clearAllLocal,
    storageError,
    exportData,
    importData,
    resolveWrongAnswers,
    toggleStar,
    getNotes,
    addNote,
    updateNote,
    deleteNote,
    getNoteFolders,
    addNoteFolder,
    deleteNoteFolder,
    addExercise,
    removeExercise,
    getCustomExercises,
    getQuizHistory,
    addQuizSession,
    getWrongAnswers,
    addWrongAnswers,
    removeWrongAnswer,
    clearWrongAnswers,
    getReviewSelections,
    toggleReviewSelection,
  };
}
