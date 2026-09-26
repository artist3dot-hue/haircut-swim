// 像素数字字体（飘字、计数器、倒计时）。中文字走 text.ts 的高清字体。
// 每个字形是一组字符串，'#' 为实心像素。绘制时自动加 1px 描边（8 邻域）。

import { makeCanvas } from './sprites'

export interface PixelFont {
  readonly id: string
  readonly h: number
  readonly spacing: number
  readonly glyphs: Readonly<Record<string, readonly string[]>>
}

export const FONT_TINY: PixelFont = {
  id: 'tiny',
  h: 5,
  spacing: 1,
  glyphs: {
    '0': ['###', '#.#', '#.#', '#.#', '###'],
    '1': ['.#.', '##.', '.#.', '.#.', '###'],
    '2': ['##.', '..#', '.#.', '#..', '###'],
    '3': ['##.', '..#', '.#.', '..#', '##.'],
    '4': ['#.#', '#.#', '###', '..#', '..#'],
    '5': ['###', '#..', '##.', '..#', '##.'],
    '6': ['.##', '#..', '###', '#.#', '###'],
    '7': ['###', '..#', '.#.', '.#.', '.#.'],
    '8': ['###', '#.#', '###', '#.#', '###'],
    '9': ['###', '#.#', '###', '..#', '##.'],
    '+': ['...', '.#.', '###', '.#.', '...'],
    '-': ['...', '...', '###', '...', '...'],
    '.': ['.', '.', '.', '.', '#'],
    ',': ['.', '.', '.', '#', '#'],
    K: ['#.#', '#.#', '##.', '#.#', '#.#'],
    M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
    B: ['##.', '#.#', '##.', '#.#', '##.'],
    e: ['.##', '#.#', '##.', '#..', '.##'],
    x: ['...', '#.#', '.#.', '#.#', '...'],
    '!': ['#', '#', '#', '.', '#'],
    ':': ['.', '#', '.', '#', '.'],
    '/': ['..#', '..#', '.#.', '#..', '#..'],
    '%': ['#.#', '..#', '.#.', '#..', '#.#'],
    ' ': ['..', '..', '..', '..', '..'],
  },
}

export const FONT_HUD: PixelFont = {
  id: 'hud',
  h: 7,
  spacing: 1,
  glyphs: {
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '#.#..', '..#..', '..#..', '..#..', '#####'],
    '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
    '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '..#..', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
    '.': ['..', '..', '..', '..', '..', '##', '##'],
    ',': ['..', '..', '..', '..', '##', '.#', '#.'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
    x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
    s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
    '!': ['##', '##', '##', '##', '##', '..', '##'],
    ':': ['..', '##', '##', '..', '##', '##', '..'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
    '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
    ' ': ['...', '...', '...', '...', '...', '...', '...'],
  },
}

type GlyphCache = Map<string, HTMLCanvasElement>
const caches = new Map<string, GlyphCache>()

function glyphW(font: PixelFont, ch: string): number {
  const g = font.glyphs[ch] ?? font.glyphs[' ']!
  return g[0]!.length
}

function glyphCanvas(font: PixelFont, ch: string, color: string, outline: string | null): HTMLCanvasElement {
  const key = `${font.id}|${color}|${outline ?? ''}`
  let cache = caches.get(key)
  if (!cache) {
    cache = new Map()
    caches.set(key, cache)
  }
  let c = cache.get(ch)
  if (c) return c
  const g = font.glyphs[ch] ?? font.glyphs[' ']!
  const w = g[0]!.length
  const h = font.h
  const made = makeCanvas(w + 2, h + 2)
  const ctx = made.ctx
  const on = (x: number, y: number): boolean => y >= 0 && y < h && x >= 0 && x < w && g[y]![x] === '#'
  if (outline) {
    ctx.fillStyle = outline
    for (let y = -1; y <= h; y++) {
      for (let x = -1; x <= w; x++) {
        if (on(x, y)) continue
        let near = false
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = on(x + dx, y + dy)
        if (near) ctx.fillRect(x + 1, y + 1, 1, 1)
      }
    }
  }
  ctx.fillStyle = color
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) ctx.fillRect(x + 1, y + 1, 1, 1)
  c = made.c
  cache.set(ch, c)
  return c
}

/** 文字宽度（不含描边），单位逻辑像素。 */
export function textWidth(font: PixelFont, text: string, scale = 1): number {
  let w = 0
  for (let i = 0; i < text.length; i++) {
    w += glyphW(font, text[i]!)
    if (i < text.length - 1) w += font.spacing
  }
  return w * scale
}

export interface PixelTextOpts {
  color: string
  outline?: string | null
  scale?: number
  align?: 'left' | 'center' | 'right'
  alpha?: number
}

/** 在 (x, y) 画像素字：y 是字形顶部，x 按 align 对齐。坐标自动取整。 */
export function drawPixelText(ctx: CanvasRenderingContext2D, font: PixelFont, text: string, x: number, y: number, o: PixelTextOpts): void {
  const k = Math.max(1, Math.round(o.scale ?? 1))
  const total = textWidth(font, text, k)
  let cx = Math.round(x)
  if (o.align === 'center') cx = Math.round(x - total / 2)
  else if (o.align === 'right') cx = Math.round(x - total)
  const cy = Math.round(y)
  const a = o.alpha ?? 1
  if (a <= 0) return
  const prevA = ctx.globalAlpha
  if (a !== 1) ctx.globalAlpha = prevA * a
  const outline = o.outline === undefined ? null : o.outline
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    const gc = glyphCanvas(font, ch, o.color, outline)
    ctx.drawImage(gc, cx - k, cy - k, gc.width * k, gc.height * k)
    cx += (glyphW(font, ch) + font.spacing) * k
  }
  if (a !== 1) ctx.globalAlpha = prevA
}
