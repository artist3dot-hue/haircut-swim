// 泳池边（DESIGN_V2 方案 A + D）：主界面和剪发是同一个场景。
// - hub：镜头拉远，看到阿发坐在理发椅上、长发拖地；物件都能点（镜子、工具架、奖牌板、收音机、泳池……）
// - cut：镜头拉近到头发上，没有倒计时，一直剪；点"回泳池边"拉远
// - zoomIn / zoomOut：镜头推近 / 拉远的过渡
// - swim：去游泳（转生）的过场
// 头发是持久的（HairWorld，存进存档），剪掉就没了，只会慢慢长回来。

import type { Scene } from '../core/scene'
import type { Game } from '../game'
import { W, H } from '../core/screen'
import { Rng } from '../core/rng'
import { formatNum } from '../core/format'
import { save, saveGame, onBeforeSave, exportSave, importSave, resetGame } from '../core/save'
import { SCENE, RAMPS, u32, rgba } from '../art/palette'
import { drawSprite, makeCanvas } from '../art/sprites'
import { drawPixelText, textWidth, FONT_HUD, FONT_TINY } from '../art/pixelfont'
import { hiText, hiTextWidth } from '../art/text'
import { strandIcon } from '../art/hudicons'
import { sparkle, ditherOverlay } from '../art/draw'
import { buildRoomBackground, buildProps, drawWaterFx, drawAirFx, softShadow, COPING_TOP, WATER_TOP, type Props } from '../art/room'
import { buildAfa, drawAfaBody, drawAfaHead, drawAfaHair, AFA_X, HEAD_Y, type AfaParts, type Expression } from '../art/afa'
import { buildCloseupWall, buildCloseupLight, drawWallCaustics, buildCrown, drawCapLine, capLineBadge, BG_PERIOD } from '../art/closeup'
import { toolSprites, TOOL_FRAMES } from '../art/tools'
import { HairWorld, rootYAt, type Piece, type SnapResult } from '../hair/world'
import { Raster } from '../hair/raster'
import { Particles } from '../juice/particles'
import { Floaters } from '../juice/floaters'
import { Collector } from '../juice/collect'
import { Shake } from '../juice/shake'
import { sfx, type SnipVoice } from '../audio/sfx'
import { JUICE, COMBO_TIERS, comboMult, comboSemitones } from '../data/juice'
import { HAIR_TYPES } from '../data/hair'
import { TOOLS, TOOL_BY_ID, bestTool, HAIR_WORLD, type ToolDef, type ToolId } from '../data/tools'
import { upgradesFrom, medalsFor, MEDALS, medalPrice, type Upgrades } from '../data/skills'
import { S } from '../data/strings'
import { Dialog, panelRect, type DialogButton } from '../ui/dialog'
import { SkillTree, anySkillAffordable } from '../ui/skilltree'
import { ShopPanel, type ShopItem } from '../ui/shop'
import { showTextBox } from '../ui/textbox'
import { DebugPanel } from '../ui/debug'
import { SwimCinematic } from './swim'

type Mode = 'hub' | 'zoomIn' | 'cut' | 'zoomOut' | 'swim'
type ObjId = 'afa' | 'mirror' | 'rack' | 'board' | 'sign' | 'trolley' | 'radio' | 'pool'

interface HubObject {
  id: ObjId
  x: number
  y: number
  w: number
  h: number
  label: string
}

const OBJECTS: HubObject[] = [
  { id: 'afa', x: 196, y: 372, w: 148, h: 356, label: S.hub.afa },
  { id: 'mirror', x: 26, y: 232, w: 120, h: 184, label: S.hub.mirror },
  { id: 'rack', x: 328, y: 330, w: 194, h: 84, label: S.hub.rack },
  { id: 'board', x: 208, y: 54, w: 104, h: 80, label: S.hub.board },
  { id: 'sign', x: 328, y: 34, w: 194, h: 230, label: S.hub.sign },
  { id: 'trolley', x: 30, y: 590, w: 136, h: 150, label: S.hub.trolley },
  { id: 'radio', x: 418, y: 586, w: 100, h: 150, label: S.hub.radio },
  { id: 'pool', x: 0, y: 792, w: 540, h: 168, label: S.hub.pool },
]

/** 计数器图标的位置（光点飞向这里） */
const COUNTER_X = 36
const COUNTER_Y = 40
const ZOOM_TIME = 0.7

const DEBRIS = [u32(SCENE.hair[1]), u32(SCENE.hair[2]), u32(SCENE.hair[3]), u32(SCENE.hair[3]), u32(SCENE.hairGlint[0])]
const STEEL_SPARKS = [u32(RAMPS.gold[4]), u32(RAMPS.steel[4]), u32(SCENE.hairGlint[1])]
const WHITE_DEBRIS = [u32(RAMPS.head[2]), u32(RAMPS.head[3]), u32(RAMPS.head[4])]

let debugPanel: DebugPanel | null = null

interface TextFloat {
  text: string
  x: number
  y: number
  age: number
  life: number
  size: number
  color: string
}

export class PoolScene implements Scene {
  readonly name = 'pool'
  private mode: Mode = 'hub'
  private modeT = 0
  private t = 0
  private rng = new Rng()
  readonly world = new HairWorld()
  private up: Upgrades
  private tool: ToolDef

  // ---- 主界面 ----
  private roomBg: HTMLCanvasElement
  private props: Props
  private afa: AfaParts
  private hubRaster = new Raster(W, H)
  private hover: ObjId | null = null
  private hoverT = 0
  private dialog: Dialog | null = null
  private tree = new SkillTree()
  private toolShop: ShopPanel
  private medalShop: ShopPanel
  private resetArmed = 0
  private tearT = 0

  // ---- 剪发 ----
  private wall: HTMLCanvasElement
  private light: HTMLCanvasElement
  private crown: HTMLCanvasElement
  private cutRaster = new Raster(W, H)
  private camY = 0
  private sx = W / 2
  private sy = H * 0.6
  private psx = W / 2
  private psy = H * 0.6
  private sinceSnap = 0
  private snapFlash = 0
  private jamT = 0
  private recoil = 0
  private hitstop = 0
  private trail: Array<[number, number]> = []
  private particles = new Particles()
  private floaters = new Floaters()
  private texts: TextFloat[] = []
  private collector = new Collector(COUNTER_X, COUNTER_Y)
  private shake = new Shake()
  private twinkles: Array<{ x: number; y: number; age: number }> = []
  private twinkleT = 0
  private combo = 0
  private comboTimer = 0
  private tierReached = 0
  private tierText: { text: string; age: number; tier: number } | null = null
  private pending = 0
  private bump = 0
  private bumpV = 0
  private collectStreak = 0
  private collectStreakT = 0
  private capHold = 0
  private capSeen = false
  private sessionCut = 0
  private clipperLoad = 0
  private everCut = false

  // ---- 过场 ----
  private hubCanvas = makeCanvas(W, H)
  private cutCanvas = makeCanvas(W, H)
  private swim: SwimCinematic | null = null

  // 统计
  private cuts = 0
  private snaps = 0
  private jams = 0

  constructor(private readonly game: Game) {
    this.roomBg = buildRoomBackground()
    this.props = buildProps()
    this.afa = buildAfa()
    this.bakeShadows()
    this.wall = buildCloseupWall()
    this.light = buildCloseupLight(W, H)
    this.crown = buildCrown()
    this.up = upgradesFrom(save.skills, save.medalSkills)
    this.tool = bestTool(save.tools)
    this.world.knotEase = this.up.knotEase
    if (save.hair && save.hair.lens.length) this.world.load(save.hair)
    else this.newHead()
    onBeforeSave(() => {
      save.hair = this.world.save()
    })
    this.toolShop = new ShopPanel(S.hub.rackTitle, () => this.toolItems(), () => save.hairs, (ctx, x, y) => drawSprite(ctx, strandIcon(), x, y))
    this.medalShop = new ShopPanel(S.hub.boardTitle, () => this.medalItems(), () => save.medals, (ctx, x, y) => drawMedal(ctx, x + 7, y + 7, 1), () => (save.loops === 0 ? S.hub.boardEmpty : ''))
    this.tree.onBuy = () => this.refreshUpgrades()
    this.toolShop.onClose = () => this.refreshUpgrades()
    this.medalShop.onClose = () => this.refreshUpgrades()
    if (!debugPanel) debugPanel = new DebugPanel(() => undefined, () => this.statsText())
    game.input.consumeTaps()
    const m = this.world.metrics(0, 1)
    this.camY = this.targetCam(m.front)
    this.capSeen = this.camY < this.capY() + 200
    // ?scene=cut：直接进剪发
    if (new URLSearchParams(location.search).get('scene') === 'cut') this.setMode('cut')
  }

