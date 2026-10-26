# Hướng H: Tài khoản + đồng bộ routine (thiết kế)

Trạng thái: **đã làm ở chế độ thử, chưa mở cho người dùng thật** (26/10/2026, nhánh `feat/accounts`). Người duyệt đổi ý cùng ngày: đăng nhập **bắt buộc** khi vào web (mục 16), làm ngay thay vì chờ sau hướng B; email ở chế độ dev; code viết xong nhưng không thu email người thật cho tới khi trả lời xong câu hỏi pháp lý (mục 2). Mục tóm tắt trong [after-mvp.md](after-mvp.md#h-tài-khoản--đồng-bộ).

## 1. Có nên làm không

Mục tiêu: một routine dùng được trên nhiều thiết bị, và không mất khi xoá dữ liệu trình duyệt.

- **Điều kiện trước:**
  - Hướng A đã xong: có domain + HTTPS, Alembic, sao lưu DB.
  - Hướng B (xuất/nhập routine, link chia sẻ) đã làm, và có người dùng thật vẫn cần đồng bộ.
  - Hướng B đã giải quyết việc chuyển máy mà server không giữ dữ liệu của ai. H chỉ thêm phần đồng bộ tự động hai chiều.
- **Cái giá mới khi có tài khoản:**
  - Phải giữ email, là dữ liệu cá nhân.
  - Routine gắn với một người, và có thể lộ tình trạng sức khoẻ (đang dùng tretinoin, thuốc trị mụn, sản phẩm trị nám).
  - Phải gửi email, giữ phiên đăng nhập an toàn, và làm các nghĩa vụ pháp lý ở mục 2.
- **Đã chốt (26/10):** làm sau B, chỉ khi B đã chạy một thời gian và người dùng thật vẫn yêu cầu đồng bộ, không làm vì "app nào cũng có".

## 2. Pháp lý: đọc trước, hỏi người có chuyên môn trước khi mở cho người dùng

Văn bản hiện hành: Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, hiệu lực từ 01/01/2026, và Nghị định 356/2025/NĐ-CP hướng dẫn luật. Nghị định này thay Nghị định 13/2023/NĐ-CP (theo các bài tổng hợp, chưa đọc nguyên văn nghị định).

Các điều dưới đây đọc từ một bản dịch tiếng Anh **không chính thức** của luật. Phải đối chiếu bản tiếng Việt trên Công báo hoặc vbpl.vn trước khi dựa vào:

| Điều | Nội dung liên quan đến H |
|---|---|
| Đ.2 khoản 3 | Dữ liệu nhạy cảm là danh mục do Chính phủ ban hành. Cần đọc Nghị định 356 để biết thông tin sức khoẻ thuộc danh mục nào |
| Đ.4, Đ.10, Đ.14 | Người dùng có quyền được biết; đồng ý hoặc rút lại đồng ý; xem, sửa; yêu cầu cung cấp, xoá, hạn chế xử lý. Xoá phải bảo đảm không khôi phục được |
| Đ.9 | Đồng ý phải tự nguyện và được thông báo đủ: loại dữ liệu, mục đích, bên kiểm soát, quyền. Phải thể hiện rõ ràng, in hoặc sao chép được, dạng điện tử kiểm chứng được; tách theo từng mục đích. Im lặng không phải là đồng ý |
| Đ.20 | Lưu dữ liệu trên hệ thống ngoài Việt Nam, hoặc dùng nền tảng ngoài Việt Nam để xử lý dữ liệu thu ở Việt Nam, là chuyển dữ liệu xuyên biên giới. Phải lập hồ sơ đánh giá tác động và gửi cơ quan chuyên trách (Bộ Công an) trong 60 ngày. Áp dụng cho cả máy chủ lẫn dịch vụ gửi email đặt ở nước ngoài |
| Đ.21, Đ.22 | Hồ sơ đánh giá tác động xử lý dữ liệu: gửi trong 60 ngày, cập nhật 6 tháng một lần khi có thay đổi |
| Đ.23 | Phát hiện vi phạm có thể gây hại cho người dùng: báo cơ quan chức năng trong 72 giờ |
| Đ.38 | Doanh nghiệp nhỏ và khởi nghiệp được chọn không áp dụng Đ.21, Đ.22, khoản 2 Đ.33 (bộ phận / nhân sự bảo vệ dữ liệu) trong 5 năm; hộ kinh doanh và doanh nghiệp siêu nhỏ không phải áp dụng. Ngoại lệ: bên trực tiếp xử lý dữ liệu nhạy cảm hoặc dữ liệu của số lượng lớn người. **Không miễn Đ.20** |

**Đã chốt (26/10):**
- Bên kiểm soát dữ liệu là cá nhân người làm dự án.
- Máy chủ và dịch vụ gửi email đặt tại Việt Nam, nên dữ liệu không chuyển ra nước ngoài theo Đ.20.

**Câu hỏi còn lại cho người có chuyên môn pháp lý (trả lời xong mới làm):**
1. Đ.38 chỉ nói tới doanh nghiệp nhỏ, khởi nghiệp, hộ kinh doanh, doanh nghiệp siêu nhỏ. Một cá nhân làm bên kiểm soát dữ liệu có phải làm đủ Đ.21 (hồ sơ đánh giá tác động xử lý dữ liệu), Đ.22 và khoản 2 Đ.33 không?
2. Routine gắn với email có là dữ liệu sức khoẻ, tức dữ liệu nhạy cảm, theo Nghị định 356 không? Hồ sơ da ở hướng F (mang thai, đang dùng thuốc) gần như chắc chắn là có.
3. Nghị định 356 yêu cầu nội dung bắt buộc gì cho thông báo xử lý dữ liệu và văn bản đồng ý?
4. (Đã giải quyết bằng lựa chọn đặt tại Việt Nam) Hồ sơ chuyển dữ liệu xuyên biên giới theo Đ.20.

Còn phải kiểm khi triển khai: các dịch vụ ở nước ngoài mà trình duyệt người dùng gọi tới. Giao diện hiện tải font từ Google Fonts, nên mỗi lượt mở trang gửi địa chỉ IP của người xem tới Google. Đề xuất tự lưu font trên máy chủ của SkinWise, đồng thời không dùng công cụ thống kê hay CDN đặt ở nước ngoài cho trang có tài khoản. Thu càng ít, kèm đồng bộ mã hoá (mục 9), thì câu hỏi 2 càng nhẹ.

## 3. Nguyên tắc

- **Thu tối thiểu:** chỉ email và routine. Không tên, không số điện thoại, không ngày sinh; không lưu IP lâu dài.
- **Trình duyệt vẫn là bản làm việc chính:** `localStorage` như hiện nay; server chỉ giữ bản sao để đồng bộ. Không đăng nhập vẫn dùng đủ mọi tính năng.
- **Hồ sơ da (hướng F) không đồng bộ** trong thiết kế này.
- **Câu hỏi người dùng gửi không gắn với tài khoản**, như hiện nay.
- **Kiểm tra routine (`/routine/check`) vẫn không lưu gì**, kể cả khi đã đăng nhập.

## 4. Đăng nhập bằng link qua email

1. Người dùng bấm "Đồng bộ giữa các thiết bị", nhập email, đánh dấu ô đồng ý. Ô này để trống sẵn và tách riêng với mọi thứ khác (Đ.9).
2. `POST /auth/email-link {email, consent_version}` luôn trả 202 với cùng một câu, để không lộ email nào đã có tài khoản.
3. Server tạo token ngẫu nhiên 32 byte (`secrets.token_urlsafe`), chỉ lưu **hash SHA-256**, hạn 15 phút, dùng một lần. Gửi email chứa link `https://<domain>/#sign-in?token=…`. Token nằm sau `#` nên không vào log máy chủ hay header Referer.
4. Link mở trang có nút "Đăng nhập", **không tự đăng nhập khi mở**. Lý do: trình quét link của hộp thư (Outlook Safe Links, bộ lọc thư rác) tự mở link sẽ đốt mất token dùng một lần. Bấm nút thì gửi `POST /auth/session {token}`; server kiểm hash, hạn, chưa dùng; tạo người dùng nếu chưa có và lưu bản ghi đồng ý; rồi tạo phiên.
5. **Phiên:**
   - id ngẫu nhiên, server chỉ lưu hash.
   - Cookie `HttpOnly; Secure; SameSite=Lax`, hạn 30 ngày, gia hạn mỗi lần dùng.
   - Có "Đăng xuất" và "Đăng xuất mọi thiết bị".
6. **Chống lạm dụng:**
   - Tối đa 3 email mỗi giờ cho một địa chỉ, 10 mỗi giờ cho một IP. Đếm trong bảng có hạn hoặc trong bộ nhớ, không giữ IP sau khi hết hạn.
   - Email chuẩn hoá thành chữ thường, bỏ khoảng trắng; không tự bỏ dấu chấm kiểu Gmail.
7. **CSRF:** cookie `SameSite=Lax`, route ghi chỉ nhận `application/json`, kiểm header `Origin`.
8. **Email:**
   - Dùng dịch vụ gửi email giao dịch đặt tại Việt Nam (chốt 26/10); domain riêng cấu hình SPF, DKIM, DMARC (từ hướng A).
   - Nội dung tiếng Việt, không chứa dữ liệu routine. Nhắc rằng nếu không phải bạn yêu cầu thì bỏ qua email.

**Đã cân nhắc, không chọn:**
- Mật khẩu: phải lưu hash; quên mật khẩu vẫn cần email.
- Passkey: không cần email, nhưng khó khôi phục khi mất thiết bị. Có thể thêm sau làm cách đăng nhập thứ hai.
- Đăng nhập Google / Facebook: chia sẻ dữ liệu với bên thứ ba ở nước ngoài.

## 5. Dữ liệu (qua Alembic)

```sql
users        (id uuid PK, email text UNIQUE NOT NULL, created_at, last_seen_at)
consents     (user_id FK, purpose text, policy_version text, granted_at, withdrawn_at)  -- bằng chứng đồng ý (Đ.9)
login_tokens (token_hash bytea PK, email text, expires_at, used_at)                      -- xoá sau 24 giờ
sessions     (id_hash bytea PK, user_id FK, created_at, expires_at, last_used_at)
routines     (user_id PK FK, data jsonb NOT NULL, version int NOT NULL, updated_at)
```

- `routines.data` có cùng dạng với `Routine` trong `frontend/src/routine.ts` (`products` + `entries`), kèm số phiên bản dạng dữ liệu. Server kiểm bằng Pydantic khi lưu, với giới hạn như `RoutineCheckRequest` (50 sản phẩm, 200 bước) và kích thước tối đa khoảng 100 KB.
- Mỗi người một routine; nhiều routine để sau.
- Bảng tài khoản không nối với `user_questions`.

## 6. Đồng bộ

Plan cũ ghi "bản sửa sau thắng". Đã chốt (26/10) thay bằng **kiểm phiên bản**. Lý do: "bản sau thắng" âm thầm xoá thay đổi làm trên máy kia mà người dùng không biết; với routine, đó có thể là một sản phẩm vừa thêm, kéo theo một cảnh báo bị mất.

- `GET /me/routine` trả `{data, version, updated_at}`.
- `PUT /me/routine {data, base_version}`: nếu `base_version` bằng `version` trên server thì lưu, tăng `version` và trả 200; nếu khác thì trả 409 kèm bản trên server.
- **Phía trình duyệt:**
  - Vẫn lưu `localStorage` như hiện nay.
  - Khi đã đăng nhập, mỗi thay đổi gửi `PUT` sau 2 giây. Khi mở app hoặc khi tab được chọn lại thì `GET`.
  - Nếu máy này không có thay đổi chưa gửi: nhận bản server.
  - Nếu cả hai bên đều đổi (409): hỏi "Routine trên thiết bị khác đã đổi lúc …: dùng bản trên máy này / dùng bản đã đồng bộ", kèm tóm tắt (số sản phẩm, số bước mỗi buổi).
  - **Không tự gộp:** gộp thứ tự bước của hai bản dễ ra một routine không ai làm.
- **Lần đăng nhập đầu:** server trống thì tải bản trên máy lên; máy trống thì tải về; cả hai có thì hỏi như trên.
- **Mất mạng:** thay đổi vẫn lưu trên máy, đánh dấu "chưa đồng bộ", gửi khi có mạng lại.
- **Giới hạn đã biết đi theo:** sản phẩm mẫu bị xoá khỏi DB (lỗi 422) giờ lan sang mọi máy. Cần làm mục tương ứng của hướng B trước.

## 7. Quyền của người dùng và vòng đời dữ liệu

- **Xem, sửa:** chính là routine trong app. Trang "Tài khoản" hiện email, ngày tạo, lần đồng bộ cuối, mục đích đã đồng ý kèm phiên bản chính sách.
- **Xuất:** `GET /me/export` trả JSON gồm email, các lần đồng ý, routine.
- **Xoá:** `DELETE /me`, xác nhận bằng cách gõ lại email. Xoá ngay người dùng, phiên, token, routine và bản ghi đồng ý. Bản sao lưu tự hết sau 30 ngày (chốt 26/10), thời hạn này ghi trong chính sách. Routine trên máy vẫn còn, người dùng tự xoá nếu muốn.
- **Rút lại đồng ý:** SkinWise chỉ có một mục đích là đồng bộ, nên rút lại đồng ý chính là xoá tài khoản.
- **Tài khoản không dùng 24 tháng:** báo qua email trước 30 ngày, rồi xoá (chốt 26/10).

## 8. Chính sách quyền riêng tư (nội dung tối thiểu)

- Bên kiểm soát dữ liệu và cách liên hệ.
- Dữ liệu thu: email, routine, thời điểm tạo và đồng bộ.
- Mục đích: đăng nhập, đồng bộ.
- Nơi lưu (Việt Nam) và các bên xử lý (nhà cung cấp máy chủ, dịch vụ email).
- Thời hạn lưu, kể cả bản sao lưu; quyền của người dùng và cách thực hiện; cam kết báo vi phạm (Đ.23).
- Số phiên bản và ngày hiệu lực. Bản ghi đồng ý lưu `policy_version`; chính sách đổi thì hỏi đồng ý lại.

## 9. Phương án giảm dữ liệu: đồng bộ mã hoá đầu-cuối (để cân nhắc)

Trình duyệt mã hoá routine trước khi gửi; server chỉ giữ bản mã, không đọc được. Với đăng nhập bằng link qua email thì không có mật khẩu để sinh khoá, nên khoá phải là một "mã khôi phục" ngẫu nhiên hiện ra một lần, người dùng tự giữ và nhập trên máy thứ hai.

- Lợi: server không biết ai dùng sản phẩm gì, câu hỏi 2 ở mục 2 nhẹ hơn nhiều.
- Hại: mất mã thì mất routine trên server; thêm một bước khó hiểu với người dùng phổ thông.
- **Đã chốt (26/10):** chỉ làm nếu người có chuyên môn kết luận routine là dữ liệu nhạy cảm.

## 10. Bảo mật

- Token và phiên chỉ lưu hash; so sánh bằng hàm thời gian không đổi (`hmac.compare_digest`).
- Bắt buộc HTTPS; không ghi token, cookie hay email vào log.
- Định kỳ xoá token hết hạn; sao lưu được mã hoá.
- Mọi route `/me/*` kiểm phiên; không có route quản trị nào đọc routine của người dùng.
- Quy trình xử lý vi phạm (Đ.23): ai phát hiện, ai báo, mẫu thông báo, mốc 72 giờ.

## 11. API

| Route | Việc |
|---|---|
| `POST /auth/email-link` | Gửi link đăng nhập (luôn 202) |
| `POST /auth/session` | Đổi token lấy phiên |
| `POST /auth/logout`, `POST /auth/logout-all` | Đăng xuất máy này / mọi máy |
| `GET /me` | Email, ngày tạo, đồng ý, lần đồng bộ cuối |
| `GET /me/routine`, `PUT /me/routine` | Đồng bộ (mục 6) |
| `GET /me/export` | Xuất toàn bộ dữ liệu |
| `DELETE /me` | Xoá tài khoản |

## 12. Giao diện

- Nút "Đồng bộ giữa các thiết bị" thay cho "Đăng nhập", để người dùng hiểu vì sao cần email. Bấm vào mở hộp thoại: ô email, ô đồng ý, hai câu giải thích dữ liệu nào được lưu và lưu ở đâu.
- Trạng thái đồng bộ nhỏ ở đầu trang: "Đã đồng bộ lúc …" hoặc "Chưa đồng bộ (đang mất mạng)".
- Trang tài khoản: email, xuất dữ liệu, đăng xuất mọi thiết bị, xoá tài khoản.
- Mọi chữ bằng tiếng Việt; id và route bằng tiếng Anh (`#sign-in`, `/me`).

## 13. Kiểm thử

- **Backend:**
  - token dùng một lần, hết hạn, sai token;
  - không lộ email đã có tài khoản;
  - giới hạn tần suất;
  - 409 khi lệch phiên bản;
  - routine sai dạng hoặc quá lớn bị từ chối;
  - phiên hết hạn;
  - xoá tài khoản xoá hết mọi bảng.
- **Email:** thay bằng bộ gửi giả trong test, ghi lại thư thay vì gửi.
- **Thử tay:** hai trình duyệt cùng sửa một routine thì ra hộp thoại xung đột; mất mạng rồi có mạng lại thì gửi bù; link mở trong ứng dụng email trên điện thoại vẫn đăng nhập được.

## 14. Thứ tự và ước lượng (một người làm)

| Bước | Việc | Ước lượng |
|---|---|---|
| 0 | Trả lời câu hỏi pháp lý (mục 2); chọn nơi chạy và dịch vụ email; viết chính sách | Tuỳ tư vấn |
| 1 | Bảng, đăng nhập, phiên, giới hạn tần suất, test | ~1 tuần |
| 2 | Đồng bộ, xử lý xung đột | 3–5 ngày |
| 3 | Giao diện, trang tài khoản, xuất / xoá | ~1 tuần |
| 4 | Rà bảo mật, hồ sơ pháp lý nếu phải lập, thử trên điện thoại | vài ngày |

Tổng khoảng 3–4 tuần (cỡ L), chưa tính thời gian chờ tư vấn pháp lý.

**Xong khi:** đăng nhập trên máy A rồi sửa routine, đăng nhập trên máy B thấy đúng routine đó. Hai máy cùng sửa thì được hỏi chọn bản, không mất âm thầm. Xoá tài khoản thì server không còn dữ liệu (trừ bản sao lưu đến hạn). Không đăng nhập thì app chạy như cũ. Chính sách và văn bản đồng ý đã được duyệt; hồ sơ pháp lý, nếu phải lập, đã gửi.

## 16. Đã làm (26/10) và còn thiếu trước khi mở thật

Đã làm, theo đúng các mục trên trừ chỗ ghi khác:
- Backend: `app/accounts.py`, `app/accounts_api.py`, `app/mailer.py`; bảng ở `schema.sql` (chưa dùng Alembic: hướng A). 12 test (`tests/test_accounts.py`): link dùng một lần, hết hạn, không lộ email đã có, bắt buộc đồng ý, giới hạn tần suất, 409 khi lệch phiên bản, dữ liệu sai dạng, đăng xuất / đăng xuất mọi máy, xuất, xoá sạch, chưa cấu hình email thì từ chối gửi.
- Frontend: cổng đăng nhập (`components/SignIn.tsx`, trừ `#review`), chính sách bản nháp (`PolicyText.tsx`), trang Tài khoản (`AccountPanel.tsx`), đồng bộ (`sync.ts`) với hộp thoại chọn bản. Thêm so với mục 6: máy dùng chung — routine của tài khoản khác còn trên máy không bao giờ bị tải lên tài khoản vừa đăng nhập; đăng xuất và xoá tài khoản xoá routine khỏi máy.
- Thử trên Chrome với hai hồ sơ trình duyệt (hai "thiết bị"): 22 tình huống, gồm đăng nhập bằng link, tải lên lần đầu, máy thứ hai nhận routine, hai máy cùng sửa thì hỏi, đăng xuất, máy dùng chung, xuất và xoá tài khoản.

Còn thiếu trước khi mở cho người dùng thật:
- [ ] Trả lời 3 câu hỏi pháp lý (mục 2); điền cách liên hệ vào chính sách và bỏ chữ "bản nháp" (đổi `POLICY_VERSION` ở cả backend và frontend)
- [ ] Dịch vụ gửi email đặt tại Việt Nam (thêm chế độ gửi thật vào `app/mailer.py`), domain có SPF / DKIM / DMARC
- [ ] Triển khai theo hướng A: HTTPS (cookie tự bật `Secure` khi `APP_URL` là https), Alembic, sao lưu, tự lưu font
- [ ] Giới hạn tần suất đang nằm trong bộ nhớ của một tiến trình: chạy nhiều tiến trình thì chuyển vào DB
- [ ] Việc định kỳ xoá tài khoản không dùng 24 tháng (cần gửi email báo trước, nên làm sau khi có dịch vụ email)

## 15. Đã chốt (người duyệt, 26/10)

- Làm H sau B, chỉ khi người dùng thật vẫn cần đồng bộ (mục 1)
- Bên kiểm soát dữ liệu: cá nhân người làm dự án (mục 2)
- Máy chủ và dịch vụ gửi email đặt tại Việt Nam (mục 2, 4)
- Kiểm phiên bản và hỏi người dùng, thay cho "bản sửa sau thắng" (mục 6)
- Xoá tài khoản không dùng sau 24 tháng, báo trước 30 ngày; bản sao lưu giữ 30 ngày (mục 7)
- Đồng bộ mã hoá đầu-cuối chỉ làm nếu tư vấn kết luận routine là dữ liệu nhạy cảm (mục 9)

**Còn mở:**
- [ ] Ai trả lời 3 câu hỏi pháp lý còn lại ở mục 2
- [ ] Chọn nhà cung cấp máy chủ và dịch vụ email cụ thể tại Việt Nam (cùng hướng A)
- [ ] Tự lưu font thay vì tải từ Google Fonts khi triển khai (mục 2)
