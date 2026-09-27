// 阿发（主界面）：坐在理发椅上，围着淡紫色理发围布，长发从头顶分两边垂到地上铺开。
// 身体各部件用 draw.ts 的体积光照预先画好；脸（表情）、手、长发每帧画。
// 表情：normal 平常 / panic 慌张 / expect 期待握拳 / teary 心疼捂头。

import { SCENE, RAMPS, u32 } from './palette'
import { makeCanvas } from './sprites'
import { shapeCanvas, ellipseF, roundRectF, capsuleF, union } from './draw'
import type { Raster } from '../hair/raster'

export type Expression = 'normal' | 'panic' | 'expect' | 'teary'

export const AFA_X = 270
export const HEAD_Y = 446
/** 大头的中心比身体算的头位置高一点 */
export const HEAD_LIFT = 10
/** 头发在地上铺开的高度 */
export const HAIR_FLOOR_Y = 724

const SKIN = SCENE.skin
const CAPE = RAMPS.label
const PANTS = RAMPS.slate

export interface AfaParts {
  head: HTMLCanvasElement
  hairCap: HTMLCanvasElement
  neck: HTMLCanvasElement
  cape: HTMLCanvasElement
  legs: HTMLCanvasElement
  hand: HTMLCanvasElement
  fist: HTMLCanvasElement
  sleeve: HTMLCanvasElement
}