  private newHead(): void {
    const loops = save.loops
    const count = HAIR_WORLD.locks + loops * HAIR_WORLD.loopLockAdd
    const mult = Math.pow(HAIR_WORLD.loopLenMult, loops)
    this.world.fresh((Math.random() * 1e9) | 0, count, HAIR_WORLD.lenMin * mult, HAIR_WORLD.lenMax * mult, this.up.rareMult)
    save.hair = this.world.save()
  }

  private refreshUpgrades(): void {
    this.up = upgradesFrom(save.skills, save.medalSkills)
    const before = this.tool.id
    this.tool = bestTool(save.tools)
    this.world.knotEase = this.up.knotEase
    if (before !== this.tool.id) sfx.buy()
    saveGame()
  }

  private capY(): number {
    return HAIR_WORLD.capY + this.up.capLower
  }

  private bakeShadows(): void {
    const ctx = this.roomBg.getContext('2d')!
    softShadow(ctx, 98, 736, 70, 10)
    softShadow(ctx, 468, 730, 44, 9)
    softShadow(ctx, AFA_X, 734, 80, 14)
    softShadow(ctx, 86, 420, 50, 8, 0.5)
  }

  private setMode(m: Mode): void {
    this.mode = m
    this.modeT = 0
    this.game.input.consumeTaps()
    if (m === 'cut') {
      this.sessionCut = 0
      this.everCut = false
    }
    if (m === 'hub' && this.sessionCut > 3000) this.tearT = 5
    if (m !== 'cut') sfx.setClipper(false)
  }

  // ================================================================ 逻辑

  update(dt: number): void {
    this.t += dt
    this.modeT += dt
    save.playTime += dt
    if (this.resetArmed > 0) this.resetArmed -= dt
    if (this.tearT > 0) this.tearT -= dt
    // 头发一直在慢慢长（主界面里也长）
    this.world.grow(dt, this.up.growthMult)

    switch (this.mode) {
      case 'hub':
        this.updateHub(dt)
        break
      case 'cut':
        this.updateCut(dt)
        break
      case 'zoomIn':
        this.game.input.consumeTaps()
        if (this.modeT >= ZOOM_TIME) this.setMode('cut')
        break
      case 'zoomOut':
        this.game.input.consumeTaps()
        if (this.modeT >= ZOOM_TIME) this.setMode('hub')
        break
      case 'swim':
        this.swim?.update(dt, this.game.input.consumeTaps())
        if (this.swim?.done) {
          this.swim = null
          this.setMode('hub')
        }
        break
    }
    this.updateJuice(dt)
  }

  // ---------------------------------------------------------------- 主界面

  private updateHub(dt: number): void {
    const input = this.game.input
    const taps = input.consumeTaps()
    input.consumeKeys()
    if (this.tree.isOpen) {
      this.tree.update(dt, taps)
      return
    }
    if (this.toolShop.isOpen) {
      this.toolShop.update(dt, taps)
      return
    }
    if (this.medalShop.isOpen) {
      this.medalShop.update(dt, taps)
      return
    }
    if (this.dialog) {
      this.dialog.update(dt)
      for (const tp of taps) if (this.dialog?.tap(tp.x, tp.y)) sfx.click()
      return
    }
    const over = input.seen && input.pointerType === 'mouse' ? this.hit(input.x, input.y) : null
    if (over !== this.hover) {
      this.hover = over
      this.hoverT = 0
      if (over) sfx.hover()
    }
    this.hoverT += dt
    for (const tp of taps) {
      const id = this.hit(tp.x, tp.y)
      if (id) {
        this.activate(id)
        break
      }
    }
  }

  private hit(x: number, y: number): ObjId | null {
    for (const o of OBJECTS) if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o.id
    return null
  }

  private activate(id: ObjId): void {
    sfx.click()
    switch (id) {
      case 'afa':
        this.enterCut()
        break
      case 'mirror':
        this.tree.open()
        break
      case 'rack':
        this.toolShop.open()
        break
      case 'board':
        this.medalShop.open()
        break
      case 'sign':
        this.dialog = new Dialog(S.hub.signTitle, () => S.hub.signLines(this.progressPct(), save.capReached), [this.closeBtn()])
        break
      case 'trolley':
        this.dialog = new Dialog(S.hub.trolleyTitle, () => S.hub.trolleyLines, [this.closeBtn()])
        break
      case 'pool':
        if (save.capReached) this.confirmSwim()
        else this.dialog = new Dialog(S.hub.poolTitle, () => S.hub.poolLocked, [this.closeBtn()])
        break
      case 'radio':
        this.openSettings()
        break
    }
  }

  private enterCut(): void {
    saveGame()
    this.hover = null
    this.setMode('zoomIn')
    sfx.whoosh()
  }

  private closeBtn(): DialogButton {
    return { label: () => S.hub.close, action: () => (this.dialog = null), primary: true }
  }

  /** 还剩多少头发要剪（0–100%）。 */
  private progressPct(): number {
    const cap = this.capY()
    let left = 0
    let total = 0
    for (const s of this.world.locks) {
      if (HAIR_TYPES[s.kind].hardness > 3) continue
      left += Math.max(0, s.rootY + s.length - cap)
      total += Math.max(0, s.rootY + this.world.initialAvg - cap)
    }
    return Math.max(0, Math.min(100, Math.ceil((left / Math.max(1, total)) * 100)))
  }

  private confirmSwim(): void {
    const m = medalsFor(save.loopHairs)
    this.dialog = new Dialog(S.swim.confirmTitle, () => S.swim.confirmLines(m), [
      {
        label: () => S.swim.go,
        primary: true,
        action: () => {
          this.dialog = null
          this.startSwim(m)
        },
      },
      { label: () => S.swim.later, action: () => (this.dialog = null) },
    ])
  }

  private startSwim(medals: number): void {
    const loopN = save.loops + 1
    this.swim = new SwimCinematic(this.afa, this.props, this.roomBg, medals, loopN, () => this.applySwim(medals))
    this.setMode('swim')
    sfx.fanfare()
  }

  /** 转生：拿奖牌，重置发丝 / 工具 / 技能 / 头发，下一轮头发更长。 */
  private applySwim(medals: number): void {
    save.medals += medals
    save.loops += 1
    save.hairs = 0
    save.loopHairs = 0
    save.skills = { root: 1 }
    const start = save.medalSkills.m_start ?? 0
    save.tools = ['knife', ...(start >= 1 ? ['scissors'] : []), ...(start >= 2 ? ['shears'] : [])]
    save.capReached = false
    this.up = upgradesFrom(save.skills, save.medalSkills)
    this.tool = bestTool(save.tools)
    this.newHead()
    this.camY = this.targetCam(this.world.metrics(0, 1).front)
    this.capSeen = false
    this.capHold = 0
    saveGame()
  }

