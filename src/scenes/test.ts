// 阶段 0 的测试画面：证明主循环、整数倍放大、调色板、sprites 注册表都正常。
// 打开方式：地址后加 ?scene=test

import type { Scene } from '../core/scene'
import type { Game } from '../game'
import { W, H } from '../core/screen'
import { RAMPS, SCENE } from '../art/palette'
import { drawSprite, spriteNames } from '../art/sprites'
import { drawTiles, drawPoolside } from '../art/pool'
import { makeCanvas } from '../art/sprites'
import { hiText } from '../art/text'
import { drawPixelText, FONT_HUD, FONT_TINY } from '../art/pixelfont'
import { S } from '../data/strings'

export class TestScene implements Scene {
  readonly name = 'test'
  private bg: HTMLCanvasElement
  private t = 0
  private prevT = 0

  constructor(private readonly game: Game) {
    const { c, ctx } = makeCanvas(W, H)
    drawTiles(ctx, 0, 0, W, H)
    drawPoolside(ctx, 0, H - 36, W, 36)
    this.bg = c
  }

  update(dt: number): void {
    this.prevT = this.t
    this.t += dt
  }

  render(alpha: number): void {
    const ctx = this.game.screen.lctx
    const t = this.prevT + (this.t - this.prevT) * alpha
    ctx.drawImage(this.bg, 0, 0)

    // 图标一行（1 倍），奶白面板衬底
    ctx.fillStyle = SCENE.ui.border
    ctx.fillRect(4, 214, W - 8, 62)
    ctx.fillStyle = SCENE.ui.panel
    ctx.fillRect(6, 216, W - 12, 58)
    const icons = spriteNames('icon.')
    const pitch = 32
    icons.forEach((name, i) => {
      const bob = Math.round(Math.sin(t * 3 + i * 0.7) * 1.5)
      drawSprite(ctx, name, W / 2 + (i - (icons.length - 1) / 2) * pitch, 245 + bob)
    })

    // 放大示例：剪刀图标 ×3，证明最近邻放大
    ctx.fillStyle = SCENE.ui.panel
    ctx.fillRect(100, 300, 160, 160)
    drawSprite(ctx, 'icon.scissors', 180, 380, { scale: 3 })

    // 调色板：每个色阶一列
    const names = Object.keys(RAMPS) as Array<keyof typeof RAMPS>
    const colW = 18
    const x0 = Math.round((W - names.length * colW) / 2)
    names.forEach((n, i) => {
      RAMPS[n].forEach((hex, j) => {
        ctx.fillStyle = hex
        ctx.fillRect(x0 + i * colW + 1, 500 + j * 6, colW - 2, 6)
      })
    })

    // 像素数字
    drawPixelText(ctx, FONT_HUD, '1.23K 4.56M 7.89B', W / 2, 160, { color: '#ffffff', outline: SCENE.ui.text, align: 'center', scale: 2 })
    drawPixelText(ctx, FONT_TINY, '+1 +12 +128 x1.5 50!', W / 2, 180, { color: RAMPS.gold[4], outline: SCENE.ui.text, align: 'center', scale: 2 })
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const sc = this.game.screen
    const ui = SCENE.ui
    hiText(ctx, S.test.title, W / 2, 70, { size: 30, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center' })
    hiText(ctx, S.test.res, W / 2, 104, { size: 16, color: ui.panel, stroke: ui.text, strokeWidth: 2, align: 'center' })
    const mode = sc.sharp ? S.test.scaleSharp(sc.scale) : S.test.scaleInt(sc.scale)
    hiText(ctx, mode, W / 2, 128, { size: 16, color: ui.panel, stroke: ui.text, strokeWidth: 2, align: 'center' })
    hiText(ctx, S.test.icons, W / 2, 208, { size: 14, color: ui.text, stroke: ui.panel, strokeWidth: 2, align: 'center' })
    hiText(ctx, S.test.palette, W / 2, 492, { size: 14, color: ui.panel, stroke: ui.text, strokeWidth: 2, align: 'center' })
  }
}
