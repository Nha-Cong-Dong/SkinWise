# Sau MVP: những gì chưa làm được

Lập ngày 26/10/2026. Gom mọi việc chưa làm: tính năng cố ý để sau (CLAUDE.md, README "Dự kiến sau hackathon"), mục "Giới hạn đã biết" của từng giai đoạn và các quyết định ghi "để sau" trong [decisions.md](decisions.md). Chưa có hạn; bắt đầu sau hackathon (10/11), trừ phần "Còn lại trong MVP".

Mọi hướng mở rộng vẫn giữ nguyên tắc: **không có nguồn thì không có cảnh báo**, engine tất định, AI không tạo cảnh báo, luật chỉ bật sau khi người duyệt đọc nguồn. Một hướng cần luật mới mà chưa tìm được nguồn thì dừng ở phần hiển thị, không cảnh báo.

## Còn lại trong MVP (trước 10/11)
- [ ] Review giao diện + merge PR #5 (giai đoạn 4 + 4b)
- [ ] Giai đoạn 5: hoàn thiện demo, dự phòng
- [x] Sản phẩm mẫu: 30 (thêm 15 sản phẩm bán ở Việt Nam ngày 26/10, đều qua `verify_products`)

## Thứ tự đề xuất

| # | Hướng | Cỡ | Phụ thuộc | Vì sao ở vị trí này |
|---|---|---|---|---|
| A | Mở công khai: triển khai, CI, kiểm tra nguồn định kỳ | M | — | Điều kiện để người thật dùng; mọi hướng sau cần |
| B | Sửa giới hạn giao diện + xuất/nhập routine | S | — | Rẻ, người dùng thấy ngay |
| C | Độ chính xác dữ liệu và engine | M, kéo dài | — | Giá trị cốt lõi; làm dần theo nguồn tìm được |
| D | Open Beauty Facts + mã vạch | M | A | Bớt việc dán INCI; đứng đầu danh sách cắt nên chưa làm trong MVP |
| E | Giao diện duyệt câu hỏi + AI soạn nháp thẻ myth | M | A | Biến câu hỏi người dùng thành thẻ myth nhanh hơn |
| F | Hồ sơ da (luật `profile`) | L | A, người duyệt có chuyên môn | Rủi ro y khoa cao nhất |
| G | Chụp ảnh nhãn (OCR) | M | D | Chỉ còn cần cho sản phẩm không có trên Open Beauty Facts |
| H | Tài khoản + đồng bộ | L | A, B, tư vấn pháp lý | Xuất/nhập ở B đã giải quyết phần lớn nhu cầu; có tài khoản là phát sinh nghĩa vụ theo Luật Bảo vệ dữ liệu cá nhân 2025 |

Cỡ: S ≈ vài ngày, M ≈ 1–2 tuần, L ≈ hơn 2 tuần (một người làm).

## A. Mở công khai

Hiện app chỉ chạy trên máy: frontend gọi backend qua proxy Vite, PostgreSQL cài trực tiếp, chưa có CI (không có `.github/`).

- [ ] Chọn nơi chạy: PostgreSQL 17 có sẵn `pg_trgm` + `unaccent` (kiểm tra trước khi chọn), backend FastAPI, frontend tĩnh; HTTPS. Đặt tại Việt Nam nếu sau này có tài khoản (hướng H, chốt 26/10)
- [ ] Tự lưu font trên máy chủ thay vì tải từ Google Fonts, để trình duyệt người xem không gửi IP ra nước ngoài
- [ ] Frontend gọi API khác origin: cấu hình CORS cho đúng domain, thay cho proxy `/api` lúc dev
- [ ] Giới hạn tần suất `POST /questions` (giới hạn đã biết của giai đoạn 3) và độ dài câu hỏi
- [ ] Migration: chuyển sang Alembic trước lần đổi schema đầu tiên sau khi `user_questions` có dữ liệu thật; `schema.sql` chạy lặp lại được nhưng không đổi được kiểu cột hay xoá cột
- [ ] Sao lưu `user_questions` (bảng duy nhất có dữ liệu không sinh lại được từ `data/*.toml`)
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
- [ ] Câu hỏi chỉ đính kèm được sản phẩm có id: cho đính kèm bảng thành phần tự dán (văn bản nhãn, không phải thông tin cá nhân)

