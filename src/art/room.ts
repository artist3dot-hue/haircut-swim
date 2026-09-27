// 主界面（第 1 层"小区泳池"）的高精度代码像素图（540×960）。
// 画风按 ART_STYLE：细腻像素 + 夏日柔光 + 左上光源；抖点渐变、环境光遮蔽、窗口斜射的阳光、池水反光。
// 静态部分（墙、地、池、物件）启动时预先画好；会动的（水光、灰尘、阿发的表情和头发）每帧画。

import { SCENE, RAMPS, rgba } from './palette'
import { makeCanvas, drawSprite } from './sprites'
import { shapeCanvas, ditherFill, ditherOverlay, bayer, ellipseF, roundRectF, polyF, capsuleF, union, minus, sparkle } from './draw'
import { Rng } from '../core/rng'

export const RW = 540
export const RH = 960
export const WALL_BOTTOM = 500
export const FLOOR_TOP = 516
export const COPING_TOP = 762
export const WATER_TOP = 788

/** 窗户射进来的光带：返回 0..1 强度。 */
export function shaftAt(x: number, y: number): number {
  // 从左上窗户往右下斜射（方向约 35°），带宽随距离变宽
  const d = (x - 60) * 0.57 - (y - 110) * 0.82
  const along = (x - 60) * 0.82 + (y - 110) * 0.57
  if (along < 0) return 0
  const half = 55 + along * 0.18
  const k = 1 - Math.abs(d) / half
  if (k <= 0) return 0
  return Math.min(1, k * 1.4) * Math.max(0, 1 - along / 900)
}

// ------------------------------------------------------------ 静态背景

