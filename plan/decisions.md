# Quyết định đã chốt

Mỗi mục: quyết định, ngày, lý do. Khi đổi ý, sửa mục cũ và ghi ngày đổi thay vì xoá.

## Backend Python + FastAPI (22/10)
Người làm quen Python hơn TypeScript; với 20 ngày, ngôn ngữ quen tay quan trọng hơn việc dùng chung ngôn ngữ với frontend. Chỉ một backend, không chạy thêm service Node. Script dữ liệu cũng viết bằng Python.

## Giữ PostgreSQL, cài trực tiếp trên máy (22/10)
Cần `pg_trgm` + `unaccent` cho tìm sản phẩm chấp nhận gõ sai, không dấu. MySQL không có tương đương. Máy không có Docker nên cài Postgres 17 trực tiếp.

## Công cụ backend: uv, SQLAlchemy 2 + psycopg 3, pytest, ruff (22/10)
Schema là SQL thuần trong `backend/app/schema.sql`, viết để chạy lặp lại không lỗi; chưa dùng Alembic vì MVP chưa cần migration.

## Frontend React + TypeScript + Vite + Tailwind v4 (22/10)
Dev dùng proxy `/api` của Vite thay cho CORS.

## Sản phẩm mẫu lấy từ trang chính hãng (22/10)
Bảng thành phần chép nguyên văn từ trang hãng, lưu `source_url` và ngày lấy; `scripts/verify_products.py` tải lại trang và xác nhận từng thành phần có trên trang. Không chép từ trí nhớ của AI. Trang chặn bot thì đổi sang sản phẩm khác cùng nhóm. Bắt đầu với ~15 sản phẩm, đủ mọi nhóm hoạt chất để demo kích hoạt được từng luật.

## Dữ liệu seed dạng TOML (22/10)
Đọc bằng `tomllib` có sẵn, cho phép comment để ghi chú khi duyệt. Seed upsert theo khoá tự nhiên (`slug` sản phẩm, `inci_name`, mã nhóm) để id không đổi khi seed lại, vì routine trên trình duyệt tham chiếu id sản phẩm.

## Từ điển chỉ chứa hoạt chất; CosIng đầy đủ để sau (22/10)
Mở rộng từ điển theo biến thể của các nhóm đã có và ghi rõ các chất "trông giống hoạt chất nhưng không phải" (`groups = []`). Không thêm nhóm mới khi chưa có luật có nguồn cho nhóm đó. Nhập toàn bộ CosIng (hướng B) chỉ làm nếu còn thời gian sau giai đoạn 4, vì đường găng là nguồn cho luật.

## Kiểm tra sản phẩm theo cả nội dung lẫn thứ tự (22/10)
`verify_products` yêu cầu từng thành phần có trên trang nguồn và xuất hiện đúng thứ tự, để bắt danh sách bị đảo hoặc ghép từ hai phiên bản trên cùng một trang.

## Lời đồn ngoài bộ myth cố định: nói rõ + thu câu hỏi, không để AI trả lời (22/10)
Bộ myth là danh sách cố định có nguồn. Khi không có thông tin, app nói rõ là chưa có thông tin đã kiểm chứng thay vì im lặng (im lặng dễ bị hiểu là an toàn). Người dùng gửi câu hỏi qua `POST /questions`; người duyệt chọn câu đáng làm và tạo thẻ theo quy trình nguồn như luật. Không cho AI trả lời trực tiếp trong MVP vì trái nguyên tắc "cảnh báo không do AI tạo"; sau hackathon có thể cân nhắc AI soạn bản nháp có trích dẫn, server kiểm tra đoạn trích, gắn nhãn "chưa kiểm duyệt" và người duyệt quyết định.

## Nhóm hoạt chất có nhóm cha; tra cặp khớp như engine (23/10)
Chạy thử giao diện thấy tra "Retinoid + BHA" trả "chưa có thông tin" dù có luật Retinoid + EXFOLIANT_ACID: kiểu im lặng dễ hiểu thành an toàn. Khai báo `parent` (AHA/BHA/PHA → EXFOLIANT_ACID) trong `functional_groups.toml` thay vì suy ra từ dữ liệu, để người duyệt thấy rõ; test bắt chất thuộc nhóm con mà thiếu nhóm cha. `/rules` với hai nhóm dùng chính `rule_matches` của engine nên kết quả tra cứu khớp với kết quả kiểm tra routine (vd. AHA + BHA ra luật trùng acid).

