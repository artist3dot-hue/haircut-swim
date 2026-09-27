// 剪发画面（阶段 1：手感原型）。GDD 第 4.2、6、7 节。
// 没有计时和结算，可以无限剪。打开方式：?scene=cut（现在也是默认场景），?seed=7 固定随机种子。

import type { Scene } from '../core/scene'
import type { Game } from '../game'
import { W, H } from '../core/screen'
import { Rng } from '../core/rng'
import { formatNum } from '../core/format'
import { SCENE, RAMPS, u32, rgba } from '../art/palette'
import { drawTiles, drawPoolside } from '../art/pool'
import { drawScalp } from '../art/scalp'
import { buildScissors, SCISSOR_FRAMES, type ScissorSprites } from '../art/scissors'
import { drawSprite, makeCanvas, registerCanvas, type Sprite } from '../art/sprites'
import { drawPixelText, textWidth, FONT_HUD, FONT_TINY } from '../art/pixelfont'
import { hiText } from '../art/text'
import { HairField, type Piece } from '../hair/field'
import { Particles } from '../juice/particles'
import { Floaters } from '../juice/floaters'
import { Collector } from '../juice/collect'
import { Shake } from '../juice/shake'
import { sfx } from '../audio/sfx'
import { JUICE, COMBO_TIERS, comboMult, comboSemitones, type JuiceKey } from '../data/juice'
import { S } from '../data/strings'
import { DebugPanel } from '../ui/debug'

/** 地板线：头发末端躺在这里，断发落到这里化成光点 */
const FLOOR_Y = 604
/** 计数器位置（光点飞向这里） */
const COUNTER_X = 12
const COUNTER_Y = 15

const DEBRIS_COLORS = [u32(SCENE.hair[1]), u32(SCENE.hair[2]), u32(SCENE.hair[3]), u32(SCENE.hair[3]), u32(SCENE.hairGlint[0])]
const DUST_COLORS = [u32(SCENE.hair[1]), u32(SCENE.hair[2]), u32(SCENE.floor[2])]

export class CutScene implements Scene {
  readonly name = 'cut'
  private rng: Rng
  private bg: HTMLCanvasElement
  private field: HairField
  private particles = new Particles()
  private floaters = new Floaters()
  private collector = new Collector(COUNTER_X, COUNTER_Y)
  private shake = new Shake()
  private scissors: ScissorSprites
  private scissorRadius = -1
  private icon: Sprite
  readonly debug: DebugPanel

  private t = 0
  // 剪刀
  private sx = 180
  private sy = 380
  private psx = 180
  private psy = 380
  private sinceSnap = 0
  private snapFlash = 0
  private trail: Array<[number, number]> = []

  // 连击
  private combo = 0
  private comboTimer = 0
  private maxCombo = 0
  private tierReached = 0
  private tierText: { text: string; age: number; tier: number } | null = null

  // 收益
  /** 已经赚到的（剪断就算） */
  private bank = 0
  /** 计数器上显示的（光点飞到才加） */
  private shown = 0
  private bump = 0
  private bumpV = 0
  private collectStreak = 0
  private collectStreakTimer = 0

  // 统计
  private cuts = 0
  private snaps = 0
  private everCut = false

  constructor(private readonly game: Game) {
    const seed = Number(new URLSearchParams(location.search).get('seed'))
    this.rng = new Rng(Number.isFinite(seed) && seed > 0 ? seed : undefined)
    this.field = new HairField(this.rng.int(1, 1e9), FLOOR_Y)
    this.bg = this.makeBackground()
    this.scissors = this.ensureScissors()
    this.icon = makeStrandIcon()
    this.debug = new DebugPanel(
      (k) => this.onJuiceChange(k),
      () => this.statsText(),
    )
    game.input.onGesture(() => sfx.unlock())
  }

  private makeBackground(): HTMLCanvasElement {
    const { c, ctx } = makeCanvas(W, H)
    drawTiles(ctx, 0, 0, W, H, 20, 7)
    drawPoolside(ctx, 0, FLOOR_Y + 2, W, H - FLOOR_Y - 2)
    drawScalp(ctx, W)
    return c
  }

  private ensureScissors(): ScissorSprites {
    const r = Math.round(JUICE.scissorRadius)
    if (r !== this.scissorRadius) {
      this.scissors = buildScissors(r, SCENE.tile[3])
      this.scissorRadius = r
    }
    return this.scissors
  }

