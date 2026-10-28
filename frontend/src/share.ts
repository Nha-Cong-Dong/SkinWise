// Moving a routine between devices without accounts: a JSON file, or a link that carries the
// routine after "#". The browser never sends that part of a link to the server, so SkinWise
// stores nothing.

import { useEffect, useState } from 'react'
import { api, type Session } from './api'
import { newId, productKeyFor, type Entry, type MyProduct, type Routine } from './routine'

export const FORMAT = 'skinwise-routine'
const VERSION = 1
const LINK_KEY = '#routine='

// The limits of POST /routine/check (backend/app/schemas.py), so an opened routine can be checked.
const MAX_PRODUCTS = 50
const MAX_ENTRIES = 200
const MAX_INCI = 10_000
const MAX_NAME = 200
const MAX_KEY = 100
const MAX_LINK = 400_000 // characters after "#routine="
const MAX_UNPACKED = 1_000_000 // bytes: a link must not unpack into anything bigger

/**
 * What leaves the device: product keys, step order, days, the user's own names and pasted
 * lists. Brands, active groups and notices are fetched again on opening (restore), so an
 * edited file cannot make the app show wrong groups.
 */
export type PortableRoutine = {
  format: typeof FORMAT
  version: typeof VERSION
  products: { key: string; name: string; productId?: number; inci?: string }[]
  entries: { productKey: string; session: Session; days: number[] }[]
}

/** A file or link that cannot be opened; the message is shown to the user as is. */
export class ImportError extends Error {}

