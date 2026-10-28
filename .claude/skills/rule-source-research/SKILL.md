---
name: rule-source-research
description: "Quy trình tìm nguồn và soạn luật cảnh báo (conflict, duplicate), thẻ myth và lưu ý khi dùng (usage) cho SkinWise: chọn nguồn uy tín, trích nguyên văn, đọc ngữ cảnh, ghi lưu ý cho người duyệt, soạn khối [[rule]] / [[source]] TOML với published = false, kèm tiêu chí phản biện; mục 9: nội dung có nguồn không phải luật (hoạt chất cho mục tiêu da, thẻ thông tin trong goals.toml). Dùng cho source-researcher và evidence-critic trong luồng tìm nguồn của skinwise-orchestrator, và khi được hỏi 'luật / myth X có nguồn không', 'tìm nguồn cho ...', 'kiểm lại nguồn của luật ...', 'tìm nguồn cho mục tiêu da / thẻ thông tin ...'. Không dùng để bật luật: chỉ người duyệt bật."
---

# Tìm nguồn và soạn luật / thẻ myth

**Không có nguồn thì không có cảnh báo.** Một luật của SkinWise chỉ mạnh bằng nguồn của nó. Người duyệt không có nền y khoa. Họ quyết định bật luật dựa trên đoạn trích bạn đưa và các lưu ý bạn ghi, nên mọi đoạn trích phải đúng nguyên văn và mọi giới hạn của nguồn phải được nói ra.

Công cụ tải trang / kiểm / cắt văn bản: skill `page-evidence`.

## 1. Hiểu ứng viên

1. Viết lại ứng viên thành **một câu khẳng định** cụ thể, kèm cách diễn đạt tiếng Anh để tìm kiếm. Ví dụ: "Dùng retinoid và benzoyl peroxide cùng lúc làm giảm tác dụng của tretinoin" / "benzoyl peroxide oxidizes tretinoin".
2. Xác định mô hình luật (đầu file `backend/data/rules.toml` có mô tả đầy đủ):
   - `kind`: `conflict` (hai nhóm khác nhau) | `duplicate` (cùng nhóm ở nhiều sản phẩm, chỉ `group_a`) | `myth` (kết hợp hay bị đồn là xấu nhưng thực ra ổn, cần `group_b`) | `usage` (lưu ý khi dùng một nhóm, chỉ `group_a`, `scope = "routine"`).
   - `scope`: `same_step` | `same_session` | `same_day`; riêng luật `usage` dùng `routine`.
   - Mã nhóm: đọc `backend/data/functional_groups.toml` (vd. AHA, BHA, PHA có nhóm cha EXFOLIANT_ACID; RETINOID; VITAMIN_C; VITAMIN_C_DERIVATIVE; NIACINAMIDE; BENZOYL_PEROXIDE; AZELAIC_ACID). Luật viết cho nhóm cha áp dụng cho cả nhóm con.
3. Nếu ứng viên cần một nhóm chưa có, thì đó không chỉ là việc thêm luật. Thêm nhóm nghĩa là sửa từ điển hoạt chất, và dự án đã chốt "không thêm nhóm khi chưa có luật có nguồn cho nhóm đó". Ghi vào `open_questions`, đừng tự tạo nhóm.
4. Kiểm trùng:
   - Grep `rules.toml` tìm cặp nhóm / `kind` giống.
   - Đọc bảng luật ứng viên trong `plan/README.md`. Ứng viên đã "❌ Bỏ" chỉ được đề xuất lại khi có bằng chứng **mới**, và phải nói rõ cái gì mới.

## 2. Nguồn chấp nhận được

| Loại | Ví dụ | Lưu ý khi dùng |
|---|---|---|
| Hội da liễu | AAD (aad.org), DermNet (dermnetnz.org) | Trang hướng dẫn cho công chúng; thường nói chung chung, đọc kỹ phạm vi |
| Bài bình duyệt | Tổng quan / RCT trên PMC, JAAD, Br J Dermatol, CCID… | Dùng bản PMC (`pmc.ncbi.nlm.nih.gov/articles/PMC…`); ghi tạp chí + năm; chỉ có tóm tắt thì khó dùng |
| Cơ quan quản lý | FDA (fda.gov), eCFR (21 CFR, vd. 333 thuốc trị mụn OTC), Federal Register, nhãn thuốc trên DailyMed | Nhãn thuốc nói về **thuốc ở nồng độ cố định**: phải ghi lưu ý khi luật áp dụng cho cả mỹ phẩm |
| Đánh giá an toàn | CIR (cir-safety.org) | Kết luận "an toàn ở ≤ X%" là điều kiện an toàn, không phải ngưỡng tác dụng |
| Pháp lý | Quy định EU 1223/2009 (EUR-Lex, tải qua CELLAR), trang CosIng (chỉ đọc trang, không dùng API nội bộ), Hiệp định mỹ phẩm ASEAN | |

