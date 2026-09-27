// 整片头发：所有发丝 + 剪下来正在下落的断发，负责模拟、剪断判定和像素渲染。

import { Strand, Push, type StrandParams } from './strand'
import { Raster } from './raster'
import { Rng } from '../core/rng'
import { SCENE, RAMPS, u32 } from '../art/palette'
import { JUICE } from '../data/juice'
import { HAIR_TYPES, pickHairKind, type HairKind } from '../data/hair'

/** 头皮弧线：根部的 y（中间低、两边高，像头顶的弧）。 */
export function scalpY(x: number): number {
  const u = (x - 180) / 200
  return Math.round(24 + 18 * (1 - u * u))
}

/** 剪下来的一截：保持剪断时的弯曲形状，整体带旋转和重力下落。 */
export interface Piece {
  cx: number
  cy: number
  pcx: number
  pcy: number
  vx: number
  vy: number
  ang: number
  pang: number
  av: number
  lx: Float32Array
  ly: Float32Array
  /** 每个点的颜色（Uint32） */
  col: Uint32Array
  layer: 0 | 1
  thick: boolean
  len: number
  age: number
  kind: HairKind
  /** 带着的结（下标，-1 没有） */
  knotAt: number
  /** 这截头发值多少发丝（剪断时按连击倍率算好） */
  value: number
}

export type HitKind = 'cut' | 'knot' | 'blocked'

export interface CutHit {
  kind: HitKind
  strand: Strand
  x: number
  y: number
  /** kind === 'cut' 时才有 */
  piece: Piece | null
}

export interface HairMetrics {
  /** 80% 分位的末端 y（有 20% 的头发比它更长） */
  p80: number
  /** 能剪动的头发里最长的末端 y */
  maxCuttable: number
  /** 末端碰到地板线的比例 */
  onFloor: number
  /** 发量 = 所有末端低于泳帽线的长度总和 */
  volume: number
}

// ---- 颜色（Uint32）----
const HAIR = SCENE.hair.map((h) => u32(h))
const STEEL = RAMPS.slate.map((h) => u32(h))
const WHITE = RAMPS.head.map((h) => u32(h))
const KNOT_DARK = HAIR[0]!
const KNOT_MID = HAIR[2]!
const KNOT_LIGHT = HAIR[4]!
const FLASH = u32(SCENE.hairGlint[1])

export class HairField {
  strands: Strand[] = []
  pieces: Piece[] = []
  readonly raster = new Raster(360, 640)
  readonly push = new Push()
  private rng: Rng
  private p: StrandParams
  private initialCount = 0
  /** 最多同时存在的断发数，超过就让最老的直接落地 */
  maxPieces = 500
  /** 分叉发最多让头发总数涨到开局的几倍 */
  maxStrandMult = 1.6

  constructor(
    seed: number,
    readonly floorY: number,
  ) {
    this.rng = new Rng(seed)
    this.p = this.params()
    this.build(JUICE.hairCount)
  }

  params(): StrandParams {
    return {
      segLen: JUICE.segLen,
      gravity: JUICE.hairGravity,
      damping: JUICE.hairDamping,
      wind: JUICE.wind,
      curlAmp: JUICE.curlAmp,
      floorY: this.floorY,
      maxLen: this.floorY + 40,
    }
  }

  private makeStrand(x: number, back: boolean, len: number, kind: HairKind): Strand {
    const rng = this.rng
    const s = new Strand(
      x,
      scalpY(x) + (back ? -2 : 0),
      back ? 0 : 1,
      rng.range(0, Math.PI * 2),
      (Math.PI * 2) / rng.range(38, 90),
      rng.range(0, Math.PI * 2),
      rng.chance(0.27),
      !back && (kind === 'steel' || kind === 'white' || rng.chance(0.3)),
      len,
      this.p.segLen,
    )
    this.setKind(s, kind)
    return s
  }

  private setKind(s: Strand, kind: HairKind): void {
    s.kind = kind
    s.hitsLeft = HAIR_TYPES[kind].hits
    // 结打在当前长度靠下 1/3 处，跟着头发走（材料坐标）
    s.knotMat = s.emitted - s.length * 0.6
  }

