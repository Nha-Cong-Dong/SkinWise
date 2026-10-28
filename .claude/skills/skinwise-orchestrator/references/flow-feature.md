# Luồng tính năng: từ đặc tả tới QA và review

**Chế độ: hỗn hợp**

| Bước | Chế độ | Lý do |
|---|---|---|
| 1. Đặc tả | Phiên chính + người dùng | Các quyết định thiết kế thuộc về người dùng |
| 2–5. Làm + QA | Agent giữ ngữ cảnh (backend-dev, frontend-dev, qa-inspector) | Dev sửa nhiều vòng theo QA mà không mất ngữ cảnh. Nếu gọi lại từ đầu, dev phải đọc lại toàn bộ code |
| 6. Đóng băng | Phiên chính | Review phải đọc đúng bản code đã dừng sửa |
| 7. Review | Workflow (`flow-review.md`) | Góc nhìn biết trước, mỗi phát hiện xác minh theo quy tắc cố định |
| 8–9. Tài liệu + báo cáo | Phiên chính | Chỉ một người ghi `plan/`, `README.md`, `CLAUDE.md` |

Thư mục: `_workspace/feature-<slug>/`. `<slug>` là tên ngắn kebab-case của tính năng, vd. `report-wrong-warning`.

## Bước 0: Chuẩn bị
1. Bước 0 trong SKILL.md. Trong `00_git.txt`, ghi **thêm** `git rev-parse HEAD` và danh sách file đang đổi chưa commit **trước khi bắt đầu**. Review ở bước 7 sẽ bỏ các file này khỏi phạm vi.
2. Tạo `00_status.md` để theo dõi tiến độ (môi trường có thể không có công cụ danh sách việc chung):
   ```markdown
   | Agent | ID / tên để SendMessage | Việc | Trạng thái | Báo cáo |
   |---|---|---|---|---|
   | backend-dev | ... | phần backend | đang làm / xong / chờ sửa | 02_backend_report.md |
   ```
   Cập nhật bảng mỗi khi nhận thông báo từ agent.

## Bước 1: Đặc tả (phiên chính)
1. Đọc `plan/README.md`, `plan/decisions.md`, mục liên quan trong `plan/after-mvp.md` hoặc `plan/h-accounts.md`, và code sẽ bị chạm tới.
2. Viết `01_spec.md` theo mẫu ở mục 1 của skill `feature-build`, gồm hợp đồng API đủ từng trường.
3. Đưa người dùng tóm tắt đặc tả (mục tiêu, phạm vi, hợp đồng API, chữ hiển thị, tiêu chí chấp nhận) cùng các câu hỏi thiết kế (dùng AskUserQuestion nếu có). **Không chuyển sang bước 2 khi người dùng chưa đồng ý.** Ghi câu trả lời vào mục "Quyết định cần người dùng chốt".
4. Tính năng chỉ có backend hoặc chỉ có frontend: chỉ gọi dev tương ứng ở bước 2.

## Bước 2: Gọi dev (một message, chạy song song)

Gọi hai agent trong **cùng một message**:
- `Agent(subagent_type: "backend-dev", description: "backend-dev: <slug>", prompt: ...)`
- `Agent(subagent_type: "frontend-dev", description: "frontend-dev: <slug>", prompt: ...)`

Nếu công cụ Agent có tham số `name` thì đặt `name: "backend-dev"` / `"frontend-dev"` để `SendMessage` theo tên. Nếu không, ghi ID agent trả về vào `00_status.md`.

Prompt cho mỗi dev gồm:
- đường dẫn đặc tả `_workspace/feature-<slug>/01_spec.md` và đường dẫn báo cáo cần ghi
- phạm vi được sửa (`backend/` hoặc `frontend/`) và nhắc không sửa file chung
- "Dùng skill feature-build. Xong phần của bạn, hoặc cần quyết định về hợp đồng API, thì ghi báo cáo và kết thúc lượt."
- Riêng frontend-dev: "Backend đang làm song song theo cùng hợp đồng; khi có `02_backend_report.md` thì đọc để đối chiếu."

## Bước 3: QA phần backend

Khi backend-dev báo xong:
1. Đọc `02_backend_report.md`. Có đề xuất đổi hợp đồng thì:
   - Thay đổi kỹ thuật (tên trường, mã lỗi): bạn quyết, sửa `01_spec.md`.
   - Thay đổi hành vi người dùng thấy: hỏi người dùng.

   Sau đó `SendMessage` cho frontend-dev biết chính xác thay đổi.