**Không dùng:** blog, trang bán hàng, trang của hãng mỹ phẩm (trừ nhãn thuốc OTC đăng trên DailyMed), Healthline và các trang sức khoẻ không có tài liệu tham khảo, diễn đàn, Wikipedia (chỉ dùng để lần ra nguồn gốc), bản tóm tắt do AI viết.

## 3. Tìm

- Tìm nguồn **trực tiếp** cho đúng câu khẳng định trước. Không có thì mới dùng nguồn gián tiếp, và khi đó `evidence_level = "low"` kèm lưu ý (tiền lệ: hai luật `duplicate`).
- Gợi ý tìm: WebSearch với `site:aad.org`, `site:dermnetnz.org`, `site:pmc.ncbi.nlm.nih.gov`, `site:dailymed.nlm.nih.gov`, `site:ecfr.gov`, `site:fda.gov`. Với hoạt chất là thuốc (tretinoin, adapalene, benzoyl peroxide, salicylic acid trị mụn), nhãn trên DailyMed thường có câu về dùng chung.
- **Thẻ myth** cần nguồn cho thấy kết hợp dùng được, hoặc bác bỏ cơ chế bị đồn. Bằng chứng lẫn lộn thì để `severity = "info"`, `evidence_level = "low"`, và nói rõ hai chiều (tiền lệ: vitamin C + niacinamide).
- **Luật usage** cần nguồn nói về một nhóm hoạt chất dùng riêng (vd. làm da nhạy nắng).
- Mỗi nguồn định dùng: tải bằng `fetch_page.py --readable` vào `_workspace/rules/pages/`.

## 4. Đọc ngữ cảnh rồi mới trích

1. Đọc cả mục chứa câu định trích. Ghi lại những điều sau, vì đây chính là phần "Lưu ý người duyệt":
   - Nguồn nói về **ai / cái gì**: thuốc kê đơn hay mỹ phẩm, chất cụ thể nào (tretinoin ≠ mọi retinoid), nồng độ nào, da người hay dung dịch trong phòng thí nghiệm.
   - Nguồn nói **khi nào**: "at the same time" / "concomitant" không giống "cùng buổi".
   - Nguồn **không** nói gì mà luật sẽ ngầm nói (vd. không nhắc PHA, không nhắc sữa rửa mặt).
   - Ai tài trợ, nghiên cứu nhỏ hay lớn, có đối chứng không (với bài báo).
2. Trích 1–3 câu cho mỗi nguồn. Mỗi câu là **một câu hoặc mệnh đề trọn vẹn, đúng từng chữ**. Không nối hai câu cách xa nhau. Không bỏ chữ ở giữa câu.
3. Chạy `check_text.py` cho mọi câu trích. Câu nào `MISSING` thì sửa theo trang.

## 5. Soạn luật

```toml
# Nguồn: <mỗi nguồn một ý: ai (tổ chức / tạp chí, năm, PMC id) nói gì>
# Lưu ý người duyệt:
#   - <giới hạn của nguồn: gián tiếp, chỉ một chất, chỉ thuốc, "cùng lúc" khác "cùng buổi"...>
#   - <vì sao chọn severity / evidence_level này>
[[rule]]
key = "retinoid-benzoyl-peroxide-same-session"   # kebab-case, KHÔNG trùng key đã có
kind = "conflict"
severity = "caution"
scope = "same_session"
evidence_level = "expert_opinion"
group_a = "RETINOID"
group_b = "BENZOYL_PEROXIDE"
title_vi = "Retinoid và benzoyl peroxide trong cùng một buổi"
explanation_vi = "..."
published = false
sources = [
  { url = "https://pmc.ncbi.nlm.nih.gov/articles/PMC5986265/", quote = "..." },
]
```

URL chưa có khối `[[source]]` ở cuối file thì kèm khối mới (test `test_rules_toml_is_valid` bắt thiếu khối này):

