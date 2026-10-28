# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dự án

SkinWise là web app quản lý routine skincare: người dùng xếp lịch dùng từng sản phẩm (sáng/tối, theo thứ trong tuần), app phát hiện trùng hoạt chất và cảnh báo các kết hợp cần thận trọng, mỗi cảnh báo có giải thích tiếng Việt và nguồn đáng tin cậy. Dự án cho hackathon Nhà Cộng Đồng (NCĐ). Remote: `github.com/Nha-Cong-Dong/SkinWise` (nhánh `main`).

Văn bản hiển thị cho người dùng (giao diện, giải thích cảnh báo) viết bằng **tiếng Việt**; code, tên định danh và commit message viết bằng tiếng Anh. `README.md` là đặc tả cho người dùng — giữ mục "Lộ trình" và "Chạy trên máy" khớp với code.

Kế hoạch, tiến độ và các quyết định đã chốt nằm trong `plan/` (`plan/README.md` là bảng tổng). Đọc trước khi bắt đầu việc mới; cập nhật checklist của giai đoạn đang làm khi xong việc và khi xong mỗi PR.

## Lệnh

Cần PostgreSQL chạy ở `localhost:5432` với hai database `skinwise` (dev) và `skinwise_test` (test); chuỗi kết nối nằm trong `backend/.env` (mẫu: `backend/.env.example`).

Backend (chạy trong `backend/`, quản lý bằng uv):
- `uv run python -m scripts.init_db` — áp schema (`app/schema.sql`, chạy lặp lại không lỗi)
- `uv run python -m scripts.seed` — áp schema rồi nạp `data/*.toml` vào DB (upsert, chạy lại an toàn)
- `uv run python -m scripts.verify_products [slug ...]` — tải lại trang nguồn, xác nhận từng thành phần của sản phẩm mẫu có trên trang và đúng thứ tự
- `uv run python -m scripts.verify_quotes [rule-key ...]` — tải trang nguồn của từng luật (và căn cứ pháp lý trong `data/concentration_limits.toml`, `data/legal_basis.toml`), xác nhận đoạn trích (`quote`) có nguyên văn trên trang. Link EUR-Lex được tải qua CELLAR vì EUR-Lex chặn script
- `uv run python -m scripts.unresolved` — liệt kê tên thành phần chưa nhận ra trong sản phẩm mẫu (để bắt hoạt chất bị sót)
- `uv run python -m scripts.import_eu_lists` — tải lại danh sách thành phần EU (bảng chú giải 2025, danh mục 2006, chất gây dị ứng hương liệu) từ CELLAR, ghi vào `data/eu_*` (chỉ chạy khi EU công bố bản mới); `... import_eu_lists allergens` chỉ tải lại chất gây dị ứng (đổi `ANNEX_III_CELEX` sang bản hợp nhất mới trước)
- `uv run python -m scripts.reviewers add "Tên"` / `remove "Tên"` / `list` — tài khoản người duyệt cho trang `#review` (`add` hỏi mật khẩu, chạy lại để đổi)
- `uv run uvicorn app.main:app --reload` — API tại `http://127.0.0.1:8000`, tài liệu tại `/docs`. Tài khoản ở chế độ dev (`LOGIN_EMAIL_MODE=dev`): không gửi email, link xác thực / đặt lại mật khẩu in ra log server và hiện ngay trên màn hình
- `uv run pytest` — test (DB `skinwise_test`, tự áp schema + seed); một test: `uv run pytest tests/test_inci.py::test_normalize_name`
- `uv run ruff check` / `uv run ruff format`

Frontend (chạy trong `frontend/`):
- `npm run dev` — Vite tại `http://localhost:5173`, proxy `/api/*` sang backend (bỏ tiền tố `/api`)
- `npm run build` (kiểm tra kiểu + build) / `npm run lint` (oxlint)

## Cấu trúc

