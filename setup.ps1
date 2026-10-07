# Cài đặt tự động cho Windows: tạo .env, đặt khóa Gemini, triển khai 2 function.
# Chạy trong PowerShell:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Run([string]$cmd) {
  Write-Host "> $cmd" -ForegroundColor DarkGray
  Invoke-Expression $cmd
  if ($LASTEXITCODE -ne 0) { throw "Lệnh thất bại: $cmd" }
}

Write-Host "== Cài đặt Quản lý Kiến thức =="
Write-Host "Cần: Node.js, tài khoản Supabase, khóa Gemini (https://aistudio.google.com/apikey)"
Write-Host ""

$ref  = Read-Host "Project ref (phần đầu của https://<ref>.supabase.co)"
$anon = Read-Host "Khóa anon/public (Project Settings > API)"
$secure = Read-Host "Khóa Gemini API (nhập sẽ không hiện ra)" -AsSecureString
$gkey = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

if (-not $ref -or -not $anon -or -not $gkey) { throw "Thiếu thông tin, dừng lại." }

if (Test-Path .env) {
  Copy-Item .env .env.bak -Force
  Write-Host "Đã sao lưu .env cũ thành .env.bak"
}
# Ghi UTF-8 KHÔNG BOM để Vite đọc đúng biến đầu tiên
$envText = "VITE_SUPABASE_URL=https://$ref.supabase.co`nVITE_SUPABASE_ANON_KEY=$anon`n"
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot ".env"), $envText, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "[1/6] Đã tạo .env"

Write-Host "[2/6] Cài thư viện..."
Run "npm install"

Write-Host "[3/6] Đăng nhập Supabase (sẽ mở trình duyệt)..."
Run "npx supabase login"
Run "npx supabase link --project-ref $ref"

Write-Host "[4/6] Đặt khóa Gemini..."
Run "npx supabase secrets set GEMINI_API_KEY=$gkey"

Write-Host "[5/6] Triển khai function..."
Run "npx supabase functions deploy generate-quiz"
Run "npx supabase functions deploy chat-ai"
Run "npx supabase functions deploy translate-quiz"
Run "npx supabase functions deploy explain-quiz"

Write-Host "[6/6] Tạo bảng dữ liệu đồng bộ (cần mật khẩu database đặt lúc tạo project)..."
try {
  Run "npx supabase db push"
} catch {
  Write-Host ""
  Write-Host "!! Không tạo được bảng tự động. Làm thủ công (1 phút):" -ForegroundColor Yellow
  Write-Host "   Supabase Dashboard > SQL Editor > New query > dán nội dung file"
  Write-Host "   supabase/migrations/20261003000000_create_records.sql > Run"
}

Write-Host ""
Write-Host "Xong! Chạy thử:  npm run dev" -ForegroundColor Green
Write-Host "Nhớ cấu hình Authentication > URL Configuration trên Supabase (xem README, mục Đồng bộ)."
