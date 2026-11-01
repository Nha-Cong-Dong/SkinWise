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

## Còn lại từ đánh giá (chưa làm)

- Tiêu đề thẻ myth azelaic acid + retinoid dùng chữ "trị nám" (`rules.toml`): người duyệt quyết định có sửa lời không
- Hiệu năng điện thoại: tách code (`React.lazy` cho `#review` và blog), tự host font
- Triển khai: gzip, cache, HTTPS, header bảo mật, `--forwarded-allow-ips` (giới hạn theo IP dùng `request.client.host`)
- CI (pytest, ruff, build), thẻ OG, kênh nhận phản hồi, giới hạn tần suất cho blog