Mở rộng nhỏ:
- [ ] Xuất/nhập routine (file JSON hoặc link chia sẻ mã hoá routine trong URL): chuyển máy, gửi cho người khác xem mà chưa cần tài khoản
- [ ] Nút "báo cảnh báo sai" trên từng thẻ cảnh báo: lưu vào `user_questions` kèm mã luật, để người duyệt đọc lại nguồn

## C. Độ chính xác dữ liệu và engine

### Engine
Rà lại 26/10: mọi ý dưới đây đã đối chiếu với ngữ cảnh trên trang nguồn, không chỉ với đoạn trích.

- [x] Phân biệt sản phẩm rửa trôi / để lại trên da (giới hạn giai đoạn 2: sữa rửa mặt chứa benzoyl peroxide hay acid bị so với serum retinol như hai sản phẩm để lại trên da)
  - [x] Bước 1: `products.application` (`rinse_off` / `leave_on`) cho 15 sản phẩm mẫu, theo định nghĩa ở phần mở đầu Phụ lục II–VI Quy định 1223/2009 (đoạn trích trong `data/legal_basis.toml`). Hiện ở kết quả tìm, chi tiết sản phẩm, và trên thẻ cảnh báo cặp có sản phẩm rửa trôi kèm câu "SkinWise hiện áp dụng luật như nhau cho sản phẩm rửa trôi và sản phẩm để lại trên da". Engine không dùng trường này
  - [x] Bước 2, giảm mức cảnh báo cho sản phẩm rửa trôi: **không làm**, vì nguồn nói ngược lại:
    - 21 CFR 333.350(c)(1)(ii): mọi thuốc trị mụn không kê đơn (benzoyl peroxide, salicylic acid…), kể cả dạng rửa, phải ghi "skin irritation and dryness is more likely to occur if you use another topical acne medication at the same time"
    - Quy tắc FDA 2010 (75 FR 9767): FDA từ chối miễn cảnh báo nắng cho sữa rửa mặt và xà phòng chứa benzoyl peroxide
    - Nhãn tretinoin (Retin-A Micro): "not recommended with concomitant use of medicated or abrasive soaps and cleansers"; nhãn adapalene: dùng cùng "medicated or abrasive soaps and cleansers" "should be approached with caution"
    - Hướng dẫn ghi nhãn AHA của FDA áp dụng cả cho sản phẩm để trên da dưới một giờ rồi rửa sạch
    - Chiều ngược lại chỉ có bằng chứng yếu: một bài quan điểm (Front Pediatr 2025, PMC12318945) nói dạng rửa "better tolerated", nhưng về benzoyl peroxide dùng riêng; một nghiên cứu nhỏ (PMC3016935) dùng sữa rửa mặt benzoyl peroxide buổi sáng và tretinoin dạng vi cầu buổi tối, tức hai buổi khác nhau mà engine vốn không cảnh báo. Không nguồn nào đo mức tương tác giảm bao nhiêu
  - [ ] Sản phẩm tự dán bảng thành phần chưa có loại. Chỉ đáng làm khi loại sản phẩm làm đổi kết quả; hiện chỉ để hiển thị
