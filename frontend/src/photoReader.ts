// Reading an ingredient list off a label photo (backend/app/label_api.py).

import { useState, type ClipboardEvent } from 'react'
import { api, ApiError } from './api'

// Claude reads at most 2576 px on the long edge and 4784 tiles of 28×28 px. A bigger photo is
// scaled down on arrival anyway, after a slower upload.
const MAX_EDGE = 2576
const MAX_PIXELS = 4784 * 28 * 28 * 0.98

/** The photo as a JPEG no bigger than the model reads, as base64 and as a data URL. */
async function prepare(file: File): Promise<{ data: string; preview: string }> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(width * scale))
  canvas.height = Math.max(1, Math.floor(height * scale))
  const context = canvas.getContext('2d')
  if (context) {
    // Screenshots can be transparent; JPEG would turn that black.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  }
  bitmap.close()
  const preview = canvas.toDataURL('image/jpeg', 0.9)
  return { data: preview.slice(preview.indexOf(',') + 1), preview }
}

export type PhotoReaderState = 'idle' | 'loading' | 'none' | 'bad_image' | 'signed_out' | 'off' | 'busy' | 'error'

/** The image in a paste event (a screenshot or a copied photo), if there is one. */
export function pastedImage(e: ClipboardEvent): File | null {
  return Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/')) ?? null
}

/**
 * Reads the ingredient list off a photo. `onRead` gets the text, for the user to check, and the
 * photo to check it against. `mayReplace` is asked first; false keeps what the user pasted.
 * While `state` is 'loading' the caller locks the ingredient box, so the text read off the photo
 * never replaces something typed during the wait.
 */
export function usePhotoReader(onRead: (text: string, photo: string) => void, mayReplace: () => boolean) {
  const [state, setState] = useState<PhotoReaderState>('idle')

  const read = async (file: File) => {
    if (state === 'loading' || !mayReplace()) return
    setState('loading')
    let image: { data: string; preview: string }
    try {
      image = await prepare(file)
    } catch {
      setState('bad_image')
      return
    }
    api.readLabel({ media_type: 'image/jpeg', data: image.data }).then(
      (reading) => {
        if (!reading.found) {
          setState('none')
          return
        }
        setState('idle')
        onRead(reading.text, image.preview)
      },
      (e) => {
        const status = e instanceof ApiError ? e.status : 0
        setState(
          status === 401
            ? 'signed_out'
            : status === 429 // the AI service is busy, or too many photos were sent
              ? 'busy'
              : status === 503 // not set up on this server
                ? 'off'
                : status === 422
                  ? 'bad_image'
                  : 'error',
        )
      },
    )
  }
  return { state, read }
}
