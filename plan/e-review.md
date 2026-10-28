# Hướng E: duyệt câu hỏi + AI soạn nháp thẻ myth

> Cập nhật 27/10: phần câu hỏi người dùng (duyệt câu hỏi, `GET /questions/answered`) đã bỏ, chỉ còn AI soạn nháp. Lý do: [decisions.md](decisions.md), mục 27/10.

Làm 26/10/2026 trên nhánh `feat/review`, PR #6 (chờ review + merge), trước hướng A (mở công khai) dù kế hoạch [after-mvp.md](after-mvp.md) xếp sau A: chạy được trên máy, chưa cần triển khai. Quyết định và lý do: [decisions.md](decisions.md), mục 26/10.

## Đã làm
- [x] Giao diện duyệt, mở bằng `#review` (không có trong menu): đăng nhập người duyệt, lọc câu hỏi theo trạng thái (kèm số đếm), đổi `new` / `accepted` / `rejected` / `answered`, gắn với luật hoặc thẻ đã seed (kể cả chưa bật), ghi chú nội bộ
  - Backend: `app/review_api.py` (route `/review/...`), `app/reviewers.py` (mật khẩu scrypt, phiên 12 giờ chỉ lưu sha256 của token), `scripts/reviewers.py`
  - Câu `answered` bắt buộc có luật và câu hỏi công khai do người duyệt viết lại
- [x] Hiện cho người dùng câu hỏi đã được trả lời: `GET /questions/answered`, mục "Câu hỏi bạn đọc đã được trả lời" trên trang "Sự thật hay myth". Chỉ hiện khi luật đã bật và còn nguồn; dùng lời người duyệt viết lại, không bao giờ dùng văn bản gốc
- [x] AI soạn bản nháp thẻ myth (`app/drafts.py`, `POST /review/drafts`):
  - Người duyệt chọn hai nhóm hoạt chất, dán 1–5 link nguồn, dặn thêm nếu cần; có thể gắn với một câu hỏi
  - Máy chủ tải văn bản đọc được của từng trang, gửi cho Claude kèm câu hỏi và các thẻ myth đã bật (chỉ để học văn phong); Claude trả JSON có cấu trúc
  - Máy chủ tìm lại từng đoạn trích trên trang đã tải, như `verify_quotes`; đoạn trích không thấy, hoặc ở link không ai đưa, bị đánh dấu
  - Nháp lưu ở `rule_drafts`, gắn nhãn "chưa kiểm duyệt", không bao giờ hiện cho người dùng; kèm TOML để dán vào `rules.toml` (`published = false`, đoạn trích không thấy để thành chú thích, khối `[[source]]` cho trang mới)
  - Người duyệt đọc nguồn và tự bật như mọi luật; bỏ hoặc khôi phục nháp trên trang duyệt
- [ ] (Tuỳ chọn) AI diễn đạt lại `explanation_vi`: để sau khi `feat/accuracy` vào `main` (xem decisions.md)

## Kiểm tra
- `tests/test_review.py`: đăng nhập / đăng xuất / phiên hết hạn, mọi route `/review` cần token, trả lời câu hỏi và danh sách công khai (không lộ văn bản gốc), luật chưa bật thì câu hỏi không hiện, nháp: kiểm tra đoạn trích, URL lạ bị bỏ, khoá không trùng, TOML đọc được và qua `rule_problems`, nháp không vào `/rules`; gọi Claude qua SDK thật với HTTP giả (dạng request, `fallbacks`, từ chối, lỗi xác thực)
- Chạy thật trên máy (backend + Vite, DB test): đăng nhập, trả lời câu hỏi, danh sách công khai, tải trang AAD thật để soạn nháp; không có API key nên dừng ở lỗi 503 có thông báo rõ

## Giới hạn đã biết
- **Chưa thử với API Claude thật** (máy dev không có `ANTHROPIC_API_KEY`). Lần đầu có key: soạn thử một nháp cho một thẻ đã bật, so với thẻ thật
- Chưa giới hạn số lần đăng nhập sai (scrypt chỉ làm chậm mỗi lần thử). Thêm cùng giới hạn tần suất ở hướng A
- Máy chủ tải link người duyệt đưa (chỉ `http`/`https`, chỉ người đã đăng nhập). Khi mở công khai, chặn địa chỉ nội bộ (SSRF)
- Soạn nháp chạy đồng bộ trong request, mất 1–2 phút; đủ cho một vài người duyệt
- Bản nháp không sửa được trên trang duyệt: sửa trong `rules.toml` sau khi dán
- Trang duyệt chưa kiểm tra bằng trình duyệt tự động; chỉ qua `npm run build` + `npm run lint` và gọi API qua proxy Vite
