// 开场动画（约 16 秒，点击跳过；第一次打开自动播放，设置里可以重看）：
// 夏天的泳池 → 阿发拖着长发走进来 → 看到"必须戴泳帽" → 泳帽被头发"嘭"地弹飞 → 心疼 →
// 推车上的小刀闪了一下 → 拿起小刀 → 标题《剪发去游泳》落下 → 点击开始。

import type { Scene } from '../core/scene'
import type { Game } from '../game'
import { W, H } from '../core/screen'
import { SCENE, RAMPS, rgba } from '../art/palette'
import { hiText } from '../art/text'
import { sparkle } from '../art/draw'
import { drawSprite } from '../art/sprites'
import { buildRoomBackground, buildProps, drawWaterFx, drawAirFx, type Props } from '../art/room'
import { buildAfa, buildStanding, drawStanding, drawStandingHair, drawCapOn, type AfaParts, type StandingParts, type Expression } from '../art/afa'
import { toolSprites, TOOL_FRAMES } from '../art/tools'
import { Raster } from '../hair/raster'
import { save, saveGame } from '../core/save'
import { sfx } from '../audio/sfx'
import { S } from '../data/strings'

/** 每句字幕出现的时间 */
const CAPTIONS: Array<[number, number, string]> = [
  [0.3, 2.6, S.intro.summer],
  [2.8, 5.4, S.intro.lines[0]!],
  [5.6, 8.0, S.intro.lines[1]!],
  [8.2, 9.8, S.intro.lines[2]!],
  [10.0, 12.2, S.intro.lines[3]!],
  [12.6, 15.0, S.intro.lines[4]!],
]
const T_TITLE = 15.2
const GROUND = 736

interface Poof {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

export class IntroScene implements Scene {
  readonly name = 'intro'
  private t = 0
  private bg: HTMLCanvasElement
  private props: Props
  private afa: AfaParts
  private standing: StandingParts
  private raster = new Raster(W, H)
  private poofs: Poof[] = []
  private popped = false
  private dinged = false
  private titled = false

  constructor(private readonly game: Game) {
    this.bg = buildRoomBackground()
    this.props = buildProps()
    this.afa = buildAfa()
    this.standing = buildStanding()
    game.input.consumeTaps()
  }

  private finish(): void {
    save.introSeen = true
    saveGame()
    this.game.goto('pool')
  }

  update(dt: number): void {
    const before = this.t
    this.t += dt
    const taps = this.game.input.consumeTaps()
    this.game.input.consumeKeys()
    if (taps.length) {
      sfx.click()
      if (this.t < T_TITLE) this.t = T_TITLE + 0.8
      else if (this.t > T_TITLE + 0.6) this.finish()
    }
    // 泳帽被弹飞
    if (before < 10.4 && this.t >= 10.4 && !this.popped) {
      this.popped = true
      sfx.jam()
      sfx.drown()
      for (let i = 0; i < 60; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6
        const v = 80 + Math.random() * 220
        this.poofs.push({ x: 300, y: 560, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5 })
      }
    }
    if (before < 12.8 && this.t >= 12.8 && !this.dinged) {
      this.dinged = true
      sfx.ding()
    }
    if (before < T_TITLE && this.t >= T_TITLE && !this.titled) {
      this.titled = true
      sfx.fanfare()
    }
    for (const p of this.poofs) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 400 * dt
      p.life -= dt
    }
    this.poofs = this.poofs.filter((p) => p.life > 0)
  }

  /** 阿发的位置、走路相位、表情、泳帽状态。 */
  private pose(): { x: number; walk: number; expr: Expression; cap: 'none' | 'on'; capFly: [number, number] | null } {
    const t = this.t
    if (t < 2.6) return { x: -80, walk: -1, expr: 'normal', cap: 'none', capFly: null }
    if (t < 6.4) {
      // 从左边走进来
      const k = (t - 2.6) / 3.8
      return { x: Math.round(-60 + k * 360), walk: (t * 1.6) % 1, expr: 'normal', cap: 'none', capFly: null }
    }
    if (t < 8.2) return { x: 300, walk: -1, expr: 'expect', cap: 'none', capFly: null }
    if (t < 10.4) {
      // 从挂钩上拿泳帽往头上套
      const k = Math.min(1, (t - 8.2) / 1.8)
      return { x: 300, walk: -1, expr: 'expect', cap: 'none', capFly: [470 + (300 - 470) * k, 212 + (560 - 212) * k - Math.sin(k * Math.PI) * 60] }
    }
    if (t < 12.6) {
      // 泳帽被弹飞，心疼
      const k = Math.min(1, (t - 10.4) / 1.2)
      return { x: 300, walk: -1, expr: t < 11 ? 'panic' : 'teary', cap: 'none', capFly: k < 1 ? [300 + k * 260, 560 - Math.sin(k * Math.PI) * 300 - k * 100] : null }
    }
    return { x: 300, walk: -1, expr: 'expect', cap: 'none', capFly: null }
  }

