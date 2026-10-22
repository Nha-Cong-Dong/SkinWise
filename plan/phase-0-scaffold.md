# Giai đoạn 0: Dựng khung ✅

Xong 22/10, [PR #1](https://github.com/Nha-Cong-Dong/SkinWise/pull/1).

- [x] `backend/`: FastAPI, `GET /health` (kiểm tra kết nối DB), SQLAlchemy + psycopg, `app/schema.sql`, `scripts/init_db.py`, pytest dùng DB `skinwise_test`
- [x] `frontend/`: Vite + React + TypeScript + Tailwind v4, proxy `/api`, trang hiển thị trạng thái API/DB
- [x] PostgreSQL 17 cài trên máy, DB `skinwise` và `skinwise_test`
- [x] `CLAUDE.md` (lệnh, cấu trúc), README (hướng dẫn chạy), `.claude/settings.json`

Kiểm tra đã đạt: schema chạy 2 lần không lỗi, `pytest`, `ruff`, `npm run build`/`lint`, `/health` trực tiếp và qua proxy.