- `backend/app/accounts.py` + `accounts_api.py` + `mailer.py` — tài khoản người dùng (thiết kế và nghĩa vụ pháp lý: `plan/h-accounts.md`). Đăng nhập **bắt buộc** khi vào web, bằng email + mật khẩu (8–128 ký tự, scrypt qua `app/passwords.py`, dùng chung với người duyệt). Đăng ký phải xác thực email: link 24 giờ gắn với mật khẩu của lần đăng ký đó, mở link phải nhập lại mật khẩu (chặn chiếm email chưa xác thực); gửi lại link cần email + mật khẩu. Quên mật khẩu: link 30 phút, chỉ cho tài khoản đã xác thực; đặt lại thì đăng xuất mọi máy khác. Token trong link (`email_tokens`) và phiên chỉ lưu sha256; phiên là cookie `skinwise_session` (HttpOnly, SameSite=Lax). Đăng ký / gửi lại / quên mật khẩu luôn trả cùng một câu, đăng nhập sai luôn cùng một lỗi (không lộ email nào đã có tài khoản); giới hạn tần suất trong bộ nhớ (email: 3 thư/giờ; đăng nhập sai: 5 / 15 phút / email). Chỉ lưu email + routine (`user_routines`, có `version`: ghi kèm `base_version`, lệch thì 409, người dùng chọn bản). Bản ghi đồng ý theo phiên bản chính sách (`POLICY_VERSION`, phải khớp `frontend/src/account.ts`). Chưa mở cho người dùng thật; email chỉ có chế độ dev.
- `backend/app/main.py` — `create_app()` dựng app FastAPI; test thay `get_session` bằng `dependency_overrides` để trỏ sang DB test (`tests/conftest.py`).
- `backend/app/api.py` — các route (`/groups`, `/products`, `/inci/analyze`, `/routine/check`, `/rules`), model Pydantic trong `app/schemas.py`. `/rules?groups=A&groups=B` khớp luật đúng như engine (`rule_matches`), mỗi nhóm tính cả nhóm cha (`with_ancestors`: BHA → EXFOLIANT_ACID) để luật viết cho nhóm chung vẫn trả lời câu hỏi về nhóm con. Kết quả rỗng của kiểm tra routine và tra cứu luật luôn kèm `notice_vi` (không có cảnh báo ≠ an toàn); routine chỉ có lưu ý khi dùng (luật `usage`) vẫn tính là không có cảnh báo kết hợp và kèm `NO_COMBINATION_WARNING_VI`. Routine gửi lên gồm `products` (mỗi cái có `key` do frontend đặt, kèm `product_id` hoặc `inci` tự dán) và `items` tham chiếu `key`; route đổi `key` sang số nguyên cho engine rồi đổi ngược lại.
- `backend/app/products.py` — tìm sản phẩm (`word_similarity` của `pg_trgm` trên `search_name` đã chuẩn hoá bằng `normalize_name`, cộng khớp chuỗi con) và chi tiết sản phẩm.
- `backend/app/review_api.py` — route `/review/...` của trang duyệt; mọi route trừ `/review/login` cần token người duyệt (`app/reviewers.py`: mật khẩu scrypt, chỉ lưu sha256 của token, phiên 12 giờ; không có đăng ký, tài khoản tạo bằng `scripts.reviewers`). Trang duyệt chỉ có AI soạn nháp thẻ myth (`/review/drafts`). Không route nào bật được luật. Người dùng không gửi câu hỏi được: tính năng này đã bỏ (`plan/decisions.md`, 27/10).
- `backend/app/drafts.py` — AI soạn nháp thẻ myth (Claude qua SDK `anthropic`; `ANTHROPIC_API_KEY`, `DRAFT_MODEL` trong `.env`). Chỉ đọc các trang người duyệt đưa (`fetch_text(keep_scripts=False)`, tối đa 5, trang nào không tải được thì dừng), trả JSON theo `ModelDraft` (mức độ chỉ `info`/`safe`), server tìm lại từng đoạn trích trên trang (`check_quotes`). Nháp nằm ở bảng `rule_drafts`, **không bao giờ** ở `rules`, nên engine và người dùng không thấy; API kèm TOML để dán vào `rules.toml` (`published = false`, khoá không trùng luật đã có, đoạn trích không thấy để thành chú thích). Test thay `call_model` / `fetch_text`.
- `backend/app/label_reader.py` + `label_api.py` — đọc bảng thành phần từ ảnh nhãn (hướng G, `POST /label/read`, **bắt buộc đăng nhập** vì mỗi ảnh tốn phí; `LABEL_MODEL`). AI chỉ chép chữ in trên ảnh, ghi `[?]` chỗ không đọc chắc, không phân tích; ảnh không được lưu. Giao diện (`frontend/src/photoReader.ts`, `components/ReadFromPhoto.tsx`; chọn ảnh hoặc dán bằng Ctrl+V) đưa chữ vào ô "Dán thành phần" cạnh ảnh; nút phân tích bị khoá khi còn `[?]` hoặc người dùng chưa đánh dấu đã so với bao bì, sau đó đi đúng đường của bảng tự dán. `ANTHROPIC_BASE_URL` trỏ cả hai chức năng AI sang cổng có API kiểu Anthropic (khoá hackathon: chỉ `claude-haiku-5-5`, hết hạn 10/11). `scripts.label_check ảnh [slug]` đo độ chính xác so với sản phẩm mẫu.
- `backend/app/goals.py` + `backend/data/goals.toml` — mục tiêu da (`GET /goals`, trang "Mục tiêu", `frontend/src/goals.ts`, `components/GoalsPage.tsx`): mỗi mục tiêu có mục `active` (một nhóm hoạt chất đã có) và `info` (thẻ thông tin); `goal = "all"` là thẻ dùng chung, chỉ `info`. Mỗi mục có nguồn + đoạn trích (`verify_quotes` kiểm), `published = false` cho tới khi người duyệt bật; `goal_problems()` chặn seed như `rule_problems()`. **Chỉ để hiển thị**, không bao giờ ảnh hưởng engine. Mục tiêu đã chọn chỉ lưu localStorage, không bao giờ gửi lên máy chủ (có thể là dữ liệu sức khoẻ). Không gợi ý sản phẩm, không dùng chữ "trị".
- `backend/app/db.py` — engine SQLAlchemy, dependency `get_session`, `init_schema()`. Schema là SQL thuần trong `app/schema.sql`, chưa dùng Alembic.
- `backend/app/inci.py` — tách + chuẩn hoá bảng INCI, không cần DB. Mỗi dòng có nhiều `candidates` (tên đầy đủ trước, rồi các phần của `A (B)` và `A/B`); `app/ingredients.py` `resolve()` lấy tên đầu tiên có trong `ingredient_synonyms` → hoạt chất + nhóm; nếu cả dòng không khớp thì trong các phần, tên INCI chính thức của hoạt chất thắng từ đồng nghĩa ("Vitamin C (3-O-Ethyl Ascorbic Acid)" là dẫn xuất, không phải ascorbic acid). Thành phần không nhận ra vẫn giữ tên gốc.
- `backend/app/eu_lists.py` + `backend/data/eu_*` — danh sách EU, sinh bằng `scripts.import_eu_lists`, không sửa tay: `eu_glossary.txt` (Quyết định (EU) 2025/1175, ~30.000 tên được phép ghi trên nhãn) và `eu_inventory_2006.tsv` + `eu_functions_2006.tsv` (Quyết định 2006/257/EC: chức năng thường gặp và định nghĩa chính thức; danh mục này hết hiệu lực từ 2020, chỉ dùng để mô tả). Seed vào bảng `inci_names` (COPY) và `cosmetic_functions`; tên tiếng Việt của chức năng ở `data/functions_vi.toml`. Tên EU chỉ để nhận diện và mô tả, **không bao giờ** quyết định nhóm hoạt chất. `eu_fragrance_allergens.tsv`: 80 mục chất gây dị ứng hương liệu ở Phụ lục III (bản hợp nhất Quy định 1223/2009; bản hợp nhất chỉ là tài liệu, căn cứ là Quy định (EU) 2023/1545), bảng `fragrance_allergens`; bỏ Benzyl Alcohol vì luật chỉ áp dụng khi nó không phải chất bảo quản. `mark_allergens()` gắn `fragrance_allergen` theo tên trên nhãn hoặc tên EU, chỉ ở hai route hiển thị bảng thành phần (chi tiết sản phẩm, `/inci/analyze`), không ở `resolve()`. **Chỉ để hiển thị**, không bao giờ tạo cảnh báo; ngưỡng ghi nhãn trích ở `data/legal_basis.toml`.
- `backend/data/common_names.toml` — tên thông dụng ("Rau má", "Axit salicylic", "Purified Water") → tên EU. Tên trỏ tới hoạt chất trong từ điển làm đổi cảnh báo nên phải duyệt như từ điển. Tên thêm từ 26/10 phải có `sources` (trang chính hãng in tên đó cạnh tên INCI, câu trích nguyên văn, `verify_quotes` kiểm); không thu thập tên từ văn bản người dùng dán. `resolve()` tra theo thứ tự: từ điển hoạt chất → tên EU → tên thông dụng (bỏ tiền tố "chiết xuất", "tinh chất", "dịch chiết").
- `backend/app/inci.py` `read_label_text()` — cho văn bản người dùng dán: nhận ra danh sách "thành phần nổi bật" dạng `tên: mô tả` (chỉ lấy tên) và trả mã lưu ý (`highlight_list`, `vietnamese_names`, `long_entries`, `few_entries`); API kèm lời giải thích tiếng Việt. Nhãn thuốc kiểu Mỹ (Drug Facts) chỉ đọc mục Active/Inactive ingredients (`drug_facts_ingredients()`, mã `drug_facts`, không áp dụng đường 1%). Dữ liệu seed vẫn dùng `parse_inci()`.
- `backend/app/ingredients.py` `suggest()` — gợi ý tên gần đúng (pg_trgm, ngưỡng 0,45) cho dòng không nhận ra, vd. "Salicilic Acid" → Salicylic Acid. **Chỉ gợi ý**, người dùng bấm để sửa văn bản; engine không bao giờ dùng gợi ý để tìm hoạt chất. `/routine/check` trả `possible_actives` để giao diện nhắc rằng có thể đang thiếu cảnh báo.
- `backend/app/concentration.py` + `data/concentration_limits.toml` — "đường 1%": theo Điều 19 Quy định 1223/2009, mọi thành phần đứng sau một chất bị luật giới hạn ≤ 1% (phenoxyethanol, Phụ lục V) đều ≤ 1%, trừ chất tạo màu. Nồng độ ghi trên nhãn (`10%`, `4,000Ppm`) được giữ trong `InciEntry.declared`. Cả hai **chỉ để hiển thị**, không bao giờ tắt cảnh báo; không áp dụng cho danh sách "thành phần nổi bật".
- `backend/data/*.toml` — dữ liệu seed, nguồn sự thật cho nhóm hoạt chất, từ điển hoạt chất và sản phẩm mẫu; sửa ở đây rồi chạy lại seed, không sửa thẳng trong DB. Seed upsert theo khoá tự nhiên (`code`, `inci_name`, `slug`) để id không đổi. Từ điển chỉ chứa hoạt chất; chất có mặt với `groups = []` (vd. Citric Acid, Bakuchiol) là cố ý không tính là hoạt chất. `parent` trong `functional_groups.toml` khai báo nhóm chung (AHA/BHA/PHA → EXFOLIANT_ACID); chất thuộc nhóm con phải ghi cả nhóm cha (có test).
- `backend/app/engine.py` — engine kiểm tra routine, hàm thuần `check_routine(items, product_groups, rules)`. Luật cặp (conflict / duplicate / myth) chỉ so hai sản phẩm **khác nhau** cùng phạm vi (cùng bước / buổi / ngày); không bao giờ so một sản phẩm với chính nó. Mỗi (luật, cặp sản phẩm) ra một cảnh báo, kèm mọi ngày/buổi áp dụng. Luật `usage` ("lưu ý khi dùng", phạm vi `routine`) nói về một nhóm hoạt chất: mỗi luật ra một cảnh báo liệt kê mọi sản phẩm có nhóm đó và mọi ngày/buổi dùng chúng; tra cặp nhóm ở `/rules` không trả luật `usage`.
- `products.application` (`rinse_off` / `leave_on`, khai báo trong `products.toml`): **chỉ để hiển thị**; engine không phân biệt cho đến khi có nguồn nói sản phẩm rửa trôi làm đổi cảnh báo.
- `backend/app/rules.py` + `backend/data/rules.toml` — luật và nguồn. `rule_problems()` chặn seed luật `published` thiếu nguồn/đoạn trích hoặc thiếu `reviewed_by`/`reviewed_at`; `load_published_rules()` chỉ trả luật đã bật **và** có nguồn. Không tự đặt `published = true`: chỉ người dùng làm sau khi đọc nguồn.
- `backend/app/sources.py` — tải trang nguồn và kiểm tra văn bản có trên trang; dùng chung cho kiểm tra sản phẩm và (giai đoạn 2) đoạn trích của luật.
- `backend/scripts/` — điểm vào chạy tay, mỏng, gọi code trong `app/`.
- `frontend/src/` — app React một trang, không router, không thư viện ngoài React + Tailwind. `api.ts`: kiểu dữ liệu khớp `app/schemas.py` + hàm gọi `/api/...`. `routine.ts`: routine lưu `localStorage` (bọc try/catch), `toCheckRequest()` đổi sang dạng `/routine/check` (bước = vị trí trong buổi), `useRoutineCheck()` tự kiểm tra lại khi routine đổi. `account.ts` + `components/SignIn.tsx`: cổng đăng nhập (trừ `#review`): Đăng nhập / Tạo tài khoản / Quên mật khẩu; link `#verify-email?token=` và `#reset-password?token=` chỉ gọi API khi bấm nút. `sync.ts`: đồng bộ routine với máy chủ (kiểm phiên bản, hỏi khi hai máy cùng sửa; routine của tài khoản khác trên máy dùng chung không bao giờ bị tải lên; đăng xuất / xoá tài khoản thì xoá routine khỏi máy). `components/PolicyText.tsx`: chính sách quyền riêng tư (bản nháp). `share.ts`: xuất/nhập routine (file `.json`, link `#routine=` nén deflate); dữ liệu hiển thị lấy lại từ máy chủ khi mở (`restore()`), không bao giờ ghi đè routine khi chưa hỏi. `components/RuleCard.tsx` hiển thị nguyên văn `title_vi`/`explanation_vi` + nguồn; không diễn đạt lại. Màu và font là token trong `src/index.css` (`@theme`): buổi sáng trắng, buổi tối xanh đêm; màu đậm chỉ dùng cho mức độ cảnh báo (`SEVERITY` trong `labels.ts`). `components/ReviewPage.tsx`: trang duyệt, mở bằng `#review` (không có trong menu), token người duyệt lưu `sessionStorage`.

