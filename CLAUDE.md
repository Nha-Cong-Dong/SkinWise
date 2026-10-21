# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dự án

SkinWise là web app quản lý routine skincare: người dùng xếp lịch dùng từng sản phẩm (sáng/tối, theo thứ trong tuần), app phát hiện trùng hoạt chất và cảnh báo các kết hợp cần thận trọng, mỗi cảnh báo có giải thích tiếng Việt và nguồn đáng tin cậy. Dự án cho hackathon Nhà Cộng Đồng (NCĐ). Remote: `github.com/Nha-Cong-Dong/SkinWise` (nhánh `main`).

Văn bản hiển thị cho người dùng (giao diện, giải thích cảnh báo) viết bằng **tiếng Việt**; code, tên định danh và commit message viết bằng tiếng Anh. `README.md` là đặc tả cho người dùng — giữ mục "Lộ trình" và "Chạy trên máy" khớp với code.

## Hiện trạng

Dự án được làm lại từ đầu ngày 2026-10-21: repo chỉ có `README.md`. Chưa có code, build, lint hay test — bổ sung các lệnh vào đây khi đã dựng khung.

## Phạm vi (MVP, hạn ≈ 2026-11-10)

Một lập trình viên, không có nền tảng y khoa, nên MVP cố tình hẹp:
- Làm: dán bảng INCI hoặc chọn từ khoảng 30 sản phẩm mẫu; xếp lịch sáng/tối + ngày trong tuần theo thứ tự bước; phát hiện trùng hoạt chất; 5–8 luật xung đột có nguồn mạnh; 2–3 thẻ myth.
- Để sau: tra cứu mã vạch qua Open Beauty Facts, OCR nhãn, hồ sơ da (nhạy cảm, mang thai…), tài khoản và đồng bộ. Trong MVP routine lưu trên trình duyệt.

## Công nghệ (dự kiến)

- Backend: Python, FastAPI, Pydantic (kiểm tra dữ liệu đầu vào). Script xử lý dữ liệu (CosIng, dữ liệu mẫu, kiểm tra đoạn trích nguồn) cũng viết bằng Python. Chỉ một backend, không chạy thêm service Node.
- Cơ sở dữ liệu: PostgreSQL, cả khi dev (chạy bằng Docker hoặc cài trực tiếp). Tìm sản phẩm chấp nhận gõ sai, không dấu bằng `pg_trgm`.
- Frontend: React + Vite + Tailwind CSS.

## Kiến trúc (thiết kế đã chốt — bám theo)

Luồng: bảng INCI → tách + chuẩn hoá tên (chữ thường, bỏ dấu) → từ điển thành phần + từ đồng nghĩa (tham chiếu EU CosIng) → nhóm hoạt chất → routine (sản phẩm × buổi × ngày) → bộ luật → cảnh báo kèm giải thích + nguồn.

- **Luật viết theo nhóm hoạt chất** (AHA, BHA, PHA, RETINOID, VITAMIN_C, NIACINAMIDE, BENZOYL_PEROXIDE, nhóm chung EXFOLIANT_ACID…; khoảng 10 nhóm), không theo từng chất. Một thành phần có thể thuộc nhiều nhóm. Citric Acid thường chỉ là chất chỉnh pH, không tính là AHA tẩy da chết.
- Mỗi luật có loại (conflict / duplicate / profile / myth), mức độ (avoid / caution / info / safe), phạm vi (cùng bước / cùng buổi / cùng ngày) và mức bằng chứng. Luật "myth" (ví dụ vitamin C + niacinamide phần lớn dùng chung được) là tính năng có chủ đích.
- **Engine cảnh báo là tất định.** Cảnh báo chỉ đến từ luật; LLM tối đa chỉ được diễn đạt lại lời giải thích của luật có sẵn, không được tạo cảnh báo hay tự "nhớ" bảng thành phần của sản phẩm.
- Bảng INCI không ghi nồng độ nên cảnh báo dùng chữ "có thể".
- Mỗi sản phẩm ghi lại bảng thành phần lấy từ đâu (dữ liệu mẫu, nhập tay, Open Beauty Facts…) và trạng thái xác minh.

## Nguyên tắc nguồn: không có nguồn thì không có cảnh báo

Độ chính xác đến từ nguồn, không từ hiểu biết chuyên môn:
1. Mỗi luật gắn ít nhất một nguồn uy tín (AAD, DermNet, bài tổng quan PubMed/JAAD, CIR, CosIng, FDA, Hiệp định mỹ phẩm ASEAN) và lưu **nguyên văn đoạn trích** hỗ trợ luật.
2. Một bước kiểm tra tải trang nguồn và xác nhận đoạn trích có trên trang.
3. Luật chỉ được bật sau khi có người đọc nguồn. Bỏ mọi luật không có nguồn rõ ràng; luật do AI soạn để ở trạng thái chưa bật cho đến khi được kiểm tra.

Dữ liệu Open Beauty Facts theo giấy phép ODbL — ghi công và gửi User-Agent mô tả rõ ứng dụng.
