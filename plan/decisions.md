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

## Sản phẩm mẫu lấy từ trang chính hãng (22/10)
Bảng thành phần chép nguyên văn từ trang hãng, lưu `source_url` và ngày lấy; `scripts/verify_products.py` tải lại trang và xác nhận từng thành phần có trên trang. Không chép từ trí nhớ của AI. Trang chặn bot thì đổi sang sản phẩm khác cùng nhóm. Bắt đầu với ~15 sản phẩm, đủ mọi nhóm hoạt chất để demo kích hoạt được từng luật.

## Dữ liệu seed dạng TOML (22/10)
Đọc bằng `tomllib` có sẵn, cho phép comment để ghi chú khi duyệt. Seed upsert theo khoá tự nhiên (`slug` sản phẩm, `inci_name`, mã nhóm) để id không đổi khi seed lại, vì routine trên trình duyệt tham chiếu id sản phẩm.

## Từ điển chỉ chứa hoạt chất; CosIng đầy đủ để sau (22/10)
Mở rộng từ điển theo biến thể của các nhóm đã có và ghi rõ các chất "trông giống hoạt chất nhưng không phải" (`groups = []`). Không thêm nhóm mới khi chưa có luật có nguồn cho nhóm đó. Nhập toàn bộ CosIng (hướng B) chỉ làm nếu còn thời gian sau giai đoạn 4, vì đường găng là nguồn cho luật.

## Kiểm tra sản phẩm theo cả nội dung lẫn thứ tự (22/10)
`verify_products` yêu cầu từng thành phần có trên trang nguồn và xuất hiện đúng thứ tự, để bắt danh sách bị đảo hoặc ghép từ hai phiên bản trên cùng một trang.

## Lời đồn ngoài bộ myth cố định: nói rõ + thu câu hỏi, không để AI trả lời (22/10)
Bộ myth là danh sách cố định có nguồn. Khi không có thông tin, app nói rõ là chưa có thông tin đã kiểm chứng thay vì im lặng (im lặng dễ bị hiểu là an toàn). Người dùng gửi câu hỏi qua `POST /questions`; người duyệt chọn câu đáng làm và tạo thẻ theo quy trình nguồn như luật. Không cho AI trả lời trực tiếp trong MVP vì trái nguyên tắc "cảnh báo không do AI tạo"; sau hackathon có thể cân nhắc AI soạn bản nháp có trích dẫn, server kiểm tra đoạn trích, gắn nhãn "chưa kiểm duyệt" và người duyệt quyết định.

## Nhóm hoạt chất có nhóm cha; tra cặp khớp như engine (23/10)
Chạy thử giao diện thấy tra "Retinoid + BHA" trả "chưa có thông tin" dù có luật Retinoid + EXFOLIANT_ACID: kiểu im lặng dễ hiểu thành an toàn. Khai báo `parent` (AHA/BHA/PHA → EXFOLIANT_ACID) trong `functional_groups.toml` thay vì suy ra từ dữ liệu, để người duyệt thấy rõ; test bắt chất thuộc nhóm con mà thiếu nhóm cha. `/rules` với hai nhóm dùng chính `rule_matches` của engine nên kết quả tra cứu khớp với kết quả kiểm tra routine (vd. AHA + BHA ra luật trùng acid).

## Nhận diện thành phần bằng danh sách EU trên EUR-Lex, không dùng API CosIng (24/10)
CosIng không có file tải về chính thức; trang tra cứu dùng API nội bộ với khoá của chính trang, dùng khoá đó để tải hàng loạt là lạm dụng nên không làm. EUR-Lex chặn script bằng trang kiểm tra bot, nên tải qua CELLAR của Văn phòng Xuất bản EU (kênh dành cho tái sử dụng tự động). Tên lấy từ bảng chú giải hiện hành (2025/1175); chức năng lấy từ danh mục 2006/257/EC, đã hết hiệu lực nên giao diện ghi "để tham khảo". Đo trên 15 sản phẩm mẫu: nhận ra 97,7% dòng, 72,5% có chức năng. Healthline không dùng làm nguồn (không thuộc danh sách nguồn uy tín, không có tài liệu tham khảo, có lỗi như gọi Citric Acid là AHA).

## Văn bản dán vào không phải bảng thành phần đầy đủ thì nói rõ (24/10)
Danh sách "thành phần nổi bật" kèm mô tả trông giống bảng thành phần nhưng bỏ sót phần lớn chất, kể cả hoạt chất. API nhận ra dạng `tên: mô tả`, chỉ lấy tên và trả lưu ý; giao diện gắn nhãn sản phẩm và nhắc trong kết quả kiểm tra rằng cảnh báo có thể thiếu. Không chặn hẳn vì người dùng vẫn cần biết từng chất là gì.

## Tên thông dụng tiếng Việt duyệt như từ điển hoạt chất (24/10)
`common_names.toml` ánh xạ "rau má", "axit salicylic"… sang tên EU. Tên trỏ tới hoạt chất làm thay đổi cảnh báo nên cần người duyệt; tên mơ hồ (cúc La Mã, lô hội) ghi mọi tên EU có thể kèm ghi chú, tên đầu tiên được dùng để nhận diện.

## Mỗi giai đoạn một nhánh + một PR (22/10)
Giữ `main` luôn chạy được cho demo. Sửa nhỏ (README, lỗi chính tả) commit thẳng lên `main`.