- [x] Ngưỡng nồng độ theo từng luật: rà xong, **không đổi engine**. Trong đoạn trích và ngữ cảnh nguồn của các luật đã bật và luật chờ duyệt, không đoạn nào nêu ngưỡng mà dưới đó cảnh báo không áp dụng:
  - Benzoyl peroxide: thuốc không kê đơn được phép 2,5–10% (21 CFR 333.310(a)); cảnh báo nắng bắt buộc với mọi sản phẩm ("This warning is required for all OTC topical acne drug products containing benzoyl peroxide"), nghiên cứu FDA dẫn dùng 5% và 10%
  - AHA: FDA khuyến nghị nhãn cho mọi mỹ phẩm có AHA là thành phần ("It is the presence of AHAs in a product, rather than the claims made for certain uses, that may increase the possibility of sunburn"). Chỉ loại thành phần "incidental", vốn không bắt buộc ghi trên nhãn, nên AHA đã có trong bảng thành phần thường không thuộc diện này. Mức ≤ 10%, pH ≥ 3,5 của CIR là điều kiện an toàn khi có hướng dẫn chống nắng hằng ngày, không phải ngưỡng
  - Retinoid: nhãn thuốc áp dụng cho thuốc ở nồng độ cố định. Thẻ myth nêu nồng độ của sản phẩm trong nghiên cứu (vd. azelaic acid 20% + tretinoin 0,05%) như bối cảnh, không phải ngưỡng
  - Nồng độ ghi trên nhãn và "đường 1%" vẫn chỉ để hiển thị (quyết định 24/10). Xem lại khi thêm luật có nguồn nêu ngưỡng
- [x] Luật cho một nhóm hoạt chất: loại `usage` ("Lưu ý khi dùng", phạm vi `routine`). Mỗi luật ra một thẻ, liệt kê mọi sản phẩm trong routine có nhóm đó và mọi ngày/buổi dùng; trong cùng mức độ, thẻ này đứng sau cảnh báo về cặp sản phẩm; tra cặp nhóm ở trang myth không trả luật này. `rule_problems()` chặn luật `usage` có `group_b` hoặc phạm vi khác `routine`
- [x] Trước khi bật luật `usage`: thẻ "Lưu ý khi dùng" không còn được tính vào chip mức độ trên lịch dùng; thanh đếm ghi riêng "n lưu ý khi dùng" (sửa 26/10 sau code review, kiểm tra trên Chrome khổ điện thoại với luật tạm bật trong DB dev)
- [ ] **Cần bạn duyệt:** 4 luật nhạy nắng ứng viên trong `rules.toml`, chưa bật. Lời giải thích đã sửa theo lượt rà (bỏ chỗ nói quá nguồn, thêm đoạn trích); đoạn trích qua `verify_quotes`
  - [ ] `aha-sun-sensitivity` (caution / moderate): hướng dẫn ghi nhãn AHA của FDA (2005), trang AHA của FDA, PMC3047947. Nghiên cứu chỉ dùng glycolic acid. Không áp dụng cho Citric Acid vì SkinWise không tính là AHA, vd. toner Some By Mi "AHA-BHA-PHA" có AHA duy nhất là Citric Acid
  - [ ] `benzoyl-peroxide-sun-protection` (caution / moderate, hoặc expert_opinion cho nhất quán với các luật dựa trên nhãn): 21 CFR 333.350, quy tắc FDA 2010, nhãn CeraVe; áp dụng cả sữa rửa mặt
  - [ ] `retinoid-sun-sensitivity` (caution / expert_opinion): nhãn FDA của tretinoin, adapalene (kê đơn và không kê đơn), tazarotene; với retinol mỹ phẩm chỉ có AAD (lời một bác sĩ da liễu) và DermNet
  - [ ] `bha-sun-protection` (info / low): trang BHA của FDA (cập nhật 2022) vẫn khuyên chống nắng, nhưng nghiên cứu 2009 thấy salicylic acid 2% không làm tăng nhạy nắng. Đề xuất chỉ bật như thông tin hai chiều, hoặc không bật

