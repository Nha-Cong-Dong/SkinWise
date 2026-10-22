# Giai đoạn 2: Engine luật + kiểm tra nguồn 🔄

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
- [ ] **Bạn đọc nguồn, duyệt và bật luật** (`published = true`, `reviewed_by`, `reviewed_at`)
- [ ] Thêm 1–3 luật / thẻ myth nếu tìm được nguồn mạnh
- [ ] PR vào `main`

## Tình trạng nguồn (cần bạn đọc trước khi bật)
| Luật | Nguồn | Mức hỗ trợ |
|---|---|---|
| Retinoid + acid tẩy tế bào chết | AAD; nhãn FDA adapalene, tretinoin | Có, nhưng nguồn nói "dùng trong cùng thời gian điều trị", không riêng "cùng buổi"; nhãn thuốc chỉ nói retinoid kê đơn |
| Retinoid + benzoyl peroxide | 2 bài tổng quan PMC; nhãn FDA tretinoin | Rõ với tretinoin dạng thường; retinol mỹ phẩm chỉ có phần kích ứng |
| Trùng acid tẩy tế bào chết | AAD | **Gián tiếp**: nói về tẩy quá mức nói chung |
| Trùng retinoid | Nhãn FDA tretinoin | **Gián tiếp**: nói về dùng quá nhiều một sản phẩm |
| Myth vitamin C + niacinamide | Không có | Không tìm được nguồn chấp nhận được; đề xuất **chưa làm** thẻ này |

## Quy ước của engine
- Luật chỉ so hai sản phẩm **khác nhau**; một sản phẩm chứa cả hai nhóm không bị cảnh báo với chính nó (phối hợp trong một công thức là việc của nhà sản xuất).
- Mỗi (luật, cặp sản phẩm) ra một cảnh báo, liệt kê mọi ngày/buổi áp dụng. Sắp xếp: avoid → caution → info → safe.
- Luật `same_day` không gắn buổi (cặp sản phẩm có thể ở sáng và tối).
