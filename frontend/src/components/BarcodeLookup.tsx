import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError, type BarcodeProduct } from '../api'

const LICENSE_URL = 'https://opendatacommons.org/licenses/odbl/1-0/'
const CONTRIBUTE_URL = 'https://world.openbeautyfacts.org/contribute'

// The Barcode Detection API (Chrome on Android, macOS and ChromeOS; not Safari or Firefox).
// TypeScript's DOM types do not have it yet.
type BarcodeDetectorClass = {
  new (options: { formats: string[] }): { detect(image: ImageBitmapSource): Promise<{ rawValue: string }[]> }
  getSupportedFormats(): Promise<string[]>
}
// Formats whose check digit the server verifies (UPC-E is not one).
const FORMATS = ['ean_13', 'ean_8', 'upc_a']

const detectorClass = () => (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector

/** Whether this browser can read a barcode from a photo; typing the digits always works. */
function useCanScan(): boolean {
  const [canScan, setCanScan] = useState(false)
  useEffect(() => {
    detectorClass()
      ?.getSupportedFormats()
      .then(
        (formats) => setCanScan(FORMATS.some((f) => formats.includes(f))),
        () => {},
      )
  }, [])
  return canScan
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; product: BarcodeProduct }
  | { kind: 'invalid' }
  | { kind: 'not_found'; code: string }
  | { kind: 'unreadable' } // no barcode found in the photo
  | { kind: 'error' }

type Props = {
  /** Take the product's ingredient list to the paste tab, to compare and add. */
  onUse: (product: BarcodeProduct) => void
  onPaste: () => void
}

/** Look a product up on Open Beauty Facts by the digits under its barcode, or a photo of it. */
export function BarcodeLookup({ onUse, onPaste }: Props) {
  const [code, setCode] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const canScan = useCanScan()
  const photo = useRef<HTMLInputElement>(null)
  const latest = useRef(0) // a slow answer must not replace a newer one

  const lookup = (value: string) => {
    const digits = value.replace(/[\s-]/g, '')
    if (!/^(\d{8}|\d{12,14})$/.test(digits)) {
      setState({ kind: 'invalid' })
      return
    }
    const id = ++latest.current
    setState({ kind: 'loading' })
    api.barcode(digits).then(
      (product) => id === latest.current && setState({ kind: 'found', product }),
      (e) => {
        if (id !== latest.current) return
        const status = e instanceof ApiError ? e.status : 0
        setState(
          status === 404 ? { kind: 'not_found', code: digits } : status === 422 ? { kind: 'invalid' } : { kind: 'error' },
        )
      },
    )
  }

  const scan = async (file: File) => {
    const Detector = detectorClass()
    if (!Detector) return
    const id = ++latest.current
    setState({ kind: 'loading' })
    try {
      const bitmap = await createImageBitmap(file)
      const found = await new Detector({ formats: FORMATS }).detect(bitmap)
      bitmap.close()
      if (id !== latest.current) return
      const value = found[0]?.rawValue
      if (!value) {
        setState({ kind: 'unreadable' })
        return
      }
      setCode(value)
      lookup(value)
    } catch {
      if (id === latest.current) setState({ kind: 'unreadable' })
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    lookup(code)
  }

  return (
    <div className="mt-4 space-y-3">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Dãy số dưới mã vạch"
          aria-label="Mã vạch"
          data-autofocus
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.9375rem] tabular-nums placeholder:text-ink-mute/80 focus:border-link focus:ring-2 focus:ring-link/20 focus:outline-none focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={!code.trim() || state.kind === 'loading'}
          className="shrink-0 rounded-full bg-ink px-4 text-sm font-medium text-white hover:bg-link disabled:opacity-40"
        >
          Tra cứu
        </button>
      </form>
      {canScan && (
        <>
          <button
            onClick={() => photo.current?.click()}
            disabled={state.kind === 'loading'}
            className="rounded-full px-4 py-2 text-sm font-medium text-ink ring-1 ring-ink hover:bg-paper disabled:opacity-40"
          >
            Chụp mã vạch
          </button>
          <input
            ref={photo}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = '' // the same photo can be picked again
              if (file) scan(file)
            }}
          />
        </>
      )}
      <p className="text-xs leading-relaxed text-ink-mute">
        Tra trên Open Beauty Facts, cơ sở dữ liệu mỹ phẩm do cộng đồng đóng góp. Hiện có rất ít sản phẩm bán ở Việt
        Nam.
      </p>

      <div aria-live="polite">
        {state.kind === 'loading' && <p className="text-sm text-ink-mute">Đang tra cứu…</p>}
        {state.kind === 'invalid' && (
          <p className="text-sm text-avoid-ink">
            Mã vạch không đúng: mã có 8, 12, 13 hoặc 14 chữ số, và chữ số cuối phải khớp với các số trước. Hãy gõ lại.
          </p>
        )}
        {state.kind === 'unreadable' && (
          <p className="text-sm text-avoid-ink">
            Không đọc được mã vạch trong ảnh. Hãy chụp gần, đủ sáng và rõ nét, hoặc gõ dãy số dưới mã vạch.
          </p>
        )}
        {state.kind === 'error' && (
          <p className="text-sm text-avoid-ink">
            Không kết nối được Open Beauty Facts. Hãy thử lại sau, hoặc dán bảng thành phần in trên bao bì.
          </p>
        )}
        {state.kind === 'not_found' && (
          <Missing onPaste={onPaste}>Open Beauty Facts chưa có sản phẩm mã {state.code}.</Missing>
        )}
        {state.kind === 'found' && !state.product.ingredients_text && (
          <Missing onPaste={onPaste}>
            Open Beauty Facts có “{state.product.name ?? `sản phẩm mã ${state.product.barcode}`}” nhưng chưa có bảng
            thành phần.
          </Missing>
        )}
        {state.kind === 'found' && state.product.ingredients_text && (
          <Found product={state.product} onUse={() => onUse(state.product)} />
        )}
      </div>
    </div>
  )
}

