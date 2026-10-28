# Kế hoạch và tiến độ

Hạn MVP: **10/11/2026**. Mỗi giai đoạn làm trên một nhánh riêng và vào `main` bằng một PR. Cập nhật file này khi xong mỗi PR.

| # | Giai đoạn | Thời gian | Trạng thái | Chi tiết |
|---|---|---|---|---|
| 0 | Dựng khung: FastAPI, PostgreSQL, React, test | 21–22/10 | ✅ Xong (PR #1) | [phase-0-scaffold.md](phase-0-scaffold.md) |
| 1 | Dữ liệu thành phần: parser INCI, nhóm hoạt chất, sản phẩm mẫu | 23–27/10 | ✅ Xong (PR #2) | [phase-1-ingredients.md](phase-1-ingredients.md) |
| 2 | Engine luật + script kiểm tra đoạn trích nguồn | 28/10–1/11 | ✅ Xong sớm (22/10) | [phase-2-rules-engine.md](phase-2-rules-engine.md) |
| 3 | API: tìm sản phẩm, phân tích INCI, kiểm tra routine, myth, nhận câu hỏi người dùng | 2–3/11 | ✅ Xong sớm (23/10, PR #4) | [phase-3-api.md](phase-3-api.md) |
| 4 | Giao diện: thêm sản phẩm, xếp lịch, cảnh báo, thẻ myth, form gửi câu hỏi | 3–7/11 | ✅ Xong code (23–25/10), chờ review giao diện + merge PR #5 | [phase-4-ui.md](phase-4-ui.md), [phase-4b-ingredient-coverage.md](phase-4b-ingredient-coverage.md) |
| 5 | Hoàn thiện demo, dự phòng | 8–10/11 | ⏳ | |
| — | Tài khoản bắt buộc + đồng bộ (hướng H), chế độ thử, chưa mở cho người dùng thật | 26/10 | 🚧 Xong code, nhánh `feat/accounts` (chưa có PR) | [h-accounts.md](h-accounts.md) |
| — | Sau MVP: những gì chưa làm được, thứ tự đề xuất | sau 10/11 | 🚧 Phần C (độ chính xác) + giao diện mới + phần B (xuất/nhập routine) + thiết kế H + phần E (gộp từ PR #6 để gỡ xung đột): xong code 26/10, chờ review + merge PR #7 | [after-mvp.md](after-mvp.md), [h-accounts.md](h-accounts.md) |

**Chạy song song từ 21/10:** tìm nguồn và duyệt 5–8 luật cảnh báo + 2–3 thẻ myth, xong trước **31/10**. Đây là đường găng. Hiện (25/10): 6 luật + 4 thẻ myth đã bật — **đạt mục tiêu**. Ngày 26/10 bật thêm 4 lưu ý khi dùng (nhạy nắng).

| Luật ứng viên | Loại | Trạng thái |
|---|---|---|
| Retinoid + AHA/BHA cùng buổi | conflict | ✅ Bật (AAD, nhãn FDA) |
| Retinoid + benzoyl peroxide cùng buổi | conflict | ✅ Bật (2 bài tổng quan PMC, nhãn FDA) |
| Nhiều sản phẩm chứa acid tẩy da chết trong một buổi | duplicate | ✅ Bật, nguồn gián tiếp (evidence low) |
| Nhiều sản phẩm chứa retinoid trong một buổi | duplicate | ✅ Bật, nguồn gián tiếp (evidence low) |
| Vitamin C + niacinamide | myth | ✅ Bật (3 bài PMC; bằng chứng chưa thống nhất, mức info) |
| Benzoyl peroxide + BHA cùng buổi | conflict | ✅ Bật 25/10 (nhãn FDA OTC: CeraVe Acne Foaming Cleanser, Clinique SA gel) |
| Nhiều sản phẩm chứa benzoyl peroxide trong một buổi | duplicate | ✅ Bật 25/10 (nhãn FDA OTC CeraVe, nguồn trực tiếp) |
| Retinoid + niacinamide | myth | ✅ Bật 25/10 (RCT Br J Dermatol 2010 + 2 bài PMC; gián tiếp, mức info / evidence low) |
| Dẫn xuất vitamin C + niacinamide | myth | ✅ Bật 25/10 (RCT mù đôi CCID 2024 + PMC8389214; sản phẩm phối hợp, mức info / evidence low) |
| Azelaic acid + retinoid | myth | ✅ Bật 25/10, mức info (tổng quan Pharmaceuticals 2025: hiệu quả hơn ở nám nhưng kích ứng nhiều) |
| AHA làm da nhạy nắng | usage | ✅ Bật 26/10 (hướng dẫn ghi nhãn AHA 2005 + trang AHA của FDA) |
| Benzoyl peroxide làm da dễ cháy nắng | usage | ✅ Bật 26/10 (21 CFR 333.350 + quy tắc FDA 2010, cả sữa rửa mặt) |
| Retinoid làm da nhạy nắng | usage | ✅ Bật 26/10 (4 nhãn thuốc FDA; retinol mỹ phẩm chỉ có AAD, DermNet) |
| BHA và ánh nắng | usage | ✅ Bật 26/10 ở mức info, thông tin hai chiều, không phải cảnh báo (FDA khuyên chống nắng; nghiên cứu FDA/NIH 2009 thấy salicylic acid 2% không làm tăng nhạy nắng) |
| Azelaic acid + acid tẩy da chết cùng buổi | conflict | ⏳ Chờ duyệt 28/10 (nhãn FINACEA Foam trên DailyMed: tránh "peeling agents"; không nêu tên AHA/BHA, evidence low) |
| Azelaic acid + benzoyl peroxide cùng buổi | conflict | ⏳ Chờ duyệt 28/10 (nhãn FDA OTC benzoyl peroxide + nhãn azelaic 20% là thuốc trị mụn + tổng quan PMC10852114; suy luận, evidence low) |
| Nhiều sản phẩm chứa vitamin C trong một buổi | duplicate | ⏳ Chờ duyệt 28/10, mức info (PMC5605218, PMC3673383: tác dụng chỉ tăng tới ~20%; gián tiếp, evidence low) |
| Niacinamide + benzoyl peroxide | myth | ⏳ Chờ duyệt 28/10, mức info (RCT chia nửa mặt 21 người, PMC8594539: BPO 2,5% rửa trôi rồi niacinamide 5%, dung nạp như nhau; một nguồn, evidence low) |
| Benzoyl peroxide + vitamin C | conflict | ❌ Bỏ: chỉ có blog / trang thương mại, không có bài bình duyệt |
| Niacinamide + AHA/BHA | myth | ❌ Bỏ: không có bài bình duyệt về chuyển hoá thành niacin trong sản phẩm thật (bài động học thuỷ phân duy nhất đo ở 89 °C, chỉ có tóm tắt) |
| Vitamin C + retinol | myth | ❌ Bỏ: một thử nghiệm không đối chứng, và hai chất dùng ở hai buổi khác nhau; tìm sâu 25/10 vẫn không có bài bình duyệt trên PMC |
| Azelaic acid + niacinamide | myth | ❌ Bỏ: không tìm được nghiên cứu đã công bố |
| Benzoyl peroxide + AHA cùng buổi | conflict | ❌ Bỏ 28/10: nhãn FDA chỉ nói "topical acne medication" (AHA không phải); SmPC Anh chỉ nói chung "peeling agents"; nói trực tiếp chỉ có blog |
| Vitamin C + AHA/BHA cùng buổi | conflict | ❌ Bỏ 28/10: chỉ có blog nói "xung đột pH"; tổng quan PMC chỉ nói vitamin C > 20% gây kích ứng |
| Nhiều sản phẩm chứa azelaic acid trong một buổi | duplicate | ❌ Bỏ 28/10: ba nhãn thuốc azelaic và DermNet không nói về dùng nhiều sản phẩm cùng lúc |
| AHA + BHA không dùng chung được | myth | ❌ Bỏ 28/10: nguồn duy nhất là nghiên cứu một serum phối hợp sẵn (nhà sản xuất tài trợ, không đối chứng); engine chỉ so hai sản phẩm khác nhau nên thẻ sẽ hiện sai chỗ |

**Hướng B (nhận diện mọi thành phần + chức năng):** làm sớm từ 24/10 bằng danh sách chính thức của EU thay cho CosIng, xem [phase-4b-ingredient-coverage.md](phase-4b-ingredient-coverage.md).

**Nếu bị chậm, cắt theo thứ tự:** Open Beauty Facts → sản phẩm mẫu 30 xuống 15 → thẻ myth 3 xuống 2 → lịch theo thứ trong tuần chỉ còn sáng/tối. **Không cắt** kiểm tra nguồn và duyệt luật.

**Đã chốt cho giai đoạn 3–4 (22/10):**
- Khi không có luật/thẻ nào áp dụng, API và giao diện phải nói rõ "chưa có thông tin đã kiểm chứng — không có cảnh báo không có nghĩa là chắc chắn an toàn" (cả kết quả kiểm tra routine lẫn tra cứu myth).
- `POST /questions`: người dùng gửi câu hỏi / lời đồn (kèm các sản phẩm liên quan nếu có), lưu vào bảng `user_questions` để người duyệt chọn và làm thẻ myth mới theo đúng quy trình nguồn. Form gửi câu hỏi trong giao diện. (Đã bỏ 27/10, xem `decisions.md`.)

Quyết định đã chốt và lý do: [decisions.md](decisions.md).