## Phạm vi (MVP, hạn ≈ 2026-11-10)

Một lập trình viên, không có nền tảng y khoa, nên MVP cố tình hẹp:
- Làm: dán bảng INCI hoặc chọn từ khoảng 30 sản phẩm mẫu; xếp lịch sáng/tối + ngày trong tuần theo thứ tự bước; phát hiện trùng hoạt chất; 5–8 luật xung đột có nguồn mạnh; 2–3 thẻ myth.
- Để sau: tra cứu mã vạch qua Open Beauty Facts, hồ sơ da (nhạy cảm, mang thai…; đã có "mục tiêu da" chỉ để hiển thị), tài khoản và đồng bộ. Trong MVP routine lưu trên trình duyệt.

## Công nghệ

- Backend: Python 3.13+, FastAPI, Pydantic (kiểm tra dữ liệu đầu vào), SQLAlchemy 2 + psycopg 3, pytest, ruff. Script xử lý dữ liệu (CosIng, dữ liệu mẫu, kiểm tra đoạn trích nguồn) cũng viết bằng Python. Chỉ một backend, không chạy thêm service Node.
- Cơ sở dữ liệu: PostgreSQL 17, cài trực tiếp trên máy khi dev. Tìm sản phẩm chấp nhận gõ sai, không dấu bằng `pg_trgm` + `unaccent`.
- Frontend: React + TypeScript + Vite + Tailwind CSS v4.

