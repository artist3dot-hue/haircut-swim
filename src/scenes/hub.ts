// 主界面（GDD 第 4.1 节）：阿发坐在泳池边的理发椅上，长发拖地铺开。
// 所有功能都是场景里的物件：点阿发开一局、镜子是技能树、收音机是设置……
// 待在主界面时头发慢慢变长，阿发的表情跟着变（慌张 / 期待 / 心疼）。

import type { Scene } from '../core/scene'
import type { Game } from '../game'
import { W, H } from '../core/screen'
import { formatNum } from '../core/format'
import { save, saveGame, exportSave, importSave, resetGame } from '../core/save'
import { SCENE, RAMPS } from '../art/palette'
import { drawSprite, makeCanvas } from '../art/sprites'
import { drawPixelText, textWidth, FONT_HUD } from '../art/pixelfont'
import { hiText, hiTextWidth } from '../art/text'
import {
  drawHubBackground,
  drawWater,
  drawCapHook,
  drawRack,
  drawTrolley,
  drawRadio,
  drawChair,
  drawChairBack,
  drawAfa,
  drawAfaHead,
  drawAfaHair,
  type Expression,
} from '../art/hub'
import { Raster } from '../hair/raster'
import { strandIcon } from '../art/hudicons'
import { Dialog, panelRect } from '../ui/dialog'
import { SkillTree } from '../ui/skilltree'
import { showTextBox } from '../ui/textbox'
import { sfx } from '../audio/sfx'
import { S } from '../data/strings'

type ObjId = 'afa' | 'mirror' | 'cap' | 'rack' | 'trolley' | 'radio' | 'pool'

interface HubObject {
  id: ObjId
  x: number
  y: number
  w: number
  h: number
  label: string
}

const HEAD_X = 180
const HEAD_Y = 312
const CHAIR_Y = 452

const OBJECTS: HubObject[] = [
  { id: 'mirror', x: 24, y: 70, w: 90, h: 100, label: S.hub.mirror },
  { id: 'cap', x: 268, y: 44, w: 52, h: 66, label: S.hub.cap },
  { id: 'rack', x: 218, y: 140, w: 132, h: 56, label: S.hub.rack },
  { id: 'trolley', x: 14, y: 326, w: 92, h: 106, label: S.hub.trolley },
  { id: 'radio', x: 290, y: 378, w: 62, h: 48, label: S.hub.radio },
  { id: 'afa', x: 134, y: 284, w: 92, h: 168, label: S.hub.afa },
  { id: 'pool', x: 0, y: 488, w: 360, h: 152, label: S.hub.pool },
]

/** 头发每秒变长多少（0..1 的比例；约 3 分钟从短到拖满地） */
const HUB_GROWTH = 1 / 180

export class HubScene implements Scene {
  readonly name = 'hub'
  private bg: HTMLCanvasElement
  private hairRaster = new Raster(W, H)
  private t = 0
  private hover: ObjId | null = null
  private hoverT = 0
  private dialog: Dialog | null = null
  private tree = new SkillTree()
  private resetArmed = 0

  constructor(private readonly game: Game) {
    const { c, ctx } = makeCanvas(W, H)
    drawHubBackground(ctx, W, H)
    this.bg = c
    game.input.consumeTaps()
  }

  private expression(): Expression {
    const h = save.hubHair
    if (h > 0.72) return 'panic'
    if (h < 0.2) return 'teary'
    if (h < 0.4) return 'expect'
    return 'normal'
  }

  update(dt: number): void {
    this.t += dt
    const input = this.game.input
    const taps = input.consumeTaps()
    input.consumeKeys()
    save.hubHair = Math.min(1, save.hubHair + dt * HUB_GROWTH)
    if (this.resetArmed > 0) this.resetArmed -= dt

    if (this.tree.isOpen) {
      this.tree.update(dt, taps)
      return
    }
    if (this.dialog) {
      this.dialog.update(dt)
      for (const tp of taps) {
        if (this.dialog?.tap(tp.x, tp.y)) sfx.click()
      }
      return
    }

    // 悬停（只有鼠标有悬停；触屏直接点）
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
    // 阿发优先（和别的物件有重叠时）
    const list = [...OBJECTS].sort((a, b) => (a.id === 'afa' ? -1 : b.id === 'afa' ? 1 : 0))
    for (const o of list) if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o.id
    return null
  }

