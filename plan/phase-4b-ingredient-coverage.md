# Giai đoạn 4b: Nhận diện thành phần (hướng B) + danh sách "thành phần nổi bật"

Bắt đầu 24/10, nhánh `feat/ingredient-coverage` (tách từ `feat/ui`).

**Xong khi:** dán bảng INCI của sản phẩm thật thì gần như mọi dòng được nhận ra kèm chức năng; dán danh sách "thành phần nổi bật" thì app nói rõ đó không phải bảng đầy đủ.

## Việc cần làm
- [x] Nhận ra danh sách "thành phần nổi bật" (`tên: mô tả`), tên tiếng Việt, câu quảng cáo, danh sách quá ngắn → lưu ý trong API và giao diện
- [x] `scripts/import_eu_lists.py`: bảng chú giải EU 2025 (30.418 tên) + danh mục 2006 (7.655 chất có chức năng, 63 định nghĩa) qua CELLAR
- [x] Bảng `inci_names`, `cosmetic_functions`; `resolve()` trả tên EU + chức năng; `GET /functions`
- [x] Trình tách thử thêm tên bỏ phần ngoặc ở giữa (`Simmondsia Chinensis (Jojoba) Seed Oil`)
- [x] `data/common_names.toml`: ~80 tên thông dụng tiếng Việt / tiếng Anh → tên EU
- [x] Giao diện: danh sách thành phần có tên EU, chức năng tiếng Việt, "không nhận ra"
- [x] Test (80 test)
- [x] Rà 59 chất trong từ điển với chức năng EU và vị trí trong sản phẩm mẫu; người duyệt bỏ 3 muối/ester vitamin C khỏi nhóm dẫn xuất (xem `decisions.md`)
- [x] Giữ nồng độ ghi trên nhãn (`10%`, `4,000Ppm`) và hiển thị
- [x] "Đường 1%" sau phenoxyethanol (Điều 19 + Phụ lục V Quy định 1223/2009, đoạn trích qua `verify_quotes`); chỉ hiển thị, không đổi cảnh báo
- [x] #20 Nhãn thuốc kiểu Mỹ (Drug Facts): chỉ đọc mục Active/Inactive ingredients — trước đây mất hoạt chất (vd. benzoyl peroxide trên nhãn CeraVe)
- [x] #21 Gõ sai tên: gợi ý "có phải…?" (pg_trgm), người dùng bấm để sửa; kết quả kiểm tra routine nhắc hoạt chất có thể bị gõ sai
- [x] Nhãn Việt viết "Acid salicylic" / "Axit malic" (tên acid đứng sau) — trước đây mất hoạt chất; phát hiện nhờ lượt rà độc lập
- [ ] PR

## Cần bạn duyệt
- [ ] `data/functions_vi.toml`: bản dịch 64 chức năng (dịch sát định nghĩa EU). 25/10: đã sửa 15 mục theo một lượt rà độc lập (agent), chờ người duyệt
- [ ] `data/common_names.toml`: 87 tên. 25/10: bỏ các mục "Axit …" (code tự đổi "Acid/Axit X" thành "X acid") và mục "Collagen" (trùng tên EU, không bao giờ được dùng); sửa cúc vạn thọ, chanh, cam thảo…; thêm 16 tên. Chỉ còn "Vitamin A" trỏ tới hoạt chất

## Kết quả đo (15 sản phẩm mẫu, 302 dòng)
| | Trước | Sau |
|---|---|---|
| Nhận ra tên | 36 (12%) | 295 (97,7%) |
| Có chức năng | 0 | 219 (72,5%) |

Danh sách "thành phần nổi bật" 12 mục tiếng Việt (ví dụ người dùng đưa): trước tách ra 37 mục rác, không nhận ra mục nào; sau nhận ra 12/12, 6 mục có chức năng, kèm lưu ý.

## Giới hạn đã biết
- Chức năng lấy từ danh mục 2006 nên chất mới hơn (ceramide NP, nhiều chiết xuất thực vật đặt tên sau này) không có chức năng.
- Chức năng là "thường gặp" theo danh mục, không phải vai trò trong công thức cụ thể (vd. Glycerin ghi cả "chất làm biến tính").
- Tên tiếng Việt chỉ phủ ~80 tên hay gặp; tên mơ hồ lấy tên EU đầu tiên để nhận diện.
- Bốn retinoid kê đơn (adapalene, tretinoin, isotretinoin, trifarotene) không có trong bảng chú giải vì bị cấm trong mỹ phẩm EU; từ điển hoạt chất vẫn nhận ra.
