---
name: skinwise-orchestrator
description: "Điều phối đội agent của SkinWise cho năm loại việc: (1) tìm nguồn và soạn luật cảnh báo / thẻ myth / lưu ý khi dùng; (1b) tìm nguồn cho nội dung không phải luật: hoạt chất theo mục tiêu da, thẻ thông tin (goals.toml); (2) thêm sản phẩm mẫu và tên thông dụng tiếng Việt từ trang chính hãng; (3) làm tính năng full-stack (FastAPI + React) từ đặc tả tới QA; (4) review thay đổi trước PR. Dùng khi người dùng nói 'tìm nguồn cho luật / myth ...', 'tìm nguồn cho mục tiêu da ...', 'thêm thẻ thông tin ...', 'có nguồn cho ... không', 'thêm sản phẩm ...', 'thêm tên tiếng Việt ...', 'làm tính năng ...', 'làm mục ... trong plan', 'review trước PR', 'review nhánh này', và cả yêu cầu tiếp theo: làm lại, chạy lại, sửa theo review, bổ sung, cập nhật kết quả trước, chỉ làm lại phần .... Câu hỏi đơn giản về code hay dữ liệu thì trả lời trực tiếp, không cần skill này."
---

# SkinWise orchestrator

Bạn (phiên chính) là người điều phối. Bạn chọn luồng, chuẩn bị đầu vào, gọi agent, ghi kết quả cuối vào file của dự án và báo cáo cho người dùng. Agent làm phần việc chuyên môn. Những quyết định thuộc về người dùng thì vẫn để người dùng quyết: bật luật, đánh dấu dữ liệu đã duyệt, chọn hướng thiết kế. Người dùng chính là người duyệt của dự án.

## Đội

| Agent (`.claude/agents/`) | Việc | Skill | Model |
|---|---|---|---|
| `source-researcher` | Tìm, tải, trích nguyên văn | `rule-source-research`, `sample-data-entry`, `page-evidence` | sonnet; luồng luật truyền `model: 'opus'` |
| `evidence-critic` | Phản biện bằng chứng | như trên | opus |
| `backend-dev` | FastAPI / SQL / pytest | `feature-build` | opus |
| `frontend-dev` | React / TS / Tailwind | `feature-build` | opus |
| `qa-inspector` | Chạy kiểm, đối chiếu chỗ nối, xác minh phát hiện | `feature-build`, `pr-review` | opus |
| `code-reviewer` | Review theo góc nhìn | `pr-review` | opus |

## Chọn luồng

| Yêu cầu | Luồng | Đọc | Chế độ chạy |
|---|---|---|---|
| Tìm / kiểm nguồn cho luật, thẻ myth, lưu ý khi dùng | Luật | `references/flow-rules.md` | Workflow: tìm → phản biện → sửa |
| Tìm / kiểm nguồn cho hoạt chất theo mục tiêu da, thẻ thông tin (không tạo cảnh báo) | Nội dung | `references/flow-content.md` | Workflow: tìm theo mục tiêu → phản biện từng mục → sửa mục chưa đạt |
| Thêm / kiểm sản phẩm mẫu, tên thông dụng | Dữ liệu | `references/flow-data.md` | Workflow: thu thập → phản biện → sửa |
| Làm tính năng, làm một mục trong `plan/` | Tính năng | `references/flow-feature.md` | Hỗn hợp: agent giữ ngữ cảnh (dev + QA), cuối cùng Workflow review |
| Review nhánh / PR / thay đổi | Review | `references/flow-review.md` | Workflow: review theo góc nhìn → xác minh từng phát hiện |

Yêu cầu chạm nhiều luồng thì tách ra và chạy lần lượt. Ví dụ "làm tính năng X và thêm 3 sản phẩm demo cho nó": làm luồng dữ liệu trước, rồi luồng tính năng. Đọc file luồng tương ứng **trước khi** làm.

Chỉ dùng chế độ Workflow vì luồng có danh sách việc và vòng kiểm định trước được. Người dùng gọi skill này tức là đã đồng ý cho chạy Workflow. Luồng tính năng dùng agent giữ ngữ cảnh, vì dev phải sửa đi sửa lại theo QA mà không mất ngữ cảnh.

