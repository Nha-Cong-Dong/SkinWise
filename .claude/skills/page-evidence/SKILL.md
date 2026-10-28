---
name: page-evidence
description: "Công cụ dùng chung của SkinWise để tải trang nguồn về file văn bản, kiểm đoạn trích có nguyên văn trên trang, kiểm bảng thành phần (đủ chất, đúng thứ tự) và cắt chính xác một đoạn văn bản từ trang mà không phải gõ lại. Dùng khi tìm nguồn cho luật / thẻ myth, khi thêm sản phẩm mẫu hoặc tên thông dụng, và khi phản biện bằng chứng. Không thay thế scripts.verify_quotes / scripts.verify_products: hai script đó kiểm dữ liệu ĐÃ ghi trong TOML, còn skill này kiểm TRƯỚC khi ghi."
---

# Page evidence: tải trang, kiểm và cắt văn bản nguyên văn

Độ chính xác của SkinWise đến từ trang nguồn, không đến từ trí nhớ của mô hình. Mọi đoạn trích và mọi bảng thành phần phải lấy ra từ văn bản của trang bằng script, rồi kiểm lại bằng script. Gõ lại bằng tay hoặc chép từ trí nhớ dễ sai một chữ, đảo thứ tự, hoặc trộn hai phiên bản của sản phẩm. `verify_products` từng bắt được những lỗi như vậy.

Ba script dưới đây dùng đúng code của dự án (`backend/app/sources.py`, `backend/app/inci.py`). Vì vậy kết quả khớp với `verify_quotes` / `verify_products`: đoạn nào qua ở đây thì cũng qua ở đó.

Chạy mọi lệnh từ **thư mục gốc của repo**. Đặt file trang vào `_workspace/<luồng>/pages/<tên-ngắn>.txt`.

## 1. Tải trang

```bash
uv run --project backend python .claude/skills/page-evidence/scripts/fetch_page.py URL _workspace/rules/pages/aad-exfoliate.txt
uv run --project backend python .claude/skills/page-evidence/scripts/fetch_page.py URL OUT --readable
```

- Mặc định script **giữ** nội dung trong `<script>`, giống script kiểm của dự án, vì nhiều trang hãng nhúng bảng thành phần trong JSON. Dùng bản này để kiểm và để cắt bảng thành phần.
- `--readable` bỏ nội dung script nên dễ đọc hơn. Dùng bản này khi đọc bài báo hay trang hướng dẫn. Đoạn trích tìm thấy trong bản `--readable` thì cũng có trong bản đầy đủ.
- Mã thoát: `0` đã lưu, `1` không tải được (404, 403, mất kết nối), `2` trang chặn bot.
- **PMC** (`pmc.ncbi.nlm.nih.gov/articles/PMC…`): khi PMC chặn bot, code tự chuyển sang Europe PMC. Trang **PubMed** (`pubmed.ncbi.nlm.nih.gov`) chặn tải tự động, nên ưu tiên bản PMC của bài.
- **EUR-Lex**: code tự tải qua CELLAR. Đây là kênh chính thức dành cho tái sử dụng tự động.
- Gặp trang chặn bot thì **không** tìm cách vượt (đổi User-Agent, dùng dịch vụ trung gian): làm vậy trái với cách dự án tôn trọng trang nguồn. Ghi lại trang bị chặn rồi chọn nguồn khác hoặc báo lại.
- Tải từng trang một, không tải dồn dập cùng một trang web. Trang hãng hay ngắt kết nối khi bị tải liên tục.

## 2. Tìm và cắt đoạn văn bản

Tìm vị trí bằng Grep trên file trang. Sau đó cắt bằng script, không gõ lại:

```bash
# Xem mọi chỗ có mốc bắt đầu (bảng thành phần hay xuất hiện 2-3 lần: HTML, JSON, bản của phiên bản khác)
uv run --project backend python .claude/skills/page-evidence/scripts/slice_text.py PAGE --start "Ingredients" --list
# Cắt từ mốc bắt đầu (lần thứ N) tới trước mốc kết thúc
uv run --project backend python .claude/skills/page-evidence/scripts/slice_text.py PAGE --start "Water (Aqua" --include-start --end "[" --occurrence 1 --out _workspace/data/ingr-paulas-bha.txt
```

Khi mốc bắt đầu xuất hiện nhiều lần, so các lần với nhau. Nếu chúng **khác nhau** (hai phiên bản công thức, hoặc bảng của sản phẩm khác in nhầm) thì ghi lại, đừng tự chọn bừa một bản.

## 3. Kiểm

```bash
# Đoạn trích: in OK / MISSING; với MISSING in thêm phần đầu có trên trang để thấy chỗ lệch
uv run --project backend python .claude/skills/page-evidence/scripts/check_text.py PAGE --quote "câu 1" --quote "câu 2"
uv run --project backend python .claude/skills/page-evidence/scripts/check_text.py PAGE --quotes-file _workspace/rules/quotes-x.txt
# Bảng thành phần: từng chất phải có trên trang và đúng thứ tự (như verify_products)
uv run --project backend python .claude/skills/page-evidence/scripts/check_text.py PAGE --ingredients-file _workspace/data/ingr-x.txt
```

Phép so bỏ qua hoa/thường, khoảng trắng và các biến thể của gạch ngang, dấu nháy. Phép so **không** bỏ qua chữ khác, chữ thiếu hay dấu câu khác (trừ những loại vừa kể). Đoạn trích phải là một câu hoặc mệnh đề trọn vẹn, chép đúng từng chữ. Không nối hai câu cách xa nhau thành một đoạn.

Khi `check_text` báo `MISSING`, sửa đoạn trích theo đúng văn bản trên trang. Không sửa trang cho khớp, không "gần đúng là được".

Đoạn trích có trên trang mới chỉ là điều kiện cần. Đoạn trích còn phải nói đúng điều mà luật dùng nó để chứng minh, khi đặt trong ngữ cảnh của trang. Đọc ít nhất cả đoạn văn chứa nó (xem `rule-source-research`).