## Nhận diện thành phần bằng danh sách EU trên EUR-Lex, không dùng API CosIng (24/10)
CosIng không có file tải về chính thức; trang tra cứu dùng API nội bộ với khoá của chính trang, dùng khoá đó để tải hàng loạt là lạm dụng nên không làm. EUR-Lex chặn script bằng trang kiểm tra bot, nên tải qua CELLAR của Văn phòng Xuất bản EU (kênh dành cho tái sử dụng tự động). Tên lấy từ bảng chú giải hiện hành (2025/1175); chức năng lấy từ danh mục 2006/257/EC, đã hết hiệu lực nên giao diện ghi "để tham khảo". Đo trên 15 sản phẩm mẫu: nhận ra 97,7% dòng, 72,5% có chức năng. Healthline không dùng làm nguồn (không thuộc danh sách nguồn uy tín, không có tài liệu tham khảo, có lỗi như gọi Citric Acid là AHA).

## Văn bản dán vào không phải bảng thành phần đầy đủ thì nói rõ (24/10)
Danh sách "thành phần nổi bật" kèm mô tả trông giống bảng thành phần nhưng bỏ sót phần lớn chất, kể cả hoạt chất. API nhận ra dạng `tên: mô tả`, chỉ lấy tên và trả lưu ý; giao diện gắn nhãn sản phẩm và nhắc trong kết quả kiểm tra rằng cảnh báo có thể thiếu. Không chặn hẳn vì người dùng vẫn cần biết từng chất là gì.

## Tên thông dụng tiếng Việt duyệt như từ điển hoạt chất (24/10)
`common_names.toml` ánh xạ "rau má", "axit salicylic"… sang tên EU. Tên trỏ tới hoạt chất làm thay đổi cảnh báo nên cần người duyệt; tên mơ hồ (cúc La Mã, lô hội) ghi mọi tên EU có thể kèm ghi chú, tên đầu tiên được dùng để nhận diện.

## Rà từ điển hoạt chất: chất phụ trợ không tính là hoạt chất (24/10)
Bắt đầu từ một sản phẩm phục hồi bị gắn chip "Dẫn xuất vitamin C" vì Ascorbyl Palmitate (vị trí 39/40, cạnh các loại dầu). Người duyệt quyết định:
- Bỏ khỏi nhóm dẫn xuất vitamin C: Ascorbyl Palmitate, Sodium Ascorbate, Calcium Ascorbate. Chúng chủ yếu dùng lượng nhỏ để chống oxy hoá cho công thức. Cùng cách như Citric Acid: vẫn nhận ra tên và chức năng, không thuộc nhóm nào. Không ảnh hưởng cảnh báo (chưa có luật cho nhóm này).
- Giữ AHA cho Malic Acid, Tartaric Acid; giữ nguyên Lactic/Glycolic/Salicylic Acid và các ester retinyl dù chúng cũng hay chỉ để chỉnh pH, bảo quản hoặc có lượng rất nhỏ: với app cảnh báo, bỏ sót nguy hiểm hơn báo thừa, và cảnh báo đã dùng "có thể".
- Không đoán theo vị trí trong bảng vì INCI không cho biết ngưỡng 1%.
- Chức năng trong danh mục EU 2006 **không** dùng làm tiêu chí phân loại hoạt chất: danh mục ghi vai trò mỹ phẩm rất hẹp (Glycolic Acid chỉ "BUFFERING", Niacinamide chỉ "SMOOTHING").

## Nồng độ chỉ để hiển thị, không tắt cảnh báo (24/10)
Bảng INCI không cho biết chất nào là "chính". Hai tín hiệu đáng tin được hiển thị: nồng độ ghi trên nhãn, và "đường 1%" (theo Điều 19, mọi thành phần sau phenoxyethanol, chất bị Phụ lục V giới hạn 1%, đều ≤ 1%, trừ chất tạo màu). Không dùng để tắt cảnh báo vì ≤ 1% vẫn có thể có tác dụng (retinol) và chưa có nguồn cho ngưỡng nồng độ của từng luật. Không đoán "chính/phụ" theo vị trí. Cảnh báo kích ứng theo danh sách chất gây dị ứng hương liệu của EU để sau 31/10.

