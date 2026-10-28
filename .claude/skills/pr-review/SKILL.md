---
name: pr-review
description: "Review thay đổi của SkinWise trước khi mở PR / merge, theo 5 góc nhìn riêng của dự án: đúng/sai, bảo mật và dữ liệu cá nhân (Luật BVDLCN), nguyên tắc nguồn và tính tất định của engine, giao diện và chữ tiếng Việt, test. Mỗi phát hiện được qa-inspector xác minh trước khi báo. Dùng cho code-reviewer, qa-inspector và người điều phối trong luồng review của skinwise-orchestrator. Dùng khi người dùng nói 'review trước PR', 'review nhánh này', 'kiểm code trước khi merge', 'soát lại thay đổi'. Không dùng cho việc soát nguồn của một luật (dùng rule-source-research)."
---

# Review trước PR

Mục tiêu là tìm **lỗi thật** trước khi merge vào `main`, nhánh phải luôn chạy được cho demo. Một phát hiện sai làm người dùng mất thời gian sửa thứ không hỏng, nên mọi phát hiện đều phải qua bước xác minh.

## 1. Xác định phạm vi (người điều phối)

```bash
git rev-parse --abbrev-ref HEAD
git merge-base HEAD main                 # BASE
git diff --stat BASE...HEAD              # đã commit trên nhánh
git diff --stat                          # chưa commit
git status --porcelain                   # file mới chưa theo dõi
```

- Mặc định: nhánh hiện tại so với `main`, **cộng** thay đổi chưa commit. Người dùng chỉ định khác (một PR, một commit, vài file) thì theo người dùng.
- Thay đổi chưa commit mà trông không liên quan tới nhánh (ví dụ một file trong `plan/` bị đổi ngược) thì hỏi người dùng có đưa vào review không.
- Gom danh sách file và lệnh diff để truyền cho reviewer. Không dán toàn bộ diff vào prompt: reviewer tự chạy lệnh.

## 2. Các góc nhìn

Mặc định chạy cả 5 góc. Diff chỉ chạm một phần thì bỏ góc không liên quan (vd. diff chỉ có `backend/data/` thì bỏ góc giao diện) và nói rõ đã bỏ góc nào.

### `correctness`: đúng / sai
- Logic engine: luật cặp chỉ so hai sản phẩm **khác nhau** cùng phạm vi; mỗi (luật, cặp) ra một cảnh báo kèm mọi ngày / buổi; luật `usage` gom mọi sản phẩm có nhóm; nhóm cha (`with_ancestors`) được tính.
- Đổi `key` ↔ id số nguyên ở `/routine/check`; thứ tự bước; giới hạn kích thước.
- Đồng bộ routine: kiểm `version`, 409 khi lệch, không mất thay đổi; routine của tài khoản khác trên máy dùng chung không bị tải lên.
- `schema.sql` chạy lặp lại được; seed upsert theo khoá tự nhiên, id không đổi.
- Xử lý lỗi mạng / trang chặn bot trong `sources.py` và các script.

### `security-privacy`: bảo mật và dữ liệu cá nhân
- Xác thực: mọi route `/me/*` và `/review/*` (trừ `/review/login`) kiểm phiên; token dùng một lần và hết hạn đúng; so sánh token không lộ qua thời gian; chỉ lưu sha256.
- Cookie `skinwise_session`: HttpOnly, SameSite=Lax. CSRF với route đổi trạng thái.
- Không log email / token / văn bản người dùng.
- Luật BVDLCN 91/2025 và Nghị định 356/2025 (`plan/h-accounts.md`): chỉ lưu email + routine; xoá tài khoản thì xoá dữ liệu; email chỉ chế độ dev cho tới khi có dịch vụ tại Việt Nam.
- SQL ghép chuỗi, đọc file theo đường dẫn người dùng gửi, giải nén link chia sẻ không có trần (`share.ts`: trần 1 MB).
- Khoá bí mật (`ANTHROPIC_API_KEY`…) không lọt vào code, log hay response.