## Kiến trúc (thiết kế đã chốt — bám theo)

Luồng: bảng INCI → tách + chuẩn hoá tên (chữ thường, bỏ dấu) → từ điển hoạt chất + từ đồng nghĩa, tên EU và tên thông dụng (tham chiếu danh sách thành phần của EU) → nhóm hoạt chất → routine (sản phẩm × buổi × ngày) → bộ luật → cảnh báo kèm giải thích + nguồn.

- **Luật viết theo nhóm hoạt chất** (AHA, BHA, PHA, RETINOID, VITAMIN_C, NIACINAMIDE, BENZOYL_PEROXIDE, nhóm chung EXFOLIANT_ACID…; khoảng 10 nhóm), không theo từng chất. Một thành phần có thể thuộc nhiều nhóm. Citric Acid thường chỉ là chất chỉnh pH, không tính là AHA tẩy da chết.
- Mỗi luật có loại (conflict / duplicate / profile / myth / usage), mức độ (avoid / caution / info / safe), phạm vi (cùng bước / cùng buổi / cùng ngày; luật usage: cả routine) và mức bằng chứng. Luật "myth" (ví dụ vitamin C + niacinamide phần lớn dùng chung được) là tính năng có chủ đích.
- **Engine cảnh báo là tất định.** Cảnh báo chỉ đến từ luật; LLM tối đa chỉ được diễn đạt lại lời giải thích của luật có sẵn, không được tạo cảnh báo hay tự "nhớ" bảng thành phần của sản phẩm. Ngoài ra LLM chỉ soạn bản nháp thẻ myth cho người duyệt (`app/drafts.py`), không bao giờ hiện cho người dùng, và chép chữ từ ảnh nhãn (`app/label_reader.py`) để người dùng so với bao bì và sửa trước khi phân tích.
- Bảng INCI không ghi nồng độ nên cảnh báo dùng chữ "có thể".
- Mỗi sản phẩm ghi lại bảng thành phần lấy từ đâu (dữ liệu mẫu, nhập tay, Open Beauty Facts…) và trạng thái xác minh.

