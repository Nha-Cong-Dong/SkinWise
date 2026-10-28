---
name: sample-data-entry
description: "Quy trình thêm sản phẩm mẫu (backend/data/products.toml) và tên thông dụng / tên tiếng Việt (backend/data/common_names.toml) cho SkinWise từ trang chính hãng: chọn trang, cắt bảng thành phần nguyên văn bằng script, loại trang không dùng được, soạn TOML, chạy verify_products / verify_quotes / unresolved, kèm tiêu chí phản biện. Dùng cho source-researcher và evidence-critic trong luồng dữ liệu mẫu của skinwise-orchestrator, và khi được yêu cầu 'thêm sản phẩm ...', 'thêm tên tiếng Việt ...', 'sản phẩm X có trong dữ liệu chưa'. Không dùng cho từ điển hoạt chất (ingredients.toml) hay luật."
---

# Thêm dữ liệu mẫu: sản phẩm và tên thông dụng

Sản phẩm mẫu là thứ người xem demo bấm vào đầu tiên, còn tên thông dụng quyết định app có nhận ra hoạt chất trên nhãn tiếng Việt hay không. Cả hai phải **chép nguyên văn từ trang chính hãng** bằng script (skill `page-evidence`), không bao giờ từ trí nhớ. Cảnh báo của engine dựa trên chính bảng thành phần này: sai một chất là sai cảnh báo.

## A. Sản phẩm mẫu (`products.toml`)

### 1. Chọn sản phẩm và trang
- Grep `products.toml` xem đã có sản phẩm chưa (theo `slug`, tên, hãng).
- Ưu tiên sản phẩm giúp demo kích hoạt các luật đã bật (mỗi nhóm hoạt chất có vài sản phẩm), và sản phẩm bán ở Việt Nam (`market = "VN"`) có trang tiếng Việt của hãng.
- Chỉ dùng **trang chính hãng** (trang của hãng, hoặc trang của nhà phân phối do hãng vận hành). Không dùng sàn thương mại, đại lý, blog review.
- `market` là thị trường của trang (US, UK, VN…). Cùng một sản phẩm, bảng thành phần có thể khác nhau giữa các thị trường.

### 2. Lấy bảng thành phần
1. Tải trang (chế độ đầy đủ, **không** `--readable`): `_workspace/data/pages/<slug>.txt`.
2. Tìm vị trí bằng Grep (`Ingredients`, `Thành phần`, `INCI`, `Aqua`, `Water`). Chạy `slice_text.py --list` để thấy mọi chỗ xuất hiện. Nếu các bản **khác nhau** thì dừng lại và ghi vào `problems`.
3. Cắt bằng `slice_text.py --out _workspace/data/ingr-<slug>.txt`. Chỉ bỏ nhãn đầu như "Ingredients:" (parser tự bỏ "Thành phần:" / "Ingredients:"). Không sửa chữ nào bên trong.
4. Chạy `check_text.py PAGE --ingredients-file ...`: mọi chất phải có trên trang và đúng thứ tự.

### 3. Loại trang (tiền lệ trong `plan/decisions.md`, 26/10)
Bỏ trang và chọn sản phẩm khác cùng nhóm khi:
- bảng thành phần thiếu dấu phẩy, hoặc tách bằng " . "
- trang in nhầm bảng của sản phẩm khác (so với tên sản phẩm và hoạt chất mà trang quảng cáo)
- trang chỉ có "thành phần nổi bật" dạng `tên: mô tả` thay cho bảng đầy đủ
- bảng nạp bằng JavaScript, không có trong HTML (file trang không có bảng)
- trang chặn bot

Ghi lý do bỏ vào `skipped` để người điều phối thêm comment vào `products.toml`, theo kiểu các dòng "dropped, its page ..." đã có.

### 4. Trường của sản phẩm
```toml
[[product]]
slug = "cerave-renewing-sa-cleanser"        # kebab-case hãng-tên, ổn định mãi (routine trên trình duyệt tham chiếu)
brand = "CeraVe"
name = "Renewing SA Cleanser"               # như trên trang
market = "US"
application = "rinse_off"                   # rinse_off: sữa rửa mặt, mặt nạ rửa đi | leave_on: toner, serum, kem, kem chống nắng
source_url = "https://..."
retrieved_at = 2026-10-26                   # hôm nay
verification_status = "unverified"          # "verified" chỉ khi verify_products đạt VÀ đã có người xem lại
ingredients = """<nguyên văn từ slice_text>"""
```
`application` theo định nghĩa của Quy định EU 1223/2009 (đoạn trích trong `data/legal_basis.toml`). Không chắc thì ghi vào `open_questions`.

### 5. Sau khi người điều phối ghi vào TOML (chạy trong `backend/`)
- `uv run python -m scripts.verify_products <slug ...>`: mọi sản phẩm mới phải `OK`.
- `uv run python -m scripts.seed`, rồi `uv run python -m scripts.unresolved`: xem tên thành phần chưa nhận ra. Nếu trong đó có thứ trông như hoạt chất bị sót thì báo lại; đừng tự thêm vào từ điển.
- `uv run pytest tests/test_ingredients.py tests/test_rules.py`

