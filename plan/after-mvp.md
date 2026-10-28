# Sau MVP: những gì chưa làm được

Lập ngày 26/10/2026. Gom mọi việc chưa làm: tính năng cố ý để sau (CLAUDE.md, README "Dự kiến sau hackathon"), mục "Giới hạn đã biết" của từng giai đoạn và các quyết định ghi "để sau" trong [decisions.md](decisions.md). Chưa có hạn; bắt đầu sau hackathon (10/11), trừ phần "Còn lại trong MVP".

Mọi hướng mở rộng vẫn giữ nguyên tắc: **không có nguồn thì không có cảnh báo**, engine tất định, AI không tạo cảnh báo, luật chỉ bật sau khi người duyệt đọc nguồn. Một hướng cần luật mới mà chưa tìm được nguồn thì dừng ở phần hiển thị, không cảnh báo.

## Còn lại trong MVP (trước 10/11)
- [ ] Review giao diện + merge PR #5 (giai đoạn 4 + 4b)
- [ ] Giai đoạn 5: hoàn thiện demo, dự phòng
- [ ] Sản phẩm mẫu: đang có 15, mục tiêu ~30 (đã ở mức cắt giảm "30 xuống 15", thêm nếu còn thời gian)

## Thứ tự đề xuất

| # | Hướng | Cỡ | Phụ thuộc | Vì sao ở vị trí này |
|---|---|---|---|---|
| A | Mở công khai: triển khai, CI, kiểm tra nguồn định kỳ | M | — | Điều kiện để người thật dùng; mọi hướng sau cần |
| B | Sửa giới hạn giao diện + xuất/nhập routine | S | — | Rẻ, người dùng thấy ngay |
| C | Độ chính xác dữ liệu và engine | M, kéo dài | — | Giá trị cốt lõi; làm dần theo nguồn tìm được |
| D | Open Beauty Facts + mã vạch | M | A | Bớt việc dán INCI; đứng đầu danh sách cắt nên chưa làm trong MVP |
| E | Trang duyệt + AI soạn nháp thẻ myth | M | A | Soạn thẻ myth nhanh hơn (phần câu hỏi người dùng đã bỏ 27/10) |
| F | Hồ sơ da (luật `profile`) | L | A, người duyệt có chuyên môn | Rủi ro y khoa cao nhất |
| G | Chụp ảnh nhãn (OCR) | M | D | Chỉ còn cần cho sản phẩm không có trên Open Beauty Facts |
| H | Tài khoản + đồng bộ | L | A, B | Xuất/nhập ở B đã giải quyết phần lớn nhu cầu |

Cỡ: S ≈ vài ngày, M ≈ 1–2 tuần, L ≈ hơn 2 tuần (một người làm).

## A. Mở công khai

Hiện app chỉ chạy trên máy: frontend gọi backend qua proxy Vite, PostgreSQL cài trực tiếp, chưa có CI (không có `.github/`).

- [ ] Chọn nơi chạy: PostgreSQL 17 có sẵn `pg_trgm` + `unaccent` (kiểm tra trước khi chọn), backend FastAPI, frontend tĩnh; HTTPS
- [ ] Frontend gọi API khác origin: cấu hình CORS cho đúng domain, thay cho proxy `/api` lúc dev
- [ ] Migration: chuyển sang Alembic trước lần đổi schema đầu tiên sau khi có dữ liệu thật (tài khoản, routine); `schema.sql` chạy lặp lại được nhưng không đổi được kiểu cột hay xoá cột
- [ ] Sao lưu các bảng có dữ liệu không sinh lại được từ `data/*.toml` (tài khoản, routine, nháp thẻ myth)
- [ ] CI cho mỗi PR: `pytest` (cần PostgreSQL trong CI), `ruff check`, `npm run build`, `npm run lint`
- [ ] Kiểm tra nguồn định kỳ (vd. hằng tuần): chạy `verify_quotes` và `verify_products`, báo khi đoạn trích hoặc thành phần không còn trên trang
  - **Cần chốt:** đoạn trích biến mất thì làm gì. Đề xuất: báo người duyệt, không tự tắt luật (trang có thể chỉ chặn bot tạm thời); người duyệt đọc lại và quyết định trong vài ngày
- [ ] Trang "Nguồn dữ liệu và ghi công" trong app (hiện chỉ có trong README)

**Xong khi:** người ngoài mở được app qua một địa chỉ HTTPS; mỗi PR chạy test tự động; có báo cáo kiểm tra nguồn định kỳ.

## B. Giới hạn giao diện