  /** 按根数重新长一头头发（开局、调试面板改根数时用）。 */
  build(count: number): void {
    const rng = this.rng
    this.strands = []
    this.pieces = []
    this.p = this.params()
    this.initialCount = count
    for (let k = 0; k < count; k++) {
      // 根部沿头皮均匀分布 + 抖动
      const x = 4 + ((k + rng.range(0.1, 0.9)) / count) * 352
      const kind = pickHairKind(rng.next())
      // 特殊头发都放前层，看得清
      const back = kind === 'normal' && rng.chance(JUICE.backRatio)
      const len = rng.range(JUICE.startLenMin, JUICE.startLenMax)
      this.strands.push(this.makeStrand(x, back, len, kind))
    }
    this.sortLayers()
    // 预热，让头发先自然垂好、有点摆动
    for (let i = 0; i < 30; i++) for (const s of this.strands) s.step(1 / 60, i / 60, this.p, null)
  }

  private sortLayers(): void {
    // 后层先画，所以排在前面
    this.strands.sort((a, b) => a.layer - b.layer)
  }

  /** 一步：生长 + 物理 + 断发下落。onLand：断发落地时回调。 */
  update(dt: number, t: number, growth: number, onLand: (pc: Piece, x: number, y: number) => void): void {
    this.p = this.params()
    const p = this.p
    for (const s of this.strands) {
      s.grow(growth * HAIR_TYPES[s.kind].growth * dt, p)
      s.step(dt, t, p, this.push)
      if (s.flash > 0) s.flash -= dt
    }
    // 断发
    const drag = Math.pow(JUICE.pieceDrag, dt)
    const g = JUICE.pieceGravity
    let w = 0
    for (let i = 0; i < this.pieces.length; i++) {
      const pc = this.pieces[i]!
      pc.pcx = pc.cx
      pc.pcy = pc.cy
      pc.pang = pc.ang
      pc.vy += g * dt
      pc.vx *= drag
      pc.vy *= Math.pow(0.85, dt)
      pc.cx += pc.vx * dt
      pc.cy += pc.vy * dt
      pc.ang += pc.av * dt
      pc.av *= Math.pow(0.7, dt)
      pc.age += dt
      // 最低点碰到地板就算落地
      const c = Math.cos(pc.ang)
      const sn = Math.sin(pc.ang)
      let low = -1e9
      let lowX = pc.cx
      for (let k = 0; k < pc.lx.length; k++) {
        const wy = pc.cy + pc.lx[k]! * sn + pc.ly[k]! * c
        if (wy > low) {
          low = wy
          lowX = pc.cx + pc.lx[k]! * c - pc.ly[k]! * sn
        }
      }
      const tooMany = this.pieces.length - i > this.maxPieces
      if (low >= this.floorY || pc.age > 6 || tooMany) {
        onLand(pc, lowX, Math.min(low, this.floorY))
        continue
      }
      this.pieces[w++] = pc
    }
    this.pieces.length = w
  }

