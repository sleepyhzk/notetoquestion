// Lõi đồng bộ: biến AppData thành các "bản ghi" phẳng, so sánh với ảnh chụp lần đồng bộ trước
// và tính ra những gì cần đẩy lên / kéo về. Toàn bộ là hàm thuần nên test được độc lập.

import type { AppData } from '../types';
import { hashString } from '../utils/ids';

export type Kind = keyof AppData;
export const KINDS: Kind[] = [
  'notes',
  'noteFolders',
  'customExercises',
  'quizHistory',
  'wrongAnswers',
  'reviewSelections',
  'savedQuizzes',
];

/** Một dòng trong bảng `records` trên Supabase. */
export interface SyncRow {
  kind: Kind;
  subject_id: string;
  record_id: string;
  data: unknown;
  deleted: boolean;
  updated_at?: string;
}

export type Snapshot = Record<string, string>; // key -> fingerprint của bản ghi ở lần đồng bộ gần nhất

export type Decision =
  | { type: 'set'; kind: Kind; subjectId: string; recordId: string; payload: unknown }
  | { type: 'remove'; kind: Kind; subjectId: string; recordId: string };

const SEP = '\u001f';
export const makeKey = (kind: Kind, subjectId: string, recordId: string) => [kind, subjectId, recordId].join(SEP);
export function parseKey(key: string): { kind: Kind; subjectId: string; recordId: string } {
  const [kind, subjectId, ...rest] = key.split(SEP);
  return { kind: kind as Kind, subjectId, recordId: rest.join(SEP) };
}

/** JSON với khoá được sắp xếp: jsonb của Postgres đổi thứ tự khoá nên không thể so sánh JSON thô. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function fingerprint(payload: unknown): string {
  const json = stableStringify(payload);
  return `${hashString(json)}.${json.length}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function recordIdOf(kind: Kind, item: unknown): string | null {
  if (kind === 'reviewSelections') return typeof item === 'string' && item ? item : null;
  if (!isObj(item)) return null;
  const id = kind === 'wrongAnswers' ? item.questionId : item.id;
  return typeof id === 'string' && id ? id : null;
}

function toPayload(kind: Kind, item: unknown): unknown {
  return kind === 'reviewSelections' ? { id: item } : item;
}

function fromPayload(kind: Kind, payload: unknown): unknown | null {
  if (kind === 'reviewSelections') return isObj(payload) && typeof payload.id === 'string' ? payload.id : null;
  return isObj(payload) ? payload : null;
}

/** Phẳng hoá AppData thành Map key -> payload. */
export function flatten(data: AppData): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const kind of KINDS) {
    const bySubject = data[kind] as Record<string, unknown[]>;
    for (const [subjectId, items] of Object.entries(bySubject)) {
      for (const item of items) {
        const recordId = recordIdOf(kind, item);
        if (recordId) out.set(makeKey(kind, subjectId, recordId), toPayload(kind, item));
      }
    }
  }
  return out;
}

export interface LocalDiff {
  upserts: { key: string; row: SyncRow; fp: string }[];
  deletes: string[];
}

/** Những gì đã đổi trên máy kể từ lần đồng bộ trước. */
export function diffLocal(data: AppData, snapshot: Snapshot): LocalDiff {
  const flat = flatten(data);
  const upserts: LocalDiff['upserts'] = [];
  for (const [key, payload] of flat) {
    const fp = fingerprint(payload);
    if (snapshot[key] === fp) continue;
    const { kind, subjectId, recordId } = parseKey(key);
    upserts.push({ key, fp, row: { kind, subject_id: subjectId, record_id: recordId, data: payload, deleted: false } });
  }
  const deletes = Object.keys(snapshot).filter((key) => !flat.has(key));
  return { upserts, deletes };
}

export function tombstone(key: string): SyncRow {
  const { kind, subjectId, recordId } = parseKey(key);
  return { kind, subject_id: subjectId, record_id: recordId, data: {}, deleted: true };
}