2. Gọi `Agent(subagent_type: "qa-inspector", description: "qa-inspector: <slug>", prompt: ...)`, đặt `name` nếu có. Prompt gồm: chế độ A, đặc tả, báo cáo backend, "lượt này chỉ kiểm phần backend (lệnh backend + hợp đồng API so với đặc tả)", và đường dẫn báo cáo `04_qa_report.md`.
3. QA có lỗi thì `SendMessage` cho backend-dev **đúng danh sách lỗi** (`file:dòng`, cách sửa). backend-dev sửa xong thì `SendMessage` cho qa-inspector kiểm lại (báo cáo `04_qa_report_round<N>.md`).
4. Tối đa **3 vòng** cho mỗi phần. Quá 3 vòng mà vẫn còn lỗi thì dừng, báo người dùng các lỗi còn lại và hỏi hướng xử lý.

## Bước 4: QA chỗ nối (sau khi frontend xong)

Khi frontend-dev báo xong, `SendMessage` cho qa-inspector chạy **toàn bộ** danh sách kiểm QA (mục 4 của `feature-build`): lệnh cả hai bên, đối chiếu `schemas.py` ↔ `api.ts`, route ↔ hàm gọi, mã lỗi, nguyên tắc an toàn, tiêu chí chấp nhận, kiểm trên trình duyệt nếu được. Lỗi ở chỗ nối thì báo **cả hai dev**. Vòng sửa như bước 3.

## Bước 5: Tiêu chí chấp nhận
Mọi tiêu chí trong `01_spec.md` phải "đạt", hoặc "chưa kiểm được" kèm lý do người dùng chấp nhận được (vd. PostgreSQL tắt). Không đạt mà không sửa được thì báo người dùng trước khi sang bước 6.

## Bước 6: Đóng băng
1. Mọi dev đã báo xong; trong `00_status.md` không còn dòng "đang làm" hay "chờ sửa".
2. `SendMessage` cho từng dev: "Đóng băng phần <slug>: không sửa file nào nữa trừ khi người điều phối gửi yêu cầu sửa cụ thể."
3. Ghi dấu vân tay của trạng thái code:
   ```bash
   { git diff HEAD; git ls-files --others --exclude-standard -z | xargs -0 -r sha256sum; } | sha256sum > _workspace/feature-<slug>/freeze.sha
   git status --short > _workspace/feature-<slug>/freeze_status.txt
   ```

## Bước 7: Review
Chạy `flow-review.md`. Phạm vi là các file đổi so với `00_git.txt`, **trừ** các file đã đổi từ trước khi bắt đầu. Có lỗi đã xác nhận:
- Chuyển cho dev phụ trách (mỗi lỗi kèm tình huống, bằng chứng, cách sửa). Đây là yêu cầu sửa cụ thể, được phép dù đang đóng băng.
- qa-inspector kiểm lại phần đã sửa và chạy lại toàn bộ lệnh.
- Ghi lại `freeze.sha`.
- Không chạy lại cả luồng review, trừ khi bản sửa lớn (đổi thiết kế, nhiều file).

## Bước 8: Tài liệu (phiên chính)
Theo mục 5 của `feature-build`:
- tick checklist trong `plan/`
- cập nhật `README.md` ("Lộ trình", "Chạy trên máy", biến môi trường mới trong `backend/.env.example`)
- thêm mục mới vào `plan/decisions.md` cho các quyết định người dùng đã chốt
- thêm một dòng vào mục "Cấu trúc" của `CLAUDE.md` nếu có module mới

Đưa người dùng xem phần sửa tài liệu trong báo cáo.

## Bước 9: Kiểm cuối và báo cáo
1. Tính lại dấu vân tay (lệnh ở bước 6). Nếu khác `freeze.sha` mà không phải do bước 7 hay 8 thì tìm xem ai đã sửa gì sau khi đóng băng, và quyết định có cần QA lại không.
2. Chạy lần cuối: `uv run pytest`, `uv run ruff check`, `npm run build`, `npm run lint`.
3. Báo cáo theo mẫu trong SKILL.md, gồm:
   - tiêu chí chấp nhận (đạt / chưa kiểm)
   - lỗi review đã sửa / còn lại
   - file đã đổi
   - việc của người dùng: kiểm tay trên trình duyệt nếu QA chưa làm được, quyết định còn mở, commit / PR khi họ muốn

## Xử lý lỗi riêng của luồng này

| Tình huống | Cách xử lý |
|---|---|
| Dev im lặng hoặc dừng giữa chừng | `SendMessage` hỏi trạng thái. Không được thì gọi agent mới cùng loại, dán đặc tả, báo cáo cũ và danh sách việc còn lại. Ghi vào `00_status.md` |
| Hai dev cần sửa cùng một file | Không để xảy ra: file chung do bạn sửa. Nếu thật sự cần (vd. hằng số dùng chung), giao cho một dev, dev kia đợi |
| QA không chạy được lệnh (DB tắt, thiếu `node_modules`) | Ghi "chưa kiểm được". Hỏi người dùng có muốn bật PostgreSQL hay chạy `npm install` không. Không tự cài gói ngoài `npm install` / `uv sync` |
| Tính năng phình ra ngoài phạm vi | Dừng, cập nhật đặc tả, hỏi người dùng. Không để dev làm thêm phần "tiện tay" |
