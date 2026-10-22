# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dự án

SkinWise là web app quản lý routine skincare: người dùng xếp lịch dùng từng sản phẩm (sáng/tối, theo thứ trong tuần), app phát hiện trùng hoạt chất và cảnh báo các kết hợp cần thận trọng, mỗi cảnh báo có giải thích tiếng Việt và nguồn đáng tin cậy. Dự án cho hackathon Nhà Cộng Đồng (NCĐ). Remote: `github.com/Nha-Cong-Dong/SkinWise` (nhánh `main`).

Văn bản hiển thị cho người dùng (giao diện, giải thích cảnh báo) viết bằng **tiếng Việt**; code, tên định danh và commit message viết bằng tiếng Anh. `README.md` là đặc tả cho người dùng — giữ mục "Lộ trình" và "Chạy trên máy" khớp với code.

Kế hoạch, tiến độ và các quyết định đã chốt nằm trong `plan/` (`plan/README.md` là bảng tổng). Đọc trước khi bắt đầu việc mới; cập nhật checklist của giai đoạn đang làm khi xong việc và khi xong mỗi PR.

## Lệnh

Cần PostgreSQL chạy ở `localhost:5432` với hai database `skinwise` (dev) và `skinwise_test` (test); chuỗi kết nối nằm trong `backend/.env` (mẫu: `backend/.env.example`).

Backend (chạy trong `backend/`, quản lý bằng uv):
- `uv run python -m scripts.init_db` — áp schema (`app/schema.sql`, chạy lặp lại không lỗi)
- `uv run python -m scripts.seed` — áp schema rồi nạp `data/*.toml` vào DB (upsert, chạy lại an toàn)
- `uv run python -m scripts.verify_products [slug ...]` — tải lại trang nguồn, xác nhận từng thành phần của sản phẩm mẫu có trên trang và đúng thứ tự
- `uv run python -m scripts.verify_quotes [rule-key ...]` — tải trang nguồn của từng luật, xác nhận đoạn trích (`quote`) có nguyên văn trên trang
- `uv run python -m scripts.unresolved` — liệt kê tên thành phần chưa nhận ra trong sản phẩm mẫu (để bắt hoạt chất bị sót)
- `uv run uvicorn app.main:app --reload` — API tại `http://127.0.0.1:8000`
- `uv run pytest` — test (DB `skinwise_test`, tự áp schema + seed); một test: `uv run pytest tests/test_inci.py::test_normalize_name`
- `uv run ruff check` / `uv run ruff format`

Frontend (chạy trong `frontend/`):
- `npm run dev` — Vite tại `http://localhost:5173`, proxy `/api/*` sang backend (bỏ tiền tố `/api`)
- `npm run build` (kiểm tra kiểu + build) / `npm run lint` (oxlint)

## Cấu trúc

- `backend/app/main.py` — `create_app()` khai báo route FastAPI; test thay `get_session` bằng `dependency_overrides` để trỏ sang DB test (`tests/conftest.py`).
- `backend/app/db.py` — engine SQLAlchemy, dependency `get_session`, `init_schema()`. Schema là SQL thuần trong `app/schema.sql`, chưa dùng Alembic.
- `backend/app/inci.py` — tách + chuẩn hoá bảng INCI, không cần DB. Mỗi dòng có nhiều `candidates` (tên đầy đủ trước, rồi các phần của `A (B)` và `A/B`); `app/ingredients.py` `resolve()` lấy tên đầu tiên có trong `ingredient_synonyms` → hoạt chất + nhóm. Thành phần không nhận ra vẫn giữ tên gốc.
- `backend/data/*.toml` — dữ liệu seed, nguồn sự thật cho nhóm hoạt chất, từ điển hoạt chất và sản phẩm mẫu; sửa ở đây rồi chạy lại seed, không sửa thẳng trong DB. Seed upsert theo khoá tự nhiên (`code`, `inci_name`, `slug`) để id không đổi. Từ điển chỉ chứa hoạt chất; chất có mặt với `groups = []` (vd. Citric Acid, Bakuchiol) là cố ý không tính là hoạt chất.
- `backend/app/engine.py` — engine kiểm tra routine, hàm thuần `check_routine(items, product_groups, rules)`. Luật chỉ so hai sản phẩm **khác nhau** cùng phạm vi (cùng bước / buổi / ngày); không bao giờ so một sản phẩm với chính nó. Mỗi (luật, cặp sản phẩm) ra một cảnh báo, kèm mọi ngày/buổi áp dụng.
- `backend/app/rules.py` + `backend/data/rules.toml` — luật và nguồn. `rule_problems()` chặn seed luật `published` thiếu nguồn/đoạn trích hoặc thiếu `reviewed_by`/`reviewed_at`; `load_published_rules()` chỉ trả luật đã bật **và** có nguồn. Không tự đặt `published = true`: chỉ người dùng làm sau khi đọc nguồn.
- `backend/app/sources.py` — tải trang nguồn và kiểm tra văn bản có trên trang; dùng chung cho kiểm tra sản phẩm và (giai đoạn 2) đoạn trích của luật.
- `backend/scripts/` — điểm vào chạy tay, mỏng, gọi code trong `app/`.
- `frontend/src/` — app React; gọi API qua đường dẫn `/api/...`.

