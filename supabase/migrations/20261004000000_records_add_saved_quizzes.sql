-- Thêm loại dữ liệu "savedQuizzes" (bộ câu hỏi đã lưu) vào bảng records.
-- Chạy file này nếu bạn đã tạo bảng records từ phiên bản trước. An toàn khi chạy lại nhiều lần.

alter table public.records drop constraint if exists records_kind_check;
alter table public.records add constraint records_kind_check
  check (kind in ('notes','noteFolders','customExercises','quizHistory','wrongAnswers','reviewSelections','savedQuizzes'));