Từ [phase-4-ui.md](phase-4-ui.md):
- [ ] Trên điện thoại, kết quả kiểm tra nằm cuối trang. Hướng: tóm tắt số cảnh báo luôn hiện trên đầu, bấm để cuộn tới
- [ ] Tên/nhóm sản phẩm lưu lúc thêm nên cũ đi khi dữ liệu mẫu đổi: làm mới thông tin sản phẩm có `productId` mỗi khi mở app
- [ ] Sản phẩm mẫu bị xoá khỏi DB làm kiểm tra lỗi 422: báo "sản phẩm không còn trong danh sách", giữ phần còn lại của routine

Mở rộng nhỏ:
- [ ] Xuất/nhập routine (file JSON hoặc link chia sẻ mã hoá routine trong URL): chuyển máy, gửi cho người khác xem mà chưa cần tài khoản
- [ ] Nút "báo cảnh báo sai" trên từng thẻ cảnh báo: chỉ lưu mã luật (không có ô nhập tự do), để người duyệt đọc lại nguồn. Bảng câu hỏi đã bỏ (27/10) nên cần bảng riêng

## C. Độ chính xác dữ liệu và engine

### Engine
- [ ] Phân biệt sản phẩm rửa trôi / để lại trên da (giới hạn giai đoạn 2): sữa rửa mặt chứa benzoyl peroxide hay acid đang bị so với serum retinol như nhau. Bước 1 thêm loại sản phẩm vào dữ liệu và chỉ hiển thị; bước 2 chỉ đổi mức cảnh báo khi có nguồn nói rõ về sản phẩm rửa trôi
- [ ] Ngưỡng nồng độ theo từng luật: hiện nồng độ ghi trên nhãn và "đường 1%" chỉ để hiển thị (quyết định 24/10). Chỉ dùng để đổi cảnh báo khi nguồn của luật nêu ngưỡng cụ thể
- [ ] Luật cho một nhóm hoạt chất (nhắc nhở cho một sản phẩm, không phải cặp), vd. nhắc chống nắng khi dùng AHA hay retinoid. Engine hiện chỉ so hai sản phẩm khác nhau nên cần loại luật mới. Ứng viên nguồn (chưa kiểm tra): hướng dẫn ghi nhãn mỹ phẩm chứa AHA của FDA (2005), nhãn FDA của retinoid kê đơn

### Luật và thẻ myth
- [ ] Tìm lại nguồn cho 4 ứng viên đã bỏ (benzoyl peroxide + vitamin C, niacinamide + AHA/BHA, vitamin C + retinol, azelaic acid + niacinamide; lý do ở [README.md](README.md)). Chỉ thêm khi có bài bình duyệt
- [ ] Cảnh báo kích ứng theo danh sách chất gây dị ứng hương liệu của EU (Phụ lục III Quy định 1223/2009, mở rộng bởi Quy định (EU) 2023/1545), để sau 31/10 theo quyết định 24/10. Gắn với hồ sơ "da nhạy cảm" (hướng F); trước đó chỉ hiển thị "chất phải ghi nhãn ở EU"
- [ ] Nhóm hoạt chất mới chỉ thêm cùng luật có nguồn (quyết định 22/10)

### Nhận diện thành phần
- [ ] 27,5% dòng trong sản phẩm mẫu (83/302) nhận ra tên nhưng không có chức năng, vì danh mục EU 2006 không có chất mới hơn (ceramide NP, nhiều chiết xuất thực vật). Không dùng API nội bộ của CosIng (quyết định 24/10). Hướng: theo dõi EU công bố danh mục mới; trong lúc chờ, tự ghi chức năng cho những tên hay gặp nhất, có người duyệt và nguồn cho từng mục
- [ ] Tên thông dụng tiếng Việt mới có 87 tên. Mở rộng theo dòng không nhận ra trong dữ liệu thật. **Cần chốt:** thu thập thế nào mà không lưu văn bản người dùng dán (đề xuất: người dùng bấm gửi riêng tên không nhận ra, chỉ lưu tên)
- [ ] Sản phẩm mẫu: thêm sản phẩm bán ở Việt Nam, ghi `market` vì công thức khác nhau theo thị trường

## D. Open Beauty Facts + mã vạch

Bảng `products` đã có `ingredients_source = 'open_beauty_facts'` và `verification_status`.

