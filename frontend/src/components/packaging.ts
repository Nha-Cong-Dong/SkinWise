/**
 * The container drawn for a product that has no photo, guessed from words in its name. Only for
 * the illustration: it never says anything about the product itself.
 */
export type Packaging = 'tube' | 'dropper' | 'jar' | 'pump' | 'flat' | 'screw' | 'bottle'

/** Lower case, no Vietnamese marks, so "Sữa rửa mặt", "sua rua mat" and "SỮA RỬA MẶT" match alike. */
function fold(text: string): string {
  return text
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
}

// Checked in this order: the first list with a match wins ("Foaming Cream Cleanser" is a tube, not
// a jar; "Lotion PM" is a pump, not a night-cream jar). Words match whole, on the folded name.
const KEYWORDS: [Packaging, RegExp][] = [
  ['tube', /\b(sua rua mat|rua mat|gel rua|cleanser|cleansing|foaming|face wash|purifying gel)\b/],
  ['flat', /\b(chong nang|spf\d*|sunscreen|sun ?screen|fluid|uv\w*)\b/],
  ['dropper', /\b(serum|tinh chat|essence|ampoule|solution)\b/],
  ['pump', /\b(sua duong|lotion)\b/],
  ['jar', /\b(kem|cream|creme|baume|balm|night)\b/],
  ['screw', /\b(toner|nuoc|liquid|exfoliant)\b/],
]

export function packagingOf(name: string): Packaging {
  const folded = fold(name)
  for (const [kind, words] of KEYWORDS) if (words.test(folded)) return kind
  return 'bottle'
}

// Pastel accents of the design system for the band on the label, chosen from the tokens that stay
// light in the dark theme too (petal and wash turn dark there and the band would vanish). Never a
// severity colour: those are only for warnings.
const ACCENTS = [
  'var(--color-blush)',
  'var(--color-thistle)',
  'var(--color-dusk-mute)',
  'var(--color-thistle-hover)',
  'color-mix(in srgb, var(--color-blush) 50%, var(--color-thistle))',
  'color-mix(in srgb, var(--color-blush) 60%, var(--color-surface))',
]

/** The same brand always gets the same accent (a small string hash, stable across visits). */
export function accentOf(brand: string): string {
  let hash = 2166136261
  for (const ch of fold(brand.trim())) {
    hash ^= ch.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return ACCENTS[(hash >>> 0) % ACCENTS.length]
}