## Gõ sai tên hoạt chất: gợi ý, không tự sửa (25/10)
Gõ sai ("Salicilic Acid") làm mất hoạt chất và mất cảnh báo. Không tự nhận tên gần đúng là hoạt chất vì có thể sai (vd. "salicilic acid" cũng gần "malic acid"), trái nguyên tắc engine tất định. App gợi ý tên gần đúng, người dùng bấm để sửa chính văn bản; kết quả kiểm tra nhắc rõ sản phẩm có thể đang thiếu cảnh báo.

## Duyệt từ điển hoạt chất (25/10)
Người duyệt duyệt toàn bộ 59 chất. Bỏ từ đồng nghĩa "BHA" của Salicylic Acid: trên nhãn, BHA là tên INCI của butylated hydroxyanisole (chất chống oxy hoá), nên sản phẩm có chất này bị cảnh báo như có acid tẩy tế bào chết. Test chặn từ đồng nghĩa trùng tên INCI của chất khác. Sodium Salicylate không tính BHA (chất bảo quản); ammonium lactate/glycolate vẫn là AHA.

## Luật "lưu ý khi dùng" cho một nhóm hoạt chất (26/10)
Một số lưu ý có nguồn mạnh không phải chuyện kết hợp hai sản phẩm (vd. nhạy nắng khi dùng AHA). Thêm loại luật `usage`, phạm vi `routine`: mỗi luật ra một thẻ liệt kê mọi sản phẩm có nhóm đó, thay vì một thẻ cho mỗi sản phẩm, để không lặp cùng một lời giải thích. Luật vẫn theo quy trình nguồn như mọi luật: ứng viên để `published = false` cho đến khi người duyệt đọc nguồn. Tra cặp nhóm ở trang myth không trả luật `usage` vì luật này không nói về cặp.

## Sản phẩm rửa trôi / để lại trên da: chỉ hiển thị (26/10)
Engine đang so sữa rửa mặt chứa benzoyl peroxide hay acid với serum retinol như hai sản phẩm để lại trên da. Thêm `application` cho sản phẩm mẫu (theo định nghĩa của Quy định EU 1223/2009) và hiện trên giao diện, kèm câu nói rõ SkinWise áp dụng luật như nhau cho hai loại. Không giảm mức cảnh báo cho sản phẩm rửa trôi: tìm nguồn 26/10 không thấy nguồn uy tín nào miễn cho sữa rửa mặt, mà ngược lại. Nhãn FDA của CeraVe Acne Foaming Cleanser (sữa rửa mặt) vẫn cảnh báo dùng chung thuốc trị mụn khác; FDA từ chối miễn cảnh báo nắng cho sữa rửa mặt chứa benzoyl peroxide (quy tắc 2010, 75 FR 9767); nhãn tretinoin và adapalene nêu "medicated or abrasive soaps and cleansers" là sản phẩm cần thận trọng. Chỉ có một bài quan điểm (Front Pediatr 2025) nói sữa rửa mặt benzoyl peroxide dễ dung nạp hơn và một nghiên cứu nhỏ dùng hai buổi khác nhau (PMC3016935), không đo mức tương tác giảm bao nhiêu. Sản phẩm tự dán INCI không có thông tin này.

## Chất gây dị ứng hương liệu của EU: chỉ hiển thị (26/10)
Gắn nhãn "dị ứng hương liệu" cho thành phần có trong Phụ lục III (80 mục, gồm 56 chất Quy định (EU) 2023/1545 thêm vào; sửa 26/10 sau code review: bỏ Benzyl Alcohol vì mục 45 chỉ áp dụng "for purposes other than inhibiting the development of microorganisms", mà bảng thành phần không cho biết chất dùng để làm gì; thêm các đồng phân Rose ketones in khác dạng với bảng chú giải), kèm ngưỡng ghi nhãn 0,001% / 0,01% trích từ quy định đó. Không tạo cảnh báo: chưa có hồ sơ da nhạy cảm, và có chất trong danh sách không có nghĩa là sản phẩm gây dị ứng. Danh sách lấy từ bản hợp nhất của Quy định 1223/2009 qua CELLAR (bản hợp nhất chỉ là tài liệu tham khảo; mã bản hợp nhất ghi trong `eu_lists.py`). Bảng HTML của EU khai báo gộp ô (rowspan) không nhất quán nên trình đọc không dựa vào gộp ô: tên trên dòng chính lấy theo cột, dòng tiếp theo chỉ lấy ô trùng tên trong bảng chú giải EU. Chỉ so tên đúng (vd. "Lavandula Angustifolia Oil" có trong danh sách nhưng "Lavandula Angustifolia Flower Oil" thì không).

