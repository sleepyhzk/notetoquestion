#!/usr/bin/env bash
# Cài đặt tự động: tạo .env, đặt khóa Gemini, triển khai 2 function.
# Chạy:  bash setup.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "== Cài đặt Quản lý Kiến thức =="
echo "Cần: Node.js, tài khoản Supabase, khóa Gemini (https://aistudio.google.com/apikey)"
echo

read -r -p "Project ref (phần đầu của https://<ref>.supabase.co): " REF
read -r -p "Khóa anon/public (Project Settings > API): " ANON
read -r -s -p "Khóa Gemini API (nhập sẽ không hiện ra): " GKEY
echo

if [[ -z "$REF" || -z "$ANON" || -z "$GKEY" ]]; then
  echo "Thiếu thông tin, dừng lại." >&2
  exit 1
fi

if [[ -f .env ]]; then
  cp .env ".env.bak"
  echo "Đã sao lưu .env cũ thành .env.bak"
fi
printf 'VITE_SUPABASE_URL=https://%s.supabase.co\nVITE_SUPABASE_ANON_KEY=%s\n' "$REF" "$ANON" > .env
echo "[1/6] Đã tạo .env"

echo "[2/6] Cài thư viện..."
npm install

echo "[3/6] Đăng nhập Supabase (sẽ mở trình duyệt)..."
npx supabase login
npx supabase link --project-ref "$REF"

echo "[4/6] Đặt khóa Gemini..."
npx supabase secrets set "GEMINI_API_KEY=$GKEY"

echo "[5/6] Triển khai function..."
npx supabase functions deploy generate-quiz
npx supabase functions deploy chat-ai
npx supabase functions deploy translate-quiz
npx supabase functions deploy explain-quiz

echo "[6/6] Tạo bảng dữ liệu đồng bộ (cần mật khẩu database đặt lúc tạo project)..."
if ! npx supabase db push; then
  echo
  echo "!! Không tạo được bảng tự động. Làm thủ công (1 phút):"
  echo "   Supabase Dashboard > SQL Editor > New query > dán nội dung file"
  echo "   supabase/migrations/20261003000000_create_records.sql > Run"
fi

echo
echo "Xong! Chạy thử:  npm run dev"
echo "Nhớ cấu hình Authentication > URL Configuration trên Supabase (xem README, mục Đồng bộ)."
