import { useState } from 'react';
import { ExternalLink, Link2, Plus, Trash2 } from 'lucide-react';
import type { ExerciseLink } from '../types';

interface ExercisesTabProps {
  exercises: ExerciseLink[];
  onAdd: (exercise: ExerciseLink) => void;
  onRemove: (exerciseId: string) => void;
}

/** Chỉ cho phép http/https để không lưu các liên kết kiểu javascript: */
function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function ExercisesTab({ exercises, onAdd, onRemove }: ExercisesTabProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [urlError, setUrlError] = useState(false);

  const handleAddExercise = (e: React.FormEvent) => {
    e.preventDefault();
    const url = normalizeUrl(newUrl);
    if (!newTitle.trim() || !newUrl.trim()) return;
    if (!url) {
      setUrlError(true);
      return;
    }
    onAdd({ id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: newTitle.trim(), url });
    setNewTitle('');
    setNewUrl('');
    setUrlError(false);
    setShowAddForm(false);
  };

  return (
    <section className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-950/40 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Bài tập & Câu hỏi</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {exercises.length} liên kết · Mở trong tab mới
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Thêm
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddExercise}
          className="card p-4 mb-4 space-y-3 animate-scale-in"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Tiêu đề
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="VD: Bài tập chương 1"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              URL (liên kết ChatGPT / Gemini / bài tập)
            </label>
            <input
              type="text"
              inputMode="url"
              value={newUrl}
              onChange={(e) => {
                setNewUrl(e.target.value);
                setUrlError(false);
              }}
              placeholder="https://chatgpt.com/..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            {urlError && (
              <p className="mt-1 text-xs text-rose-500" role="alert">
                Liên kết không hợp lệ. Chỉ chấp nhận địa chỉ http:// hoặc https://.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              Thêm liên kết
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {exercises.length === 0 ? (
        <div className="card p-8 text-center">
          <Link2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Chưa có bài tập nào. Nhấn "Thêm" để tạo liên kết mới.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {exercises.map((exercise, index) => (
            <li
              key={exercise.id}
              className="group card p-3 flex items-center gap-3 hover:border-primary-300 dark:hover:border-primary-700 transition-all animate-slide-up"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-500 dark:text-gray-400">
                {index + 1}
              </div>
              <span className="flex-1 text-sm font-medium truncate">{exercise.title}</span>
              <button
                  onClick={() => onRemove(exercise.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Xóa"
                >
                  <Trash2 className="w-4 h-4" />
              </button>
              <a
                href={exercise.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors flex-shrink-0"
              >
                Mở
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
