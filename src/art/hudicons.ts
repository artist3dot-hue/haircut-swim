// HUD 小图标（代码画的像素图，注册进 sprites，可被 assets/sprites/ 同名 png 顶替）：
// hud.strand 发丝计数器图标、hud.cap 泳帽线上的小泳帽。

import { SCENE, RAMPS } from './palette'
import { makeCanvas, registerCanvas, type Sprite } from './sprites'

/** 计数器图标：一小束弯弯的头发（深发色 + 蓝灰高光），描边用 UI 深青（14×14）。 */
let strandSp: Sprite | null = null
let capSp: Sprite | null = null

export function strandIcon(): Sprite {
  if (strandSp) return strandSp
  const { c, ctx } = makeCanvas(14, 14)
  const hair = SCENE.hair
  const shape = [
    '...#####......',
    '..#11221#.....',
    '..#12321#.....',
    '...#1221#.....',
    '....#1221#....',
    '....#1221#....',
    '...#1221#.....',
    '..#1221#......',
    '..#1221#......',
    '...#1221#.....',
    '....#1221#....',
    '....#12#1#....',
    '...#1#.#1#....',
    '...##...##....',
  ]
  drawShape(ctx, shape, { '#': SCENE.ui.text, '1': hair[0], '2': hair[2], '3': hair[4] })
  ctx.fillStyle = SCENE.hairGlint[0]
  ctx.fillRect(6, 3, 1, 1)
  ctx.fillRect(9, 7, 1, 1)
  strandSp = registerCanvas('hud.strand', c, 0, 0)
  return strandSp
}

/** 泳帽线上的小泳帽（16×11，bcap 色阶，描边用自身最深档）。 */
export function capIcon(): Sprite {
  if (capSp) return capSp
  const { c, ctx } = makeCanvas(16, 11)
  const shape = [
    '.....######.....',
    '...##443322##...',
    '..#4433322222#..',
    '.#443332222221#.',
    '.#433222222211#.',
    '#43322222222111#',
    '#33222222221111#',
    '################',
    '#5151515151515.#',
    '#1111111111111.#',
    '.##############.',
  ]
  const r = RAMPS.bcap
  const b = RAMPS.bband
  drawShape(ctx, shape, { '#': r[0], '1': r[1], '2': r[2], '3': r[3], '4': r[4], '5': b[3] })
  capSp = registerCanvas('hud.cap', c, 0, 0)
  return capSp
}

export function drawShape(ctx: CanvasRenderingContext2D, shape: readonly string[], col: Record<string, string>): void {
  shape.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const k = row[x]!
      const cc = col[k]
      if (!cc) continue
      ctx.fillStyle = cc
      ctx.fillRect(x, y, 1, 1)
    }
  })
}