export function toPortable(routine: Routine): PortableRoutine {
  return {
    format: FORMAT,
    version: VERSION,
    products: routine.products.map((p) =>
      p.productId !== null ? { key: p.key, name: p.name, productId: p.productId } : { key: p.key, name: p.name, inci: p.inci ?? '' },
    ),
    entries: routine.entries.map((e) => ({ productKey: e.productKey, session: e.session, days: e.days })),
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Check data from a file or link before anything uses it. */
export function parsePortable(value: unknown): PortableRoutine {
  const fail = (why: string): never => {
    throw new ImportError(`Không mở được routine: ${why}.`)
  }
  if (!isRecord(value) || value.format !== FORMAT) fail('đây không phải file routine của SkinWise')
  const data = value as Record<string, unknown>
  if (typeof data.version !== 'number' || data.version > VERSION) fail('file được tạo bởi phiên bản SkinWise mới hơn')
  if (!Array.isArray(data.products) || !Array.isArray(data.entries)) fail('thiếu danh sách sản phẩm hoặc lịch dùng')
  const rawProducts = data.products as unknown[]
  const rawEntries = data.entries as unknown[]
  if (rawProducts.length > MAX_PRODUCTS) fail(`có hơn ${MAX_PRODUCTS} sản phẩm`)
  if (rawEntries.length > MAX_ENTRIES) fail(`có hơn ${MAX_ENTRIES} bước`)

  const keys = new Set<string>()
  const products = rawProducts.map((p) => {
    if (!isRecord(p) || typeof p.key !== 'string' || !p.key || p.key.length > MAX_KEY || keys.has(p.key)) {
      return fail('một sản phẩm không có mã hợp lệ')
    }
    keys.add(p.key)
    const name = typeof p.name === 'string' ? p.name.trim().slice(0, MAX_NAME) : ''
    const seeded = Number.isInteger(p.productId) && (p.productId as number) > 0
    const inci = typeof p.inci === 'string' ? p.inci.trim() : ''
    if (seeded === Boolean(inci)) fail('mỗi sản phẩm phải là sản phẩm có sẵn hoặc bảng thành phần tự dán')
    if (inci.length > MAX_INCI) fail(`một bảng thành phần dài hơn ${MAX_INCI.toLocaleString('vi-VN')} ký tự`)
    return seeded ? { key: p.key, name, productId: p.productId as number } : { key: p.key, name, inci }
  })

  const entries = rawEntries.map((e) => {
    if (!isRecord(e) || typeof e.productKey !== 'string' || !keys.has(e.productKey)) {
      return fail('một bước trỏ tới sản phẩm không có trong file')
    }
    if (e.session !== 'AM' && e.session !== 'PM') return fail('một bước không ghi buổi sáng hay tối')
    if (!Array.isArray(e.days) || !e.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      return fail('một bước có ngày dùng không hợp lệ')
    }
    return { productKey: e.productKey, session: e.session as Session, days: [...new Set(e.days as number[])].sort((a, b) => a - b) }
  })
  return { format: FORMAT, version: VERSION, products, entries }
}

/**
 * Rebuild a routine with brands, groups and notices from the server. Seeded products the
 * server no longer has are left out (with their steps) and named in `dropped`.
 */
export async function restore(portable: PortableRoutine): Promise<{ routine: Routine; dropped: string[] }> {
  const keyFor = new Map<string, string>() // key in the file -> key in the routine
  const dropped: string[] = []
  const restored = await Promise.all(
    portable.products.map(async (p): Promise<MyProduct | null> => {
      try {
        if (p.productId !== undefined) {
          const detail = await api.product(p.productId)
          keyFor.set(p.key, productKeyFor(detail.id))
          return { key: productKeyFor(detail.id), name: detail.name, brand: detail.brand, productId: detail.id, inci: null, groups: detail.groups }
        }
        const analysis = await api.analyzeInci(p.inci ?? '')
        const key = `c${newId()}`
        keyFor.set(p.key, key)
        return { key, name: p.name || 'Sản phẩm tự nhập', brand: null, productId: null, inci: p.inci ?? '', groups: analysis.groups, notices: analysis.notices }
      } catch (e) {
        if (p.productId !== undefined && (e as { status?: number }).status === 404) {
          dropped.push(p.name || `sản phẩm số ${p.productId}`)
          return null
        }
        throw new ImportError('Không mở được routine: không kết nối được máy chủ SkinWise. Hãy thử lại sau.')
      }
    }),
  )
  // The same catalogue product listed twice in a file becomes one product.
  const products = [...new Map(restored.filter((p) => p !== null).map((p) => [p.key, p])).values()]
  const entries: Entry[] = portable.entries
    .filter((e) => keyFor.has(e.productKey))
    .map((e) => ({ id: newId(), productKey: keyFor.get(e.productKey)!, session: e.session, days: e.days }))
  return { routine: { products, entries }, dropped }
}

// --- File ---

export function downloadFile(routine: Routine): void {
  const json = JSON.stringify({ ...toPortable(routine), exported_at: new Date().toISOString() }, null, 2)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `skinwise-routine-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function readFile(file: File): Promise<PortableRoutine> {
  if (file.size > MAX_UNPACKED) throw new ImportError('Không mở được routine: file quá lớn.')
  let value: unknown
  try {
    value = JSON.parse(await file.text())
  } catch {
    throw new ImportError('Không mở được routine: file không phải JSON.')
  }
  return parsePortable(value)
}

// --- Link: "#routine=" + "z" (deflate-raw) or "j" (plain) + base64url ---

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (text: string): Uint8Array => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  // A copy typed Uint8Array<ArrayBuffer>, which Blob accepts.
  const reader = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(stream).getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_UNPACKED) {
      await reader.cancel()
      throw new ImportError('Không mở được routine: link quá lớn.')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

export async function makeLink(routine: Routine): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toPortable(routine)))
  const payload =
    typeof CompressionStream === 'undefined'
      ? `j${toBase64Url(json)}`
      : `z${toBase64Url(await transform(json, new CompressionStream('deflate-raw')))}`
  return `${location.origin}${location.pathname}${LINK_KEY}${payload}`
}

/** The payload of a routine link in this hash, or null when the hash is something else. */
export function linkPayload(hash: string): string | null {
  return hash.startsWith(LINK_KEY) ? hash.slice(LINK_KEY.length) : null
}

export async function readLink(payload: string): Promise<PortableRoutine> {
  if (payload.length > MAX_LINK) throw new ImportError('Không mở được routine: link quá lớn.')
  let text: string
  try {
    const bytes = fromBase64Url(payload.slice(1))
    if (payload[0] === 'z') {
      if (typeof DecompressionStream === 'undefined') {
        throw new ImportError('Không mở được routine: trình duyệt này không đọc được link nén. Hãy cập nhật trình duyệt.')
      }
      text = new TextDecoder().decode(await transform(bytes, new DecompressionStream('deflate-raw')))
    } else if (payload[0] === 'j') {
      text = new TextDecoder().decode(bytes)
    } else {
      throw new ImportError('Không mở được routine: link không đúng dạng.')
    }
    return parsePortable(JSON.parse(text))
  } catch (e) {
    if (e instanceof ImportError) throw e
    throw new ImportError('Không mở được routine: link bị cắt hoặc hỏng. Hãy xin lại link, hoặc gửi file.')
  }
}

// --- A routine link opened in the app ---

export type Incoming =
  | { kind: 'loading' }
  | { kind: 'ready'; routine: Routine; dropped: string[] }
  | { kind: 'error'; message: string }

/**
 * Watches the address for a routine link. The routine is never applied here: the caller asks the
 * user first. `dismiss` clears the link from the address.
 */
export function useIncomingRoutine(): { incoming: Incoming | null; dismiss: () => void } {
  const [incoming, setIncoming] = useState<Incoming | null>(null)

  useEffect(() => {
    let cancelled = false
    const read = () => {
      const payload = linkPayload(location.hash)
      if (payload === null) return
      setIncoming({ kind: 'loading' })
      readLink(payload)
        .then(restore)
        .then(
          ({ routine, dropped }) => !cancelled && setIncoming({ kind: 'ready', routine, dropped }),
          (e) => !cancelled && setIncoming({ kind: 'error', message: e instanceof ImportError ? e.message : 'Không mở được routine.' }),
        )
    }
    read()
    window.addEventListener('hashchange', read)
    return () => {
      cancelled = true
      window.removeEventListener('hashchange', read)
    }
  }, [])

  return {
    incoming,
    dismiss: () => {
      if (linkPayload(location.hash) !== null) history.replaceState(null, '', location.pathname)
      setIncoming(null)
    },
  }
}
