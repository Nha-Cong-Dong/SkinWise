# ANIMATION.md: chuyển động của SkinWise

Tài liệu này bổ sung cho mục **Chuyển động** trong `DESIGN.md`. Khi hai file nói khác nhau, file này thắng (xem mục 10).

## 1. Yêu cầu gốc

> Thêm một chút chuyển động vào cả bốn màn hình, nhưng giữ nguyên bố cục, màu sắc và nội dung văn bản.
> Thương hiệu mang phong cách bình tĩnh và đáng tin cậy, vì vậy hãy giữ mọi thứ nhẹ nhàng, mượt mà. Sử dụng các hiệu ứng chuyển cảnh nhanh với kiểu easing-out (giảm tốc nhẹ ở cuối chuyển động).
> Không sử dụng hiệu ứng nảy (bouncy) hay đàn hồi như lò xo (springy).
> Sử dụng các hiệu ứng mờ dần (fade-up) nhẹ nhàng khi tải trang, kết hợp với một chút **độ trễ so le (stagger) giữa các khối, để mắt đọc theo đúng thứ tự trên trang**.

Bốn màn hình là bốn tab của "Lịch dùng" (`TABS` trong `frontend/src/App.tsx`):

| Tab | Thành phần chính |
|---|---|
| Hôm nay | `TodayPage.tsx` |
| Lịch tuần | `RoutineBoard.tsx` |
| Tủ đồ | `MyProducts.tsx`, `ProductImage.tsx`, `UndoRemove.tsx` |
| Kiểm tra | `WarningsPanel.tsx`, `RuleCard.tsx` |

**Không đổi:** bố cục, khoảng cách, màu, font, cỡ chữ, nội dung chữ. Chuyển động chỉ được dùng `opacity` và `transform`; trạng thái cuối của mọi chuyển động phải trùng từng pixel với giao diện hiện tại.

## 2. Nguyên tắc

1. **Bình tĩnh.** Chuyển động nhỏ, ngắn, một chiều. Người dùng gần như không "thấy" nó, chỉ thấy trang có cảm giác liền mạch.
2. **Nhanh rồi chậm lại.** Mọi chuyển động vào dùng ease-out: đi nhanh ở đầu, giảm tốc êm ở cuối. Không bao giờ vượt quá điểm đích rồi quay lại.
3. **Không nảy, không lò xo.** Không `cubic-bezier` có giá trị y > 1 hoặc < 0, không keyframe vượt điểm cuối (`105%`, `scale(1.05)` rồi về `1`), không lắc, không xoay.
4. **Chuyển động phục vụ việc đọc.** Thứ tự xuất hiện bám thứ tự đọc (trên xuống, trái sang phải). Không có gì chuyển động để gây chú ý, trừ lớp tô báo thay đổi đã có và chỗ một link vừa trỏ tới (5.9).
5. **Cảnh báo không bao giờ bị làm chậm.** Nội dung cảnh báo, đoạn trích nguồn và mức độ phải đọc được gần như ngay lập tức (xem mục 7).
6. **Chỉ CSS.** Không thêm thư viện chuyển động (dự án chỉ dùng React + Tailwind). Không JavaScript điều khiển từng khung hình.

## 3. Token

Thêm vào `@theme` trong `frontend/src/index.css`:

```css
@theme {
  /* Thời lượng */
  --duration-instant: 120ms;   /* hover, bật/tắt, đổi màu nút */
  --duration-fast: 180ms;      /* đổi tab, dropdown, tooltip */
  --duration-base: 240ms;      /* mở/thu thẻ, dialog, thêm/bớt mục */
  --duration-enter: 320ms;     /* fade-up khi tải trang */
  --duration-highlight: 600ms; /* lớp tô baby pink báo thay đổi (đã có) */

  /* Easing: không có giá trị nào vượt khoảng 0–1, nên không thể nảy */
  --ease-out-soft: cubic-bezier(0.22, 0.61, 0.36, 1); /* mặc định cho mọi chuyển động vào */
  --ease-out-strong: cubic-bezier(0.16, 1, 0.3, 1);   /* fade-up khi tải trang: dừng rất êm */
  --ease-in-soft: cubic-bezier(0.4, 0, 1, 1);         /* chỉ cho chuyển động ra */

  /* Khoảng dịch */
  --motion-rise: 8px;        /* fade-up khi tải trang */
  --motion-rise-sm: 4px;     /* đổi tab, dropdown, mục mới trong danh sách */

  /* So le */
  --stagger-step: 40ms;
  --stagger-max: 6;          /* khối thứ 7 trở đi dùng chung độ trễ của khối thứ 6 */
}
```