## Nguyên tắc nguồn: không có nguồn thì không có cảnh báo

Độ chính xác đến từ nguồn, không từ hiểu biết chuyên môn:
1. Mỗi luật gắn ít nhất một nguồn uy tín (AAD, DermNet, bài tổng quan PubMed/JAAD, CIR, CosIng, FDA, Hiệp định mỹ phẩm ASEAN) và lưu **nguyên văn đoạn trích** hỗ trợ luật.
2. Một bước kiểm tra tải trang nguồn và xác nhận đoạn trích có trên trang.
3. Luật chỉ được bật sau khi có người đọc nguồn. Bỏ mọi luật không có nguồn rõ ràng; luật do AI soạn để ở trạng thái chưa bật cho đến khi được kiểm tra.

Dữ liệu Open Beauty Facts theo giấy phép ODbL — ghi công và gửi User-Agent mô tả rõ ứng dụng.

## Harness: đội agent SkinWise

**Mục tiêu:** giao bốn loại việc cho một đội agent có bước phản biện và QA, trong khi vẫn giữ mọi nguyên tắc ở trên. Bốn loại việc: tìm nguồn cho luật / thẻ myth (và nội dung có nguồn theo mục tiêu da), thêm dữ liệu mẫu, làm tính năng full-stack, review trước PR.

