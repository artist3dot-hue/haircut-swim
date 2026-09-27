// 剪发画面（镜头拉近）的背景：头发后面是泳池边的青绿瓷砖墙（视差滚动），
// 墙上有池水反射的波光；最上面是阿发的头顶（剪到泳帽线附近才看得到）。

import { SCENE, RAMPS, rgba } from './palette'
import { makeCanvas } from './sprites'
import { ditherFill, ditherOverlay, shapeCanvas, roundRectF } from './draw'
import { Rng } from '../core/rng'
import { rootYAt, WORLD_W } from '../hair/world'

const TILE = 48
/** 背景图案的高度（瓷砖周期的整数倍，竖着循环） */
export const BG_PERIOD = TILE * 10

/** 一段可以竖向循环的大瓷砖墙。 */
export function buildCloseupWall(): HTMLCanvasElement {
  const { c, ctx } = makeCanvas(WORLD_W, BG_PERIOD)
  const rng = new Rng(5)
  const [t0, t1, t2, t3] = SCENE.tile
  ctx.fillStyle = SCENE.grout
  ctx.fillRect(0, 0, WORLD_W, BG_PERIOD)
  for (let ty = 0; ty < BG_PERIOD; ty += TILE) {
    for (let tx = -12; tx < WORLD_W; tx += TILE) {
      const light = rng.chance(0.3)
      ditherFill(ctx, tx + 2, ty + 2, TILE - 3, TILE - 3, light ? [t0, t1] : [t1, t2], (x, y) => ((y - ty) / TILE) * 0.8 + ((x - tx) / TILE) * 0.2)
      ctx.fillStyle = t0
      ctx.fillRect(tx + 2, ty + 2, TILE - 4, 2)
      ctx.fillRect(tx + 2, ty + 2, 2, TILE - 4)
      ctx.fillStyle = t2
      ctx.fillRect(tx + 2, ty + TILE - 2, TILE - 3, 1)
      ctx.fillRect(tx + TILE - 2, ty + 2, 1, TILE - 3)
      ctx.fillStyle = t3
      ctx.fillRect(tx + TILE - 1, ty + 1, 1, TILE)
      ctx.fillRect(tx + 1, ty + TILE - 1, TILE, 1)
      if (rng.chance(0.6)) {
        ctx.fillStyle = SCENE.grout
        ctx.fillRect(tx + 7 + rng.int(0, 5), ty + 6 + rng.int(0, 4), 4, 1)
        ctx.fillRect(tx + 6 + rng.int(0, 5), ty + 8 + rng.int(0, 4), 2, 1)
      }
    }
  }
  return c
}

/** 屏幕空间的光照：左上亮、右下暗 + 暗角（盖在墙上、头发下）。 */
export function buildCloseupLight(w: number, h: number): HTMLCanvasElement {
  const { c, ctx } = makeCanvas(w, h)
  ditherOverlay(ctx, 0, 0, w, h, rgba(SCENE.tile[3], 0.55), (x, y) => {
    const d = (x / w) * 0.45 + (y / h) * 0.55
    const dx = (x - w / 2) / (w / 2)
    const dy = (y - h / 2) / (h / 2)
    return Math.max(0, d - 0.45) * 1.3 + Math.max(0, dx * dx + dy * dy - 0.7) * 0.6
  })
  ditherOverlay(ctx, 0, 0, w, h, rgba(SCENE.goldSpark, 0.25), (x, y) => Math.max(0, 1 - Math.hypot(x, y) / (w * 0.9)) * 0.7)
  return c
}