## Tên tiếng Việt: không thu thập từ người dùng; chức năng của chất mới để sau (26/10)
Người duyệt chọn không thu thập tên mà app không nhận ra từ văn bản người dùng dán, kể cả khi người dùng tự bấm gửi. Mở rộng `common_names.toml` bằng tay từ nhãn tiếng Việt trên trang chính hãng của sản phẩm bán ở Việt Nam. Chức năng cho chất không có trong danh mục 2006 (ceramide NP, propanediol, chất chống nắng mới…: 79 dòng trong sản phẩm mẫu) để sau: chỉ để hiển thị mà cần duyệt từng mục.

## Tên INCI chính thức thắng từ đồng nghĩa trong cùng một dòng (26/10)
Nhãn Việt dùng "Vitamin C" cho cả dẫn xuất ("22% Vitamin C (3-O-Ethyl Ascorbic Acid)"). Trước đây `resolve()` lấy phần khớp đầu tiên, nên từ đồng nghĩa "vitamin c" biến dẫn xuất thành ascorbic acid (nhóm VITAMIN_C) và hiện sai thẻ myth. Giờ nếu cả dòng không khớp thì trong các phần của "A (B)" / "A/B", tên INCI chính thức của một hoạt chất thắng từ đồng nghĩa. Nhãn ghi trơn "Vitamin C" vẫn là ascorbic acid. Không sản phẩm mẫu nào đổi nhóm.

## Sản phẩm mẫu bán ở Việt Nam và tên tiếng Việt (26/10)
Thêm 15 sản phẩm `market = "VN"` từ trang tiếng Việt của hãng (La Roche-Posay, Vichy, CeraVe, Cocoon, Hada Labo), lên 30 sản phẩm; bảng thành phần trích bằng script từ văn bản trang, qua `verify_products`. Bỏ các trang thiếu dấu phẩy trong chính bảng thành phần (La Roche-Posay Retinol B3, CeraVe Acne Control Gel), tách bằng " . " (Vichy Liftactiv Retinol), in nhầm bảng của sản phẩm khác (CeraVe Resurfacing Retinol VN), hoặc chỉ có thành phần nổi bật / bảng nạp bằng JavaScript (Eucerin, Bioderma, Acnes). Thêm 38 tên tiếng Việt có bằng chứng mạnh vào `common_names.toml` (chưa duyệt); 3 tên trỏ tới hoạt chất và 15 tên bằng chứng vừa chờ người duyệt ở `plan/vn-names-2026-10-26.md`. Từ nay mỗi tên thông dụng mới phải có `sources`: trang chính hãng in tên đó cạnh tên INCI (hoặc nêu nó là thành phần chính khi bảng INCI cùng trang chỉ có đúng một chất khớp), câu trích nguyên văn được `verify_quotes` kiểm; test không cho số tên thiếu nguồn tăng lên. 87 tên cũ (duyệt 25/10, soạn theo tên loài) chưa có nguồn. Không thêm "Mật ong lên men": cùng một hãng dùng tên này cho hỗn hợp có gluconolactone + lactobionic acid (PHA), ánh xạ cố định sẽ làm mất cảnh báo PHA.

Sửa cách đếm từ của lưu ý `long_entries`: "A (B)" và "A / B" là hai tên của một chất, đếm theo tên dài nhất. Tên thật như "Coix Lacryma-Jobi Ma-yuen Seed Extract (Coix Seed Extract)" từng bị coi là câu quảng cáo, làm giao diện báo sai rằng bảng thành phần có thể thiếu.