  private toolItems(): ShopItem[] {
    const ownedIdx = TOOLS.findIndex((t) => t.id === this.tool.id)
    return TOOLS.map((t, i) => {
      const owned = save.tools.includes(t.id)
      const info = S.tools[t.id]!
      return {
        id: t.id,
        name: info.name,
        desc: info.desc,
        tag: `抓力 ${t.grip} · 一次 ${t.capacity} 缕`,
        price: owned ? null : t.price,
        doneLabel: t.id === this.tool.id ? S.hub.owned : S.hub.ownedOld,
        locked: !owned && i > ownedIdx + 1,
        icon: (ctx, cx, cy) => {
          const sp = toolSprites(t.id, t.radius)
          const f = sp.frames[TOOL_FRAMES - 1]!
          const k = Math.min(1, 68 / f.w)
          if (k >= 1) drawSprite(ctx, f, cx - f.w / 2 + f.ax, cy - f.h / 2 + f.ay)
          else ctx.drawImage(f.img, Math.round(cx - (f.w * k) / 2), Math.round(cy - (f.h * k) / 2), Math.round(f.w * k), Math.round(f.h * k))
        },
        buy: () => {
          if (save.hairs < t.price) return false
          save.hairs -= t.price
          save.tools.push(t.id)
          this.refreshUpgrades()
          this.textFloat(S.cut.newTool(info.name), W / 2, 300, 26, RAMPS.gold[4])
          return true
        },
      }
    })
  }

  private medalItems(): ShopItem[] {
    return MEDALS.map((m) => {
      const lv = save.medalSkills[m.id] ?? 0
      const info = S.medals[m.id]!
      const maxed = lv >= m.max
      return {
        id: m.id,
        name: info.name,
        desc: info.desc,
        tag: S.hub.lv(lv, m.max),
        price: maxed ? null : medalPrice(m.id, lv),
        doneLabel: S.tree.maxed,
        icon: (ctx, cx, cy) => drawMedal(ctx, cx, cy, 2),
        buy: () => {
          const p = medalPrice(m.id, lv)
          if (save.medals < p) return false
          save.medals -= p
          save.medalSkills[m.id] = lv + 1
          if (m.id === 'm_start') {
            if (!save.tools.includes('scissors')) save.tools.push('scissors')
            if (lv + 1 >= 2 && !save.tools.includes('shears')) save.tools.push('shears')
          }
          this.refreshUpgrades()
          return true
        },
      }
    })
  }

  private openSettings(): void {
    const dlg = new Dialog(
      S.settings.title,
      () => [S.settings.savedAt(new Date(save.savedAt).toLocaleTimeString('zh-CN'))],
      [
        {
          label: () => S.settings.volume(save.settings.volume),
          action: () => {
            const v = Math.round(save.settings.volume * 5 + 1) / 5
            save.settings.volume = v > 1.001 ? 0 : v
            sfx.volume = save.settings.volume
            saveGame()
          },
        },
        {
          label: () => S.settings.vibrate(save.settings.vibrate),
          action: () => {
            save.settings.vibrate = !save.settings.vibrate
            saveGame()
          },
        },
        {
          label: () => S.settings.replayIntro,
          action: () => {
            this.dialog = null
            saveGame()
            this.game.goto('intro')
          },
        },
        {
          label: () => S.settings.exportSave,
          action: () => {
            const code = exportSave()
            void navigator.clipboard?.writeText(code).catch(() => undefined)
            dlg.flash(S.settings.exported)
            showTextBox({ title: S.settings.exported, value: code, readonly: true })
          },
        },
        {
          label: () => S.settings.importSave,
          action: () => {
            showTextBox({
              title: S.settings.importPrompt,
              onOk: (text) => {
                if (importSave(text)) location.reload()
                else dlg.flash(S.settings.importBad)
              },
            })
          },
        },
        {
          label: () => (this.resetArmed > 0 ? S.settings.resetConfirm : S.settings.resetSave),
          action: () => {
            if (this.resetArmed > 0) {
              resetGame()
              location.reload()
              return
            }
            this.resetArmed = 3
          },
        },
        this.closeBtn(),
      ],
    )
    this.dialog = dlg
  }

  // ---------------------------------------------------------------- 剪发

  private radius(): number {
    return this.tool.radius + this.up.radius
  }

  private targetCam(front: number): number {
    // 让最长的那些发梢停在画面下方 88% 处；最上面能看到一点头顶上方的墙
    return Math.max(-60, front - H * 0.88)
  }