  private activate(id: ObjId): void {
    sfx.click()
    switch (id) {
      case 'afa':
        saveGame()
        this.game.goto('cut')
        break
      case 'mirror':
        this.tree.open()
        break
      case 'rack':
        this.dialog = new Dialog(S.hub.rackTitle, () => S.hub.rackLines, [this.closeBtn()])
        break
      case 'trolley':
        this.dialog = new Dialog(S.hub.trolleyTitle, () => S.hub.trolleyLines, [this.closeBtn()])
        break
      case 'cap':
        this.dialog = new Dialog(
          S.hub.capTitle,
          () => (save.swimUnlocked ? [S.hub.capUnlocked, S.hub.capStats(save.rounds, save.bestCombo)] : [S.hub.capLocked, S.hub.capHow, S.hub.capStats(save.rounds, save.bestCombo)]),
          [this.closeBtn()],
        )
        break
      case 'pool':
        this.dialog = new Dialog(S.hub.poolTitle, () => (save.swimUnlocked ? S.hub.poolUnlocked : S.hub.poolLocked), [this.closeBtn()])
        break
      case 'radio':
        this.openSettings()
        break
    }
  }

  private closeBtn(): { label: () => string; action: () => void; primary: boolean } {
    return { label: () => S.hub.close, action: () => (this.dialog = null), primary: true }
  }

