import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AppData } from '../types';
import { supabase } from '../lib/supabase';
import { runSync, type SyncState } from '../sync/engine';
import { createSupabaseStore } from '../sync/supabaseStore';
import { diffLocal, flatten, type Decision } from '../sync/records';

const STATE_KEY = (uid: string) => `kien-thuc-sync-v1:${uid}`;
const OWNER_KEY = 'kien-thuc-sync-owner';
const AUTO_DELAY_MS = 1500;
const POLL_MS = 120_000;

export type SyncPhase = 'idle' | 'syncing' | 'error';
export interface SyncStatus {
  phase: SyncPhase;
  lastSyncedAt: number | null;
  error: string | null;
  warning: string | null;
}

function loadState(uid: string): SyncState {
  try {
    const raw = localStorage.getItem(STATE_KEY(uid));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SyncState>;
      if (parsed && typeof parsed.cursor === 'number' && parsed.snapshot && typeof parsed.snapshot === 'object') {
        return { snapshot: parsed.snapshot as SyncState['snapshot'], cursor: parsed.cursor };
      }
    }
  } catch {
    // trạng thái hỏng -> đồng bộ lại từ đầu (an toàn, vì chỉ gộp)
  }
  return { snapshot: {}, cursor: 0 };
}

interface Options {
  user: User | null;
  data: AppData;
  applyRemote: (decisions: Decision[]) => void;
  clearLocal: () => void;
  onRejectUser: () => void;
}

export function useCloudSync({ user, data, applyRemote, clearLocal, onRejectUser }: Options) {
  const [status, setStatus] = useState<SyncStatus>({ phase: 'idle', lastSyncedAt: null, error: null, warning: null });
  const [readyFor, setReadyFor] = useState<string | null>(null);

  // Luôn trỏ tới dữ liệu mới nhất đã render, để engine đọc đúng thời điểm.
  const dataRef = useRef(data);
  dataRef.current = data;
  const applyRef = useRef(applyRemote);
  applyRef.current = applyRemote;

  const running = useRef(false);
  const queued = useRef(false);
  const userId = user?.id ?? null;

  const sync = useCallback(async () => {
    if (!supabase || !userId) return;
    if (running.current) {
      queued.current = true; // đang chạy: chạy thêm một lượt ngay sau đó
      return;
    }
    running.current = true;
    setStatus((s) => ({ ...s, phase: 'syncing', error: null }));
    let skipped = 0;
    try {
      do {
        queued.current = false;
        const report = await runSync({
          store: createSupabaseStore(supabase, userId),
          getData: () => dataRef.current,
          applyRemote: (decisions) => applyRef.current(decisions),
          loadState: () => loadState(userId),
          saveState: (state) => {
            try {
              localStorage.setItem(STATE_KEY(userId), JSON.stringify(state));
            } catch {
              // đầy bộ nhớ: lần sau sẽ gộp lại, không mất dữ liệu
            }
          },
          confirmMassDelete: (count, total) =>
            window.confirm(
              `Máy này sắp xoá ${count}/${total} mục trên đám mây (thường do dữ liệu trên máy bị mất hoặc vừa nhập đè).\n\nBấm OK nếu bạn THỰC SỰ muốn xoá.\nBấm Huỷ để giữ lại và khôi phục từ đám mây.`,
            ),
        });
        skipped = report.optionalSkipped;
      } while (queued.current);
      setStatus({
        phase: 'idle',
        lastSyncedAt: Date.now(),
        error: null,
        warning:
          skipped > 0
            ? 'Các bộ câu hỏi đã lưu chưa lên được đám mây vì bảng trên Supabase chưa cập nhật. Hãy chạy file migration mới (xem README).'
            : null,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      const friendly = /failed to fetch|network|load failed/i.test(raw)
        ? 'Không có kết nối mạng. Sẽ tự thử lại khi có mạng.'
        : /relation .*records.* does not exist|schema cache|could not find the table/i.test(raw)
          ? 'Chưa tạo bảng "records" trên Supabase. Hãy chạy file supabase/migrations/…create_records.sql (xem README).'
          : raw || 'Đồng bộ thất bại.';
      setStatus((s) => ({ ...s, phase: 'error', error: friendly }));
    } finally {
      running.current = false;
    }
  }, [userId]);

  // 1. Khi đăng nhập: bảo vệ dữ liệu của tài khoản khác đang nằm trên trình duyệt này.
  useEffect(() => {
    if (!userId) {
      setReadyFor(null);
      setStatus({ phase: 'idle', lastSyncedAt: null, error: null, warning: null });
      return;
    }
    const owner = localStorage.getItem(OWNER_KEY);
    const hasLocal = flatten(dataRef.current).size > 0;
    if (owner && owner !== userId && hasLocal) {
      const wipe = window.confirm(
        'Trình duyệt này đang chứa ghi chú của một tài khoản KHÁC.\n\nOK: xoá dữ liệu trên máy và dùng dữ liệu của tài khoản vừa đăng nhập.\nHuỷ: đăng xuất (không đồng bộ gì cả).',
      );
      if (!wipe) {
        onRejectUser();
        return;
      }
      clearLocal();
    }
    try {
      localStorage.setItem(OWNER_KEY, userId);
    } catch {
      // bỏ qua
    }
    setReadyFor(userId);
  }, [userId, clearLocal, onRejectUser]);

  // 2. Đồng bộ ngay sau khi sẵn sàng (đã xử lý xong bước trên và dữ liệu đã render lại).
  useEffect(() => {
    if (readyFor && readyFor === userId) void sync();
  }, [readyFor, userId, sync]);

  // 3. Tự đẩy lên sau khi người dùng ngừng thao tác một chút.
  useEffect(() => {
    if (!userId || readyFor !== userId) return;
    const timer = window.setTimeout(() => {
      const pending = diffLocal(dataRef.current, loadState(userId).snapshot);
      if (pending.upserts.length > 0 || pending.deletes.length > 0) void sync();
    }, AUTO_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [data, userId, readyFor, sync]);

  // 4. Kéo thay đổi từ thiết bị khác khi quay lại tab, có mạng lại, và định kỳ.
  useEffect(() => {
    if (!userId || readyFor !== userId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const onOnline = () => void sync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    const poll = window.setInterval(onVisible, POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.clearInterval(poll);
    };
  }, [userId, readyFor, sync]);

  return { status, syncNow: sync };
}

export type CloudSyncApi = ReturnType<typeof useCloudSync>;
