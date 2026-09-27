// 去游泳过场里俯视的阿发：戴泳帽、自由泳（两臂交替划水、腿打水）。
// 各部位分开用 shapeCanvas 画（各自的色阶和体积光），按帧预先生成，第一次用到时才生成。
// 局部坐标以头（泳帽）中心为原点，朝右游。

import { RAMPS, SCENE } from './palette'
import { shapeCanvas, ellipseF, capsuleF, union } from './draw'

/** 一个划水周期的帧数 */
export const SWIM_FRAMES = 12
/** 精灵画布大小与原点位置 */
const SW = 240
const SH = 150
const OX = 160
const OY = 75

const SKIN = SCENE.skin
const ARM_LEN = 50

interface SwimFrame {
  legs: HTMLCanvasElement
  /** 水下那只手（正在往后划） */
  armUnder: HTMLCanvasElement
  /** 水上那只手（从后往前甩） */
  armOver: HTMLCanvasElement
}

let cache: { body: HTMLCanvasElement; cap: HTMLCanvasElement; frames: SwimFrame[] } | null = null

/** 一只手在第 i 帧的肩膀和手的位置（side = 1 下边那只，-1 上边那只）。 */
function armPose(i: number, side: number): { sx: number; sy: number; hx: number; hy: number; under: boolean } {
  const phase = (((i / SWIM_FRAMES + (side > 0 ? 0 : 0.5)) % 1) + 1) % 1
  const sx = -26
  const sy = side * 19
  let a: number
  let spread: number
  const under = phase < 0.5
  if (under) {
    // 水下：手从最前面沿身体侧面划到后面
    a = (phase / 0.5) * Math.PI
    spread = 0.45
  } else {
    // 水上：手从后面划个大圈甩回前面
    a = Math.PI - ((phase - 0.5) / 0.5) * Math.PI
    spread = 0.85
  }
  const hx = sx + Math.cos(a) * ARM_LEN
  const hy = sy + side * Math.sin(a) * ARM_LEN * spread
  return { sx, sy, hx, hy, under }
}

function build(): NonNullable<typeof cache> {
  const L = (f: (x: number, y: number) => boolean) => (x: number, y: number) => f(x - OX, y - OY)
  const body = shapeCanvas(
    SW,
    SH,
    L(union(ellipseF(-44, 0, 36, 22), ellipseF(-18, 0, 12, 12))),
    { ramp: SKIN, bevel: 9, contrast: 1.1 },
  )
  const trunksMask = L(ellipseF(-78, 0, 13, 18))
  const trunks = shapeCanvas(SW, SH, trunksMask, { ramp: RAMPS.pcap, bevel: 6 })
  // 泳裤叠在身体上
  body.getContext('2d')!.drawImage(trunks, 0, 0)
  const cap = shapeCanvas(46, 42, (x, y) => ((x - 23) / 22) ** 2 + ((y - 21) / 19) ** 2 <= 1, { ramp: RAMPS.bcap, bevel: 11, contrast: 1.2 })
  // 泳帽中间一道浅色条纹
  const cctx = cap.getContext('2d')!
  cctx.fillStyle = RAMPS.bband[3]
  cctx.fillRect(8, 20, 30, 2)
  cctx.fillStyle = RAMPS.bband[4]
  cctx.fillRect(10, 20, 10, 1)

  const frames: SwimFrame[] = []
  for (let i = 0; i < SWIM_FRAMES; i++) {
    const kick = Math.sin((i / SWIM_FRAMES) * Math.PI * 4) * 7
    const legs = shapeCanvas(
      SW,
      SH,
      L(union(capsuleF(-84, -8, -134, -9 + kick, 6), capsuleF(-84, 8, -134, 9 - kick, 6))),
      { ramp: SKIN, bevel: 4 },
    )
    const arms: HTMLCanvasElement[] = []
    let underIdx = 0
    for (const side of [1, -1]) {
      const p = armPose(i, side)
      const len = Math.hypot(p.hx - p.sx, p.hy - p.sy) || 1
      const ux = (p.hx - p.sx) / len
      const uy = (p.hy - p.sy) / len
      const f = union(capsuleF(p.sx, p.sy, p.hx, p.hy, 6), ellipseF(p.hx + ux * 4, p.hy + uy * 4, 8, 7))
      arms.push(shapeCanvas(SW, SH, L(f), { ramp: SKIN, bevel: 5, bias: p.under ? -0.15 : 0.1 }))
      if (p.under) underIdx = arms.length - 1
    }
    frames.push({ legs, armUnder: arms[underIdx]!, armOver: arms[1 - underIdx]! })
  }
  return { body, cap, frames }
}

/** 在 (x, y)（头中心）画第 t 秒的游泳姿势。水下的部分半透明，像被水盖住。 */
export function drawSwimmer(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  if (!cache) cache = build()
  const i = Math.floor(t * 10) % SWIM_FRAMES
  const fr = cache.frames[i]!
  const X = Math.round(x) - OX - 1
  const Y = Math.round(y) - OY - 1
  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.drawImage(fr.legs, X, Y)
  ctx.drawImage(fr.armUnder, X, Y)
  ctx.globalAlpha = 0.8
  ctx.drawImage(cache.body, X, Y)
  ctx.restore()
  ctx.drawImage(fr.armOver, X, Y)
  ctx.drawImage(cache.cap, Math.round(x) - 23, Math.round(y) - 21)
}

/** 第 t 秒水上那只手的手掌位置（用来冒水花）。 */
export function overHand(t: number): { x: number; y: number; entering: boolean } {
  const i = Math.floor(t * 10) % SWIM_FRAMES
  for (const side of [1, -1]) {
    const p = armPose(i, side)
    if (!p.under) {
      const phase = (((i / SWIM_FRAMES + (side > 0 ? 0 : 0.5)) % 1) + 1) % 1
      return { x: p.hx, y: p.hy, entering: phase > 0.85 }
    }
  }
  return { x: 0, y: 0, entering: false }
}