  private updateCut(dt: number): void {
    const input = this.game.input
    const taps = input.consumeTaps()
    input.consumeKeys()
    if (this.dialog) {
      this.dialog.update(dt)
      for (const tp of taps) if (this.dialog?.tap(tp.x, tp.y)) sfx.click()
      return
    }
    // 右上角"回泳池边"
    for (const tp of taps) {
      if (tp.x >= W - 164 && tp.y <= 70) {
        sfx.click()
        saveGame()
        this.setMode('zoomOut')
        sfx.whoosh()
        return
      }
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt
      return
    }

    // 剪刀跟手（缠住时几乎拖不动）
    let tx = input.x
    let ty = input.y
    if (input.pointerType !== 'mouse') ty -= JUICE.touchOffsetY
    if (!input.seen) {
      tx = W / 2
      ty = H * 0.6
    }
    tx = Math.max(0, Math.min(W, tx))
    ty = Math.max(90, Math.min(H - 20, ty))
    this.psx = this.sx
    this.psy = this.sy
    const follow = (this.tool.follow + this.up.follow) * (this.jamT > 0 ? 0.08 : 1)
    const k = 1 - Math.exp(-follow * dt)
    this.sx += (tx - this.sx) * k
    this.sy += (ty - this.sy) * k
    if (this.jamT > 0) {
      this.jamT -= dt
      this.sx += (Math.random() - 0.5) * 2
    }
    this.recoil *= Math.exp(-dt * 18)

    // 镜头跟着剪发前沿
    const m = this.world.metrics(this.capY(), this.tool.sharpness)
    const target = this.targetCam(m.front)
    this.camY += (target - this.camY) * (1 - Math.exp(-JUICE.cameraFollow * dt))
    if (!this.capSeen && this.camY < this.capY() - 100) {
      this.capSeen = true
      sfx.fanfare()
      this.textFloat(S.cut.capSeen, W / 2, 260, 34, RAMPS.bcap[3])
    }

    // 头发物理：剪刀附近的头发被推开
    const push = this.world.push
    push.cx = this.sx
    push.cy = this.sy + this.camY
    push.halfW = this.radius() + JUICE.pushRange
    push.halfH = this.tool.thick + this.up.thickness + JUICE.pushRange
    push.mvx = this.sx - this.psx
    push.mvy = this.sy - this.psy
    push.strength = JUICE.pushStrength
    push.blade = this.radius()
    this.world.step(dt, this.t)
    for (const pc of this.world.takeFallen(this.camY + H)) this.onFallen(pc)

    // 自动咔嚓（鼠标还没动过、或指在按钮上时不剪）
    const overButton = this.sy < 72 && this.sx > W - 170
    const iv = this.tool.interval * this.up.snapMult
    this.sinceSnap += dt
    if (!input.seen || overButton || this.jamT > 0) this.sinceSnap = Math.min(this.sinceSnap, iv * 0.6)
    if (this.sinceSnap >= iv) {
      this.sinceSnap = Math.min(this.sinceSnap - iv, iv)
      this.doSnap()
    }
    if (this.snapFlash > 0) this.snapFlash -= dt
    if (this.tool.continuous) {
      this.clipperLoad *= Math.exp(-dt * 6)
      sfx.setClipper(input.seen, Math.min(1, this.clipperLoad))
    }

    // 泳帽线：所有剪得动的头发都在线以上，保持 3 秒
    if (!save.capReached) {
      if (m.maxCuttable <= this.capY()) this.capHold += dt
      else this.capHold = 0
      if (this.capHold >= HAIR_WORLD.capHold) {
        save.capReached = true
        saveGame()
        sfx.fanfare()
        this.dialog = new Dialog(S.cut.canSwim, () => S.cut.canSwimLines, [
          {
            label: () => S.cut.goPool,
            primary: true,
            action: () => {
              this.dialog = null
              this.setMode('zoomOut')
              sfx.whoosh()
            },
          },
          { label: () => S.cut.keepCutting, action: () => (this.dialog = null) },
        ])
      }
    }

    // 连击
    if (this.combo > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) this.breakCombo()
    }
    if (this.tierText) {
      this.tierText.age += dt
      if (this.tierText.age > 1.1) this.tierText = null
    }
    // 白头发闪星
    this.twinkleT -= dt
    if (this.twinkleT <= 0) {
      this.twinkleT = 0.1
      const p = this.world.randomPointOf('white', this.camY, H)
      if (p) this.twinkles.push({ x: p[0] + this.rng.jitter(4), y: p[1] - this.camY, age: 0 })
    }
    this.trail.unshift([this.sx, this.sy])
    if (this.trail.length > 12) this.trail.length = 12
  }

  private breakCombo(): void {
    this.combo = 0
    this.tierReached = 0
    sfx.setDrums(false)
  }

  private doSnap(): void {
    this.snaps++
    this.snapFlash = 0.06
    const t = this.tool
    const res: SnapResult = this.world.snap(
      this.sx,
      this.sy + this.camY,
      { radius: this.radius(), thick: t.thick + this.up.thickness, capacity: t.capacity, grip: t.grip * this.up.gripMult, sharpness: t.sharpness },
      this.up.tangleMult,
    )
    if (res.jam) {
      this.jams++
      this.jamT = HAIR_WORLD.jamTime
      sfx.jam()
      this.breakCombo()
      this.textFloat(S.cut.tangled, this.sx, this.sy - 30, 22, SCENE.ui.panel)
      this.particles.burst(this.sx, this.sy, 5, 60, DEBRIS, this.rng, 0.2)
      return
    }
    if (!res.hits.length && !res.knots.length && !res.blocked.length) {
      if (!t.continuous) sfx.emptySnap()
      return
    }
    const cutsNow = res.hits.length
    let total = 0
    let rare = false
    let budget = Math.round(JUICE.floaterMaxPerSnap)
    const before = this.combo
    for (const [x, y] of res.blocked) this.particles.burst(x, y - this.camY, 5, 160, STEEL_SPARKS, this.rng, 0.3)
    if (res.blocked.length) {
      sfx.clang()
      this.recoil = 5
      this.textFloat(S.cut.tooHard, this.sx, this.sy - 30, 20, RAMPS.steel[4])
    }
    for (const [x, y] of res.knots) {
      this.combo++
      this.comboTimer = HAIR_WORLD.comboTimeout + this.up.grace
      sfx.thud()
      this.particles.burst(x, y - this.camY, 3, JUICE.debrisSpeed * 0.6, DEBRIS, this.rng)
    }
    for (const h of res.hits) {
      this.combo++
      this.cuts++
      this.everCut = true
      this.comboTimer = HAIR_WORLD.comboTimeout + this.up.grace
      const type = HAIR_TYPES[h.piece.kind]
      const cm = 1 + (comboMult(this.combo) - 1) * this.up.comboMult
      const crit = this.rng.chance(this.up.crit)
      const value = HAIR_WORLD.valueK * Math.pow(h.len, HAIR_WORLD.valueExp) * type.value * cm * this.up.valueMult * (crit ? 5 : 1)
      h.piece.value = value
      total += value
      save.hairs += value
      save.loopHairs += value
      save.lifetimeHairs += value
      this.pending += value
      this.sessionCut += h.len
      const hy = h.y - this.camY
      const n = this.rng.int(JUICE.debrisMin, Math.max(JUICE.debrisMin, JUICE.debrisMax)) + Math.min(6, Math.floor(h.len / 150))
      this.particles.burst(h.x, hy, n, JUICE.debrisSpeed, h.piece.kind === 'white' ? WHITE_DEBRIS : DEBRIS, this.rng)
      sfx.snip(comboSemitones(this.combo), cutsNow, t.id as SnipVoice)
      if (crit) this.floaters.add('x5', h.x, hy - 20, { life: 0.9, rise: 30, scale: 3, color: RAMPS.gold[3], big: true })
      if (type.rare) {
        rare = true
        sfx.ding()
        this.floaters.add('+' + formatNum(value), h.x, hy - 8, { life: 1, rise: 34, scale: 3, color: SCENE.hairGlint[1], big: true })
        for (let i = 0; i < 5; i++) this.twinkles.push({ x: h.x + this.rng.jitter(14), y: hy + this.rng.jitter(14), age: -i * 0.05 })
      } else if (budget > 0) {
        budget--
        const style = floaterStyle(this.combo, value)
        this.floaters.add('+' + formatNum(value), h.x, hy - 4, { life: JUICE.floaterTime, rise: JUICE.floaterRise, scale: style.scale, color: style.color, drift: this.rng.jitter(8) })
      }
    }
    if (t.continuous) this.clipperLoad = Math.min(1.5, this.clipperLoad + cutsNow * 0.3)
    save.bestCombo = Math.max(save.bestCombo, this.combo)
    if (cutsNow >= 2 && total >= 2) {
      const style = floaterStyle(this.combo, total)
      this.floaters.add('+' + formatNum(total), this.sx, this.sy - 44, { life: JUICE.floaterTime * 1.3, rise: JUICE.floaterRise * 1.2, scale: style.scale + 1, color: style.color, big: true })
    }
    if (rare) this.hitstop = JUICE.hitstopRare
    if (cutsNow > 0 && save.settings.vibrate && navigator.vibrate && this.game.input.pointerType !== 'mouse') {
      try {
        navigator.vibrate(rare ? JUICE.vibrateRareMs : JUICE.vibrateMs)
      } catch {
        /* 不给震就算了 */
      }
    }
    for (let i = 0; i < COMBO_TIERS.length; i++) {
      const tier = COMBO_TIERS[i]!
      if (before < tier.at && this.combo >= tier.at && this.tierReached <= i) {
        this.tierReached = i + 1
        this.tierText = { text: `${tier.at}!`, age: 0, tier: i }
        if (i > 0) {
          sfx.tierUp(i)
          this.shake.kick(JUICE.shakeTier * (1 + i * 0.15), JUICE.shakeTime)
        }
        if (i >= 3) sfx.setDrums(true)
      }
    }
  }

  /** 断发掉出画面下方：化成光点飞向计数器。 */
  private onFallen(pc: Piece): void {
    sfx.rustle(0.3 + Math.min(1, pc.len / 300) * 0.7)
    if (pc.value <= 0) return
    const x = Math.max(10, Math.min(W - 10, pc.cx))
    const n = Math.max(1, Math.min(4, Math.round(JUICE.sparksPerPiece + pc.len / 400)))
    for (let k = 0; k < n; k++) {
      this.collector.add(x + this.rng.jitter(10), H - 12, pc.value / n, this.rng.range(JUICE.sparkFlyMin, JUICE.sparkFlyMax), this.rng, this.rng.range(0, 0.12))
    }
  }

  private textFloat(text: string, x: number, y: number, size: number, color: string): void {
    this.texts.push({ text, x, y, age: 0, life: 1.1, size, color })
  }

  private updateJuice(dt: number): void {
    this.particles.update(dt, H + 50)
    this.floaters.update(dt)
    for (const tf of this.texts) tf.age += dt
    this.texts = this.texts.filter((tf) => tf.age < tf.life)
    for (const tw of this.twinkles) tw.age += dt
    this.twinkles = this.twinkles.filter((tw) => tw.age < 0.35)
    const got = this.collector.update(dt)
    if (got.n > 0) {
      this.pending = Math.max(0, this.pending - got.value)
      this.bumpV += JUICE.counterBump * 14
      this.collectStreak += got.n
      this.collectStreakT = 0.4
      sfx.collect(this.collectStreak)
    }
    // 没有光点在飞时，待入账归零（防止浮点误差）
    if (this.collector.count === 0 && this.world.pieces.length === 0) this.pending = 0
    this.collectStreakT -= dt
    if (this.collectStreakT <= 0) this.collectStreak = 0
    this.bumpV += (-this.bump * 520 - this.bumpV * 22) * dt
    this.bump = Math.max(-0.2, Math.min(0.6, this.bump + this.bumpV * dt))
    this.shake.update(dt)
  }

  // ================================================================ 画面

  render(alpha: number): void {
    const ctx = this.game.screen.lctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.imageSmoothingEnabled = false
    switch (this.mode) {
      case 'hub':
        this.renderHub(ctx)
        break
      case 'cut':
        this.renderCut(ctx, alpha)
        break
      case 'zoomIn':
      case 'zoomOut': {
        const k = Math.min(1, this.modeT / ZOOM_TIME)
        const z = this.mode === 'zoomIn' ? k : 1 - k
        this.renderZoom(ctx, alpha, z)
        break
      }
      case 'swim':
        this.swim?.render(ctx)
        break
    }
  }

  /** z：0 = 主界面，1 = 剪发。先把主界面推近（最近邻放大），再淡入剪发画面。 */
  private renderZoom(ctx: CanvasRenderingContext2D, alpha: number, z: number): void {
    const e = z * z * (3 - 2 * z)
    const hc = this.hubCanvas.ctx
    this.renderHub(hc, true)
    const s = 1 + e * 5
    const fx = AFA_X
    const fy = HEAD_Y + 10
    const sw = W / s
    const sh = H / s
    const cx = W / 2 + (fx - W / 2) * e
    const cy = H / 2 + (fy - H / 2) * e
    ctx.drawImage(this.hubCanvas.c, cx - sw / 2, cy - sh / 2, sw, sh, 0, 0, W, H)
    const fade = Math.max(0, (e - 0.45) / 0.55)
    if (fade > 0) {
      this.renderCut(this.cutCanvas.ctx, alpha, true)
      ctx.globalAlpha = fade
      ctx.drawImage(this.cutCanvas.c, 0, 0)
      ctx.globalAlpha = 1
    }
  }

  private expression(): Expression {
    const a = this.hairAmount()
    if (this.tearT > 0) return 'teary'
    if (save.capReached || a < 0.25) return 'expect'
    if (a > 0.8) return 'panic'
    return 'normal'
  }

  /** 头发还剩多少（1 = 开局拖地长发，0 = 剪到泳帽线）。 */
  private hairAmount(): number {
    const avg = this.world.metrics(0, 1).avgLen
    const cap = this.capY() - 80
    return Math.max(0, Math.min(1.2, (avg - cap) / Math.max(1, this.world.initialAvg - cap)))
  }

  private bob(id: ObjId): number {
    if (this.hover !== id) return 0
    if (this.hoverT < 0.3) return -Math.round(Math.abs(Math.sin(this.hoverT * 20)) * 4)
    return -2
  }

  renderHub(ctx: CanvasRenderingContext2D, bare = false): void {
    const t = this.t
    ctx.drawImage(this.roomBg, 0, 0)
    drawWaterFx(ctx, t, save.capReached)
    // 游泳圈在水上漂
    ctx.drawImage(this.props.ring, 96 + Math.round(Math.sin(t * 0.5) * 6), 858 + Math.round(Math.sin(t * 1.3) * 2))
    ctx.drawImage(this.props.ladder, 452, 740)
    drawAirFx(ctx, t)

    // 墙上的东西
    ctx.drawImage(this.props.board, 210, 58 + this.bob('board'))
    for (let i = 0; i < Math.min(6, save.loops); i++) drawMedal(ctx, 232 + (i % 3) * 28, 86 + Math.floor(i / 3) * 26 + this.bob('board'), 1)
    const sb = this.bob('sign')
    ctx.drawImage(this.props.sign, 330, 36 + sb)
    ctx.drawImage(this.props.hook, 440, 160 + sb)
    const mb = this.bob('mirror')
    ctx.drawImage(this.props.mirror, 28, 236 + mb)
    if (!bare && anySkillAffordable() && Math.floor(t * 2) % 2 === 0) sparkle(ctx, 124, 262 + mb, 4, SCENE.hairGlint[1], RAMPS.gold[4])
    // 工具架 + 已有工具
    const rb = this.bob('rack')
    ctx.drawImage(this.props.rack, 330, 398 + rb)
    drawSprite(ctx, 'icon.comb', 352, 374 + rb)
    drawSprite(ctx, 'icon.razor', 392, 374 + rb)
    const owned = TOOLS.filter((x) => save.tools.includes(x.id))
    owned.slice(-2).forEach((tl, i) => {
      const sp = toolSprites(tl.id, tl.radius).frames[TOOL_FRAMES - 1]!
      const k = Math.min(1, 52 / sp.w)
      const x = 420 + i * 50
      ctx.drawImage(sp.img, x, 396 + rb - Math.round(sp.h * k), Math.round(sp.w * k), Math.round(sp.h * k))
    })
    const next = TOOLS.find((x) => !save.tools.includes(x.id))
    if (!bare && next && save.hairs >= next.price && Math.floor(t * 2) % 2 === 0) sparkle(ctx, 500, 350 + rb, 5, SCENE.hairGlint[1], RAMPS.gold[4])

    // 地上的东西
    ctx.drawImage(this.props.trolley, 36, 600 + this.bob('trolley'))
    const rdb = this.bob('radio')
    ctx.drawImage(this.props.stool, 430, 664 + rdb)
    ctx.drawImage(this.props.radio, 426, 600 + rdb)
    drawNotes(ctx, 490, 612 + rdb, t)

    // 阿发：椅背 → 头发 → 椅座、底座 → 身体 → 头
    const ab = this.bob('afa')
    const breathe = Math.round(Math.sin(t * 2) * 0.7)
    const hy = HEAD_Y + ab + breathe
    ctx.drawImage(this.props.chairBack, AFA_X - 48, 474 + ab)
    const r = this.hubRaster
    r.clear()
    drawAfaHair(r, AFA_X, hy, this.hairAmount(), t)
    r.flush()
    ctx.drawImage(r.canvas, 0, 0)
    ctx.drawImage(this.props.chairBase, AFA_X - 60, 638)
    ctx.drawImage(this.props.chairSeat, AFA_X - 70, 588 + ab)
    drawAfaBody(ctx, this.afa, AFA_X, HEAD_Y + ab)
    drawAfaHead(ctx, this.afa, AFA_X, hy, this.expression(), t)

    if (bare) return
    // HUD：发丝 + 奖牌
    this.drawCounter(ctx, save.hairs, false)
    if (save.medals > 0 || save.loops > 0) {
      const txt = formatNum(save.medals)
      const tw = textWidth(FONT_HUD, txt, 3) + 46
      panelRect(ctx, W - tw - 16, 18, tw, 46)
      drawMedal(ctx, W - tw - 2, 41, 1)
      drawPixelText(ctx, FONT_HUD, txt, W - tw + 18, 30, { color: SCENE.ui.text, outline: null, scale: 3 })
    }
    // 提示气泡
    const bubble = this.hubHint()
    if (bubble && !this.overlayOpen()) {
      const bx = bubble.x
      const by = bubble.y + Math.round(Math.sin(t * 3) * 3)
      const w = Math.ceil(hiTextWidth(this.game.screen.vctx, bubble.text, 18)) + 28
      panelRect(ctx, bx - w / 2, by - 20, w, 40)
      ctx.fillStyle = SCENE.ui.border
      ctx.fillRect(bx - 4, by + 19, 8, 3)
      ctx.fillRect(bx - 2, by + 22, 4, 3)
    }
    // 悬停名字
    if (this.hover && !this.overlayOpen()) {
      const o = OBJECTS.find((x) => x.id === this.hover)!
      const [lx, ly, lw] = this.labelRect(o)
      panelRect(ctx, lx, ly, lw, 30, SCENE.ui.text)
    }
    if (this.dialog) this.dialog.render(ctx, this.game.input.x, this.game.input.y)
    if (this.tree.isOpen) this.tree.render(ctx, this.game.input.x, this.game.input.y)
    if (this.toolShop.isOpen) this.toolShop.render(ctx, this.game.input.x, this.game.input.y)
    if (this.medalShop.isOpen) this.medalShop.render(ctx, this.game.input.x, this.game.input.y)
  }

  private overlayOpen(): boolean {
    return !!this.dialog || this.tree.isOpen || this.toolShop.isOpen || this.medalShop.isOpen
  }

  private hubHint(): { text: string; x: number; y: number } | null {
    if (save.capReached) return { text: S.hub.pool, x: W / 2, y: 812 }
    if (save.lifetimeHairs < 1) return { text: S.hub.hint, x: AFA_X, y: 380 }
    const next = TOOLS.find((x) => !save.tools.includes(x.id))
    if (next && save.hairs >= next.price) return { text: S.hub.hintRack, x: 400, y: 318 }
    if (anySkillAffordable() && save.lifetimeHairs < 3000) return { text: S.hub.hintMirror, x: 150, y: 214 }
    return null
  }

  private labelWidths = new Map<string, number>()
  private labelRect(o: HubObject): [number, number, number] {
    let w = this.labelWidths.get(o.id)
    if (w === undefined) {
      w = Math.ceil(hiTextWidth(this.game.screen.vctx, o.label, 17)) + 22
      this.labelWidths.set(o.id, w)
    }
    const x = Math.round(Math.max(6, Math.min(W - w - 6, o.x + o.w / 2 - w / 2)))
    const y = o.id === 'pool' ? o.y + 16 : Math.max(70, o.y - 34)
    return [x, y, w]
  }

  private drawCounter(ctx: CanvasRenderingContext2D, value: number, bouncy: boolean): void {
    const text = formatNum(value)
    const s = bouncy ? 1 + this.bump : 1
    const flash = bouncy && this.bump > 0.1
    const tw = textWidth(FONT_HUD, text, 3) + 46
    const { c: tmp, ctx: t } = hudCanvas(Math.max(80, tw + 4), 50)
    t.clearRect(0, 0, tmp.width, tmp.height)
    panelRect(t, 0, 0, tw, 46)
    drawSprite(t, strandIcon(), 8, 16)
    drawPixelText(t, FONT_HUD, text, 32, 12, { color: flash ? RAMPS.gold[1] : SCENE.ui.text, outline: null, scale: 3 })
    if (s === 1) {
      ctx.drawImage(tmp, 16, 18)
      return
    }
    const dw = Math.round(tmp.width * s)
    const dh = Math.round(tmp.height * s)
    ctx.drawImage(tmp, 16 - Math.round((dw - tmp.width) * 0.12), 18 - Math.round((dh - tmp.height) * 0.5), dw, dh)
  }

  renderCut(ctx: CanvasRenderingContext2D, alpha: number, bare = false): void {
    const cam = Math.round(this.camY)
    ctx.save()
    ctx.translate(this.shake.x, this.shake.y)
    // 背景墙（视差 0.35）
    const par = Math.round(cam * 0.35)
    const off = ((par % BG_PERIOD) + BG_PERIOD) % BG_PERIOD
    ctx.drawImage(this.wall, 0, -off)
    ctx.drawImage(this.wall, 0, BG_PERIOD - off)
    if (BG_PERIOD * 2 - off < H) ctx.drawImage(this.wall, 0, BG_PERIOD * 2 - off)
    drawWallCaustics(ctx, W, H, this.t, par)
    ctx.drawImage(this.light, 0, 0)
    // 头顶（世界 y 0 起）
    if (cam < 140) {
      ditherOverlay(ctx, 0, Math.max(0, 110 - cam), W, 30, rgba(SCENE.tile[3], 0.8), (_x, y) => 1 - (y - (110 - cam)) / 30)
      ctx.drawImage(this.crown, 0, -cam)
    }
    // 泳帽线（到了附近才看得见）
    const capScreen = this.capY() - cam
    if (capScreen > -10 && capScreen < H) {
      const holding = this.capHold > 0
      drawCapLine(ctx, capScreen, W - 20, this.t, holding || save.capReached)
      ctx.drawImage(capLineBadge(), 4, capScreen - 12)
      if (holding && !save.capReached) {
        const k = Math.min(1, this.capHold / HAIR_WORLD.capHold)
        panelRect(ctx, 34, capScreen + 8, 160, 12, SCENE.ui.text)
        ctx.fillStyle = RAMPS.gold[3]
        ctx.fillRect(37, capScreen + 11, Math.round(154 * k), 6)
      }
    }
    // 头发 + 碎屑
    const r = this.cutRaster
    r.clear()
    this.world.render(r, cam, alpha)
    this.particles.render(r)
    r.flush()
    // 头发投在墙上的影子（右下偏移、半透明）
    ctx.globalAlpha = 0.18
    ctx.drawImage(r.canvas, 7, 9)
    ctx.globalAlpha = 1
    ctx.drawImage(r.canvas, 0, 0)
    // 白发闪星
    for (const tw of this.twinkles) if (tw.age >= 0) sparkle(ctx, tw.x, tw.y, tw.age < 0.18 ? 3 : 1, SCENE.hairGlint[1], SCENE.hairGlint[0])
    // 剪刀
    if (!bare || this.mode === 'zoomOut') {
      const sx = Math.round(this.psx + (this.sx - this.psx) * alpha)
      const sy = Math.round(this.psy + (this.sy - this.psy) * alpha - this.recoil)
      this.drawTool(ctx, sx, sy)
    }
    this.collector.render(ctx)
    this.floaters.render(ctx)
    if (this.combo >= 500) this.drawEdgeGlow(ctx)
    ctx.restore()
    if (bare) return
    this.drawCutHud(ctx)
    if (this.dialog) this.dialog.render(ctx, this.game.input.x, this.game.input.y)
  }

  private openness(): number {
    const iv = this.tool.interval * this.up.snapMult
    if (this.tool.continuous) return (Math.floor(this.t * 30) % 2) * 0.4
    const close = Math.min(JUICE.snapCloseTime, iv * 0.4)
    const τ = this.sinceSnap
    if (τ > iv - close) return Math.max(0, (iv - τ) / close)
    const hold = Math.min(0.05, iv * 0.15)
    if (τ < hold) return 0
    const k = Math.min(1, (τ - hold) / (iv * 0.45))
    return 1 - (1 - k) * (1 - k)
  }

  private drawTool(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (this.combo >= 100) {
      const rb = SCENE.rainbow
      for (let i = this.trail.length - 1; i >= 1; i--) {
        const [ax, ay] = this.trail[i]!
        ctx.fillStyle = rb[(i + Math.floor(this.t * 20)) % rb.length]!
        const w = Math.max(1, Math.round((1 - i / this.trail.length) * this.radius() * 1.6))
        ctx.fillRect(Math.round(ax - w / 2), Math.round(ay), w, 2)
      }
    }
    const sp = toolSprites(this.tool.id, this.radius())
    const f = Math.round(this.openness() * (TOOL_FRAMES - 1))
    const jx = this.tool.continuous ? (Math.floor(this.t * 60) % 2) : 0
    ctx.globalAlpha = 0.4
    drawSprite(ctx, sp.shadows[f]!, x + 5 + jx, y + 8)
    ctx.globalAlpha = 1
    drawSprite(ctx, sp.frames[f]!, x + jx, y)
    if (this.jamT > 0) {
      // 缠住：刃上绕着几圈头发
      ctx.fillStyle = SCENE.hair[1]
      for (let i = -2; i <= 2; i++) ctx.fillRect(x - 6 + i * 3, y - 4 + Math.abs(i), 2, 8)
    }
    if (this.snapFlash > 0 && !this.tool.continuous) sparkle(ctx, x, y, 4, SCENE.hairGlint[1], SCENE.hairGlint[0])
  }

  private drawEdgeGlow(ctx: CanvasRenderingContext2D): void {
    const g = RAMPS.gold
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 8)
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = rgba(g[3 - Math.min(2, i >> 1)]!, (0.5 - i * 0.06) * (0.6 + 0.4 * pulse))
      ctx.fillRect(i, i, W - i * 2, 1)
      ctx.fillRect(i, H - 1 - i, W - i * 2, 1)
      ctx.fillRect(i, i + 1, 1, H - i * 2 - 2)
      ctx.fillRect(W - 1 - i, i + 1, 1, H - i * 2 - 2)
    }
  }

  private drawCutHud(ctx: CanvasRenderingContext2D): void {
    this.drawCounter(ctx, Math.max(0, save.hairs - this.pending), true)
    // 回泳池边
    const hover = this.game.input.x > W - 164 && this.game.input.y < 70
    panelRect(ctx, W - 160, 18 - (hover ? 1 : 0), 144, 46, SCENE.ui.border)
    // 右侧：发梢高度（离泳帽线还有多远）
    const m = this.world.metrics(this.capY(), this.tool.sharpness)
    const top = 100
    const bottom = 760
    const cap = this.capY()
    const startFront = this.world.initialAvg + 110
    const k = Math.max(0, Math.min(1, (m.front - cap) / Math.max(1, startFront - cap)))
    panelRect(ctx, W - 26, top - 6, 18, bottom - top + 12, SCENE.ui.text)
    ctx.fillStyle = SCENE.hair[1]
    const fillH = Math.round((bottom - top) * k)
    ctx.fillRect(W - 21, top + (bottom - top) - fillH, 8, fillH)
    ctx.fillStyle = SCENE.hair[3]
    ctx.fillRect(W - 21, top + (bottom - top) - fillH, 2, fillH)
    if (this.capSeen || save.capReached) ctx.drawImage(capLineBadge(), W - 30, top - 26)
    else drawPixelText(ctx, FONT_TINY, '?', W - 17, top - 20, { color: SCENE.ui.panel, outline: SCENE.ui.text, scale: 2, align: 'center' })
    // 左下：当前工具
    panelRect(ctx, 14, H - 70, 190, 56)
    const sp = toolSprites(this.tool.id, this.tool.radius).frames[TOOL_FRAMES - 1]!
    const sk = Math.min(1, 64 / sp.w)
    ctx.drawImage(sp.img, 24, H - 42 - Math.round((sp.h * sk) / 2), Math.round(sp.w * sk), Math.round(sp.h * sk))
    // 连击
    if (this.combo >= 2) {
      const style = floaterStyle(this.combo, 0)
      const cy = H - 150
      drawPixelText(ctx, FONT_HUD, `${this.combo}`, W / 2, cy, { color: style.color, outline: SCENE.ui.text, scale: 4, align: 'center' })
      const mm = comboMult(this.combo)
      if (mm > 1) drawPixelText(ctx, FONT_TINY, `x${mm}`, W / 2 + textWidth(FONT_HUD, `${this.combo}`, 4) / 2 + 18, cy + 16, { color: RAMPS.gold[4], outline: SCENE.ui.text, scale: 3, align: 'center' })
      const bw = 90
      const kk = Math.max(0, this.comboTimer / (HAIR_WORLD.comboTimeout + this.up.grace))
      ctx.fillStyle = SCENE.ui.text
      ctx.fillRect(W / 2 - bw / 2 - 1, cy + 34, bw + 2, 6)
      ctx.fillStyle = style.color
      ctx.fillRect(W / 2 - bw / 2, cy + 35, Math.round(bw * kk), 4)
    }
    if (this.tierText) {
      const tt = this.tierText
      const k2 = tt.age / 1.1
      const scale = tt.age < 0.06 ? 9 : tt.age < 0.12 ? 8 : 7
      const a = k2 < 0.75 ? 1 : 1 - (k2 - 0.75) / 0.25
      drawPixelText(ctx, FONT_HUD, tt.text, W / 2, 330 - Math.round(k2 * 30), { color: tt.tier >= 2 ? RAMPS.gold[4] : SCENE.ui.panel, outline: RAMPS.gold[0], scale, align: 'center', alpha: a })
    }
  }

  // ---------------------------------------------------------------- 高清层

  overlay(ctx: CanvasRenderingContext2D): void {
    const ui = SCENE.ui
    if (this.mode === 'swim') {
      this.swim?.overlay(ctx)
      return
    }
    if (this.mode === 'hub') {
      if (this.tree.isOpen) return this.tree.overlay(ctx)
      if (this.toolShop.isOpen) return this.toolShop.overlay(ctx)
      if (this.medalShop.isOpen) return this.medalShop.overlay(ctx)
      hiText(ctx, S.intro.sign[0]!, 452, 78, { size: 20, color: RAMPS.bband[0], align: 'center' })
      hiText(ctx, S.intro.sign[1]!, 452, 112, { size: 24, color: RAMPS.pink[0], align: 'center' })
      const bubble = this.hubHint()
      if (bubble && !this.dialog) {
        const by = bubble.y + Math.round(Math.sin(this.t * 3) * 3)
        hiText(ctx, bubble.text, bubble.x, by + 1, { size: 18, color: ui.text, align: 'center', baseline: 'middle' })
      }
      if (this.hover && !this.dialog) {
        const o = OBJECTS.find((x) => x.id === this.hover)!
        const [lx, ly, lw] = this.labelRect(o)
        hiText(ctx, o.label, lx + lw / 2, ly + 16, { size: 17, color: ui.panel, align: 'center', baseline: 'middle' })
      }
      if (!sfx.ready) hiText(ctx, S.cut.tapForSound, W / 2, H - 20, { size: 17, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center', alpha: 0.75 + 0.25 * Math.sin(this.t * 4) })
      this.dialog?.overlay(ctx)
      return
    }
    if (this.mode !== 'cut') return
    hiText(ctx, S.cut.back, W - 88, 42, { size: 20, color: ui.panel, align: 'center', baseline: 'middle' })
    hiText(ctx, S.tools[this.tool.id]!.name, 100, H - 42, { size: 21, color: ui.text, baseline: 'middle' })
    const capScreen = this.capY() - this.camY
    if (capScreen > 0 && capScreen < H) hiText(ctx, S.cut.capLine, W - 60, capScreen - 8, { size: 15, color: RAMPS.bcap[4], stroke: RAMPS.bcap[0], strokeWidth: 2, align: 'center' })
    if (this.capHold > 0 && !save.capReached) hiText(ctx, S.cut.capHold(HAIR_WORLD.capHold - this.capHold), 200, capScreen + 20, { size: 16, color: ui.panel, stroke: ui.text, strokeWidth: 3 })
    hiText(ctx, S.cut.height, W - 17, 786, { size: 13, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center' })
    if (this.combo >= 2) hiText(ctx, S.cut.combo, W / 2, H - 158, { size: 18, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center' })
    if (!this.everCut && this.modeT < 12 && save.lifetimeHairs < 200) {
      const touch = this.game.input.pointerType !== 'mouse'
      hiText(ctx, touch ? S.cut.dragHintTouch : S.cut.dragHint, W / 2, 200, { size: 28, color: ui.panel, stroke: ui.text, strokeWidth: 4, align: 'center' })
      hiText(ctx, S.cut.tangleHint, W / 2, 238, { size: 17, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center' })
    }
    for (const tf of this.texts) {
      const k = tf.age / tf.life
      const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
      const pop = tf.age < 0.08 ? 1.25 : 1
      hiText(ctx, tf.text, tf.x, tf.y - k * 30, { size: Math.round(tf.size * pop), color: tf.color, stroke: ui.text, strokeWidth: 4, align: 'center', alpha: a })
    }
    if (!sfx.ready) hiText(ctx, S.cut.tapForSound, W / 2, H - 100, { size: 17, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center', alpha: 0.75 + 0.25 * Math.sin(this.t * 4) })
    this.dialog?.overlay(ctx)
  }

  cursor(): 'arrow' | 'hand' | null {
    if (this.mode === 'cut') {
      if (this.dialog) return 'arrow'
      const x = this.game.input.x
      const y = this.game.input.y
      return y < 72 && x > W - 170 ? 'hand' : null
    }
    if (this.mode === 'swim') return 'arrow'
    if (this.mode !== 'hub') return null
    return this.hover && !this.overlayOpen() ? 'hand' : 'arrow'
  }

  // ================================================================ 调试 / 测试

  stats(): Record<string, number | string> {
    const m = this.world.metrics(this.capY(), this.tool.sharpness)
    return {
      mode: this.mode,
      hairs: Math.round(save.hairs),
      loopHairs: Math.round(save.loopHairs),
      tool: this.tool.id,
      skills: JSON.stringify(save.skills),
      cuts: this.cuts,
      snaps: this.snaps,
      jams: this.jams,
      combo: this.combo,
      camY: Math.round(this.camY),
      front: Math.round(m.front),
      maxCuttable: Math.round(m.maxCuttable),
      avgLen: Math.round(m.avgLen),
      progressPct: this.progressPct(),
      capReached: save.capReached ? 1 : 0,
      medals: save.medals,
      loops: save.loops,
      playTime: Math.round(save.playTime),
      locks: this.world.locks.length,
      pieces: this.world.pieces.length,
      particles: this.particles.count,
      snipsPlayed: sfx.snipsPlayed,
      snipsMerged: sfx.snipsMerged,
    }
  }

  statsText(): Record<string, string | number> {
    const p = this.game.perf.snapshot()
    return { fps: p.fps.toFixed(0), cpuMs: p.avgCpuMs.toFixed(2), ...this.stats() }
  }

  debugApi(): Record<string, (...a: never[]) => unknown> {
    return {
      addHairs: (n: number = 5000) => {
        save.hairs += n
        save.loopHairs += n
      },
      setTool: (id: string) => {
        if (!save.tools.includes(id)) save.tools.push(id)
        this.refreshUpgrades()
      },
      enterCut: () => this.enterCut(),
      toHub: () => this.setMode('hub'),
      /** 把所有头发剪到世界 y 以上（测试泳帽线） */
      trimTo: (y: number = HAIR_WORLD.capY - 40) => {
        for (const s of this.world.locks) {
          const want = Math.max(4, y - s.rootY)
          if (s.length > want) {
            for (let i = 1; i < s.count; i++) {
              if (s.mat[0]! - s.mat[i]! >= want) {
                s.cut(i - 1, 0.5, 0)
                break
              }
            }
          }
        }
      },
      /** 机器人：挑当前镜头里最值得剪的位置（给平衡测试用） */
      botTarget: () => this.botTarget(),
      bestBuy: () => this.botBuy(),
      state: () => ({ mode: this.mode, dialog: this.dialog?.title ?? '', swim: !!this.swim }),
      closeDialog: () => {
        this.dialog = null
      },
      startSwim: () => this.startSwim(medalsFor(save.loopHairs)),
      skipSwim: () => {
        if (this.swim) this.swim.skip()
      },
    } as unknown as Record<string, (...a: never[]) => unknown>
  }

  /** 平衡测试用的"好玩家"：在镜头里找一刀收益最高、又不会缠住的位置。 */
  private botTarget(): [number, number] {
    const t = this.tool
    const tool = { radius: this.radius(), thick: t.thick + this.up.thickness, capacity: t.capacity, grip: t.grip * this.up.gripMult * 0.9, sharpness: t.sharpness }
    // 已经瞄好的位置：还能剪到东西就先别换（像真人一样在一处剪几下）
    if (this.botAim) {
      const [ax, ay] = this.botAim
      const p = this.world.probe(ax, ay + this.camY, tool, this.up.tangleMult)
      if (!p.jam && p.lens.length && this.t - this.botAimT < 3) return this.botAim
    }
    let best: [number, number] = [W / 2, H * 0.8]
    let bestV = -1
    for (let x = 10; x < W - 8; x += 12) {
      for (let y = 100; y < H - 30; y += 18) {
        const p = this.world.probe(x, y + this.camY, tool, this.up.tangleMult)
        if (p.jam || !p.lens.length) continue
        let v = 0
        for (const l of p.lens) v += Math.pow(l, HAIR_WORLD.valueExp)
        // 离当前剪刀位置近的稍微优先（真人不会满屏乱跳）
        v *= 1 - Math.min(0.3, Math.hypot(x - this.sx, y - this.sy) / 2000)
        if (v > bestV) {
          bestV = v
          best = [x, y]
        }
      }
    }
    this.botAim = best
    this.botAimT = this.t
    return best
  }
  private botAim: [number, number] | null = null
  private botAimT = 0

  /** 平衡测试用：买最划算的东西（先工具，再技能里最便宜的有用节点）。 */
  private botBuy(): string {
    const next = TOOLS.find((x) => !save.tools.includes(x.id))
    if (next && save.hairs >= next.price) {
      save.hairs -= next.price
      save.tools.push(next.id)
      this.refreshUpgrades()
      return 'tool:' + next.id
    }
    // 工具快买得起时先攒钱
    if (next && save.hairs >= next.price * 0.6) return ''
    let bought = ''
    for (let guard = 0; guard < 20; guard++) {
      const opts = ['grip', 'harvest', 'rhythm', 'range', 'smooth', 'thick', 'follow', 'crit', 'slow', 'grace', 'combomult', 'bigcap']
      let cheapest: { id: string; p: number } | null = null
      for (const id of opts) {
        const s = (save.skills[id] ?? 0) as number
        const def = SKILL_DEFS[id]
        if (!def || s >= def.max) continue
        if (def.parent && (save.skills[def.parent] ?? 0) < 1) continue
        const p = Math.ceil(def.base * Math.pow(1.15, s))
        if (!cheapest || p < cheapest.p) cheapest = { id, p }
      }
      if (!cheapest || save.hairs < cheapest.p) break
      save.hairs -= cheapest.p
      save.skills[cheapest.id] = (save.skills[cheapest.id] ?? 0) + 1
      bought += cheapest.id + ' '
    }
    this.refreshUpgrades()
    return bought
  }
}

import { SKILL_BY_ID as SKILL_DEFS } from '../data/skills'

/** 飘字样式：连击越高越大、越偏金色；一刀很值钱时也放大。 */
function floaterStyle(combo: number, value: number): { scale: number; color: string } {
  const big = value >= 50 ? 1 : 0
  if (combo >= 100) return { scale: 3 + big, color: RAMPS.gold[3] }
  if (combo >= 50) return { scale: 3 + big, color: RAMPS.gold[4] }
  if (combo >= 10) return { scale: 2 + big, color: RAMPS.gold[4] }
  return { scale: 2 + big, color: SCENE.hairGlint[1] }
}

let hudTmp: { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null
function hudCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!hudTmp || hudTmp.c.width !== w || hudTmp.c.height !== h) hudTmp = makeCanvas(w, h)
  return hudTmp
}

/** 奖牌：金色圆牌 + 粉色绶带（k = 放大倍数）。 */
export function drawMedal(ctx: CanvasRenderingContext2D, cx: number, cy: number, k: number): void {
  const g = RAMPS.gold
  const p = RAMPS.pink
  const px = (x: number, y: number, w: number, h: number, c: string): void => {
    ctx.fillStyle = c
    ctx.fillRect(Math.round(cx + x * k), Math.round(cy + y * k), w * k, h * k)
  }
  px(-5, -12, 4, 7, p[0])
  px(1, -12, 4, 7, p[0])
  px(-4, -12, 2, 6, p[2])
  px(2, -12, 2, 6, p[2])
  for (let y = -6; y <= 6; y++) {
    const hw = Math.round(Math.sqrt(36 - y * y))
    px(-hw - 1, y, hw * 2 + 2, 1, g[0])
    px(-hw, y, hw * 2, 1, y < 0 ? g[3] : g[2])
  }
  px(-3, -4, 2, 2, g[4])
  px(-1, -2, 3, 5, g[1])
  px(0, -3, 1, 6, g[0])
}

/** 收音机飘出来的音符。 */
function drawNotes(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.5 + i * 0.33) % 1
    if (k > 0.85) continue
    const nx = Math.round(x + 10 - k * 14 + Math.sin(k * 7 + i) * 5)
    const ny = Math.round(y - k * 50)
    ctx.fillStyle = rgba(SCENE.ui.text, 1 - k)
    ctx.fillRect(nx + 4, ny - 9, 2, 10)
    ctx.fillRect(nx + 4, ny - 9, 5, 2)
    ctx.fillRect(nx, ny, 5, 3)
  }
}

export { COPING_TOP, WATER_TOP, rootYAt, TOOL_BY_ID }
export type { ToolId }
