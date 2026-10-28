import { POLICY_VERSION } from '../account'

/**
 * The privacy policy agreed to on the sign-in form (plan/h-accounts.md §8). A draft: it has not
 * been reviewed by a lawyer, and accounts are not open to real users yet. Changing what it says
 * means a new POLICY_VERSION here and in backend/app/accounts.py, so users are asked again.
 */
export function PolicyText() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
      <p className="rounded-xl bg-caution-soft p-3 text-caution-ink">
        Bản nháp (phiên bản {POLICY_VERSION}), chưa được người có chuyên môn pháp lý duyệt. SkinWise chưa mở tài khoản
        cho người dùng thật.
      </p>
      <Section title="Ai giữ dữ liệu của bạn">
        Người làm dự án SkinWise (cá nhân, trong khuôn khổ Nhà Cộng Đồng) là bên kiểm soát dữ liệu. Cách liên hệ sẽ được
        ghi ở đây trước khi mở tài khoản cho người dùng.
      </Section>
      <Section title="SkinWise lưu gì">
        Địa chỉ email của bạn; routine của bạn (sản phẩm, bảng thành phần bạn tự dán, lịch dùng); thời điểm tạo tài
        khoản, đăng nhập và đồng bộ. SkinWise không hỏi tên, số điện thoại hay ngày sinh. Địa chỉ IP chỉ được giữ trong
        bộ nhớ máy chủ tối đa 1 giờ để giới hạn số lần gửi link đăng nhập.
      </Section>
      <Section title="Để làm gì">
        Để bạn đăng nhập, và để dùng cùng một routine trên nhiều thiết bị. Không dùng cho quảng cáo, không bán, không
        chia sẻ cho ai ngoài các bên xử lý nêu dưới đây.
      </Section>
      <Section title="Lưu ý về sức khoẻ">
        Routine có thể cho thấy bạn đang dùng thuốc (ví dụ thuốc trị mụn kê đơn). Chỉ thêm những gì bạn muốn lưu.
      </Section>
      <Section title="Lưu ở đâu">
        Trên máy chủ đặt tại Việt Nam. Bên xử lý: nhà cung cấp máy chủ và dịch vụ gửi email, sẽ được nêu tên trước khi
        mở tài khoản. Giao diện hiện tải font chữ từ Google Fonts; font sẽ được lưu trên máy chủ của SkinWise trước khi mở.
      </Section>
      <Section title="Giữ trong bao lâu">
        Đến khi bạn xoá tài khoản. Tài khoản không dùng 24 tháng sẽ được báo qua email trước 30 ngày rồi xoá. Bản sao
        lưu được giữ tối đa 30 ngày.
      </Section>
      <Section title="Quyền của bạn">
        Xem và sửa routine ngay trong app; tải về toàn bộ dữ liệu SkinWise giữ về bạn; xoá tài khoản bất cứ lúc nào
        trong trang Tài khoản. Rút lại đồng ý chính là xoá tài khoản, vì SkinWise chỉ dùng dữ liệu cho một mục đích. Bạn
        có quyền khiếu nại theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15.
      </Section>
      <Section title="Khi có sự cố">
        Nếu dữ liệu bị lộ, SkinWise báo cơ quan chức năng trong 72 giờ và báo cho bạn.
      </Section>
      <Section title="Cookie">
        Một cookie đăng nhập (skinwise_session), hết hạn sau 30 ngày không dùng. Không có cookie quảng cáo hay thống kê.
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <section>
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-0.5">{children}</p>
    </section>
  )
}