export function buildAfa(): AfaParts {
  // Q 版大头：脸宽 68、高 76，两边耳朵
  const head = shapeCanvas(80, 80, union(ellipseF(40, 40, 33, 37), ellipseF(6, 44, 5.5, 8.5), ellipseF(74, 44, 5.5, 8.5)), { ramp: SKIN, bevel: 12, contrast: 1.05, shine: false })
  // 头顶的头发：盖住头顶，刘海是一绺一绺的尖，两侧鬓发垂下来
  const HCW = 88
  const HCX = 44
  const hairCap = shapeCanvas(HCW, 80, (x, y) => {
    const top = ((x - HCX) / 41) ** 2 + ((y - 40) / 40) ** 2 <= 1 && y < 38
    // 刘海：锯齿下沿（一绺一绺往下尖）
    const fringe = y >= 38 && y < 38 + 12 - Math.abs(((x - 6) % 13) - 6.5) * 1.6 && x > 8 && x < 80
    const sideL = x < 16 && x > 2 && y < 76 - (16 - x) * 1.0 && ((x - HCX) / 43) ** 2 + ((y - 44) / 44) ** 2 <= 1.25
    const sideR = x > 72 && x < 86 && y < 76 - (x - 72) * 1.0 && ((x - HCX) / 43) ** 2 + ((y - 44) / 44) ** 2 <= 1.25
    return top || fringe || sideL || sideR
  }, { ramp: [SCENE.hair[0], SCENE.hair[0], SCENE.hair[1], SCENE.hair[3], SCENE.hair[4]], bevel: 9, contrast: 1.2 })
  // 头发上的一丝丝纹理 + 高光弧（天使光圈）
  {
    const ctx = hairCap.getContext('2d')!
    ctx.fillStyle = SCENE.hair[2]
    for (let i = 0; i < 12; i++) {
      const x0 = 12 + i * 6
      for (let y = 6; y < 38; y++) {
        const x = Math.round(x0 + (y - 22) * (x0 - HCX) * 0.02)
        if (y % 3 !== i % 3) continue
        const d = ((x - HCX) / 40) ** 2 + ((y - 41) / 39) ** 2
        if (d < 1) ctx.fillRect(x, y, 1, 1)
      }
    }
    ctx.fillStyle = SCENE.hair[4]
    for (let a2 = -2.7; a2 < -1.2; a2 += 0.02) {
      const x = Math.round(HCX + Math.cos(a2) * 30)
      const y = Math.round(36 + Math.sin(a2) * 26)
      ctx.fillRect(x, y, 2, 1)
      if (a2 < -2.0) ctx.fillRect(x, y + 1, 1, 1)
    }
    ctx.fillStyle = SCENE.hairGlint[0]
    ctx.fillRect(24, 14, 4, 1)
    ctx.fillRect(20, 18, 3, 1)
    ctx.fillStyle = SCENE.hairGlint[1]
    ctx.fillRect(25, 14, 1, 1)
  }
  const neck = shapeCanvas(18, 22, roundRectF(0, 0, 18, 22, 3), { ramp: SKIN, bevel: 3, bias: -0.2, shine: false })
  // 理发围布：从脖子往下展开，下摆波浪
  const cape = shapeCanvas(120, 150, (x, y) => {
    const k = y / 150
    const hw = 16 + k * 44 + Math.max(0, (k - 0.1)) * 10
    const hem = 150 - 4 + Math.sin(x * 0.35) * 3
    return Math.abs(x - 60) <= hw && y <= hem && y >= 0
  }, { ramp: CAPE, bevel: 12, contrast: 1.15 })
  {
    // 褶子：几道竖向的暗线，下摆处散开
    const ctx = cape.getContext('2d')!
    ctx.fillStyle = CAPE[1]
    for (const fx of [-26, -12, 10, 26]) {
      for (let y = 40; y < 146; y++) {
        const x = Math.round(61 + fx * (0.6 + (y / 150) * 0.6) + Math.sin(y * 0.08 + fx) * 1.5)
        if (y % 2 === 0) ctx.fillRect(x, y, 1, 1)
      }
    }
    ctx.fillStyle = CAPE[4]
    ctx.fillRect(48, 3, 26, 2)
  }
  // 腿：膝盖朝前（椭圆）+ 小腿 + 鞋
  const legs = (() => {
    const { c, ctx } = makeCanvas(92, 80)
    for (const lx of [24, 68]) {
      const shin = shapeCanvas(18, 50, roundRectF(0, 0, 18, 50, 7), { ramp: PANTS, bevel: 6 })
      ctx.drawImage(shin, lx - 9, 14)
    }
    for (const lx of [24, 68]) {
      const knee = shapeCanvas(36, 26, ellipseF(18, 13, 17, 12), { ramp: PANTS, bevel: 8, contrast: 1.2 })
      ctx.drawImage(knee, lx - 18, 0)
    }
    for (const lx of [22, 70]) {
      const shoe = shapeCanvas(30, 16, union(ellipseF(15, 9, 14, 7), roundRectF(3, 0, 24, 9, 4)), { ramp: [SCENE.hair[0], SCENE.hair[1], SCENE.hair[2], SCENE.hair[3], SCENE.hair[4]], bevel: 5, contrast: 1.3 })
      ctx.drawImage(shoe, lx - 15, 60)
    }
    return c
  })()
  const hand = shapeCanvas(16, 16, union(ellipseF(8, 9, 7, 6.5), capsuleF(4, 6, 2, 1, 2), capsuleF(8, 5, 8, 0, 2), capsuleF(12, 6, 14, 2, 2)), { ramp: SKIN, bevel: 4, shine: false })
  const fist = shapeCanvas(16, 16, union(ellipseF(8, 8, 7.5, 7), capsuleF(3, 5, 12, 5, 2.4)), { ramp: SKIN, bevel: 4, shine: false })
  const sleeve = shapeCanvas(18, 18, ellipseF(9, 9, 8.5, 8.5), { ramp: CAPE, bevel: 5 })
  return { head, hairCap, neck, cape, legs, hand, fist, sleeve }
}

/** 身体（在头发之后、头之前画）：围布、腿、脖子。 */
export function drawAfaBody(ctx: CanvasRenderingContext2D, p: AfaParts, x: number, hy: number): void {
  ctx.drawImage(p.legs, x - 46, hy + 180)
  ctx.drawImage(p.neck, x - 10, hy + 22)
  ctx.drawImage(p.cape, x - 61, hy + 36)
}

/** 头 + 头顶头发 + 表情 + 手（最后画）。 */
export function drawAfaHead(ctx: CanvasRenderingContext2D, p: AfaParts, x: number, hy: number, expr: Expression, t: number): void {
  const cy = hy - HEAD_LIFT
  ctx.drawImage(p.head, x - 40, cy - 41)
  drawFace(ctx, x, cy, expr, t)
  ctx.drawImage(p.hairCap, x - 44, cy - 47)
  drawHands(ctx, p, x, hy, expr, t)
}

function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

function drawFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, expr: Expression, t: number): void {
  const dark = SCENE.hair[0]
  const white = SCENE.ui.panel
  const iris = SCENE.hair[2]
  const glass = RAMPS.glass
  const ey = cy + 8
  const lx = cx - 17
  const rx = cx + 8
  const blink = expr === 'normal' && Math.floor(t * 12) % 43 === 0
  // 腮红（三道小斜线，Q 版常用）
  if (expr !== 'panic') {
    for (const bx of [cx - 26, cx + 17]) {
      px(ctx, RAMPS.pink[3], bx, cy + 18, 9, 3)
      px(ctx, RAMPS.pink[2], bx + 1, cy + 18, 2, 2)
      px(ctx, RAMPS.pink[2], bx + 4, cy + 18, 2, 2)
      px(ctx, RAMPS.pink[2], bx + 7, cy + 18, 2, 2)
    }
  }
  const eye = (x: number, big: boolean): void => {
    if (big) {
      // 瞪大：一圈深色 + 白 + 小瞳孔
      px(ctx, dark, x - 1, ey - 5, 11, 12)
      px(ctx, white, x, ey - 4, 9, 10)
      px(ctx, dark, x + 3, ey - 1, 3, 3)
      return
    }
    // 平常的大眼睛：上眼线粗、深色瞳孔、两个高光
    px(ctx, dark, x - 1, ey - 6, 11, 2)
    px(ctx, white, x, ey - 4, 9, 8)
    px(ctx, iris, x + 1, ey - 4, 7, 8)
    px(ctx, dark, x + 2, ey - 3, 5, 7)
    px(ctx, SCENE.hair[3], x + 2, ey + 2, 5, 1)
    px(ctx, white, x + 2, ey - 3, 2, 2)
    px(ctx, white, x + 5, ey + 1, 1, 1)
    px(ctx, dark, x - 2, ey - 5, 1, 2)
  }
  switch (expr) {
    case 'panic': {
      eye(lx, true)
      eye(rx, true)
      // 八字眉
      px(ctx, dark, lx - 1, ey - 11, 4, 2)
      px(ctx, dark, lx + 3, ey - 13, 5, 2)
      px(ctx, dark, rx + 1, ey - 13, 5, 2)
      px(ctx, dark, rx + 6, ey - 11, 4, 2)
      // O 嘴
      px(ctx, dark, cx - 4, cy + 21, 8, 1)
      px(ctx, dark, cx - 5, cy + 22, 1, 6)
      px(ctx, dark, cx + 4, cy + 22, 1, 6)
      px(ctx, dark, cx - 4, cy + 28, 8, 1)
      px(ctx, RAMPS.pink[0], cx - 4, cy + 22, 8, 6)
      px(ctx, RAMPS.pink[1], cx - 3, cy + 25, 6, 3)
      // 汗珠
      const sy = cy - 18 + Math.round(Math.sin(t * 6))
      px(ctx, glass[0], cx + 34, sy, 6, 8)
      px(ctx, glass[0], cx + 36, sy - 3, 2, 3)
      px(ctx, glass[3], cx + 35, sy + 1, 4, 6)
      px(ctx, glass[4], cx + 35, sy + 2, 1, 3)
      break
    }
    case 'expect': {
      // ^ ^ 眼（粗一点）
      for (const x of [lx, rx]) {
        for (let i = 0; i < 9; i++) {
          const yy = ey - 3 + Math.abs(i - 4)
          px(ctx, dark, x + i, yy, 1, 2)
        }
      }
      // 大笑
      px(ctx, dark, cx - 7, cy + 20, 14, 1)
      px(ctx, dark, cx - 6, cy + 21, 12, 4)
      px(ctx, dark, cx - 4, cy + 25, 8, 1)
      px(ctx, RAMPS.pink[1], cx - 4, cy + 23, 8, 2)
      px(ctx, white, cx - 5, cy + 21, 10, 1)
      break
    }
    case 'teary': {
      // > < 眼
      for (let i = 0; i < 4; i++) {
        px(ctx, dark, lx + 1 + i * 2, ey - 3 + i, 2, 2)
        px(ctx, dark, lx + 1 + i * 2, ey + 3 - i, 2, 2)
        px(ctx, dark, rx + 7 - i * 2, ey - 3 + i, 2, 2)
        px(ctx, dark, rx + 7 - i * 2, ey + 3 - i, 2, 2)
      }
      // 抖动的波浪嘴
      for (let i = 0; i < 12; i++) px(ctx, dark, cx - 6 + i, cy + 23 + (Math.floor(i / 2) % 2), 1, 2)
      // 两道眼泪流下来
      const k = (t * 1.4) % 1
      for (const [x, ph] of [
        [lx + 3, 0],
        [rx + 5, 0.5],
      ] as const) {
        const kk = (k + ph) % 1
        px(ctx, glass[1], x, ey + 4, 2, 5 + Math.round(kk * 12))
        px(ctx, glass[3], x, ey + 9 + Math.round(kk * 12), 3, 3)
        px(ctx, glass[4], x, ey + 9 + Math.round(kk * 12), 1, 1)
      }
      break
    }
    default: {
      if (blink) {
        px(ctx, dark, lx, ey, 9, 2)
        px(ctx, dark, rx, ey, 9, 2)
      } else {
        eye(lx, false)
        eye(rx, false)
      }
      px(ctx, dark, lx, ey - 11, 8, 2)
      px(ctx, dark, rx + 1, ey - 11, 8, 2)
      // 微笑
      px(ctx, dark, cx - 4, cy + 23, 8, 1)
      px(ctx, dark, cx - 5, cy + 22, 1, 1)
      px(ctx, dark, cx + 4, cy + 22, 1, 1)
    }
  }
  // 鼻子
  px(ctx, SKIN[1], cx, cy + 15, 2, 3)
  px(ctx, SKIN[4], cx - 1, cy + 14, 1, 2)
}

