// 整片头发：所有发丝 + 剪下来正在下落的断发，负责模拟、剪断判定和像素渲染。

import { Strand, Push, type StrandParams } from './strand'
import { Raster } from './raster'
import { Rng } from '../core/rng'
import { SCENE, u32 } from '../art/palette'
import { JUICE } from '../data/juice'

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
  /** 每个点的颜色下标（SCENE.hair） */
  col: Uint8Array
  layer: 0 | 1
  thick: boolean
  len: number
  age: number
  /** 这截头发值多少发丝（剪断时按连击倍率算好） */
  value: number
}

export interface CutHit {
  strand: Strand
  x: number
  y: number
  piece: Piece
}

/** 颜色表（Uint32）：头发 5 档 */
const HAIR = SCENE.hair.map((h) => u32(h))

export class HairField {
  strands: Strand[] = []
  pieces: Piece[] = []
  readonly raster = new Raster(360, 640)
  readonly push = new Push()
  private rng: Rng
  private p: StrandParams
  /** 最多同时存在的断发数，超过就让最老的直接落地 */
  maxPieces = 500

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
      maxLen: this.floorY - 20 + 40,
    }
  }

  /** 按根数重新长一头头发（调试面板改根数时用）。 */
  build(count: number): void {
    const rng = this.rng
    this.strands = []
    const p = this.params()
    for (let k = 0; k < count; k++) {
      // 根部沿头皮均匀分布 + 抖动
      const x = 4 + ((k + rng.range(0.1, 0.9)) / count) * 352
      const back = rng.chance(JUICE.backRatio)
      const len = rng.range(JUICE.startLenMin, JUICE.startLenMax)
      const s = new Strand(
        x,
        scalpY(x) + (back ? -2 : 0),
        back ? 0 : 1,
        rng.range(0, Math.PI * 2),
        (Math.PI * 2) / rng.range(38, 90),
        rng.range(0, Math.PI * 2),
        rng.chance(0.27),
        !back && rng.chance(0.3),
        len,
        p.segLen,
      )
      this.strands.push(s)
    }
    // 后层先画，所以排在前面
    this.strands.sort((a, b) => a.layer - b.layer)
    // 预热，让头发先自然垂好、有点摆动
    for (let i = 0; i < 30; i++) for (const s of this.strands) s.step(1 / 60, i / 60, p, null)
  }

  /** 一步：生长 + 物理 + 断发下落。onLand：断发落地时回调。 */
  update(dt: number, t: number, growth: number, onLand: (pc: Piece, x: number, y: number) => void): void {
    this.p = this.params()
    const p = this.p
    for (const s of this.strands) {
      s.grow(growth * dt, p)
      s.step(dt, t, p, this.push)
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
   * 对每根头发取最靠根部的交点剪开，返回所有剪断。
   */
  snap(sx: number, sy: number, halfLen: number, thick: number, rng: Rng): CutHit[] {
    const hits: CutHit[] = []
    const x0 = sx - halfLen
    const x1 = sx + halfLen
    const amp = JUICE.curlAmp
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
      // 离根太近时留一点头发桩
      if (hitSeg === 0 && s.rest[0]! * hitT < 3) hitT = Math.min(1, 3 / s.rest[0]!)
      const emittedAtCut = s.emitted
      const cut = s.cut(hitSeg, hitT, amp)
      const piece = this.makePiece(s, cut, emittedAtCut, tail, sx, sy, rng)
      this.pieces.push(piece)
      hits.push({ strand: s, x: cut.xs[0]!, y: cut.ys[0]!, piece })
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
    const col = new Uint8Array(m)
    for (let i = 0; i < m; i++) {
      lx[i] = cut.xs[i]! - cx
      ly[i] = cut.ys[i]! - cy
      col[i] = hairColorIndex(s, emitted - cut.mats[i]!, cut.mats[i]!)
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
      let x0 = s.px[0]! + (s.x[0]! - s.px[0]!) * alpha + s.curlAt(0, amp)
      let y0 = s.y[0]!
      for (let i = 1; i < n; i++) {
        const x1 = s.px[i]! + (s.x[i]! - s.px[i]!) * alpha + s.curlAt(i, amp)
        const y1 = s.py[i]! + (s.y[i]! - s.py[i]!) * alpha
        const ci = hairColorIndex(s, s.emitted - s.mat[i]!, s.mat[i]!)
        r.line(x0, y0, x1, y1, HAIR[ci]!, s.thick ? HAIR[Math.max(0, ci - 1)]! : 0, i > 1)
        x0 = x1
        y0 = y1
      }
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
        const ci = pc.col[k]!
        r.line(px, py, nx, ny, HAIR[ci]!, pc.thick ? HAIR[Math.max(0, ci - 1)]! : 0, k > 1)
        px = nx
        py = ny
      }
    }
    extra?.(r)
    r.flush()
    return r.canvas
  }

  /** 统计：头发末端的平均 y、最低 y。 */
  tipStats(): { avg: number; max: number } {
    let sum = 0
    let max = 0
    for (const s of this.strands) {
      const y = s.tipY
      sum += y
      if (y > max) max = y
    }
    return { avg: this.strands.length ? sum / this.strands.length : 0, max }
  }
}

/**
 * 发丝某处的颜色下标（SCENE.hair：0 最深 … 4 高光）。
 * 根部深、末端略亮；后层整体更暗；带高光的头发在卷曲"朝左上"的地方亮一段。
 */
export function hairColorIndex(s: Strand, fromRoot: number, mat: number): number {
  let ci = fromRoot < 50 ? 0 : fromRoot < 200 ? 1 : 2
  if (s.layer === 0) return ci >= 2 ? 1 : 0
  if (s.shiny && fromRoot > 24) {
    const c = Math.cos(mat * s.curlFreq + s.curlPhase)
    if (c > 0.9) ci = 4
    else if (c > 0.45) ci = 3
  }
  return ci
}
