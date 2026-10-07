import { useRef, useState } from 'react';
import { Download, HardDriveDownload, Upload, X } from 'lucide-react';
import type { ImportMode, ImportResult } from '../hooks/useAppData';

interface BackupMenuProps {
  onExport: () => string;
  onImport: (text: string, mode: ImportMode) => ImportResult;
}

export function BackupMenu({ onExport, onImport }: BackupMenuProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<ImportMode>('merge');

  const handleExport = () => {
    const blob = new Blob([onExport()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `kien-thuc-dai-hoc-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage({ ok: true, text: 'Đã tải file sao lưu. Hãy cất nó ở nơi an toàn (Drive, email...).' });
  };

  const pickFile = (mode: ImportMode) => {
    if (mode === 'replace' && !window.confirm('Thay thế sẽ XOÁ toàn bộ dữ liệu hiện tại và dùng dữ liệu trong file. Tiếp tục?')) {
      return;
    }
    modeRef.current = mode;
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại cùng một file
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setMessage({ ok: false, text: 'File quá lớn (tối đa 20 MB).' });
      return;
    }
    const result = onImport(await file.text(), modeRef.current);
    setMessage(
      result.ok
        ? { ok: true, text: `Đã khôi phục dữ liệu (${result.notes} ghi chú trong file).` }
        : { ok: false, text: result.error },
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Sao lưu và khôi phục dữ liệu"
        aria-expanded={open}
        title="Sao lưu / khôi phục"
      >
        <HardDriveDownload className="w-5 h-5 text-gray-600 dark:text-gray-300" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 card p-4 shadow-xl z-20 animate-scale-in">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Sao lưu dữ liệu</h3>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Đóng">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Ghi chú được lưu ngay trong trình duyệt này. Xoá dữ liệu trình duyệt hoặc đổi máy sẽ mất — hãy xuất file định kỳ.
          </p>
          <div className="space-y-2">
            <button
              onClick={handleExport}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              <Download className="w-4 h-4" /> Xuất file sao lưu (.json)
            </button>
            <button
              onClick={() => pickFile('merge')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Upload className="w-4 h-4" /> Nhập file (gộp với hiện tại)
            </button>
            <button
              onClick={() => pickFile('replace')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            >
              <Upload className="w-4 h-4" /> Nhập file (thay thế tất cả)
            </button>
          </div>
          {message && (
            <p
              className={`mt-3 text-xs ${message.ok ? 'text-accent-600 dark:text-accent-400' : 'text-rose-500'}`}
              role="status"
            >
              {message.text}
            </p>
          )}
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />
        </div>
      )}
    </div>
  );
}