function drawHands(ctx: CanvasRenderingContext2D, p: AfaParts, x: number, hy: number, expr: Expression, t: number): void {
  const arm = (x0: number, y0: number, x1: number, y1: number): void => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4)
    for (let i = 0; i <= n; i++) ctx.drawImage(p.sleeve, Math.round(x0 + ((x1 - x0) * i) / n) - 9, Math.round(y0 + ((y1 - y0) * i) / n) - 9)
  }
  switch (expr) {
    case 'expect': {
      const b = Math.round(Math.sin(t * 5) * 2)
      arm(x + 46, hy + 92, x + 44, hy + 40 + b)
      ctx.drawImage(p.fist, x + 36, hy + 20 + b)
      ctx.drawImage(p.hand, x - 40, hy + 150)
      break
    }
    case 'teary':
      arm(x - 50, hy + 90, x - 46, hy - 6)
      arm(x + 50, hy + 90, x + 46, hy - 6)
      ctx.drawImage(p.hand, x - 56, hy - 40)
      ctx.drawImage(p.hand, x + 40, hy - 40)
      break
    case 'panic': {
      const s2 = Math.round(Math.sin(t * 28))
      arm(x - 52, hy + 92, x - 52 + s2, hy + 24)
      arm(x + 52, hy + 92, x + 52 - s2, hy + 24)
      ctx.drawImage(p.hand, x - 62 + s2, hy + 2)
      ctx.drawImage(p.hand, x + 46 - s2, hy + 2)
      break
    }
    default:
      // 手放在腿上（从围布下摆露出来）
      ctx.drawImage(p.hand, x - 32, hy + 156)
      ctx.drawImage(p.hand, x + 16, hy + 156)
  }
}

const HAIR_U32 = SCENE.hair.map((h) => u32(h))
const GLINT = u32(SCENE.hairGlint[0])

/**
 * 阿发的长发：从头顶两边垂下，贴着椅背两侧落到地上，再向两边、向前铺开。
 * amount：剩下的头发长度比例（1 = 刚开局一头拖地长发，0 = 剪到泳帽线）。
 */
