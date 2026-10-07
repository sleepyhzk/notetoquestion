import { BookOpen, GraduationCap, Moon, Sun } from 'lucide-react';
import type { Semester } from '../types';
import type { ReactNode } from 'react';
import { BackupMenu } from '../components/BackupMenu';
import type { ImportMode, ImportResult } from '../hooks/useAppData';
import { semesters } from '../data/semesters';

interface HomeViewProps {
  onSelectSemester: (semester: Semester) => void;
  isDark: boolean;
  onToggleDark: () => void;
  onExport: () => string;
  onImport: (text: string, mode: ImportMode) => ImportResult;
  headerExtra?: ReactNode;
}

const semesterColors = [
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-violet-500 to-purple-500',
  'from-sky-500 to-indigo-500',
  'from-fuchsia-500 to-pink-500',
  'from-lime-500 to-green-500',
  'from-orange-500 to-red-500',
];

export function HomeView({ onSelectSemester, isDark, onToggleDark, onExport, onImport, headerExtra }: HomeViewProps) {
  const totalSubjects = semesters.reduce((sum, s) => sum + s.subjects.length, 0);
  const totalCredits = semesters.reduce(
    (sum, s) => sum + s.subjects.reduce((sub, sub2) => sub + sub2.credits, 0),
    0,
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 backdrop-blur-lg bg-white/80 dark:bg-slate-950/80 border-b border-gray-200 dark:border-slate-800 transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Quản lý Kiến thức</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Đại học · 9 học kỳ</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {headerExtra}
            <BackupMenu onExport={onExport} onImport={onImport} />
            <button
              onClick={onToggleDark}
              className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Chế độ tối/sáng"
            >
              {isDark ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-8 sm:mb-12 animate-fade-in">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            Chào bạn! Sẵn sàng học tập nào
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-base">
            Chọn học kỳ để xem các môn học, ghi chú và bài tập.
          </p>
          <div className="flex flex-wrap gap-4 mt-6">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 text-sm font-medium">
              <BookOpen className="w-4 h-4" />
              {totalSubjects} môn học
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 text-sm font-medium">
              <GraduationCap className="w-4 h-4" />
              {totalCredits} tín chỉ
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {semesters.map((semester, index) => (
            <button
              key={semester.id}
              onClick={() => onSelectSemester(semester)}
              className="group relative overflow-hidden card p-5 text-left hover:shadow-lg hover:-translate-y-1 transition-all duration-300 animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${semesterColors[index]} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}
              />
              <div className="flex items-start justify-between mb-4">
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${semesterColors[index]} flex items-center justify-center shadow-md`}
                >
                  <span className="text-white font-bold text-lg">{semester.number}</span>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400">
                  {semester.subjects.length} môn
                </span>
              </div>
              <h3 className="font-semibold text-base mb-1">{semester.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                {semester.subjects.map((s) => s.name).join(' · ')}
              </p>
              <div className="flex items-center gap-1 mt-4 text-primary-600 dark:text-primary-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Xem chi tiết
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
