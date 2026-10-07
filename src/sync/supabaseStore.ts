import type { SupabaseClient } from '@supabase/supabase-js';
import type { CloudStore } from './engine';
import { KINDS, type SyncRow } from './records';

const PAGE = 1000; // giới hạn mặc định của PostgREST mỗi lần trả về
const PUSH_CHUNK = 200;

export function createSupabaseStore(client: SupabaseClient, userId: string): CloudStore {
  return {
    async push(rows) {
      for (let i = 0; i < rows.length; i += PUSH_CHUNK) {
        const chunk = rows.slice(i, i + PUSH_CHUNK).map((r) => ({
          user_id: userId,
          kind: r.kind,
          subject_id: r.subject_id,
          record_id: r.record_id,
          data: r.data,
          deleted: r.deleted,
        }));
        const { error } = await client.from('records').upsert(chunk, { onConflict: 'user_id,kind,subject_id,record_id' });
        if (error) throw new Error(error.message);
      }
    },

    async pull(sinceMs) {
      const out: SyncRow[] = [];
      for (let from = 0; ; from += PAGE) {
        let query = client
          .from('records')
          .select('kind,subject_id,record_id,data,deleted,updated_at')
          .order('updated_at', { ascending: true })
          .order('kind')
          .order('subject_id')
          .order('record_id')
          .range(from, from + PAGE - 1);
        if (sinceMs > 0) query = query.gte('updated_at', new Date(sinceMs).toISOString());
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        const page = (data ?? []) as SyncRow[];
        out.push(...page.filter((r) => KINDS.includes(r.kind)));
        if (page.length < PAGE) break;
      }
      return out;
    },
  };
}
