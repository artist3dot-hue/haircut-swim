// 技能树（在主界面点镜子打开）：从中心"一把剪刀"向外展开 6 个分支。
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

const CX = 180
const CY = 262
const RING = [0, 70, 128, 180]
const NODE = 30

const BRANCH_RAMP: Record<Branch, readonly string[]> = {
  root: RAMPS.blade,
  sharp: RAMPS.steel,
  range: RAMPS.bcap,
  rhythm: RAMPS.lglass,
  harvest: RAMPS.gold,
  time: RAMPS.glass,
  combo: RAMPS.pink,
}

/** 9×9 小图标：1 = 色阶描边档，2 = 暗部档。 */
const GLYPH: Record<Branch, readonly string[]> = {
  root: ['1.......1', '.1.....1.', '..1...1..', '...1.1...', '....1....', '...1.1...', '.22...22.', '2..2.2..2', '.22...22.'],
  sharp: ['....1....', '...121...', '...121...', '..12221..', '..12221..', '..12221..', '...121...', '....1....', '....1....'],
  range: ['..11111..', '.1.....1.', '1..222..1', '1.2...2.1', '1.2...2.1', '1.2...2.1', '1..222..1', '.1.....1.', '..11111..'],
  rhythm: ['.....11..', '....11...', '...11....', '..111111.', '.....11..', '....11...', '...11....', '..11.....', '.1.......'],
  harvest: ['...11....', '..1..1...', '.....1...', '....1....', '...1.....', '..1......', '..1....2.', '...1..2..', '....22...'],
  time: ['..11111..', '.1.....1.', '1...2...1', '1...2...1', '1...222.1', '1.......1', '1.......1', '.1.....1.', '..11111..'],
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

  open(): void {
    this.isOpen = true
    this.age = 0
    // 默认选中一个买得起的节点，没有就选中心
    const cand = SKILLS.find((s) => visible(s) && skillLevel(s.id) < s.max && save.hairs >= priceOf(s.id, skillLevel(s.id)))
    this.selected = cand?.id ?? 'root'
  }

  close(): void {
    this.isOpen = false
    saveGame()
    this.onClose?.()
  }

  private backRect(): [number, number, number, number] {
    return [W - 70, 6, 64, 28]
  }

  private buyRect(): [number, number, number, number] {
    return [W / 2 - 70, H - 52, 140, 36]
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
      p.vy += 200 * dt
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
        if (Math.abs(tp.x - x) <= NODE / 2 + 4 && Math.abs(tp.y - y) <= NODE / 2 + 4) {
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
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2
      const v = 50 + Math.random() * 60
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.4 + Math.random() * 0.3 })
    }
    for (const n of SKILLS) if (visible(n) && !before.includes(n.id)) this.reveal[n.id] = 0.45
    return true
  }

  render(ctx: CanvasRenderingContext2D, mx: number, my: number): void {
    // 背景：压暗 + 镜框（gold 色阶）+ 镜面（glass 色阶，斜向反光）
    ctx.fillStyle = rgba(SCENE.ui.text, 0.88)
    ctx.fillRect(0, 0, W, H)
    const fx = 10
    const fy = 42
    const fw = W - 20
    const fh = 420
    const g = RAMPS.gold
    ctx.fillStyle = g[0]
    ctx.fillRect(fx, fy, fw, fh)
    ctx.fillStyle = g[2]
    ctx.fillRect(fx + 1, fy + 1, fw - 2, fh - 2)
    ctx.fillStyle = g[3]
    ctx.fillRect(fx + 1, fy + 1, fw - 2, 2)
    ctx.fillRect(fx + 1, fy + 1, 2, fh - 2)
    ctx.fillStyle = g[1]
    ctx.fillRect(fx + 1, fy + fh - 3, fw - 2, 2)
    ctx.fillRect(fx + fw - 3, fy + 1, 2, fh - 2)
    ctx.fillStyle = g[0]
    ctx.fillRect(fx + 5, fy + 5, fw - 10, fh - 10)
    const gl = RAMPS.glass
    ctx.fillStyle = gl[4]
    ctx.fillRect(fx + 6, fy + 6, fw - 12, fh - 12)
    ctx.fillStyle = gl[3]
    for (let i = 0; i < 3; i++) {
      const ox = 40 + i * 14
      for (let y = 0; y < fh - 12; y++) {
        const x = fx + 6 + ox + Math.round(y * 0.5) - (i === 1 ? 0 : 0)
        if (x < fx + fw - 6 && y < 150) ctx.fillRect(x, fy + 6 + y, i === 1 ? 4 : 2, 1)
      }
    }

    // 连线
    for (const s of SKILLS) {
      if (!s.parent || !visible(s)) continue
      const p = SKILL_BY_ID[s.parent]!
      const [x0, y0] = nodePos(p)
      const [x1, y1] = nodePos(s)
      const owned = skillLevel(s.id) >= 1
      pixelLine(ctx, x0, y0, x1, y1, owned ? g[2] : SCENE.ui.border, owned ? 0 : 3)
    }

    // 节点
    for (const s of SKILLS) {
      if (!visible(s)) continue
      const [x, y] = nodePos(s)
      const lv = skillLevel(s.id)
      const ramp = BRANCH_RAMP[s.branch]
      const maxed = lv >= s.max
      const afford = !maxed && save.hairs >= priceOf(s.id, lv)
      const rv = this.reveal[s.id] ?? 0
      const prevA = ctx.globalAlpha
      if (rv > 0) ctx.globalAlpha = 1 - rv / 0.45
      const big = (this.pop[s.id] ?? 0) > 0 ? 3 : 0
      const hover = Math.abs(mx - x) <= NODE / 2 && Math.abs(my - y) <= NODE / 2
      const half = NODE / 2 + big + (hover ? 1 : 0)
      if (afford && Math.floor(this.t * 3) % 2 === 0) {
        ctx.fillStyle = g[4]
        ctx.fillRect(x - half - 2, y - half - 2, half * 2 + 4, half * 2 + 4)
      }
      ctx.fillStyle = maxed ? g[0] : ramp[0]!
      ctx.fillRect(x - half, y - half + 1, half * 2, half * 2 - 2)
      ctx.fillRect(x - half + 1, y - half, half * 2 - 2, half * 2)
      ctx.fillStyle = maxed ? g[4] : lv > 0 ? ramp[3]! : SCENE.ui.panel
      ctx.fillRect(x - half + 1, y - half + 1, half * 2 - 2, half * 2 - 2)
      // 左上亮边
      ctx.fillStyle = maxed ? SCENE.hairGlint[1] : ramp[4]!
      ctx.fillRect(x - half + 1, y - half + 1, half * 2 - 3, 1)
      drawGlyph(ctx, GLYPH[s.branch], x - 9, y - 9, ramp, 2)
      if (s.max > 1 && lv > 0) {
        drawPixelText(ctx, FONT_TINY, `${lv}/${s.max}`, x, y + half + 3, { color: SCENE.ui.text, outline: SCENE.ui.panel, align: 'center' })
      }
      if (this.selected === s.id) {
        // 选中：四个角的括号，闪
        const c = Math.floor(this.t * 4) % 2 === 0 ? SCENE.ui.text : SCENE.ui.border
        const o = half + 3
        ctx.fillStyle = c
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          ctx.fillRect(x + sx * o - (sx > 0 ? 3 : 0), y + sy * o - (sy > 0 ? 0 : 0), 4, 1)
          ctx.fillRect(x + sx * o - (sx > 0 ? 0 : 0), y + sy * o - (sy > 0 ? 3 : 0), 1, 4)
        }
      }
      ctx.globalAlpha = prevA
    }
    for (const p of this.sparks) {
      ctx.fillStyle = p.life > 0.3 ? g[4] : g[3]
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
    }

    // 顶部：发丝数 + 返回
    const text = formatNum(save.hairs)
    const tw = textWidth(FONT_HUD, text, 2) + 26
    panelRect(ctx, 4, 6, tw, 28)
    drawPixelText(ctx, FONT_HUD, text, 22, 13, { color: SCENE.ui.text, outline: null, scale: 2 })
    drawSprite(ctx, strandIcon(), 7, 13)
    const [bx, by, bw, bh] = this.backRect()
    panelRect(ctx, bx, by, bw, bh, SCENE.ui.border)

    // 底部：选中节点的说明卡
    const shake = this.shakeCard > 0 ? Math.round(Math.sin(this.shakeCard * 80) * 3) : 0
    panelRect(ctx, 10 + shake, 470, W - 20, 162)
    const s = SKILL_BY_ID[this.selected]!
    const lv = skillLevel(s.id)
    if (lv < s.max) {
      const price = priceOf(s.id, lv)
      const afford = save.hairs >= price
      const [ux, uy, uw, uh] = this.buyRect()
      ctx.fillStyle = SCENE.ui.text
      ctx.fillRect(ux + 1, uy + 2, uw - 2, uh)
      panelRect(ctx, ux, uy, uw, uh, afford ? SCENE.ui.border : SCENE.floor[2])
      const pt = formatNum(price)
      drawPixelText(ctx, FONT_HUD, pt, W / 2 + 8, 552, { color: afford ? SCENE.ui.text : RAMPS.pink[0], outline: null, scale: 2, align: 'center' })
      drawSprite(ctx, strandIcon(), W / 2 + 8 - textWidth(FONT_HUD, pt, 2) / 2 - 18, 551)
    }
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const ui = SCENE.ui
    const [bx, by, bw, bh] = this.backRect()
    hiText(ctx, S.tree.back, bx + bw / 2, by + bh / 2 + 1, { size: 15, color: ui.panel, align: 'center', baseline: 'middle' })
    hiText(ctx, S.tree.title, W / 2 + 4, 26, { size: 17, color: ui.panel, stroke: ui.text, strokeWidth: 2, align: 'center' })
    const s = SKILL_BY_ID[this.selected]!
    const info = S.skills[s.id] ?? { name: s.id, desc: '' }
    const lv = skillLevel(s.id)
    hiText(ctx, `${info.name}`, 24, 496, { size: 18, color: ui.text })
    hiText(ctx, `${S.branches[s.branch]} · ${S.tree.level(lv, s.max)}`, W - 24, 496, { size: 12, color: ui.text, align: 'right', alpha: 0.8 })
    hiText(ctx, info.desc, 24, 522, { size: 13, color: ui.text })
    if (lv >= s.max) {
      hiText(ctx, S.tree.maxed, W / 2, 596, { size: 16, color: RAMPS.gold[0], align: 'center' })
    } else {
      const [ux, uy, uw, uh] = this.buyRect()
      hiText(ctx, S.tree.buy, ux + uw / 2, uy + uh / 2 + 1, { size: 16, color: ui.panel, align: 'center', baseline: 'middle' })
    }
    if (this.msgT > 0) hiText(ctx, this.msg, W / 2, 470 - 8, { size: 13, color: ui.panel, stroke: ui.text, strokeWidth: 2, align: 'center', alpha: Math.min(1, this.msgT) })
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

/** 1px 像素线（Bresenham），dash > 0 时画虚线。 */
export function pixelLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, dash = 0): void {
  ctx.fillStyle = color
  x0 = Math.round(x0)
  y0 = Math.round(y0)
  x1 = Math.round(x1)
  y1 = Math.round(y1)
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let i = 0
  for (;;) {
    if (!dash || Math.floor(i / dash) % 2 === 0) ctx.fillRect(x0, y0, 1, 1)
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