Quy tắc dùng:
- Chuyển động **ra** ngắn hơn chuyển động vào khoảng 1/3 (vd. dialog vào 240ms, ra 160ms) và dùng `--ease-in-soft`.
- Khoảng dịch không bao giờ quá 8px. Không trượt từ cạnh màn hình.
- `scale` chỉ dùng cho nhấn nút (0.98) và dialog (0.98 → 1). Không phóng to quá 1.

## 4. Keyframes và lớp tiện ích

```css
@keyframes fade-up {
  from { opacity: 0; transform: translateY(var(--motion-rise)); }
  to   { opacity: 1; transform: none; }
}

@keyframes fade-up-sm {
  from { opacity: 0; transform: translateY(var(--motion-rise-sm)); }
  to   { opacity: 1; transform: none; }
}

@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@layer utilities {
  .motion-enter {
    animation: fade-up var(--duration-enter) var(--ease-out-strong) both;
    animation-delay: calc(min(var(--i, 0), var(--stagger-max)) * var(--stagger-step));
  }
  .motion-tab {
    animation: fade-up-sm var(--duration-fast) var(--ease-out-soft) both;
  }
  .motion-item {
    animation: fade-up-sm var(--duration-base) var(--ease-out-soft) both;
  }
  .motion-fade {
    animation: fade-in var(--duration-fast) var(--ease-out-soft) both;
  }
}
```

Trong React, gán thứ tự so le bằng biến CSS:

```tsx
<section className="motion-enter" style={{ '--i': 2 } as React.CSSProperties}>
```

`animation-fill-mode: both` giữ khối ở trạng thái đầu trong lúc chờ độ trễ, nên không có khung hình nhấp nháy.

## 5. Mẫu chuyển động

### 5.1. Tải trang / mở tab lần đầu: fade-up so le
- Mỗi **khối lớn** (tiêu đề trang, panel buổi sáng, panel buổi tối, thanh công cụ, lưới sản phẩm, danh sách cảnh báo) dùng `.motion-enter` với `--i` = 0, 1, 2… theo thứ tự đọc.
- So le theo khối, **không theo từng dòng chữ hay từng chip**. Danh sách dài: chỉ 6 mục đầu so le, phần còn lại hiện cùng mục thứ 6.
- Tổng thời gian từ lúc bấm đến khi mọi thứ đứng yên: tối đa 320ms + 6 × 40ms = **560ms**.
- Chỉ chạy **khi component mount**. Re-render (vd. `useRoutineCheck()` trả kết quả mới, đồng bộ `sync.ts`) không được chạy lại. Không đặt `key` thay đổi theo dữ liệu lên khối có `.motion-enter`.

### 5.2. Đổi giữa bốn tab
- Nội dung tab mới: `.motion-tab` (fade + dịch 4px, 180ms). Đặt `key={tab}` lên vùng nội dung để chạy lại khi đổi tab.
- Không chạy fade-up so le của 5.1 khi đổi tab: chỉ một lần fade cho cả vùng, để đổi tab có cảm giác tức thì.
- Không có hiệu ứng ra cho tab cũ (tránh hai nội dung chồng nhau và xê dịch bố cục).
- Gạch chân / nền của tab đang chọn: đổi màu trong `--duration-instant`. Không trượt gạch chân giữa các tab (cần đo vị trí bằng JS, không đáng).
- Số cảnh báo trên tab "Kiểm tra": khi số đổi, chỉ đổi số, không đếm chạy, không nhảy.

### 5.3. Nút, ô chọn, ngày trong tuần
- Hover / focus: đổi màu nền, viền, chữ trong `--duration-instant`, `--ease-out-soft`.
- Nhấn (`:active`): `transform: scale(0.98)` trong 120ms, nhả ra về 1 cùng thời lượng. Không nảy lại.
- Nút ngày (`day-toggle-on/off`) và công tắc: chuyển màu 120ms. Không đổi kích thước.
- Vòng focus (`:focus-visible`) **không** có chuyển động: hiện ngay.

### 5.4. Thẻ mở/thu, dropdown, tooltip
- Mở/thu thẻ (vd. khối "Chất liên quan trên nhãn"): giữ quy tắc 200–240ms ease-out đã có. Phần nội dung mở ra dùng `.motion-fade`; chiều cao đổi bằng `grid-template-rows: 0fr → 1fr` (không animate `height: auto` bằng JS).
- **Ngoại lệ (mục 7):** phần mở ra trong `RuleCard` ("Xem nguyên văn", nguồn, đoạn trích) hiện ngay, không fade, không trễ.
- Dropdown tìm sản phẩm: `.motion-tab` (fade + 4px từ trên xuống), 180ms. Đóng: fade 120ms.
- Tooltip: `.motion-fade`, độ trễ hiện 300ms, đóng ngay.