## Quy tắc chung

1. **Bước 0: xem việc cũ.** Mỗi luồng có thư mục riêng: `_workspace/rules/`, `_workspace/goals/`, `_workspace/data/`, `_workspace/feature-<slug>/`, `_workspace/review-<nhánh>/`.
   - Chưa có thư mục: chạy từ đầu.
   - Có thư mục, và người dùng muốn sửa hoặc bổ sung một phần: chỉ chạy lại phần đó. Với Workflow, đọc `run_meta.json` để lấy `runId` rồi dùng `resumeFromRunId`; các lời gọi `agent()` không đổi sẽ lấy kết quả đã lưu.
   - Có thư mục, nhưng là đầu vào mới: đổi tên thư mục cũ thành `<tên>_<YYYYMMDD-HHMM>/` rồi chạy mới.
2. **Git.** Bắt đầu mỗi luồng bằng `git status --short` và `git rev-parse --abbrev-ref HEAD`, ghi vào `_workspace/<luồng>/00_git.txt`. Không commit, push, đổi nhánh hay stash nếu người dùng không yêu cầu. Không sửa, không hoàn tác thay đổi chưa commit không thuộc việc đang làm. Thấy thay đổi trông bất thường thì báo người dùng.
3. **Ranh giới quyết định.**
   - Không bao giờ đặt `published = true`, `reviewed_by`, `reviewed_at` hay `verification_status = "verified"` (cả luật lẫn mục trong `goals.toml`).
   - Không thêm tên trỏ tới hoạt chất vào `common_names.toml` khi người dùng chưa duyệt.
   - Không tự chọn khi đặc tả có câu hỏi thiết kế: hỏi người dùng.
4. **Ghi file dự án một lần, do bạn ghi.** Agent chạy song song trả dữ liệu hoặc ghi vào `_workspace/`. Chỉ bạn ghi vào `backend/data/*.toml`, `plan/`, `README.md`, `CLAUDE.md`, để không có hai agent ghi đè lên nhau. Ngoại lệ: trong luồng tính năng, backend-dev sửa `backend/`, frontend-dev sửa `frontend/`.
5. **Quy mô.** Mặc định nhỏ: mỗi ứng viên 1 người phản biện và tối đa 1 vòng sửa; review dùng 1 người xác minh mỗi phát hiện. Người dùng nói "kỹ", "toàn diện", "thorough" thì tăng lên 3 người phản biện / xác minh và 2 vòng sửa. Có ngân sách token (vd. "+300k") thì truyền vào `args.budget` để script tự giới hạn.
6. **Ngày hôm nay** truyền vào script qua `args.today` (`YYYY-MM-DD`). Script không được gọi `Date.now()` hay `new Date()`.
7. **PostgreSQL** (`localhost:5432`) cần cho `pytest` và `seed`. Lệnh báo lỗi kết nối thì nói với người dùng là chưa chạy được. Không ghi "đã kiểm".

## Báo cáo cho người dùng

Viết bằng tiếng Việt, ngắn, theo thứ tự:
1. **Kết quả**: đã làm gì, bao nhiêu mục qua / không qua.
2. **Việc của bạn**: nguồn cần đọc, luật chờ bật, tên chờ duyệt, quyết định cần chốt. Mỗi việc kèm đường dẫn file.
3. **File đã đổi** và **lệnh đã chạy kèm kết quả**. Nói rõ cái nào chưa chạy được.
4. **Phần bị bỏ / thất bại** và lý do. Không giấu số mục bị loại.

## Xử lý lỗi

