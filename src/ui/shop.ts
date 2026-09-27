// 通用商店面板（工具架、奖牌商店）：一行一个商品，左边图标、中间名字和说明、右边价格和按钮。
// 面板和按钮底画在低分辨率画布，文字画在高清层。

import { SCENE, RAMPS, rgba } from '../art/palette'
import { hiText } from '../art/text'
import { drawPixelText, textWidth, FONT_HUD } from '../art/pixelfont'
import { formatNum } from '../core/format'
import { W, H } from '../core/screen'
import { panelRect } from './dialog'
import { sfx } from '../audio/sfx'

export interface ShopItem {
  id: string
  name: string
  desc: string
  /** 右上角的小字（等级、"使用中"） */
  tag: string
  /** null = 买不了（已拥有 / 满级） */
  price: number | null
  /** 按钮上的字（价格为 null 时显示） */
  doneLabel: string
  locked?: boolean
  icon: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void
  buy: () => boolean
}

const PX = 18
const PY = 92
const PW = W - 36
const ROW = 104

export class ShopPanel {
  isOpen = false
  private age = 0
  private shake: Record<string, number> = {}
  private pop: Record<string, number> = {}
  onClose: (() => void) | null = null

  constructor(
    readonly title: string,
    private readonly items: () => ShopItem[],
    /** 钱包：当前余额 + 图标 */
    private readonly wallet: () => number,
    private readonly walletIcon: (ctx: CanvasRenderingContext2D, x: number, y: number) => void,
    private readonly footer: () => string = () => '',
  ) {}

  open(): void {
    this.isOpen = true
    this.age = 0
  }

  close(): void {
    this.isOpen = false
    this.onClose?.()
  }

  private closeRect(): [number, number, number, number] {
    return [W - 118, 26, 100, 46]
  }

  private buyRect(i: number): [number, number, number, number] {
    return [PX + PW - 150, PY + i * ROW + 50, 134, 42]
  }

  update(dt: number, taps: Array<{ x: number; y: number }>): void {
    this.age += dt
    for (const k of Object.keys(this.shake)) this.shake[k] = Math.max(0, this.shake[k]! - dt)
    for (const k of Object.keys(this.pop)) this.pop[k] = Math.max(0, this.pop[k]! - dt)
    if (this.age < 0.2) return
    for (const tp of taps) {
      const [cx, cy, cw, ch] = this.closeRect()
      if (tp.x >= cx && tp.x <= cx + cw && tp.y >= cy && tp.y <= cy + ch) {
        sfx.click()
        this.close()
        return
      }
      this.items().forEach((it, i) => {
        const [bx, by, bw, bh] = this.buyRect(i)
        if (tp.x < bx || tp.x > bx + bw || tp.y < by || tp.y > by + bh) return
        if (it.price === null || it.locked) return
        if (it.buy()) {
          sfx.buy()
          this.pop[it.id] = 0.3
        } else {
          sfx.deny()
          this.shake[it.id] = 0.3
        }
      })
    }
  }

