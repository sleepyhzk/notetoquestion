import { FileText, Trash2 } from 'lucide-react';
import type { Note, NoteCategory } from '../types';
import { NOTE_CATEGORIES } from '../types';

interface NoteCardProps {
  note: Note;
  index: number;
  onEdit: (note: Note) => void;
  onDelete: (noteId: string) => void;
}

const getCategoryInfo = (cat: NoteCategory) =>
  NOTE_CATEGORIES.find((c) => c.value === cat) ?? NOTE_CATEGORIES[NOTE_CATEGORIES.length - 1];

export function NoteCard({ note, index, onEdit, onDelete }: NoteCardProps) {
  const cat = getCategoryInfo(note.category);
  return (
    <div
      className="group card p-4 animate-slide-up flex flex-col"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium mb-1.5 ${cat.color}`}>
            {cat.label}
          </span>
          <h4 className="font-semibold text-sm leading-snug">{note.title}</h4>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => onEdit(note)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors"
            aria-label="Sửa"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(note.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            aria-label="Xóa"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed flex-1 whitespace-pre-wrap line-clamp-6">
        {note.content || '(chưa có nội dung)'}
      </p>
      <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-2 pt-2 border-t border-gray-100 dark:border-slate-800">
        {new Date(note.updatedAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}