| Tình huống | Cách xử lý |
|---|---|
| Một `agent()` trả `null` | Script lọc bằng `.filter(Boolean)` và đếm số bị loại. Báo cáo ghi rõ mục nào thiếu |
| Hết hạn mức sử dụng, hết phiên đăng nhập, bị từ chối quyền | Không thử lại (thử lại vẫn hỏng và tốn hạn mức). Mở file trong `_workspace/` xem đã làm tới đâu, ghi phần thiếu vào `_workspace/<luồng>/missing.md`, báo người dùng (kèm giờ hạn mức được làm mới nếu biết). Sau đó tiếp tục bằng `resumeFromRunId` |
| Kết quả Workflow rỗng | Không coi là thành công. Mở journal / transcript của lần chạy để xem từng agent trả gì |
| Không tìm thấy `agentType` / `subagent_type` | Phiên Claude Code không mở từ thư mục gốc của repo nên không nạp `.claude/agents/`. Nhờ người dùng mở lại `claude` trong `D:\dev-folder\hackathon_ncd\SkinWise`. Nếu buộc phải chạy ngay, dùng `general-purpose` và dán nội dung file agent vào đầu prompt |
| Hai nguồn hoặc hai agent nói ngược nhau | Không xoá bên nào. Ghi cả hai kèm nguồn, để người dùng quyết |
| Agent giữ ngữ cảnh không phản hồi | Gửi `SendMessage` hỏi trạng thái. Vẫn không được thì gọi agent mới cùng loại, dán vào prompt đặc tả, báo cáo cũ và việc còn lại |
| Quá nửa số agent của một bước thất bại | Dừng và hỏi người dùng có chạy tiếp không |

Người điều phối chỉ được tự điền những gì đã tự kiểm. Không đoán thay agent đã dừng, ví dụ đoán vì sao nó bỏ một nguồn.

## Kịch bản kiểm thử

**Luật, bình thường:** "tìm nguồn cho myth azelaic acid + niacinamide". Bước 1 thấy ứng viên này từng "❌ Bỏ" trong `plan/README.md` nên chỉ tìm bằng chứng mới. Workflow trả `no_source` hoặc `passed`. Nếu `passed`: khối luật được ghi với `published = false`, `verify_quotes <key>` đạt, `test_rules.py` đạt, `plan/README.md` có dòng "⏳ Chờ duyệt".
**Luật, lỗi:** trang PMC bị chặn bot. Người tìm nguồn ghi vào `problems` và dùng bản Europe PMC (code tự làm). Người phản biện không tải được trang thì không `confirmed`. Ứng viên thành `unresolved`, không ghi vào TOML, báo cáo nêu lý do.

**Nội dung, bình thường:** "tìm nguồn cho mục tiêu da dễ nổi mụn". Mỗi mục tiêu một agent tìm nguồn, mỗi mục một phán quyết; mục `passed` vào `goals.toml` với `published = false`, `verify_quotes <key>` đạt.
**Nội dung, lỗi:** bản nháp viết "trị mụn" hoặc nhắc tretinoin như hàng tự mua. Người phản biện trả `needs_revision`, vòng sửa đổi lời văn; vẫn sai thì `unresolved`, không ghi vào file.

**Dữ liệu, bình thường:** "thêm 2 sản phẩm chứa azelaic acid bán ở VN". Mỗi sản phẩm có bảng cắt bằng `slice_text.py`, `check_text` đạt, `verify_products <slug>` đạt.
**Dữ liệu, lỗi:** trang chỉ có "thành phần nổi bật". Mục bị `skipped` kèm lý do, rồi tìm sản phẩm khác cùng nhóm.

**Tính năng, bình thường:** "làm nút báo cảnh báo sai" (`plan/after-mvp.md` mục B). Đặc tả được duyệt → backend + frontend → QA đạt → review không có lỗi high → cập nhật `plan/`.
**Tính năng, lỗi:** QA thấy `api.ts` thiếu trường `rule_key` mà `schemas.py` có. Chuyển cho frontend-dev sửa, QA kiểm lại. Sau 3 vòng vẫn hỏng thì báo người dùng.

**Review, bình thường:** "review nhánh này". 5 góc, mỗi phát hiện được xác minh, báo cáo nêu riêng mọi luật được bật trong diff.
**Review, lỗi:** góc `ui-vi` thất bại (`null`). Báo cáo ghi "chưa review góc giao diện". Không ghi "không có lỗi giao diện".