export function buildRoomBackground(): HTMLCanvasElement {
  const { c, ctx } = makeCanvas(RW, RH)
  const rng = new Rng(11)
  const [t0, t1, t2, t3] = SCENE.tile

  // 墙：30px 瓷砖，每块上亮下暗的抖点渐变，左上亮边右下暗边
  ctx.fillStyle = SCENE.grout
  ctx.fillRect(0, 0, RW, WALL_BOTTOM)
  const T = 30
  for (let ty = 0; ty < WALL_BOTTOM; ty += T) {
    for (let tx = -8; tx < RW; tx += T) {
      const light = rng.chance(0.3)
      ditherFill(ctx, tx + 1, ty + 1, T - 1, T - 1, light ? [t0, t1] : [t1, t2], (_x, y) => (y - ty) / T * 0.9 + 0.05)
      ctx.fillStyle = t0
      ctx.fillRect(tx + 1, ty + 1, T - 2, 1)
      ctx.fillRect(tx + 1, ty + 1, 1, T - 2)
      ctx.fillStyle = t2
      ctx.fillRect(tx + 1, ty + T - 1, T - 1, 1)
      ctx.fillRect(tx + T - 1, ty + 1, 1, T - 1)
      // 釉面小亮点
      if (rng.chance(0.5)) {
        ctx.fillStyle = SCENE.grout
        ctx.fillRect(tx + 4 + rng.int(0, 3), ty + 4 + rng.int(0, 2), 2, 1)
      }
      if (rng.chance(0.06)) {
        ctx.fillStyle = t3
        ctx.fillRect(tx + rng.int(5, T - 6), ty + rng.int(5, T - 6), 1, 1)
      }
    }
  }
  // 墙面整体明暗：上亮下暗（靠近地面有一点环境光遮蔽）
  ditherOverlay(ctx, 0, 0, RW, WALL_BOTTOM, rgba(t3, 0.5), (_x, y) => Math.max(0, (y - 280) / 260) * 0.7)
  ditherOverlay(ctx, 0, WALL_BOTTOM - 26, RW, 26, rgba(t3, 0.7), (_x, y) => (y - (WALL_BOTTOM - 26)) / 26)

  // 窗户（左上）：白框 + 天空 + 云 + 太阳
  drawWindow(ctx, 30, 30)

  // 墙脚：珊瑚粉线 + 米黄踢脚线
  ctx.fillStyle = SCENE.coral
  ctx.fillRect(0, WALL_BOTTOM, RW, 3)
  ctx.fillStyle = RAMPS.pink[1]
  ctx.fillRect(0, WALL_BOTTOM + 2, RW, 1)
  ctx.fillStyle = SCENE.poolside
  ctx.fillRect(0, WALL_BOTTOM + 3, RW, FLOOR_TOP - WALL_BOTTOM - 3)
  ctx.fillStyle = SCENE.grout
  for (let x = 20; x < RW; x += 40) ctx.fillRect(x, WALL_BOTTOM + 3, 1, FLOOR_TOP - WALL_BOTTOM - 3)
  ctx.fillRect(0, FLOOR_TOP - 1, RW, 1)

  // 地砖：40px，暖粉三档 + 抖点；越靠墙越暗（环境光遮蔽）
  const [fl, fm, fd] = SCENE.floor
  const FT = 40
  for (let y = FLOOR_TOP; y < COPING_TOP; y += FT) {
    const off = ((y - FLOOR_TOP) / FT) % 2 === 0 ? 0 : FT / 2
    for (let x = -FT + off; x < RW; x += FT) {
      const th = Math.min(FT, COPING_TOP - y)
      ctx.fillStyle = fd
      ctx.fillRect(x, y, FT, th)
      ditherFill(ctx, Math.max(0, x + 1), y + 1, Math.min(FT - 1, RW - Math.max(0, x + 1)), th - 1, [fm, fl], (xx, yy) => 0.55 - ((yy - y) / FT) * 0.35 - ((xx - x) / FT) * 0.15)
      ctx.fillStyle = fl
      ctx.fillRect(x + 1, y + 1, FT - 2, 1)
      ctx.fillStyle = SCENE.skin[4]
      ctx.fillRect(x + 3, y + 2, 5, 1)
    }
  }
  ditherOverlay(ctx, 0, FLOOR_TOP, RW, 40, rgba(fd, 0.9), (_x, y) => 1 - (y - FLOOR_TOP) / 40)

  // 池边石：米黄圆角条 + 珊瑚粉线
  const coping = shapeCanvas(RW + 20, COPING_TOP > 0 ? 24 : 24, roundRectF(0, 0, RW + 20, 24, 6), { ramp: [SCENE.floor[2], SCENE.floor[2], SCENE.poolside, SCENE.skin[3], SCENE.skin[4]], bevel: 5, contrast: 1.1 })
  ctx.drawImage(coping, -11, COPING_TOP)
  ctx.fillStyle = SCENE.coral
  ctx.fillRect(0, COPING_TOP + 18, RW, 2)
  ctx.fillStyle = SCENE.grout
  for (let x = 30; x < RW; x += 60) ctx.fillRect(x, COPING_TOP + 2, 1, 15)

  // 池水：越深越暗的抖点渐变 + 水下瓷砖格
  const [w0, w1, w2] = SCENE.water
  ditherFill(ctx, 0, WATER_TOP, RW, RH - WATER_TOP, [w1, w0, t3], (_x, y) => 0.25 + ((y - WATER_TOP) / (RH - WATER_TOP)) * 0.8)
  ctx.fillStyle = rgba(w2, 0.35)
  for (let y = WATER_TOP + 26; y < RH; y += 34) ctx.fillRect(0, y, RW, 1)
  for (let x = 14; x < RW; x += 34) ctx.fillRect(x, WATER_TOP, 1, RH - WATER_TOP)
  // 池边在水里的阴影
  ditherOverlay(ctx, 0, WATER_TOP, RW, 14, rgba(t3, 0.9), (_x, y) => 1 - (y - WATER_TOP) / 14)

  // 阳光：从窗户斜射到墙和地上
  ditherOverlay(ctx, 0, 0, RW, COPING_TOP, rgba(SCENE.goldSpark, 0.22), (x, y) => shaftAt(x, y) * 0.9)
  ditherOverlay(ctx, 0, 0, RW, COPING_TOP, rgba(SCENE.skin[4], 0.25), (x, y) => shaftAt(x, y) * 0.6)

  // 四角轻微暗角
  ditherOverlay(ctx, 0, 0, RW, RH, rgba(t3, 0.35), (x, y) => {
    const dx = (x - RW / 2) / (RW / 2)
    const dy = (y - RH / 2) / (RH / 2)
    return Math.max(0, dx * dx + dy * dy - 0.75) * 0.9
  })
  return c
}

