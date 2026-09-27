// 通用弹窗：奶白面板 + 珊瑚粉边 + 深青字，几行说明 + 竖排按钮。全部画在 Canvas 上。
// 面板和按钮底画在低分辨率画布（像素风），文字画在高清层。

import { SCENE, rgba } from '../art/palette'
import { hiText } from '../art/text'
import { W, H } from '../core/screen'

export interface DialogButton {
  label: () => string
  action: () => void
  primary?: boolean
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const PW = 440
const LINE_H = 30
const BTN_H = 54
const BTN_GAP = 12

export class Dialog {
  private age = 0
  private rects: Rect[] = []
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 }
  /** 额外的一行提示（比如"已复制"），几秒后消失 */
  note = ''
  private noteT = 0

  constructor(
    readonly title: string,
    private readonly lines: () => readonly string[],
    private readonly buttons: readonly DialogButton[],
  ) {
    this.layout()
  }

  private layout(): void {
    const n = this.lines().length
    const h = 88 + n * LINE_H + 16 + this.buttons.length * (BTN_H + BTN_GAP) + 30
    const x = Math.round((W - PW) / 2)
    const y = Math.round((H - h) / 2)
    this.panel = { x, y, w: PW, h }
    const by = y + 88 + n * LINE_H + 16
    this.rects = this.buttons.map((_, i) => ({ x: x + 34, y: by + i * (BTN_H + BTN_GAP), w: PW - 68, h: BTN_H }))
  }

  flash(note: string): void {
    this.note = note
    this.noteT = 3
  }

  update(dt: number): void {
    this.age += dt
    if (this.noteT > 0) {
      this.noteT -= dt
      if (this.noteT <= 0) this.note = ''
    }
  }

  /** 点击：点到按钮就执行并返回 true。 */
  tap(x: number, y: number): boolean {
    if (this.age < 0.2) return false
    this.layout()
    for (let i = 0; i < this.rects.length; i++) {
      const r = this.rects[i]!
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.buttons[i]!.action()
        return true
      }
    }
    return false
  }

  render(ctx: CanvasRenderingContext2D, mx: number, my: number): void {
    this.layout()
    ctx.fillStyle = rgba(SCENE.ui.text, 0.55)
    ctx.fillRect(0, 0, W, H)
    const k = Math.min(1, this.age / 0.16)
    const pop = Math.round((1 - k) * 18)
    const p = this.panel
    panelRect(ctx, p.x - pop, p.y - pop, p.w + pop * 2, p.h + pop * 2)
    this.rects.forEach((r, i) => {
      const hover = mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h
      ctx.fillStyle = SCENE.ui.text
      ctx.fillRect(r.x + 1, r.y + 2, r.w - 2, r.h)
      panelRect(ctx, r.x, r.y - (hover ? 1 : 0), r.w, r.h, this.buttons[i]!.primary ? SCENE.ui.border : SCENE.ui.panel)
    })
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    if (this.age < 0.1) return
    const p = this.panel
    const ui = SCENE.ui
    hiText(ctx, this.title, W / 2, p.y + 50, { size: 30, color: ui.text, align: 'center' })
    this.lines().forEach((l, i) => {
      hiText(ctx, l, W / 2, p.y + 88 + i * LINE_H + 8, { size: 18, color: ui.text, align: 'center' })
    })
    this.rects.forEach((r, i) => {
      const b = this.buttons[i]!
      hiText(ctx, b.label(), r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 21, color: b.primary ? ui.panel : ui.text, align: 'center', baseline: 'middle' })
    })
    if (this.note) hiText(ctx, this.note, W / 2, p.y + p.h - 12, { size: 16, color: ui.text, align: 'center', alpha: Math.min(1, this.noteT) })
  }
}

/**
 * 奶白面板 + 珊瑚粉边（2px，圆角），里面上沿一道高光、下沿一道暖色阴影，外面一层深青投影。
 * fill 换成别的颜色可以做按钮。
 */
export function panelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string = SCENE.ui.panel): void {
  x = Math.round(x)
  y = Math.round(y)
  w = Math.round(w)
  h = Math.round(h)
  // 投影
  ctx.fillStyle = rgba(SCENE.ui.text, 0.35)
  ctx.fillRect(x + 3, y + h, w - 4, 2)
  ctx.fillRect(x + w, y + 3, 2, h - 3)
  // 边
  ctx.fillStyle = SCENE.ui.border
  ctx.fillRect(x + 2, y, w - 4, h)
  ctx.fillRect(x, y + 2, w, h - 4)
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2)
  // 底
  ctx.fillStyle = fill
  ctx.fillRect(x + 3, y + 2, w - 6, h - 4)
  ctx.fillRect(x + 2, y + 3, w - 4, h - 6)
  // 上沿高光、下沿阴影
  ctx.fillStyle = rgba(SCENE.hairGlint[1], 0.7)
  ctx.fillRect(x + 3, y + 2, w - 6, 1)
  ctx.fillStyle = rgba(SCENE.ui.text, 0.12)
  ctx.fillRect(x + 3, y + h - 4, w - 6, 2)
}
