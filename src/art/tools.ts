// 五种剪发工具的代码像素图（俯视、刃朝左、把手朝右）。按张开程度预先画好几帧。
// 用 draw.ts 的体积光照：刃是金属（亮边 + 高光），把手是塑料 / 木头。
// 注册名 tool.<id>.f0…f5（0 = 合上）、影子 tool.<id>.s0…；可被 assets/sprites/ 同名 png 顶替。
// 锚点 = 刃的中点（也就是剪断判定线段的中心 = 鼠标位置）。

import { RAMPS, SCENE } from './palette'
import { makeCanvas, registerCanvas, type Sprite } from './sprites'
import { shadeMask, capsuleF, polyF, type ShadeOpts } from './draw'
import type { ToolId } from '../data/tools'

export const TOOL_FRAMES = 6

export interface ToolSprites {
  frames: Sprite[]
  shadows: Sprite[]
}

type F = (x: number, y: number) => boolean

interface Part {
  f: F
  o: ShadeOpts
}

/** 把几个部件（后画的盖住先画的）画成一帧，外加一张影子。 */
function renderParts(w: number, h: number, parts: Part[], shadowColor: string): { c: HTMLCanvasElement; s: HTMLCanvasElement } {
  const { c, ctx } = makeCanvas(w, h)
  const sh = makeCanvas(w, h)
  sh.ctx.fillStyle = shadowColor
  for (const p of parts) {
    const mask = new Uint8Array(w * h)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (p.f(x + 0.5, y + 0.5)) {
          mask[y * w + x] = 1
        }
      }
    }
    shadeMask(ctx, mask, w, h, 0, 0, p.o)
    for (let i = 0; i < w * h; i++) if (mask[i]) sh.ctx.fillRect(i % w, (i / w) | 0, 1, 1)
  }
  return { c: c, s: sh.c }
}

interface ScissorStyle {
  radius: number
  bladeW: number
  blade: readonly string[]
  handle: readonly string[]
  maxHalf: number
  /** 把手：圆环 or 长柄 */
  long: boolean
  ringR: number
  armLen: number
}

function scissorFrames(id: ToolId, st: ScissorStyle): ToolSprites {
  const L = st.radius * 2 + 2
  const reach = st.long ? st.armLen + 14 : st.armLen + st.ringR * 2 + 6
  const halfH = Math.ceil(Math.max(L * Math.sin(st.maxHalf) + st.bladeW, st.long ? st.armLen * Math.sin(st.maxHalf + 0.25) + 10 : st.ringR * 2 + 12)) + 4
  const W = L + reach + 8
  const H = halfH * 2 + 1
  const pivX = L + 4
  const pivY = halfH
  const frames: Sprite[] = []
  const shadows: Sprite[] = []
  for (let f = 0; f < TOOL_FRAMES; f++) {
    const a = (f / (TOOL_FRAMES - 1)) * st.maxHalf
    const blades: F[] = []
    for (const sgn of [-1, 1]) {
      // 上刃（sgn=-1）往左上张开；刃的一侧平直（刃口），另一侧鼓
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      blades.push((x, y) => {
        const lx = x - pivX
        const ly = (y - pivY) * -sgn
        const u = -(lx * ca + ly * sa)
        const v = lx * sa - ly * ca
        if (u < -4 || u > L) return false
        const k = Math.max(0, u) / L
        const w = 0.8 + st.bladeW * Math.pow(1 - k, 0.7) * (1 - Math.pow(k, 6))
        return v >= -0.3 && v <= w
      })
    }
    const handles: F[] = []
    for (const sgn of [-1, 1]) {
      const ha = a + (st.long ? 0.12 : 0.5)
      const ex = Math.cos(ha) * st.armLen
      const ey = sgn * Math.sin(ha) * st.armLen
      if (st.long) {
        handles.push(capsuleF(pivX + 2, pivY, pivX + ex, pivY + ey, st.ringR))
      } else {
        const rx = pivX + ex
        const ry = pivY + ey
        const arm = capsuleF(pivX, pivY, pivX + ex * 0.72, pivY + ey * 0.72, 2)
        handles.push((x, y) => {
          const d = Math.hypot(x - rx, y - ry)
          return (d <= st.ringR && d >= st.ringR * 0.52) || arm(x, y)
        })
      }
    }
    const screw: F = (x, y) => (x - pivX) ** 2 + (y - pivY) ** 2 <= 2.6 * 2.6
    const parts: Part[] = [
      ...handles.map((h) => ({ f: h, o: { ramp: st.handle, bevel: st.long ? 3 : 2, contrast: 1.1 } })),
      ...blades.map((b) => ({ f: b, o: { ramp: st.blade, bevel: 1.5, contrast: 1.3, bias: 0.05 } })),
      { f: screw, o: { ramp: RAMPS.steel, bevel: 2, contrast: 1.2 } },
    ]
    const { c, s } = renderParts(W, H, parts, SCENE.tile[3])
    const ax = pivX - st.radius
    frames.push(registerCanvas(`tool.${id}.f${f}`, c, ax, pivY))
    shadows.push(registerCanvas(`tool.${id}.s${f}`, s, ax, pivY))
  }
  return { frames, shadows }
}