function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const w = 150
  const h = 160
  // 窗框（head 色阶：白）
  const frame = shapeCanvas(w, h, minus(roundRectF(0, 0, w, h, 5), roundRectF(9, 9, w - 18, h - 18, 2)), { ramp: RAMPS.head, bevel: 4, contrast: 1.1 })
  // 天空
  const [g0, g1, g2, g3, g4] = RAMPS.glass
  void g0
  ditherFill(ctx, x + 9, y + 9, w - 18, h - 18, [g1, g2, g3, g4], (_xx, yy) => (yy - y) / h * 1.1)
  // 太阳 + 光晕
  const sx = x + 38
  const sy = y + 40
  ditherOverlay(ctx, x + 9, y + 9, w - 18, h - 18, rgba(SCENE.goldSpark, 0.6), (xx, yy) => Math.max(0, 1 - Math.hypot(xx - sx, yy - sy) / 42))
  ctx.fillStyle = SCENE.goldSpark
  for (let dy = -9; dy <= 9; dy++) {
    const hw = Math.round(Math.sqrt(81 - dy * dy))
    ctx.fillRect(sx - hw, sy + dy, hw * 2, 1)
  }
  ctx.fillStyle = SCENE.hairGlint[1]
  for (let dy = -6; dy <= 6; dy++) {
    const hw = Math.round(Math.sqrt(36 - dy * dy))
    ctx.fillRect(sx - hw - 1, sy + dy - 1, hw * 2, 1)
  }
  // 云
  const cloud = (cx: number, cy: number, s: number): void => {
    const f = union(ellipseF(10 * s, 8 * s, 10 * s, 6 * s), ellipseF(22 * s, 6 * s, 12 * s, 8 * s), ellipseF(34 * s, 9 * s, 9 * s, 5 * s))
    const cc = shapeCanvas(Math.ceil(46 * s), Math.ceil(16 * s), f, { ramp: [g3, g3, g4, SCENE.hairGlint[1], SCENE.hairGlint[1]], bevel: 3, outline: false, bias: 0.25 })
    ctx.drawImage(cc, cx, cy)
  }
  cloud(x + 70, y + 60, 1)
  cloud(x + 20, y + 100, 0.7)
  // 窗棂
  ctx.drawImage(frame, x - 1, y - 1)
  const mull = shapeCanvas(6, h - 18, roundRectF(0, 0, 6, h - 18, 1), { ramp: RAMPS.head, bevel: 2 })
  ctx.drawImage(mull, x + w / 2 - 4, y + 8)
  const bar = shapeCanvas(w - 18, 6, roundRectF(0, 0, w - 18, 6, 1), { ramp: RAMPS.head, bevel: 2 })
  ctx.drawImage(bar, x + 8, y + h / 2 - 4)
  // 窗台
  const sill = shapeCanvas(w + 16, 10, roundRectF(0, 0, w + 16, 10, 2), { ramp: RAMPS.head, bevel: 3 })
  ctx.drawImage(sill, x - 9, y + h - 2)
  ditherOverlay(ctx, x - 6, y + h + 9, w + 12, 8, rgba(SCENE.tile[3], 0.8), (_xx, yy) => 1 - (yy - (y + h + 9)) / 8)
}

