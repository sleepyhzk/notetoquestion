# Quản lý Kiến thức Đại học

Ứng dụng ghi chú theo môn học, tự tạo câu hỏi trắc nghiệm từ ghi chú, ôn lại câu sai và hỏi trợ lý AI.
React 18 + TypeScript + Vite + Tailwind; backend là Supabase Edge Functions gọi Google Gemini.

## Cài đặt nhanh

```bash
bash setup.sh                 # Mac/Linux
# Windows: powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

Script sẽ tạo `.env`, đặt khóa Gemini và triển khai 2 function (dùng `npx supabase`, không cần cài CLI toàn cục).

## Chạy thử

```bash
npm install
cp .env.example .env     # điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY
npm run dev
```

Không có Supabase/AI thì ứng dụng vẫn chạy: quiz từ ghi chú sẽ dùng bộ tạo câu hỏi cục bộ
(`src/utils/quizGenerator.ts`) và chat AI sẽ báo chưa cấu hình.

## Cấu hình AI (Supabase)

```bash
npx supabase secrets set GEMINI_API_KEY=<khoa-gemini>
# tuỳ chọn: danh sách model thử lần lượt (mặc định: gemini-3.6-flash, gemini-3.5-flash-lite, gemini-flash-latest)
npx supabase secrets set GEMINI_MODELS=gemini-3.6-flash,gemini-3.5-flash-lite

npx supabase functions deploy generate-quiz
npx supabase functions deploy chat-ai
npx supabase functions deploy translate-quiz
npx supabase functions deploy explain-quiz
```

- Cả hai function đều yêu cầu JWT (`verify_jwt = true`) và có giới hạn tần suất theo IP.
- Tên model Gemini thay đổi theo thời gian; nếu AI không trả lời, kiểm tra log function và cập nhật `GEMINI_MODELS`.
- `GEMINI_API_KEY` chỉ đặt trong Supabase secrets, không bao giờ để trong `.env` của frontend.

## Đồng bộ ghi chú giữa nhiều thiết bị (Supabase)

Đăng nhập (biểu tượng đám mây ở trang chủ) để ghi chú, câu sai, lịch sử quiz... tự đồng bộ lên Supabase.
Không đăng nhập thì ứng dụng vẫn chạy như cũ, chỉ lưu trên máy.

**Thiết lập một lần:**

1. Tạo bảng: `npx supabase db push` (hỏi mật khẩu database), hoặc mở Dashboard → SQL Editor, dán **nội dung** file
   `supabase/migrations/20261003000000_create_records.sql` rồi bấm Run.
   Nếu bạn đã tạo bảng từ phiên bản cũ, chạy thêm nội dung file `supabase/migrations/20261004000000_records_add_saved_quizzes.sql`
   (để đồng bộ được các bộ câu hỏi đã lưu; chạy lại nhiều lần vẫn an toàn). Chưa chạy thì ghi chú vẫn đồng bộ bình thường,
   chỉ có bộ câu hỏi đã lưu là chưa lên đám mây.
2. Dashboard → Authentication → URL Configuration: đặt **Site URL** là địa chỉ web của bạn
   (khi chạy thử: `http://localhost:5173`) và thêm địa chỉ đó vào **Redirect URLs**.
3. (Tuỳ chọn) Authentication → Providers → Email: tắt **Confirm email** nếu muốn đăng ký xong dùng ngay
   mà không cần bấm liên kết trong thư.

**Cách hoạt động:** mỗi ghi chú / thư mục / câu sai... là một dòng trong bảng `records`, được bảo vệ bằng
Row Level Security nên mỗi tài khoản chỉ đọc và ghi được dữ liệu của mình. Máy khách đẩy các thay đổi sau ~1,5 giây,
kéo thay đổi từ thiết bị khác khi quay lại tab, khi có mạng lại và mỗi 2 phút.

**Lưu ý:**
- Hai thiết bị cùng sửa một ghi chú: bản lưu **sau cùng** được giữ (không gộp nội dung trong ghi chú).
- Lần đăng nhập đầu tiên, dữ liệu trên máy và trên đám mây được **gộp**, không bên nào bị mất.
- Nếu máy bỗng "mất" hàng loạt dữ liệu (xoá dữ liệu trình duyệt, nhập đè file sao lưu), app sẽ hỏi lại trước khi xoá trên đám mây.
- Đăng nhập tài khoản khác trên cùng trình duyệt sẽ hỏi có xoá dữ liệu cũ trên máy không, tránh trộn dữ liệu hai người.
- Xoá một mục là xoá thật trên đám mây (không có thùng rác). Vẫn nên xuất file sao lưu định kỳ.

## Bộ câu hỏi đã lưu & tiến trình làm bài

- Mỗi bộ câu hỏi tạo từ ghi chú được **lưu lại tự động** (mục "Bộ câu hỏi đã lưu"), làm lại bao nhiêu lần cũng được,
  chỉ mất khi bạn tự bấm xoá. Bộ câu hỏi cũng đồng bộ lên đám mây cùng ghi chú.
- Đang làm bài mà tải lại trang hoặc thoát ra: tiến trình (câu đang làm, đáp án đã chọn) được lưu trên máy và hiện nút
  **Làm tiếp** ở đầu tab Trắc nghiệm. Tiến trình làm dở chỉ lưu trên thiết bị đang dùng, không đồng bộ sang máy khác.
