# Giai đoạn 3: API

2–3/11 (bắt đầu sớm 23/10), nhánh `feat/api`.

**Xong khi:** frontend có đủ endpoint để tìm/chọn sản phẩm, dán INCI, kiểm tra routine, xem thẻ myth và gửi câu hỏi; mỗi endpoint có test với dữ liệu đã seed.

## Việc cần làm
- [x] `GET /groups`: danh sách nhóm hoạt chất (tên tiếng Việt cho giao diện)
- [x] `GET /products?q=`: tìm sản phẩm chấp nhận gõ sai, không dấu (`pg_trgm`); không có `q` thì trả hết
- [x] `GET /products/{id}`: chi tiết, bảng thành phần đã nhận diện, nguồn và trạng thái xác minh
- [x] `POST /inci/analyze`: dán bảng INCI → từng thành phần, hoạt chất, nhóm
- [x] `POST /routine/check`: routine gồm sản phẩm mẫu (theo id) và sản phẩm tự dán INCI → cảnh báo kèm nguồn
- [x] `GET /rules?kind=&groups=`: thẻ myth và tra cứu theo cặp nhóm hoạt chất
- [x] Không có luật nào áp dụng → trả `notice_vi` "chưa có thông tin đã kiểm chứng" (routine và tra cứu)
- [x] `POST /questions` + bảng `user_questions`; `scripts/questions.py` liệt kê câu hỏi cho người duyệt
- [x] Test API; cập nhật `CLAUDE.md`, README
- [x] PR vào `main` (#4, đã merge)

## Thiết kế
- Backend không có tiền tố `/api` (Vite bỏ tiền tố khi proxy).
- Routine gửi lên gồm `products` (mỗi cái có `key` do frontend đặt, kèm `product_id` hoặc `inci`) và `items` tham chiếu `key`. Dùng `key` để sản phẩm tự dán INCI xuất hiện ở nhiều buổi vẫn là **một** sản phẩm, không bị so với chính nó.
- `/rules` lọc theo nhóm: trả luật mà mọi nhóm được hỏi đều nằm trong luật. Tra cặp không lọc `kind` để không bỏ sót luật conflict (nếu chỉ tìm myth, tra "retinoid + AHA" sẽ ra "chưa có thông tin" dù có cảnh báo).
- Tìm sản phẩm: `word_similarity` của `pg_trgm` (ngưỡng 0,3) trên `search_name` đã bỏ dấu bằng `normalize_name` trong Python, cộng khớp chuỗi con cho truy vấn ngắn. Không cần `unaccent` trong SQL vì cả hai phía đã chuẩn hoá bằng cùng một hàm.
- Câu hỏi người dùng chỉ lưu câu hỏi, id sản phẩm, mã nhóm; không lưu thông tin liên hệ.

## Giới hạn đã biết
- `POST /questions` chưa giới hạn tần suất gửi; đủ cho demo, cần thêm nếu mở công khai.
- Sản phẩm tự dán INCI không lưu vào DB: frontend giữ bảng thành phần và gửi lại mỗi lần kiểm tra.