/** 池水表面的波光、闪星（每帧画）。glow：解锁去游泳后更亮。 */
export function drawWaterFx(ctx: CanvasRenderingContext2D, t: number, glow: boolean): void {
  const [, w1, w2] = SCENE.water
  for (let y = WATER_TOP + 8; y < RH; y += 7) {
    const depth = (y - WATER_TOP) / (RH - WATER_TOP)
    for (let x = 0; x < RW; x += 2) {
      const v = Math.sin(x * 0.045 + t * 1.3 + y * 0.21) + Math.sin(x * 0.083 - t * 0.9 + y * 0.7) + Math.sin((x + y) * 0.02 + t * 0.5)
      if (v > 1.6 - depth * 0.3) {
        ctx.fillStyle = v > 2.15 || glow ? w2 : w1
        const wob = Math.round(Math.sin(x * 0.15 + t * 2.2) * 1.5)
        ctx.fillRect(x, y + wob, v > 2.2 ? 4 : 2, 1)
      }
    }
  }
  // 水面闪星
  for (let i = 0; i < (glow ? 14 : 6); i++) {
    const phase = (t * 0.8 + i * 0.37) % 1
    if (phase > 0.5) continue
    const x = ((i * 137 + Math.floor(t * 0.8 + i * 0.37) * 71) % (RW - 20)) + 10
    const y = WATER_TOP + 16 + ((i * 59 + Math.floor(t * 0.8 + i * 0.37) * 23) % (RH - WATER_TOP - 30))
    const s = phase < 0.25 ? 2 : 1
    sparkle(ctx, x, y, s + (glow ? 1 : 0), SCENE.hairGlint[1], glow ? SCENE.goldSpark : w2)
  }
  if (glow) {
    ctx.fillStyle = rgba(w2, 0.14 + 0.08 * Math.sin(t * 3))
    ctx.fillRect(0, WATER_TOP, RW, RH - WATER_TOP)
  }
}

/** 阳光里飘的灰尘 + 墙上的池水反光（每帧画）。 */
export function drawAirFx(ctx: CanvasRenderingContext2D, t: number): void {
  // 墙根处的水光反射
  ctx.fillStyle = rgba(SCENE.water[2], 0.35)
  for (let i = 0; i < 26; i++) {
    const x = (i * 23 + Math.sin(t * 0.7 + i) * 8) % RW
    const y = WALL_BOTTOM - 18 - ((i * 37) % 120) + Math.sin(t * 1.3 + i * 2) * 3
    const w = 4 + Math.round((Math.sin(t * 2 + i * 1.7) + 1) * 3)
    ctx.fillRect(Math.round(x), Math.round(y), w, 1)
  }
  // 灰尘：只在光带里亮
  for (let i = 0; i < 40; i++) {
    const x = (i * 97.3 + t * (6 + (i % 5))) % RW
    const y = (i * 61.7 + t * (3 + (i % 3)) + Math.sin(t + i) * 10) % COPING_TOP
    const k = shaftAt(x, y)
    if (k < 0.2) continue
    ctx.fillStyle = k > 0.6 ? SCENE.hairGlint[1] : SCENE.goldSpark
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
  }
}

// ------------------------------------------------------------ 物件（预先画好，悬停时整体偏移）

export interface Props {
  mirror: HTMLCanvasElement
  sign: HTMLCanvasElement
  hook: HTMLCanvasElement
  rack: HTMLCanvasElement
  trolley: HTMLCanvasElement
  stool: HTMLCanvasElement
  radio: HTMLCanvasElement
  board: HTMLCanvasElement
  chairBack: HTMLCanvasElement
  chairSeat: HTMLCanvasElement
  chairBase: HTMLCanvasElement
  ladder: HTMLCanvasElement
  ring: HTMLCanvasElement
}