export function drawAfaHair(r: Raster, cx: number, cy: number, amount: number, t: number): void {
  const count = 150
  const total = 70 + Math.max(0, amount) * 620
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1)
    const side = u < 0.5 ? -1 : 1
    const spread = Math.abs(u - 0.5) * 2
    const j1 = ((i * 7919) % 97) / 97
    const j2 = ((i * 104729) % 89) / 89
    const a = -Math.PI + 0.35 + u * (Math.PI - 0.7)
    const ox = cx + Math.cos(a) * 34
    const oy = cy - HEAD_LIFT - 4 + Math.sin(a) * 38
    const pts: Array<[number, number]> = [
      [ox, oy],
      [cx + side * (30 + spread * 8), cy + 14],
      [cx + side * (36 + spread * 12 + j1 * 6), cy + 70],
      [cx + side * (46 + spread * 16 + j1 * 8), cy + 160],
      [cx + side * (50 + spread * 22 + j1 * 12), HAIR_FLOOR_Y - 8 + j2 * 10],
    ]
    const reach = 40 + j2 * 230
    pts.push([pts[4]![0] + side * reach * (0.35 + spread * 0.65), HAIR_FLOOR_Y + (j2 - 0.3) * 30 + (1 - spread) * 16])
    const shiny = i % 5 === 2
    let left = total * (0.8 + j1 * 0.35)
    let px = pts[0]![0]
    let py = pts[0]![1]
    let s = 0
    for (let k = 1; k < pts.length && left > 0; k++) {
      const [x0, y0] = pts[k - 1]!
      const [x1, y1] = pts[k]!
      const segLen = Math.hypot(x1 - x0, y1 - y0)
      const steps = Math.max(1, Math.ceil(segLen / 4))
      for (let st = 1; st <= steps && left > 0; st++) {
        const f = st / steps
        let x = x0 + (x1 - x0) * f
        let y = y0 + (y1 - y0) * f
        const d = segLen / steps
        s += d
        left -= d
        const onFloor = k >= 5
        const sway = onFloor ? Math.sin(t * 0.7 + i + s * 0.04) * 1 : Math.sin(t * 1.2 + i * 0.6 - s * 0.025) * Math.min(3, s / 60)
        x += sway + Math.sin(s * 0.1 + i * 1.3) * 2
        if (onFloor) y += Math.sin(s * 0.07 + i) * 1.5
        let v = s < 50 ? 0 : s < 200 ? 1 : 2
        if (u < 0.5 ? i % 3 === 0 : i % 3 === 2) v -= 1
        let c = HAIR_U32[Math.max(0, v)]!
        const cs = Math.cos(s * 0.1 + i)
        if (shiny && s > 20 && cs > 0.8) c = cs > 0.97 ? GLINT : HAIR_U32[cs > 0.92 ? 4 : 3]!
        r.line(px, py, x, y, c, 0, true)
        px = x
        py = y
      }
    }
  }
}

// ---------------------------------------------------------------- 站着的阿发（开场动画、去游泳）

export interface StandingParts {
  torso: HTMLCanvasElement
  shorts: HTMLCanvasElement
  leg: HTMLCanvasElement
  arm: HTMLCanvasElement
  foot: HTMLCanvasElement
}

/** 站姿：蓝色 T 恤、粉色泳裤、光脚。头用坐姿那套（head + hairCap）。 */
export function buildStanding(): StandingParts {
  const shirt = RAMPS.bcap
  const trunks = RAMPS.pcap
  const torso = shapeCanvas(46, 60, (x, y) => {
    const hw = 17 + Math.min(1, y / 10) * 4 - Math.max(0, y - 44) * 0.1
    return Math.abs(x - 23) <= hw && y >= 0 && y <= 58
  }, { ramp: shirt, bevel: 8, contrast: 1.1 })
  {
    const c = torso.getContext('2d')!
    c.fillStyle = SKIN[2]
    c.fillRect(17, 0, 12, 4)
    c.fillStyle = shirt[4]
    c.fillRect(8, 20, 30, 2)
  }
  const shorts = shapeCanvas(44, 26, (x, y) => (Math.abs(x - 22) <= 20 && y <= 14) || ((Math.abs(x - 11) <= 9 || Math.abs(x - 33) <= 9) && y <= 25), { ramp: trunks, bevel: 5 })
  const leg = shapeCanvas(14, 50, roundRectF(0, 0, 14, 50, 6), { ramp: SKIN, bevel: 5, shine: false })
  const arm = shapeCanvas(12, 50, roundRectF(0, 0, 12, 50, 6), { ramp: SKIN, bevel: 4, shine: false })
  const foot = shapeCanvas(22, 10, union(ellipseF(12, 6, 10, 4.5), roundRectF(2, 0, 12, 7, 3)), { ramp: SKIN, bevel: 3, shine: false })
  return { torso, shorts, leg, arm, foot }
}

/**
 * 站着 / 走路的阿发。(x, groundY) 是两脚中间的地面；walk 0..1 走路相位（-1 = 站定）。
 * 头发画在 raster 上（传进来之前清空），拖在身后地上。
 */