function Found({ product, onUse }: { product: BarcodeProduct; onUse: () => void }) {
  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-line">
      <p className="text-xs text-ink-mute">{product.brand ?? 'Không ghi hãng'}</p>
      <p className="text-sm leading-snug font-medium">{product.name ?? `Sản phẩm mã ${product.barcode}`}</p>
      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-ink-soft">{product.ingredients_text}</p>
      <button
        onClick={onUse}
        className="mt-3 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-link"
      >
        So với bao bì và thêm
      </button>
      <p className="mt-3 text-xs text-ink-mute">
        <OpenBeautyFactsCredit url={product.source_url} />
      </p>
    </div>
  )
}

function Missing({ children, onPaste }: { children: ReactNode; onPaste: () => void }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink-soft">
      <p>
        {children} Bạn có thể{' '}
        <button onClick={onPaste} className="font-medium text-link underline underline-offset-2">
          dán bảng thành phần
        </button>{' '}
        in trên bao bì.
      </p>
      <p className="text-xs text-ink-mute">
        Muốn người khác cũng tra được sản phẩm này? Bạn có thể{' '}
        <a href={CONTRIBUTE_URL} target="_blank" rel="noreferrer" className="text-link underline-offset-2 hover:underline">
          đóng góp lên Open Beauty Facts
        </a>
        .
      </p>
    </div>
  )
}

/** The notice the ODbL asks for wherever Open Beauty Facts data is shown. */
export function OpenBeautyFactsCredit({ url }: { url: string }) {
  return (
    <>
      Dữ liệu từ{' '}
      <a href={url} target="_blank" rel="noreferrer" className="text-link underline-offset-2 hover:underline">
        Open Beauty Facts
      </a>
      , giấy phép{' '}
      <a href={LICENSE_URL} target="_blank" rel="noreferrer" className="text-link underline-offset-2 hover:underline">
        ODbL
      </a>
      .
    </>
  )
}