  private onJuiceChange(k: JuiceKey): void {
    if (k === 'hairCount') this.field.build(Math.round(JUICE.hairCount))
    if (k === 'scissorRadius') this.ensureScissors()
  }

  // ---------------------------------------------------------------- 逻辑

  update(dt: number): void {
    this.t += dt
    const input = this.game.input

    // 剪刀跟手：指数平滑，手机上剪刀在手指上方
    let tx = input.x
    let ty = input.y
    if (input.pointerType !== 'mouse') ty -= JUICE.touchOffsetY
    if (!input.seen) {
      tx = 180
      ty = 380
    }
    tx = Math.max(0, Math.min(W, tx))
    ty = Math.max(50, Math.min(FLOOR_Y - 4, ty))
    this.psx = this.sx
    this.psy = this.sy
    const k = 1 - Math.exp(-JUICE.followSharpness * dt)
    this.sx += (tx - this.sx) * k
    this.sy += (ty - this.sy) * k

    // 剪刀附近的头发被推开、轻轻摆动
    const push = this.field.push
    push.cx = this.sx
    push.cy = this.sy
    push.halfW = JUICE.scissorRadius + JUICE.pushRange
    push.halfH = JUICE.cutThickness + JUICE.pushRange
    push.mvx = this.sx - this.psx
    push.mvy = this.sy - this.psy
    push.strength = JUICE.pushStrength

    this.field.update(dt, this.t, JUICE.growthSpeed, (pc, x, y) => this.onLand(pc, x, y))

    // 自动咔嚓
    this.sinceSnap += dt
    if (!input.seen) this.sinceSnap = Math.min(this.sinceSnap, JUICE.snapInterval * 0.5)
    if (this.sinceSnap >= JUICE.snapInterval) {
      this.sinceSnap = Math.min(this.sinceSnap - JUICE.snapInterval, JUICE.snapInterval)
      this.doSnap()
    }
    if (this.snapFlash > 0) this.snapFlash -= dt

    // 连击超时
    if (this.combo > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) {
        this.combo = 0
        this.tierReached = 0
        sfx.setDrums(false)
      }
    }
    if (this.tierText) {
      this.tierText.age += dt
      if (this.tierText.age > 1.1) this.tierText = null
    }

    this.particles.update(dt, FLOOR_Y + 1)
    this.floaters.update(dt)
    const got = this.collector.update(dt)
    if (got.n > 0) {
      this.shown += got.value
      this.bumpV += JUICE.counterBump * 14
      this.collectStreak += got.n
      this.collectStreakTimer = 0.4
      sfx.collect(this.collectStreak)
    }
    this.collectStreakTimer -= dt
    if (this.collectStreakTimer <= 0) this.collectStreak = 0
    // 计数器弹簧
    this.bumpV += (-this.bump * 520 - this.bumpV * 22) * dt
    this.bump = Math.max(-0.2, Math.min(0.6, this.bump + this.bumpV * dt))

    this.shake.update(dt)

