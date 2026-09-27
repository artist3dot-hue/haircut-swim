// 剪发画面：完整的一局。GDD 第 4.2、5、6、7、9、12 节。
// 打开方式：?scene=cut（现在也是默认场景），?seed=7 固定随机种子。
//
// 流程：ready（等玩家动鼠标）→ play（倒计时）→
//   - 时间到 → ending（让断发落完、光点飞完）→ result
//   - 发量爆表 → drown（被头发淹没动画）→ result（发丝 50%）
//   - 所有能剪的头发剪到泳帽线以上保持 3 秒 → capPrompt（去游泳 / 再剪一会儿）

import type { Scene } from '../core/scene'
import type { Game } from '../game'
import { W, H } from '../core/screen'
import { Rng } from '../core/rng'
import { formatNum, formatTime } from '../core/format'
import { SCENE, RAMPS, u32, rgba } from '../art/palette'
import { drawTiles, drawPoolside } from '../art/pool'
import { drawScalp } from '../art/scalp'
import { buildScissors, SCISSOR_FRAMES, type ScissorSprites } from '../art/scissors'
import { drawSprite, makeCanvas, registerCanvas, type Sprite } from '../art/sprites'
import { drawPixelText, textWidth, FONT_HUD, FONT_TINY } from '../art/pixelfont'
import { hiText } from '../art/text'
import { HairField, type Piece, type HairMetrics } from '../hair/field'
import { Particles } from '../juice/particles'
import { Floaters } from '../juice/floaters'
import { Collector } from '../juice/collect'
import { Shake } from '../juice/shake'
import { sfx } from '../audio/sfx'
import { JUICE, COMBO_TIERS, comboMult, comboSemitones, type JuiceKey } from '../data/juice'
import { HAIR_TYPES, ROUND } from '../data/hair'
import { S } from '../data/strings'
import { DebugPanel } from '../ui/debug'

const FLOOR_Y = ROUND.floorY
const CAP_Y = ROUND.capY
/** 计数器位置（光点飞向这里） */
const COUNTER_X = 12
const COUNTER_Y = 15
/** 右侧发量条 */
const BAR_X = 351
const BAR_W = 6

const DEBRIS_COLORS = [u32(SCENE.hair[1]), u32(SCENE.hair[2]), u32(SCENE.hair[3]), u32(SCENE.hair[3]), u32(SCENE.hairGlint[0])]
const DUST_COLORS = [u32(SCENE.hair[1]), u32(SCENE.hair[2]), u32(SCENE.floor[2])]
const STEEL_SPARKS = [u32(RAMPS.gold[4]), u32(RAMPS.steel[4]), u32(SCENE.hairGlint[1])]
const WHITE_DEBRIS = [u32(RAMPS.head[2]), u32(RAMPS.head[3]), u32(RAMPS.head[4])]

type Phase = 'ready' | 'play' | 'capPrompt' | 'drown' | 'ending' | 'result'
type EndReason = 'time' | 'drown' | 'swim'

interface Button {
  x: number
  y: number
  w: number
  h: number
  label: string
  primary: boolean
  action: () => void
}

