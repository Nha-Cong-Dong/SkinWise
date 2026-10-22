# Kế hoạch và tiến độ

Hạn MVP: **10/11/2026**. Mỗi giai đoạn làm trên một nhánh riêng và vào `main` bằng một PR. Cập nhật file này khi xong mỗi PR.

| # | Giai đoạn | Thời gian | Trạng thái | Chi tiết |
|---|---|---|---|---|
| 0 | Dựng khung: FastAPI, PostgreSQL, React, test | 21–22/10 | ✅ Xong (PR #1) | [phase-0-scaffold.md](phase-0-scaffold.md) |
| 1 | Dữ liệu thành phần: parser INCI, nhóm hoạt chất, sản phẩm mẫu | 23–27/10 | ✅ Xong (PR #2) | [phase-1-ingredients.md](phase-1-ingredients.md) |
| 2 | Engine luật + script kiểm tra đoạn trích nguồn | 28/10–1/11 | ✅ Xong sớm (22/10) | [phase-2-rules-engine.md](phase-2-rules-engine.md) |
| 3 | API: tìm sản phẩm, phân tích INCI, kiểm tra routine, myth, nhận câu hỏi người dùng | 2–3/11 | ⏳ Tiếp theo | |
| 4 | Giao diện: thêm sản phẩm, xếp lịch, cảnh báo, thẻ myth, form gửi câu hỏi | 3–7/11 | ⏳ | |
| 5 | Hoàn thiện demo, dự phòng | 8–10/11 | ⏳ | |

**Chạy song song từ 21/10:** tìm nguồn và duyệt 5–8 luật cảnh báo + 2–3 thẻ myth, xong trước **31/10**. Đây là đường găng. Hiện: 4 luật đã bật, 0 thẻ myth (1 thẻ chờ duyệt).

| Luật ứng viên (chưa có nguồn) | Loại | Trạng thái |
|---|---|---|
| Retinoid + AHA/BHA cùng buổi | conflict | ✅ Bật (AAD, nhãn FDA) |
| Retinoid + benzoyl peroxide cùng buổi | conflict | ✅ Bật (2 bài tổng quan PMC, nhãn FDA) |
| Nhiều sản phẩm chứa acid tẩy da chết trong một buổi | duplicate | ✅ Bật, nguồn gián tiếp (evidence low) |
| Nhiều sản phẩm chứa retinoid trong một buổi | duplicate | ✅ Bật, nguồn gián tiếp (evidence low) |
| Vitamin C + niacinamide | myth | ⏸ Có nguồn PMC nhưng bằng chứng chưa thống nhất; chờ người duyệt quyết định |

**Nếu còn thời gian sau giai đoạn 4:** nhập toàn bộ danh mục EU CosIng để nhận diện mọi thành phần và hiển thị chức năng (hướng B).

**Nếu bị chậm, cắt theo thứ tự:** Open Beauty Facts → sản phẩm mẫu 30 xuống 15 → thẻ myth 3 xuống 2 → lịch theo thứ trong tuần chỉ còn sáng/tối. **Không cắt** kiểm tra nguồn và duyệt luật.

**Đã chốt cho giai đoạn 3–4 (22/10):**
- Khi không có luật/thẻ nào áp dụng, API và giao diện phải nói rõ "chưa có thông tin đã kiểm chứng — không có cảnh báo không có nghĩa là chắc chắn an toàn" (cả kết quả kiểm tra routine lẫn tra cứu myth).
- `POST /questions`: người dùng gửi câu hỏi / lời đồn (kèm các sản phẩm liên quan nếu có), lưu vào bảng `user_questions` để người duyệt chọn và làm thẻ myth mới theo đúng quy trình nguồn. Form gửi câu hỏi trong giao diện.

Quyết định đã chốt và lý do: [decisions.md](decisions.md).