### 5.5. Dialog (`Dialog.tsx`)
- Vào: nền mờ `fade-in` 240ms; hộp thoại `opacity 0 → 1` + `scale(0.98) → 1` + dịch 8px → 0, 240ms `--ease-out-strong`.
- Ra: 160ms `--ease-in-soft`, chỉ opacity. Nếu khó làm với `<dialog>`, bỏ chuyển động ra; chuyển động vào là đủ.

### 5.6. Thêm, bớt, sắp xếp sản phẩm
- Thêm sản phẩm vào buổi / tủ đồ: mục mới dùng `.motion-item` (fade + 4px, 240ms). Các mục khác **không** trượt nhường chỗ (không FLIP).
- Xoá: mục biến mất ngay; thanh hoàn tác (`UndoRemove.tsx`) hiện bằng `.motion-tab` từ dưới lên 4px. Tự ẩn bằng fade 160ms.
- Kéo / đổi thứ tự bước: không thêm chuyển động; vị trí đổi ngay để người dùng thấy chắc chắn bước nào đứng trước.

### 5.7. Ảnh sản phẩm (`ProductImage.tsx`)
- Ảnh tải xong: fade-in 240ms trên nền giữ chỗ đã có. Không phóng to dần, không làm mờ (blur-up).
- Ảnh đã nằm trong cache (tải tức thì): không fade.

### 5.8. Đang tải
- Chỉ hiện chỉ báo đang tải nếu chờ quá 300ms, rồi fade-in 180ms.
- Không dùng shimmer chạy ngang. Nếu cần khung giữ chỗ: màu tĩnh, hoặc nhịp opacity 1 ↔ 0.6 chu kỳ 1,6 giây, ease-in-out, dừng ngay khi có dữ liệu.

### 5.9. Chỉ ra chỗ một link trỏ tới (`.motion-spotlight`)
Thêm 07/11 theo yêu cầu người dùng: bấm từ một cảnh báo sang tab khác thì phải thấy ngay đúng chỗ, không phải tự lướt tìm.
- Link mang khoá luật: `#/lich-dung/lich-tuan?chu-y=<khoá>` ("Mở lịch tuần để sắp xếp lại" ở tab Kiểm tra) và `#/lich-dung/kiem-tra?chu-y=<khoá>` ("Xem giải thích và nguồn" ở Hôm nay và trang sản phẩm).
- Kiểm tra: cuộn ngay (không mượt) tới thẻ của luật đó, chuyển focus vào thẻ. Lịch tuần: mở đúng buổi của cảnh báo, cuộn tới bước đầu tiên thuộc cảnh báo, đánh dấu ngày cảnh báo áp dụng bằng quầng hồng, ô tuần trên điện thoại cũng được tô; khung trên cùng ghi tên cảnh báo, các buổi có cảnh báo, "Xem giải thích", "Bỏ đánh dấu", và nói rõ khi kết quả mới không còn cảnh báo đó.
- Chuyển động: không viền. Khối đi lên từ chỗ cũ tới vị trí **cao hơn chỗ cũ 5px** (520ms, `--ease-out-strong`) và một quầng bóng hồng (blush) toả nhẹ bên dưới hiện dần; cả hai **đứng yên** sau đó để chỗ đó vẫn được đánh dấu. Ngày cảnh báo áp dụng có quầng hồng nhỏ, không viền. Thẻ ở tab Kiểm tra chỉ có vòng focus khi dùng bàn phím (`focus-visible`). Chữ không mờ, không trễ (mục 7 vẫn giữ). Ngoại lệ có chủ đích với mục 1: trạng thái nghỉ khác giao diện không chuyển động (nhô 5px + bóng), và quầng bóng là `box-shadow` chạy một lần. Tắt khi bật giảm chuyển động (hiện ngay ở trạng thái nghỉ).
- Chỉ hiển thị: nhóm theo luật và ngày được đánh dấu lấy nguyên từ kết quả kiểm tra, không suy ra thêm.

## 6. Từng màn hình

| Màn hình | Thứ tự so le khi tải (`--i`) | Chuyển động khi dùng |
|---|---|---|
| **Hôm nay** | 0 tiêu đề + ngày · 1 panel buổi sáng · 2 panel buổi tối · 3 tóm tắt cảnh báo (nếu có) | Đánh dấu đã dùng một bước: đổi màu 120ms, dấu tích fade-in 120ms (không vẽ nét, không nảy) |
| **Lịch tuần** | 0 tiêu đề + chọn ngày · 1 buổi sáng · 2 buổi tối | Đổi ngày: nội dung hai buổi `.motion-tab`. Thêm bước: `.motion-item` |
| **Tủ đồ** | 0 tiêu đề + ô tìm · 1 thanh lọc · 2… từng thẻ sản phẩm (tối đa 6 nấc) | Dropdown tìm: 5.4. Thêm sản phẩm: `.motion-item`. Xoá + hoàn tác: 5.6. Ảnh: 5.7 |
| **Kiểm tra** | 0 tiêu đề + tóm tắt · 1 danh sách cảnh báo **cả khối một lần** · 2 khối "không có cảnh báo ≠ an toàn" | Kết quả kiểm tra mới: chỉ lớp tô baby pink 600ms trên thẻ vừa xuất hiện / vừa đổi (đã có). Mở nguyên văn / nguồn: hiện ngay, không chuyển động (mục 7) |

