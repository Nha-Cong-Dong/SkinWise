---
version: alpha
name: SkinWise
description: 'Biến sự hỗn loạn thành sự rõ ràng. Sắp xếp routine skincare sáng/tối theo ngày và cảnh báo kết hợp hoạt chất; mỗi cảnh báo có giải thích tiếng Việt và đoạn trích nguyên văn từ nguồn.'

colors:
  primary: "#383466"
  primary-hover: "#272451"
  neutral: "#F5F2F8"
  surface: "#FCFBF8"
  on-surface: "#1C1C2C"
  secondary: "#5A586B"
  border: "#D9D8E0"
  petal: "#FFC8DD"
  dawn: "#FFEEF4"
  dawn-ink: "#8B2F55"
  dusk: "#2F2A55"
  dusk-raised: "#3F3969"
  dusk-line: "#534F7A"
  on-dusk: "#F0EFF8"
  dusk-mute: "#BEB9D9"
  blush: "#FFAFCC"
  thistle: "#CDB4DB"
  thistle-ink: "#442A59"
  avoid: "#BD3A2B"
  avoid-ink: "#8D251F"
  avoid-soft: "#FFE6E1"
  caution: "#BF7101"
  caution-ink: "#824C11"
  caution-soft: "#FFEECF"
  info: "#3275B4"
  info-ink: "#1D4F82"
  icy: "#BDE0FE"
  safe: "#348757"
  safe-ink: "#1C5E3D"
  safe-soft: "#E0F5E6"
  night: "#11111F"
  night-surface: "#1D1C2E"
  night-raised: "#29273E"
  night-border: "#3C3954"
  night-dawn: "#381C2A"
  thistle-hover: "#DECCEA"
  sky: "#A2D2FF"
  avoid-deep: "#492019"
  avoid-light: "#FEBFB4"
  caution-deep: "#412805"
  caution-light: "#F7C790"
  info-deep: "#102F4D"
  safe-deep: "#0A371F"
  safe-light: "#AAE0BC"

typography:
  display:
    fontFamily: Archivo
    fontSize: 34px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Archivo
    fontSize: 26px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.012em
  headline-sm:
    fontFamily: Archivo
    fontSize: 21px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.006em
  body-lg:
    fontFamily: Archivo
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: Archivo
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Archivo
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: Archivo
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.01em
  caption:
    fontFamily: Archivo
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  numeric:
    fontFamily: Archivo
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.3
    fontFeature: "'tnum' 1"
  quote:
    fontFamily: Newsreader
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.55

rounded:
  sm: 4px
  md: 8px
  lg: 14px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 24px
  margin: 16px

