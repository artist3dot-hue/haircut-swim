// 去游泳（转生）的过场，约 10 秒，点击跳过：
// 戴上泳帽 → 跳进泳池 → 游啊游 → 游完回家 → 头发又长回来了 → 奖牌结算。
// 在"头发长回来"那一刻调用 onApply（真正的转生：清零、换新头发）。

import { W, H } from '../core/screen'
import { SCENE, RAMPS, rgba } from '../art/palette'
import { hiText } from '../art/text'
import { drawPixelText, FONT_HUD } from '../art/pixelfont'
import { ditherFill, sparkle } from '../art/draw'
import { Raster } from '../hair/raster'
import { drawAfaBody, drawAfaHead, drawAfaHair, drawCapOn, buildStanding, drawStanding, AFA_X, HEAD_Y, HEAD_LIFT, type AfaParts, type StandingParts } from '../art/afa'
import type { Props } from '../art/room'
import { drawWaterFx, WATER_TOP } from '../art/room'
import { drawSwimmer, overHand } from '../art/swimmer'
import { panelRect } from '../ui/dialog'
import { sfx } from '../audio/sfx'
import { S } from '../data/strings'
import { drawMedal } from './pool'

const T_CAP = 1.6
const T_JUMP = 3.0
const T_SWIM = 6.2
const T_HOME = 7.2
const T_GROW = 9.4

interface Drop {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

export class SwimCinematic {
  private t = 0
  done = false
  private applied = false
  private raster = new Raster(W, H)
  private standing: StandingParts
  private drops: Drop[] = []
  private splashed = false
  private panelAge = 0

  constructor(
    private readonly afa: AfaParts,
    private readonly props: Props,
    private readonly roomBg: HTMLCanvasElement,
    private readonly medals: number,
    private readonly loopN: number,
    private readonly onApply: () => void,
  ) {
    this.standing = buildStanding()
  }

  skip(): void {
    if (this.t < T_GROW) {
      this.t = T_GROW
      this.apply()
    }
  }

  private apply(): void {
    if (this.applied) return
    this.applied = true
    this.onApply()
  }

  update(dt: number, taps: Array<{ x: number; y: number }>): void {
    const before = this.t
    this.t += dt
    if (this.t >= T_HOME && !this.applied) this.apply()
    if (before < T_CAP - 0.3 && this.t >= T_CAP - 0.3) sfx.buy()
    if (before < T_JUMP - 0.1 && this.t >= T_JUMP - 0.1) this.splash()
    if (before < T_HOME + 0.2 && this.t >= T_HOME + 0.2) sfx.whoosh()
    if (before < T_GROW && this.t >= T_GROW) sfx.fanfare()
    for (const d of this.drops) {
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.vy += 700 * dt
      d.life -= dt
    }
    this.drops = this.drops.filter((d) => d.life > 0)
    if (this.t >= T_GROW) this.panelAge += dt
    for (const tp of taps) {
      if (this.t < T_GROW) {
        this.skip()
        return
      }
      if (this.panelAge > 0.5 && tp.x > W / 2 - 130 && tp.x < W / 2 + 130 && tp.y > 600 && tp.y < 660) {
        sfx.click()
        this.done = true
      }
    }
  }

  private splash(): void {
    if (this.splashed) return
    this.splashed = true
    sfx.drown()
    for (let i = 0; i < 70; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2
      const v = 150 + Math.random() * 320
      this.drops.push({ x: AFA_X, y: WATER_TOP + 60, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.6 })
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const t = this.t
    if (t < T_JUMP) this.renderPoolside(ctx, t)
    else if (t < T_SWIM) this.renderSwim(ctx, t - T_JUMP)
    else if (t < T_HOME) {
      this.renderSwim(ctx, T_SWIM - T_JUMP)
      ctx.fillStyle = rgba(SCENE.ui.text, Math.min(1, (t - T_SWIM) / 0.6))
      ctx.fillRect(0, 0, W, H)
    } else this.renderHome(ctx, t - T_HOME)
    for (const d of this.drops) {
      ctx.fillStyle = d.life > 0.4 ? SCENE.water[2] : SCENE.water[1]
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 3, 3)
    }
    if (t >= T_GROW) this.renderPanel(ctx)
  }

