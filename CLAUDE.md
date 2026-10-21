# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dự án

SkinWise là web app quản lý routine skincare: người dùng xếp lịch dùng từng sản phẩm (sáng/tối, theo thứ trong tuần), app phát hiện trùng hoạt chất và cảnh báo các kết hợp cần thận trọng, mỗi cảnh báo có giải thích tiếng Việt và nguồn đáng tin cậy. Dự án cho hackathon Nhà Cộng Đồng (NCĐ). Remote: `github.com/Nha-Cong-Dong/SkinWise` (nhánh `main`).

Văn bản hiển thị cho người dùng (giao diện, giải thích cảnh báo) viết bằng **tiếng Việt**; code, tên định danh và commit message viết bằng tiếng Anh. `README.md` là đặc tả cho người dùng — giữ mục "Lộ trình" và "Chạy trên máy" khớp với code.

## Lệnh

Cần PostgreSQL chạy ở `localhost:5432` với hai database `skinwise` (dev) và `skinwise_test` (test); chuỗi kết nối nằm trong `backend/.env` (mẫu: `backend/.env.example`).

Backend (chạy trong `backend/`, quản lý bằng uv):
- `uv run python -m scripts.init_db` — áp schema (`app/schema.sql`, chạy lặp lại không lỗi)
- `uv run uvicorn app.main:app --reload` — API tại `http://127.0.0.1:8000`
- `uv run pytest` — test (dùng DB `skinwise_test`); một test: `uv run pytest tests/test_health.py::test_health`
- `uv run ruff check` / `uv run ruff format`

Frontend (chạy trong `frontend/`):
- `npm run dev` — Vite tại `http://localhost:5173`, proxy `/api/*` sang backend (bỏ tiền tố `/api`)
- `npm run build` (kiểm tra kiểu + build) / `npm run lint` (oxlint)

## Cấu trúc

- `backend/app/main.py` — `create_app()` khai báo route FastAPI; test thay `get_session` bằng `dependency_overrides` để trỏ sang DB test (`tests/conftest.py`).
- `backend/app/db.py` — engine SQLAlchemy, dependency `get_session`, `init_schema()`. Schema là SQL thuần trong `app/schema.sql`, chưa dùng Alembic.
- `backend/scripts/` — script chạy tay (khởi tạo DB; sau này seed dữ liệu, kiểm tra đoạn trích nguồn).
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