- Ứng dụng nhớ môn và tab bạn đang xem nên tải lại trang vẫn quay về đúng chỗ.

## Giải thích từng đáp án

Sau khi trả lời, ngoài phần "Giải thích" còn có mục **Phân tích từng đáp án**: đáp án đúng được giải thích vì sao đúng, và
**mỗi đáp án còn lại** được giải thích cụ thể vì sao sai (đáp án bạn chọn sai được đánh dấu riêng). Tab Cần ôn tập cũng hiện mục này.

- Bộ câu hỏi tạo **mới** từ ghi chú đã có sẵn phần này (AI sinh cùng lúc với câu hỏi), nên hiện ngay.
- Bộ câu hỏi **cũ**, ngân hàng câu hỏi hoặc câu tạo trên máy chưa có: khi bạn trả lời, AI phân tích một lần (vài giây) rồi lưu
  trên máy, lần sau hiện ngay. Cần deploy function `explain-quiz` (`npx supabase functions deploy explain-quiz`).
- Đang xem bản dịch EN/VI thì phần phân tích được viết đúng ngôn ngữ đang hiện.

## Hỏi AI về một câu hỏi

Khi làm trắc nghiệm có nút **Hỏi AI** cạnh nút ⭐ (và nút "Hỏi AI về câu này" ở mỗi câu trong tab Cần ôn tập).
Bấm vào thì chatbot tự mở và gửi sẵn câu hỏi cùng các đáp án để AI giải thích; bạn hỏi tiếp trong khung chat như bình thường.
Nếu bạn **chưa trả lời** câu đó, AI chỉ gợi ý kiến thức nền và **không tiết lộ đáp án**; trả lời xong thì AI giải thích đầy đủ
(vì sao đúng, vì sao các đáp án khác sai, chỗ dễ nhầm). Dùng chung function `chat-ai`, không cần deploy thêm.

## Phím tắt khi làm trắc nghiệm

- **Space:** chọn đáp án xong thì Space để xác nhận; xem giải thích xong thì Space để sang câu tiếp theo (câu cuối thì xem kết quả).
  Space không làm gì khi bạn chưa chọn đáp án, nên vẫn cuộn trang bình thường.

## Cần ôn tập & gắn sao

Tab **Cần ôn tập** hiện thẳng các câu để làm ngay (chọn đáp án là có kết quả và giải thích), có bộ lọc Tất cả / Câu sai / Gắn sao.

- **Câu sai:** làm đúng thì được bỏ khỏi danh sách.
- **Gắn sao (⭐):** bấm sao ở bất kỳ câu nào, cả khi đang làm trắc nghiệm lẫn trong tab này. Câu gắn sao vào danh sách và
  **ở lại dù làm đúng**, chỉ rời đi khi bạn bỏ sao (nếu câu đó đang sai thì vẫn ở lại cho tới khi làm đúng).
- Bấm "Xóa câu sai" chỉ xóa các câu sai, câu gắn sao vẫn được giữ.
- Danh sách này đồng bộ lên đám mây cùng dữ liệu khác.

## Đổi ngôn ngữ câu hỏi (Việt ⇄ Anh)

Khi làm bài có nút **VI | EN** phía trên câu hỏi. Bấm sang ngôn ngữ khác, các câu chưa ở ngôn ngữ đó sẽ được AI dịch
(câu đang làm và các câu kế tiếp được dịch trước). Đáp án đúng và kết quả làm bài không đổi vì thứ tự đáp án được giữ nguyên.
Bản dịch được lưu trên máy theo nội dung câu hỏi nên chuyển qua lại lần sau là tức thì và không tốn thêm lượt AI.
Cần deploy function `translate-quiz` (`npx supabase functions deploy translate-quiz`) và có `GEMINI_API_KEY`.
Bản dịch chỉ lưu trên thiết bị đang dùng, không đồng bộ lên đám mây.

## Dữ liệu & sao lưu

Dữ liệu luôn được lưu trong `localStorage` của trình duyệt (và đồng bộ lên đám mây nếu bạn đăng nhập). Dùng nút **Sao lưu** (biểu tượng ổ đĩa ở trang chủ)
để xuất/nhập file JSON — nên xuất định kỳ, vì xoá dữ liệu trình duyệt hoặc đổi máy sẽ mất ghi chú.

## Triển khai lên Vercel

Đã có sẵn `vercel.json` (nhận diện Vite, build `npm run build`, thư mục `dist`, chuyển mọi đường dẫn về `index.html`).

```bash
npx vercel                     # lần đầu: đăng nhập, trả lời các câu hỏi (cứ Enter)
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
npx vercel --prod              # build và đưa lên địa chỉ chính thức
```

Sau đó vào Supabase → Authentication → URL Configuration: đặt **Site URL** là địa chỉ Vercel
(`https://<ten>.vercel.app`) và thêm nó vào **Redirect URLs**.
Chỉ đặt hai biến `VITE_*` trên Vercel; **không** đặt khóa Gemini (khóa đó nằm trong Supabase secrets).

## Build & triển khai (nơi khác)

```bash
npm run build     # kết quả ở dist/, đã kèm _redirects (SPA) lấy từ public/
```
#   n o t e t o q u e s t i o n  
 