components:
  page:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  text-meta:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.caption}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
    height: 44px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
    height: 44px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
    height: 44px
  input-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.avoid-ink}"
    typography: "{typography.body-sm}"
  session-morning:
    backgroundColor: "{colors.dawn}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  session-morning-label:
    backgroundColor: "{colors.petal}"
    textColor: "{colors.dawn-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  session-evening:
    backgroundColor: "{colors.dusk}"
    textColor: "{colors.on-dusk}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  session-evening-meta:
    backgroundColor: "{colors.dusk}"
    textColor: "{colors.dusk-mute}"
    typography: "{typography.caption}"
  session-evening-step:
    backgroundColor: "{colors.dusk-raised}"
    textColor: "{colors.on-dusk}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  divider-evening:
    backgroundColor: "{colors.dusk-line}"
    height: 1px
  step-number:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.secondary}"
    typography: "{typography.numeric}"
    rounded: "{rounded.full}"
    size: 24px
  day-toggle-on:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.numeric}"
    rounded: "{rounded.full}"
    size: 36px
  day-toggle-off:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.numeric}"
    rounded: "{rounded.full}"
    size: 36px
  chip-active:
    backgroundColor: "{colors.thistle}"
    textColor: "{colors.thistle-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  highlight:
    backgroundColor: "{colors.blush}"
    textColor: "{colors.on-surface}"
  source-quote:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.quote}"
    padding: "{spacing.md}"
  badge-avoid:
    backgroundColor: "{colors.avoid-soft}"
    textColor: "{colors.avoid-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  badge-caution:
    backgroundColor: "{colors.caution-soft}"
    textColor: "{colors.caution-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  badge-info:
    backgroundColor: "{colors.icy}"
    textColor: "{colors.info-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  badge-safe:
    backgroundColor: "{colors.safe-soft}"
    textColor: "{colors.safe-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  severity-bar-avoid:
    backgroundColor: "{colors.avoid}"
    width: 4px
  severity-bar-caution:
    backgroundColor: "{colors.caution}"
    width: 4px
  severity-bar-info:
    backgroundColor: "{colors.info}"
    width: 4px
  severity-bar-safe:
    backgroundColor: "{colors.safe}"
    width: 4px
  tooltip:
    backgroundColor: "{colors.on-surface}"
    textColor: "{colors.surface}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  page-dark:
    backgroundColor: "{colors.night}"
    textColor: "{colors.on-dusk}"
    typography: "{typography.body-md}"
  card-dark:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.on-dusk}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  text-meta-dark:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.dusk-mute}"
    typography: "{typography.caption}"
  divider-dark:
    backgroundColor: "{colors.night-border}"
    height: 1px
  link-dark:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.thistle}"
    typography: "{typography.body-md}"
  button-primary-dark:
    backgroundColor: "{colors.thistle}"
    textColor: "{colors.night}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
    height: 44px
  button-primary-dark-hover:
    backgroundColor: "{colors.thistle-hover}"
    textColor: "{colors.night}"
  input-dark:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.on-dusk}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
    height: 44px
  session-morning-dark:
    backgroundColor: "{colors.night-dawn}"
    textColor: "{colors.on-dusk}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  session-morning-label-dark:
    backgroundColor: "{colors.night-dawn}"
    textColor: "{colors.petal}"
    typography: "{typography.label}"
  step-dark:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.on-dusk}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  badge-avoid-dark:
    backgroundColor: "{colors.avoid-deep}"
    textColor: "{colors.avoid-light}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  badge-caution-dark:
    backgroundColor: "{colors.caution-deep}"
    textColor: "{colors.caution-light}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  badge-info-dark:
    backgroundColor: "{colors.info-deep}"
    textColor: "{colors.sky}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  badge-safe-dark:
    backgroundColor: "{colors.safe-deep}"
    textColor: "{colors.safe-light}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
---

# SkinWise

## Overview

**Tagline: "Biến sự hỗn loạn thành sự rõ ràng."** Dòng mô tả đi kèm khi cần nói app làm gì: "Routine skincare có nguồn."

SkinWise được mở vào hai thời điểm trong ngày: buổi sáng trước khi bôi kem chống nắng, và buổi tối trước gương, tay cầm lọ retinoid. Phần lớn là trên điện thoại, cầm một tay, có khi trong phòng tắm thiếu sáng. Người dùng đã có sáu đến mười sản phẩm và không chắc hai trong số đó có dùng chung một buổi tối được không. Trên mạng xã hội họ đã nghe nhiều lời trái ngược nhau. Việc của app là biến mớ thông tin đó thành một câu trả lời ngắn, có nguồn.

Hướng thiết kế là **Nordic Calm kết hợp với ánh chạng vạng của logo SkinWise**. Nordic Calm mang lại tính khí: tương phản thấp, nền mềm, nhiều khoảng trống, không có gì la hét. Logo và bảng màu pastel (thistle, pastel petal, baby pink, icy blue, sky blue) mang lại bản sắc: một vòng tròn chia đôi giữa bình minh và chạng vạng, ở giữa là giọt serum ngọc trai. Routine chỉ có hai buổi, nên giao diện xoay quanh hai "ánh sáng": panel **bình minh hồng** cho buổi sáng và panel **chạng vạng chàm** cho buổi tối. Mọi thứ khác giữ im lặng để người dùng nhìn thấy hai buổi đó và các cảnh báo.

**Thứ chủ động đánh đổi: sự kịch tính và cảm giác khẩn cấp.** Không có hero, không phủ màu thương hiệu lên mọi bề mặt, không có hiệu ứng trấn an. Cảnh báo "nên tránh" gây chú ý chỉ nhờ màu mức độ, và đó là những màu đậm duy nhất trong giao diện. Đổi lại, app mang lại sự bình tĩnh: người đang lo cho làn da không nên lo hơn sau khi mở app. Nó cũng mang lại sự đáng tin: một đoạn trích có nguồn đặt trong giao diện yên tĩnh đọc như bằng chứng, còn đặt trong giao diện ồn ào thì đọc như quảng cáo.

Hai quy tắc ngữ nghĩa áp dụng cho toàn hệ thống và đứng trên mọi sở thích thị giác:

1. **Màu đậm nghĩa là mức độ cảnh báo.** Chỉ avoid / caution / info / safe được dùng màu mạnh. Màu thương hiệu tối và trầm; pastel chỉ là nền. Không ai được nhầm chúng với cảnh báo.
2. **Chữ serif nghĩa là "nguồn đã nói điều này".** Newsreader nghiêng chỉ dùng cho chữ trích nguyên văn từ nguồn. Lời của chính app không bao giờ đặt bằng serif.

## Colors

Màu được chia thành ba lớp, mỗi lớp có một việc:

1. **Mực (màu tối, trầm):** chữ và thao tác. Lấy từ màu chàm của chữ trong logo.
2. **Pastel:** nền, vùng tô, điểm đánh dấu. Lấy từ bảng màu pastel. **Pastel không bao giờ là màu chữ trên nền sáng**, vì cả năm màu đều có độ sáng 0,80–0,89 và không màu nào đạt tương phản đủ để đọc.
3. **Mức độ cảnh báo:** những màu đậm duy nhất.

**Mực và nền**
- **Primary (#383466): mực chạng vạng.** Màu chàm của chữ "SkinWise" (`#3B376E`), làm tối thêm 0,015 trong OKLCH để đạt 10:1 trên nền giấy. Dùng cho mọi thao tác: nút chính, link, ngày được chọn, viền focus. Màu này đủ trầm để không bao giờ tranh với màu cảnh báo. Đó là lý do màu thương hiệu là chàm *sẫm* chứ không phải chàm tươi; chàm tươi (`#6366F1`) cũng là màu quen thuộc nhất của giao diện do AI sinh ra. Khi hover, màu đậm lên thành **#272451**, không nổi lên, không có shadow.
- **Neutral (#F5F2F8): ngọc trai.** Nền trang. Đây là màu thistle pha loãng gần thành trắng (OKLCH hue 312, chroma 0,009), nên cả trang mang chút oải hương của bảng pastel mà không thành "trang màu tím".
- **Surface (#FCFBF8): giấy.** Thẻ, ô nhập, khối trích dẫn. Đây là trắng ngà *ấm*, ngược nhiệt độ với nền ngọc trai, nên một tấm thẻ trông như tờ giấy đặt dưới ánh sáng buổi sáng mát, chứ không như một hộp xám. Không có `#FFFFFF` ở bất cứ đâu.
- **On-surface (#1C1C2C): mực đêm.** Chữ chính. Gần đen nhưng mang hue chạng vạng, nên chữ nằm *trong* trang thay vì in đè lên trang.
- **Secondary (#5A586B): tro oải hương.** Màu duy nhất cho thông tin phụ: tên hãng, số bước, ngày, tên miền nguồn, chữ hướng dẫn. Màu này thay cho hơn 30 chỗ `slate-500` / `slate-600` trong code cũ. Đạt 6,2:1 trên nền ngọc trai nên không bao giờ cần biến thể đậm hơn.
- **Border (#D9D8E0): đường kẻ mảnh.** Chỉ dùng cho đường chia và viền ô nhập, luôn là nét 1px.

**Lớp pastel: mỗi màu một việc**
- **Pastel Petal (#FFC8DD): buổi sáng.** Màu của nhãn "Buổi sáng" (chữ Dawn-ink #8B2F55 trên nền petal, 5,5:1) và của lớp chuyển màu nhẹ ở đầu panel buổi sáng. Thân panel dùng **Dawn (#FFEEF4)**, cùng hue nhưng pha nhạt, để cả panel không thành một mảng hồng chói. Logo dùng bình minh màu đào; giao diện chuyển sang bình minh hồng theo bảng pastel. Hai màu cùng là ánh sáng sớm nên vẫn hợp nhau, nhưng xem lưu ý ở mục "Logo".
- **Baby Pink (#FFAFCC): đánh dấu.** Màu nhấn duy nhất, và chỉ có một việc: **đánh dấu cái vừa khớp hoặc vừa thay đổi**. Đó là hoạt chất được nhận ra trong bảng INCI vừa dán, vùng chữ đang chọn, và một lớp tô nhẹ trên cảnh báo vừa xuất hiện sau lần sửa routine gần nhất. Không bao giờ dùng cho nút, viền, icon hay trang trí, và chiếm dưới 2% màn hình.
- **Thistle (#CDB4DB): nhóm hoạt chất.** Nền của chip AHA, BHA, Retinoid, Niacinamide…, chữ Thistle-ink #442A59 (6,5:1). Thistle cùng họ oải hương với màu thương hiệu, nên nhóm hoạt chất đọc như từ vựng của app chứ không như cảnh báo. Ở chế độ tối, thistle còn làm màu thao tác (xem bên dưới).
- **Icy Blue (#BDE0FE): nền của mức "thông tin".** Badge "Thông tin" là chữ Info-ink #1D4F82 trên nền icy (6,1:1).
- **Sky Blue (#A2D2FF): chữ của mức "thông tin" ở chế độ tối.** Trên nền Info-deep, sky đạt 8,6:1.

**Buổi tối**
- **Dusk (#2F2A55), Dusk-raised (#3F3969), Dusk-line (#534F7A), On-dusk (#F0EFF8), Dusk-mute (#BEB9D9).** Nửa chạng vạng của logo (`#4A4486`), làm tối cho panel buổi tối. Màu này thay cho navy `#1E2448` cũ: hue 274° của navy trông như dark mode slate quen thuộc, còn Dusk nằm ở 286°, đúng trục tím của logo. Dusk-raised là thẻ bước trong panel tối. Dusk-line chia các bước. Dusk-mute là thông tin phụ buổi tối (7,0:1 trên Dusk).

**Mức độ cảnh báo**

Mỗi mức có ba tông: dấu (icon và vạch mức độ), mực (chữ badge, từ 6:1 trên nền nhạt của nó) và nền nhạt (nền badge). Các mức được dựng lại trong OKLCH để bước sáng đồng đều:
- **Avoid (#BD3A2B / #8D251F / #FFE6E1):** đỏ gạch, hue 30°. Nền nhạt avoid ngả cam đất, tách khỏi hồng petal (hue 354°) để một badge "nên tránh" không bao giờ trông như nhãn "buổi sáng".
- **Caution (#BF7101 / #824C11 / #FFEECF):** hổ phách, làm tối tới độ sáng 0,62 để dấu đạt 3:1 khi không phải chữ. Màu cũ `#D08A10` chỉ đạt 2,7:1 trên nền giấy nên không đạt.
- **Info (#3275B4 / #1D4F82 / nền Icy #BDE0FE):** xanh trời, hue 250°, theo icy/sky của bảng pastel. Cách hue chàm của thương hiệu 35° và luôn đi kèm chữ "Thông tin", nên thông tin không bị nhầm với link.
- **Safe (#348757 / #1C5E3D / #E0F5E6):** xanh lá, hue 155°.

Mức độ không bao giờ chỉ thể hiện bằng màu. Mọi badge đều có chữ ("Nên tránh", "Thận trọng", "Thông tin", "An toàn") và icon.

**Lỗi biểu mẫu** (sai mật khẩu, file quá lớn…) dùng **Avoid-ink** kèm icon và một câu giải thích. Không có màu đỏ lỗi riêng: màu này gom `red-700` và `rose-700` cũ làm một. Lỗi biểu mẫu luôn nằm sát ô nhập liên quan nên không gây nhầm với cảnh báo "nên tránh".

**Chế độ tối**

Chế độ tối theo cài đặt của hệ điều hành (`prefers-color-scheme`). Người dùng có thể ghi đè bằng một nút Sáng / Tối / Theo máy, lựa chọn lưu trong `localStorage`. Chế độ tối dùng lại họ chạng vạng, không dùng xám:
- **Night (#11111F):** nền trang. Gần đen nhưng mang hue tím 285°. Không phải navy slate-950.
- **Night-surface (#1D1C2E):** thẻ, ô nhập. **Night-raised (#29273E):** thẻ bước. **Night-border (#3C3954):** đường kẻ.
- **Chữ:** On-dusk (16:1 trên Night) và Dusk-mute cho thông tin phụ (9,9:1).
- **Thao tác:** dùng **Thistle** (#CDB4DB, 9,9:1 trên Night), không dùng Primary, vì chàm sẫm biến mất trên nền tối. Nút chính là chữ Night trên nền thistle; khi hover, nền chuyển sang **Thistle-hover (#DECCEA)**.
- **Mức độ cảnh báo:** đảo lại, thành nền sâu (`*-deep`) với chữ sáng (`*-light`, sky cho info), tất cả đạt khoảng 8,6–8,9:1. Ở chế độ tối, vạch mức độ dùng tông `*-light`.
- **Panel buổi sáng:** chuyển thành **Night-dawn (#381C2A)**, màu hồng mận rất tối, với nhãn chữ petal (10,6:1). Một panel hồng sáng giữa nền tối sẽ chói như bật đèn trong phòng tối.
- **Panel buổi tối:** giữ nguyên Dusk ở cả hai chế độ. Trên nền Night nó vẫn là mảng sáng hơn, nên tự nổi lên mà không cần đổi gì.

Không có màu trung tính nào có R = G = B. Màu trung tính sáng ngả oải hương (hue ≈ 312) hoặc ấm (hue ≈ 80); màu trung tính tối ngả chạng vạng (hue ≈ 285).

## Typography

Hệ thống dùng hai họ chữ, chia theo ý nghĩa chứ không theo trang trí.

**Archivo** dùng cho mọi chữ do SkinWise tự nói: tiêu đề, nội dung, nhãn, nút, số. Đây là chữ grotesque có x-height lớn và có đủ bộ tiếng Việt. Dấu chồng như *ệ, ở, ữ* vẫn đọc rõ ở 13px; đó là lý do nhiều font đẹp khác bị loại. Font đã được tự lưu trong `frontend/src/fonts/` (SIL OFL). Dự phòng: `Archivo, ui-sans-serif, system-ui, "Segoe UI", sans-serif`.

**Newsreader nghiêng** chỉ dùng cho chữ trích nguyên văn từ nguồn: đoạn trích trong thẻ cảnh báo, thẻ myth, thẻ mục tiêu da. Đây là font serif thiết kế cho đọc dài trên màn hình, nên ba dòng trích từ DermNet hay FDA đọc như một trích dẫn thật. Dùng font này ở bất cứ chỗ nào khác sẽ làm loãng tín hiệu duy nhất mà nó có. Dự phòng: `Newsreader, ui-serif, Georgia, serif`. Cũng tự lưu, SIL OFL.

**Thang cỡ chữ** chạy từ 13 đến 34px, tỉ lệ khoảng 1,2, chỉnh tay ở hai đầu:
- **13px là mức tối thiểu.** Code cũ dùng `text-xs` (12px) hơn 100 lần. Ở 12px, dấu thanh trên các nguyên âm có móc (ơ, ư) dính vào nhau, nên trong hệ thống này không có gì nhỏ hơn 13px.
- **Chữ nội dung là 16px, không phải 14px.** Mặc định `text-sm` hiện tại quá nhỏ cho những lời giải thích người dùng đọc một lần, chậm, trên điện thoại.
- **Display dừng ở 34px.** Không có hero; chữ lớn nhất là tiêu đề trang.

**Khoảng cách dòng** giảm khi cỡ chữ tăng: 1,6 cho chữ nội dung, 1,2 cho display. Không bao giờ dưới 1,2, kể cả ở cỡ display, vì chữ hoa tiếng Việt có dấu phía trên (Ố, Ẩ) bị cắt ở khoảng cách dòng 1,0–1,1 thường dùng cho chữ lớn.

**Giãn chữ:** −0,02em ở display, −0,006em ở headline-sm, 0 ở chữ nội dung, +0,01em ở nhãn.

**Chỉ dùng hai độ đậm: 400 và 600.** Code cũ trộn 500, 600 và 700. Bỏ hẳn 500; 700 gộp vào 600. Nếu một thứ cần nhấn mạnh hơn mức 600, nó cần thêm khoảng trống hoặc cỡ lớn hơn.

**Không viết hoa toàn bộ nhãn.** Nhãn chữ hoa nhỏ giãn rộng là kiểu giao diện quen thuộc, nhưng tiếng Việt viết hoa ("NÊN TRÁNH", "BUỔI TỐI") làm dấu chồng thành một dải chật và đọc như đang la hét. Nhãn viết hoa chữ đầu câu, cỡ 13px, độ đậm 600.

**Số** dùng kiểu `numeric` (Archivo với chữ số đều chiều rộng) cho số bước, nút ngày T2–CN và số đếm, để các hàng ngày thẳng cột.

## Layout

Bố cục **ưu tiên điện thoại, một cột**, lề hai bên 16px, làm cho thao tác một tay trước gương. Mọi vùng chạm tối thiểu 44px.

Từ 1024px trở lên, trang routine chuyển sang **bố cục lệch**: routine (hai buổi xếp chồng) chiếm 7/12 cột bên trái, kết quả ("Kết quả kiểm tra") chiếm 5/12 cột bên phải và cố định khi cuộn, để cảnh báo cập nhật ngay cạnh bước gây ra nó. Các trang nội dung (myth, mục tiêu, chi tiết sản phẩm, chính sách) giữ một cột ở mọi độ rộng.

**Độ dài dòng:** lời giải thích và đoạn trích tối đa **68 ký tự** mỗi dòng. Lời giải thích cảnh báo được đọc kỹ, thường đọc hai lần; một đoạn văn không giới hạn độ rộng trên màn hình máy tính sẽ biến nó thành một biểu mẫu.

**Khoảng cách** theo **bước 4px** (4 / 8 / 16 / 24 / 40). Mật độ cố tình không đều:
- **Danh sách thành phần** và **kết quả tìm sản phẩm** dày: đệm hàng 8px, `body-sm`.
- **Thẻ cảnh báo** và **thẻ myth** rộng rãi: đệm 16–24px, `body-md`, đoạn trích được tách riêng.

Các mục liên quan cách nhau 8px; các nhóm khác nhau cách 24–40px. Khoảng trống là công cụ gom nhóm đầu tiên; thêm khung viền là cách cuối cùng.

Chữ canh trái ở mọi nơi. Thứ duy nhất canh giữa là trạng thái trống của khung kết quả.

## Elevation & Depth

Cảm giác "mềm mại có chiều sâu" đến từ **các lớp tông màu**, không từ shadow.

1. **Hai loại giấy.** Ngọc trai (`neutral`, mát) là nền trang; giấy (`surface`, ấm) là bất cứ thứ gì để đọc hoặc gõ vào. Chênh lệch nhiệt độ màu giữa hai lớp làm phần lớn việc của shadow, và không bao giờ bị đục trên màn hình điện thoại. Ở chế độ tối, ba bậc Night → Night-surface → Night-raised làm việc tương tự.
2. **Hai panel buổi là vật thể sâu nhất trong giao diện.** Panel sáng là một lớp Dawn; panel tối là một mảng Dusk, vùng tối lớn duy nhất của app ở chế độ sáng. Trong mỗi panel được phép có một lớp chuyển màu rất nhẹ từ trên xuống: Petal → Dawn, hoặc Dusk-raised → Dusk, trong 120px đầu. **Đây là chỗ duy nhất có gradient ngoài logo.** Không có gradient nào khác, không có chữ gradient, không có hiệu ứng kính mờ.
3. **Đường kẻ mảnh** (`border`, 1px) chia các hàng. Không dùng để quây nội dung thành hộp.

Chỉ có **một shadow**, dành cho thứ thật sự nổi trên trang: dialog, dropdown tìm sản phẩm, menu tài khoản. Ánh sáng chiếu từ trên xuống, shadow ngả màu Dusk, không bao giờ là đen trung tính: `0 1px 2px rgba(47, 42, 85, 0.10), 0 8px 24px rgba(47, 42, 85, 0.12)`. Ở chế độ tối, shadow không thấy được nên vật nổi dùng nền Night-raised với viền Night-border. Thẻ, nút và panel buổi không có shadow. Nền phía sau dialog là Dusk 50%, không làm mờ.

## Shapes

Bo góc **theo thứ bậc**: vật càng lớn và càng tĩnh thì góc càng mềm.

- **`sm` (4px):** ô nhập, badge, tooltip, khối trích dẫn. Là những thứ cần đọc hoặc gõ chính xác.
- **`md` (8px):** nút, thẻ, hàng bước trong một buổi.
- **`lg` (14px):** chỉ hai panel buổi. Đây là hai vật mềm nhất hệ thống vì chúng là hai "ánh sáng", và độ cong của chúng gợi lại vòng tròn của logo.
- **`full`:** nút ngày (T2–CN), đĩa số bước, chip nhóm hoạt chất, nhãn "Buổi sáng", ảnh đại diện. Là những vật nhỏ, tròn, đi theo bộ. Không thứ gì lớn hơn 36px có dạng viên thuốc.

Hệ thống này gom sáu kiểu bo góc trong code cũ: `rounded` và `rounded-md` thành `sm`; `rounded-lg` và `rounded-xl` thành `md`; `rounded-2xl` thành `lg` và **chỉ** dùng cho panel buổi.

**Viền:** 1px `border` khi nghỉ. Focus là viền 2px `primary`, cách 2px, đạt 3:1 trên ngọc trai, giấy và Dawn. Trên panel Dusk và ở chế độ tối, focus đổi thành viền 2px **thistle** (7,0:1 trên Dusk). Định dạng này không có token `borderColor`, nên các giá trị trên là bắt buộc.

**Icon:** icon nét 1,5px, cỡ 20px cạnh chữ nội dung và 16px cạnh nhãn. Bốn icon mức độ là icon tô đặc duy nhất.

## Components

**Panel buổi.** Đây là trái tim của app.
- "Buổi sáng" là panel Dawn, nhãn là viên petal với chữ Dawn-ink.
- "Buổi tối" là panel Dusk, chữ On-dusk, thông tin phụ Dusk-mute.
- Mỗi sản phẩm là một hàng bước: đĩa số (`step-number`), tên sản phẩm (`body-md`/600), tên hãng (`caption`), các chip nhóm hoạt chất. Trong panel Dusk, bước nằm trên `session-evening-step`.
- **Không bao giờ đặt Primary trên Dusk.** Hai màu cùng là chạng vạng và gần như cùng độ sáng, nên nút Primary trong panel tối sẽ biến mất. Thao tác trong panel tối (thêm sản phẩm, đổi thứ tự, xoá) dùng chữ On-dusk trên Dusk-raised, viền 1px Dusk-line, focus bằng viền thistle.

**Nút ngày.** Bảy đĩa, T2 đến CN, kiểu `numeric`. Ngày được chọn: nền Primary (chế độ tối: thistle). Ngày không chọn: nền giấy, viền 1px `border`, chữ Secondary (nền ngọc trai sẽ trùng với nền trang). Ngày được chọn không chỉ thể hiện bằng màu mà còn có dấu tích, cho người dùng trình đọc màn hình và người mù màu.

**Thẻ cảnh báo** có thứ tự cố định:
1. vạch mức độ 4px ở mép trái, màu dấu của mức đó;
2. badge (chữ + icon);
3. tiêu đề (`headline-sm`);
4. áp dụng cho sản phẩm nào, ngày/buổi nào (`caption`, Secondary);
5. lời giải thích (`body-md`, tối đa 68 ký tự/dòng);
6. khối nguồn.

Chữ của `title_vi` và `explanation_vi` hiển thị nguyên văn; thiết kế không bao giờ diễn đạt lại hay cắt bớt. Khi thu gọn, chữ chỉ bị ẩn bằng CSS.

**Khối nguồn (`source-quote`).** Đoạn trích nguyên văn bằng Newsreader nghiêng trên nền giấy, có vạch `border` 2px bên trái. Bên dưới, kiểu `caption`/Secondary: tên nguồn, link tới trang, ngày duyệt. Khối này là bằng chứng nhìn thấy được của nguyên tắc "không có nguồn thì không có cảnh báo", và không bao giờ bị bỏ để tiết kiệm chỗ.

**Thẻ myth** dùng cùng cấu trúc, với badge Safe hoặc Info ("Sự thật hay myth").

**Kết quả trống** ("Chưa thấy cảnh báo"): chữ `body-md` màu Secondary, canh giữa. Luôn hiện câu `notice_vi` ("không có cảnh báo không có nghĩa là an toàn"), cùng cỡ với chữ xung quanh, không bao giờ nhỏ hơn.

**Nút.**
- Nút chính: nền Primary, chữ giấy, kiểu `label`, bo 8px, cao 44px. Ở chế độ tối: nền thistle, chữ Night.
- Nút phụ: nền giấy, chữ Primary, viền 1px `border`.
- Không có kiểu nút thứ ba; thao tác thứ ba là link chữ.
- Thao tác phá huỷ (xoá tài khoản, xoá bài) dùng kiểu nút phụ với chữ Avoid-ink, và luôn có dialog xác nhận.
- Hover chỉ đổi màu nền.

**Ô nhập.** Nền giấy, viền 1px `border`, bo 4px, chữ `body-md` đủ 16px (16px cũng ngăn iOS tự phóng to khi chạm vào ô). Ô dán thành phần INCI dùng `body-sm` với khoảng cách dòng 1,7, vì người dùng so từng dòng với bao bì. Khi có lỗi, viền và câu báo lỗi chuyển sang Avoid-ink, kèm icon.

**Chip nhóm hoạt chất (`chip-active`).** Viên thistle, chữ Thistle-ink, kiểu `label`. Chỉ dùng cho nhóm hoạt chất, không dùng làm thẻ hay bộ lọc chung. Giữ nguyên ở cả hai chế độ.

**Đánh dấu (`highlight`).** Nền baby pink phía sau tên hoạt chất được nhận ra trong bảng INCI đã phân tích, và một lớp tô baby pink 600ms trên thẻ cảnh báo vừa xuất hiện hoặc vừa đổi sau lần sửa gần nhất. Lớp tô nhạt dần về màu giấy.

**Tooltip.** Nền On-surface, chữ giấy: chỗ đảo màu duy nhất ở phía sáng của app.

**Chuyển động.** Chuyển động chỉ để xác nhận cái vừa thay đổi, không để trang trí. Có ba thời lượng:
- **120ms:** đổi trạng thái (bật/tắt, hover).
- **200ms ease-out:** mở/thu thẻ, mở dropdown tìm kiếm.
- **600ms:** lớp tô baby pink báo thay đổi.

**Những thứ không bao giờ chuyển động:** vị trí cuộn, chữ cảnh báo, đoạn trích, việc sắp xếp lại cảnh báo. Tải trang chỉ có fade-up nhẹ theo khối (`ANIMATION.md`). Không có gì hiện dần khi cuộn. Mọi chuyển động tắt khi người dùng bật `prefers-reduced-motion`.

**Logo.**
- File logo nằm trong `frontend/src/assets/brand/`. Nửa bình minh của logo là gradient hồng `#FDE1ED → #FFAFCC` (baby pink), khớp với panel buổi sáng; nửa chạng vạng giữ nguyên.
- Dùng `skinwise-logo.svg` trên nền sáng và `skinwise-logo-dark.svg` trên Dusk hoặc ở chế độ tối.
- Từ 32px trở xuống chỉ dùng icon (`skinwise-icon*.svg`).
- Gradient và độ bóng thuộc về logo, không phải phong cách để chép vào giao diện.
- Không dùng logo kèm tagline cũ ("routine skincare có nguồn"). Tagline "Biến sự hỗn loạn thành sự rõ ràng." đặt bằng chữ HTML (Archivo) cạnh hoặc dưới logo.

## Do's and Don'ts

- **Nên** chỉ dùng màu đậm cho mức độ cảnh báo. Nếu một yếu tố mới "cần màu", nó cần độ đậm, cỡ chữ hoặc khoảng trống.
- **Không** dùng pastel làm màu chữ trên nền sáng. Pastel là nền; chữ trên pastel luôn là mực tương ứng (Dawn-ink, Thistle-ink, Info-ink, On-surface).
- **Không** dùng baby pink cho việc gì ngoài "vừa khớp / vừa đổi": không làm nút, viền, icon hay màu thương hiệu thứ hai. Ý nghĩa của nó phụ thuộc vào việc nó hiếm.
- **Nên** đặt mọi đoạn trích nguyên văn từ nguồn bằng Newsreader nghiêng, và **không** đặt bất cứ thứ gì khác bằng font đó: không tiêu đề, không trích dẫn do chính app viết, không tagline.
- **Không** diễn đạt lại, rút ngắn hay cắt `title_vi`, `explanation_vi` hoặc đoạn trích cho vừa bố cục. Hãy đổi bố cục.
- **Nên** thể hiện mức độ bằng chữ và icon, không chỉ bằng màu.
- **Không** thêm gradient, kính mờ hay hiệu ứng phát sáng ngoài logo và lớp chuyển màu nhẹ ở đầu hai panel buổi.
- **Không** đặt shadow lên thẻ, nút hay panel. Shadow ngả màu Dusk duy nhất chỉ dành cho dialog, dropdown và menu.
- **Không** đặt Primary lên Dusk, và không dùng Primary ở chế độ tối. Trên nền tối, thao tác dùng thistle.
- **Không** dùng class màu có sẵn của Tailwind (`slate-*`, `red-*`, `rose-*`, `emerald-*`, `amber-*`). Mọi màu lấy từ token trong `frontend/src/index.css`.
- **Không** dùng `#FFFFFF` hoặc `#000000`. Giấy, Night và mực đêm là hai đầu mút.
- **Không** viết hoa toàn bộ chữ tiếng Việt, không đặt chữ dưới 13px, không để khoảng cách dòng dưới 1,2.
- **Nên** chỉ dùng độ đậm 400 và 600. Không 500, không 700.
- **Nên** để bo góc `lg` (14px) chỉ cho hai panel buổi. Một tấm thẻ bo 14px là thẻ đang giả làm panel buổi.
- **Không** tải font, icon hay ảnh từ máy chủ khác. CSP chỉ cho phép `'self'`, và font được tự lưu là có chủ đích.
- **Không** dùng chữ "trị" hay bất kỳ câu nào hứa hẹn kết quả. Thiết kế không được trông như quảng cáo, và lời văn cũng vậy.