  render(): void {
    const ctx = this.game.screen.lctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    const t = this.t
    ctx.drawImage(this.bg, 0, 0)
    drawWaterFx(ctx, t, false)
    drawAirFx(ctx, t)
    ctx.drawImage(this.props.ring, 96 + Math.round(Math.sin(t * 0.5) * 6), 858 + Math.round(Math.sin(t * 1.3) * 2))
    ctx.drawImage(this.props.ladder, 452, 740)
    ctx.drawImage(this.props.sign, 330, 36)
    ctx.drawImage(this.props.hook, 440, 160)
    ctx.drawImage(this.props.mirror, 28, 236)
    ctx.drawImage(this.props.rack, 330, 398)
    ctx.drawImage(this.props.trolley, 36, 600)
    // 推车上的小刀（闪一下）
    const knife = toolSprites('knife', 10).frames[TOOL_FRAMES - 1]!
    if (t < 13.4) drawSprite(ctx, knife, 70, 630)
    if (t > 12.6 && t < 13.4) sparkle(ctx, 60, 626, 6, SCENE.hairGlint[1], RAMPS.gold[4])
    ctx.drawImage(this.props.stool, 430, 664)
    ctx.drawImage(this.props.radio, 426, 600)
    ctx.drawImage(this.props.chairBack, 222, 474)
    ctx.drawImage(this.props.chairBase, 210, 638)
    ctx.drawImage(this.props.chairSeat, 200, 588)

    const p = this.pose()
    if (p.x > -70) {
      const r = this.raster
      r.clear()
      drawStandingHair(r, p.x, GROUND - 60 - 92, GROUND, 1.1, 1, t)
      r.flush()
      ctx.drawImage(r.canvas, 0, 0)
      drawStanding(ctx, this.afa, this.standing, p.x, GROUND, p.walk, p.expr, t, p.cap)
      if (t >= 13.4 && t < T_TITLE + 1) {
        // 拿着小刀，举起来
        const s = toolSprites('knife', 10).frames[TOOL_FRAMES - 1]!
        drawSprite(ctx, s, p.x + 40, GROUND - 170)
        if (Math.floor(t * 4) % 2 === 0) sparkle(ctx, p.x + 26, GROUND - 176, 4, SCENE.hairGlint[1], RAMPS.gold[4])
      }
    }
    if (p.capFly) drawCapOn(ctx, Math.round(p.capFly[0]), Math.round(p.capFly[1]))
    for (const pf of this.poofs) {
      ctx.fillStyle = pf.life > 0.4 ? SCENE.hair[2] : SCENE.hair[1]
      ctx.fillRect(Math.round(pf.x), Math.round(pf.y), 2, 3)
    }

    // 开头淡入 / 标题前压暗
    const fadeIn = Math.max(0, 1 - t / 0.8)
    if (fadeIn > 0) {
      ctx.fillStyle = rgba(SCENE.ui.text, fadeIn)
      ctx.fillRect(0, 0, W, H)
    }
    if (t > T_TITLE) {
      const k = Math.min(0.55, (t - T_TITLE) * 1.2)
      ctx.fillStyle = rgba(SCENE.ui.text, k)
      ctx.fillRect(0, 0, W, H)
    }
    // 电影黑边
    const bar = t < T_TITLE ? 56 : Math.max(0, 56 - (t - T_TITLE) * 120)
    ctx.fillStyle = SCENE.ui.text
    ctx.fillRect(0, 0, W, Math.round(bar))
    ctx.fillRect(0, H - Math.round(bar), W, Math.round(bar))
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const ui = SCENE.ui
    const t = this.t
    for (const [a, b, text] of CAPTIONS) {
      if (t < a || t > b) continue
      const k = Math.min(1, (t - a) / 0.3, (b - t) / 0.3)
      hiText(ctx, text, W / 2, H - 100, { size: 28, color: ui.panel, stroke: ui.text, strokeWidth: 5, align: 'center', alpha: k })
    }
    if (t > 8 && t < 10.4) hiText(ctx, '！', 330, 470 - Math.min(10, (t - 8) * 40), { size: 44, color: RAMPS.gold[4], stroke: ui.text, strokeWidth: 5, align: 'center' })
    if (t > 10.4 && t < 11.2) hiText(ctx, '嘭！', 360, 480, { size: 48, color: ui.panel, stroke: ui.text, strokeWidth: 6, align: 'center' })
    hiText(ctx, S.intro.sign[0]!, 452, 78, { size: 20, color: RAMPS.bband[0], align: 'center' })
    hiText(ctx, S.intro.sign[1]!, 452, 112, { size: 24, color: RAMPS.pink[0], align: 'center' })
    if (t < T_TITLE) {
      hiText(ctx, S.intro.skip, W - 20, 36, { size: 16, color: ui.panel, align: 'right', alpha: 0.7 })
      return
    }
    // 标题落下（弹一下）
    const k = Math.min(1, (t - T_TITLE) / 0.6)
    const bounce = k < 1 ? (1 - k) * (1 - k) * -300 + Math.sin(k * Math.PI * 2.5) * (1 - k) * 30 : 0
    hiText(ctx, S.gameTitle, W / 2, 330 + bounce, { size: 70, color: ui.panel, stroke: ui.text, strokeWidth: 8, align: 'center' })
    hiText(ctx, S.gameTitle, W / 2, 326 + bounce, { size: 70, color: RAMPS.bcap[3], stroke: RAMPS.bcap[0], strokeWidth: 2, align: 'center', alpha: 0.35 })
    if (t > T_TITLE + 0.8) {
      const a = 0.6 + 0.4 * Math.sin(t * 4)
      hiText(ctx, S.intro.start, W / 2, 440, { size: 26, color: ui.panel, stroke: ui.text, strokeWidth: 4, align: 'center', alpha: a })
    }
  }
}