## Phạm vi (MVP, hạn ≈ 2026-11-10)

Một lập trình viên, không có nền tảng y khoa, nên MVP cố tình hẹp:
- Làm: dán bảng INCI hoặc chọn từ khoảng 30 sản phẩm mẫu; xếp lịch sáng/tối + ngày trong tuần theo thứ tự bước; phát hiện trùng hoạt chất; 5–8 luật xung đột có nguồn mạnh; 2–3 thẻ myth.
- Để sau: tra cứu mã vạch qua Open Beauty Facts, OCR nhãn, hồ sơ da (nhạy cảm, mang thai…), tài khoản và đồng bộ. Trong MVP routine lưu trên trình duyệt.

## Công nghệ

- Backend: Python 3.13+, FastAPI, Pydantic (kiểm tra dữ liệu đầu vào), SQLAlchemy 2 + psycopg 3, pytest, ruff. Script xử lý dữ liệu (CosIng, dữ liệu mẫu, kiểm tra đoạn trích nguồn) cũng viết bằng Python. Chỉ một backend, không chạy thêm service Node.
- Cơ sở dữ liệu: PostgreSQL 17, cài trực tiếp trên máy khi dev. Tìm sản phẩm chấp nhận gõ sai, không dấu bằng `pg_trgm` + `unaccent`.
- Frontend: React + TypeScript + Vite + Tailwind CSS v4.

## Kiến trúc (thiết kế đã chốt — bám theo)

Luồng: bảng INCI → tách + chuẩn hoá tên (chữ thường, bỏ dấu) → từ điển thành phần + từ đồng nghĩa (tham chiếu EU CosIng) → nhóm hoạt chất → routine (sản phẩm × buổi × ngày) → bộ luật → cảnh báo kèm giải thích + nguồn.

- **Luật viết theo nhóm hoạt chất** (AHA, BHA, PHA, RETINOID, VITAMIN_C, NIACINAMIDE, BENZOYL_PEROXIDE, nhóm chung EXFOLIANT_ACID…; khoảng 10 nhóm), không theo từng chất. Một thành phần có thể thuộc nhiều nhóm. Citric Acid thường chỉ là chất chỉnh pH, không tính là AHA tẩy da chết.
- Mỗi luật có loại (conflict / duplicate / profile / myth), mức độ (avoid / caution / info / safe), phạm vi (cùng bước / cùng buổi / cùng ngày) và mức bằng chứng. Luật "myth" (ví dụ vitamin C + niacinamide phần lớn dùng chung được) là tính năng có chủ đích.
- **Engine cảnh báo là tất định.** Cảnh báo chỉ đến từ luật; LLM tối đa chỉ được diễn đạt lại lời giải thích của luật có sẵn, không được tạo cảnh báo hay tự "nhớ" bảng thành phần của sản phẩm.
- Bảng INCI không ghi nồng độ nên cảnh báo dùng chữ "có thể".
- Mỗi sản phẩm ghi lại bảng thành phần lấy từ đâu (dữ liệu mẫu, nhập tay, Open Beauty Facts…) và trạng thái xác minh.

## Nguyên tắc nguồn: không có nguồn thì không có cảnh báo

Độ chính xác đến từ nguồn, không từ hiểu biết chuyên môn:
1. Mỗi luật gắn ít nhất một nguồn uy tín (AAD, DermNet, bài tổng quan PubMed/JAAD, CIR, CosIng, FDA, Hiệp định mỹ phẩm ASEAN) và lưu **nguyên văn đoạn trích** hỗ trợ luật.
2. Một bước kiểm tra tải trang nguồn và xác nhận đoạn trích có trên trang.
3. Luật chỉ được bật sau khi có người đọc nguồn. Bỏ mọi luật không có nguồn rõ ràng; luật do AI soạn để ở trạng thái chưa bật cho đến khi được kiểm tra.

Dữ liệu Open Beauty Facts theo giấy phép ODbL — ghi công và gửi User-Agent mô tả rõ ứng dụng.
