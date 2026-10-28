---
name: feature-build
description: "Quy trình làm một tính năng full-stack của SkinWise (FastAPI + PostgreSQL + React/TypeScript): viết đặc tả và hợp đồng API trước, backend và frontend làm theo hợp đồng, QA kiểm chỗ nối sau mỗi phần, cập nhật plan/ và README khi xong. Dùng cho backend-dev, frontend-dev, qa-inspector và người điều phối trong luồng làm tính năng của skinwise-orchestrator. Không dùng cho việc chỉ sửa dữ liệu seed (dùng sample-data-entry / rule-source-research) hay chỉ review (dùng pr-review)."
---

# Làm tính năng full-stack

SkinWise do một người làm, hạn MVP 10/11/2026, và `main` phải luôn chạy được cho demo. Vì vậy mỗi tính năng phải: có đặc tả mà người dùng đã duyệt, không phá các nguyên tắc an toàn (engine tất định, không có nguồn thì không có cảnh báo, dữ liệu cá nhân tối thiểu), và có test. Kiến trúc, lệnh và cấu trúc thư mục nằm trong `CLAUDE.md`, nên skill này không lặp lại.

## 1. Đặc tả (người điều phối viết, người dùng duyệt)

File `_workspace/feature-<slug>/01_spec.md`:

```markdown
# <Tên tính năng>

## Mục tiêu
<một đoạn: ai cần gì, vì sao; dẫn mục trong plan/after-mvp.md hoặc plan/README.md nếu có>

## Phạm vi
- Làm: ...
- Không làm: ...   (ghi rõ để agent không làm lan)

## Quyết định cần người dùng chốt
- <câu hỏi> → <đáp án người dùng đã chọn, ngày>

## Hợp đồng API
| Method | Path | Request | Response 200 | Lỗi |
|---|---|---|---|---|
| POST | /me/routine | `RoutineIn { base_version: int, routine: ... }` | `RoutineOut { version: int, ... }` | 409 `{detail}` khi lệch phiên bản |

Model Pydantic (app/schemas.py) và kiểu TypeScript (src/api.ts) tương ứng, từng trường:
| Trường | Python | TypeScript | null? | Ghi chú |

## Thay đổi dữ liệu
<schema.sql: bảng / cột mới (phải chạy lặp lại được); dữ liệu seed nếu có>

## Chữ hiển thị (tiếng Việt)
<nguyên văn các câu mới người dùng sẽ thấy, nhất là thông báo lỗi và thông báo "không có cảnh báo">

## Tiêu chí chấp nhận
- [ ] <hành vi kiểm được, mỗi dòng một ý; gồm cả trường hợp lỗi và trường hợp rỗng>

## Test cần có
- backend: <tests/test_xxx.py: các trường hợp>
- frontend: <không có bộ test tự động; build + lint + kiểm tay / trình duyệt nếu có>

## Ảnh hưởng tài liệu
<plan/... checklist nào, README mục "Lộ trình" / "Chạy trên máy", decisions.md có quyết định mới không, CLAUDE.md mục "Cấu trúc" nếu thêm module>
```

Trước khi viết: đọc `plan/README.md`, `plan/decisions.md` và mục liên quan trong `plan/after-mvp.md`. Tính năng mâu thuẫn với một quyết định đã chốt thì hỏi người dùng trước, đừng tự quyết.

## 2. Làm theo hợp đồng

- Backend và frontend làm **song song**, cùng bám hợp đồng API trong đặc tả. Hợp đồng là thứ duy nhất cả hai cùng thấy trước khi code xong.
- Agent nào thấy hợp đồng phải đổi thì **không tự đổi**: ghi đề xuất vào báo cáo và kết thúc lượt. Người điều phối sửa đặc tả rồi báo cho cả hai bên.
- backend-dev chỉ sửa `backend/`, frontend-dev chỉ sửa `frontend/`. Các file chung (`README.md`, `CLAUDE.md`, `plan/`) do người điều phối sửa, để hai agent không ghi đè lên nhau.
- Không commit, không push, không tạo nhánh. Người dùng tự quyết khi nào làm.

## 3. Định nghĩa "xong" cho từng phần

