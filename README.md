# SkinWise

**Sắp xếp routine skincare của bạn, biết sản phẩm nào đang trùng hoạt chất và kết hợp nào cần thận trọng, kèm lời giải thích và nguồn tham khảo đáng tin cậy.**

Dự án tham gia hackathon Nhà Cộng Đồng (NCĐ).

> ⚠️ SkinWise là công cụ nhắc nhở và giáo dục, **không thay thế tư vấn của bác sĩ da liễu hay dược sĩ**. Nếu bạn đang mang thai, đang điều trị bệnh da hoặc dùng thuốc kê đơn, hãy hỏi ý kiến chuyên gia.

---

## Vấn đề

Người dùng skincare ngày càng dùng nhiều sản phẩm cùng lúc: sữa rửa mặt, toner, serum, treatment, kem dưỡng, kem chống nắng… Họ thường gặp các vấn đề sau:

- **Không biết các sản phẩm có trùng hoạt chất hay không.** Ví dụ: toner và serum cùng chứa acid tẩy da chết, khiến da bị tẩy quá mức mà không hay biết.
- **Không biết kết hợp nào cần thận trọng.** Ví dụ: dùng retinoid cùng buổi với AHA/BHA dễ gây kích ứng.
- **Thông tin trên mạng mâu thuẫn và nhiều "myth".** Ví dụ: "vitamin C không được dùng chung với niacinamide". Thực tế phần lớn trường hợp dùng chung được.
- **Bảng thành phần (INCI) khó đọc**, toàn tên hoá học bằng tiếng Anh hoặc Latin.

## Giải pháp

SkinWise đọc bảng thành phần của từng sản phẩm, nhận diện các **hoạt chất chính**, rồi kiểm tra cả routine theo lịch sử dụng thực tế (sáng/tối, ngày trong tuần).

Mọi cảnh báo đều:

- **Sinh ra từ bộ luật cố định**, không do AI "đoán";
- Có **mức độ** rõ ràng: *nên tránh*, *thận trọng*, *thông tin*, *an toàn*;
- Có **giải thích bằng tiếng Việt**;
- Có **ít nhất một nguồn tham khảo uy tín** (AAD, DermNet, các bài tổng quan trên PubMed…), kèm trích dẫn nguyên văn đoạn liên quan.

## Tính năng

### Bản MVP (hackathon)

| Tính năng | Mô tả |
|---|---|
| Thêm sản phẩm | Chọn từ danh sách sản phẩm có sẵn (tìm kiếm chấp nhận gõ sai, không dấu) hoặc dán bảng thành phần in trên bao bì |
| Nhận diện hoạt chất | Chuẩn hoá tên INCI, gom về khoảng 10 nhóm hoạt chất: AHA, BHA, PHA, retinoid, vitamin C, niacinamide, benzoyl peroxide… |
| Xếp lịch routine | Gán sản phẩm vào buổi sáng/tối và các ngày trong tuần, theo thứ tự các bước |
| Phát hiện trùng hoạt chất | Cảnh báo khi nhiều sản phẩm trong cùng một buổi chứa cùng nhóm hoạt chất |
| Cảnh báo kết hợp | Một bộ nhỏ các luật có bằng chứng rõ ràng, áp dụng theo phạm vi cùng bước / cùng buổi / cùng ngày |
| Thẻ "Sự thật hay myth" | Giải đáp các lời đồn phổ biến, kèm nguồn |

### Dự kiến sau hackathon

