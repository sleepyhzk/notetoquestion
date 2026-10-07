import { useState } from 'react';
import { Check, Cloud, CloudOff, Loader2, LogOut, RefreshCw, X } from 'lucide-react';
import type { AuthApi, AuthResult } from '../hooks/useAuth';
import type { CloudSyncApi } from '../hooks/useCloudSync';

interface CloudMenuProps {
  auth: AuthApi;
  cloud: CloudSyncApi;
}

type Mode = 'signin' | 'signup' | 'forgot';

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent';
const primaryBtn =
  'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-60 transition-colors';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function CloudMenu({ auth, cloud }: CloudMenuProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const { status } = cloud;
  const signedIn = auth.user !== null;
  // Đang ở bước đặt lại mật khẩu từ email -> luôn mở bảng để người dùng nhập mật khẩu mới.
  const isOpen = open || auth.recovery;

  const show = (r: AuthResult) => setMessage(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (auth.recovery) {
        const r = await auth.updatePassword(password);
        show(r);
        if (r.ok) setPassword('');
      } else if (mode === 'forgot') {
        show(await auth.resetPassword(email));
      } else if (mode === 'signup') {
        const r = await auth.signUp(email, password);
        show(r);
        if (r.ok && r.message) setMode('signin');
      } else {
        const r = await auth.signIn(email, password);
        show(r);
        if (r.ok) setPassword('');
      }
    } finally {
      setBusy(false);
    }
  };

  // Biểu tượng + chấm trạng thái trên nút
  let icon = <Cloud className="w-5 h-5 text-gray-600 dark:text-gray-300" />;
  let dot = '';
  if (!auth.configured) icon = <CloudOff className="w-5 h-5 text-gray-400" />;
  else if (signedIn && status.phase === 'syncing') icon = <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />;
  else if (signedIn && status.phase === 'error') dot = 'bg-rose-500';
  else if (signedIn) dot = 'bg-emerald-500';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Đồng bộ đám mây"
        aria-expanded={isOpen}
        title="Đồng bộ đám mây"
      >
        {icon}
        {dot && <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${dot}`} />}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] card p-4 shadow-xl z-20 animate-scale-in">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Đồng bộ đám mây</h3>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Đóng">
              <X className="w-4 h-4" />
            </button>
          </div>

          {!auth.configured && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Chưa cấu hình Supabase nên ghi chú chỉ lưu trên máy này. Điền <code>VITE_SUPABASE_URL</code> và{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> trong file <code>.env</code> để bật đồng bộ.
            </p>
          )}

          {auth.configured && auth.loading && <p className="text-xs text-gray-500">Đang kiểm tra đăng nhập…</p>}

          {/* Đặt mật khẩu mới (từ email quên mật khẩu) */}
          {auth.configured && !auth.loading && auth.recovery && (
            <form onSubmit={submit} className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">Nhập mật khẩu mới cho tài khoản của bạn.</p>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                className={inputClass}
              />
              <button type="submit" disabled={busy} className={primaryBtn}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Đổi mật khẩu
              </button>
            </form>
          )}

          {/* Đã đăng nhập */}
          {auth.configured && !auth.loading && !auth.recovery && signedIn && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 break-all">
                Đang đăng nhập: <span className="font-medium text-gray-700 dark:text-gray-200">{auth.user?.email}</span>
              </p>
              <div className="flex items-center gap-2 text-xs">
                {status.phase === 'syncing' && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500" /> Đang đồng bộ…
                  </>
                )}
                {status.phase === 'idle' && status.lastSyncedAt && (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" /> Đã đồng bộ lúc {formatTime(status.lastSyncedAt)}
                  </>
                )}
                {status.phase === 'idle' && !status.lastSyncedAt && <span className="text-gray-500">Chưa đồng bộ lần nào.</span>}
                {status.phase === 'error' && <span className="text-rose-500">Lỗi: {status.error}</span>}
              </div>
              {status.warning && <p className="text-[11px] text-amber-600 dark:text-amber-400">{status.warning}</p>}
              <button onClick={() => void cloud.syncNow()} disabled={status.phase === 'syncing'} className={primaryBtn}>
                <RefreshCw className="w-4 h-4" /> Đồng bộ ngay
              </button>
              <button
                onClick={() => void auth.signOut()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Đăng xuất
              </button>
              <p className="text-[11px] text-gray-400">
                Ghi chú tự đồng bộ sau mỗi thay đổi. Nếu hai thiết bị cùng sửa một ghi chú, bản lưu sau cùng được giữ.
              </p>
            </div>
          )}

          {/* Chưa đăng nhập */}
          {auth.configured && !auth.loading && !auth.recovery && !signedIn && (
            <form onSubmit={submit} className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {mode === 'forgot'
                  ? 'Nhập email, mình sẽ gửi liên kết đặt lại mật khẩu.'
                  : 'Đăng nhập để ghi chú được lưu trên đám mây và dùng được trên nhiều thiết bị. Dữ liệu hiện có trên máy sẽ được gộp lên, không bị mất.'}
              </p>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className={inputClass}
              />
              {mode !== 'forgot' && (
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mật khẩu (tối thiểu 6 ký tự)"
                  className={inputClass}
                />
              )}
              <button type="submit" disabled={busy} className={primaryBtn}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === 'signin' ? 'Đăng nhập' : mode === 'signup' ? 'Tạo tài khoản' : 'Gửi liên kết'}
              </button>
              <div className="flex justify-between text-xs pt-1">
                {mode === 'signin' ? (
                  <>
                    <button type="button" onClick={() => { setMode('signup'); setMessage(null); }} className="text-primary-600 dark:text-primary-400 hover:underline">
                      Tạo tài khoản mới
                    </button>
                    <button type="button" onClick={() => { setMode('forgot'); setMessage(null); }} className="text-gray-500 hover:underline">
                      Quên mật khẩu?
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setMode('signin'); setMessage(null); }} className="text-primary-600 dark:text-primary-400 hover:underline">
                    ← Quay lại đăng nhập
                  </button>
                )}
              </div>
            </form>
          )}

          {message && (
            <p className={`mt-3 text-xs ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`} role="status">
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
