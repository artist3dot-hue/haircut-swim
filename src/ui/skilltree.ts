// 技能树（在主界面点镜子打开）：从中心向外展开 6 个分支，画在一面大镜子里。
// 只画出"已买的节点 + 与已买节点相连的节点"，买一个才露出下一个。
// 节点、连线、镜框画在低分辨率画布；名字、说明画在高清层。

import { SCENE, RAMPS, rgba } from '../art/palette'
import { hiText } from '../art/text'
import { drawPixelText, FONT_HUD, FONT_TINY, textWidth } from '../art/pixelfont'
import { formatNum } from '../core/format'
import { W, H } from '../core/screen'
import { save, saveGame } from '../core/save'
import { SKILLS, SKILL_BY_ID, BRANCH_ANGLE, priceOf, type Branch, type SkillDef } from '../data/skills'
import { S } from '../data/strings'
import { sfx } from '../audio/sfx'
import { panelRect } from './dialog'
import { drawSprite } from '../art/sprites'
import { strandIcon } from '../art/hudicons'
import { ditherFill } from '../art/draw'

const CX = 270
const CY = 380
const RING = [0, 100, 178, 252]
const NODE = 44
const FRAME = { x: 14, y: 88, w: W - 28, h: 590 }

const BRANCH_RAMP: Record<Branch, readonly string[]> = {
  root: RAMPS.blade,
  sharp: RAMPS.steel,
  range: RAMPS.bcap,
  rhythm: RAMPS.lglass,
  harvest: RAMPS.gold,
  time: RAMPS.glass,
  combo: RAMPS.pink,
}