/** 小刀：美工刀，橙色刀柄 + 斜口刀片。帧 0 = 划下去的瞬间（刀片压低），其余是平举。 */
function knifeFrames(): ToolSprites {
  const W = 58
  const H = 24
  const cy = 12
  const frames: Sprite[] = []
  const shadows: Sprite[] = []
  for (let f = 0; f < TOOL_FRAMES; f++) {
    const tilt = f === 0 ? 3 : f === 1 ? 1.5 : 0
    // 刀片：左边是尖，下沿是刃口（贴着判定线）
    const blade = polyF([
      [4, cy + tilt * 0.6],
      [26, cy - 5 + tilt * 0.3],
      [28, cy - 5],
      [28, cy + 1],
      [8, cy + 1 + tilt * 0.5],
    ])
    const handle: F = (x, y) => {
      if (x < 26 || x > 54) return false
      const top = cy - 6
      const bot = cy + 4
      const r = 3
      const cx2 = Math.max(26 + r, Math.min(54 - r, x))
      const cy2 = Math.max(top + r, Math.min(bot - r, y))
      return (x - cx2) ** 2 + (y - cy2) ** 2 <= r * r
    }
    const grip: F = (x, y) => x > 32 && x < 50 && y > cy - 4 && y < cy + 2 && Math.floor(x) % 4 === 0
    const parts: Part[] = [
      { f: handle, o: { ramp: RAMPS.orange, bevel: 3, contrast: 1.1 } },
      { f: grip, o: { ramp: RAMPS.orange, bevel: 0, bias: -0.35, outline: false } },
      { f: blade, o: { ramp: RAMPS.steel, bevel: 1.2, contrast: 1.4, bias: 0.1 } },
    ]
    const { c, s } = renderParts(W, H, parts, SCENE.tile[3])
    // 锚点：刃口中点
    frames.push(registerCanvas(`tool.knife.f${f}`, c, 16, cy))
    shadows.push(registerCanvas(`tool.knife.s${f}`, s, 16, cy))
  }
  return { frames, shadows }
}

/** 电推子：slate 机身 + steel 刀头（竖着的梳齿），帧用来做震动时的左右偏移。 */
function clipperFrames(): ToolSprites {
  const W = 92
  const H = 42
  const cy = 21
  const frames: Sprite[] = []
  const shadows: Sprite[] = []
  for (let f = 0; f < TOOL_FRAMES; f++) {
    const body: F = (x, y) => {
      if (x < 12 || x > 88) return false
      const hw = 12 + (x - 12) * 0.02 - Math.max(0, x - 78) * 0.6
      return Math.abs(y - cy) <= hw
    }
    const head: F = (x, y) => x >= 6 && x <= 14 && Math.abs(y - cy) <= 15
    const teeth: F = (x, y) => x >= 2 && x < 7 && Math.abs(y - cy) <= 14 && Math.floor(y) % 3 !== 0
    const light: F = (x, y) => (x - 70) ** 2 + (y - cy + 5) ** 2 <= 4
    const switchF: F = (x, y) => x > 40 && x < 56 && y > cy - 4 && y < cy + 3
    const parts: Part[] = [
      { f: body, o: { ramp: RAMPS.slate, bevel: 6, contrast: 1.2 } },
      { f: switchF, o: { ramp: RAMPS.steel, bevel: 2 } },
      { f: head, o: { ramp: RAMPS.steel, bevel: 2, contrast: 1.3 } },
      { f: teeth, o: { ramp: RAMPS.steel, bevel: 0.8, bias: 0.1, outline: false } },
      { f: light, o: { ramp: f % 2 === 0 ? RAMPS.gem : RAMPS.pink, bevel: 1, bias: 0.2 } },
    ]
    const { c, s } = renderParts(W, H, parts, SCENE.tile[3])
    frames.push(registerCanvas(`tool.clipper.f${f}`, c, 4, cy))
    shadows.push(registerCanvas(`tool.clipper.s${f}`, s, 4, cy))
  }
  return { frames, shadows }
}

const cache = new Map<string, ToolSprites>()

/** radius：这把工具实际的半刃长（技能"长刃"会加长，图也跟着变长）。 */
export function toolSprites(id: ToolId, radius: number): ToolSprites {
  const key = `${id}:${Math.round(radius)}`
  let s = cache.get(key)
  if (s) return s
  const r = Math.round(radius)
  switch (id) {
    case 'knife':
      s = knifeFrames()
      break
    case 'clipper':
      s = clipperFrames()
      break
    case 'scissors':
      s = scissorFrames(id, { radius: r, bladeW: 3.6, blade: RAMPS.blade, handle: RAMPS.bladep, maxHalf: 0.42, long: false, ringR: 7.5, armLen: 18 })
      break
    case 'shears':
      s = scissorFrames(id, { radius: r, bladeW: 3.2, blade: RAMPS.steel, handle: RAMPS.gold, maxHalf: 0.34, long: false, ringR: 8, armLen: 22 })
      break
    case 'garden':
      s = scissorFrames(id, { radius: r, bladeW: 7, blade: RAMPS.steel, handle: RAMPS.orange, maxHalf: 0.3, long: true, ringR: 4.5, armLen: 70 })
      break
  }
  cache.set(key, s)
  return s
}