- [ ] Gọi API đọc sản phẩm theo mã vạch, gửi User-Agent mô tả rõ app (giống `USER_AGENT` trong `app/sources.py`)
- [ ] Bảng thành phần lấy về đi qua `read_label_text()` như văn bản dán tay, để vẫn có lưu ý khi dữ liệu thiếu, nhiều ngôn ngữ hoặc là danh sách "thành phần nổi bật"
- [ ] Gắn nhãn "dữ liệu cộng đồng, chưa xác minh"; người dùng so với bao bì rồi bấm xác nhận → `user_confirmed`
- [ ] Lưu bản sao có `source_retrieved_at`, làm mới sau một thời gian
- [ ] Ghi công ODbL trong app. **Cần đọc trước khi lưu vào DB:** điều khoản share-alike của ODbL khi trộn dữ liệu Open Beauty Facts với dữ liệu của mình rồi công khai
- [ ] Quét mã vạch bằng camera: API `BarcodeDetector` chưa có trên mọi trình duyệt; luôn có ô gõ mã số. Thêm thư viện quét mã là quyết định mới (MVP chỉ dùng React + Tailwind)
- [ ] Không tìm thấy sản phẩm: dẫn người dùng sang dán INCI và gợi ý đóng góp lên Open Beauty Facts

**Xong khi:** nhập một mã vạch có trên Open Beauty Facts thì sản phẩm vào routine với nhãn nguồn và trạng thái xác minh, cảnh báo giống như dán cùng bảng thành phần.

## E. Trang duyệt + AI soạn nháp

Đã làm ở [e-review.md](e-review.md). Phần câu hỏi người dùng (gửi, duyệt, hiện công khai) đã bỏ ngày 27/10, lý do ở [decisions.md](decisions.md).

- [ ] AI soạn bản nháp thẻ myth (quyết định 22/10): nháp phải kèm nguồn và đoạn trích; server chạy kiểm tra như `verify_quotes`; nháp gắn "chưa kiểm duyệt", lưu ở trạng thái chưa bật, không bao giờ hiện cho người dùng. Người duyệt đọc nguồn và tự bật như mọi luật
- [ ] (Tuỳ chọn) AI diễn đạt lại `explanation_vi` cho dễ hiểu hơn, luôn hiện kèm bản gốc. Không đổi mức độ, không thêm ý mới

## F. Hồ sơ da (luật `profile`)

Engine đã có loại luật `profile` nhưng bỏ qua (`CHECKED_KINDS` trong `app/engine.py`).

- [ ] **Điều kiện trước:** có người duyệt có chuyên môn (bác sĩ da liễu hoặc dược sĩ). Cảnh báo cho người mang thai, cho con bú hoặc đang dùng thuốc có rủi ro cao hơn hẳn luật hiện có, mà người làm không có nền tảng y khoa
- [ ] Chọn hồ sơ: mang thai / cho con bú, da nhạy cảm, đang dùng thuốc trị mụn kê đơn
- [ ] Tìm nguồn cho từng luật. Ứng viên (chưa kiểm tra): mục dùng trong thai kỳ trên nhãn FDA của retinoid kê đơn, hướng dẫn của hội sản phụ khoa
- [ ] Quyền riêng tư: tình trạng mang thai là dữ liệu sức khoẻ, thuộc loại dữ liệu cá nhân nhạy cảm theo quy định Việt Nam (Nghị định 13/2023/NĐ-CP và luật bảo vệ dữ liệu cá nhân mới; cần đọc trước khi làm). Đề xuất: hồ sơ chỉ lưu trên trình duyệt, gửi kèm mỗi lần kiểm tra, server không lưu và không ghi log
- [ ] Lời cảnh báo hồ sơ luôn kết thúc bằng lời khuyên hỏi bác sĩ; không có luật thì nói rõ "chưa có thông tin", như kết quả rỗng hiện nay

## G. Chụp ảnh nhãn (OCR)

`ingredients_source = 'ocr'` đã có trong schema.

- [ ] Chọn cách đọc: trên trình duyệt (vd. Tesseract.js, tải dữ liệu ngôn ngữ nặng), trên server, hay dịch vụ thuê ngoài (chi phí, ảnh rời máy người dùng)
- [ ] Kết quả OCR luôn hiện thành văn bản để người dùng sửa và xác nhận trước khi phân tích; không tự kiểm tra
- [ ] Không lưu ảnh
- [ ] Đo trên ảnh chụp thật của sản phẩm mẫu (chai cong, chữ nhỏ, nhãn nhiều ngôn ngữ) trước khi chọn cách

## H. Tài khoản + đồng bộ

- [ ] Chỉ làm nếu xuất/nhập routine (hướng B) không đủ
- [ ] Đăng nhập không mật khẩu (link qua email hoặc passkey); bảng routine trên server; xung đột giữa hai máy: bản sửa sau thắng
- [ ] Chính sách quyền riêng tư, xoá tài khoản và dữ liệu; hồ sơ da (hướng F) vẫn chỉ lưu trên máy trừ khi người dùng đồng ý riêng
