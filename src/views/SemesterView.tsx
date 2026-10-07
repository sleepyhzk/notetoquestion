import { ArrowLeft, BookOpen, ChevronRight } from 'lucide-react';
import type { Semester } from '../types';

interface SemesterViewProps {
  semester: Semester;
  onBack: () => void;
  onSelectSubject: (subjectId: string) => void;
}

export function SemesterView({ semester, onBack, onSelectSubject }: SemesterViewProps) {
  const totalCredits = semester.subjects.reduce((sum, s) => sum + s.credits, 0);

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
            <h1 className="text-lg font-bold tracking-tight truncate">{semester.title}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {semester.subjects.length} môn học · {totalCredits} tín chỉ
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight mb-1">Danh sách môn học</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Chọn môn học để xem ghi chú và bài tập.
          </p>
        </div>

        <div className="grid gap-3 sm:gap-4">
          {semester.subjects.map((subject, index) => (
            <button
              key={subject.id}
              onClick={() => onSelectSubject(subject.id)}
              className="group card p-4 sm:p-5 text-left hover:shadow-md hover:border-primary-300 dark:hover:border-primary-700 transition-all duration-200 animate-slide-up"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-primary-50 dark:bg-primary-950/50 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-base truncate">{subject.name}</h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-mono">{subject.code}</span>
                    <span>·</span>
                    <span>{subject.credits} tín chỉ</span>
                    <span className="hidden sm:inline">·</span>
                    <span className="hidden sm:inline">{subject.exercises.length} bài tập</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
