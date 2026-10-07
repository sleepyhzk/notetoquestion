import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Link2,
  StickyNote,
  Brain,
  AlertCircle,
} from 'lucide-react';
import type { Semester, Subject, ExerciseLink, Note, NoteFolder, QuizSession, SavedQuiz, WrongAnswer } from '../types';
import { NotesTab } from './NotesTab';
import { ExercisesTab } from './ExercisesTab';
import { QuizTab } from './QuizTab';
import { ReviewTab } from './ReviewTab';
import type { QuestionSnapshot } from '../utils/review';

type Tab = 'notes' | 'exercises' | 'quiz' | 'review';
const TABS: Tab[] = ['notes', 'exercises', 'quiz', 'review'];
const tabKey = (subjectId: string) => `kien-thuc-tab-v1:${subjectId}`;

function loadTab(subjectId: string): Tab {
  try {
    const t = localStorage.getItem(tabKey(subjectId));
    return TABS.includes(t as Tab) ? (t as Tab) : 'notes';
  } catch {
    return 'notes';
  }
}

interface SubjectViewProps {
  subject: Subject;
  semester: Semester;
  notes: Note[];
  folders: NoteFolder[];
  customExercises: ExerciseLink[];
  quizHistory: QuizSession[];
  wrongAnswers: WrongAnswer[];
  reviewSelections: string[];
  onAddNote: (subjectId: string, note: Note) => void;
  onUpdateNote: (subjectId: string, noteId: string, updates: Partial<Note>) => void;
  onDeleteNote: (subjectId: string, noteId: string) => void;
  onAddFolder: (subjectId: string, folder: NoteFolder) => void;
  onDeleteFolder: (subjectId: string, folderId: string) => void;
  onAddExercise: (subjectId: string, exercise: ExerciseLink) => void;
  onRemoveExercise: (subjectId: string, exerciseId: string) => void;
  onAddQuizSession: (subjectId: string, session: QuizSession) => void;
  savedQuizzes: SavedQuiz[];
  onSaveQuiz: (subjectId: string, quiz: SavedQuiz) => void;
  onDeleteSavedQuiz: (subjectId: string, quizId: string) => void;
  onAddWrongAnswers: (subjectId: string, wrongs: WrongAnswer[]) => void;
  onResolveWrongAnswers: (subjectId: string, questionIds: string[]) => void;
  onToggleStar: (subjectId: string, snapshot: QuestionSnapshot, starred: boolean) => void;
  onRemoveWrongAnswer: (subjectId: string, questionId: string) => void;
  onClearWrongAnswers: (subjectId: string) => void;
  onToggleReviewSelection: (subjectId: string, noteId: string) => void;
  onBack: () => void;
}

const tabs: { id: Tab; label: string; icon: typeof StickyNote }[] = [
  { id: 'notes', label: 'Ghi chú', icon: StickyNote },
  { id: 'exercises', label: 'Bài tập', icon: Link2 },
  { id: 'quiz', label: 'Trắc nghiệm', icon: Brain },
  { id: 'review', label: 'Cần ôn tập', icon: AlertCircle },
];

export function SubjectView({
  subject,
  semester,
  notes,
  folders,
  customExercises,
  quizHistory,
  wrongAnswers,
  reviewSelections,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddFolder,
  onDeleteFolder,
  onAddExercise,
  onRemoveExercise,
  onAddQuizSession,
  savedQuizzes,
  onSaveQuiz,
  onDeleteSavedQuiz,
  onAddWrongAnswers,
  onResolveWrongAnswers,
  onToggleStar,
  onRemoveWrongAnswer,
  onClearWrongAnswers,
  onToggleReviewSelection,
  onBack,
}: SubjectViewProps) {
  // Nhớ tab đang mở: tải lại trang vẫn quay về đúng tab (ví dụ đang ở Trắc nghiệm).
  const [activeTab, setActiveTab] = useState<Tab>(() => loadTab(subject.id));
  useEffect(() => {
    try {
      localStorage.setItem(tabKey(subject.id), activeTab);
    } catch {
      // bỏ qua
    }
  }, [subject.id, activeTab]);

  return (
    <div className="min-h-screen animate-fade-in">
      <header className="sticky top-0 z-10 backdrop-blur-lg bg-white/80 dark:bg-slate-950/80 border-b border-gray-200 dark:border-slate-800 transition-colors">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold tracking-tight truncate">{subject.name}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {semester.title} · {subject.code} · {subject.credits} tín chỉ
            </p>
          </div>
        </div>
        {/* Tab bar */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto pb-2 -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const badge =
                tab.id === 'review' && wrongAnswers.length > 0
                  ? wrongAnswers.length
                  : tab.id === 'notes' && notes.length > 0
                  ? notes.length
                  : 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {badge > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'notes' && (
          <NotesTab
            subjectId={subject.id}
            notes={notes}
            folders={folders}
            onAddNote={onAddNote}
            onUpdateNote={onUpdateNote}
            onDeleteNote={onDeleteNote}
            onAddFolder={onAddFolder}
            onDeleteFolder={onDeleteFolder}
          />
        )}

        {activeTab === 'exercises' && (
          <ExercisesTab
            exercises={customExercises}
            onAdd={(exercise) => onAddExercise(subject.id, exercise)}
            onRemove={(exerciseId) => onRemoveExercise(subject.id, exerciseId)}
          />
        )}

        {activeTab === 'quiz' && (
          <QuizTab
            subjectId={subject.id}
            notes={notes}
            wrongAnswers={wrongAnswers}
            quizHistory={quizHistory}
            reviewSelections={reviewSelections}
            onAddQuizSession={onAddQuizSession}
            savedQuizzes={savedQuizzes}
            onSaveQuiz={onSaveQuiz}
            onDeleteSavedQuiz={onDeleteSavedQuiz}
            onAddWrongAnswers={onAddWrongAnswers}
            onResolveWrongAnswers={onResolveWrongAnswers}
            onToggleStar={onToggleStar}
          />
        )}

        {activeTab === 'review' && (
          <ReviewTab
            subjectId={subject.id}
            wrongAnswers={wrongAnswers}
            notes={notes}
            reviewSelections={reviewSelections}
            onAddWrongAnswers={onAddWrongAnswers}
            onResolveWrongAnswers={onResolveWrongAnswers}
            onToggleStar={onToggleStar}
            onRemoveWrongAnswer={onRemoveWrongAnswer}
            onClearWrongAnswers={onClearWrongAnswers}
            onToggleReviewSelection={onToggleReviewSelection}
          />
        )}
      </main>
    </div>
  );
}