```toml
[[source]]
url = "https://pmc.ncbi.nlm.nih.gov/articles/PMC5986265/"
title = "<tiêu đề nguyên văn của trang / bài>"
publisher = "<tạp chí (năm), via PubMed Central>  |  <tổ chức>"
accessed_at = <YYYY-MM-DD hôm nay>
```

**Không bao giờ** thêm `reviewed_by`, `reviewed_at` hay đặt `published = true`. Seed upsert theo `key`, nên một key trùng luật đã bật sẽ âm thầm ghi đè và **tắt** luật đó.

### Chọn mức độ (theo tiền lệ trong `rules.toml`)

| Trường | Giá trị | Khi nào |
|---|---|---|
| `severity` | `avoid` | Nguồn nói rõ phải tránh, và áp dụng được cho sản phẩm bôi da ở mọi nồng độ. Hiếm: nhãn thuốc nói "should be avoided" vẫn để `caution` vì bảng INCI không cho biết nồng độ |
| | `caution` | Nguồn cảnh báo kích ứng / giảm tác dụng / nhạy nắng, kèm việc người dùng có thể làm |
| | `info` | Thông tin, bằng chứng lẫn lộn; mọi thẻ myth có bằng chứng chưa thống nhất |
| | `safe` | Thẻ myth có bằng chứng trực tiếp, nhất quán rằng dùng chung được |
| `evidence_level` | `high` | Hướng dẫn chính thức hoặc RCT nói trực tiếp về đúng kết hợp / tác dụng |
| | `moderate` | Nghiên cứu có đối chứng trên người nhưng hẹp (một chất, tác dụng nhỏ) |
| | `low` | Nguồn gián tiếp hoặc bằng chứng lẫn lộn |
| | `expert_opinion` | Nhãn thuốc, khuyến cáo chuyên gia không kèm dữ liệu |
| `scope` | `same_session` | Nguồn nói "dùng cùng lúc / đồng thời": chọn `same_session`, ghi lưu ý về khác biệt |

### Lời văn

- `title_vi`: ngắn, tả kết hợp. Ví dụ: "Retinoid và acid tẩy tế bào chết trong cùng một buổi", "AHA làm da nhạy nắng hơn".
- `explanation_vi`: 1–3 câu tiếng Việt dễ hiểu, **dùng "có thể"** (bảng INCI không ghi nồng độ). Chỉ nói điều nguồn nói. Lời khuyên chỉ đưa khi nguồn có (tiền lệ: bỏ "dùng xen kẽ" vì không nguồn nào nói). Nêu đúng chất cụ thể nếu nguồn chỉ nói về chất đó. Không dùng "tuyệt đối", "không bao giờ", "chắc chắn an toàn".

## 6. Khi không đủ nguồn

Trả `status = "no_source"` kèm danh sách đã tìm (`searched`) và lý do. Lý do viết theo kiểu dòng "❌ Bỏ" trong `plan/README.md`, ví dụ: "chỉ có blog / trang thương mại, không có bài bình duyệt". Người điều phối sẽ ghi dòng đó vào bảng.

## 7. Dữ liệu trả về (Workflow `schema`)

Câu trả lời cuối cùng của source-researcher là JSON (không phải lời nhắn cho người dùng):

```json
{
  "status": "draft | no_source",
  "key": "...", "kind": "...", "severity": "...", "scope": "...", "evidence_level": "...",
  "group_a": "...", "group_b": "... hoặc null",
  "title_vi": "...", "explanation_vi": "...",
  "sources": [{ "url": "...", "quote": "...", "context": "đoạn văn quanh câu trích, để người phản biện đọc" }],
  "new_source_blocks": [{ "url": "...", "title": "...", "publisher": "..." }],
  "source_summary": "dòng '# Nguồn:' đề xuất",
  "notes_for_reviewer": ["mỗi dòng một lưu ý"],
  "searched": ["truy vấn / trang đã xem và kết quả"],
  "page_files": ["_workspace/rules/pages/..."],
  "problems": ["trang không tải được ..."],
  "open_questions": ["..."]
}
```

## 8. Tiêu chí phản biện (evidence-critic)

Kiểm lần lượt. Mỗi tiêu chí không đạt là một `issue`.

