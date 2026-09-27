// 代码画像素图的工具箱：把"形状"（遮罩）变成有体积感的像素图。
//
// 做法（让所有物件的画法统一、细腻）：
// 1) 形状 = 一张遮罩（哪些像素属于这个物件）
// 2) 距离场：每个像素离边缘多远 → 当成"高度"，边缘低、中间鼓（圆角程度由 bevel 控制）
// 3) 高度的梯度 → 法线，和左上方来的光点乘 → 亮度
// 4) 亮度按色阶分档，档与档之间用 Bayer 4×4 抖点过渡（不是一刀切的色块）
// 5) 外描边用色阶最深档；受光的左上边描边用暗部档（selective outline，更柔和）
// 6) 最亮的一档只出现在受光边缘，当高光
// 颜色全部来自传入的色阶（palette.ts）。

import { makeCanvas } from './sprites'

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)

export function bayer(x: number, y: number): number {
  return BAYER4[(y & 3) * 4 + (x & 3)]!
}

/** 光的方向（从左上方照过来），已归一化。 */
const LX = -0.55
const LY = -0.62
const LZ = 0.56

export interface ShadeOpts {
  /** 5 档色阶：[描边, 暗部, 中间, 亮部, 高光] */
  ramp: readonly string[]
  /** 边缘圆润程度（像素），越大越鼓；0 = 平的 */
  bevel?: number
  /** 画外描边 */
  outline?: boolean
  /** 整体亮度偏移（-1..1） */
  bias?: number
  /** 对比度（光照对亮度的影响） */
  contrast?: number
  /** 允许出现高光档 */
  shine?: boolean
  /** 抖点过渡的宽度（0 = 不抖，直接分档） */
  dither?: number
}

/**
 * 在 ctx 的 (ox, oy) 处按遮罩画一个有体积感的物件。
 * mask[y * w + x] 非 0 的像素属于物件。
 */
export function shadeMask(ctx: CanvasRenderingContext2D, mask: Uint8Array, w: number, h: number, ox: number, oy: number, o: ShadeOpts): void {
  const bevel = o.bevel ?? 4
  const ramp = o.ramp
  const bias = o.bias ?? 0
  const contrast = o.contrast ?? 1
  const dither = o.dither ?? 0.5
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] !== 0

  // 距离场（chamfer 3-4，截到 bevel）
  const R = Math.max(1, bevel)
  const dist = new Float32Array(w * h)
  const BIG = 1e6
  for (let i = 0; i < w * h; i++) dist[i] = mask[i] ? BIG : 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!mask[i]) continue
      let d = dist[i]!
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) d = Math.min(d, 1)
      if (x > 0) d = Math.min(d, dist[i - 1]! + 1)
      if (y > 0) d = Math.min(d, dist[i - w]! + 1)
      if (x > 0 && y > 0) d = Math.min(d, dist[i - w - 1]! + 1.414)
      if (x < w - 1 && y > 0) d = Math.min(d, dist[i - w + 1]! + 1.414)
      dist[i] = d
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (!mask[i]) continue
      let d = dist[i]!
      if (x < w - 1) d = Math.min(d, dist[i + 1]! + 1)
      if (y < h - 1) d = Math.min(d, dist[i + w]! + 1)
      if (x < w - 1 && y < h - 1) d = Math.min(d, dist[i + w + 1]! + 1.414)
      if (x > 0 && y < h - 1) d = Math.min(d, dist[i + w - 1]! + 1.414)
      dist[i] = d
    }
  }
  // 高度：圆弧截面（边缘陡、中间平）
  const height = (x: number, y: number): number => {
    if (!inside(x, y)) return 0
    const d = Math.min(dist[y * w + x]!, R) / R
    return Math.sqrt(1 - (1 - d) * (1 - d)) * R
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) {
        if (o.outline === false) continue
        // 描边：四邻里有实心
        const n = inside(x, y - 1) || inside(x - 1, y) || inside(x + 1, y) || inside(x, y + 1)
        if (!n) continue
        // 受光一侧（物件在我的右下方）描边淡一档
        const litSide = inside(x + 1, y) || inside(x, y + 1)
        const darkSide = inside(x - 1, y) || inside(x, y - 1)
        ctx.fillStyle = litSide && !darkSide ? ramp[1]! : ramp[0]!
        ctx.fillRect(ox + x, oy + y, 1, 1)
        continue
      }
      const gx = (height(x + 1, y) - height(x - 1, y)) / 2
      const gy = (height(x, y + 1) - height(x, y - 1)) / 2
      let nx = -gx
      let ny = -gy
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const lambert = nx * LX + ny * LY + nz * LZ
      // 0..1 的亮度
      let v = 0.5 + (lambert - LZ) * 1.6 * contrast + bias
      // 左上边缘额外受光、右下边缘额外暗
      if (!inside(x - 1, y) || !inside(x, y - 1)) v += 0.18
      if (!inside(x + 1, y) || !inside(x, y + 1)) v -= 0.14
      v = Math.max(0, Math.min(1, v))
      // 分档 + 抖点：1 暗部、2 中间、3 亮部；4 高光只在很亮处
      const top = o.shine === false ? 3 : 4
      const level = 1 + v * (top - 1)
      const base = Math.floor(level)
      const frac = level - base
      const t = 0.5 + (bayer(x, y) - 0.5) * dither * 2
      let idx = frac > t ? base + 1 : base
      idx = Math.max(1, Math.min(top, idx))
      ctx.fillStyle = ramp[idx]!
      ctx.fillRect(ox + x, oy + y, 1, 1)
    }
  }
}