### Luật và thẻ myth
- [ ] Tìm lại nguồn cho 4 ứng viên đã bỏ (benzoyl peroxide + vitamin C, niacinamide + AHA/BHA, vitamin C + retinol, azelaic acid + niacinamide; lý do ở [README.md](README.md)). Chỉ thêm khi có bài bình duyệt. 26/10: tìm lại, vẫn chưa có nguồn đủ mạnh; làm lại định kỳ
- [x] Chất gây dị ứng hương liệu của EU (Phụ lục III, 80 mục gồm 56 chất thêm bởi Quy định (EU) 2023/1545; bỏ Benzyl Alcohol vì luật chỉ áp dụng khi nó không phải chất bảo quản): nhãn "dị ứng hương liệu" trên từng thành phần + ngưỡng ghi nhãn có đoạn trích, chỉ hiển thị (26/10)
- [ ] Cảnh báo theo danh sách đó: chỉ khi có hồ sơ "da nhạy cảm" (hướng F) và nguồn cho luật
- [ ] Nhóm hoạt chất mới chỉ thêm cùng luật có nguồn (quyết định 22/10)

### Nhận diện thành phần
Đo lại 26/10 trên 30 sản phẩm mẫu (694 dòng): nhận ra tên 693 dòng (99,9%; dòng duy nhất không nhận ra là "Esculenta Lentinus Seed Extract"), có chức năng 519 dòng (74,8%).

**Chức năng của thành phần**
- [ ] Để sau (người duyệt chốt 26/10): chỉ để hiển thị, không ảnh hưởng cảnh báo. 174 dòng (25,1%, 94 tên khác nhau) nhận ra tên nhưng không có chức năng, vì chức năng chỉ lấy từ danh mục EU 2006. Phân loại 94 tên:

  | Loại | Tên | Dòng | Ví dụ | Hướng có nguồn |
  |---|---|---|---|---|
  | Chất lọc UV trong Phụ lục VI Quy định 1223/2009 | 3 | 4 | Bis-Ethylhexyloxyphenol Methoxyphenyl Triazine | Phụ lục VI là căn cứ pháp lý cho chức năng lọc UV; đọc từ bản hợp nhất đã dùng cho chất gây dị ứng, không cần duyệt từng mục |
  | Tên thực vật ghi thêm bộ phận cây | 17 | 23 | Curcuma Longa Root Extract (danh mục 2006 chỉ có Curcuma Longa Extract) | Không tự chép chức năng: theo danh pháp, bộ phận khác là chất khác |
  | Tên theo cách đặt mới | 4 | 22 | Water (2006: Aqua), Ceramide NP / AP / EOP (2006: Ceramide 1–6) | Bảng chú giải 2025 có cả tên cũ lẫn tên mới nhưng không ghi là một chất; cần nguồn nối hai tên |
  | Chất mới sau 2006 hoặc không có trong danh mục | 69 | 112 | Propanediol (13 dòng), Trisodium Ethylenediamine Disuccinate (13), 1,2-Hexanediol (5) | Chờ EU công bố danh mục mới, hoặc ghi tay từng tên với nguồn kiểm được bằng script |

  Thứ tự đề xuất khi làm: Phụ lục VI trước (rẻ, có căn cứ pháp lý, nhưng chỉ 4 dòng); rồi 3 tên hay gặp nhất của loại cuối (31 dòng, 18% số dòng thiếu), mỗi tên một nguồn và người duyệt; phần còn lại chờ EU. Không dùng API nội bộ của CosIng (quyết định 24/10).

