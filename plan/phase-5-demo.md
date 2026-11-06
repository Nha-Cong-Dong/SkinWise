# Giai đoạn 5: hoàn thiện demo, dự phòng

Bắt đầu 1/11 từ đánh giá sản phẩm (12 nhóm tiêu chí). Nhánh `feat/blog`.

## Làm ngay (1/11)

- [x] Commit + push `feat/blog` (trước đó ~38 file chưa commit)
- [x] Màn đăng nhập có phần "SkinWise làm gì?" và một ví dụ kết quả (tiêu đề luật chép nguyên văn), vì người mới / giám khảo chỉ thấy form. Giữ quyết định bắt buộc đăng nhập (26/10)
- [x] Sửa câu sai về chỗ lưu routine: chân trang ("lưu trên máy này và đồng bộ với tài khoản"), README (bảng tính năng, lộ trình: ảnh nhãn đã làm)
- [x] Giới hạn `/label/read`: 10 ảnh / giờ / tài khoản, 100 ảnh / ngày cho cả máy chủ (429, giao diện báo bằng tiếng Việt). Ở chế độ dev ai cũng tạo được tài khoản nên chỉ giới hạn theo tài khoản là chưa đủ
- [x] Kiểm tra routine lỗi: câu tiếng Việt (không hiện "Failed to fetch") + nút "Thử lại"
- [x] Trình đọc màn hình: chỉ đọc dòng tóm tắt kết quả (trước đây `aria-live` bọc cả bảng kết quả); nút "Xoá", "+ Sáng", "Thành phần", lên/xuống, bỏ bước, nhóm ngày dùng có tên sản phẩm
- [ ] Phương án dự phòng khi khoá AI hết hạn (xem dưới)

## Dự phòng ngày demo

Khoá cổng hackathon (`ANTHROPIC_BASE_URL`) hết hạn **10/11 lúc 01:47**, đúng ngày hạn chót. Sau giờ đó đọc ảnh nhãn và AI soạn nháp trả 503.

- [ ] Trước 9/11: quay video ngắn luồng đọc ảnh nhãn (chọn ảnh → chữ hiện → sửa `[?]` → đánh dấu đã so → phân tích) và chụp màn hình trang `#review` soạn nháp
- [ ] Kịch bản demo chính không cần AI: chọn sản phẩm mẫu → xếp lịch → cảnh báo + nguồn → thẻ myth → mục tiêu da → review cộng đồng (`scripts.demo_blog`)
- [ ] Tài khoản demo tạo sẵn và đã đăng nhập trên máy demo (chế độ dev)

## Ngắn hạn (1/11)

- [x] Giới hạn blog mỗi tài khoản mỗi giờ: 10 bài mới, 30 bình luận, 20 báo cáo (ảnh vẫn 30); 429 → câu tiếng Việt. Sửa bài không tính
- [x] Tách code: trang duyệt và các trang blog tải theo nhu cầu (bundle chính 398 → 323 KB, gzip 116 → 97 KB)
- [x] Font tự host (`public/fonts/`, OFL), bỏ Google Fonts: không còn request nào ra máy chủ khác. Lighthouse điện thoại 75 → 84, LCP 4,9 → 3,6 s (đo trên server thử không gzip)
- [x] Thẻ OG + ảnh xem trước 1200×630 (`public/og.png`); địa chỉ tuyệt đối lấy từ `SITE_URL` lúc build
- [x] Góp ý: link GitHub Issues ở chân trang (người dùng chọn 1/11), nhắc đừng ghi thông tin cá nhân vì issue công khai
- [x] CI: `.github/workflows/ci.yml` (ruff, pytest với Postgres 17, oxlint, build)
- [x] Cấu hình triển khai mẫu `deploy/`: nginx (HTTPS, gzip, cache, CSP và header bảo mật, `X-Forwarded-For` chống giả), systemd (1 worker vì giới hạn trong bộ nhớ, `--forwarded-allow-ips 127.0.0.1`), sao lưu 30 ngày. CSP đã thử với bản build: không vi phạm. Cấu hình nginx chưa chạy `nginx -t` (máy dev không có nginx)

## Các vấn đề còn lại của bản đánh giá (1/11)

- [x] Tiêu đề thẻ myth azelaic acid + retinoid: "để trị nám" → "trong nghiên cứu về nám", giải thích "trong điều trị nám" → "trong các nghiên cứu về nám". Nghĩa không đổi, nguồn không đổi, giữ `reviewed_by` / `reviewed_at`; **người duyệt đọc lại câu mới**. Các câu "sản phẩm trị mụn" khác giữ nguyên: dịch sát nhãn thuốc trị mụn của FDA (thuốc, không phải mỹ phẩm)
- [x] Header: một hàng trên máy tính (64 px), logo + tài khoản rồi menu trên điện thoại (140 px, trước ~330 px); bỏ câu giới thiệu trùng
- [x] Giải thích dài (> 70 từ) gập lại ở cuối câu, nút "Đọc tiếp" / "Thu gọn"; văn bản vẫn nguyên văn
- [x] `h1` ẩn cho trang routine (các trang khác đã có)
- [x] Nút đăng nhập / tạo tài khoản / quên mật khẩu / xác thực bị khoá thì ghi "Còn thiếu: email, mật khẩu, tích ô đồng ý."
- [x] Ô tìm sản phẩm: placeholder ngắn, gợi ý ghi rõ chỉ tìm theo tên (chưa theo hoạt chất); không thấy thì có nút chuyển sang "Dán thành phần"
- [x] Test giới hạn đăng nhập sai: đồng hồ của `app.accounts` đứng yên trong test, không còn phụ thuộc máy chậm / máy ngủ

## Gộp `main` vào `feat/blog` (1/11)

`main` (PR #8–#16) đã có sẵn nhiều bản sửa trùng với các mục trên; khi gộp lấy bản của `main`, bỏ bản của nhánh này:
- Giới hạn đọc ảnh nhãn: của `main` (10 ảnh / 10 phút / tài khoản, 30 / IP, tối đa 4 lời gọi cùng lúc), giữ thêm trần 100 ảnh / ngày cho cả máy chủ
- Lỗi kiểm tra routine + nút Thử lại, dòng thông báo cho trình đọc màn hình, nhãn nút có tên sản phẩm: của `main`
- Gập lời giải thích dài: của `main` (`line-clamp`, nút "Xem thêm"), thay cho bản cắt ở cuối câu
- Font tự host: của `main` (`src/fonts/`, Vite đóng gói vào `/assets/`), bỏ `public/fonts/`
- Thẻ OG: giữ ảnh `og.png` + `SITE_URL` của nhánh này, tiêu đề trang của `main`

## Còn lại

- Dự phòng ngày demo (mục trên): quay video, chuẩn bị máy demo
- Chọn máy chủ tại Việt Nam và triển khai thật theo `deploy/README.md`
- Migration thay cho `schema.sql` thuần (hiện: sao lưu trước khi đổi schema)
- Tìm sản phẩm theo tên hoạt chất (hiện chỉ theo tên hãng / sản phẩm, giao diện đã nói rõ)
- Theo dõi lỗi: hiện chỉ có journald + log nginx; dịch vụ ngoài (Sentry…) là chuyển dữ liệu ra nước ngoài, cần cân nhắc theo Luật 91/2025