/** 用一个判断函数做遮罩（f(x, y) 返回 true 的像素属于物件），画到一张新画布上。pad 给描边留边。 */
export function shapeCanvas(w: number, h: number, f: (x: number, y: number) => boolean, o: ShadeOpts, pad = 1): HTMLCanvasElement {
  const W = w + pad * 2
  const H = h + pad * 2
  const mask = new Uint8Array(W * H)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (f(x + 0.5, y + 0.5)) mask[(y + pad) * W + x + pad] = 1
  const { c, ctx } = makeCanvas(W, H)
  shadeMask(ctx, mask, W, H, 0, 0, o)
  return c
}

/** 直接在 ctx 上按判断函数画一个物件（左上角 x, y，范围 w×h）。 */
export function shape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: (x: number, y: number) => boolean, o: ShadeOpts): void {
  const c = shapeCanvas(w, h, f, o)
  ctx.drawImage(c, Math.round(x) - 1, Math.round(y) - 1)
}

/** 椭圆判断函数（局部坐标）。 */
export function ellipseF(cx: number, cy: number, rx: number, ry: number): (x: number, y: number) => boolean {
  return (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
}

/** 圆角矩形判断函数。 */
export function roundRectF(x0: number, y0: number, w: number, h: number, r: number): (x: number, y: number) => boolean {
  return (x, y) => {
    if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false
    const cx = Math.max(x0 + r, Math.min(x0 + w - r, x))
    const cy = Math.max(y0 + r, Math.min(y0 + h - r, y))
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  }
}

/** 多边形判断函数（射线法）。 */
export function polyF(pts: ReadonlyArray<readonly [number, number]>): (x: number, y: number) => boolean {
  return (x, y) => {
    let c = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]!
      const [xj, yj] = pts[j]!
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
    }
    return c
  }
}

/** 粗线段（胶囊）判断函数。 */
export function capsuleF(x0: number, y0: number, x1: number, y1: number, r: number): (x: number, y: number) => boolean {
  const dx = x1 - x0
  const dy = y1 - y0
  const l2 = dx * dx + dy * dy || 1
  return (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2))
    const ex = x - (x0 + dx * t)
    const ey = y - (y0 + dy * t)
    return ex * ex + ey * ey <= r * r
  }
}

export const union =
  (...fs: Array<(x: number, y: number) => boolean>) =>
  (x: number, y: number): boolean =>
    fs.some((f) => f(x, y))

export const minus =
  (a: (x: number, y: number) => boolean, b: (x: number, y: number) => boolean) =>
  (x: number, y: number): boolean =>
    a(x, y) && !b(x, y)

/**
 * 抖点渐变填充：f(x, y) 返回 0..1，按 Bayer 在 colors 各档之间过渡。
 * colors 从 0 到 1 排列。
 */
export function ditherFill(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, colors: readonly string[], f: (x: number, y: number) => number): void {
  const n = colors.length - 1
  for (let y = 0; y < h; y++) {
    let run = -1
    let runStart = 0
    for (let x = 0; x <= w; x++) {
      let idx = -1
      if (x < w) {
        const v = Math.max(0, Math.min(1, f(x0 + x, y0 + y))) * n
        const b = Math.floor(v)
        idx = Math.min(n, v - b > bayer(x0 + x, y0 + y) ? b + 1 : b)
      }
      if (idx !== run) {
        if (run >= 0) {
          ctx.fillStyle = colors[run]!
          ctx.fillRect(x0 + runStart, y0 + y, x - runStart, 1)
        }
        run = idx
        runStart = x
      }
    }
  }
}

/** 半透明的抖点叠加（光斑、阴影）：强度 f(x,y) 0..1，只画在 Bayer 阈值以下的像素。 */
export function ditherOverlay(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, color: string, f: (x: number, y: number) => number): void {
  ctx.fillStyle = color
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = f(x0 + x, y0 + y)
      if (v > 0 && v > bayer(x0 + x, y0 + y)) ctx.fillRect(x0 + x, y0 + y, 1, 1)
    }
  }
}

/** 像素风的四角闪星 ✦。 */
export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, core: string, arm: string): void {
  const cx = Math.round(x)
  const cy = Math.round(y)
  ctx.fillStyle = arm
  ctx.fillRect(cx - size, cy, size * 2 + 1, 1)
  ctx.fillRect(cx, cy - size, 1, size * 2 + 1)
  if (size >= 3) {
    ctx.fillRect(cx - 1, cy - 1, 3, 3)
  }
  ctx.fillStyle = core
  ctx.fillRect(cx, cy, 1, 1)
}