  /**
   * 剪刀咔嚓：刃线段 = 以 (sx, sy) 为中心、半长 halfLen 的水平线，带厚度 thick。
   * 对每根头发取最靠根部的交点：
   * - 锋利度不够 → 'blocked'（钢丝发"铛"）
   * - 打结发还没剪够 → 'knot'（结闪一下，不断）
   * - 否则剪开 → 'cut'
   */
  snap(sx: number, sy: number, halfLen: number, thick: number, sharpness: number, rng: Rng): CutHit[] {
    const hits: CutHit[] = []
    const x0 = sx - halfLen
    const x1 = sx + halfLen
    const amp = JUICE.curlAmp
    const born: Strand[] = []
    for (const s of this.strands) {
      const n = s.count
      if (n < 2) continue
      // 粗筛：根在剪刀下方太远、或末端在剪刀上方，跳过
      if (s.rootY > sy + thick || s.tipY < sy - thick - 20) continue
      let hitSeg = -1
      let hitT = 0
      let prevX = s.x[0]! + s.curlAt(0, amp)
      let prevY = s.y[0]!
      for (let i = 0; i < n - 1; i++) {
        const nx = s.x[i + 1]! + s.curlAt(i + 1, amp)
        const ny = s.y[i + 1]!
        // 与水平刃线 y = sy 相交，或整段贴着刃线（厚度内）
        let t = -1
        if ((prevY - sy) * (ny - sy) <= 0 && prevY !== ny) {
          t = (sy - prevY) / (ny - prevY)
        } else if (Math.abs(prevY - sy) <= thick || Math.abs(ny - sy) <= thick) {
          t = Math.abs(prevY - sy) < Math.abs(ny - sy) ? 0 : 1
        }
        if (t >= 0) {
          const hx = prevX + (nx - prevX) * t
          if (hx >= x0 && hx <= x1) {
            hitSeg = i
            hitT = t
            break
          }
        }
        prevX = nx
        prevY = ny
      }
      if (hitSeg < 0) continue
      // 剪下来的部分太短（刚好剪在末端）就不算
      let tail = s.rest[hitSeg]! * (1 - hitT)
      for (let i = hitSeg + 1; i < n - 1; i++) tail += s.rest[i]!
      if (tail < 3) continue
      const hx = s.x[hitSeg]! + (s.x[hitSeg + 1]! - s.x[hitSeg]!) * hitT
      const hy = s.y[hitSeg]! + (s.y[hitSeg + 1]! - s.y[hitSeg]!) * hitT
      const type = HAIR_TYPES[s.kind]
      if (sharpness < type.hardness) {
        s.flash = 0.12
        hits.push({ kind: 'blocked', strand: s, x: hx, y: hy, piece: null })
        continue
      }
      if (s.hitsLeft > 1) {
        s.hitsLeft--
        s.flash = 0.12
        hits.push({ kind: 'knot', strand: s, x: hx, y: hy, piece: null })
        continue
      }
      // 离根太近时留一点头发桩
      if (hitSeg === 0 && s.rest[0]! * hitT < 3) hitT = Math.min(1, 3 / s.rest[0]!)
      const emittedAtCut = s.emitted
      const kind = s.kind
      const knotMat = kind === 'knot' ? s.knotMat : NaN
      const cut = s.cut(hitSeg, hitT, amp)
      const piece = this.makePiece(s, cut, emittedAtCut, tail, sx, sy, rng, knotMat)
      this.pieces.push(piece)
      hits.push({ kind: 'cut', strand: s, x: cut.xs[0]!, y: cut.ys[0]!, piece })
      // 剪断后：打结发的结没了，分叉发头上那截分成两根
      if (kind === 'knot') this.setKind(s, 'normal')
      if (kind === 'split') {
        this.setKind(s, 'normal')
        if (this.strands.length + born.length < this.initialCount * this.maxStrandMult) {
          const sib = this.makeStrand(Math.max(2, Math.min(358, s.rootX + rng.jitter(3))), false, Math.max(6, s.length * 0.7), 'normal')
          born.push(sib)
        }
      }
    }
    if (born.length) {
      this.strands.push(...born)
      this.sortLayers()
    }
    return hits
  }

  private makePiece(
    s: Strand,
    cut: { xs: number[]; ys: number[]; mats: number[]; vx: number; vy: number },
    emitted: number,
    len: number,
    sx: number,
    sy: number,
    rng: Rng,
    knotMat: number,
  ): Piece {
    const m = cut.xs.length
    let cx = 0
    let cy = 0
    for (let i = 0; i < m; i++) {
      cx += cut.xs[i]!
      cy += cut.ys[i]!
    }
    cx /= m
    cy /= m
    const lx = new Float32Array(m)
    const ly = new Float32Array(m)
    const col = new Uint32Array(m)
    let knotAt = -1
    let best = 1e9
    for (let i = 0; i < m; i++) {
      lx[i] = cut.xs[i]! - cx
      ly[i] = cut.ys[i]! - cy
      col[i] = hairColor(s, emitted - cut.mats[i]!, cut.mats[i]!)
      const d = Math.abs(cut.mats[i]! - knotMat)
      if (d < best && d < 12) {
        best = d
        knotAt = i
      }
    }
    // 向外弹出：离剪刀中心越远越往两边飞，再加一点向上的弹
    const dir = Math.sign(cut.xs[0]! - sx) || rng.sign()
    const kick = JUICE.pieceKick
    const spin = rng.range(JUICE.pieceSpinMin, JUICE.pieceSpinMax) * rng.sign()
    // 长头发转得慢一点
    const spinScale = Math.max(0.35, Math.min(1.4, 60 / Math.max(20, len)))
    return {
      cx,
      cy,
      pcx: cx,
      pcy: cy,
      vx: cut.vx * 0.5 + dir * kick * rng.range(0.4, 1.2),
      vy: cut.vy * 0.5 - kick * rng.range(0.2, 0.8) + (cy - sy) * 0.3,
      ang: 0,
      pang: 0,
      av: spin * spinScale,
      lx,
      ly,
      col,
      layer: s.layer,
      thick: s.thick,
      len,
      age: 0,
      kind: s.kind,
      knotAt,
      value: 0,
    }
  }

