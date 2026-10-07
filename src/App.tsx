import { useCallback, useEffect, useState } from 'react';
import { HomeView } from './views/HomeView';
import { SemesterView } from './views/SemesterView';
import { SubjectView } from './views/SubjectView';
import { useDarkMode } from './hooks/useDarkMode';
import { useAppData } from './hooks/useAppData';
import { useAuth } from './hooks/useAuth';
import { useCloudSync } from './hooks/useCloudSync';
import { CloudMenu } from './components/CloudMenu';
import { AIChat, type AIChatRequest } from './components/AIChat';
import { AskAIContext, type AskAIRequest } from './context/AskAI';
import { semesters } from './data/semesters';
import type { Semester } from './types';

type View =
  | { name: 'home' }
  | { name: 'semester'; semester: Semester }
  | { name: 'subject'; semester: Semester; subjectId: string };

const NAV_KEY = 'kien-thuc-nav-v1';

/** Khôi phục trang đang xem (học kỳ / môn) sau khi tải lại trang. */
function loadView(): View {
  try {
    const raw = localStorage.getItem(NAV_KEY);
    if (!raw) return { name: 'home' };
    const nav = JSON.parse(raw) as { semesterId?: string; subjectId?: string };
    const semester = semesters.find((s) => s.id === nav.semesterId);
    if (!semester) return { name: 'home' };
    if (nav.subjectId && semester.subjects.some((s) => s.id === nav.subjectId)) {
      return { name: 'subject', semester, subjectId: nav.subjectId };
    }
    return { name: 'semester', semester };
  } catch {
    return { name: 'home' };
  }
}

export default function App() {
  const { isDark, toggle } = useDarkMode();
  const data = useAppData();
  const auth = useAuth();
  const cloud = useCloudSync({
    user: auth.user,
    data: data.rawData,
    applyRemote: data.applyRemote,
    clearLocal: data.clearAllLocal,
    onRejectUser: auth.signOut,
  });
  const [view, setView] = useState<View>(loadView);

  // Nút "Hỏi AI" ở các câu hỏi gọi hàm này để chuyển câu hỏi sang chatbot.
  const [aiRequest, setAiRequest] = useState<AIChatRequest | null>(null);
  const askAI = useCallback((r: AskAIRequest) => setAiRequest({ id: Date.now() + Math.random(), ...r }), []);

  useEffect(() => {
    try {
      const nav =
        view.name === 'home'
          ? {}
          : { semesterId: view.semester.id, subjectId: view.name === 'subject' ? view.subjectId : undefined };
      localStorage.setItem(NAV_KEY, JSON.stringify(nav));
    } catch {
      // bỏ qua
    }
  }, [view]);

  // Nếu môn không tồn tại (dữ liệu học kỳ đổi) thì coi như đang ở trang chủ,
  // thay vì gọi setState ngay trong lúc render như trước.
  const subject =
    view.name === 'subject' ? view.semester.subjects.find((s) => s.id === view.subjectId) : undefined;

  let content;
  if (view.name === 'subject' && subject) {
    const currentSemester = view.semester;
    content = (
      <SubjectView
        subject={subject}
        semester={currentSemester}
        notes={data.getNotes(subject.id)}
        folders={data.getNoteFolders(subject.id)}
        customExercises={data.getCustomExercises(subject.id)}
        quizHistory={data.getQuizHistory(subject.id)}
        wrongAnswers={data.getWrongAnswers(subject.id)}
        reviewSelections={data.getReviewSelections(subject.id)}
        onAddNote={data.addNote}
        onUpdateNote={data.updateNote}
        onDeleteNote={data.deleteNote}
        onAddFolder={data.addNoteFolder}
        onDeleteFolder={data.deleteNoteFolder}
        onAddExercise={data.addExercise}
        onRemoveExercise={data.removeExercise}
        onAddQuizSession={data.addQuizSession}
        savedQuizzes={data.getSavedQuizzes(subject.id)}
        onSaveQuiz={data.addSavedQuiz}
        onDeleteSavedQuiz={data.deleteSavedQuiz}
        onAddWrongAnswers={data.addWrongAnswers}
        onResolveWrongAnswers={data.resolveWrongAnswers}
        onToggleStar={data.toggleStar}
        onRemoveWrongAnswer={data.removeWrongAnswer}
        onClearWrongAnswers={data.clearWrongAnswers}
        onToggleReviewSelection={data.toggleReviewSelection}
        onBack={() => setView({ name: 'semester', semester: currentSemester })}
      />
    );
  } else if (view.name === 'semester') {
    const currentSemester = view.semester;
    content = (
      <SemesterView
        semester={currentSemester}
        onBack={() => setView({ name: 'home' })}
        onSelectSubject={(subjectId) => setView({ name: 'subject', semester: currentSemester, subjectId })}
      />
    );
  } else {
    content = (
      <HomeView
        isDark={isDark}
        onToggleDark={toggle}
        onExport={data.exportData}
        onImport={data.importData}
        headerExtra={<CloudMenu auth={auth} cloud={cloud} />}
        onSelectSemester={(semester) => setView({ name: 'semester', semester })}
      />
    );
  }

  return (
    <AskAIContext.Provider value={askAI}>
      {data.storageError && (
        <div
          role="alert"
          className="sticky top-0 z-40 bg-rose-600 px-4 py-2 text-center text-xs font-medium text-white"
        >
          {data.storageError}
        </div>
      )}
      {content}
      {/* AIChat nằm ngoài các view nên lịch sử trò chuyện không bị mất khi chuyển trang */}
      <AIChat
        request={aiRequest}
        context={
          subject
            ? { subjectName: subject.name, semesterTitle: view.name === 'subject' ? view.semester.title : undefined }
            : undefined
        }
      />
    </AskAIContext.Provider>
  );
}