  render(ctx: CanvasRenderingContext2D, mx: number, my: number): void {
    ctx.fillStyle = rgba(SCENE.ui.text, 0.7)
    ctx.fillRect(0, 0, W, H)
    const k = Math.min(1, this.age / 0.16)
    const pop = Math.round((1 - k) * 16)
    const items = this.items()
    const ph = Math.max(300, items.length * ROW + 30)
    panelRect(ctx, PX - pop, PY - 12 - pop, PW + pop * 2, ph + pop * 2)
    // 顶部：余额 + 关闭
    const bal = formatNum(this.wallet())
    const bw = textWidth(FONT_HUD, bal, 3) + 42
    panelRect(ctx, 18, 26, bw, 46)
    this.walletIcon(ctx, 26, 34)
    drawPixelText(ctx, FONT_HUD, bal, 52, 38, { color: SCENE.ui.text, outline: null, scale: 3 })
    const [cx, cy, cw, ch] = this.closeRect()
    panelRect(ctx, cx, cy, cw, ch, SCENE.ui.border)
    items.forEach((it, i) => {
      const y = PY + i * ROW
      const sh = this.shake[it.id] ? Math.round(Math.sin(this.shake[it.id]! * 80) * 3) : 0
      // 分隔线
      if (i > 0) {
        ctx.fillStyle = rgba(SCENE.ui.border, 0.6)
        for (let x = PX + 16; x < PX + PW - 16; x += 4) ctx.fillRect(x, y - 2, 2, 1)
      }
      // 图标底
      const big = this.pop[it.id] ? 2 : 0
      panelRect(ctx, PX + 12 - big, y + 12 - big, 76 + big * 2, 76 + big * 2, it.locked ? SCENE.floor[2] : SCENE.skin[3])
      it.icon(ctx, PX + 50, y + 50)
      if (it.locked) {
        ctx.fillStyle = rgba(SCENE.ui.text, 0.55)
        ctx.fillRect(PX + 14, y + 14, 72, 72)
      }
      const [bx, by, bw2, bh] = this.buyRect(i)
      if (it.price !== null && !it.locked) {
        const afford = this.wallet() >= it.price
        const hover = mx >= bx && mx <= bx + bw2 && my >= by && my <= by + bh
        ctx.fillStyle = SCENE.ui.text
        ctx.fillRect(bx + 1 + sh, by + 3, bw2 - 2, bh)
        panelRect(ctx, bx + sh, by - (hover ? 1 : 0), bw2, bh, afford ? SCENE.ui.border : SCENE.floor[2])
        const pt = formatNum(it.price)
        const tw = textWidth(FONT_HUD, pt, 2) + 22
        this.walletIcon(ctx, bx + sh + bw2 / 2 - tw / 2, by + 11)
        drawPixelText(ctx, FONT_HUD, pt, bx + sh + bw2 / 2 - tw / 2 + 22, by + 14, { color: afford ? SCENE.ui.panel : RAMPS.pink[0], outline: afford ? SCENE.ui.text : null, scale: 2 })
      }
    })
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const ui = SCENE.ui
    const [cx, cy, cw, ch] = this.closeRect()
    hiText(ctx, '返回', cx + cw / 2, cy + ch / 2 + 1, { size: 20, color: ui.panel, align: 'center', baseline: 'middle' })
    hiText(ctx, this.title, W / 2 + 40, 58, { size: 24, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center' })
    this.items().forEach((it, i) => {
      const y = PY + i * ROW
      hiText(ctx, it.name, PX + 104, y + 36, { size: 21, color: it.locked ? rgba(ui.text, 0.5) : ui.text })
      hiText(ctx, it.tag, PX + PW - 18, y + 34, { size: 14, color: RAMPS.pink[0], align: 'right' })
      wrap(ctx, it.desc, PX + 104, y + 62, PW - 280, 15, it.locked ? rgba(ui.text, 0.5) : rgba(ui.text, 0.85))
      if (it.price === null) {
        const [bx, by, bw, bh] = this.buyRect(i)
        hiText(ctx, it.doneLabel, bx + bw / 2, by + bh / 2 + 1, { size: 17, color: RAMPS.bcap[0], align: 'center', baseline: 'middle' })
      }
    })
    const f = this.footer()
    if (f) hiText(ctx, f, W / 2, H - 40, { size: 15, color: ui.panel, stroke: ui.text, strokeWidth: 2, align: 'center' })
  }
}

/** 简单的中文折行（按字宽）。 */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, color: string): void {
  ctx.save()
  ctx.font = `${size}px "ZCOOL QingKe HuangYou", "PingFang SC", "Microsoft YaHei", sans-serif`
  let line = ''
  let yy = y
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      hiText(ctx, line, x, yy, { size, color })
      line = ch
      yy += size + 4
    } else line += ch
  }
  if (line) hiText(ctx, line, x, yy, { size, color })
  ctx.restore()
}