  /** extra：在推到 canvas 之前往同一个光栅上再画点东西（碎屑粒子）。 */
  render(alpha: number, extra?: (r: Raster) => void): HTMLCanvasElement {
    const r = this.raster
    r.clear()
    const amp = JUICE.curlAmp
    for (const s of this.strands) {
      const n = s.count
      const flash = s.flash > 0
      let x0 = s.px[0]! + (s.x[0]! - s.px[0]!) * alpha + s.curlAt(0, amp)
      let y0 = s.y[0]!
      let knotX = NaN
      let knotY = NaN
      for (let i = 1; i < n; i++) {
        const x1 = s.px[i]! + (s.x[i]! - s.px[i]!) * alpha + s.curlAt(i, amp)
        const y1 = s.py[i]! + (s.y[i]! - s.py[i]!) * alpha
        const c = flash ? FLASH : hairColor(s, s.emitted - s.mat[i]!, s.mat[i]!)
        r.line(x0, y0, x1, y1, c, s.thick ? darker(s, c) : 0, i > 1)
        if (s.kind === 'knot' && Number.isNaN(knotX) && s.mat[i]! <= s.knotMat) {
          knotX = x1
          knotY = y1
        }
        x0 = x1
        y0 = y1
      }
      if (s.kind === 'knot') {
        // 结在材料坐标上；如果那段还没长到（头发比结短），就画在末端
        if (Number.isNaN(knotX)) {
          knotX = x0
          knotY = y0
        }
        drawKnot(r, knotX, knotY, s.hitsLeft, flash)
      }
      if (s.kind === 'split' && n > 3) drawFork(r, s, alpha, amp)
    }
    for (const pc of this.pieces) {
      const cx = pc.pcx + (pc.cx - pc.pcx) * alpha
      const cy = pc.pcy + (pc.cy - pc.pcy) * alpha
      const a = pc.pang + (pc.ang - pc.pang) * alpha
      const c = Math.cos(a)
      const sn = Math.sin(a)
      let px = cx + pc.lx[0]! * c - pc.ly[0]! * sn
      let py = cy + pc.lx[0]! * sn + pc.ly[0]! * c
      for (let k = 1; k < pc.lx.length; k++) {
        const nx = cx + pc.lx[k]! * c - pc.ly[k]! * sn
        const ny = cy + pc.lx[k]! * sn + pc.ly[k]! * c
        const col = pc.col[k]!
        r.line(px, py, nx, ny, col, pc.thick ? col : 0, k > 1)
        if (k === pc.knotAt) drawKnot(r, nx, ny, 1, false)
        px = nx
        py = ny
      }
    }
    extra?.(r)
    r.flush()
    return r.canvas
  }

  /** 一局用的统计：发量、爆表比例、能剪动的最长末端。 */
  metrics(capY: number, sharpness: number): HairMetrics {
    const n = this.strands.length
    if (n === 0) return { p80: 0, maxCuttable: 0, onFloor: 0, volume: 0 }
    const tips: number[] = []
    let maxCuttable = 0
    let onFloor = 0
    let volume = 0
    for (const s of this.strands) {
      const y = s.tipY
      tips.push(y)
      if (y >= this.floorY - 1) onFloor++
      if (y > capY) volume += y - capY
      if (HAIR_TYPES[s.kind].hardness <= sharpness && y > maxCuttable) maxCuttable = y
    }
    tips.sort((a, b) => a - b)
    const p80 = tips[Math.min(n - 1, Math.floor(n * 0.8))]!
    return { p80, maxCuttable, onFloor: onFloor / n, volume }
  }

  /** 某种头发上的随机一点（给白发闪星用）。 */
  randomPointOf(kind: HairKind, rng: Rng): [number, number] | null {
    const list = this.strands.filter((s) => s.kind === kind && s.count > 3)
    if (!list.length) return null
    const s = rng.pick(list)
    const i = rng.int(2, s.count - 1)
    return [s.x[i]! + s.curlAt(i, JUICE.curlAmp), s.y[i]!]
  }

