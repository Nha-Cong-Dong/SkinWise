# Kế hoạch và tiến độ

Hạn MVP: **10/11/2026**. Mỗi giai đoạn làm trên một nhánh riêng và vào `main` bằng một PR. Cập nhật file này khi xong mỗi PR.

| # | Giai đoạn | Thời gian | Trạng thái | Chi tiết |
|---|---|---|---|---|
| 0 | Dựng khung: FastAPI, PostgreSQL, React, test | 21–22/10 | ✅ Xong (PR #1) | [phase-0-scaffold.md](phase-0-scaffold.md) |
| 1 | Dữ liệu thành phần: parser INCI, nhóm hoạt chất, sản phẩm mẫu | 23–27/10 | ✅ Xong (PR #2) | [phase-1-ingredients.md](phase-1-ingredients.md) |
| 2 | Engine luật + script kiểm tra đoạn trích nguồn | 28/10–1/11 | ✅ Xong sớm (22/10) | [phase-2-rules-engine.md](phase-2-rules-engine.md) |
| 3 | API: tìm sản phẩm, phân tích INCI, kiểm tra routine, myth, nhận câu hỏi người dùng | 2–3/11 | ✅ Xong sớm (23/10, PR #4) | [phase-3-api.md](phase-3-api.md) |
| 4 | Giao diện: thêm sản phẩm, xếp lịch, cảnh báo, thẻ myth, form gửi câu hỏi | 3–7/11 | ✅ Xong code (23–25/10), chờ review giao diện + merge PR | [phase-4-ui.md](phase-4-ui.md), [phase-4b-ingredient-coverage.md](phase-4b-ingredient-coverage.md) |
| 5 | Hoàn thiện demo, dự phòng | 8–10/11 | ⏳ | |

**Chạy song song từ 21/10:** tìm nguồn và duyệt 5–8 luật cảnh báo + 2–3 thẻ myth, xong trước **31/10**. Đây là đường găng. Hiện (25/10): 6 luật + 4 thẻ myth đã bật — **đạt mục tiêu**.

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
| Benzoyl peroxide + vitamin C | conflict | ❌ Bỏ: chỉ có blog / trang thương mại, không có bài bình duyệt |
| Niacinamide + AHA/BHA | myth | ❌ Bỏ: không có bài bình duyệt về chuyển hoá thành niacin trong sản phẩm thật (bài động học thuỷ phân duy nhất đo ở 89 °C, chỉ có tóm tắt) |
| Vitamin C + retinol | myth | ❌ Bỏ: một thử nghiệm không đối chứng, và hai chất dùng ở hai buổi khác nhau; tìm sâu 25/10 vẫn không có bài bình duyệt trên PMC |
| Azelaic acid + niacinamide | myth | ❌ Bỏ: không tìm được nghiên cứu đã công bố |

**Hướng B (nhận diện mọi thành phần + chức năng):** làm sớm từ 24/10 bằng danh sách chính thức của EU thay cho CosIng, xem [phase-4b-ingredient-coverage.md](phase-4b-ingredient-coverage.md).

**Nếu bị chậm, cắt theo thứ tự:** Open Beauty Facts → sản phẩm mẫu 30 xuống 15 → thẻ myth 3 xuống 2 → lịch theo thứ trong tuần chỉ còn sáng/tối. **Không cắt** kiểm tra nguồn và duyệt luật.

**Đã chốt cho giai đoạn 3–4 (22/10):**
- Khi không có luật/thẻ nào áp dụng, API và giao diện phải nói rõ "chưa có thông tin đã kiểm chứng — không có cảnh báo không có nghĩa là chắc chắn an toàn" (cả kết quả kiểm tra routine lẫn tra cứu myth).
- `POST /questions`: người dùng gửi câu hỏi / lời đồn (kèm các sản phẩm liên quan nếu có), lưu vào bảng `user_questions` để người duyệt chọn và làm thẻ myth mới theo đúng quy trình nguồn. Form gửi câu hỏi trong giao diện.

Quyết định đã chốt và lý do: [decisions.md](decisions.md).
