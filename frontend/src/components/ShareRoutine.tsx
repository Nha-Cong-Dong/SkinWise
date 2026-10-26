import { useRef, useState } from 'react'
import { SESSION_LABELS } from '../labels'
import { sessionEntries, type Routine, type RoutineActions } from '../routine'
import { ImportError, downloadFile, makeLink, readFile, restore } from '../share'
import { DataNote } from './Notice'

const primary = 'rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-link disabled:opacity-40'
const secondary = 'rounded-full px-4 py-2 text-sm font-medium text-ink ring-1 ring-ink hover:bg-paper disabled:opacity-40'
// Messaging apps may cut links longer than this; a file always works.
const LONG_LINK = 2000

/** Content of the "save and share" dialog: download or open a routine file, or make a link. */
export function ShareRoutine({ actions, onDone }: { actions: RoutineActions; onDone: () => void }) {
  const { routine } = actions
  const empty = routine.products.length === 0
  const fileInput = useRef<HTMLInputElement>(null)
  const [opening, setOpening] = useState<{ routine: Routine; dropped: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const openFile = async (file: File) => {
    setError(null)
    setBusy(true)
    try {
      setOpening(await restore(await readFile(file)))
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'Không mở được routine.')
    } finally {
      setBusy(false)
    }
  }

  if (opening) {
    return (
      <ReplaceConfirm
        incoming={opening}
        current={routine}
        onAccept={() => {
          actions.replace(opening.routine)
          onDone()
        }}
        onCancel={() => setOpening(null)}
      />
    )
  }

  return (
    <div className="space-y-6 text-sm leading-relaxed text-ink-soft">
      <section>
        <h3 className="font-semibold text-ink">Lưu routine về máy</h3>
        <p className="mt-1">
          File chứa sản phẩm, thứ tự các bước và ngày dùng, kể cả bảng thành phần bạn tự dán. Mở lại trên máy khác bằng
          nút “Mở file routine”.
        </p>
        <button onClick={() => downloadFile(routine)} disabled={empty} className={`mt-2 ${primary}`}>
          Tải file routine
        </button>
      </section>

      <section>
        <h3 className="font-semibold text-ink">Mở routine từ file</h3>
        <p className="mt-1">Routine trong file sẽ thay routine hiện tại; bạn được hỏi lại trước khi thay.</p>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // the same file can be picked again
            if (file) void openFile(file)
          }}
        />
        <button onClick={() => fileInput.current?.click()} disabled={busy} className={`mt-2 ${secondary}`}>
          {busy ? 'Đang mở…' : 'Mở file routine'}
        </button>
        {error && <p className="mt-2 text-avoid-ink">{error}</p>}
      </section>

      <section>
        <h3 className="font-semibold text-ink">Link chia sẻ</h3>
        <p className="mt-1">
          Ai có link đều xem được routine này, kể cả bảng thành phần bạn tự dán. SkinWise không lưu link: routine nằm
          trong phần sau dấu “#”, phần mà trình duyệt không gửi lên máy chủ.
        </p>
        {link === null ? (
          <button
            onClick={() => makeLink(routine).then(setLink, () => setError('Không tạo được link.'))}
            disabled={empty}
            className={`mt-2 ${secondary}`}
          >
            Tạo link
          </button>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                aria-label="Link chia sẻ routine"
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink"
              />
              <button
                onClick={() =>
                  navigator.clipboard?.writeText(link).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  )
                }
                className={primary}
              >
                {copied ? 'Đã chép' : 'Chép link'}
              </button>
            </div>
            {link.length > LONG_LINK && (
              <p className="text-xs text-ink-mute">
                Link dài vì có bảng thành phần tự dán; một số ứng dụng nhắn tin có thể cắt bớt. Nếu người nhận không mở
                được, hãy gửi file.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

/** Asks before an opened file or link replaces the routine: nothing is overwritten silently. */
export function ReplaceConfirm({
  incoming,
  current,
  onAccept,
  onCancel,
}: {
  incoming: { routine: Routine; dropped: string[] }
  current: Routine
  onAccept: () => void
  onCancel: () => void
}) {
  const { routine, dropped } = incoming
  const names = routine.products.map((p) => p.name)
  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
      <div>
        <p className="font-semibold text-ink">
          {routine.products.length} sản phẩm ·{' '}
          {(['AM', 'PM'] as const)
            .map((s) => `${SESSION_LABELS[s]}: ${sessionEntries(routine, s).length} bước`)
            .join(' · ')}
        </p>
        {names.length > 0 && (
          <p className="mt-1">
            {names.slice(0, 8).join(', ')}
            {names.length > 8 && `, và ${names.length - 8} sản phẩm khác`}
          </p>
        )}
      </div>
      {dropped.length > 0 && (
        <DataNote title="Có sản phẩm không còn trong danh sách">
          {dropped.join(', ')} không còn trong danh sách sản phẩm của SkinWise nên không được mở, cùng các bước dùng
          sản phẩm đó.
        </DataNote>
      )}
      {current.products.length > 0 && (
        <DataNote title="Routine hiện tại sẽ bị thay">
          Routine bạn đang có ({current.products.length} sản phẩm) sẽ được thay bằng routine này. Muốn giữ lại thì{' '}
          <button onClick={() => downloadFile(current)} className="font-medium text-link underline underline-offset-2">
            tải file routine hiện tại
          </button>{' '}
          trước.
        </DataNote>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={onAccept} className={primary}>
          Dùng routine này
        </button>
        <button onClick={onCancel} className={secondary}>
          {current.products.length > 0 ? 'Giữ routine của tôi' : 'Huỷ'}
        </button>
      </div>
    </div>
  )
}