/** 墙上池水反射的波光（每帧画，屏幕坐标）。 */
export function drawWallCaustics(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, scroll: number): void {
  ctx.fillStyle = rgba(SCENE.water[2], 0.22)
  // 粗网格采样（6×8 像素一格），每格最多画一小段亮线，开销很小
  const off = ((scroll % 8) + 8) % 8
  for (let y = -off; y < h; y += 8) {
    const wy = y + scroll
    for (let x = 0; x < w; x += 6) {
      const v = Math.sin(x * 0.04 + t * 1.1 + wy * 0.05) + Math.sin(x * 0.07 - t * 0.8 - wy * 0.03) + Math.sin((x - wy) * 0.02 + t * 0.4)
      if (v > 1.7) ctx.fillRect(x, y, v > 2.2 ? 6 : 4, 1)
    }
  }
}

/** 阿发的头顶（世界坐标 y = 0 开始）：梳过的发丝、左上光泽带、发缝露出一点头皮。 */
export function buildCrown(): HTMLCanvasElement {
  const H = 120
  const { c, ctx } = makeCanvas(WORLD_W, H)
  const hair = SCENE.hair
  const skin = SCENE.skin
  const partX = Math.round(WORLD_W * 0.43)
  const partAt = (y: number): number => partX + Math.round(Math.sin(y * 0.2) * 1 + y * 0.12)
  for (let x = 0; x < WORLD_W; x++) {
    const bottom = rootYAt(x) + 2
    for (let y = 0; y <= bottom; y++) {
      const dx = x - partAt(y)
      const side = dx < 0 ? -1 : 1
      const strand = Math.floor((dx - side * y * 1.1) / 2.4)
      const hsh = ((strand * 73856093) ^ 19349663) >>> 0
      let ci = hsh % 4 === 0 ? 2 : hsh % 4 === 1 ? 0 : 1
      // 光泽带：左上方一条弧
      const bandY = 22 + Math.abs(dx) * 0.06
      if (Math.abs(y - bandY) < 5 && x < WORLD_W * 0.7) ci = Math.abs(y - bandY) < 2 && hsh % 3 === 0 ? 4 : ci >= 1 ? 3 : 2
      // 右边和下沿暗
      if (x > WORLD_W * 0.78) ci = Math.max(0, ci - 1)
      if (y > bottom - 5) ci = 0
      ctx.fillStyle = hair[ci]!
      ctx.fillRect(x, y, 1, 1)
    }
  }
  // 发缝：露出的头皮
  for (let y = 0; y < 34; y++) {
    const x = partAt(y)
    const w = y < 26 ? 3 : 2
    ctx.fillStyle = skin[3]
    ctx.fillRect(x, y, 1, 1)
    ctx.fillStyle = skin[2]
    ctx.fillRect(x + 1, y, w - 1, 1)
    ctx.fillStyle = skin[1]
    ctx.fillRect(x + w, y, 1, 1)
  }
  ctx.fillStyle = SCENE.hairGlint[0]
  for (let i = 0; i < 18; i++) ctx.fillRect(40 + i * 17, 20 + Math.round(Math.sin(i) * 3), 2, 1)
  return c
}

/** 泳帽线：一条带泳帽小图标和"泳帽线"字样的蓝色虚线（字在高清层）。 */
export function drawCapLine(ctx: CanvasRenderingContext2D, y: number, w: number, t: number, bright: boolean): void {
  const c = RAMPS.bcap
  const off = Math.floor(t * (bright ? 30 : 8)) % 8
  for (let x = 30 - off; x < w; x += 8) {
    if (x < 30) continue
    ctx.fillStyle = bright ? c[4] : c[3]
    ctx.fillRect(x, y, 4, 2)
    ctx.fillStyle = c[0]
    ctx.fillRect(x, y + 2, 4, 1)
  }
}

let capBadge: HTMLCanvasElement | null = null
export function capLineBadge(): HTMLCanvasElement {
  if (capBadge) return capBadge
  capBadge = shapeCanvas(26, 16, (x, y) => roundRectF(0, 6, 26, 10, 3)(x, y) || ((x - 13) / 12) ** 2 + ((y - 9) / 9) ** 2 <= 1, { ramp: RAMPS.bcap, bevel: 4 })
  return capBadge
}
