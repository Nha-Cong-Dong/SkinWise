import { markPhotoFailed, usePhotoShows, type ProductPhoto } from './photos'

const SIZES = {
  sm: 'size-12 text-base',
  lg: 'size-24 text-3xl lg:size-28',
}

/**
 * The product's photo, or a tile with the first letter of its name. Decorative: the name is
 * always written next to it. A photo that fails to load (deleted, cleaned up, signed out) falls
 * back to the tile.
 */
export function ProductImage({
  image,
  name,
  size,
}: {
  image: ProductPhoto | null
  name: string
  size: keyof typeof SIZES
}) {
  const shows = usePhotoShows(image)
  if (image && shows) {
    return (
      <img
        src={image.url}
        alt=""
        className={`${SIZES[size]} shrink-0 rounded-sm bg-neutral object-cover`}
        // Fade in once it has loaded (ANIMATION.md 5.7); a photo already in the cache is shown as is.
        ref={(el) => {
          if (el && !el.complete) el.dataset.fade = '1'
        }}
        onLoad={(e) => {
          if (e.currentTarget.dataset.fade) e.currentTarget.classList.add('motion-photo')
        }}
        onError={() => markPhotoFailed(image.url)}
      />
    )
  }
  const letter = Array.from(name.trim())[0]?.toLocaleUpperCase('vi') ?? '?'
  return (
    <span
      aria-hidden="true"
      className={`${SIZES[size]} inline-flex shrink-0 items-center justify-center rounded-sm border border-dashed border-ink-mute/60 bg-neutral font-display text-ink-soft`}
    >
      {letter}
    </span>
  )
}

/**
 * The credit a catalogue photo needs (CC BY-SA 3.0): the backend's sentence as is, linked to the
 * product's page on Open Beauty Facts, and the licence. Nothing for the user's own photo.
 */
export function PhotoCredit({ image, className = '' }: { image: ProductPhoto | null; className?: string }) {
  const shows = usePhotoShows(image)
  if (!image?.credit || !shows) return null // no photo shown, no credit
  const { credit_vi, source_url, license_url } = image.credit
  const link = 'inline-flex min-h-11 items-center underline-offset-2 hover:underline md:min-h-0'
  return (
    <p className={`text-xs leading-snug text-ink-mute ${className}`}>
      <a href={source_url} target="_blank" rel="noopener noreferrer" className={link}>
        {credit_vi}
      </a>{' '}
      ·{' '}
      <a href={license_url} target="_blank" rel="noopener noreferrer" className={link}>
        Giấy phép
      </a>
    </p>
  )
}
