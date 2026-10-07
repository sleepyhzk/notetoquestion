import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Save,
  X,
  StickyNote,
  NotebookPen,
  Folder as FolderIcon,
  FolderPlus,
  ArrowLeft,
  MoreVertical,
  FileText,
} from 'lucide-react';
import type { Note, NoteCategory, NoteFolder } from '../types';
import { NOTE_CATEGORIES } from '../types';
import { NoteCard } from '../components/NoteCard';

interface NotesTabProps {
  subjectId: string;
  notes: Note[];
  folders: NoteFolder[];
  onAddNote: (subjectId: string, note: Note) => void;
  onUpdateNote: (subjectId: string, noteId: string, updates: Partial<Note>) => void;
  onDeleteNote: (subjectId: string, noteId: string) => void;
  onAddFolder: (subjectId: string, folder: NoteFolder) => void;
  onDeleteFolder: (subjectId: string, folderId: string) => void;
}

function deriveTitleFromContent(content: string): string {
  const firstLine = content.split('\n').find((l) => l.trim().length > 0);
  if (!firstLine) return 'Ghi chú không tiêu đề';
  const cleaned = firstLine.replace(/^#+\s*/, '').replace(/^\s*[-•]\s*/, '').trim();
  return cleaned.length > 60 ? cleaned.slice(0, 60) + '…' : cleaned || 'Ghi chú không tiêu đề';
}

export function NotesTab({
  subjectId,
  notes,
  folders,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddFolder,
  onDeleteFolder,
}: NotesTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    category: 'theory' as NoteCategory,
    content: '',
    folderId: null as string | null,
  });

  // Editor state for folder view
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [editorCategory, setEditorCategory] = useState<NoteCategory>('theory');
  const [editorDirty, setEditorDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
    [notes],
  );

  const unfiledNotes = sortedNotes.filter((n) => !n.folderId);
  const folderNotes = (folderId: string) => sortedNotes.filter((n) => n.folderId === folderId);
  const currentFolder = folders.find((f) => f.id === openFolderId) ?? null;
  const currentFolderNotes = currentFolder ? folderNotes(currentFolder.id) : [];

  // When opening a folder, auto-select the first note or start a new one
  useEffect(() => {
    if (currentFolder) {
      if (currentFolderNotes.length > 0) {
        const first = currentFolderNotes[0];
        setActiveNoteId(first.id);
        setEditorContent(first.content);
        setEditorCategory(first.category);
        setEditorDirty(false);
      } else {
        // Start fresh
        setActiveNoteId(null);
        setEditorContent('');
        setEditorCategory('theory');
        setEditorDirty(false);
      }
    }
  }, [openFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && currentFolder) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editorContent, currentFolder]);

  const selectNote = (note: Note) => {
    if (editorDirty && activeNoteId) {
      saveEditor();
    }
    setActiveNoteId(note.id);
    setEditorContent(note.content);
    setEditorCategory(note.category);
    setEditorDirty(false);
  };

  const startNewNoteInFolder = () => {
    if (editorDirty && activeNoteId) {
      saveEditor();
    }
    setActiveNoteId(null);
    setEditorContent('');
    setEditorCategory('theory');
    setEditorDirty(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const saveEditor = () => {
    if (!currentFolder) return;
    const trimmed = editorContent.trim();
    if (!trimmed) return;

    const title = deriveTitleFromContent(editorContent);

    if (activeNoteId) {
      onUpdateNote(subjectId, activeNoteId, {
        title,
        content: editorContent,
        category: editorCategory,
        folderId: currentFolder.id,
      });
    } else {
      const newId = `note-${Date.now()}`;
      onAddNote(subjectId, {
        id: newId,
        title,
        category: editorCategory,
        content: editorContent,
        folderId: currentFolder.id,
        updatedAt: Date.now(),
      });
      setActiveNoteId(newId);
    }
    setEditorDirty(false);
  };

  const deleteActiveNote = () => {
    if (!activeNoteId) return;
    onDeleteNote(subjectId, activeNoteId);
    const remaining = currentFolderNotes.filter((n) => n.id !== activeNoteId);
    if (remaining.length > 0) {
      selectNote(remaining[0]);
    } else {
      startNewNoteInFolder();
    }
  };

  // ===== Default form handlers (for non-folder view) =====
  const resetForm = () => {
    setFormData({ title: '', category: 'theory', content: '', folderId: openFolderId });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = formData.title.trim() || deriveTitleFromContent(formData.content);
    if (!formData.content.trim() && !formData.title.trim()) return;
    if (editingId) {
      onUpdateNote(subjectId, editingId, {
        title,
        category: formData.category,
        content: formData.content,
        folderId: formData.folderId,
      });
    } else {
      onAddNote(subjectId, {
        id: `note-${Date.now()}`,
        title,
        category: formData.category,
        content: formData.content,
        folderId: formData.folderId,
        updatedAt: Date.now(),
      });
    }
    resetForm();
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    onAddFolder(subjectId, {
      id: `folder-${Date.now()}`,
      name: newFolderName.trim(),
      createdAt: Date.now(),
    });
    setNewFolderName('');
    setShowFolderForm(false);
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setFormData({ title: note.title, category: note.category, content: note.content, folderId: note.folderId });
    setShowForm(true);
  };

  const startAddToFolder = (folderId: string | null) => {
    setFormData({ title: '', category: 'theory', content: '', folderId });
    setEditingId(null);
    setShowForm(true);
  };

  const renderNoteCard = (note: Note, idx: number) => (
    <NoteCard
      key={note.id}
      note={note}
      index={idx}
      onEdit={startEdit}
      onDelete={(noteId) => onDeleteNote(subjectId, noteId)}
    />
  );

  // ===== Folder detail view: single large editor =====
  if (currentFolder) {
    const autoTitle = deriveTitleFromContent(editorContent);
    return (
      <div className="animate-fade-in flex flex-col h-full">
        {/* Minimal top bar */}
        <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => {
                if (editorDirty) saveEditor();
                setOpenFolderId(null);
              }}
              className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Tất cả ghi chú</span>
            </button>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <FolderIcon className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300 truncate">{currentFolder.name}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {activeNoteId && (
              <button
                onClick={deleteActiveNote}
                className="p-2 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                aria-label="Xóa ghi chú"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={startNewNoteInFolder}
              className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Mới</span>
            </button>
            <button
              onClick={saveEditor}
              disabled={!editorDirty && !editorContent.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{editorDirty ? 'Lưu' : 'Đã lưu'}</span>
            </button>
          </div>
        </div>

        {/* Note tabs (only if more than 1 note) */}
        {currentFolderNotes.length > 1 && (
          <div className="flex items-center gap-1 mb-2 overflow-x-auto pb-1 flex-shrink-0">
            {currentFolderNotes.map((n) => (
              <button
                key={n.id}
                onClick={() => selectNote(n)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  n.id === activeNoteId
                    ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 border border-transparent'
                }`}
              >
                <FileText className="w-3 h-3 flex-shrink-0" />
                <span className="truncate max-w-[120px]">{n.title}</span>
              </button>
            ))}
          </div>
        )}

        {/* Category pills — inline, compact */}
        <div className="flex items-center gap-1.5 mb-2 flex-shrink-0 flex-wrap">
          {NOTE_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => {
                setEditorCategory(cat.value);
                setEditorDirty(true);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                editorCategory === cat.value
                  ? cat.color
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Auto-title preview — subtle, not an input */}
        {editorContent.trim() && (
          <p className="text-[11px] text-gray-400 dark:text-gray-600 mb-1.5 flex items-center gap-1 flex-shrink-0">
            <FileText className="w-3 h-3" />
            Tiêu đề tự động: <span className="text-gray-500 dark:text-gray-400 font-medium">{autoTitle}</span>
          </p>
        )}

        {/* THE large editor — fills all remaining space */}
        <textarea
          ref={textareaRef}
          value={editorContent}
          onChange={(e) => {
            setEditorContent(e.target.value);
            setEditorDirty(true);
          }}
          onBlur={() => {
            if (editorDirty) saveEditor();
          }}
          placeholder="Bắt đầu gõ nội dung ghi chú tại đây...&#10;&#10;Dòng đầu tiên sẽ tự động trở thành tiêu đề.&#10;Viết rõ khái niệm, định nghĩa (VD: 'Telnet là giao thức mạng sử dụng port 23') để hệ thống sinh câu hỏi trắc nghiệm tốt nhất."
          className="flex-1 w-full min-h-[50vh] p-4 sm:p-5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm sm:text-base leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono"
          autoFocus
        />

        <p className="text-[11px] text-primary-500 dark:text-primary-400 mt-2 flex items-center gap-1 flex-shrink-0">
          <StickyNote className="w-3 h-3" />
          Mẹo: Viết rõ khái niệm, định nghĩa, thông số (port, số bit, công thức...) để AI sinh câu hỏi chính xác nhất
        </p>
      </div>
    );
  }

  // ===== Default view: folder grid + unfiled notes =====
  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
            <StickyNote className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Ghi chú kiến thức</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {notes.length > 0 ? `${notes.length} ghi chú · ${folders.length} thư mục` : 'Tạo thư mục và ghi chú để lưu kiến thức'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFolderForm(!showFolderForm)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Thư mục</span>
          </button>
          {!showForm && (
            <button
              onClick={() => startAddToFolder(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tạo ghi chú
            </button>
          )}
        </div>
      </div>

      {showFolderForm && (
        <form onSubmit={handleCreateFolder} className="card p-4 mb-4 flex gap-2 animate-scale-in">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Tên thư mục (VD: Chương 1, Bài giảng tuần 3...)"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            autoFocus
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors">
            Tạo
          </button>
          <button type="button" onClick={() => setShowFolderForm(false)} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-sm hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </form>
      )}

      {showForm && formData.folderId === null && (
        <form onSubmit={handleSubmit} className="card p-4 sm:p-5 mb-4 space-y-3 animate-scale-in">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">
              {editingId ? 'Chỉnh sửa ghi chú' : 'Tạo ghi chú mới'}
            </h4>
            <button type="button" onClick={resetForm} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Thư mục</label>
            <select
              value={formData.folderId ?? ''}
              onChange={(e) => setFormData({ ...formData, folderId: e.target.value || null })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Không có thư mục</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Phân loại</label>
            <div className="flex flex-wrap gap-2">
              {NOTE_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, category: cat.value })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    formData.category === cat.value
                      ? cat.color + ' ring-2 ring-offset-1 dark:ring-offset-slate-900 ring-current'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nội dung</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Nhập nội dung ghi chú... Dòng đầu tiên sẽ tự thành tiêu đề."
              className="w-full min-h-[160px] p-3 rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950/50 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              autoFocus
            />
            <p className="text-[11px] text-primary-500 dark:text-primary-400 mt-1.5 flex items-center gap-1">
              <StickyNote className="w-3 h-3" />
              Mẹo: Viết rõ khái niệm, định nghĩa (VD: "X là Y") để hệ thống sinh câu hỏi tốt hơn
            </p>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors">
              <Save className="w-4 h-4" />
              {editingId ? 'Cập nhật' : 'Tạo ghi chú'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
              Hủy
            </button>
          </div>
        </form>
      )}

      {/* Folder grid */}
      {folders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
          {folders.map((folder) => {
            const count = folderNotes(folder.id).length;
            return (
              <div key={folder.id} className="relative group">
                <button
                  onClick={() => setOpenFolderId(folder.id)}
                  className="w-full card p-4 flex flex-col items-center gap-2 hover:shadow-md hover:border-primary-300 dark:hover:border-primary-700 transition-all text-center"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-950/40 flex items-center justify-center">
                    <FolderIcon className="w-5 h-5 text-primary-500 dark:text-primary-400" />
                  </div>
                  <p className="font-medium text-sm truncate w-full">{folder.name}</p>
                  <p className="text-xs text-gray-400">{count} ghi chú</p>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFolderMenuId(folderMenuId === folder.id ? null : folder.id);
                  }}
                  className="absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all"
                  aria-label="Tùy chọn thư mục"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
                {folderMenuId === folder.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setFolderMenuId(null)}
                    />
                    <div className="absolute top-8 right-2 z-20 card p-1 shadow-lg flex flex-col gap-0.5 min-w-[140px] animate-scale-in">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderMenuId(null);
                          onDeleteFolder(subjectId, folder.id);
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Xóa thư mục
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unfiledNotes.length > 0 && (
        <div>
          {folders.length > 0 && (
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5" />
              Ghi chú chưa phân thư mục
            </p>
          )}
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
            {unfiledNotes.map((note, idx) => renderNoteCard(note, idx))}
          </div>
        </div>
      )}

      {sortedNotes.length === 0 && !showForm && (
        <div className="card p-8 text-center">
          <NotebookPen className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Chưa có ghi chú nào</p>
          <p className="text-xs text-gray-400 dark:text-gray-600">
            Tạo ghi chú với nội dung kiến thức — hệ thống sẽ tự sinh câu hỏi trắc nghiệm từ ghi chú của bạn
          </p>
        </div>
      )}
    </div>
  );
}