export function buildProps(): Props {
  const g = RAMPS.gold
  // 镜子：金色花边椭圆框 + 蓝色镜面 + 斜向反光
  const mw = 104
  const mh = 150
  const mirrorFrame = (x: number, y: number): boolean => {
    const outer = ((x - mw / 2) / (mw / 2)) ** 2 + ((y - mh / 2) / (mh / 2)) ** 2 <= 1
    const inner = ((x - mw / 2) / (mw / 2 - 11)) ** 2 + ((y - mh / 2) / (mh / 2 - 11)) ** 2 <= 1
    // 花边：外沿每隔一段鼓一个小圆
    const ang = Math.atan2(y - mh / 2, x - mw / 2)
    const scallop = Math.abs(Math.sin(ang * 9)) > 0.75 && ((x - mw / 2) / (mw / 2 + 3)) ** 2 + ((y - mh / 2) / (mh / 2 + 3)) ** 2 <= 1
    return (outer || scallop) && !inner
  }
  const { c: mirror, ctx: mctx } = makeCanvas(mw + 12, mh + 30)
  // 镜面
  const glass = shapeCanvas(mw - 20, mh - 20, ellipseF((mw - 20) / 2, (mh - 20) / 2, (mw - 20) / 2, (mh - 20) / 2), { ramp: RAMPS.glass, bevel: 10, outline: false, bias: 0.15 })
  mctx.drawImage(glass, 16, 16)
  // 镜面反光：两道斜向的亮带（只在镜面里）
  for (const [off, bw, col] of [
    [0, 9, RAMPS.glass[4]],
    [16, 4, RAMPS.glass[4]],
    [-4, 2, SCENE.hairGlint[1]],
  ] as const) {
    mctx.fillStyle = col
    for (let yy = 18; yy < mh; yy++) {
      const xx = 20 + off + Math.round((mh - yy) * 0.45)
      for (let k = 0; k < bw; k++) {
        const px2 = xx + k
        if (((px2 - mw / 2 - 5) / (mw / 2 - 13)) ** 2 + ((yy - mh / 2 - 5) / (mh / 2 - 13)) ** 2 < 1) mctx.fillRect(px2, yy, 1, 1)
      }
    }
  }
  const frame = shapeCanvas(mw + 6, mh + 6, (x, y) => mirrorFrame(x - 3, y - 3), { ramp: g, bevel: 4, contrast: 1.3 })
  mctx.drawImage(frame, 3, 3)
  // 顶上的宝石
  const gem = shapeCanvas(16, 16, ellipseF(8, 8, 7, 7), { ramp: RAMPS.gem, bevel: 5, contrast: 1.4 })
  mctx.drawImage(gem, mw / 2 - 2, 0)

  // 泳池规定牌：蓝色边框的奶白牌子（字在高清层写）
  const { c: sign, ctx: sctx } = makeCanvas(190, 108)
  const board = shapeCanvas(186, 100, roundRectF(0, 0, 186, 100, 6), { ramp: RAMPS.bband, bevel: 4 })
  sctx.drawImage(board, 1, 1)
  const inner = shapeCanvas(170, 84, roundRectF(0, 0, 170, 84, 3), { ramp: [RAMPS.bband[1], SCENE.skin[3], SCENE.ui.panel, SCENE.ui.panel, SCENE.hairGlint[1]], bevel: 2, contrast: 0.5, outline: false })
  sctx.drawImage(inner, 9, 9)
  for (const sx of [6, 176]) {
    const screw = shapeCanvas(6, 6, ellipseF(3, 3, 3, 3), { ramp: RAMPS.steel, bevel: 2 })
    sctx.drawImage(screw, sx, 4)
  }
  drawSprite(sctx, 'icon.swim_cap_pink', 34, 60)

  // 挂钩 + 泳帽
  const { c: hook, ctx: hctx } = makeCanvas(60, 80)
  const hk = shapeCanvas(14, 30, union(roundRectF(0, 0, 14, 8, 2), capsuleF(7, 6, 7, 20, 2.2), capsuleF(7, 20, 12, 24, 2)), { ramp: RAMPS.steel, bevel: 2 })
  hctx.drawImage(hk, 22, 0)
  drawSprite(hctx, 'icon.swim_cap_blue', 30, 50)

  // 工具架：木板（orange 色阶）+ 两个支架
  const { c: rack, ctx: rctx } = makeCanvas(190, 30)
  for (const bx of [22, 158]) {
    const br = shapeCanvas(10, 20, polyF([[0, 0], [10, 0], [10, 4], [3, 20], [0, 20]]), { ramp: RAMPS.orange, bevel: 2 })
    rctx.drawImage(br, bx, 8)
  }
  const plank = shapeCanvas(186, 11, roundRectF(0, 0, 186, 11, 2), { ramp: RAMPS.orange, bevel: 3, contrast: 1.1 })
  rctx.drawImage(plank, 1, 1)
  rctx.fillStyle = RAMPS.orange[1]
  for (let x = 12; x < 180; x += 27) rctx.fillRect(x, 6, 9, 1)

  // 小推车：steel 车架 + 两层托盘 + 毛巾
  const { c: trolley, ctx: tctx } = makeCanvas(130, 140)
  for (const lx of [8, 116]) {
    const leg = shapeCanvas(6, 104, roundRectF(0, 0, 6, 104, 2), { ramp: RAMPS.steel, bevel: 2 })
    tctx.drawImage(leg, lx, 26)
    const wheel = shapeCanvas(14, 14, ellipseF(7, 7, 6.5, 6.5), { ramp: RAMPS.slate, bevel: 3 })
    tctx.drawImage(wheel, lx - 4, 124)
  }
  for (const ty of [30, 86]) {
    const tray = shapeCanvas(126, 10, roundRectF(0, 0, 126, 10, 3), { ramp: RAMPS.steel, bevel: 3, contrast: 1.2 })
    tctx.drawImage(tray, 1, ty)
  }
  const towel = shapeCanvas(70, 22, roundRectF(0, 0, 70, 22, 5), { ramp: RAMPS.pink, bevel: 5 })
  tctx.drawImage(towel, 22, 64)
  tctx.fillStyle = RAMPS.pink[1]
  for (let x = 28; x < 88; x += 8) tctx.fillRect(x, 80, 4, 1)
  drawSprite(tctx, 'icon.shampoo', 38, 8)
  drawSprite(tctx, 'icon.conditioner', 90, 8)

  // 小凳子（木）
  const stool = shapeCanvas(76, 70, union(roundRectF(0, 0, 76, 12, 4), capsuleF(12, 10, 8, 68, 3.2), capsuleF(64, 10, 68, 68, 3.2), capsuleF(10, 44, 66, 44, 2.2)), { ramp: RAMPS.orange, bevel: 3 })

  // 收音机：粉色机身 + 喇叭网 + 金旋钮 + 天线
  const { c: radio, ctx: rdx } = makeCanvas(84, 72)
  const ant = shapeCanvas(30, 34, capsuleF(28, 32, 4, 3, 1.3), { ramp: RAMPS.steel, bevel: 1 })
  rdx.drawImage(ant, 14, 0)
  const body = shapeCanvas(76, 42, roundRectF(0, 0, 76, 42, 8), { ramp: RAMPS.pink, bevel: 6, contrast: 1.15 })
  rdx.drawImage(body, 3, 28)
  const grille = shapeCanvas(34, 28, roundRectF(0, 0, 34, 28, 4), { ramp: RAMPS.steel, bevel: 2, bias: -0.2 })
  rdx.drawImage(grille, 11, 35)
  rdx.fillStyle = RAMPS.steel[0]
  for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 8; xx++) if ((xx + yy) % 2 === 0) rdx.fillRect(15 + xx * 4, 39 + yy * 3, 2, 1)
  for (const [kx, ky] of [
    [54, 38],
    [54, 54],
  ] as const) {
    const knob = shapeCanvas(13, 13, ellipseF(6.5, 6.5, 6, 6), { ramp: g, bevel: 4, contrast: 1.3 })
    rdx.drawImage(knob, kx, ky)
  }

  // 奖牌板（墙上）：木框 + 深色绒布
  const { c: bd, ctx: bdx } = makeCanvas(100, 74)
  const bframe = shapeCanvas(98, 72, minus(roundRectF(0, 0, 98, 72, 4), roundRectF(8, 8, 82, 56, 2)), { ramp: RAMPS.orange, bevel: 3 })
  const cloth = shapeCanvas(84, 58, roundRectF(0, 0, 84, 58, 2), { ramp: RAMPS.bband, bevel: 2, outline: false, bias: -0.35 })
  bdx.drawImage(cloth, 7, 7)
  // 空奖牌位：浅色虚线圈
  bdx.fillStyle = rgba(RAMPS.bband[3], 0.5)
  for (let i = 0; i < 3; i++) {
    const cx = 25 + i * 26
    const cy = 42
    for (let a = 0; a < Math.PI * 2; a += 0.35) bdx.fillRect(Math.round(cx + Math.cos(a) * 8), Math.round(cy + Math.sin(a) * 8), 1, 1)
    bdx.fillRect(cx - 4, 22, 3, 10)
    bdx.fillRect(cx + 1, 22, 3, 10)
  }
  bdx.drawImage(bframe, 0, 0)

  // 理发椅：粉色皮面椅背 / 座 + 不锈钢底座
  const chairBack = shapeCanvas(96, 138, union(roundRectF(0, 0, 96, 138, 18), roundRectF(18, -4, 60, 20, 8)), { ramp: RAMPS.pcap, bevel: 10, contrast: 1.2 })
  const chairSeat = (() => {
    const { c: cs, ctx: cx } = makeCanvas(140, 44)
    for (const ax of [2, 114]) {
      const arm = shapeCanvas(24, 16, roundRectF(0, 0, 24, 16, 6), { ramp: RAMPS.steel, bevel: 4, contrast: 1.3 })
      cx.drawImage(arm, ax, 0)
    }
    const seat = shapeCanvas(118, 30, roundRectF(0, 0, 118, 30, 10), { ramp: RAMPS.pcap, bevel: 8, contrast: 1.2 })
    cx.drawImage(seat, 11, 12)
    return cs
  })()
  const chairBase = (() => {
    const { c: cb, ctx: cx } = makeCanvas(120, 100)
    const col = shapeCanvas(18, 70, roundRectF(0, 0, 18, 70, 3), { ramp: RAMPS.steel, bevel: 5, contrast: 1.4 })
    cx.drawImage(col, 51, 4)
    const foot = shapeCanvas(80, 10, roundRectF(0, 0, 80, 10, 4), { ramp: RAMPS.steel, bevel: 3, contrast: 1.3 })
    cx.drawImage(foot, 20, 44)
    const disk = shapeCanvas(112, 22, ellipseF(56, 11, 56, 10), { ramp: RAMPS.steel, bevel: 6, contrast: 1.4 })
    cx.drawImage(disk, 4, 74)
    return cb
  })()

  // 泳池扶梯 + 游泳圈
  const ladder = shapeCanvas(46, 120, union(capsuleF(6, 4, 6, 118, 3.5), capsuleF(40, 4, 40, 118, 3.5), capsuleF(6, 50, 40, 50, 2.2), capsuleF(6, 84, 40, 84, 2.2), capsuleF(6, 4, 14, -8, 3.5), capsuleF(40, 4, 32, -8, 3.5)), { ramp: RAMPS.steel, bevel: 3, contrast: 1.3 })
  const ring = (() => {
    const { c: rc, ctx: rx } = makeCanvas(70, 40)
    const donut = shapeCanvas(66, 36, minus(ellipseF(33, 18, 32, 17), ellipseF(33, 18, 15, 7)), { ramp: RAMPS.pink, bevel: 7, contrast: 1.2 })
    rx.drawImage(donut, 1, 1)
    // 白色条纹
    rx.fillStyle = RAMPS.pink[4]
    for (const [x, y] of [
      [10, 14],
      [54, 14],
      [30, 30],
    ] as const)
      rx.fillRect(x, y, 5, 4)
    return rc
  })()

  return { mirror, sign, hook, rack, trolley, stool, radio, board: bd, chairBack, chairSeat, chairBase, ladder, ring }
}

/** 物件下方的柔和阴影（环境光遮蔽）。 */
export function softShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, strength = 0.8): void {
  ditherOverlay(ctx, Math.round(cx - rx), Math.round(cy - ry), Math.round(rx * 2), Math.round(ry * 2), rgba(SCENE.ui.text, 0.55), (x, y) => {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
    return Math.max(0, 1 - d) * strength
  })
}

export { bayer }