// 调试面板和声音解锁在整个页面只建一次（再来一局会新建场景）
let debugPanel: DebugPanel | null = null
let activeScene: CutScene | null = null
let gestureHooked = false
/** 这次打开页面以来累计的发丝（阶段 3 做存档后换成存档里的值） */
let sessionTotal = 0

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
  private capIcon: Sprite

  private t = 0
  private phase: Phase = 'ready'
  private phaseT = 0
  // 剪刀
  private sx = 180
  private sy = 380
  private psx = 180
  private psy = 380
  private sinceSnap = 0
  private snapFlash = 0
  private recoil = 0
  private trail: Array<[number, number]> = []
  private hitstop = 0

  // 一局
  private timeLeft: number = ROUND.duration
  private elapsed = 0
  private metrics: HairMetrics = { p80: 0, maxCuttable: 0, onFloor: 0, volume: 0 }
  private danger = 0
  private heartT = 0
  private capHold = 0
  private capReached = false
  private extraMode = false
  private endReason: EndReason = 'time'
  private payout = 0
  private buttons: Button[] = []
  private lastTickSec = -1
  private twinkles: Array<{ x: number; y: number; age: number }> = []
  private twinkleT = 0

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
    this.rng = new Rng(Number.isFinite(seed) && seed > 0 ? seed + restarts * 7919 : undefined)
    this.field = new HairField(this.rng.int(1, 1e9), FLOOR_Y)
    this.field.maxStrandMult = ROUND.maxStrandMult
    this.bg = makeBackground()
    this.scissors = this.ensureScissors()
    this.icon = makeStrandIcon()
    this.capIcon = makeCapIcon()
    activeScene = this
    if (!debugPanel) {
      debugPanel = new DebugPanel(
        (k) => activeScene?.onJuiceChange(k),
        () => activeScene?.statsText() ?? {},
      )
    }
    if (!gestureHooked) {
      gestureHooked = true
      game.input.onGesture(() => sfx.unlock())
    }
    game.input.consumeTaps()
    this.metrics = this.field.metrics(CAP_Y, ROUND.sharpness)
  }

  private ensureScissors(): ScissorSprites {
    const r = Math.round(JUICE.scissorRadius)
    if (r !== this.scissorRadius) {
      this.scissors = buildScissors(r, SCENE.tile[3])
      this.scissorRadius = r
    }
    return this.scissors
  }

  onJuiceChange(k: JuiceKey): void {
    if (k === 'hairCount') this.field.build(Math.round(JUICE.hairCount))
    if (k === 'scissorRadius') this.ensureScissors()
  }

  private setPhase(p: Phase): void {
    this.phase = p
    this.phaseT = 0
    this.buttons = []
    if (p === 'capPrompt') {
      this.buttons = [
        { x: 60, y: 348, w: 240, h: 40, label: S.round.goSwim, primary: true, action: () => this.endRound('swim') },
        { x: 60, y: 398, w: 240, h: 40, label: S.round.keepCutting, primary: false, action: () => this.keepCutting() },
      ]
    }
    if (p === 'result') {
      this.buttons = [{ x: 70, y: 440, w: 220, h: 42, label: S.round.again, primary: true, action: () => this.restart() }]
    }
  }

  // ---------------------------------------------------------------- 逻辑

  update(dt: number): void {
    this.t += dt
    this.phaseT += dt
    const input = this.game.input
    const taps = input.consumeTaps()
    const keys = input.consumeKeys()
    if (this.buttons.length) {
      for (const tp of taps) {
        const b = this.buttons.find((b) => tp.x >= b.x && tp.x <= b.x + b.w && tp.y >= b.y && tp.y <= b.y + b.h)
        if (b && this.phaseT > 0.35) {
          sfx.click()
          b.action()
          return
        }
      }
      if (this.phaseT > 0.35 && keys.some((k) => k === 'Enter' || k === ' ')) {
        sfx.click()
        this.buttons.find((b) => b.primary)?.action()
        return
      }
    }

    // 顿帧：稀有头发剪断时整个画面停 40ms
    if (this.hitstop > 0) {
      this.hitstop -= dt
      return
    }

    if (this.phase === 'ready' && input.seen) this.setPhase('play')
    const frozen = this.phase === 'capPrompt' || this.phase === 'result'

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
    this.recoil *= Math.exp(-dt * 18)

    if (!frozen) {
      // 剪刀附近的头发被推开、轻轻摆动
      const push = this.field.push
      push.cx = this.sx
      push.cy = this.sy
      push.halfW = JUICE.scissorRadius + JUICE.pushRange
      push.halfH = JUICE.cutThickness + JUICE.pushRange
      push.mvx = this.sx - this.psx
      push.mvy = this.sy - this.psy
      push.strength = this.phase === 'play' ? JUICE.pushStrength : 0

      this.field.update(dt, this.t, this.growthNow(), (pc, x, y) => this.onLand(pc, x, y))
    }

    if (this.phase === 'play') this.updatePlay(dt)
    else if (this.phase === 'drown' && this.phaseT > 1.7) this.toResult()
    else if (this.phase === 'ending' && this.phaseT > 1.1) this.toResult()

    // 连击超时
    if (this.combo > 0 && !frozen) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) this.breakCombo()
    }
    if (this.tierText) {
      this.tierText.age += dt
      if (this.tierText.age > 1.1) this.tierText = null
    }
    if (this.snapFlash > 0) this.snapFlash -= dt

    // 白头发周围随机闪星
    this.twinkleT -= dt
    if (this.twinkleT <= 0 && !frozen) {
      this.twinkleT = 0.12
      const p = this.field.randomPointOf('white', this.rng)
      if (p) this.twinkles.push({ x: p[0] + this.rng.jitter(3), y: p[1], age: 0 })
    }
    for (const tw of this.twinkles) tw.age += dt
    this.twinkles = this.twinkles.filter((tw) => tw.age < 0.35)

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

  /** 当前生长速度：随时间加快；"再剪一会儿"再加速；被淹没时疯长。 */
  private growthNow(): number {
    if (this.phase === 'drown') return JUICE.growthSpeed * 14
    if (this.phase === 'ready') return JUICE.growthSpeed * 0.3
    const ramp = 1 + this.elapsed / ROUND.growthRampSec
    return JUICE.growthSpeed * ramp * (this.extraMode ? ROUND.extraGrowthMult : 1)
  }

  private updatePlay(dt: number): void {
    this.elapsed += dt
    this.timeLeft -= dt

    // 自动咔嚓
    this.sinceSnap += dt
    if (this.sinceSnap >= JUICE.snapInterval) {
      this.sinceSnap = Math.min(this.sinceSnap - JUICE.snapInterval, JUICE.snapInterval)
      this.doSnap()
    }

    // 发量 / 爆表 / 泳帽线
    this.metrics = this.field.metrics(CAP_Y, ROUND.sharpness)
    const m = this.metrics
    this.danger = Math.max(0, Math.min(1, (m.p80 - CAP_Y) / (FLOOR_Y - CAP_Y)))
    const warn = this.warnLevel()
    if (warn > 0) {
      // 危险预兆：心跳越来越快
      this.heartT -= dt
      if (this.heartT <= 0) {
        this.heartT = 0.95 - warn * 0.6
        sfx.heartbeat(warn)
      }
    }
    if (m.onFloor >= ROUND.overflowFrac) {
      this.drownNow()
      return
    }
    if (!this.capReached) {
      if (m.maxCuttable <= CAP_Y) this.capHold += dt
      else this.capHold = 0
      if (this.capHold >= ROUND.capHoldSec) {
        this.capReached = true
        sfx.fanfare()
        this.setPhase('capPrompt')
        return
      }
    }

    // 最后 5 秒倒计时
    const sec = Math.ceil(this.timeLeft)
    if (sec !== this.lastTickSec && sec <= 5 && sec >= 1) sfx.countdown(false)
    this.lastTickSec = sec
    if (this.timeLeft <= 0) {
      this.timeLeft = 0
      sfx.timeUp()
      this.endRound('time')
    }
  }

  /** 危险程度 0..1（发量超过 warnFrom 后才开始）。 */
  private warnLevel(): number {
    if (this.phase === 'drown') return 1
    if (this.phase !== 'play') return 0
    return Math.max(0, (this.danger - ROUND.warnFrom) / (1 - ROUND.warnFrom))
  }

  private drownNow(): void {
    this.endReason = 'drown'
    this.breakCombo()
    sfx.drown()
    this.shake.kick(JUICE.shakeTier, 0.4)
    this.setPhase('drown')
  }

  private keepCutting(): void {
    this.extraMode = true
    this.setPhase('play')
    this.floaters.add(`x${ROUND.extraValueMult}`, W / 2, 220, { life: 1.2, rise: 30, scale: 4, color: RAMPS.gold[4], big: true })
  }

  private endRound(reason: EndReason): void {
    this.endReason = reason
    this.breakCombo()
    this.setPhase('ending')
  }

  private toResult(): void {
    const factor = this.endReason === 'drown' ? ROUND.overflowPayout : 1
    this.payout = this.bank * factor
    sessionTotal += this.payout
    this.shown = this.bank
    this.setPhase('result')
  }

  private restart(): void {
    restarts++
    this.game.scenes.set(new CutScene(this.game))
  }

  private breakCombo(): void {
    this.combo = 0
    this.tierReached = 0
    sfx.setDrums(false)
  }

  private doSnap(): void {
    this.snaps++
    this.snapFlash = 0.06
    const hits = this.field.snap(this.sx, this.sy, JUICE.scissorRadius, JUICE.cutThickness, ROUND.sharpness, this.rng)
    if (hits.length === 0) {
      sfx.emptySnap()
      return
    }
    let total = 0
    let cutsNow = 0
    let floaterBudget = Math.round(JUICE.floaterMaxPerSnap)
    let blocked = false
    let rare = false
    const before = this.combo
    for (const h of hits) if (h.kind === 'cut') cutsNow++
    for (const h of hits) {
      if (h.kind === 'blocked') {
        // 钢丝发：剪不动，"铛"，火花，剪刀被弹一下；不加连击也不断连
        blocked = true
        this.particles.burst(h.x, h.y, 4, 120, STEEL_SPARKS, this.rng, 0.3)
        continue
      }
      this.combo++
      this.comboTimer = JUICE.comboTimeout
      if (h.kind === 'knot') {
        // 打结发：剪了一下没断
        sfx.thud()
        this.particles.burst(h.x, h.y, 2, JUICE.debrisSpeed * 0.6, DEBRIS_COLORS, this.rng)
        continue
      }
      const piece = h.piece!
      const type = HAIR_TYPES[piece.kind]
      this.cuts++
      this.everCut = true
      const value = ROUND.baseValue * type.value * comboMult(this.combo) * (this.extraMode ? ROUND.extraValueMult : 1)
      piece.value = value
      total += value
      this.bank += value
      // 断口碎屑 3–6 个
      const n = this.rng.int(Math.round(JUICE.debrisMin), Math.max(Math.round(JUICE.debrisMin), Math.round(JUICE.debrisMax)))
      this.particles.burst(h.x, h.y, n, JUICE.debrisSpeed, piece.kind === 'white' ? WHITE_DEBRIS : DEBRIS_COLORS, this.rng)
      // 咔嚓音（限流在 sfx 里做）
      sfx.snip(comboSemitones(this.combo), cutsNow)
      if (type.rare) {
        rare = true
        sfx.ding()
        this.floaters.add('+' + formatNum(value), h.x, h.y - 6, { life: JUICE.floaterTime * 1.5, rise: JUICE.floaterRise * 1.5, scale: 2, color: SCENE.hairGlint[1], big: true })
        for (let i = 0; i < 4; i++) this.twinkles.push({ x: h.x + this.rng.jitter(10), y: h.y + this.rng.jitter(10), age: -i * 0.05 })
      } else if (floaterBudget > 0) {
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
    if (blocked) {
      sfx.clang()
      this.recoil = 4
    }
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    // 一下剪断很多根：剪刀上方再出一个总数
    if (cutsNow >= 3) {
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
    if (rare) this.hitstop = JUICE.hitstopRare
    if (cutsNow > 0 && navigator.vibrate && this.game.input.pointerType !== 'mouse') {
      try {
        navigator.vibrate(rare ? JUICE.vibrateRareMs : JUICE.vibrateMs)
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
    this.tierText = { text: `${at}!`, age: 0, tier: i }
    // 10 连击：只升音高（sfx 按连击数自动升），不震屏
    if (i === 0) return
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
    this.drawCapLine(ctx)

    const hair = this.field.render(this.phase === 'capPrompt' || this.phase === 'result' ? 1 : alpha, (r) => this.particles.render(r))
    ctx.drawImage(hair, 0, 0)
    this.drawTwinkles(ctx)

    const warn = this.warnLevel()
    if (warn > 0 && this.phase !== 'drown') this.drawEdgeHair(ctx, warn)

    if (this.phase !== 'result' && this.phase !== 'drown') {
      const sx = Math.round(this.psx + (this.sx - this.psx) * alpha)
      const sy = Math.round(this.psy + (this.sy - this.psy) * alpha - this.recoil)
      this.drawScissors(ctx, sx, sy)
    }

    this.collector.render(ctx)
    this.floaters.render(ctx)
    if (this.combo >= 500) this.drawEdgeGlow(ctx)
    if (this.phase === 'drown' || (this.phase === 'result' && this.endReason === 'drown')) this.drawDrown(ctx)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.drawHud(ctx)
    if (this.phase === 'capPrompt' || this.phase === 'result') this.drawPanel(ctx)
  }

  /** 泳帽线：虚线 + 左边的泳帽小图；在线以上保持时变亮并显示进度。 */
  private drawCapLine(ctx: CanvasRenderingContext2D): void {
    const holding = this.capHold > 0 && this.phase === 'play'
    const bright = holding || this.capReached
    const c = RAMPS.bcap
    const off = Math.floor(this.t * (holding ? 24 : 6)) % 6
    for (let x = 22 - off; x < BAR_X - 4; x += 6) {
      if (x < 22) continue
      ctx.fillStyle = bright ? c[4] : c[3]
      ctx.fillRect(x, CAP_Y, 3, 1)
      ctx.fillStyle = c[0]
      ctx.fillRect(x, CAP_Y + 1, 3, 1)
    }
    drawSprite(ctx, this.capIcon, 3, CAP_Y - 6)
    if (holding) {
      const k = Math.min(1, this.capHold / ROUND.capHoldSec)
      ctx.fillStyle = c[0]
      ctx.fillRect(22, CAP_Y + 3, 102, 4)
      ctx.fillStyle = RAMPS.gold[3]
      ctx.fillRect(23, CAP_Y + 4, Math.round(100 * k), 2)
    }
  }

  private drawTwinkles(ctx: CanvasRenderingContext2D): void {
    for (const tw of this.twinkles) {
      if (tw.age < 0) continue
      const x = Math.round(tw.x)
      const y = Math.round(tw.y)
      const big = tw.age < 0.18
      ctx.fillStyle = SCENE.hairGlint[0]
      if (big) {
        ctx.fillRect(x - 2, y, 5, 1)
        ctx.fillRect(x, y - 2, 1, 5)
      }
      ctx.fillStyle = SCENE.hairGlint[1]
      ctx.fillRect(x, y, 1, 1)
    }
  }

  /** 危险预兆：画面两边被头发侵占，越危险越宽、越往里爬。 */
  private drawEdgeHair(ctx: CanvasRenderingContext2D, warn: number): void {
    const hair = SCENE.hair
    const maxW = 10 + warn * 34
    for (let y = 0; y < H; y++) {
      const n = 0.5 + 0.3 * Math.sin(y * 0.13 + this.t * 1.7) + 0.2 * Math.sin(y * 0.047 - this.t * 1.1)
      const wl = Math.round(maxW * n * warn)
      const nr = 0.5 + 0.3 * Math.sin(y * 0.11 - this.t * 1.5 + 2) + 0.2 * Math.sin(y * 0.053 + this.t * 0.9)
      const wr = Math.round(maxW * nr * warn)
      if (wl > 0) {
        ctx.fillStyle = hair[0]
        ctx.fillRect(0, y, wl, 1)
        ctx.fillStyle = hair[2]
        ctx.fillRect(wl, y, 1, 1)
      }
      if (wr > 0) {
        ctx.fillStyle = hair[0]
        ctx.fillRect(W - wr, y, wr, 1)
        ctx.fillStyle = hair[2]
        ctx.fillRect(W - wr - 1, y, 1, 1)
      }
    }
  }

  /** 被头发淹没：一片头发从下往上涨满整个画面。 */
  private drawDrown(ctx: CanvasRenderingContext2D): void {
    const hair = SCENE.hair
    const k = this.phase === 'result' ? 1 : Math.min(1, this.phaseT / 1.3)
    const e = k * k * (3 - 2 * k)
    const level = H - e * (H + 20)
    for (let x = 0; x < W; x++) {
      const top = Math.round(level + 10 * Math.sin(x * 0.09 + this.t * 3) + 6 * Math.sin(x * 0.23 - this.t * 5))
      if (top >= H) continue
      const tt = Math.max(0, top)
      ctx.fillStyle = hair[0]
      ctx.fillRect(x, tt, 1, H - tt)
      // 发丝纹理：竖着的亮线
      const h = (x * 2654435761) >>> 0
      if (h % 3 === 0) {
        ctx.fillStyle = hair[h % 5 === 0 ? 3 : 1]
        const seg = 20 + (h % 40)
        ctx.fillRect(x, tt + 3, 1, Math.min(seg, H - tt))
      }
      ctx.fillStyle = hair[2]
      ctx.fillRect(x, tt, 1, 2)
    }
  }

  private openness(): number {
    if (this.phase !== 'play') return 1
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
    if (this.snapFlash > 0 && this.phase === 'play') {
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

  /** 奶白面板 + 珊瑚粉边（ART_STYLE 的 UI 面板配色）。 */
  private panelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string = SCENE.ui.panel): void {
    ctx.fillStyle = SCENE.ui.border
    ctx.fillRect(x + 1, y, w - 2, h)
    ctx.fillRect(x, y + 1, w, h - 2)
    ctx.fillStyle = fill
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4)
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    // 左上：发丝计数器（带弹跳）
    const text = formatNum(this.shown)
    const s = 1 + this.bump
    const flash = this.bump > 0.12
    const tw = textWidth(FONT_HUD, text, 2) + 18
    const pw = tw + 8
    const ph = 22
    const { c: tmp, ctx: t } = hudCanvas(Math.max(48, pw), ph)
    t.clearRect(0, 0, tmp.width, tmp.height)
    this.panelRect(t, 0, 0, tmp.width, ph)
    drawSprite(t, this.icon, 3, 4)
    drawPixelText(t, FONT_HUD, text, 19, 4, { color: flash ? RAMPS.gold[1] : SCENE.ui.text, outline: null, scale: 2 })
    const dw = Math.round(tmp.width * s)
    const dh = Math.round(tmp.height * s)
    // 以图标为中心缩放
    const ox = 4 - Math.round((dw - tmp.width) * 0.15)
    const oy = 4 - Math.round((dh - tmp.height) * 0.5)
    ctx.drawImage(tmp, ox, oy, dw, dh)

    // 右上：倒计时（最后 10 秒闪珊瑚粉）
    const time = formatTime(this.timeLeft)
    const hurry = this.timeLeft <= 10 && this.phase === 'play'
    const blink = hurry && Math.floor(this.t * 4) % 2 === 0
    const ttw = Math.max(textWidth(FONT_HUD, '00', 2), textWidth(FONT_HUD, time, 2)) + 12
    this.panelRect(ctx, W - ttw - 4, 4, ttw, 22, blink ? SCENE.ui.border : SCENE.ui.panel)
    drawPixelText(ctx, FONT_HUD, time, W - 4 - ttw / 2, 8, { color: blink ? SCENE.ui.panel : SCENE.ui.text, outline: null, scale: 2, align: 'center' })
    if (this.extraMode) {
      drawPixelText(ctx, FONT_HUD, `x${ROUND.extraValueMult}`, W - ttw - 12, 11, { color: RAMPS.gold[4], outline: RAMPS.gold[0], align: 'right' })
    }

    this.drawVolumeBar(ctx)

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

  /**
   * 右侧竖向发量条：上端是泳帽线、下端是地板线。
   * 深色填充到 80% 分位的末端（碰到底就爆表），亮线是最长那根能剪的头发。
   */
  private drawVolumeBar(ctx: CanvasRenderingContext2D): void {
    const top = CAP_Y
    const bottom = FLOOR_Y
    const warn = this.warnLevel()
    const blink = warn > 0.5 && Math.floor(this.t * 6) % 2 === 0
    ctx.fillStyle = blink ? SCENE.ui.border : SCENE.ui.text
    ctx.fillRect(BAR_X - 1, top - 1, BAR_W + 2, bottom - top + 2)
    ctx.fillStyle = SCENE.ui.panel
    ctx.fillRect(BAR_X, top, BAR_W, bottom - top)
    // 底部 20% 是危险区
    const dz = Math.round((bottom - top) * (1 - ROUND.warnFrom))
    ctx.fillStyle = rgba(SCENE.ui.border, 0.55)
    ctx.fillRect(BAR_X, bottom - dz, BAR_W, dz)
    const fillTo = Math.max(top, Math.min(bottom, Math.round(this.metrics.p80)))
    ctx.fillStyle = SCENE.hair[1]
    ctx.fillRect(BAR_X, top, BAR_W, fillTo - top)
    ctx.fillStyle = SCENE.hair[3]
    ctx.fillRect(BAR_X, top, 1, fillTo - top)
    const mc = Math.max(top, Math.min(bottom, Math.round(this.metrics.maxCuttable)))
    ctx.fillStyle = SCENE.hairGlint[0]
    ctx.fillRect(BAR_X - 2, mc, BAR_W + 4, 1)
    // 两端标记：泳帽（蓝）、地板（珊瑚粉）
    ctx.fillStyle = RAMPS.bcap[2]
    ctx.fillRect(BAR_X - 1, top - 3, BAR_W + 2, 2)
    ctx.fillStyle = SCENE.coral
    ctx.fillRect(BAR_X - 1, bottom + 1, BAR_W + 2, 2)
  }

  /** 泳帽线提示 / 结算面板的底（字在 overlay 里画）。 */
  private drawPanel(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = rgba(SCENE.ui.text, 0.45)
    ctx.fillRect(0, 0, W, H)
    const k = Math.min(1, this.phaseT / 0.18)
    const pop = Math.round((1 - k) * 18)
    if (this.phase === 'capPrompt') {
      this.panelRect(ctx, 34 - pop, 220 - pop, W - 68 + pop * 2, 252 + pop * 2)
      drawSprite(ctx, 'icon.swim_cap_blue', W / 2, 262, { scale: 1 })
    } else {
      this.panelRect(ctx, 34 - pop, 150 - pop, W - 68 + pop * 2, 350 + pop * 2)
      // 本局发丝（像素数字）
      drawSprite(ctx, this.icon, 106, 230)
      drawPixelText(ctx, FONT_HUD, '+' + formatNum(this.payout), 124, 229, { color: SCENE.ui.text, outline: null, scale: 3 })
      const rows: Array<[number, string]> = [
        [300, formatNum(this.maxCombo)],
        [330, formatNum(this.cuts)],
        [360, formatNum(sessionTotal)],
      ]
      for (const [y, v] of rows) drawPixelText(ctx, FONT_HUD, v, W - 60, y - 10, { color: SCENE.ui.text, outline: null, scale: 2, align: 'right' })
    }
    for (const b of this.buttons) {
      const hover = this.game.input.x >= b.x && this.game.input.x <= b.x + b.w && this.game.input.y >= b.y && this.game.input.y <= b.y + b.h
      const fill = b.primary ? SCENE.ui.border : SCENE.ui.panel
      ctx.fillStyle = SCENE.ui.text
      ctx.fillRect(b.x + 1, b.y + 2, b.w - 2, b.h)
      this.panelRect(ctx, b.x, b.y - (hover ? 1 : 0), b.w, b.h, fill)
    }
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const ui = SCENE.ui
    if (this.combo >= 2 && this.phase === 'play') {
      hiText(ctx, S.cut.combo, W / 2, FLOOR_Y - 64, { size: 13, color: ui.panel, stroke: ui.text, strokeWidth: 2, align: 'center' })
    }
    if (!sfx.ready && this.phase !== 'result') {
      const a = 0.75 + 0.25 * Math.sin(this.t * 4)
      hiText(ctx, S.cut.tapForSound, W / 2, H - 14, { size: 13, color: ui.text, stroke: ui.panel, strokeWidth: 2, align: 'center', alpha: a })
    }
    if (!this.everCut && (this.phase === 'ready' || this.phase === 'play')) {
      hiText(ctx, S.cut.dragHint, W / 2, 470, { size: 20, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center' })
      hiText(ctx, S.cut.debugHint, W / 2, 494, { size: 12, color: ui.panel, stroke: ui.text, strokeWidth: 2, align: 'center', alpha: 0.85 })
    }
    if (this.capHold > 0 && this.phase === 'play' && !this.capReached) {
      hiText(ctx, S.round.holdCap(ROUND.capHoldSec - this.capHold), 130, CAP_Y + 11, { size: 12, color: ui.panel, stroke: ui.text, strokeWidth: 2 })
    }
    if (this.phase === 'drown' && this.phaseT > 0.7) {
      const a = Math.min(1, (this.phaseT - 0.7) / 0.3)
      hiText(ctx, S.round.drowned, W / 2, 300, { size: 30, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center', alpha: a })
    }
    if (this.phase === 'ending') {
      const title = this.endReason === 'swim' ? S.round.goSwimming : S.round.timeUp
      hiText(ctx, title, W / 2, 300, { size: 30, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center' })
    }
    if (this.phase === 'capPrompt') {
      hiText(ctx, S.round.canSwim, W / 2, 315, { size: 26, color: ui.text, align: 'center' })
      hiText(ctx, S.round.keepCuttingHint(ROUND.extraValueMult), W / 2, 456, { size: 11, color: ui.text, align: 'center', alpha: 0.8 })
    }
    if (this.phase === 'result') {
      const title = this.endReason === 'drown' ? S.round.titleDrown : this.endReason === 'swim' ? S.round.titleSwim : S.round.titleTime
      hiText(ctx, title, W / 2, 196, { size: 24, color: ui.text, align: 'center' })
      hiText(ctx, S.round.earned, 64, 222, { size: 13, color: ui.text })
      if (this.endReason === 'drown') hiText(ctx, S.round.halfPay, W / 2, 272, { size: 12, color: RAMPS.pink[0], align: 'center' })
      hiText(ctx, S.round.maxCombo, 64, 300, { size: 15, color: ui.text })
      hiText(ctx, S.round.strandsCut, 64, 330, { size: 15, color: ui.text })
      hiText(ctx, S.round.total, 64, 360, { size: 15, color: ui.text })
      if (this.capReached) hiText(ctx, S.round.swimUnlocked, W / 2, 400, { size: 16, color: RAMPS.bcap[0], align: 'center' })
      else hiText(ctx, S.round.capTip, W / 2, 400, { size: 12, color: ui.text, align: 'center', alpha: 0.75 })
    }
    for (const b of this.buttons) {
      hiText(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, { size: 17, color: b.primary ? ui.panel : ui.text, align: 'center', baseline: 'middle' })
    }
  }

  // ---------------------------------------------------------------- 调试

  stats(): Record<string, number | string> {
    return {
      phase: this.phase,
      timeLeft: Math.round(this.timeLeft * 10) / 10,
      cuts: this.cuts,
      snaps: this.snaps,
      combo: this.combo,
      maxCombo: this.maxCombo,
      bank: Math.round(this.bank * 10) / 10,
      shown: Math.round(this.shown * 10) / 10,
      payout: Math.round(this.payout * 10) / 10,
      strands: this.field.strands.length,
      pieces: this.field.pieces.length,
      particles: this.particles.count,
      sparks: this.collector.count,
      danger: Math.round(this.danger * 100) / 100,
      onFloor: Math.round(this.metrics.onFloor * 100) / 100,
      maxCuttable: Math.round(this.metrics.maxCuttable),
      capHold: Math.round(this.capHold * 10) / 10,
      capReached: this.capReached ? 1 : 0,
      snipsPlayed: sfx.snipsPlayed,
      snipsMerged: sfx.snipsMerged,
    }
  }

  statsText(): Record<string, string | number> {
    const p = this.game.perf.snapshot()
    return { fps: p.fps.toFixed(0), cpuMs: p.avgCpuMs.toFixed(2), ...this.stats() }
  }

  /** 给测试脚本用的后门。 */
  debugApi(): Record<string, (...a: number[]) => unknown> {
    return {
      trimAll: (y = CAP_Y - 60) => this.field.trimAll(y, ROUND.sharpness),
      growAll: (px = 400) => this.field.growAll(px),
      setTime: (sec = 3) => {
        this.timeLeft = sec
      },
    }
  }
}

let restarts = 0

function makeBackground(): HTMLCanvasElement {
  const { c, ctx } = makeCanvas(W, H)
  drawTiles(ctx, 0, 0, W, H, 20, 7)
  drawPoolside(ctx, 0, FLOOR_Y + 2, W, H - FLOOR_Y - 2)
  drawScalp(ctx, W)
  return c
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
  drawShape(ctx, shape, { '#': SCENE.ui.text, '1': hair[0], '2': hair[2], '3': hair[4] })
  ctx.fillStyle = SCENE.hairGlint[0]
  ctx.fillRect(6, 3, 1, 1)
  ctx.fillRect(9, 7, 1, 1)
  return registerCanvas('hud.strand', c, 0, 0)
}

/** 泳帽线上的小泳帽（16×11，bcap 色阶，描边用自身最深档）。 */
function makeCapIcon(): Sprite {
  const { c, ctx } = makeCanvas(16, 11)
  const shape = [
    '.....######.....',
    '...##443322##...',
    '..#4433322222#..',
    '.#443332222221#.',
    '.#433222222211#.',
    '#43322222222111#',
    '#33222222221111#',
    '################',
    '#5151515151515.#',
    '#1111111111111.#',
    '.##############.',
  ]
  const r = RAMPS.bcap
  const b = RAMPS.bband
  drawShape(ctx, shape, { '#': r[0], '1': r[1], '2': r[2], '3': r[3], '4': r[4], '5': b[3] })
  return registerCanvas('hud.cap', c, 0, 0)
}

function drawShape(ctx: CanvasRenderingContext2D, shape: readonly string[], col: Record<string, string>): void {
  shape.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const k = row[x]!
      const cc = col[k]
      if (!cc) continue
      ctx.fillStyle = cc
      ctx.fillRect(x, y, 1, 1)
    }
  })
}