1. **Nguyên văn**: tự chạy `check_text.py` cho mọi `quote` trên file trang (tải lại nếu thiếu hoặc nghi là trang chặn bot).
2. **Ngữ cảnh**: câu trích có ủng hộ đúng khẳng định của luật khi đọc cả đoạn không? Cần soi các trường hợp: câu nằm trong mục liệt kê lời đồn, câu bị phủ định ngay sau, câu nói về đối tượng / chất / nồng độ khác, câu nói về thuốc mà luật áp dụng cho mỹ phẩm.
3. **Uy tín**: nguồn thuộc bảng ở mục 2. Bài báo phải có bình duyệt.
4. **Khớp mô hình luật**: mã nhóm có trong `functional_groups.toml`; `kind` / `group_b` / `scope` hợp lệ (luật `duplicate`, `usage` không có `group_b`; `conflict`, `myth` phải có; `usage` dùng và chỉ dùng `routine`); `scope` không hẹp hay rộng hơn điều nguồn nói mà không có lưu ý.
5. **Mức độ**: `severity` và `evidence_level` theo bảng ở mục 5. Nguồn gián tiếp mà để `moderate` / `high` là lỗi.
6. **Lời văn**: `explanation_vi` không nói quá nguồn, có "có thể", lời khuyên nào cũng có trong nguồn, gọi đúng tên chất. `title_vi` không gây hoảng.
7. **An toàn khi seed**: `key` không trùng luật đã có; `published = false`; không có `reviewed_by` / `reviewed_at`; mọi URL có khối `[[source]]` (cũ hoặc trong `new_source_blocks`).
8. **Lưu ý người duyệt đủ chưa**: giới hạn nào bạn thấy ở bước 2 mà bản nháp không ghi thì thêm vào `issues` (để sửa) hoặc `notes_for_reviewer` (nếu chỉ cần biết).

## 9. Nội dung có nguồn không phải luật (mục tiêu da, thẻ thông tin)

Dùng trong luồng nội dung của orchestrator (`references/flow-content.md`). Các mục này không tạo cảnh báo. Chúng hiển thị nguyên văn trên trang "Mục tiêu", nên lời văn chính là thứ người dùng đọc. Các mục 2–4 vẫn áp dụng (nguồn, tìm, đọc ngữ cảnh). Mục 5 (severity, scope, evidence_level) không áp dụng.

**Cách viết:**
- `title_vi`: ngắn, trung tính, không hứa hẹn kết quả ("Salicylic acid (BHA) cho mụn đầu đen", không viết "Hết mụn với BHA").
- `body_vi`: 2–5 câu tiếng Việt dễ hiểu. Mỗi ý phải có trong đoạn trích hoặc ngay cạnh nó trên trang. Dùng "có thể" khi nguồn chỉ nói "may" / "can help".
  - Mục `active`: nói vì sao nhóm này hợp mục tiêu, kèm lưu ý dùng mà nguồn có nêu (nồng độ khởi đầu, bôi buổi tối, cần bao lâu mới thấy).
- **Không dùng chữ "trị" hay "chữa"** cho mỹ phẩm, vì đó là ngôn ngữ của thuốc (quy định quảng cáo mỹ phẩm ASEAN). Viết "dùng cho", "giúp", "hỗ trợ".
- **Thuốc kê đơn** (tretinoin, hydroquinone, kháng sinh, adapalene ở nồng độ kê đơn, isotretinoin uống): chỉ nhắc kèm câu "cần bác sĩ kê đơn". Không viết như thể người dùng tự mua được. Nguồn là trang thuốc thì ghi rõ trong `notes_for_reviewer`.
- **Không gợi ý sản phẩm hay thương hiệu cụ thể**, kể cả khi nguồn có nhắc tên.
- Nguồn có nói "gặp bác sĩ da liễu khi…" thì đưa vào `body_vi`. Đây là thông tin có ích nhất cho người không có nền y khoa.
- `group` của mục `active` phải là mã có trong `functional_groups.toml`. Nguồn nói về một chất cụ thể (vd. adapalene) mà mục dùng cả nhóm (RETINOID) thì ghi vào `notes_for_reviewer` rằng nguồn chỉ nói về chất đó.

**Phản biện:** dùng tiêu chí 1–3 và 8 ở mục 8, cộng thêm:
- lời văn vi phạm một trong các điều ở trên (nói quá nguồn, có chữ "trị", thuốc kê đơn viết như hàng tự mua, có tên sản phẩm);
- đoạn trích nói về nhóm người khác với người dùng đọc (vd. chỉ da sẫm màu, chỉ viêm da cơ địa) mà `body_vi` viết như áp dụng cho mọi người;
- mục `active` có nhóm không khớp với chất mà nguồn nói.

Mỗi lỗi là một `issue` gắn với `key` của mục.