**Tên thông dụng tiếng Việt**
- [x] Chốt cách mở rộng (người duyệt, 26/10): không thu thập từ người dùng, kể cả khi người dùng tự bấm gửi; mở rộng bằng tay từ nhãn tiếng Việt trên trang chính hãng
- [x] 26/10: từ 87 lên 125 tên. Cả 38 tên mới đều có `sources`: URL kèm câu trích nguyên văn, trong đó trang in tên tiếng Việt cạnh tên INCI, hoặc nêu tên đó là thành phần chính trong khi bảng INCI cùng trang chỉ có đúng một chất khớp. `verify_quotes` kiểm cả 53 câu trích (trên 25 trang); test chặn tên mới không có nguồn. Không tên mới nào trỏ tới hoạt chất
- [ ] **Cần bạn duyệt:**
  - [ ] 38 tên mới (ghi "CHƯA DUYỆT" trong `common_names.toml`)
  - [ ] 3 tên trỏ tới hoạt chất, chưa thêm: "Vitamin C nguyên chất" → Ascorbic Acid, "Retinol nguyên chất" → Retinol, "Dẫn xuất vitamin C" → 3-O-Ethyl Ascorbic Acid. Tên thứ ba là tên chung, hãng khác có thể dùng cho dẫn xuất khác. Với hai tên đầu có thể làm cách khác: bỏ hậu tố "nguyên chất" trong code
  - [ ] 15 tên bằng chứng vừa: tên EU do Claude chọn theo loài, hoặc trang chỉ ghép cả nhóm tên với cả nhóm INCI. Bằng chứng từng tên ở [vn-names-2026-10-26.md](vn-names-2026-10-26.md)
- [ ] Còn mở, cần quyết định vì ảnh hưởng hoạt chất:
  - "Mật ong lên men": cùng một hãng (Cỏ Mềm) dùng tên này cho Gluconobacter/Honey Ferment Filtrate và cho hỗn hợp có gluconolactone + lactobionic acid (PHA). Ánh xạ cố định sẽ làm mất cảnh báo PHA; đề xuất không ánh xạ
  - "Dẫn xuất 3-O-Ethyl Ascorbic Acid" chưa nhận ra. Không bỏ tiền tố "dẫn xuất" chung chung, vì "Dẫn xuất vitamin C" sẽ thành ascorbic acid; chỉ bỏ khi phần còn lại là tên INCI chính thức của một hoạt chất
  - Dòng nối hai chất bằng "và" ("Hyaluronic acid và Succinic acid") chưa được tách. Nếu tách thì phải cẩn thận với tên tiếng Việt như "hoa sen và hoa súng"
  - "Dầu tầm xuân" (đã có, trỏ Rosa canina / Rosa rubiginosa): nhãn Cỏ Mềm dùng cho Rosa moschata; cân nhắc thêm vào danh sách "có thể là"
- [x] Sửa 26/10: nhãn "Vitamin C (3-O-Ethyl Ascorbic Acid)" từng bị nhận thành ascorbic acid (`plan/decisions.md`)
- [x] Sửa 26/10: lưu ý `long_entries` báo nhầm tên INCI có tên phụ trong ngoặc hoặc sau "/"

**Sản phẩm mẫu**
- [x] 30 sản phẩm, đạt mục tiêu MVP: 16 bán ở Việt Nam (`market = "VN"`), 14 ở nơi khác; 25 để lại trên da, 5 rửa trôi. Tất cả qua `verify_products` (đủ thành phần, đúng thứ tự). Số sản phẩm có từng nhóm hoạt chất:

  | Nhóm | VN | Nơi khác |
  |---|---|---|
  | AHA | 3 | 3 |
  | BHA | 6 | 3 |
  | PHA | 1 | 2 |
  | Retinoid | 2 | 2 |
  | Vitamin C | 1 | 1 |
  | Dẫn xuất vitamin C | 3 | 1 |
  | Niacinamide | 8 | 5 |
  | Azelaic acid | 1 (dẫn xuất) | 1 |
  | Benzoyl peroxide | 0 | 1 |

