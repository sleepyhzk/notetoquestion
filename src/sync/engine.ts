// Động cơ đồng bộ hai chiều. Không phụ thuộc React hay Supabase (chỉ dùng giao diện CloudStore)
// nên có thể test bằng máy chủ giả.

import type { AppData } from '../types';
import {
  diffLocal,
  planRemote,
  tombstone,
  type Decision,
  type Kind,
  type Snapshot,
  type SyncRow,
} from './records';

export interface CloudStore {
  /** Upsert các dòng (ghi đè theo khoá). Ném lỗi nếu thất bại. */
  push(rows: SyncRow[]): Promise<void>;
  /** Trả về mọi dòng có updated_at >= sinceMs (0 = tất cả). */
  pull(sinceMs: number): Promise<SyncRow[]>;
}

export interface SyncState {
  snapshot: Snapshot;
  cursor: number; // mốc updated_at lớn nhất đã kéo về (ms)
}

export interface EngineDeps {
  store: CloudStore;
  getData: () => AppData;
  /** Phải cập nhật trạng thái ứng dụng ĐỒNG BỘ (không await). */
  applyRemote: (decisions: Decision[]) => void;
  loadState: () => SyncState;
  saveState: (state: SyncState) => void;
  /** Hỏi người dùng khi sắp xoá hàng loạt trên đám mây. */
  confirmMassDelete: (deleteCount: number, total: number) => boolean;
}

export interface SyncReport {
  pushed: number;
  deleted: number;
  applied: number;
  keptLocal: number;
  restoredFromCloud: boolean;
  /** Số bản ghi thuộc loại mới bị bỏ qua vì bảng trên Supabase chưa được cập nhật. */
  optionalSkipped: number;
}

const BATCH = 200;
// Các loại dữ liệu thêm sau này. Nếu bảng trên Supabase chưa chạy migration mới thì chỉ bỏ qua chúng,
// ghi chú và các dữ liệu còn lại vẫn đồng bộ bình thường.
const OPTIONAL_KINDS = new Set<Kind>(['savedQuizzes']);
const isSchemaError = (err: unknown) => err instanceof Error && /records_kind_check|violates check constraint/i.test(err.message);
const OVERLAP_MS = 5000; // kéo chồng một đoạn để không sót dòng commit trễ; áp dụng là idempotent
const MASS_DELETE_MIN = 10;
const MASS_DELETE_RATIO = 0.3;

export async function runSync(deps: EngineDeps): Promise<SyncReport> {
  const state = deps.loadState();
  const report: SyncReport = { pushed: 0, deleted: 0, applied: 0, keptLocal: 0, restoredFromCloud: false, optionalSkipped: 0 };

  // 1. Đẩy thay đổi cục bộ
  const diff = diffLocal(deps.getData(), state.snapshot);
  const total = Object.keys(state.snapshot).length;

  if (diff.deletes.length >= MASS_DELETE_MIN && diff.deletes.length >= total * MASS_DELETE_RATIO) {
    if (!deps.confirmMassDelete(diff.deletes.length, total)) {
      // Người dùng không muốn xoá: coi như chưa từng xoá, kéo lại toàn bộ từ đám mây để khôi phục.
      for (const key of diff.deletes) delete state.snapshot[key];
      diff.deletes = [];
      state.cursor = 0;
      report.restoredFromCloud = true;
    }
  }

  const work: { row: SyncRow; apply: () => void }[] = [
    ...diff.upserts.map((u) => ({ row: u.row, apply: () => void (state.snapshot[u.key] = u.fp) })),
    ...diff.deletes.map((key) => ({ row: tombstone(key), apply: () => void delete state.snapshot[key] })),
  ];
  const required = work.filter((w) => !OPTIONAL_KINDS.has(w.row.kind));
  const optional = work.filter((w) => OPTIONAL_KINDS.has(w.row.kind));
  try {
    for (let i = 0; i < required.length; i += BATCH) {
      const batch = required.slice(i, i + BATCH);
      await deps.store.push(batch.map((w) => w.row));
      batch.forEach((w) => w.apply());
      deps.saveState(state); // lưu tiến độ từng đợt để lỗi giữa chừng không phải làm lại từ đầu
    }
    for (let i = 0; i < optional.length; i += BATCH) {
      const batch = optional.slice(i, i + BATCH);
      try {
        await deps.store.push(batch.map((w) => w.row));
        batch.forEach((w) => w.apply());
        deps.saveState(state);
      } catch (err) {
        if (!isSchemaError(err)) throw err;
        report.optionalSkipped += optional.length - i; // bảng chưa hỗ trợ: dừng, thử lại ở lần sau
        break;
      }
    }
  } finally {
    deps.saveState(state);
  }
  report.pushed = diff.upserts.length;
  report.deleted = diff.deletes.length;

  // 2. Kéo thay đổi từ đám mây
  const since = state.cursor > 0 ? Math.max(0, state.cursor - OVERLAP_MS) : 0;
  const rows = await deps.store.pull(since);

  const plan = planRemote(deps.getData(), state.snapshot, rows);
  if (plan.decisions.length > 0) deps.applyRemote(plan.decisions);
  Object.assign(state.snapshot, plan.snapshotSet);
  for (const key of plan.snapshotRemove) delete state.snapshot[key];
  for (const row of rows) {
    const t = row.updated_at ? Date.parse(row.updated_at) : NaN;
    if (!Number.isNaN(t) && t > state.cursor) state.cursor = t;
  }
  deps.saveState(state);

  report.applied = plan.decisions.length;
  report.keptLocal = plan.skippedPending;
  return report;
}
