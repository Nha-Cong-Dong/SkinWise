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
| Lưu ý khi dùng | Nhắc riêng cho từng hoạt chất, không cần kết hợp: AHA, retinoid, benzoyl peroxide có thể làm da nhạy nắng (nguồn FDA); BHA chỉ ghi thông tin vì bằng chứng chưa thống nhất |

### Đã làm sau MVP

| Tính năng | Mô tả |
|---|---|
| Câu hỏi đã được trả lời | Câu hỏi người dùng gửi, được người duyệt trả lời bằng một thẻ có nguồn, hiện trên trang "Sự thật hay myth" (đã biên tập để bỏ thông tin cá nhân) |
| Trang duyệt (`#review`) | Người duyệt đăng nhập, xem câu hỏi, đổi trạng thái, gắn câu hỏi với luật / thẻ trả lời nó |
| AI soạn nháp thẻ myth | Từ các trang nguồn người duyệt chọn; mọi đoạn trích được máy chủ tìm lại trên trang. Bản nháp gắn nhãn "chưa kiểm duyệt", không bao giờ hiện cho người dùng |

### Dự kiến sau hackathon

- Tra cứu sản phẩm theo mã vạch qua [Open Beauty Facts](https://world.openbeautyfacts.org)
- Chụp ảnh nhãn để đọc bảng thành phần (OCR)
- Hồ sơ da: da nhạy cảm, đang mang thai…
- Tài khoản người dùng, đồng bộ routine giữa các thiết bị

Chi tiết và thứ tự ưu tiên: [plan/after-mvp.md](plan/after-mvp.md).

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
- **Nhận diện gần như mọi tên thành phần.** Ngoài các hoạt chất, SkinWise nhận ra tên theo bảng chú giải của EU (khoảng 30.000 tên) và một số tên thông dụng tiếng Việt như "rau má", "trà xanh", kèm chức năng thường gặp (giữ ẩm, làm mềm da, bảo quản…). Phần này chỉ để giải thích, không tạo cảnh báo.
- **Nói rõ khi văn bản dán vào không phải bảng thành phần đầy đủ**, ví dụ danh sách "thành phần nổi bật" của hãng: hoạt chất có thể nằm ở phần không được liệt kê, nên kết quả kiểm tra có thể thiếu.
- **Đánh dấu chất gây dị ứng hương liệu** theo danh sách của EU (khoảng 80 chất, như limonene, linalool), kèm ngưỡng EU bắt buộc ghi riêng trên nhãn. Phần này chỉ để thông tin, không tạo cảnh báo.
- **Ghi rõ sản phẩm rửa trôi hay để lại trên da** với sản phẩm có sẵn. Các nguồn hiện có không miễn cảnh báo cho sữa rửa mặt, nên SkinWise áp dụng luật như nhau cho hai loại và nói rõ điều đó.
- **Không suy diễn nồng độ.** Bảng INCI không ghi nồng độ nên cảnh báo luôn dùng từ "có thể".
- **Tránh nhận diện nhầm.** Ví dụ: Citric Acid thường chỉ là chất điều chỉnh pH, không được tính là AHA tẩy da chết.

## Độ tin cậy

SkinWise được xây theo nguyên tắc **"không có nguồn thì không có cảnh báo"**:

1. Mỗi luật gắn với nguồn uy tín và **lưu nguyên văn đoạn trích** hỗ trợ luật đó.
2. Hệ thống tự kiểm tra đoạn trích có thực sự xuất hiện trên trang nguồn.
3. Luật chỉ được bật sau khi có người đọc và đối chiếu với nguồn.
4. AI **không được tạo ra cảnh báo** và không được tự "nhớ" bảng thành phần của sản phẩm. AI chỉ soạn bản nháp thẻ myth cho người duyệt, từ những trang nguồn người duyệt chọn: mỗi ý phải kèm đoạn trích nguyên văn, máy chủ tìm lại từng đoạn trích trên trang, và bản nháp không bao giờ hiện cho người dùng. Bản nháp chỉ thành thẻ khi người duyệt đọc nguồn và tự bật như mọi luật khác.

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

4. Trang duyệt (không bắt buộc): tạo tài khoản người duyệt rồi mở http://localhost:5173/#review. Muốn dùng AI soạn nháp thẻ myth thì thêm `ANTHROPIC_API_KEY` vào `backend/.env`.

   ```bash
   cd backend
   uv run python -m scripts.reviewers add "Tên người duyệt"   # hỏi mật khẩu
   ```

## Lộ trình

Chi tiết từng giai đoạn và tiến độ: [plan/](plan/README.md).

- [x] Khung dự án: API, cơ sở dữ liệu, test
- [x] Dữ liệu thành phần: phân tích bảng INCI, chuẩn hoá tên, nhóm hoạt chất, sản phẩm mẫu
- [x] Bộ luật cảnh báo đầu tiên (đã đối chiếu nguồn) và engine kiểm tra routine
- [x] API: tìm sản phẩm, phân tích bảng thành phần, kiểm tra routine, thẻ myth, gửi câu hỏi
- [x] Giao diện web: thêm sản phẩm, xếp lịch, xem cảnh báo, thẻ myth, gửi câu hỏi
- [ ] Hoàn thiện demo
- [x] Sau MVP: trang duyệt câu hỏi, AI soạn nháp thẻ myth, hiện câu hỏi đã được trả lời

## Nguồn dữ liệu và ghi công

- Bảng chú giải tên thành phần mỹ phẩm của EU, [Quyết định (EU) 2025/1175](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025D1175): nhận diện tên thành phần trên nhãn. © Liên minh châu Âu, https://eur-lex.europa.eu
- Danh mục thành phần mỹ phẩm của EU năm 2006, [Quyết định 2006/257/EC](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006D0257): chức năng thường gặp của thành phần và định nghĩa từng chức năng. Danh mục này không còn hiệu lực pháp lý, chỉ dùng để tham khảo. © Liên minh châu Âu, https://eur-lex.europa.eu
- Phụ lục III của [Quy định (EC) 1223/2009](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009R1223) (bản hợp nhất), đã sửa đổi bởi [Quy định (EU) 2023/1545](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1545): danh sách chất gây dị ứng hương liệu phải ghi riêng trên nhãn. © Liên minh châu Âu, https://eur-lex.europa.eu
- [EU CosIng](https://single-market-economy.ec.europa.eu/sectors/cosmetics/cosmetic-ingredient-database_en): tham chiếu khi lập từ điển hoạt chất
- [Open Beauty Facts](https://world.openbeautyfacts.org) (dự kiến): dữ liệu sản phẩm mở, giấy phép [ODbL](https://opendatacommons.org/licenses/odbl/1-0/)
- Nguồn y khoa cho từng luật được liệt kê ngay trong cảnh báo tương ứng