    // 100 连击后的彩色拖尾
    this.trail.unshift([this.sx, this.sy])
    if (this.trail.length > 12) this.trail.length = 12
  }

  private doSnap(): void {
    this.snaps++
    this.snapFlash = 0.06
    const hits = this.field.snap(this.sx, this.sy, JUICE.scissorRadius, JUICE.cutThickness, this.rng)
    if (hits.length === 0) {
      sfx.emptySnap()
      return
    }
    this.everCut = true
    let total = 0
    let floaterBudget = Math.round(JUICE.floaterMaxPerSnap)
    const before = this.combo
    for (const h of hits) {
      this.combo++
      this.cuts++
      const value = 1 * comboMult(this.combo)
      h.piece.value = value
      total += value
      this.bank += value
      // 断口碎屑 3–6 个
      const n = this.rng.int(Math.round(JUICE.debrisMin), Math.max(Math.round(JUICE.debrisMin), Math.round(JUICE.debrisMax)))
      this.particles.burst(h.x, h.y, n, JUICE.debrisSpeed, DEBRIS_COLORS, this.rng)
      // 咔嚓音（限流在 sfx 里做）
      sfx.snip(comboSemitones(this.combo), hits.length)
      if (floaterBudget > 0) {
        floaterBudget--
        const style = floaterStyle(this.combo)
        this.floaters.add('+' + formatNum(value), h.x, h.y - 3, {
          life: JUICE.floaterTime,
          rise: JUICE.floaterRise,
          scale: this.combo >= 500 ? 2 : 1,
          color: style.color,
          drift: this.rng.jitter(6),
        })
      }
    }
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    this.comboTimer = JUICE.comboTimeout
    // 一下剪断很多根：剪刀上方再出一个总数
    if (hits.length >= 3) {
      const style = floaterStyle(this.combo)
      this.floaters.add('+' + formatNum(total), this.sx, this.sy - JUICE.cutThickness - 16, {
        life: JUICE.floaterTime * 1.3,
        rise: JUICE.floaterRise * 1.2,
        scale: style.scale,
        color: style.color,
        big: true,
        drift: this.rng.jitter(4),
      })
    }
    if (navigator.vibrate && this.game.input.pointerType !== 'mouse') {
      try {
        navigator.vibrate(JUICE.vibrateMs)
      } catch {
        /* 有的浏览器不给震 */
      }
    }
    // 连击档位
    for (let i = 0; i < COMBO_TIERS.length; i++) {
      const tier = COMBO_TIERS[i]!
      if (before < tier.at && this.combo >= tier.at && this.tierReached <= i) {
        this.tierReached = i + 1
        this.onTier(i)
      }
    }
  }

  private onTier(i: number): void {
    const at = COMBO_TIERS[i]!.at
    if (i === 0) {
      // 10 连击：只升音高（sfx 按连击数自动升），不震屏
      this.tierText = { text: `${at}!`, age: 0, tier: i }
      return
    }
    this.tierText = { text: `${at}!`, age: 0, tier: i }
    sfx.tierUp(i)
    this.shake.kick(JUICE.shakeTier * (i >= 3 ? 1.35 : i >= 2 ? 1.15 : 1), JUICE.shakeTime)
    if (i >= 3) sfx.setDrums(true)
  }

  private onLand(pc: Piece, x: number, y: number): void {
    sfx.rustle(0.35 + Math.min(1, pc.len / 120) * 0.5)
    this.particles.burst(x, y - 1, 2, 30, DUST_COLORS, this.rng, 0.9)
    const n = Math.round(JUICE.sparksPerPiece)
    if (pc.value <= 0) return
    if (n <= 0) {
      this.shown += pc.value
      return
    }
    for (let k = 0; k < n; k++) {
      this.collector.add(x + this.rng.jitter(3), y - 1, pc.value / n, this.rng.range(JUICE.sparkFlyMin, JUICE.sparkFlyMax), this.rng, this.rng.range(0.04, 0.16))
    }
  }

  // ---------------------------------------------------------------- 画面

  render(alpha: number): void {
    const ctx = this.game.screen.lctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.fillStyle = SCENE.tile[1]
    ctx.fillRect(0, 0, W, H)
    ctx.translate(this.shake.x, this.shake.y)
    ctx.drawImage(this.bg, 0, 0)

    const hair = this.field.render(alpha, (r) => this.particles.render(r))
    ctx.drawImage(hair, 0, 0)

    const sx = Math.round(this.psx + (this.sx - this.psx) * alpha)
    const sy = Math.round(this.psy + (this.sy - this.psy) * alpha)
    this.drawScissors(ctx, sx, sy)

    this.collector.render(ctx)
    this.floaters.render(ctx)
    if (this.combo >= 500) this.drawEdgeGlow(ctx)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.drawHud(ctx)
  }

  private openness(): number {
    const iv = JUICE.snapInterval
    const close = Math.min(JUICE.snapCloseTime, iv * 0.4)
    const τ = this.sinceSnap
    if (τ > iv - close) return Math.max(0, (iv - τ) / close)
    const hold = Math.min(0.05, iv * 0.15)
    if (τ < hold) return 0
    const k = Math.min(1, (τ - hold) / (iv * 0.45))
    return 1 - (1 - k) * (1 - k)
  }

  private drawScissors(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // 100 连击：彩色拖尾
    if (this.combo >= 100) {
      const rb = SCENE.rainbow
      for (let i = this.trail.length - 1; i >= 1; i--) {
        const [ax, ay] = this.trail[i]!
        ctx.fillStyle = rb[(i + Math.floor(this.t * 20)) % rb.length]!
        const w = Math.max(1, Math.round((1 - i / this.trail.length) * JUICE.scissorRadius * 1.6))
        ctx.fillRect(Math.round(ax - w / 2), Math.round(ay), w, 1)
      }
    }
    const f = Math.round(this.openness() * (SCISSOR_FRAMES - 1))
    const sp = this.ensureScissors()
    const prevA = ctx.globalAlpha
    ctx.globalAlpha = 0.45
    drawSprite(ctx, sp.shadows[f]!, x + 3, y + 5)
    ctx.globalAlpha = prevA
    drawSprite(ctx, sp.frames[f]!, x, y)
    // 咔嚓一瞬间：刃中点一个四角闪星
    if (this.snapFlash > 0) {
      const c = SCENE.hairGlint[1]
      ctx.fillStyle = c
      ctx.fillRect(x - 3, y, 7, 1)
      ctx.fillRect(x, y - 3, 1, 7)
      ctx.fillStyle = SCENE.hairGlint[0]
      ctx.fillRect(x - 1, y - 1, 3, 3)
      ctx.fillStyle = c
      ctx.fillRect(x, y, 1, 1)
    }
  }

  private drawEdgeGlow(ctx: CanvasRenderingContext2D): void {
    const g = RAMPS.gold
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 8)
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = rgba(g[3 - Math.min(2, i >> 1)]!, (0.55 - i * 0.08) * (0.6 + 0.4 * pulse))
      ctx.fillRect(i, i, W - i * 2, 1)
      ctx.fillRect(i, H - 1 - i, W - i * 2, 1)
      ctx.fillRect(i, i + 1, 1, H - i * 2 - 2)
      ctx.fillRect(W - 1 - i, i + 1, 1, H - i * 2 - 2)
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    // 左上：发丝计数器（带弹跳）
    const text = formatNum(this.shown)
    const s = 1 + this.bump
    const flash = this.bump > 0.12
    // 奶白面板 + 珊瑚粉边 + 深青字（ART_STYLE 的 UI 面板配色）
    const tw = textWidth(FONT_HUD, text, 2) + 18
    const pw = tw + 8
    const ph = 22
    const { c: tmp, ctx: t } = hudCanvas(Math.max(48, pw), ph)
    t.clearRect(0, 0, tmp.width, tmp.height)
    t.fillStyle = SCENE.ui.border
    t.fillRect(1, 0, tmp.width - 2, ph)
    t.fillRect(0, 1, tmp.width, ph - 2)
    t.fillStyle = SCENE.ui.panel
    t.fillRect(2, 2, tmp.width - 4, ph - 4)
    drawSprite(t, this.icon, 3, 4)
    drawPixelText(t, FONT_HUD, text, 19, 4, { color: flash ? RAMPS.gold[1] : SCENE.ui.text, outline: null, scale: 2 })
    const dw = Math.round(tmp.width * s)
    const dh = Math.round(tmp.height * s)
    // 以图标为中心缩放
    const ox = 4 - Math.round((dw - tmp.width) * 0.15)
    const oy = 4 - Math.round((dh - tmp.height) * 0.5)
    ctx.drawImage(tmp, ox, oy, dw, dh)

    // 下方：连击数 + 断连倒计时条
    if (this.combo >= 2) {
      const style = floaterStyle(this.combo)
      const cy = FLOOR_Y - 58
      drawPixelText(ctx, FONT_HUD, `${this.combo}`, W / 2, cy, { color: style.color, outline: SCENE.ui.text, scale: 3, align: 'center' })
      const m = comboMult(this.combo)
      if (m > 1) drawPixelText(ctx, FONT_TINY, `x${m}`, W / 2 + textWidth(FONT_HUD, `${this.combo}`, 3) / 2 + 10, cy + 12, { color: RAMPS.gold[4], outline: SCENE.ui.text, scale: 2, align: 'center' })
      const bw = 60
      const k = Math.max(0, this.comboTimer / JUICE.comboTimeout)
      ctx.fillStyle = SCENE.ui.text
      ctx.fillRect(W / 2 - bw / 2 - 1, cy + 26, bw + 2, 4)
      ctx.fillStyle = style.color
      ctx.fillRect(W / 2 - bw / 2, cy + 27, Math.round(bw * k), 2)
    }

    // 档位大字
    if (this.tierText) {
      const tt = this.tierText
      const k = tt.age / 1.1
      const scale = tt.age < 0.06 ? 6 : tt.age < 0.12 ? 5 : 4
      const alpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25
      const color = tt.tier >= 2 ? RAMPS.gold[4] : SCENE.ui.panel
      drawPixelText(ctx, FONT_HUD, tt.text, W / 2, 230 - Math.round(k * 20), { color, outline: RAMPS.gold[0], scale, align: 'center', alpha })
    }
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const ui = SCENE.ui
    if (this.combo >= 2) {
      hiText(ctx, S.cut.combo, W / 2, FLOOR_Y - 64, { size: 13, color: ui.panel, stroke: ui.text, strokeWidth: 2, align: 'center' })
    }
    if (!sfx.ready) {
      const a = 0.75 + 0.25 * Math.sin(this.t * 4)
      hiText(ctx, S.cut.tapForSound, W / 2, H - 14, { size: 13, color: ui.text, stroke: ui.panel, strokeWidth: 2, align: 'center', alpha: a })
    }
    if (!this.everCut) {
      hiText(ctx, S.cut.dragHint, W / 2, 470, { size: 20, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center' })
      hiText(ctx, S.cut.debugHint, W / 2, 494, { size: 12, color: ui.panel, stroke: ui.text, strokeWidth: 2, align: 'center', alpha: 0.85 })
    }
  }

  // ---------------------------------------------------------------- 调试

  stats(): Record<string, number> {
    const tips = this.field.tipStats()
    return {
      cuts: this.cuts,
      snaps: this.snaps,
      combo: this.combo,
      maxCombo: this.maxCombo,
      bank: Math.round(this.bank * 10) / 10,
      shown: Math.round(this.shown * 10) / 10,
      strands: this.field.strands.length,
      pieces: this.field.pieces.length,
      particles: this.particles.count,
      sparks: this.collector.count,
      floaters: this.floaters.count,
      snipsPlayed: sfx.snipsPlayed,
      snipsMerged: sfx.snipsMerged,
      avgTipY: Math.round(tips.avg),
    }
  }

  private statsText(): Record<string, string | number> {
    const p = this.game.perf.snapshot()
    return { fps: p.fps.toFixed(0), cpuMs: p.avgCpuMs.toFixed(2), ...this.stats() }
  }
}

