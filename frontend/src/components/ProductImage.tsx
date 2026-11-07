import type { ReactNode } from 'react'
import { accentOf, packagingOf, type Packaging } from './packaging'
import { markPhotoFailed, usePhotoShows, type ProductPhoto } from './photos'

const SIZES = {
  sm: 'size-12',
  lg: 'size-24 lg:size-36',
}
const WIDTHS = {
  sm: 'w-12',
  lg: 'w-24 lg:w-36',
}

/**
 * The product's photo or, without one, a drawing of a container. The photo is decorative (the
 * name is always written next to it). A photo that fails to load (deleted, cleaned up, signed out)
 * falls back to the drawing. `caption` writes under the drawing that it is not a photo.
 */
export function ProductImage({
  image,
  name,
  brand = null,
  size,
  caption = false,
}: {
  image: ProductPhoto | null
  name: string
  brand?: string | null
  size: keyof typeof SIZES
  caption?: boolean
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
  const drawing = <PackagingDrawing name={name} brand={brand} className={SIZES[size]} />
  if (!caption) return drawing
  return (
    <figure className={`${WIDTHS[size]} shrink-0`}>
      {drawing}
      <figcaption className="mt-1.5 text-xs leading-snug text-ink-mute">Hình minh hoạ, không phải ảnh sản phẩm</figcaption>
    </figure>
  )
}

type Box = { x: number; y: number; w: number; h: number }
type Shape = { parts: ReactNode; label: Box; lines: number }

// Shapes on a 100 x 100 grid. `body` is the container (surface, 1px border), `cap` the closure.
const body = 'fill-surface stroke-border'
const capFill = { fill: 'color-mix(in srgb, var(--color-on-surface) 13%, var(--color-surface))' }
const Cap = (props: { x: number; y: number; w: number; h: number; r?: number }) => (
  <rect x={props.x} y={props.y} width={props.w} height={props.h} rx={props.r ?? 2} style={capFill} />
)

const SHAPES: Record<Packaging, Shape> = {
  // Standing on its cap, crimped end up.
  tube: {
    parts: (
      <>
        <rect x={24} y={6} width={52} height={6} rx={1} className={body} />
        <path d="M24 12H76L70 79H30Z" className={body} strokeLinejoin="round" />
        <Cap x={36} y={79} w={28} h={15} />
      </>
    ),
    label: { x: 30, y: 19, w: 40, h: 52 },
    lines: 3,
  },
  dropper: {
    parts: (
      <>
        <rect x={43} y={4} width={14} height={16} rx={7} style={capFill} />
        <Cap x={38} y={16} w={24} h={14} />
        <rect x={26} y={30} width={48} height={64} rx={7} className={body} />
      </>
    ),
    label: { x: 30, y: 38, w: 40, h: 48 },
    lines: 3,
  },
  jar: {
    parts: (
      <>
        <Cap x={16} y={24} w={68} h={15} r={3} />
        <rect x={18} y={39} width={64} height={51} rx={6} className={body} />
      </>
    ),
    label: { x: 22, y: 44, w: 56, h: 40 },
    lines: 2,
  },
  pump: {
    parts: (
      <>
        <Cap x={36} y={8} w={26} h={7} />
        <Cap x={60} y={9.5} w={14} h={4} r={1.5} />
        <Cap x={46} y={15} w={8} h={10} r={0} />
        <Cap x={38} y={24} w={24} h={9} />
        <rect x={26} y={33} width={48} height={61} rx={8} className={body} />
      </>
    ),
    label: { x: 30, y: 41, w: 40, h: 45 },
    lines: 3,
  },
  // A flat sunscreen bottle: wide body, tall cap.
  flat: {
    parts: (
      <>
        <Cap x={38} y={6} w={24} h={21} r={3} />
        <rect x={22} y={26} width={56} height={68} rx={10} className={body} />
      </>
    ),
    label: { x: 27, y: 35, w: 46, h: 51 },
    lines: 3,
  },
  // Toner: shouldered bottle, ridged screw cap.
  screw: {
    parts: (
      <>
        <Cap x={38} y={4} w={24} h={16} />
        <path d="M43 7V17M50 7V17M57 7V17" className="stroke-surface" strokeWidth={1.5} />
        <rect x={42} y={19} width={16} height={6} className={body} />
        <path d="M42 25H58C66 25 72 30 72 38V90Q72 94 68 94H32Q28 94 28 90V38C28 30 34 25 42 25Z" className={body} />
      </>
    ),
    label: { x: 31, y: 41, w: 38, h: 47 },
    lines: 3,
  },
  bottle: {
    parts: (
      <>
        <Cap x={39} y={8} w={22} h={17} r={4} />
        <rect x={27} y={24} width={46} height={70} rx={10} className={body} />
      </>
    ),
    label: { x: 31, y: 34, w: 38, h: 52 },
    lines: 3,
  },
}

const BAND = 7 // height of the accent band at the foot of the label, in grid units

/**
 * A drawing of the container, labelled "Hình minh hoạ" for screen readers so nobody takes it for
 * a photo. The text on the label is decoration (the name is written next to it) and shows only
 * when the tile is 64px or wider; smaller tiles keep the shape and two grey lines.
 */
function PackagingDrawing({ name, brand, className }: { name: string; brand: string | null; className: string }) {
  const shape = SHAPES[packagingOf(name)]
  const { x, y, w, h } = shape.label
  const pct = (n: number) => `${n}%`
  return (
    <span
      role="img"
      aria-label={`Hình minh hoạ: ${name}`}
      className={`${className} @container relative inline-block shrink-0 overflow-hidden rounded-sm bg-neutral`}
    >
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="absolute inset-0 size-full drop-shadow-[0_1px_1.5px_rgb(47_42_85_/_0.18)] [&_*]:[vector-effect:non-scaling-stroke]"
        strokeWidth={1}
      >
        {shape.parts}
        <rect x={x} y={y + h - BAND} width={w} height={BAND} rx={1} style={{ fill: accentOf(brand ?? name) }} />
        <g className="@min-[64px]:hidden" style={capFill}>
          <rect x={x + 4} y={y + 6} width={w * 0.45} height={4} rx={2} />
          <rect x={x + 4} y={y + 15} width={w * 0.75} height={5} rx={2.5} />
        </g>
      </svg>
      <span
        aria-hidden="true"
        className="absolute hidden min-w-0 flex-col gap-[1cqw] overflow-hidden pt-[1.5cqw] font-sans @min-[64px]:flex"
        style={{ left: pct(x + 2), top: pct(y), width: pct(w - 4), height: pct(h - BAND - 1) }}
      >
        {brand && (
          <span className="line-clamp-1 text-[5.5cqw] leading-tight font-semibold tracking-wide text-ink-soft uppercase [overflow-wrap:anywhere]">
            {brand}
          </span>
        )}
        <span
          lang="en"
          className="text-[7cqw] leading-[1.15] font-semibold text-pretty text-ink hyphens-auto [overflow-wrap:break-word]"
          style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: shape.lines, overflow: 'hidden' }}
        >
          {name}
        </span>
      </span>
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