/** 9×9 小图标（放大 3 倍画）：1 = 色阶描边档，2 = 暗部档。 */
const GLYPH: Record<Branch, readonly string[]> = {
  root: ['1.......1', '.1.....1.', '..1...1..', '...1.1...', '....1....', '...1.1...', '.22...22.', '2..2.2..2', '.22...22.'],
  sharp: ['....1....', '...121...', '...121...', '..12221..', '..12221..', '..12221..', '...121...', '....1....', '....1....'],
  range: ['..11111..', '.1.....1.', '1..222..1', '1.2...2.1', '1.2...2.1', '1.2...2.1', '1..222..1', '.1.....1.', '..11111..'],
  rhythm: ['.....11..', '....11...', '...11....', '..111111.', '.....11..', '....11...', '...11....', '..11.....', '.1.......'],
  harvest: ['...11....', '..1..1...', '.....1...', '....1....', '...1.....', '..1......', '..1....2.', '...1..2..', '....22...'],
  time: ['...1.1...', '..1.1.1..', '..1.1.1..', '.1.1.1.1.', '.1.1.1.1.', '.1.1.1.1.', '.1.1.1.1.', '..2.2.2..', '...2.2...'],
  combo: ['....1....', '....1....', '...111...', '111121111', '.1122211.', '..12221..', '..11.11..', '.11...11.', '.1.....1.'],
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

export function skillLevel(id: string): number {
  return save.skills[id] ?? 0
}

function visible(s: SkillDef): boolean {
  if (!s.parent) return true
  return skillLevel(s.parent) >= 1
}

function nodePos(s: SkillDef): [number, number] {
  const a = BRANCH_ANGLE[s.branch]
  const r = RING[s.ring] ?? 0
  return [Math.round(CX + Math.cos(a) * r), Math.round(CY + Math.sin(a) * r)]
}

/** 有没有买得起、还没满级、看得见的节点（主界面镜子闪光提示用）。 */
export function anySkillAffordable(): boolean {
  return SKILLS.some((s) => s.id !== 'root' && visible(s) && skillLevel(s.id) < s.max && save.hairs >= priceOf(s.id, skillLevel(s.id)))
}

export class SkillTree {
  isOpen = false
  private selected = 'root'
  private age = 0
  private t = 0
  private pop: Record<string, number> = {}
  private reveal: Record<string, number> = {}
  private sparks: Spark[] = []
  private shakeCard = 0
  private msg = ''
  private msgT = 0
  onClose: (() => void) | null = null
  /** 买了东西后通知（重新计算升级） */
  onBuy: (() => void) | null = null

  open(): void {
    this.isOpen = true
    this.age = 0
    const cand = SKILLS.find((s) => s.id !== 'root' && visible(s) && skillLevel(s.id) < s.max && save.hairs >= priceOf(s.id, skillLevel(s.id)))
    this.selected = cand?.id ?? SKILLS.find((s) => s.id !== 'root' && visible(s) && skillLevel(s.id) < s.max)?.id ?? 'root'
  }

  close(): void {
    this.isOpen = false
    saveGame()
    this.onClose?.()
  }

  private backRect(): [number, number, number, number] {
    return [W - 118, 26, 100, 46]
  }

  private buyRect(): [number, number, number, number] {
    return [W / 2 - 110, H - 86, 220, 56]
  }

  update(dt: number, taps: Array<{ x: number; y: number }>): void {
    this.age += dt
    this.t += dt
    for (const k of Object.keys(this.pop)) this.pop[k] = Math.max(0, this.pop[k]! - dt)
    for (const k of Object.keys(this.reveal)) this.reveal[k] = Math.max(0, this.reveal[k]! - dt)
    this.shakeCard = Math.max(0, this.shakeCard - dt)
    if (this.msgT > 0) this.msgT -= dt
    for (const p of this.sparks) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 260 * dt
      p.life -= dt
    }
    this.sparks = this.sparks.filter((p) => p.life > 0)
    if (this.age < 0.2) return
    for (const tp of taps) {
      const [bx, by, bw, bh] = this.backRect()
      if (tp.x >= bx && tp.x <= bx + bw && tp.y >= by && tp.y <= by + bh) {
        sfx.click()
        this.close()
        return
      }
      const [ux, uy, uw, uh] = this.buyRect()
      if (tp.x >= ux && tp.x <= ux + uw && tp.y >= uy && tp.y <= uy + uh) {
        this.buy(this.selected)
        continue
      }
      for (const s of SKILLS) {
        if (!visible(s)) continue
        const [x, y] = nodePos(s)
        if (Math.abs(tp.x - x) <= NODE / 2 + 6 && Math.abs(tp.y - y) <= NODE / 2 + 6) {
          if (this.selected !== s.id) sfx.hover()
          this.selected = s.id
        }
      }
    }
  }

  buy(id: string): boolean {
    const s = SKILL_BY_ID[id]
    if (!s) return false
    const lv = skillLevel(id)
    if (lv >= s.max) return false
    const price = priceOf(id, lv)
    if (save.hairs < price) {
      sfx.deny()
      this.shakeCard = 0.3
      this.msg = S.tree.notEnough
      this.msgT = 1.5
      return false
    }
    const before = SKILLS.filter(visible).map((x) => x.id)
    save.hairs -= price
    save.skills[id] = lv + 1
    saveGame()
    sfx.buy()
    this.pop[id] = 0.3
    const [x, y] = nodePos(s)
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2
      const v = 70 + Math.random() * 90
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.4 + Math.random() * 0.35 })
    }
    for (const n of SKILLS) if (visible(n) && !before.includes(n.id)) this.reveal[n.id] = 0.5
    this.onBuy?.()
    return true
  }

  render(ctx: CanvasRenderingContext2D, mx: number, my: number): void {
    ctx.fillStyle = rgba(SCENE.ui.text, 0.9)
    ctx.fillRect(0, 0, W, H)
    const g = RAMPS.gold
    const gl = RAMPS.glass
    const { x: fx, y: fy, w: fw, h: fh } = FRAME
    // 镜框（金）
    ctx.fillStyle = g[0]
    ctx.fillRect(fx, fy, fw, fh)
    ditherFill(ctx, fx + 1, fy + 1, fw - 2, fh - 2, [g[1], g[2], g[3]], (x, y) => 0.85 - ((x - fx) / fw) * 0.35 - ((y - fy) / fh) * 0.4)
    ctx.fillStyle = g[4]
    ctx.fillRect(fx + 2, fy + 2, fw - 4, 1)
    ctx.fillRect(fx + 2, fy + 2, 1, fh - 4)
    ctx.fillStyle = g[0]
    ctx.fillRect(fx + 8, fy + 8, fw - 16, fh - 16)
    // 镜面：上亮下略暗 + 两道斜反光
    ditherFill(ctx, fx + 9, fy + 9, fw - 18, fh - 18, [gl[4], gl[3]], (_x, y) => ((y - fy) / fh) * 0.7)
    ctx.fillStyle = rgba(SCENE.hairGlint[1], 0.55)
    for (let i = 0; i < 2; i++) {
      for (let y = 0; y < 170; y++) {
        const x = fx + 40 + i * 22 + Math.round(y * 0.55)
        ctx.fillRect(x, fy + 12 + y, i === 0 ? 7 : 3, 1)
      }
    }

    // 连线
    for (const s of SKILLS) {
      if (!s.parent || !visible(s)) continue
      const [x0, y0] = nodePos(SKILL_BY_ID[s.parent]!)
      const [x1, y1] = nodePos(s)
      const owned = skillLevel(s.id) >= 1
      thickLine(ctx, x0, y0, x1, y1, owned ? g[2] : SCENE.ui.border, owned ? 0 : 4, owned ? 3 : 2)
    }

    // 节点
    for (const s of SKILLS) {
      if (!visible(s)) continue
      const [x, y] = nodePos(s)
      const lv = skillLevel(s.id)
      const ramp = BRANCH_RAMP[s.branch]
      const maxed = lv >= s.max
      const afford = !maxed && s.id !== 'root' && save.hairs >= priceOf(s.id, lv)
      const rv = this.reveal[s.id] ?? 0
      const prevA = ctx.globalAlpha
      if (rv > 0) ctx.globalAlpha = 1 - rv / 0.5
      const big = (this.pop[s.id] ?? 0) > 0 ? 4 : 0
      const hover = Math.abs(mx - x) <= NODE / 2 && Math.abs(my - y) <= NODE / 2
      const half = NODE / 2 + big + (hover ? 2 : 0)
      if (afford) {
        const on = Math.floor(this.t * 3) % 2 === 0
        ctx.fillStyle = on ? g[4] : g[3]
        ctx.fillRect(x - half - 4, y - half - 4, half * 2 + 8, half * 2 + 8)
      }
      ctx.fillStyle = rgba(SCENE.ui.text, 0.3)
      ctx.fillRect(x - half + 3, y + half, half * 2 - 2, 3)
      ctx.fillStyle = maxed ? g[0] : ramp[0]!
      ctx.fillRect(x - half, y - half + 2, half * 2, half * 2 - 4)
      ctx.fillRect(x - half + 2, y - half, half * 2 - 4, half * 2)
      ctx.fillRect(x - half + 1, y - half + 1, half * 2 - 2, half * 2 - 2)
      ditherFill(ctx, x - half + 2, y - half + 2, half * 2 - 4, half * 2 - 4, maxed ? [g[3], g[4]] : lv > 0 ? [ramp[2]!, ramp[3]!] : [SCENE.skin[3], SCENE.ui.panel], (xx, yy) => 1 - ((xx - x + half) + (yy - y + half)) / (half * 4))
      ctx.fillStyle = maxed ? SCENE.hairGlint[1] : ramp[4]!
      ctx.fillRect(x - half + 3, y - half + 2, half * 2 - 8, 1)
      drawGlyph(ctx, GLYPH[s.branch], x - 13, y - 13, ramp, 3)
      if (s.max > 1 && lv > 0) {
        const txt = `${lv}/${s.max}`
        const tw = textWidth(FONT_TINY, txt, 2)
        ctx.fillStyle = SCENE.ui.text
        ctx.fillRect(x - tw / 2 - 3, y + half + 3, tw + 6, 14)
        drawPixelText(ctx, FONT_TINY, txt, x, y + half + 5, { color: maxed ? g[4] : SCENE.ui.panel, outline: null, align: 'center', scale: 2 })
      }
      if (this.selected === s.id) {
        const c = Math.floor(this.t * 4) % 2 === 0 ? SCENE.ui.text : SCENE.ui.border
        const o = half + 7
        ctx.fillStyle = c
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          const cx = x + sx * o
          const cy = y + sy * o
          ctx.fillRect(sx < 0 ? cx : cx - 7, cy - (sy > 0 ? 1 : 0), 8, 2)
          ctx.fillRect(cx - (sx > 0 ? 1 : 0), sy < 0 ? cy : cy - 7, 2, 8)
        }
      }
      ctx.globalAlpha = prevA
    }
    for (const p of this.sparks) {
      ctx.fillStyle = p.life > 0.3 ? g[4] : g[3]
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2)
    }

    // 顶部：发丝数 + 返回
    const text = formatNum(save.hairs)
    const tw = textWidth(FONT_HUD, text, 3) + 44
    panelRect(ctx, 18, 26, tw, 46)
    drawSprite(ctx, strandIcon(), 26, 34)
    drawPixelText(ctx, FONT_HUD, text, 52, 38, { color: SCENE.ui.text, outline: null, scale: 3 })
    const [bx, by, bw, bh] = this.backRect()
    panelRect(ctx, bx, by, bw, bh, SCENE.ui.border)

    // 底部：说明卡
    const shake = this.shakeCard > 0 ? Math.round(Math.sin(this.shakeCard * 80) * 4) : 0
    panelRect(ctx, 14 + shake, 694, W - 28, 252)
    const s = SKILL_BY_ID[this.selected]!
    const lv = skillLevel(s.id)
    if (lv < s.max && s.id !== 'root') {
      const price = priceOf(s.id, lv)
      const afford = save.hairs >= price
      const [ux, uy, uw, uh] = this.buyRect()
      ctx.fillStyle = SCENE.ui.text
      ctx.fillRect(ux + 1, uy + 3, uw - 2, uh)
      panelRect(ctx, ux, uy - (mx >= ux && mx <= ux + uw && my >= uy && my <= uy + uh ? 1 : 0), uw, uh, afford ? SCENE.ui.border : SCENE.floor[2])
      const pt = formatNum(price)
      const pw = textWidth(FONT_HUD, pt, 3) + 26
      drawSprite(ctx, strandIcon(), W / 2 - pw / 2, 816)
      drawPixelText(ctx, FONT_HUD, pt, W / 2 - pw / 2 + 26, 818, { color: afford ? SCENE.ui.text : RAMPS.pink[0], outline: null, scale: 3 })
    }
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const ui = SCENE.ui
    const [bx, by, bw, bh] = this.backRect()
    hiText(ctx, S.tree.back, bx + bw / 2, by + bh / 2 + 1, { size: 20, color: ui.panel, align: 'center', baseline: 'middle' })
    hiText(ctx, S.tree.title, W / 2 + 30, 58, { size: 24, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center' })
    const s = SKILL_BY_ID[this.selected]!
    const info = S.skills[s.id] ?? { name: s.id, desc: '' }
    const lv = skillLevel(s.id)
    hiText(ctx, info.name, 36, 736, { size: 26, color: ui.text })
    hiText(ctx, `${S.branches[s.branch]} · ${S.tree.level(lv, s.max)}`, W - 36, 734, { size: 16, color: ui.text, align: 'right', alpha: 0.8 })
    hiText(ctx, info.desc, 36, 772, { size: 18, color: ui.text })
    if (s.id === 'root') {
      hiText(ctx, S.tree.tapNode, W / 2, 820, { size: 18, color: rgba(ui.text, 0.7), align: 'center' })
    } else if (lv >= s.max) {
      hiText(ctx, S.tree.maxed, W / 2, 890, { size: 22, color: RAMPS.gold[0], align: 'center' })
    } else {
      const [ux, uy, uw, uh] = this.buyRect()
      hiText(ctx, S.tree.buy, ux + uw / 2, uy + uh / 2 + 1, { size: 22, color: ui.panel, align: 'center', baseline: 'middle' })
    }
    if (this.msgT > 0) hiText(ctx, this.msg, W / 2, 686, { size: 18, color: ui.panel, stroke: ui.text, strokeWidth: 3, align: 'center', alpha: Math.min(1, this.msgT) })
  }
}

function drawGlyph(ctx: CanvasRenderingContext2D, g: readonly string[], x: number, y: number, ramp: readonly string[], k = 1): void {
  for (let j = 0; j < g.length; j++) {
    const row = g[j]!
    for (let i = 0; i < row.length; i++) {
      const c = row[i]
      if (c === '1') ctx.fillStyle = ramp[0]!
      else if (c === '2') ctx.fillStyle = ramp[1]!
      else continue
      ctx.fillRect(x + i * k, y + j * k, k, k)
    }
  }
}

/** 粗像素线（Bresenham），dash > 0 时画虚线。 */
function thickLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, dash: number, w: number): void {
  ctx.fillStyle = color
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let i = 0
  const o = Math.floor(w / 2)
  for (;;) {
    if (!dash || Math.floor(i / dash) % 2 === 0) ctx.fillRect(x0 - o, y0 - o, w, w)
    i++
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
}