**Điều kiện kích hoạt:** dùng skill `skinwise-orchestrator` khi được yêu cầu một trong các việc sau: tìm hoặc kiểm nguồn cho luật / thẻ myth / lưu ý khi dùng, hoặc cho nội dung theo mục tiêu da / thẻ thông tin; thêm sản phẩm mẫu hoặc tên tiếng Việt; làm một tính năng hay một mục trong `plan/`; review nhánh trước PR. Áp dụng cả cho yêu cầu làm lại hoặc sửa tiếp kết quả trước. Câu hỏi đơn giản thì trả lời trực tiếp.

**Lịch sử thay đổi:**
| Ngày | Thay đổi | Đối tượng | Lý do |
|---|---|---|---|
| 2026-10-26 | Dựng harness lần đầu (Harness v2): 6 agent, 6 skill | `.claude/agents/`, `.claude/skills/` | - |
| 2026-10-28 | Thêm luồng nội dung (`references/flow-content.md`), mục 9 của `rule-source-research`, mở rộng mô tả của orchestrator, source-researcher, evidence-critic | `.claude/skills/skinwise-orchestrator`, `.claude/skills/rule-source-research`, `.claude/agents/` | Tính năng mục tiêu da cần nội dung có nguồn nhưng không phải luật; luồng luật phải viết lại script tay |
