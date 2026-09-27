// 剪发画面最上方的头顶：只露出一点头顶和发缝，头发从下沿的弧线垂下。
// 头顶整片是梳过的头发（深色 + 左上一条光泽带），中间一条发缝露出头皮。
// 头皮借用暖粉地砖色阶（palette 里没有专门的肤色，决策见 PROGRESS.md）。

import { SCENE } from './palette'
import { Rng } from '../core/rng'
import { scalpY } from '../hair/field'

export function drawScalp(ctx: CanvasRenderingContext2D, w: number, seed = 3): void {
  const rng = new Rng(seed)
  const hair = SCENE.hair
  const [skinLight, skinMid, skinShade] = SCENE.floor
  const partX = Math.round(w * 0.42)
  // 发缝：从画面顶端往下弯一点，越往下越窄
  const partAt = (y: number): number => partX + Math.round(Math.sin(y * 0.25) * 0.8 + y * 0.15)
  const partLen = 22

  for (let x = 0; x < w; x++) {
    const bottom = scalpY(x)
    for (let y = 0; y <= bottom; y++) {
      // 梳向：离发缝越远越往两边斜，形成一丝丝的纹理
      const side = x < partAt(y) ? -1 : 1
      const dx = x - partAt(y)
      const strandId = Math.floor((dx - side * y * 0.9) / 2.2)
      const hash = ((strandId * 73856093) ^ 19349663) >>> 0
      let ci = hash % 3 === 0 ? 2 : hash % 3 === 1 ? 1 : 0
      // 光泽带：左上方一条弧形的亮带（光源在左上）
      const band = Math.abs(y - (10 + Math.abs(dx) * 0.05)) < 3 && x < w * 0.62
      if (band && ci >= 1) ci = rng.chance(0.15) ? 4 : 3
      // 右边、下沿暗一点
      if (x > w * 0.8 || y >= bottom - 1) ci = Math.max(0, ci - 1)
      ctx.fillStyle = hair[ci]!
      ctx.fillRect(x, y, 1, 1)
    }
  }
  // 发缝露出的头皮：左亮右暗，末端收尖
  for (let y = 0; y < partLen; y++) {
    const px = partAt(y)
    const width = y < partLen - 6 ? 2 : 1
    ctx.fillStyle = skinLight
    ctx.fillRect(px, y, 1, 1)
    if (width > 1) {
      ctx.fillStyle = skinMid
      ctx.fillRect(px + 1, y, 1, 1)
    }
    ctx.fillStyle = skinShade
    ctx.fillRect(px + width, y, 1, 1)
  }
}