  /** 泳池边：泳帽从挂钩飞到头上，然后阿发跳进水里。 */
  private renderPoolside(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.drawImage(this.roomBg, 0, 0)
    drawWaterFx(ctx, t, true)
    ctx.drawImage(this.props.sign, 330, 36)
    ctx.drawImage(this.props.chairBase, AFA_X - 60, 638)
    ctx.drawImage(this.props.chairSeat, AFA_X - 70, 588)
    if (t < T_CAP) {
      // 坐着，泳帽飞过来
      ctx.drawImage(this.props.chairBack, AFA_X - 48, 474)
      drawAfaBody(ctx, this.afa, AFA_X, HEAD_Y)
      const k = Math.min(1, t / (T_CAP - 0.3))
      const e = k * k * (3 - 2 * k)
      if (k < 1) {
        drawAfaHead(ctx, this.afa, AFA_X, HEAD_Y, 'expect', t)
        const x = 470 + (AFA_X - 470) * e
        const y = 212 + (HEAD_Y - 212) * e - Math.sin(e * Math.PI) * 120
        drawCapOn(ctx, Math.round(x), Math.round(y) + 30)
      } else {
        ctx.drawImage(this.afa.head, AFA_X - 40, HEAD_Y - HEAD_LIFT - 41)
        drawCapOn(ctx, AFA_X, HEAD_Y)
        for (let i = 0; i < 4; i++) sparkle(ctx, AFA_X - 40 + i * 26, HEAD_Y - 70 + (i % 2) * 10, 3, SCENE.hairGlint[1], RAMPS.gold[4])
      }
      return
    }
    // 跳：沿抛物线从椅子飞进池里
    ctx.drawImage(this.props.chairBack, AFA_X - 48, 474)
    const k = Math.min(1, (t - T_CAP) / (T_JUMP - T_CAP))
    const x = AFA_X + k * 20
    const ground = 720 + (WATER_TOP + 90 - 720) * k - Math.sin(k * Math.PI) * 180
    if (k < 0.95) drawStanding(ctx, this.afa, this.standing, Math.round(x), Math.round(ground), -1, 'expect', t, 'on')
  }

  /** 俯视泳池：阿发戴着泳帽游过去，两边水花。 */
  private renderSwim(ctx: CanvasRenderingContext2D, t: number): void {
    const [w0, w1, w2] = SCENE.water
    ditherFill(ctx, 0, 0, W, H, [w1, w0, SCENE.tile[3]], (_x, y) => 0.3 + (y / H) * 0.6)
    // 泳道线（浮标）
    for (const ly of [240, 720]) {
      for (let x = -40 + ((t * 60) % 40); x < W; x += 20) {
        ctx.fillStyle = (Math.floor((x + t * 60) / 20) % 2 === 0 ? RAMPS.pcap : RAMPS.bband)[2]!
        ctx.fillRect(Math.round(x), ly - 5, 16, 10)
        ctx.fillStyle = SCENE.hairGlint[1]
        ctx.fillRect(Math.round(x) + 3, ly - 4, 5, 2)
      }
    }
    // 水面波纹往后流
    for (let i = 0; i < 90; i++) {
      const x = (i * 71 - t * 90 + 10000) % W
      const y = (i * 131) % H
      ctx.fillStyle = i % 3 === 0 ? w2 : w1
      ctx.fillRect(Math.round(x), y, 10 + (i % 4) * 4, 2)
    }
    // 阿发：俯视自由泳（从左游到右）
    const x = -60 + t * 190
    const y = 480 + Math.sin(t * 5) * 3
    // 身体下面的水影
    ctx.fillStyle = rgba(SCENE.tile[3], 0.35)
    ctx.fillRect(Math.round(x - 140), Math.round(y + 10), 150, 22)
    // 头前面的弓形浪
    for (let i = 0; i < 7; i++) {
      const k = i / 6
      const bx = x + 26 - k * 30
      for (const s of [-1, 1]) {
        ctx.fillStyle = i % 2 ? w2 : SCENE.hairGlint[1]
        ctx.fillRect(Math.round(bx + Math.sin(t * 18 + i) * 2), Math.round(y + s * (16 + k * 22)), 5 - (i >> 1), 2)
      }
    }
    // 脚后面打水的白沫
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 3 ? w2 : SCENE.hairGlint[1]
      ctx.fillRect(Math.round(x - 136 - i * 7 + Math.sin(t * 22 + i) * 3), Math.round(y + Math.sin(i * 1.7 + t * 11) * (6 + i * 0.8)), 4, 3)
    }
    drawSwimmer(ctx, x, y, t)
    // 手入水时的水花
    const hand = overHand(t)
    if (hand.entering) {
      for (let i = 0; i < 3; i++) sparkle(ctx, x + hand.x + 8 + i * 5, y + hand.y + (i - 1) * 6, 2, SCENE.hairGlint[1], w2)
    }
  }