## Tài khoản + đồng bộ (hướng H): thiết kế trước, làm sau B (26/10)
Thiết kế ở `plan/h-accounts.md`, chưa viết code. Đăng nhập bằng link qua email. Chỉ làm sau khi xuất/nhập routine (hướng B) đã chạy mà người dùng thật vẫn cần đồng bộ, vì có tài khoản là phát sinh nghĩa vụ theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 (hiệu lực 01/01/2026) và Nghị định 356/2025/NĐ-CP. Bên kiểm soát dữ liệu là cá nhân người làm dự án. Máy chủ và dịch vụ email đặt tại Việt Nam: lưu dữ liệu ở nước ngoài là chuyển dữ liệu xuyên biên giới (Đ.20), phải lập hồ sơ gửi Bộ Công an, và Đ.38 không miễn điều này. Đồng bộ dùng kiểm phiên bản và hỏi người dùng khi hai máy cùng sửa, thay cho "bản sửa sau thắng" vốn âm thầm làm mất thay đổi. Xoá tài khoản không dùng sau 24 tháng (báo trước 30 ngày); bản sao lưu giữ 30 ngày. Đồng bộ mã hoá đầu-cuối chỉ làm nếu tư vấn kết luận routine là dữ liệu sức khoẻ. Còn 3 câu hỏi pháp lý chờ người có chuyên môn.

## Trang duyệt + AI soạn nháp thẻ myth: nguồn do người duyệt chọn, nháp nằm ngoài bảng luật (26/10)
Làm hướng E (sau MVP), chi tiết ở [e-review.md](e-review.md). Mở rộng quyết định "lời đồn ngoài bộ myth cố định" (22/10).
- AI chỉ đọc các trang người duyệt dán link (tối đa 5), không tự tìm nguồn: nguồn phải thuộc danh sách uy tín, và máy chủ phải kiểm tra đoạn trích trên đúng văn bản AI đã đọc. Trang không tải được thì dừng, không soạn.
- Nháp lưu ở bảng `rule_drafts`, không ở `rules`, nên `load_published_rules` và mọi API công khai không chạm tới được. `rules.toml` vẫn là nguồn sự thật: người duyệt chép TOML (`published = false`) vào file, đọc nguồn, tự bật, chạy `verify_quotes` và `seed`. Không route nào bật được luật.
- Nháp chỉ có mức `info`/`safe` (thẻ myth không cảnh báo). Nếu nguồn cho thấy kết hợp thật sự có vấn đề, AI ghi vào ghi chú cho người duyệt; viết luật `conflict` vẫn là việc của người.
- Khoá nháp không trùng luật đã seed: seed upsert theo `key` sẽ âm thầm ghi đè, và tắt, luật đã bật.
- Câu hỏi hiện công khai bằng lời người duyệt viết lại (`public_question`), không bao giờ bằng văn bản gốc: người dùng vẫn có thể ghi tên, số điện thoại dù form đã nhắc. Chỉ hiện khi luật trả lời đã bật.
- Đăng nhập người duyệt: tài khoản tạo bằng `scripts.reviewers`, mật khẩu scrypt, phiên là token ngẫu nhiên chỉ lưu sha256. Không thêm thư viện, không cần khoá bí mật trong cấu hình. Đây không phải tài khoản người dùng (hướng H).
- Mô hình mặc định `claude-opus-5-5` (đổi bằng `DRAFT_MODEL`), kèm `fallbacks: "default"` khi mô hình từ chối.
- Chưa làm phần tuỳ chọn "AI diễn đạt lại `explanation_vi`": cần thêm cột cho luật và đổi `RuleCard` trong lúc nhánh `feat/accuracy` đang sửa mô hình luật (loại `usage`). Làm sau khi nhánh đó vào `main`, theo cùng cách: người duyệt duyệt bản diễn đạt trong `rules.toml`, giao diện luôn hiện kèm bản gốc.

## Xuất/nhập routine không cần tài khoản (hướng B, 26/10)
Làm trước hướng H như đã chốt. Link chia sẻ mang routine trong phần sau `#` của URL: trình duyệt không gửi phần này lên máy chủ, nên SkinWise không lưu routine của ai. File và link chỉ mang dữ liệu riêng của người dùng (khoá sản phẩm, thứ tự bước, ngày, tên tự đặt, bảng thành phần tự dán); tên hãng, nhóm hoạt chất và lưu ý được lấy lại từ máy chủ khi mở, nên file hay link bị sửa tay không làm hiện sai chip hoạt chất. Mở file hoặc link luôn hỏi trước khi thay routine hiện tại, có nút tải routine hiện tại về trước. Giới hạn giống `/routine/check` (50 sản phẩm, 200 bước, bảng dán 10.000 ký tự); link nén deflate, giải nén có trần 1 MB.

