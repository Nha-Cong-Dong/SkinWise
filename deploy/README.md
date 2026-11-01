# Triển khai SkinWise

Cấu hình mẫu để chạy SkinWise trên một máy chủ Linux (Ubuntu 24.04 hoặc tương đương). **Chưa triển khai ở đâu.** Trước khi mở cho người dùng thật, xem `plan/h-accounts.md`: máy chủ, bản sao lưu và dịch vụ email phải đặt tại Việt Nam (Luật 91/2025, Đ.20), chính sách quyền riêng tư phải được người có chuyên môn duyệt.

```
Trình duyệt ──HTTPS──► nginx ──┬── /            frontend/dist (file tĩnh)
                               └── /api/...     uvicorn 127.0.0.1:8000 (bỏ tiền tố /api)
                                                    │
                                                    └── PostgreSQL 17 (cùng máy)
```

| File | Dùng làm gì |
|---|---|
| `nginx/skinwise.conf` | HTTPS, chuyển `/api/` sang backend, gzip, cache file tĩnh, giới hạn kích thước request |
| `nginx/skinwise-headers.conf` | Header bảo mật (CSP, HSTS, nosniff…), chép vào `/etc/nginx/snippets/` |
| `systemd/skinwise-api.service` | Chạy uvicorn sau nginx, tự khởi động lại |
| `backup.sh` | Sao lưu DB + ảnh blog mỗi ngày, giữ 30 ngày |

## Các bước

1. **Máy chủ:** cài PostgreSQL 17 (kèm `postgresql-contrib` cho `pg_trgm`, `unaccent`), nginx, certbot, [uv](https://docs.astral.sh/uv/), Node.js 22. Tạo người dùng hệ thống `skinwise` và thư mục:

   ```bash
   sudo useradd --system --create-home --home-dir /srv/skinwise skinwise
   sudo -u skinwise mkdir -p /srv/skinwise/{app,frontend,uploads,backups}
   sudo -u postgres createuser skinwise && sudo -u postgres createdb -O skinwise skinwise
   ```

2. **Mã nguồn và backend** (người dùng `skinwise`):

   ```bash
   git clone https://github.com/Nha-Cong-Dong/SkinWise.git /srv/skinwise/app
   cd /srv/skinwise/app/backend
   uv sync --locked --no-dev
   cp .env.example .env    # sửa như mục "Cấu hình" bên dưới
   uv run python -m scripts.seed
   uv run python -m scripts.reviewers add "Tên người duyệt"
   ```

3. **Frontend:** build với địa chỉ công khai (cho ảnh xem trước khi chia sẻ link), rồi chép sang thư mục nginx phục vụ:

   ```bash
   cd /srv/skinwise/app/frontend
   npm ci && SITE_URL=https://skinwise.example.vn npm run build
   rsync -a --delete dist/ /srv/skinwise/frontend/
   ```

4. **Dịch vụ backend:** `deploy/systemd/skinwise-api.service` → `/etc/systemd/system/`, sửa đường dẫn `uv` nếu khác (`which uv`), rồi `systemctl daemon-reload && systemctl enable --now skinwise-api`. Kiểm tra: `curl http://127.0.0.1:8000/health`.

5. **nginx + HTTPS:** thay `skinwise.example.vn` trong `nginx/skinwise.conf` bằng tên miền thật. Xin chứng chỉ trước bằng `certbot certonly --webroot -w /var/www/certbot -d <tên miền>` (cần khối `listen 80` chạy trước, tạm bỏ khối 443). Chép hai file nginx vào chỗ của chúng, rồi `nginx -t && systemctl reload nginx`.

6. **Sao lưu:** cron của người dùng `skinwise`: `15 3 * * * /srv/skinwise/app/deploy/backup.sh`. Thử khôi phục ít nhất một lần: `pg_restore --clean -d skinwise db-YYYY-MM-DD.dump`.

## Cấu hình (`backend/.env`)

| Biến | Giá trị khi triển khai |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://skinwise@/skinwise` (kết nối qua socket, không cần mật khẩu) |
| `APP_URL` | `https://<tên miền>`: link xác thực / đặt lại mật khẩu trỏ về đây; bắt đầu bằng `https://` thì cookie phiên có cờ `Secure` |
| `UPLOAD_DIR` | `/srv/skinwise/uploads` (trùng `ReadWritePaths` trong file systemd) |
| `LOGIN_EMAIL_MODE` | `dev` khi demo: link hiện trên màn hình, **ai cũng tạo được tài khoản bằng email giả**. Chỉ đổi sang `smtp` với dịch vụ email tại Việt Nam |
| `ANTHROPIC_API_KEY`, `LABEL_MODEL`, `DRAFT_MODEL` | Tuỳ chọn. Không có thì đọc ảnh nhãn và AI soạn nháp trả 503 |

## Những điều cần biết

- **Một tiến trình uvicorn.** Giới hạn tần suất (đăng nhập sai, gửi email, ảnh nhãn, viết bài) nằm trong bộ nhớ của tiến trình: chạy nhiều worker thì mỗi worker cho phép đủ giới hạn, khởi động lại thì giới hạn về 0.
- **IP người dùng:** nginx ghi `X-Forwarded-For $remote_addr` (không nối thêm giá trị trình duyệt gửi), uvicorn chỉ tin header này từ `127.0.0.1`. Nếu đặt thêm một proxy hay CDN phía trước, phải sửa cả hai chỗ, nếu không mọi người dùng chung một IP và 20 lần đăng nhập sai của bất kỳ ai sẽ khoá đăng nhập của tất cả.
- **Schema:** `scripts.seed` áp `app/schema.sql` (chạy lại không lỗi) rồi nạp dữ liệu. Chưa có migration: trước mỗi lần cập nhật có đổi schema, sao lưu DB.
- **Cập nhật:** `git pull`, `uv sync --locked --no-dev`, `uv run python -m scripts.seed`, build lại frontend, `systemctl restart skinwise-api`.
- **Log:** uvicorn ghi đường dẫn và mã trạng thái vào journald (`journalctl -u skinwise-api`), không ghi nội dung request; nginx ghi IP trong access log. Đặt thời hạn giữ log (vd. `logrotate` 14 ngày, `SystemMaxRetentionSec=14d` cho journald) và ghi thời hạn đó vào chính sách quyền riêng tư.
- **Tài liệu API** (`/api/docs`) đang mở. Muốn tắt thì thêm `location /api/docs { return 404; }` và tương tự cho `/api/openapi.json`.
- **Cấu hình nginx chưa được chạy thử** (máy làm dự án không có nginx): chạy `nginx -t` và kiểm header bằng `curl -I https://<tên miền>/` sau khi cài.