- Tra cứu sản phẩm theo mã vạch qua [Open Beauty Facts](https://world.openbeautyfacts.org)
- Chụp ảnh nhãn để đọc bảng thành phần (OCR)
- Hồ sơ da: da nhạy cảm, đang mang thai…
- Tài khoản người dùng, đồng bộ routine giữa các thiết bị

## Cách hoạt động

```
Bảng thành phần (INCI)
        │  tách danh sách, chuẩn hoá tên (chữ thường, bỏ dấu)
        ▼
Từ điển thành phần + từ đồng nghĩa  (tham chiếu EU CosIng)
        │
        ▼
Nhóm hoạt chất (AHA, RETINOID, …)
        │
        ▼
Routine (sản phẩm × buổi × ngày)  ──►  Bộ luật  ──►  Cảnh báo + giải thích + nguồn
```

- **Luật viết theo nhóm hoạt chất**, không theo từng chất riêng lẻ. Ví dụ: một luật "RETINOID + EXFOLIANT_ACID cùng buổi → thận trọng" áp dụng cho mọi sản phẩm chứa retinol, adapalene, glycolic acid, salicylic acid…
- **Không suy diễn nồng độ.** Bảng INCI không ghi nồng độ nên cảnh báo luôn dùng từ "có thể".
- **Tránh nhận diện nhầm.** Ví dụ: Citric Acid thường chỉ là chất điều chỉnh pH, không được tính là AHA tẩy da chết.

## Độ tin cậy

SkinWise được xây theo nguyên tắc **"không có nguồn thì không có cảnh báo"**:

1. Mỗi luật gắn với nguồn uy tín và **lưu nguyên văn đoạn trích** hỗ trợ luật đó.
2. Hệ thống tự kiểm tra đoạn trích có thực sự xuất hiện trên trang nguồn.
3. Luật chỉ được bật sau khi có người đọc và đối chiếu với nguồn.
4. AI (nếu dùng) chỉ được diễn đạt lại lời giải thích của một luật có sẵn, **không được tạo ra cảnh báo mới** và không được tự "nhớ" bảng thành phần của sản phẩm.

Mỗi sản phẩm cũng ghi lại bảng thành phần lấy từ đâu (nhập tay, dữ liệu mẫu, Open Beauty Facts…) và trạng thái xác minh.

## Công nghệ (dự kiến)

- **Backend:** Python, FastAPI, Pydantic
- **Cơ sở dữ liệu:** PostgreSQL. Tìm kiếm mờ bằng `pg_trgm`
- **Frontend:** React, Vite, Tailwind CSS

## Chạy trên máy

Yêu cầu: Python 3.13+ với [uv](https://docs.astral.sh/uv/), Node.js 22+, PostgreSQL 17.

1. Tạo hai database `skinwise` và `skinwise_test` trong PostgreSQL.
2. Backend:

   ```bash
   cd backend
   cp .env.example .env            # điền mật khẩu PostgreSQL
   uv sync
   uv run python -m scripts.seed          # tạo bảng và nạp dữ liệu mẫu (chạy lại an toàn)
   uv run uvicorn app.main:app --reload   # API tại http://127.0.0.1:8000, tài liệu API tại /docs
   uv run pytest                  # chạy test
   ```

3. Frontend (mở terminal khác):

   ```bash
   cd frontend
   npm install
   npm run dev                    # mở http://localhost:5173
   ```

## Lộ trình

Chi tiết từng giai đoạn và tiến độ: [plan/](plan/README.md).

- [x] Khung dự án: API, cơ sở dữ liệu, test
- [x] Dữ liệu thành phần: phân tích bảng INCI, chuẩn hoá tên, nhóm hoạt chất, sản phẩm mẫu
- [x] Bộ luật cảnh báo đầu tiên (đã đối chiếu nguồn) và engine kiểm tra routine
- [x] API: tìm sản phẩm, phân tích bảng thành phần, kiểm tra routine, thẻ myth, gửi câu hỏi
- [ ] Giao diện web: thêm sản phẩm, xếp lịch, xem cảnh báo
- [ ] Hoàn thiện demo

## Nguồn dữ liệu và ghi công

- [EU CosIng](https://single-market-economy.ec.europa.eu/sectors/cosmetics/cosmetic-ingredient-database_en): từ điển thành phần mỹ phẩm của Liên minh châu Âu
- [Open Beauty Facts](https://world.openbeautyfacts.org) (dự kiến): dữ liệu sản phẩm mở, giấy phép [ODbL](https://opendatacommons.org/licenses/odbl/1-0/)
- Nguồn y khoa cho từng luật được liệt kê ngay trong cảnh báo tương ứng