export function drawStanding(ctx: CanvasRenderingContext2D, p: AfaParts, s: StandingParts, x: number, groundY: number, walk: number, expr: Expression, t: number, cap: 'none' | 'on' = 'none'): void {
  const step = walk < 0 ? 0 : Math.sin(walk * Math.PI * 2)
  const bob = walk < 0 ? 0 : Math.round(Math.abs(Math.cos(walk * Math.PI * 2)) * 3)
  const hipY = groundY - 60 - bob
  const headY = hipY - 92
  // 后面的手臂和腿
  ctx.drawImage(s.arm, Math.round(x + 14 - step * 6), hipY - 66)
  ctx.drawImage(s.leg, Math.round(x + 2 - step * 8), hipY + 4)
  ctx.drawImage(s.foot, Math.round(x - 2 - step * 8), groundY - 9)
  ctx.drawImage(s.leg, Math.round(x - 16 + step * 8), hipY + 4)
  ctx.drawImage(s.foot, Math.round(x - 20 + step * 8), groundY - 9)
  ctx.drawImage(s.shorts, x - 22, hipY - 6)
  ctx.drawImage(s.torso, x - 23, hipY - 62)
  ctx.drawImage(p.neck, x - 9, headY + 22)
  ctx.drawImage(s.arm, Math.round(x - 26 + step * 6), hipY - 66)
  const cy = headY - HEAD_LIFT
  ctx.drawImage(p.head, x - 40, cy - 41)
  drawFace(ctx, x, cy, expr, t)
  if (cap === 'on') {
    drawCapOn(ctx, x, headY)
  } else {
    ctx.drawImage(p.hairCap, x - 44, cy - 47)
  }
}

/** 戴在头上的泳帽（把头发全包住，鼓鼓的）。 */
export function drawCapOn(ctx: CanvasRenderingContext2D, x: number, headY: number): void {
  if (!capCanvas) capCanvas = shapeCanvas(90, 54, (xx, yy) => ((xx - 45) / 44) ** 2 + ((yy - 44) / 43) ** 2 <= 1 && yy < 50, { ramp: RAMPS.bcap, bevel: 11, contrast: 1.2 })
  const cy = headY - HEAD_LIFT
  ctx.drawImage(capCanvas, x - 46, cy - 52)
  ctx.fillStyle = RAMPS.bband[1]
  ctx.fillRect(x - 42, cy - 4, 84, 3)
  ctx.fillStyle = RAMPS.bband[3]
  ctx.fillRect(x - 42, cy - 4, 84, 1)
}
let capCanvas: HTMLCanvasElement | null = null

/** 站着时拖在身后的长发（从头顶往后、往下，拖到地上）。dir = 走的方向（1 向右），长发拖在反方向。 */
export function drawStandingHair(r: Raster, x: number, headY: number, groundY: number, amount: number, dir: number, t: number): void {
  const count = 220
  const total = 60 + amount * 520
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1)
    const j1 = ((i * 7919) % 97) / 97
    const a = -Math.PI + 0.3 + u * (Math.PI - 0.6)
    const ox = x + Math.cos(a) * 34
    const oy = headY - HEAD_LIFT - 4 + Math.sin(a) * 38
    const back = -dir
    const pts: Array<[number, number]> = [
      [ox, oy],
      [x + (u - 0.5) * 50 + back * 10, headY + 30],
      [x + back * (18 + j1 * 16), headY + 110],
      [x + back * (26 + j1 * 30), groundY - 6 + j1 * 6],
      [x + back * (70 + j1 * 300), groundY - 2 + (j1 - 0.5) * 22],
    ]
    let left = total * (0.8 + j1 * 0.35)
    let px = pts[0]![0]
    let py = pts[0]![1]
    let s = 0
    for (let k = 1; k < pts.length && left > 0; k++) {
      const [x0, y0] = pts[k - 1]!
      const [x1, y1] = pts[k]!
      const segLen = Math.hypot(x1 - x0, y1 - y0)
      const steps = Math.max(1, Math.ceil(segLen / 4))
      for (let st = 1; st <= steps && left > 0; st++) {
        const f = st / steps
        const d = segLen / steps
        s += d
        left -= d
        const xx = x0 + (x1 - x0) * f + Math.sin(t * 2 + i + s * 0.05) * Math.min(3, s / 60) + Math.sin(s * 0.1 + i) * 2
        const yy = y0 + (y1 - y0) * f
        let v = s < 50 ? 0 : s < 200 ? 1 : 2
        if (i % 3 === 0) v -= 1
        let c = HAIR_U32[Math.max(0, v)]!
        if (i % 5 === 2 && Math.cos(s * 0.1 + i) > 0.85 && s > 20) c = HAIR_U32[3]!
        r.line(px, py, xx, yy, c, 0, true)
        px = xx
        py = yy
      }
    }
  }
}