## B. Tên thông dụng / tên tiếng Việt (`common_names.toml`)

### 1. Bằng chứng (bắt buộc với mục thêm từ 26/10)
- **Mạnh** (được ghi vào TOML): trang chính hãng in tên tiếng Việt **cạnh** tên INCI (vd. "Kaolin (Đất sét trắng)"); hoặc tên tiếng Việt là "thành phần chính" và bảng INCI cùng trang chỉ có **đúng một** chất khớp.
- **Vừa** (KHÔNG ghi, chỉ đề xuất cho người duyệt): trang in tên loài, nhưng tên EU (bộ phận, dạng dầu / bột) là do mình chọn; hoặc trang ghép cả nhóm tên với cả nhóm INCI.
- `quote` là câu nguyên văn trên trang, kiểm bằng `check_text.py`.
- **Không thu thập tên từ văn bản người dùng dán**, kể cả khi người dùng tự gửi (quyết định 26/10).

### 2. Kiểm trước khi đề xuất
- Tên **chưa** có trong `backend/data/eu_glossary.txt` (Grep `-i`). Tên EU luôn được tra trước, nên một mục trùng sẽ không bao giờ được dùng.
- Tên **chưa** có trong `common_names.toml`.
- Không thêm dạng "Axit / Acid + tên" (code tự thử). Bỏ tiền tố "chiết xuất", "tinh chất", "dịch chiết" (code tự bỏ): đề xuất tên gốc.
- Mọi tên trong `inci` phải có trong `eu_glossary.txt`, viết đúng như trong file (chữ hoa).
- **Tên trỏ tới hoạt chất** làm đổi cảnh báo. Đó là tên mà tên EU đầu tiên trong `inci` có trong `backend/data/ingredients.toml` (trường `inci`, so không phân biệt hoa thường) với `groups` khác rỗng. KHÔNG ghi vào TOML. Đưa vào danh sách chờ duyệt, theo kiểu mục A của `plan/vn-names-2026-10-26.md`.
- Tên mơ hồ (một tên có thể là nhiều chất): ghi mọi tên EU có thể, kèm `note`. Nếu cách hiểu khác nhau làm đổi nhóm hoạt chất thì không thêm (tiền lệ: "Mật ong lên men").

### 3. Mẫu TOML (người điều phối ghi dưới một tiêu đề có ngày và chữ "CHƯA DUYỆT")
```toml
[[name]]
name = "Lá nha đam"
lang = "vi"
inci = ["ALOE VERA LEAF EXTRACT", "ALOE BARBADENSIS LEAF EXTRACT"]
# note = "..."   chỉ khi có chỗ mơ hồ
sources = [
  { url = "https://comem.vn/sp/active-toner-to-tam", quote = "Aloe Vera leaf extract (Chiết xuất lá Nha Đam)" },
]
```

### 4. Sau khi ghi (trong `backend/`)
- `uv run pytest tests/test_ingredients.py` (gồm test tên không trùng, không bị che, có nguồn).
- `uv run python -m scripts.verify_quotes`: không truyền key thì kiểm cả tên thông dụng. Lệnh này tải lại mọi trang nguồn nên chạy mất vài phút.

## C. Dữ liệu trả về (Workflow `schema`)

```json
{
  "kind": "product | name",
  "status": "ok | skipped",
  "product": { "slug": "", "brand": "", "name": "", "market": "", "application": "", "source_url": "", "ingredients": "" },
  "name_entry": { "name": "", "lang": "vi", "inci": [""], "note": null, "sources": [{ "url": "", "quote": "" }],
                  "evidence": "strong | medium", "points_to_active": false },
  "checks": ["lệnh đã chạy và kết quả, vd. check_text --ingredients-file: OK 27 entries"],
  "skipped": "lý do bỏ trang (nếu status = skipped)",
  "page_files": ["_workspace/data/pages/..."],
  "problems": [], "open_questions": []
}
```
`ingredients` phải là đúng nội dung file do `slice_text.py --out` ghi ra.

## D. Tiêu chí phản biện (evidence-critic)

1. **Trang chính hãng**: tên miền là của hãng hoặc nhà phân phối do hãng vận hành; `market` khớp với trang.
2. **Nguyên văn và thứ tự**: tự chạy `check_text.py --ingredients-file` (hoặc `--quote` cho tên thông dụng) trên file trang.
3. **Đúng sản phẩm, đủ bảng**: bảng thuộc đúng sản phẩm (hoạt chất trang quảng cáo có trong bảng); là bảng đầy đủ, không phải thành phần nổi bật; trang không có hai phiên bản khác nhau mà bản nháp chọn bừa một.
4. **Trường**: `slug` chưa có trong `products.toml`, đúng kiểu kebab-case; `application` đúng loại sản phẩm; `verification_status = "unverified"`.
5. **Tên thông dụng**: chưa có trong `eu_glossary.txt` / `common_names.toml`; mọi tên `inci` có trong `eu_glossary.txt`; bằng chứng đạt mức "mạnh"; `points_to_active` đúng (tự đối chiếu với `ingredients.toml`).