  /** 回到家：对着镜子，头发哗地长回来。 */
  private renderHome(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.drawImage(this.roomBg, 0, 0)
    drawWaterFx(ctx, t, false)
    ctx.drawImage(this.props.mirror, 28, 236)
    ctx.drawImage(this.props.chairBack, AFA_X - 48, 474)
    const k = Math.min(1, t / (T_GROW - T_HOME - 0.3))
    const amount = k * k * 1.15
    const r = this.raster
    r.clear()
    drawAfaHair(r, AFA_X, HEAD_Y, amount, t)
    r.flush()
    ctx.drawImage(r.canvas, 0, 0)
    ctx.drawImage(this.props.chairBase, AFA_X - 60, 638)
    ctx.drawImage(this.props.chairSeat, AFA_X - 70, 588)
    drawAfaBody(ctx, this.afa, AFA_X, HEAD_Y)
    drawAfaHead(ctx, this.afa, AFA_X, HEAD_Y, k > 0.6 ? 'panic' : 'normal', t + 3)
    // 开头一点点黑场淡入
    const fade = Math.max(0, 1 - t / 0.5)
    if (fade > 0) {
      ctx.fillStyle = rgba(SCENE.ui.text, fade)
      ctx.fillRect(0, 0, W, H)
    }
  }

  private renderPanel(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = rgba(SCENE.ui.text, Math.min(0.6, this.panelAge * 2))
    ctx.fillRect(0, 0, W, H)
    const pop = Math.round(Math.max(0, 1 - this.panelAge / 0.2) * 20)
    panelRect(ctx, 50 - pop, 300 - pop, W - 100 + pop * 2, 390 + pop * 2)
    // 奖牌一个个蹦出来
    const shown = Math.min(this.medals, Math.floor(this.panelAge * 8))
    const cols = Math.min(8, Math.max(1, this.medals))
    for (let i = 0; i < Math.min(shown, 16); i++) {
      const x = W / 2 - ((Math.min(cols, 8) - 1) * 44) / 2 + (i % 8) * 44
      const y = 460 + Math.floor(i / 8) * 50
      drawMedal(ctx, x, y, 2)
    }
    drawPixelText(ctx, FONT_HUD, `+${this.medals}`, W / 2, 530, { color: RAMPS.gold[1], outline: null, scale: 4, align: 'center' })
    ctx.fillStyle = SCENE.ui.text
    ctx.fillRect(W / 2 - 129, 605, 258, 56)
    panelRect(ctx, W / 2 - 130, 602, 260, 56, SCENE.ui.border)
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const ui = SCENE.ui
    const t = this.t
    const caption = t < T_CAP ? S.swim.capOn : t < T_JUMP ? S.swim.dive : t < T_SWIM ? S.swim.swimming : t < T_HOME ? S.swim.home : t < T_GROW ? S.swim.regrow : ''
    if (caption) {
      hiText(ctx, caption, W / 2, 160, { size: 34, color: ui.panel, stroke: ui.text, strokeWidth: 5, align: 'center' })
      hiText(ctx, S.swim.skip, W / 2, H - 30, { size: 16, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center', alpha: 0.7 })
    }
    if (t >= T_GROW) {
      hiText(ctx, this.loopN === 1 ? S.swim.title : S.swim.titleN(this.loopN), W / 2, 356, { size: 32, color: ui.text, align: 'center' })
      hiText(ctx, S.swim.medals, W / 2, 404, { size: 20, color: ui.text, align: 'center', alpha: 0.8 })
      hiText(ctx, S.swim.next, W / 2, 631, { size: 22, color: ui.panel, align: 'center', baseline: 'middle' })
    }
  }
}
