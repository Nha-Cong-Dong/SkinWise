# Giai đoạn 1: Dữ liệu thành phần ✅ (chờ duyệt từ điển)

23–27/10, nhánh `feat/ingredients`.

**Xong khi:** dán bảng INCI của một sản phẩm thật thì ra đúng danh sách hoạt chất và nhóm; seed ~15 sản phẩm có nguồn, mọi sản phẩm qua `verify_products`.

## Việc cần làm
- [x] Thư mục `plan/`
- [x] Parser INCI `backend/app/inci.py`: chuẩn hoá tên (bỏ dấu, chữ thường), tách danh sách, xử lý `Water (Aqua)`, `Aqua/Water`, `*`, `%`, "May contain"
- [x] `backend/data/functional_groups.toml`: ~10 nhóm hoạt chất, tên tiếng Việt
- [x] `backend/data/ingredients.toml`: hoạt chất + từ đồng nghĩa + nhóm + ghi chú chỗ dễ nhầm
- [x] Schema: `products.slug` (khoá ổn định), `products.ingredients_raw`
- [x] `backend/app/ingredients.py`: tra từ điển → hoạt chất, nhóm; giữ tên không nhận ra
- [x] `scripts/seed.py`: upsert dữ liệu TOML vào DB, id ổn định khi seed lại
- [x] `scripts/verify_products.py`: tải trang nguồn, xác nhận từng thành phần có trên trang
- [x] `backend/data/products.toml`: 15 sản phẩm từ trang chính hãng, cả 15 qua `verify_products` (có kiểm tra thứ tự)
- [x] Mở rộng từ điển (hướng A): 32 → 59 chất; thêm biến thể hoạt chất và các chất "trông giống hoạt chất nhưng không phải"; `scripts/unresolved.py` liệt kê tên chưa nhận ra
- [x] Test parser và tra cứu
- [x] Cập nhật `CLAUDE.md`, README; PR vào `main`

## Cần bạn duyệt
- [x] Danh sách sản phẩm (xem bảng dưới) — duyệt cùng kế hoạch giai đoạn 1
- [ ] `backend/data/ingredients.toml`: hoạt chất nào thuộc nhóm nào (bản nháp, có `note` ở chỗ dễ nhầm)

| Nhóm cần phủ | Sản phẩm |
|---|---|
| AHA | The Ordinary Glycolic Acid 7% Toning Solution; The Ordinary Lactic Acid 10% + HA |
| BHA | Paula's Choice Skin Perfecting 2% BHA Liquid Exfoliant; CeraVe SA Smoothing Cleanser |
| AHA+BHA+PHA | Some By Mi AHA-BHA-PHA 30 Days Miracle Toner |
| Retinoid | The Ordinary Retinol 0.5% in Squalane; CeraVe Resurfacing Retinol Serum |
| Vitamin C | Klairs Freshly Juiced Vitamin Drop; The Ordinary Ascorbyl Glucoside Solution 12% |
| Niacinamide | The Ordinary Niacinamide 10% + Zinc 1%; một sản phẩm Cocoon có niacinamide |
| Benzoyl peroxide | CeraVe Acne Foaming Cream Cleanser |
| Azelaic acid | The Ordinary Azelaic Acid Suspension 10% |
| Không hoạt chất mạnh | CeraVe Moisturising Lotion; La Roche-Posay Anthelios |

## Thay đổi so với danh sách ban đầu
- The Ordinary Glycolic Acid 7%: trang không có bảng thành phần trong HTML ở mọi khu vực → thay bằng Mandelic Acid 10% + HA.
- Klairs Freshly Juiced Vitamin Drop: trang hãng lỗi HTTP 500 → thay bằng The Ordinary Vitamin C Suspension 23%.
- Paula's Choice lấy từ trang UK; La Roche-Posay lấy từ trang Ấn Độ (các trang khác chặn script); CeraVe dùng tên Mỹ.
- Some By Mi: "AHA" thực chất là Citric Acid (không tính); dùng làm ví dụ BHA + PHA. Tên trên nhãn là tiếng Anh dịch từ nhãn Hàn, không phải INCI.

## Giới hạn đã biết
- Bảng INCI không có nồng độ: Lactic Acid có thể chỉ là chất chỉnh pH nhưng vẫn được tính là AHA → cảnh báo luôn dùng "có thể".
- Citric Acid không được tính là AHA.
- Trang CeraVe đôi khi ngắt kết nối khi bị gọi liên tục; `fetch_text` tự thử lại, nếu vẫn lỗi thì chạy lại `verify_products` với slug đó.
