// 代码画的剪刀（俯视，刃朝左、把手朝右），按张开程度预先画好几帧。
// 画法按 ART_STYLE：描边用自身色阶最深档、左上受光、造型偏细偏尖。
// 刃：blade 色阶；把手：bladep（粉）色阶；螺丝：steel 色阶。
// 注册名 scissors.f0 … scissors.f5（0 = 合上），影子 scissors.s0 …；可被 assets/sprites/ 同名 png 顶替。

import { RAMPS } from './palette'
import { makeCanvas, registerCanvas, type Sprite } from './sprites'

export const SCISSOR_FRAMES = 6
/** 最大张开半角（弧度） */
const MAX_HALF = 0.42

const PART_NONE = 0
const PART_BLADE = 1
const PART_HANDLE = 2
const PART_SCREW = 3

const RAMP_OF: Record<number, readonly string[]> = {
  [PART_BLADE]: RAMPS.blade,
  [PART_HANDLE]: RAMPS.bladep,
  [PART_SCREW]: RAMPS.steel,
}

export interface ScissorSprites {
  frames: Sprite[]
  shadows: Sprite[]
}

/** radius：刃长的一半（剪刀中心在刃中点，也就是鼠标位置）。 */
export function buildScissors(radius: number, shadowColor: string): ScissorSprites {
  const L = Math.round(radius * 2 + 2)
  const halfH = Math.ceil(L * Math.sin(MAX_HALF)) + 8
  const W = L + 36
  const H = halfH * 2 + 1
  const pivX = L + 4
  const pivY = halfH
  const frames: Sprite[] = []
  const shadows: Sprite[] = []
  for (let f = 0; f < SCISSOR_FRAMES; f++) {
    const a = (f / (SCISSOR_FRAMES - 1)) * MAX_HALF
    const mask = new Uint8Array(W * H)
    const along = new Float32Array(W * H)
    const at = (i: number, j: number): number => (i < 0 || j < 0 || i >= W || j >= H ? PART_NONE : mask[j * W + i]!)

    const sa = Math.sin(a)
    const ca = Math.cos(a)
    // 把手圆环中心：与刃对称，再往外撇一点
    const ha = a + 0.5
    const ringD = 17
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const x = i + 0.5 - pivX
        const y = j + 0.5 - pivY
        let part = PART_NONE
        // 螺丝
        if (x * x + y * y <= 2.4 * 2.4) part = PART_SCREW
        else {
          // 刃：上刃用 (x, y)，下刃把 y 镜像后用同一个判断
          for (const yy of [y, -y]) {
            const u = -(x * ca + yy * sa)
            const v = x * sa - yy * ca
            if (u >= -3 && u <= L) {
              const k = Math.max(0, u) / L
              const w = 0.8 + 3.4 * Math.pow(1 - k, 0.75)
              if (v >= -0.2 && v <= w) {
                part = PART_BLADE
                along[j * W + i] = k
                break
              }
            }
          }
          if (part === PART_NONE) {
            // 把手：柄 + 圆环
            for (const sgn of [-1, 1]) {
              const rx = Math.cos(ha) * ringD
              const ry = sgn * Math.sin(ha) * ringD
              const dx = x - rx
              const dy = y - ry
              const dr = Math.hypot(dx, dy)
              if (dr <= 6.6 && dr >= 3.4) {
                part = PART_HANDLE
                break
              }
              // 柄：从螺丝到圆环的线段
              const t = Math.max(0, Math.min(1, (x * rx + y * ry) / (rx * rx + ry * ry)))
              const ex = x - rx * t
              const ey = y - ry * t
              if (t < 0.7 && ex * ex + ey * ey <= 1.6 * 1.6) {
                part = PART_HANDLE
                break
              }
            }
          }
        }
        mask[j * W + i] = part
      }
    }

    const { c, ctx } = makeCanvas(W, H)
    const sh = makeCanvas(W, H)
    sh.ctx.fillStyle = shadowColor
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const p = at(i, j)
        if (p === PART_NONE) {
          // 描边：四邻里有实心像素就用那个部件色阶的最深档
          const n = at(i, j - 1) || at(i - 1, j) || at(i + 1, j) || at(i, j + 1)
          if (n) {
            ctx.fillStyle = RAMP_OF[n]![0]!
            ctx.fillRect(i, j, 1, 1)
            sh.ctx.fillRect(i, j, 1, 1)
          }
          continue
        }
        sh.ctx.fillRect(i, j, 1, 1)
        const ramp = RAMP_OF[p]!
        const top = at(i, j - 1) !== p
        const left = at(i - 1, j) !== p
        const bottom = at(i, j + 1) !== p
        const right = at(i + 1, j) !== p
        let idx = 2
        if (top) idx = p === PART_BLADE && along[j * W + i]! < 0.75 ? 4 : 3
        else if (left) idx = 3
        else if (bottom || right) idx = 1
        ctx.fillStyle = ramp[idx]!
        ctx.fillRect(i, j, 1, 1)
      }
    }
    const ax = pivX - Math.round(radius)
    frames.push(registerCanvas(`scissors.f${f}`, c, ax, pivY))
    shadows.push(registerCanvas(`scissors.s${f}`, sh.c, ax, pivY))
  }
  return { frames, shadows }
}
