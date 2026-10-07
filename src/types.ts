export interface ExerciseLink {
  id: string;
  title: string;
  url: string;
}

export interface NoteFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface Note {
  id: string;
  title: string;
  category: NoteCategory;
  content: string;
  folderId: string | null;
  updatedAt: number;
}

export type NoteCategory = 'theory' | 'code' | 'exam' | 'summary' | 'other';

export const NOTE_CATEGORIES: { value: NoteCategory; label: string; color: string }[] = [
  { value: 'theory', label: 'Lý thuyết', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  { value: 'code', label: 'Code mẫu', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  { value: 'exam', label: 'Lưu ý ôn thi', color: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  { value: 'summary', label: 'Tóm tắt', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  { value: 'other', label: 'Khác', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
];

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  topic: string;
  /** Lý do cho từng đáp án (đúng vì sao, sai vì sao), cùng thứ tự với options. Thiếu = sẽ được AI phân tích khi cần. */
  optionExplanations?: string[];
}

export interface QuizResult {
  questionId: string;
  selectedIndex: number;
  isCorrect: boolean;
}

export interface QuizSession {
  id: string;
  date: number;
  score: number;
  total: number;
  results: QuizResult[];
}

export interface WrongAnswer {
  questionId: string;
  question: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number;
  explanation: string;
  topic: string;
  addedAt: number;
  attempts: number;
  /** false = đã làm đúng, chỉ còn trong danh sách vì được gắn sao. Thiếu (dữ liệu cũ) = vẫn là câu sai. */
  wrong?: boolean;
  /** Lý do từng đáp án (nếu có), để tab Ôn tập hiện lại mà không cần hỏi AI lần nữa. */
  optionExplanations?: string[];
  /** Người dùng gắn sao: câu ở lại danh sách ôn tập cho tới khi bỏ sao, dù làm đúng. */
  starred?: boolean;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  credits: number;
  description: string;
  exercises: ExerciseLink[];
}

export interface Semester {
  id: string;
  number: number;
  title: string;
  subjects: Subject[];
}

/** Bộ câu hỏi đã tạo (từ ghi chú), được lưu lại để làm bài nhiều lần mà không phải tạo lại. */
export interface SavedQuiz {
  id: string;
  title: string;
  createdAt: number;
  source: 'ai' | 'local' | 'mixed';
  noteTitles: string[];
  questions: QuizQuestion[];
}

export interface AppData {
  notes: { [subjectId: string]: Note[] };
  noteFolders: { [subjectId: string]: NoteFolder[] };
  customExercises: { [subjectId: string]: ExerciseLink[] };
  quizHistory: { [subjectId: string]: QuizSession[] };
  wrongAnswers: { [subjectId: string]: WrongAnswer[] };
  reviewSelections: { [subjectId: string]: string[] };
  savedQuizzes: { [subjectId: string]: SavedQuiz[] };
}
