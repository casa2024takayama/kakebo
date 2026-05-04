/**
 * Card color palette per UI spec §14.
 * 10 colors curated to satisfy WCAG AA on white background and avoid
 * collision with signal colors (green/amber/red).
 */

export type CardPaletteEntry = {
  /** Token name */
  key: string
  /** Display label (Japanese) */
  label: string
  /** Hex color */
  hex: string
  /** Suggested card name match keywords */
  hints: string[]
}

export const CARD_PALETTE: CardPaletteEntry[] = [
  { key: 'saisonIndigo', label: 'セゾン', hex: '#1F3A8A', hints: ['セゾン', 'saison'] },
  { key: 'aeonMagenta', label: 'AEON', hex: '#A21D5C', hints: ['イオン', 'aeon'] },
  { key: 'jcbRoyal', label: 'JCB', hex: '#2552A8', hints: ['jcb'] },
  { key: 'paypayCoral', label: 'PayPay', hex: '#D9456A', hints: ['paypay', 'ペイペイ'] },
  { key: 'rakutenPlum', label: '楽天', hex: '#7B2D7E', hints: ['楽天', 'rakuten'] },
  { key: 'nicosTeal', label: 'ニコス', hex: '#0E7C7B', hints: ['ニコス', 'nicos'] },
  { key: 'amexSlate', label: 'アメックス', hex: '#3A4D5C', hints: ['アメックス', 'amex'] },
  { key: 'smbcCobalt', label: '三井住友', hex: '#0B5FB8', hints: ['三井住友', 'smbc'] },
  { key: 'mizuhoForest', label: 'みずほ', hex: '#2D5F3F', hints: ['みずほ', 'mizuho'] },
  { key: 'cashGraphite', label: '現金', hex: '#4B5563', hints: ['現金', 'cash'] },
]

const HEX_BY_INDEX = CARD_PALETTE.map((c) => c.hex)

/**
 * Resolve a color for a given card. Priority:
 * 1. card.color (user override)
 * 2. matched palette entry by name keyword
 * 3. fallback by index
 */
export function resolveCardColor(
  cardName: string,
  cardColor: string | undefined,
  fallbackIndex: number,
): string {
  if (cardColor) return cardColor
  const lower = cardName.toLowerCase()
  for (const p of CARD_PALETTE) {
    if (p.hints.some((h) => lower.includes(h.toLowerCase()))) return p.hex
  }
  return HEX_BY_INDEX[fallbackIndex % HEX_BY_INDEX.length]
}

/** Two-character abbreviation for accessibility (color + glyph dual coding) */
export function cardAbbrev(name: string): string {
  // Strip non-alphanumeric prefix and take 2 chars
  const trimmed = name.trim()
  if (!trimmed) return '??'
  // Try ASCII first
  const asciiMatch = trimmed.match(/[A-Za-z0-9]{2,}/)
  if (asciiMatch) return asciiMatch[0].slice(0, 2).toUpperCase()
  return trimmed.slice(0, 2)
}

/** Lighten/darken a HEX by adjusting lightness in HSL space (-100..+100). */
export function adjustLightness(hex: string, deltaPct: number): string {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16) / 255
  const g = parseInt(m.slice(2, 4), 16) / 255
  const b = parseInt(m.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }
  const nl = Math.min(1, Math.max(0, l + deltaPct / 100))

  function hue2rgb(p: number, q: number, t: number): number {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  let nr: number
  let ng: number
  let nb: number
  if (s === 0) {
    nr = ng = nb = nl
  } else {
    const q = nl < 0.5 ? nl * (1 + s) : nl + s - nl * s
    const p = 2 * nl - q
    nr = hue2rgb(p, q, h + 1 / 3)
    ng = hue2rgb(p, q, h)
    nb = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (v: number): string => {
    const n = Math.round(v * 255)
    return n.toString(16).padStart(2, '0')
  }
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`
}
