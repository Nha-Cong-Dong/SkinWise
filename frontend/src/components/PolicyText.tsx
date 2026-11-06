import { POLICY_VERSION } from '../account'

/**
 * The privacy policy agreed to on the sign-in form (plan/h-accounts.md §8). A draft: it has not
 * been reviewed by a lawyer, and accounts are not open to real users yet. Changing what it says
 * means a new POLICY_VERSION here and in backend/app/accounts.py. The version is recorded only
 * when an account is created: users who agreed to an older version are not asked again yet.
 * That has to be built before accounts open to the public.
 */
export function PolicyText() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
      <p className="rounded-md bg-caution-soft p-3 text-caution-ink">
        Bản nháp (phiên bản {POLICY_VERSION}), chưa được người có chuyên môn pháp lý duyệt. SkinWise chưa mở tài khoản
        cho người dùng thật.
      </p>
      <Section title="Ai giữ dữ liệu của bạn">
        Người làm dự án SkinWise (cá nhân, trong khuôn khổ Nhà Cộng Đồng) là bên kiểm soát dữ liệu. Cách liên hệ sẽ được
        ghi ở đây trước khi mở tài khoản cho người dùng.
      </Section>
      <Section title="SkinWise lưu gì">
        Địa chỉ email của bạn và mật khẩu đã băm (không lưu mật khẩu gốc); routine của bạn (sản phẩm, bảng thành phần
        bạn tự dán, lịch dùng); thời điểm tạo tài khoản, đăng nhập và đồng bộ. Nếu bạn dùng review cộng đồng: biệt danh
        và loại da bạn chọn (không bắt buộc); bài review của bạn (tiêu đề, nội dung, điểm, loại da, sản phẩm gắn kèm,
        routine nếu bạn đính kèm); ảnh bạn tải lên, được chuyển sang định dạng WebP và bỏ hết thông tin đi kèm ảnh (vị
        trí GPS, thiết bị, thời gian chụp); chú thích ảnh; bình luận; bài bạn thích, bài bạn lưu; báo cáo bạn gửi. SkinWise
        không hỏi tên, số điện thoại hay ngày sinh. Địa chỉ IP được giữ trong bộ nhớ máy chủ để giới hạn số lần gửi link
        qua email, đăng nhập sai và đọc ảnh nhãn, và được xoá khỏi bộ nhớ khoảng 1 giờ sau lần cuối được tính. Máy chủ web cũng giữ địa chỉ IP trong bộ nhớ (không ghi ra
        đĩa) để giới hạn số lần kiểm tra routine và phân tích thành phần. Nhật ký
        máy chủ (nhật ký web và nhật ký hệ thống) cũng ghi địa chỉ IP cùng trang được truy cập, và được giữ tối đa 14
        ngày.
      </Section>
      <Section title="Ai thấy được gì">
        Routine trong tài khoản chỉ bạn thấy. Trong review cộng đồng, người dùng khác đã đăng nhập thấy biệt danh và
        loại da trong hồ sơ của bạn, bài review (cả ảnh, chú thích, sản phẩm và routine đính kèm) và bình luận của bạn,
        cùng số lượt thích của mỗi bài; họ không thấy ai đã thích, đã lưu hay đã báo cáo. Email của bạn không bao giờ hiện
        cho người dùng khác. Người duyệt của SkinWise xem được bài, bình luận và báo cáo để gỡ nội dung vi phạm; họ thấy
        lý do và ghi chú kèm báo cáo, không thấy ai đã báo cáo.
      </Section>
      <Section title="Để làm gì">
        Để bạn đăng nhập, để dùng cùng một routine trên nhiều thiết bị, và để bạn đăng, đọc review cộng đồng. Không dùng
        cho quảng cáo, không bán, không chia sẻ cho ai ngoài các bên xử lý nêu dưới đây.
      </Section>
      <Section title="Lưu ý về sức khoẻ">
        Routine có thể cho thấy bạn đang dùng thuốc (ví dụ thuốc trị mụn kê đơn). Loại da, routine và nội dung bài review
        cũng có thể nói về tình trạng da của bạn, và những gì đăng trong review cộng đồng thì người dùng khác đọc được.
        Chỉ thêm những gì bạn muốn lưu hoặc muốn chia sẻ.
      </Section>
      <Section title="Lưu ở đâu">
        Trên máy chủ đặt tại Việt Nam. Bên xử lý: nhà cung cấp máy chủ và dịch vụ gửi email, sẽ được nêu tên trước khi
        mở tài khoản. Giao diện không tải gì từ máy chủ khác (font chữ cũng nằm trên máy chủ của SkinWise).
      </Section>
      <Section title="Đọc thành phần từ ảnh nhãn">
        Chỉ khi bạn chủ động chọn hoặc dán ảnh ở mục “Đọc từ ảnh”, ảnh đó được gửi tới dịch vụ AI của Anthropic (Mỹ),
        trực tiếp hoặc qua một cổng API trung gian, để chép chữ in trên nhãn. Như vậy ảnh được chuyển ra nước ngoài. SkinWise không lưu ảnh này và
        không ghi ảnh vào nhật ký máy chủ; chữ chép được chỉ được đưa vào ô “Dán thành phần” để bạn so với bao bì. Đừng
        chụp kèm thông tin cá nhân (khuôn mặt, giấy tờ, đơn thuốc) trong ảnh.
      </Section>
      <Section title="Giữ trong bao lâu">
        Đến khi bạn xoá tài khoản. Tài khoản không xác thực email được xoá sau khoảng 7 ngày kể từ khi đăng ký (lâu hơn
        một chút nếu bạn vừa xin gửi lại link xác thực). Bản sao lưu cơ sở dữ liệu và ảnh được giữ tối đa 30 ngày; trong
        thời gian đó, bản sao lưu có thể vẫn còn email và dữ liệu của tài khoản đã xoá.
      </Section>
      <Section title="Quyền của bạn">
        Xem và sửa routine ngay trong app; tải về toàn bộ dữ liệu SkinWise giữ về bạn; xoá tài khoản bất cứ lúc nào
        trong trang Tài khoản; xoá tài khoản thì xoá cả hồ sơ, bài review, ảnh, bình luận, lượt thích, bài đã lưu và báo cáo
        của bạn. Bạn cũng xoá được từng bài và bình luận của mình. Rút lại đồng ý chính là xoá tài khoản. Bạn có quyền
        khiếu nại theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15.
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