### `source-principle`: nguyên tắc nguồn và tính tất định
- Đường tạo cảnh báo chỉ dùng luật `published` có nguồn (`load_published_rules`). Không có gì ngoài luật (LLM, `suggest()`, nồng độ, đường 1%, dị ứng hương liệu, `application`) bật hay tắt cảnh báo.
- `drafts.py`: nháp nằm ở `rule_drafts`, không bao giờ ở `rules`; không route nào bật được luật; đoạn trích được tìm lại trên đúng văn bản AI đã đọc.
- Thay đổi `backend/data/rules.toml`: luật mới bật (`published = true`) phải có `reviewed_by` / `reviewed_at`. **Luôn nêu riêng mọi luật được bật trong diff** để người dùng xác nhận chính họ đã đọc nguồn. `key` mới không trùng; đoạn trích có nguyên văn (chạy `scripts.verify_quotes <key>` nếu có mạng).
- Thay đổi `products.toml` / `common_names.toml`: có `source_url` / `sources`; tên trỏ tới hoạt chất đã qua duyệt.
- Kết quả rỗng có `notice_vi`; giao diện không diễn đạt lại lời giải thích của luật.

### `ui-vi`: giao diện và chữ tiếng Việt
- Chữ người dùng thấy là tiếng Việt, đúng chính tả, có dấu, dễ hiểu với người không có nền y khoa; cảnh báo dùng "có thể".
- Trạng thái đang tải / lỗi / rỗng cho mọi lời gọi API; không im lặng khi lỗi.
- Màu đậm chỉ cho mức độ cảnh báo (`SEVERITY`); dùng token màu trong `index.css`; buổi sáng / tối đúng giao diện.
- Truy cập: nút có nhãn, hộp thoại (`Dialog.tsx`) nhận phím Esc và giữ focus, ảnh / biểu tượng có chữ thay thế khi mang nghĩa.
- `localStorage` / `sessionStorage` bọc try/catch; không ghi đè routine khi chưa hỏi.

### `tests`: test
- Hành vi mới có test không? Test có kiểm đúng hành vi, hay chỉ chạy qua mà không khẳng định gì?
- Trường hợp lỗi, rỗng và biên (0 sản phẩm, 50 sản phẩm, phiên hết hạn, 409) có test chưa.
- Test có phụ thuộc mạng không (phải thay `fetch_text` / `call_model` như các test hiện có)?
- Test mới sửa dữ liệu dùng chung mà không rollback?

## 3. Mức độ

| Mức | Nghĩa |
|---|---|
| `high` | Sai cảnh báo cho người dùng, lộ dữ liệu cá nhân, mất routine, hỏng demo (`main` không chạy), lỗ hổng xác thực |
| `medium` | Lỗi chức năng có tình huống cụ thể nhưng phạm vi hẹp; thiếu test cho hành vi rủi ro |
| `low` | Lỗi nhỏ có hậu quả thật nhưng ít gặp (chữ sai trên giao diện, trạng thái lỗi thiếu) |

Không báo: định dạng (ruff / oxlint lo), sở thích đặt tên, "nên thêm comment", đề xuất tái cấu trúc không sửa lỗi nào.

## 4. Xác minh (qa-inspector, chế độ B)

Mỗi phát hiện được một qa-inspector (ba người khi người dùng yêu cầu review "kỹ" / "toàn diện") cố bác bỏ. Phát hiện chỉ được báo khi **quá nửa số người xác minh** trả `confirmed`. `uncertain` không tính là đạt. Phát hiện trùng nhau giữa các góc nhìn (cùng file, cùng dòng, cùng nguyên nhân) gộp làm một.

## 5. Báo cáo cho người dùng (người điều phối)

Viết bằng tiếng Việt và lưu vào `_workspace/review-<nhánh>/report.md`:

```markdown
# Review <nhánh> so với main (<ngày>)
Phạm vi: <n> file, <các góc đã chạy / đã bỏ>. Phát hiện: <x> đã xác nhận / <y> tổng (<z> bị bác, <w> chưa chắc).

## Luật được bật trong diff
- <key>: reviewed_by = ..., cần bạn xác nhận đã đọc nguồn   (hoặc "Không có")

## Lỗi đã xác nhận
### [high] <tiêu đề> — `file:dòng`
Tình huống: ...  Bằng chứng: ...  Cách sửa: ...

## Chưa chắc (không tái hiện được, cũng không bác được)
- <tiêu đề> — `file:dòng`: <một dòng>
```

Không tự sửa. Người dùng muốn sửa thì người điều phối chuyển từng lỗi cho backend-dev / frontend-dev, rồi cho qa-inspector kiểm lại phần đã sửa.