## Mã vạch qua Open Beauty Facts: chuyển tiếp, không lưu; người dùng so với bao bì (hướng D, 26/10)
Open Beauty Facts là dữ liệu cộng đồng: thử 26/10 thấy bản ghi có bảng thành phần dịch sang tiếng Pháp ("Eau, glycérine…"), tên bị tách sai ("caprylic, capric triglyceride"), và chỉ 52 sản phẩm gắn Việt Nam, phần lớn son, nước hoa, kem đánh răng. Vì vậy:
- `GET /barcode/{code}` chỉ chuyển tiếp bản ghi kèm ghi công ODbL, **không lưu vào cơ sở dữ liệu**. Lưu và trộn với dữ liệu của SkinWise rồi công khai có thể kéo theo điều khoản share-alike của ODbL; chưa đọc kỹ nên chưa lưu. Trình duyệt giữ sản phẩm như bảng tự dán, kèm mã vạch và ngày lấy.
- Bảng thành phần lấy về đưa vào ô "Dán thành phần", không thêm thẳng vào routine: người dùng so với bao bì, sửa chỗ khác, bấm phân tích như văn bản tự dán (cùng lưu ý của `read_label_text()`). Ô "Tôi đã so với bảng thành phần in trên bao bì" chỉ để hiển thị; kiểm tra routine coi sản phẩm như bảng tự dán, nên cảnh báo giống hệt khi dán cùng văn bản.
- Bản ghi có nhiều ngôn ngữ: chọn bản SkinWise nhận ra nhiều tên nhất (hoà thì tiếng Anh). Không dịch tên.
- Mã vạch kiểm chữ số kiểm tra trước khi gọi Open Beauty Facts: gõ sai một số thường ra mã của sản phẩm khác. UPC-A 12 số đổi sang dạng EAN-13 (Open Beauty Facts trả lỗi 500 cho dạng 12 số).
- Quét bằng camera dùng API `BarcodeDetector` của trình duyệt trên ảnh chụp; nút chỉ hiện khi trình duyệt hỗ trợ (không có trên Safari, Firefox). Không thêm thư viện quét mã.

## Đọc bảng thành phần từ ảnh: Claude chỉ chép chữ, người dùng sửa và xác nhận (hướng G, 26/10)
Chọn Claude qua backend (SDK `anthropic` và khoá đã có cho hướng E) thay vì Tesseract.js (thêm thư viện, tải dữ liệu ngôn ngữ nặng, đọc kém chữ nhỏ trên chai cong) hay OCR cài trên máy chủ. Đánh đổi: ảnh rời máy người dùng tới Anthropic, và mỗi ảnh tốn phí (Opus 5.5: ảnh tối đa 4.784 token, khoảng 0,02 USD tiền đầu vào mỗi ảnh, cộng phần chữ trả về). Tài liệu kỹ thuật gọi đây là OCR nhưng mô hình là AI, nên phải giữ nguyên tắc "AI không tự nhớ bảng thành phần":
- Lời nhắc chỉ cho chép chữ in trên ảnh, giữ nguyên chính tả và thứ tự, ghi `[?]` cho mỗi tên không đọc chắc; cấm thêm, sửa hay sắp lại tên theo hiểu biết về sản phẩm. Nhãn nhiều thứ tiếng: chỉ chép bảng tên INCI chữ Latin.
- Route chỉ trả chữ, không phân tích. Giao diện đưa chữ vào ô "Dán thành phần" cạnh ảnh; nút phân tích bị khoá khi còn `[?]` và khi người dùng chưa đánh dấu "đã so từng dòng với bao bì". Sau đó văn bản đi đúng đường của bảng tự dán, nên cảnh báo chỉ đến từ luật như mọi khi.
- Không lưu ảnh, không ghi log ảnh. Trình duyệt thu ảnh về tối đa 2.576 px cạnh dài và 4.784 ô 28×28 (mức mô hình đọc), JPEG, trước khi gửi.
- Mô hình mặc định `claude-opus-5-5`, effort `medium` (đổi bằng `LABEL_MODEL`), kèm `fallbacks: "default"`. Chưa đo độ chính xác trên ảnh thật vì chưa có khoá API: `scripts.label_check` làm việc này.

## Mỗi giai đoạn một nhánh + một PR (22/10)
Giữ `main` luôn chạy được cho demo. Sửa nhỏ (README, lỗi chính tả) commit thẳng lên `main`.