## 7. Những thứ không chuyển động

- **Chữ cảnh báo, đoạn trích nguồn, mức độ, nhãn "Bản dễ hiểu, đã duyệt"**: không gõ chữ dần, không hiện từng dòng. Trên tab Kiểm tra, cả danh sách cảnh báo vào **cùng một lúc** (một `.motion-enter`), không so le từng thẻ, để thẻ "tránh" không bao giờ hiện sau thẻ "thông tin".
- **Thứ tự cảnh báo**: khi danh sách sắp xếp lại, thẻ đổi chỗ ngay, không trượt.
- **Thông báo "không có cảnh báo ≠ an toàn" (`notice_vi`)**: không mờ hơn, không trễ hơn danh sách cảnh báo.
- **Vị trí cuộn**: không cuộn mượt bằng JS, không giữ cuộn bằng chuyển động.
- **Không hiện dần khi cuộn** (scroll reveal), không parallax, không chuyển động lặp vô hạn (trừ chỉ báo đang tải ở 5.8), không con trỏ tuỳ biến.
- **Bố cục**: không animate `width`, `height`, `top`, `left`, `margin`, `padding` (trừ kỹ thuật `grid-template-rows` ở 5.4). Không gì làm xê dịch nội dung xung quanh trong lúc chuyển động.
- **Màu**: không chuyển gradient, không nhấp nháy màu mức độ. Chuyển động không được thêm màu mới.

## 8. Khả năng tiếp cận

- `prefers-reduced-motion: reduce`: quy tắc toàn cục hiện có trong `index.css` đặt mọi thời lượng về 0, nên khối hiện ngay ở trạng thái cuối nhờ `fill-mode: both`. Giữ quy tắc đó. Đặt thêm `animation-delay: 0s !important` trong cùng khối để không còn chờ so le.
- Nội dung không bao giờ phụ thuộc vào chuyển động: nếu CSS animation không chạy, mọi thứ vẫn hiện đủ (không dùng `opacity: 0` tĩnh chờ JS bật lên).
- Không có gì nhấp nháy quá 3 lần/giây.
- Focus bàn phím chuyển sang nội dung tab mới ngay, không chờ chuyển động xong.

## 9. Kiểm tra trước khi merge

- [ ] So ảnh chụp trước / sau ở trạng thái đứng yên của cả bốn tab: không lệch pixel.
- [ ] Không còn `cubic-bezier` có giá trị ngoài 0–1, không keyframe vượt điểm cuối (`grep -rn "cubic-bezier\|@keyframes" frontend/src`).
- [ ] Tải trang: mọi thứ đứng yên trong ≤ 560ms; đổi tab ≤ 180ms.
- [ ] `useRoutineCheck()` trả kết quả mới không làm các khối fade lại.
- [ ] Danh sách cảnh báo hiện cùng một lúc; mức độ "tránh" không hiện sau mức khác.
- [ ] Bật "Giảm chuyển động" trong hệ điều hành: không còn chuyển động, không còn độ trễ.
- [ ] Điện thoại tầm trung (DevTools, CPU chậm 4×): không giật; DevTools Performance không có layout shift do chuyển động.
- [ ] `npm run build` và `npm run lint` qua.

## 10. Quan hệ với DESIGN.md

`DESIGN.md` hiện viết: "Những thứ không bao giờ chuyển động: **tải trang**, …". Yêu cầu mới cho phép fade-up nhẹ khi tải trang, nên khi áp dụng file này cần sửa dòng đó thành:

> **Những thứ không bao giờ chuyển động:** vị trí cuộn, chữ cảnh báo, đoạn trích, việc sắp xếp lại cảnh báo. Tải trang chỉ có fade-up nhẹ theo khối (`ANIMATION.md`). Không có gì hiện dần khi cuộn. Mọi chuyển động tắt khi người dùng bật `prefers-reduced-motion`.

Ba thời lượng cũ (120ms / 200ms / 600ms) vẫn giữ nguyên ý nghĩa; file này chỉ thêm 180ms, 240ms, 320ms và các easing có tên.
