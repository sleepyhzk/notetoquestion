import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type AuthResult = { ok: true; message?: string } | { ok: false; error: string };

function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email hoặc mật khẩu không đúng.';
  if (m.includes('email not confirmed')) return 'Email chưa được xác nhận. Hãy bấm vào liên kết trong thư Supabase đã gửi.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Email này đã được đăng ký. Hãy chuyển sang Đăng nhập.';
  if (m.includes('password') && (m.includes('at least') || m.includes('weak') || m.includes('short'))) return 'Mật khẩu quá yếu (tối thiểu 6 ký tự).';
  if (m.includes('rate limit') || m.includes('too many')) return 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'Email không hợp lệ.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  return message;
}

export function useAuth() {
  const configured = supabase !== null;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [recovery, setRecovery] = useState(false); // đang ở bước đặt lại mật khẩu từ email

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, error: 'Chưa cấu hình Supabase.' };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? { ok: false, error: translateError(error.message) } : { ok: true };
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, error: 'Chưa cấu hình Supabase.' };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return { ok: false, error: translateError(error.message) };
    // Không có session = dự án đang bật "Confirm email": cần bấm liên kết trong thư.
    if (!data.session) return { ok: true, message: 'Đã gửi thư xác nhận. Hãy mở thư, bấm liên kết, rồi quay lại đăng nhập.' };
    return { ok: true };
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, error: 'Chưa cấu hình Supabase.' };
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    return error
      ? { ok: false, error: translateError(error.message) }
      : { ok: true, message: 'Nếu email tồn tại, thư đặt lại mật khẩu đã được gửi.' };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, error: 'Chưa cấu hình Supabase.' };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, error: translateError(error.message) };
    setRecovery(false);
    return { ok: true, message: 'Đã đổi mật khẩu.' };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return { configured, user, loading, recovery, signIn, signUp, resetPassword, updatePassword, signOut };
}

export type AuthApi = ReturnType<typeof useAuth>;