**Backend**
- `uv run pytest` (toàn bộ) đạt; `uv run ruff check` và `uv run ruff format --check` sạch.
- Mọi route mới có test cho: thành công, đầu vào sai (422 / 400), không có quyền (401 nếu route cần phiên), trường hợp rỗng.
- Route trả danh sách cảnh báo hay luật: kết quả rỗng kèm `notice_vi`.
- `schema.sql` chạy hai lần liên tiếp không lỗi (`uv run python -m scripts.init_db` hai lần).

**Frontend**
- `npm run build` và `npm run lint` sạch.
- Mọi kiểu mới trong `api.ts` khớp từng trường với `schemas.py`.
- Chữ hiển thị mới là tiếng Việt và khớp mục "Chữ hiển thị" trong đặc tả.
- Có trạng thái đang tải, lỗi và rỗng cho mọi lời gọi API mới.

## 4. Danh sách kiểm QA (qa-inspector)

Chạy sau từng phần, không đợi tới cuối. Ghi kết quả vào `_workspace/feature-<slug>/04_qa_report.md`.

### Lệnh
- [ ] `backend/`: `uv run pytest`, `uv run ruff check`, `uv run ruff format --check`
- [ ] `frontend/`: `npm run build`, `npm run lint`
- [ ] Nếu đổi `backend/data/`: `uv run python -m scripts.seed`, rồi `scripts.verify_quotes` / `scripts.verify_products` cho phần đổi

### Chỗ nối backend ↔ frontend
- [ ] Mỗi model Pydantic mới hoặc đã đổi ↔ kiểu trong `api.ts`: tên trường (snake_case giữ nguyên), kiểu, `null` / tuỳ chọn, giá trị enum
- [ ] Mỗi route mới hoặc đã đổi ↔ hàm gọi ở frontend: method, path (proxy Vite bỏ `/api`), query (`groups=A&groups=B`), body
- [ ] Route có, nhưng frontend không gọi (thiếu hàm gọi, hay route chỉ dành cho script / trang duyệt?)
- [ ] Mã lỗi backend (400 / 401 / 404 / 409 / 422) ↔ nhánh xử lý ở giao diện; 409 lệch phiên bản ở `sync.ts` phải hỏi người dùng, không tự ghi đè
- [ ] Hằng số dùng ở cả hai đầu khớp nhau: `POLICY_VERSION` (`app/accounts.py` ↔ `src/account.ts`), giới hạn kích thước routine (50 sản phẩm, 200 bước, 10.000 ký tự), mã nhóm hoạt chất mới ↔ `groups.ts` / `labels.ts`

### Nguyên tắc an toàn
- [ ] Cảnh báo chỉ đến từ luật đã bật và có nguồn; không có đường nào khiến LLM, gợi ý tên gần đúng hay nồng độ bật / tắt cảnh báo
- [ ] Kết quả rỗng có `notice_vi` và giao diện hiện nó
- [ ] Giao diện hiện nguyên văn `title_vi` / `explanation_vi` và nguồn
- [ ] Dữ liệu cá nhân: không lưu, không log, không trả ra thứ đặc tả không cần; token / phiên chỉ lưu sha256

### Tiêu chí chấp nhận
- [ ] Mỗi tiêu chí trong đặc tả: đạt / không đạt / chưa kiểm được (kèm lý do)

### Kiểm thật (khi có thể)
Nếu PostgreSQL đang chạy và có công cụ trình duyệt (Playwright / Chrome), chạy `uv run uvicorn app.main:app` và `npm run dev`, rồi đi qua luồng chính của tính năng. Đăng nhập ở chế độ dev hiện link ngay trên màn hình. Không chạy được thì ghi "chưa kiểm trên trình duyệt".

## 5. Cập nhật tài liệu (người điều phối, sau review)

- `plan/`: tick checklist của giai đoạn / hướng đang làm; thêm dòng mới nếu có việc phát sinh.
- `README.md`: giữ mục "Lộ trình" và "Chạy trên máy" khớp với code (lệnh mới, biến môi trường mới trong `.env.example`).
- `plan/decisions.md`: mỗi quyết định người dùng chốt trong đặc tả thành một mục `## <Quyết định> (dd/mm)` kèm lý do. Đổi ý thì sửa mục cũ và ghi ngày đổi, không xoá.
- `CLAUDE.md` mục "Cấu trúc": thêm một dòng khi có module mới.
- Commit (chỉ khi người dùng yêu cầu): message tiếng Anh, mỗi giai đoạn một nhánh + một PR.