export interface RemotePlan {
  decisions: Decision[];
  snapshotSet: Record<string, string>;
  snapshotRemove: string[];
  skippedPending: number;
}

/**
 * Quyết định áp dụng những dòng kéo về từ máy chủ.
 * Nguyên tắc: bản ghi đang có thay đổi chưa đẩy lên trên máy (local ≠ snapshot) thì GIỮ NGUYÊN,
 * vì lần đồng bộ tiếp theo sẽ đẩy nó lên (người sửa sau thắng).
 */
export function planRemote(data: AppData, snapshot: Snapshot, rows: SyncRow[]): RemotePlan {
  const flat = flatten(data);
  const latest = new Map<string, SyncRow>(); // dòng cuối cùng của mỗi key
  for (const row of rows) latest.set(makeKey(row.kind, row.subject_id, row.record_id), row);

  const plan: RemotePlan = { decisions: [], snapshotSet: {}, snapshotRemove: [], skippedPending: 0 };
  for (const [key, row] of latest) {
    const localPayload = flat.get(key);
    const localFp = localPayload === undefined ? undefined : fingerprint(localPayload);
    if (localFp !== snapshot[key]) {
      plan.skippedPending++;
      continue;
    }
    if (row.deleted) {
      if (localFp !== undefined) plan.decisions.push({ type: 'remove', kind: row.kind, subjectId: row.subject_id, recordId: row.record_id });
      plan.snapshotRemove.push(key);
      continue;
    }
    if (fromPayload(row.kind, row.data) === null) continue; // dữ liệu hỏng -> bỏ qua
    const fp = fingerprint(row.data);
    plan.snapshotSet[key] = fp;
    if (fp !== localFp) {
      plan.decisions.push({ type: 'set', kind: row.kind, subjectId: row.subject_id, recordId: row.record_id, payload: row.data });
    }
  }
  return plan;
}

/** Áp các quyết định vào AppData (bất biến). */
export function applyDecisions(data: AppData, decisions: Decision[]): AppData {
  if (decisions.length === 0) return data;
  const next: AppData = {
    notes: { ...data.notes },
    noteFolders: { ...data.noteFolders },
    customExercises: { ...data.customExercises },
    quizHistory: { ...data.quizHistory },
    wrongAnswers: { ...data.wrongAnswers },
    reviewSelections: { ...data.reviewSelections },
    savedQuizzes: { ...data.savedQuizzes },
  };
  const touched = new Set<string>();

  for (const d of decisions) {
    const bucket = next[d.kind] as Record<string, unknown[]>;
    const list = [...(bucket[d.subjectId] ?? [])];
    const idx = list.findIndex((item) => recordIdOf(d.kind, item) === d.recordId);
    if (d.type === 'remove') {
      if (idx >= 0) list.splice(idx, 1);
    } else {
      const value = fromPayload(d.kind, d.payload);
      if (value === null) continue;
      if (idx >= 0) list[idx] = value;
      else list.push(value);
    }
    bucket[d.subjectId] = list;
    touched.add(`${d.kind}${SEP}${d.subjectId}`);
  }

  // Giữ thứ tự hiển thị quen thuộc cho các danh sách vừa bị đụng tới.
  for (const t of touched) {
    const [kind, subjectId] = t.split(SEP) as [Kind, string];
    const bucket = next[kind] as Record<string, unknown[]>;
    if (kind === 'quizHistory') {
      bucket[subjectId] = [...(bucket[subjectId] as { date: number }[])].sort((a, b) => a.date - b.date);
    } else if (kind === 'savedQuizzes') {
      bucket[subjectId] = [...(bucket[subjectId] as { createdAt: number }[])].sort((a, b) => b.createdAt - a.createdAt);
    } else if (kind === 'wrongAnswers') {
      bucket[subjectId] = [...(bucket[subjectId] as { addedAt: number }[])].sort((a, b) => b.addedAt - a.addedAt);
    }
  }
  return next;
}
