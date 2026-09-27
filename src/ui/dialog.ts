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

const PW = 300
const LINE_H = 22
const BTN_H = 38
const BTN_GAP = 10

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
    const h = 64 + n * LINE_H + 12 + this.buttons.length * (BTN_H + BTN_GAP) + 24
    const x = Math.round((W - PW) / 2)
    const y = Math.round((H - h) / 2)
    this.panel = { x, y, w: PW, h }
    const by = y + 64 + n * LINE_H + 12
    this.rects = this.buttons.map((_, i) => ({ x: x + 24, y: by + i * (BTN_H + BTN_GAP), w: PW - 48, h: BTN_H }))
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
    const pop = Math.round((1 - k) * 14)
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
    hiText(ctx, this.title, W / 2, p.y + 36, { size: 22, color: ui.text, align: 'center' })
    this.lines().forEach((l, i) => {
      hiText(ctx, l, W / 2, p.y + 64 + i * LINE_H + 6, { size: 13, color: ui.text, align: 'center' })
    })
    this.rects.forEach((r, i) => {
      const b = this.buttons[i]!
      hiText(ctx, b.label(), r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 15, color: b.primary ? ui.panel : ui.text, align: 'center', baseline: 'middle' })
    })
    if (this.note) hiText(ctx, this.note, W / 2, p.y + p.h - 10, { size: 12, color: ui.text, align: 'center', alpha: Math.min(1, this.noteT) })
  }
}

/** 奶白面板 + 珊瑚粉边，切掉四个角的 1px（像素风圆角）。 */
export function panelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string = SCENE.ui.panel): void {
  ctx.fillStyle = SCENE.ui.border
  ctx.fillRect(x + 1, y, w - 2, h)
  ctx.fillRect(x, y + 1, w, h - 2)
  ctx.fillStyle = fill
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4)
}
