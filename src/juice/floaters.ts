// 飘字：收益数字从断口弹出、上飘、淡出。连击越高字越大、越偏金色。

import { drawPixelText, FONT_HUD, FONT_TINY, type PixelFont } from '../art/pixelfont'
import { SCENE } from '../art/palette'

interface Floater {
  text: string
  x: number
  y: number
  age: number
  life: number
  rise: number
  scale: number
  color: string
  font: PixelFont
  /** 横向漂移 */
  drift: number
}

export class Floaters {
  private list: Floater[] = []

  add(text: string, x: number, y: number, o: { life: number; rise: number; scale?: number; color: string; big?: boolean; drift?: number }): void {
    if (this.list.length > 160) this.list.shift()
    this.list.push({
      text,
      x,
      y,
      age: 0,
      life: o.life,
      rise: o.rise,
      scale: o.scale ?? 1,
      color: o.color,
      font: o.big ? FONT_HUD : FONT_TINY,
      drift: o.drift ?? 0,
    })
  }

  update(dt: number): void {
    let w = 0
    for (const f of this.list) {
      f.age += dt
      if (f.age < f.life) this.list[w++] = f
    }
    this.list.length = w
  }

  get count(): number {
    return this.list.length
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const f of this.list) {
      const k = f.age / f.life
      // 弹出：先快后慢（ease-out），开头 0.08 秒大一号
      const e = 1 - (1 - k) * (1 - k) * (1 - k)
      const pop = f.age < 0.08 ? 1 : 0
      const y = f.y - f.rise * e - pop
      const x = f.x + f.drift * e
      const alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
      drawPixelText(ctx, f.font, f.text, x, y, { color: f.color, outline: SCENE.ui.text, align: 'center', scale: f.scale + pop, alpha })
    }
  }
}