/** 飘字样式：连击越高越大、越偏金色（ART_STYLE：白字 + 深青描边）。 */
function floaterStyle(combo: number): { scale: number; color: string } {
  if (combo >= 500) return { scale: 2, color: RAMPS.gold[2] }
  if (combo >= 100) return { scale: 2, color: RAMPS.gold[3] }
  if (combo >= 50) return { scale: 2, color: RAMPS.gold[4] }
  if (combo >= 10) return { scale: 1, color: RAMPS.gold[4] }
  return { scale: 1, color: SCENE.hairGlint[1] }
}

let hudTmp: { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null
function hudCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!hudTmp || hudTmp.c.width !== w || hudTmp.c.height !== h) hudTmp = makeCanvas(w, h)
  return hudTmp
}

/** 计数器图标：一小束弯弯的头发（深发色 + 蓝灰高光），描边用 UI 深青（14×14）。 */
function makeStrandIcon(): Sprite {
  const { c, ctx } = makeCanvas(14, 14)
  const hair = SCENE.hair
  const shape = [
    '...#####......',
    '..#11221#.....',
    '..#12321#.....',
    '...#1221#.....',
    '....#1221#....',
    '....#1221#....',
    '...#1221#.....',
    '..#1221#......',
    '..#1221#......',
    '...#1221#.....',
    '....#1221#....',
    '....#12#1#....',
    '...#1#.#1#....',
    '...##...##....',
  ]
  const col: Record<string, string> = { '#': SCENE.ui.text, '1': hair[0], '2': hair[2], '3': hair[4] }
  shape.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const k = row[x]!
      if (k === '.') continue
      ctx.fillStyle = col[k]!
      ctx.fillRect(x, y, 1, 1)
    }
  })
  ctx.fillStyle = SCENE.hairGlint[0]
  ctx.fillRect(6, 3, 1, 1)
  ctx.fillRect(9, 7, 1, 1)
  return registerCanvas('hud.strand', c, 0, 0)
}
