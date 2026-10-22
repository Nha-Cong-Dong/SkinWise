# Quyết định đã chốt

Mỗi mục: quyết định, ngày, lý do. Khi đổi ý, sửa mục cũ và ghi ngày đổi thay vì xoá.

## Backend Python + FastAPI (22/10)
Người làm quen Python hơn TypeScript; với 20 ngày, ngôn ngữ quen tay quan trọng hơn việc dùng chung ngôn ngữ với frontend. Chỉ một backend, không chạy thêm service Node. Script dữ liệu cũng viết bằng Python.

## Giữ PostgreSQL, cài trực tiếp trên máy (22/10)
Cần `pg_trgm` + `unaccent` cho tìm sản phẩm chấp nhận gõ sai, không dấu. MySQL không có tương đương. Máy không có Docker nên cài Postgres 17 trực tiếp.

## Công cụ backend: uv, SQLAlchemy 2 + psycopg 3, pytest, ruff (22/10)
Schema là SQL thuần trong `backend/app/schema.sql`, viết để chạy lặp lại không lỗi; chưa dùng Alembic vì MVP chưa cần migration.

## Frontend React + TypeScript + Vite + Tailwind v4 (22/10)
Dev dùng proxy `/api` của Vite thay cho CORS.

## Sản phẩm mẫu lấy từ trang chính hãng (23/10)
Bảng thành phần chép nguyên văn từ trang hãng, lưu `source_url` và ngày lấy; `scripts/verify_products.py` tải lại trang và xác nhận từng thành phần có trên trang. Không chép từ trí nhớ của AI. Trang chặn bot thì đổi sang sản phẩm khác cùng nhóm. Bắt đầu với ~15 sản phẩm, đủ mọi nhóm hoạt chất để demo kích hoạt được từng luật.

## Dữ liệu seed dạng TOML (23/10)
Đọc bằng `tomllib` có sẵn, cho phép comment để ghi chú khi duyệt. Seed upsert theo khoá tự nhiên (`slug` sản phẩm, `inci_name`, mã nhóm) để id không đổi khi seed lại, vì routine trên trình duyệt tham chiếu id sản phẩm.

## Từ điển chỉ chứa hoạt chất; CosIng đầy đủ để sau (23/10)
Mở rộng từ điển theo biến thể của các nhóm đã có và ghi rõ các chất "trông giống hoạt chất nhưng không phải" (`groups = []`). Không thêm nhóm mới khi chưa có luật có nguồn cho nhóm đó. Nhập toàn bộ CosIng (hướng B) chỉ làm nếu còn thời gian sau giai đoạn 4, vì đường găng là nguồn cho luật.

## Kiểm tra sản phẩm theo cả nội dung lẫn thứ tự (23/10)
`verify_products` yêu cầu từng thành phần có trên trang nguồn và xuất hiện đúng thứ tự, để bắt danh sách bị đảo hoặc ghép từ hai phiên bản trên cùng một trang.

## Mỗi giai đoạn một nhánh + một PR (22/10)
Giữ `main` luôn chạy được cho demo. Sửa nhỏ (README, lỗi chính tả) commit thẳng lên `main`.
