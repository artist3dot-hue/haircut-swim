// 游戏自己的鼠标指针（画面上 cursor: none，系统指针看不到）：
// arrow 普通箭头、hand 可点击时的手指。深青描边 + 奶白填充，左上受光。
// 剪发时剪刀本身就是指针，场景返回 null 就不画。

import { SCENE } from './palette'

export type CursorKind = 'arrow' | 'hand'

const ARROW = [
  '#.........',
  '##........',
  '#1#.......',
  '#11#......',
  '#111#.....',
  '#1111#....',
  '#11111#...',
  '#111111#..',
  '#1111111#.',
  '#11112###.',
  '#1#12#....',
  '##.#12#...',
  '#..#12#...',
  '....##....',
]

const HAND = [
  '....##.......',
  '...#11#......',
  '...#11#......',
  '...#11#......',
  '...#11###....',
  '...#11#11##..',
  '.###11#11#1#.',
  '#11#1111111#.',
  '#111111111#..',
  '.#11111112#..',
  '..#1111112#..',
  '..#111112#...',
  '...#11112#...',
  '...######....',
]

function draw(ctx: CanvasRenderingContext2D, shape: readonly string[], x: number, y: number): void {
  const col: Record<string, string> = { '#': SCENE.ui.text, '1': SCENE.ui.panel, '2': SCENE.floor[2] }
  for (let j = 0; j < shape.length; j++) {
    const row = shape[j]!
    for (let i = 0; i < row.length; i++) {
      const c = col[row[i]!]
      if (!c) continue
      ctx.fillStyle = c
      ctx.fillRect(x + i, y + j, 1, 1)
    }
  }
}

/** (x, y) 是指针尖的位置（逻辑像素）。 */
export function drawCursor(ctx: CanvasRenderingContext2D, kind: CursorKind, x: number, y: number): void {
  const px = Math.round(x)
  const py = Math.round(y)
  if (kind === 'hand') draw(ctx, HAND, px - 4, py)
  else draw(ctx, ARROW, px, py)
}
