-- Bảng lưu dữ liệu đồng bộ của ứng dụng: mỗi dòng là một bản ghi (ghi chú, thư mục, câu sai...).
-- Mỗi người dùng chỉ thấy và sửa được dữ liệu của chính mình (Row Level Security).

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('notes','noteFolders','customExercises','quizHistory','wrongAnswers','reviewSelections','savedQuizzes')),
  subject_id text        not null check (char_length(subject_id) <= 200),
  record_id  text        not null check (char_length(record_id) <= 200),
  data       jsonb       not null default '{}'::jsonb check (octet_length(data::text) <= 1000000),
  deleted    boolean     not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, subject_id, record_id)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);

alter table public.records enable row level security;

-- Chỉ người đã đăng nhập mới được truy cập; khách (anon) hoàn toàn không.
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

drop policy if exists records_select_own on public.records;
drop policy if exists records_insert_own on public.records;
drop policy if exists records_update_own on public.records;
drop policy if exists records_delete_own on public.records;

create policy records_select_own on public.records for select to authenticated
  using ((select auth.uid()) = user_id);
create policy records_insert_own on public.records for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy records_update_own on public.records for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy records_delete_own on public.records for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Máy chủ tự đóng dấu thời gian (không tin đồng hồ máy khách) và không cho đổi chủ sở hữu.
create or replace function public.records_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.records_touch();
