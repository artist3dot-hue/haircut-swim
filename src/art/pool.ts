// 第 1 层「小区泳池」的代码像素图：青绿瓷砖墙、米黄池边、珊瑚粉线。
// 只取画风（颜色、细网格、左上受光），构图按 GDD 自己排。

import { SCENE } from './palette'
import { Rng } from '../core/rng'

/**
 * 画一片青绿瓷砖。tile 为瓷砖边长（含 1px 缝）。
 * 每块砖：中间色打底 + 稀疏抖点质感 + 左上 1px 亮边 + 右下 1px 暗边，缝用米黄。
 */
export function drawTiles(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, tile = 20, seed = 7): void {
  const rng = new Rng(seed)
  const [light, mid, shade, deep] = SCENE.tile
  ctx.fillStyle = SCENE.grout
  ctx.fillRect(x0, y0, w, h)
  for (let ty = y0; ty < y0 + h; ty += tile) {
    for (let tx = x0; tx < x0 + w; tx += tile) {
      const inner = tile - 1
      // 每块砖的底色在两档青绿之间轻微变化
      ctx.fillStyle = rng.chance(0.3) ? light : mid
      ctx.fillRect(tx + 1, ty + 1, inner, inner)
      // 抖点质感
      const dots = Math.floor(inner * inner * 0.06)
      for (let d = 0; d < dots; d++) {
        const px = tx + 1 + rng.int(0, inner - 1)
        const py = ty + 1 + rng.int(0, inner - 1)
        ctx.fillStyle = rng.chance(0.55) ? shade : light
        ctx.fillRect(px, py, 1, 1)
      }
      // 左上受光、右下暗边
      ctx.fillStyle = light
      ctx.fillRect(tx + 1, ty + 1, inner, 1)
      ctx.fillRect(tx + 1, ty + 1, 1, inner)
      ctx.fillStyle = shade
      ctx.fillRect(tx + 1, ty + tile - 1, inner, 1)
      ctx.fillRect(tx + tile - 1, ty + 1, 1, inner)
      // 偶尔一块砖有深色小缺角，避免太规整
      if (rng.chance(0.05)) {
        ctx.fillStyle = deep
        ctx.fillRect(tx + tile - 2, ty + tile - 2, 1, 1)
      }
    }
  }
}

/** 米黄池边条（水平），带珊瑚粉线。 */
export function drawPoolside(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number): void {
  ctx.fillStyle = SCENE.poolside
  ctx.fillRect(x0, y0, w, h)
  // 砖缝
  ctx.fillStyle = SCENE.grout
  for (let x = x0; x < x0 + w; x += 24) ctx.fillRect(x, y0, 1, h)
  ctx.fillRect(x0, y0 + h - 1, w, 1)
  // 珊瑚粉线
  ctx.fillStyle = SCENE.coral
  ctx.fillRect(x0, y0, w, 2)
}