  private openSettings(): void {
    const dlg = new Dialog(
      S.settings.title,
      () => [S.settings.savedAt(new Date(save.savedAt).toLocaleTimeString())],
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
          label: () => S.settings.exportSave,
          action: () => {
            saveGame()
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
                const ok = importSave(text)
                sfx.volume = save.settings.volume
                dlg.flash(ok ? S.settings.importOk : S.settings.importBad)
              },
            })
          },
        },
        {
          label: () => (this.resetArmed > 0 ? S.settings.resetConfirm : S.settings.resetSave),
          action: () => {
            if (this.resetArmed > 0) {
              resetGame()
              sfx.volume = save.settings.volume
              this.resetArmed = 0
              this.dialog = null
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

  // ---------------------------------------------------------------- 画面

  private bob(id: ObjId): number {
    if (this.hover !== id) return 0
    // 悬停：先弹两下，再停在上面 1px
    if (this.hoverT < 0.3) return -Math.round(Math.abs(Math.sin(this.hoverT * 20)) * 3)
    return -1
  }

  render(): void {
    const ctx = this.game.screen.lctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.drawImage(this.bg, 0, 0)
    drawWater(ctx, W, H, this.t, save.swimUnlocked)

    drawSprite(ctx, 'icon.mirror', 68, 120 + this.bob('mirror'), { scale: 2 })
    drawCapHook(ctx, 294, 70 + this.bob('cap'))
    drawRack(ctx, 222, 190 + this.bob('rack'))
    drawTrolley(ctx, 24, 362 + this.bob('trolley'))
    drawRadio(ctx, 300, 412 + this.bob('radio'), this.t)

    // 阿发：椅背 → 椅子 → 身体 → 头发 → 头
    const ab = this.bob('afa')
    const breathe = Math.round(Math.sin(this.t * 2) * 0.6)
    const hy = HEAD_Y + ab + breathe
    drawChairBack(ctx, HEAD_X, 330 + ab, 404 + ab)
    drawChair(ctx, HEAD_X, CHAIR_Y)
    drawAfa(ctx, HEAD_X, HEAD_Y + ab)
    const r = this.hairRaster
    r.clear()
    drawAfaHair(r, HEAD_X, hy, save.hubHair, this.t)
    r.flush()
    ctx.drawImage(r.canvas, 0, 0)
    drawAfaHead(ctx, HEAD_X, hy, this.expression(), this.t)

    // 左上：发丝
    const text = formatNum(save.hairs)
    const tw = textWidth(FONT_HUD, text, 2) + 26
    panelRect(ctx, 4, 6, tw, 26)
    drawPixelText(ctx, FONT_HUD, text, 22, 12, { color: SCENE.ui.text, outline: null, scale: 2 })
    drawSprite(ctx, strandIcon(), 7, 12)

    // 第一次来：阿发头顶的对话气泡
    if (save.rounds === 0 && !this.dialog && !this.tree.isOpen) {
      const by = 250 + Math.round(Math.sin(this.t * 3) * 2)
      panelRect(ctx, HEAD_X - 62, by - 14, 124, 26)
      ctx.fillStyle = SCENE.ui.border
      ctx.fillRect(HEAD_X - 3, by + 12, 6, 2)
      ctx.fillRect(HEAD_X - 1, by + 14, 2, 3)
    }

    // 悬停名字的底
    if (this.hover && !this.dialog && !this.tree.isOpen) {
      const o = OBJECTS.find((x) => x.id === this.hover)!
      const [lx, ly, lw] = this.labelRect(o)
      panelRect(ctx, lx, ly, lw, 20, SCENE.ui.text)
    }

    if (this.dialog) this.dialog.render(ctx, this.game.input.x, this.game.input.y)
    if (this.tree.isOpen) this.tree.render(ctx, this.game.input.x, this.game.input.y)
  }

  private labelWidths = new Map<string, number>()
  private labelRect(o: HubObject): [number, number, number] {
    let w = this.labelWidths.get(o.id)
    if (w === undefined) {
      w = Math.ceil(hiTextWidth(this.game.screen.vctx, o.label, 13)) + 14
      this.labelWidths.set(o.id, w)
    }
    const x = Math.round(Math.max(4, Math.min(W - w - 4, o.x + o.w / 2 - w / 2)))
    const y = o.id === 'pool' ? o.y + 10 : Math.max(36, o.y - 22)
    return [x, y, w]
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const ui = SCENE.ui
    if (this.tree.isOpen) {
      this.tree.overlay(ctx)
      return
    }
    if (save.rounds === 0 && !this.dialog) {
      const by = 250 + Math.round(Math.sin(this.t * 3) * 2)
      hiText(ctx, S.hub.hint, HEAD_X, by, { size: 13, color: ui.text, align: 'center', baseline: 'middle' })
    }
    if (this.hover && !this.dialog) {
      const o = OBJECTS.find((x) => x.id === this.hover)!
      const [lx, ly, lw] = this.labelRect(o)
      hiText(ctx, o.label, lx + lw / 2, ly + 11, { size: 13, color: ui.panel, align: 'center', baseline: 'middle' })
    }
    if (save.swimUnlocked && !this.dialog) {
      hiText(ctx, S.round.goSwim, W / 2, 600, { size: 20, color: RAMPS.gold[4], stroke: ui.text, strokeWidth: 3, align: 'center', alpha: 0.7 + 0.3 * Math.sin(this.t * 3) })
    }
    this.dialog?.overlay(ctx)
  }

  cursor(): 'arrow' | 'hand' {
    return this.hover && !this.dialog && !this.tree.isOpen ? 'hand' : 'arrow'
  }

  // ---------------------------------------------------------------- 调试

  stats(): Record<string, number | string> {
    return {
      scene: 'hub',
      hairs: Math.round(save.hairs),
      totalHairs: Math.round(save.totalHairs),
      rounds: save.rounds,
      hubHair: Math.round(save.hubHair * 100) / 100,
      expression: this.expression(),
      skills: JSON.stringify(save.skills),
      tree: this.tree.isOpen ? 1 : 0,
      dialog: this.dialog ? this.dialog.title : '',
    }
  }

  debugApi(): Record<string, (...a: number[]) => unknown> {
    return {
      addHairs: (n = 5000) => {
        save.hairs += n
        saveGame()
      },
      setHubHair: (v = 0.9) => {
        save.hubHair = v
      },
    }
  }
}
