/** A product photo with its credit, once the product-photos API exists; null until then. */
export type ProductPhoto = { url: string; credit: string | null }

const SIZES = {
  sm: 'size-12 text-base',
  lg: 'size-24 text-3xl lg:size-28',
}

/**
 * The product's photo, or a tile with the first letter of its name. Decorative: the name is
 * always written next to it, so the tile is hidden from screen readers.
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
  if (image) {
    return (
      <figure className="shrink-0">
        <img src={image.url} alt="" className={`${SIZES[size]} rounded-sm bg-neutral object-cover`} />
        {image.credit && size === 'lg' && <figcaption className="mt-1 text-xs text-ink-mute">{image.credit}</figcaption>}
      </figure>
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
