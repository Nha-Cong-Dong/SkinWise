# Giai đoạn 4: Giao diện

3–7/11 (bắt đầu sớm 23/10), nhánh `feat/ui` (tách từ `feat/api`, PR sau khi PR #4 vào `main`).

**Xong khi:** trên trình duyệt, người dùng thêm sản phẩm (tìm hoặc dán INCI), xếp lịch sáng/tối theo thứ trong tuần, thấy cảnh báo kèm nguồn, xem thẻ myth, tra cặp hoạt chất và gửi câu hỏi; routine còn nguyên sau khi tải lại trang.

## Việc cần làm
- [x] `src/api.ts`: kiểu dữ liệu + hàm gọi API
- [x] Routine lưu trên trình duyệt (`localStorage`, bọc try/catch; lỗi thì vẫn chạy, chỉ không lưu)
- [x] Thêm sản phẩm: tìm (gõ sai, không dấu) và dán bảng INCI (xem trước hoạt chất nhận ra trước khi thêm)
- [x] "Sản phẩm của tôi": nhóm hoạt chất, xem bảng thành phần + nguồn + trạng thái xác minh
- [x] Xếp lịch: hai cột Sáng / Tối, đổi thứ tự bước, chọn thứ trong tuần cho từng bước
- [x] Cảnh báo: tự kiểm tra khi routine đổi; mức độ, giải thích, sản phẩm liên quan, ngày/buổi, mức bằng chứng, nguồn + đoạn trích; không có cảnh báo thì hiện `notice_vi`
- [x] Thẻ myth + tra cặp nhóm hoạt chất; không có thông tin thì hiện `notice_vi` và mời gửi câu hỏi
- [x] Form gửi câu hỏi (kèm sản phẩm / nhóm liên quan)
- [x] Lời nhắc "không thay thế tư vấn bác sĩ" luôn hiển thị
- [x] `npm run build` + `npm run lint`; chạy thử trên trình duyệt (Chrome headless, cả màn hình điện thoại); cập nhật `CLAUDE.md`, README
- [x] Sửa lỗi phát hiện khi chạy thử: tra cặp "Retinoid + BHA" ra "chưa có thông tin" → thêm nhóm cha (xem `decisions.md`)
- [ ] PR vào `main`

## Thiết kế
- Không thêm thư viện: một trang, chuyển giữa "Routine" và "Sự thật hay myth" bằng state, không dùng router.
- Routine trên trình duyệt: `products` (key, tên, `productId` hoặc `inci`, nhóm) + `entries` (key sản phẩm, buổi, các ngày). Thứ tự bước = vị trí trong cột của buổi đó. Gửi lên `/routine/check` đúng dạng API.
- Tên nhóm lấy từ `/groups`, bỏ phần trong ngoặc cho gọn; ẩn chip "Acid tẩy tế bào chết" khi đã có AHA/BHA/PHA (nhóm chung).
- Mọi chữ trên giao diện bằng tiếng Việt; cảnh báo hiển thị nguyên văn `title_vi`/`explanation_vi` của luật, không diễn đạt lại.

## Giới hạn đã biết
- Trên điện thoại, kết quả kiểm tra nằm cuối trang, dưới lịch dùng; phải cuộn xuống mới thấy.
- Sản phẩm trong routine lưu tên/nhóm lúc thêm; nếu dữ liệu mẫu đổi nhóm, chip trên giao diện cũ đi nhưng cảnh báo vẫn đúng (server tính lại nhóm mỗi lần kiểm tra). Sản phẩm mẫu bị xoá khỏi DB làm kiểm tra báo lỗi 422 cho đến khi người dùng xoá sản phẩm đó.
- Câu hỏi chỉ đính kèm được sản phẩm có sẵn (có id); sản phẩm tự dán INCI thì người dùng ghi vào câu hỏi.
