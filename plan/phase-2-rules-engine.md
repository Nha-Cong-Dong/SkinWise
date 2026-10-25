# Giai đoạn 2: Engine luật + kiểm tra nguồn ✅

28/10–1/11 (bắt đầu sớm 22/10), nhánh `feat/rules-engine`.

**Xong khi:** một routine mẫu ra đúng các cảnh báo dự kiến; mọi đoạn trích qua `verify_quotes`; 5–8 luật đã được người duyệt bật.

## Việc cần làm
- [x] `backend/data/rules.toml`: định dạng luật + nguồn; 5 luật ứng viên (chưa bật)
- [x] Engine `backend/app/engine.py`: phạm vi cùng bước / buổi / ngày; conflict, duplicate, myth; bỏ qua profile
- [x] Seed luật, chặn luật `published` thiếu nguồn hoặc thiếu người duyệt; `load_published_rules()` chỉ lấy luật đã bật có nguồn
- [x] `scripts/verify_quotes.py`
- [x] Test engine (luật giả) + test đầu-cuối với sản phẩm thật đã seed
- [x] Tìm nguồn ứng viên + đoạn trích nguyên văn: 4/5 luật có nguồn, 11/11 đoạn trích qua `verify_quotes`
- [x] Sửa schema: một luật có thể trích nhiều đoạn từ cùng một nguồn (`rule_sources.position`)
- [x] Người duyệt (Vân Anh, 22/10) đọc nguồn và bật 4 luật; luật 3–4 hạ `evidence_level = "low"` vì nguồn gián tiếp; thẻ myth vitamin C + niacinamide để tắt (không có nguồn)
- [ ] Thêm 1–3 luật / 2–3 thẻ myth nếu tìm được nguồn mạnh (chuyển sang việc song song)
  - [x] 25/10: 3 ứng viên có nguồn, 11/11 đoạn trích qua `verify_quotes` (BP + BHA, trùng BP, myth retinoid + niacinamide); 4 ứng viên bị loại vì thiếu nguồn — xem `plan/README.md`
  - [x] Người duyệt (Vân Anh, 25/10) bật 2 luật benzoyl peroxide
  - [x] Người duyệt (Vân Anh, 25/10) bật 2 thẻ myth: retinoid + niacinamide, dẫn xuất vitamin C + niacinamide (41/41 đoạn trích qua `verify_quotes`)
  - [ ] Thẻ myth azelaic acid + retinoid: chờ duyệt
- [x] PR vào `main`

## Tình trạng nguồn (cần bạn đọc trước khi bật)
| Luật | Nguồn | Mức hỗ trợ |
|---|---|---|
| Retinoid + acid tẩy tế bào chết | AAD; nhãn FDA adapalene, tretinoin | Có, nhưng nguồn nói "dùng trong cùng thời gian điều trị", không riêng "cùng buổi"; nhãn thuốc chỉ nói retinoid kê đơn |
| Retinoid + benzoyl peroxide | 2 bài tổng quan PMC; nhãn FDA tretinoin | Rõ với tretinoin dạng thường; retinol mỹ phẩm chỉ có phần kích ứng |
| Trùng acid tẩy tế bào chết | AAD | **Gián tiếp**: nói về tẩy quá mức nói chung |
| Trùng retinoid | Nhãn FDA tretinoin | **Gián tiếp**: nói về dùng quá nhiều một sản phẩm |
| Myth vitamin C + niacinamide | 3 bài trên PMC (2 tổng quan MDPI, 1 bài ACS Omega) | **Chưa thống nhất**: đã được dùng chung trong sản phẩm có thử nghiệm, nhưng trong dung dịch nước / dưới UV niacinamide làm vitamin C phân huỷ nhanh hơn |

## Quy ước của engine
- Luật chỉ so hai sản phẩm **khác nhau**; một sản phẩm chứa cả hai nhóm không bị cảnh báo với chính nó (phối hợp trong một công thức là việc của nhà sản xuất).
- Mỗi (luật, cặp sản phẩm) ra một cảnh báo, liệt kê mọi ngày/buổi áp dụng. Sắp xếp: avoid → caution → info → safe.
- Luật `same_day` không gắn buổi (cặp sản phẩm có thể ở sáng và tối).

## Giới hạn đã biết
- Engine chưa phân biệt sản phẩm rửa trôi (sữa rửa mặt) với sản phẩm để lại trên da: sữa rửa mặt chứa BP/acid vẫn bị so với retinol như serum. Cân nhắc thêm loại sản phẩm nếu có nguồn hỗ trợ.