- [ ] **Cần bạn duyệt:** cả 30 sản phẩm vẫn `verification_status = "unverified"`. Chỉ đổi thành `verified` sau khi người duyệt mở trang xem lại; ghi chú cho người duyệt nằm trên mỗi khối, vd. trang Cocoon C22 có hai bảng thành phần khác nhau, trang sữa rửa mặt CeraVe (VN) có đoạn mô tả chép nhầm của sản phẩm khác
- [ ] Nhóm gắn theo quyết định 24/10, không đoán theo vị trí trong bảng, nên có chip từ chất đứng cuối bảng: vd. La Roche-Posay Mela B3 có retinoid từ Retinyl Palmitate (dòng 27/32) và BHA từ Capryloyl Salicylic Acid (dòng 20/32). Người duyệt xem lại nếu thấy gây hiểu nhầm
- [ ] Chưa có sản phẩm benzoyl peroxide bán ở VN có trang chính hãng đọc được; nhóm azelaic acid ở VN chỉ có dẫn xuất (Potassium Azeloyl Diglycinate trong Cocoon C22)
- Trang đã thử nhưng không dùng được, để thử lại sau: bảng thành phần trên trang thiếu dấu phẩy (La Roche-Posay Retinol B3 Serum, CeraVe Acne Control Gel); tách bằng " . " (Vichy Liftactiv Retinol Serum); in bảng của sản phẩm khác (CeraVe VN "Gel giảm thâm mụn"); không có đủ bảng thành phần trong HTML (Eucerin VN, Bioderma VN, Hada Labo Retinol B3); chỉ có thành phần nổi bật (Acnes VN); chặn script (Paula's Choice VN, HTTP 429). Không tìm thấy trang chính hãng VN của Garnier, Senka, Klairs, Some By Mi, Thorakao

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

## E. Duyệt câu hỏi + AI soạn nháp

Làm 26/10 ở phiên khác (nhánh `feat/review`, PR #6), đã gộp vào `feat/accuracy` (PR #7) để gỡ xung đột giữa hai nhánh. Chi tiết, kiểm tra và giới hạn: [e-review.md](e-review.md).

- [x] Giao diện duyệt (`#review`, đăng nhập người duyệt): xem câu hỏi, đổi trạng thái `new` / `accepted` / `rejected` / `answered`, gắn với luật hoặc thẻ đã tạo
- [x] Hiện cho người dùng những câu hỏi đã thành thẻ myth (bằng lời người duyệt viết lại)
- [x] AI soạn bản nháp thẻ myth (quyết định 22/10): nháp kèm nguồn do người duyệt chọn, máy chủ kiểm đoạn trích, nháp nằm ngoài bảng luật và không bao giờ hiện cho người dùng. Chưa thử với API Claude thật
- [ ] Trang duyệt vẫn dùng màu của giao diện cũ (chỉ người duyệt thấy); chuyển sang token của giao diện mới khi rảnh
- [ ] (Tuỳ chọn) AI diễn đạt lại `explanation_vi` cho dễ hiểu hơn, luôn hiện kèm bản gốc. Không đổi mức độ, không thêm ý mới

## F. Hồ sơ da (luật `profile`)

Engine đã có loại luật `profile` nhưng bỏ qua (chỉ chạy luật trong `PAIR_KINDS` và luật `usage`, xem `app/engine.py`).

- [ ] **Điều kiện trước:** có người duyệt có chuyên môn (bác sĩ da liễu hoặc dược sĩ). Cảnh báo cho người mang thai, cho con bú hoặc đang dùng thuốc có rủi ro cao hơn hẳn luật hiện có, mà người làm không có nền tảng y khoa
- [ ] Chọn hồ sơ: mang thai / cho con bú, da nhạy cảm, đang dùng thuốc trị mụn kê đơn
- [ ] Tìm nguồn cho từng luật. Ứng viên (chưa kiểm tra): mục dùng trong thai kỳ trên nhãn FDA của retinoid kê đơn, hướng dẫn của hội sản phụ khoa
- [ ] Quyền riêng tư: tình trạng mang thai là thông tin sức khoẻ. Danh mục dữ liệu nhạy cảm do Chính phủ ban hành theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 (hiệu lực 01/01/2026); Nghị định hướng dẫn 356/2025/NĐ-CP thay Nghị định 13/2023/NĐ-CP. Cần đọc trước khi làm. Bên trực tiếp xử lý dữ liệu nhạy cảm không được miễn theo Đ.38 (xem [h-accounts.md](h-accounts.md) mục 2). Đề xuất: hồ sơ chỉ lưu trên trình duyệt, gửi kèm mỗi lần kiểm tra, server không lưu và không ghi log
- [ ] Lời cảnh báo hồ sơ luôn kết thúc bằng lời khuyên hỏi bác sĩ; không có luật thì nói rõ "chưa có thông tin", như kết quả rỗng hiện nay

## G. Chụp ảnh nhãn (OCR)

`ingredients_source = 'ocr'` đã có trong schema.

- [ ] Chọn cách đọc: trên trình duyệt (vd. Tesseract.js, tải dữ liệu ngôn ngữ nặng), trên server, hay dịch vụ thuê ngoài (chi phí, ảnh rời máy người dùng)
- [ ] Kết quả OCR luôn hiện thành văn bản để người dùng sửa và xác nhận trước khi phân tích; không tự kiểm tra
- [ ] Không lưu ảnh
- [ ] Đo trên ảnh chụp thật của sản phẩm mẫu (chai cong, chữ nhỏ, nhãn nhiều ngôn ngữ) trước khi chọn cách

## H. Tài khoản + đồng bộ

Thiết kế chi tiết (26/10): [h-accounts.md](h-accounts.md). Chưa viết code.

Người duyệt đã chốt (26/10):
- làm sau B, chỉ khi người dùng thật vẫn cần đồng bộ;
- bên kiểm soát dữ liệu là cá nhân người làm dự án;
- máy chủ và dịch vụ email đặt tại Việt Nam, nên không phải lập hồ sơ chuyển dữ liệu ra nước ngoài (Đ.20);
- kiểm phiên bản thay cho "bản sửa sau thắng";
- xoá tài khoản không dùng sau 24 tháng, giữ bản sao lưu 30 ngày;
- chỉ mã hoá đầu-cuối nếu routine bị coi là dữ liệu nhạy cảm.

- [ ] Chỉ làm khi hướng A đã xong và hướng B (xuất/nhập routine) đã chạy mà người dùng thật vẫn cần đồng bộ
- [ ] **Trước khi viết code:** trả lời 3 câu hỏi pháp lý theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 (hiệu lực 01/01/2026) và Nghị định 356/2025/NĐ-CP. Chưa có ai được giao trả lời:
  - cá nhân làm bên kiểm soát dữ liệu có phải làm đủ Đ.21, Đ.22, khoản 2 Đ.33 không (Đ.38 chỉ miễn cho doanh nghiệp nhỏ, khởi nghiệp, hộ kinh doanh);
  - routine gắn với email có là dữ liệu sức khoẻ không;
  - nội dung bắt buộc của thông báo và văn bản đồng ý.
- [x] Chọn cách đăng nhập: link qua email (người duyệt, 26/10). Token dùng một lần, hạn 15 phút, chỉ lưu hash; link mở trang có nút bấm để trình quét thư không đốt mất token; phiên bằng cookie `HttpOnly; Secure; SameSite=Lax`
- [ ] Bảng `users`, `consents`, `login_tokens`, `sessions`, `routines` (qua Alembic). Chỉ thu email và routine
- [ ] Đồng bộ: kiểm phiên bản (409 khi lệch, hỏi người dùng chọn bản) thay cho "bản sửa sau thắng", vì cách cũ âm thầm xoá thay đổi của máy kia
- [ ] Quyền của người dùng: xem, xuất JSON, xoá tài khoản ngay, rút lại đồng ý; chính sách quyền riêng tư có phiên bản; xoá tài khoản không dùng sau 24 tháng (báo trước 30 ngày), bản sao lưu giữ 30 ngày
- [ ] Hồ sơ da (hướng F) không đồng bộ; câu hỏi người dùng không gắn với tài khoản
- [ ] Đồng bộ mã hoá đầu-cuối: chỉ làm nếu tư vấn kết luận routine là dữ liệu nhạy cảm

Ước lượng 3–4 tuần một người (cỡ L), chưa tính thời gian chờ tư vấn pháp lý.