  /** 调试 / 测试：把所有能剪的头发剪到 y 以上（不产生断发）。 */
  trimAll(y: number, sharpness: number): void {
    for (const s of this.strands) {
      if (HAIR_TYPES[s.kind].hardness > sharpness) continue
      for (let i = 1; i < s.count; i++) {
        if (s.y[i]! > y) {
          const t = Math.max(0, Math.min(1, (y - s.y[i - 1]!) / (s.y[i]! - s.y[i - 1]! || 1)))
          s.cut(i - 1, t, 0)
          break
        }
      }
    }
  }

  /** 调试 / 测试：所有头发一下长 amount 像素，直接垂直摆好（躺到地板上的部分往旁边铺）。 */
  growAll(amount: number): void {
    for (const s of this.strands) {
      s.grow(amount, this.p)
      let x = s.rootX
      let y = s.rootY
      const dir = s.rootX < 180 ? 1 : -1
      for (let i = 1; i < s.count; i++) {
        const r = s.rest[i - 1]!
        if (y + r <= this.floorY) y += r
        else {
          y = this.floorY
          x += dir * r
        }
        s.x[i] = x
        s.y[i] = y
        s.px[i] = x
        s.py[i] = y
      }
    }
    for (let i = 0; i < 20; i++) for (const s of this.strands) s.step(1 / 60, i / 60, this.p, null)
  }
}

/**
 * 发丝某处的颜色。根部深、末端略亮；后层整体更暗；
 * 带高光的头发在卷曲"朝左上"的地方亮一段。钢丝发用 slate 色阶、白发用 head 色阶。
 */
export function hairColor(s: Strand, fromRoot: number, mat: number): number {
  const c = Math.cos(mat * s.curlFreq + s.curlPhase)
  if (s.kind === 'steel') return STEEL[c > 0.75 ? 4 : c > 0.2 ? 3 : 2]!
  if (s.kind === 'white') return WHITE[c > 0.8 ? 4 : c > 0 ? 3 : 2]!
  let ci = fromRoot < 50 ? 0 : fromRoot < 200 ? 1 : 2
  if (s.layer === 0) return HAIR[ci >= 2 ? 1 : 0]!
  if (s.shiny && fromRoot > 24) {
    if (c > 0.9) ci = 4
    else if (c > 0.45) ci = 3
  }
  return HAIR[ci]!
}

function darker(s: Strand, c: number): number {
  if (s.kind === 'steel') return STEEL[1]!
  if (s.kind === 'white') return WHITE[1]!
  const i = HAIR.indexOf(c)
  return HAIR[Math.max(0, i - 1)]!
}

/** 结：一小团，剩几下就画多大（3 下大一圈）。 */
function drawKnot(r: Raster, x: number, y: number, hitsLeft: number, flash: boolean): void {
  const cx = Math.round(x)
  const cy = Math.round(y)
  const big = hitsLeft >= 3 ? 2 : 1
  for (let dy = -1; dy <= big; dy++) {
    for (let dx = -big; dx <= big; dx++) {
      if (Math.abs(dx) === big && Math.abs(dy) === big) continue
      r.plot(cx + dx, cy + dy, flash ? FLASH : KNOT_MID)
    }
  }
  // 右下暗边，左上一点高光（光源在左上）
  for (let dx = -big; dx <= big; dx++) r.plot(cx + dx, cy + big + 1, KNOT_DARK)
  r.plot(cx + big + 1, cy, KNOT_DARK)
  r.plot(cx - big + 1, cy - 1, KNOT_LIGHT)
}

/** 分叉：末端再多画一根岔出去的细丝。 */
function drawFork(r: Raster, s: Strand, alpha: number, amp: number): void {
  const n = s.count
  const i0 = Math.max(1, n - 4)
  let x0 = s.px[i0]! + (s.x[i0]! - s.px[i0]!) * alpha + s.curlAt(i0, amp)
  let y0 = s.py[i0]! + (s.y[i0]! - s.py[i0]!) * alpha
  for (let i = i0 + 1; i < n; i++) {
    const k = (i - i0) / (n - 1 - i0)
    const x1 = s.px[i]! + (s.x[i]! - s.px[i]!) * alpha + s.curlAt(i, amp) + k * k * 7
    const y1 = s.py[i]! + (s.y[i]! - s.py[i]!) * alpha - k * 2
    r.line(x0, y0, x1, y1, HAIR[i === n - 1 ? 3 : 2]!, 0, true)
    x0 = x1
    y0 = y1
  }
}
