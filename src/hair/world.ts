// 一整头头发（DESIGN_V2）：很长、持久（存进存档），剪掉的就没了，只会慢慢长回来。
//
// - 每一"缕"是一条 Verlet 链（Strand），画的时候由 4 根细发丝组成（左边受光亮、右边暗），
//   细发丝各自有卷曲相位，互相交织；靠近发根收拢、发梢逐根变短收尖。
// - 世界坐标：头皮在最上面（y≈60–100），头发往下垂好几屏；镜头 camY 是画面顶部的世界 y。
// - 剪：刃线上穿过的每一缕按"离自己的发梢有多远"算纠缠度，超过抓力就缠住；
//   不缠住时最多剪断"容量"缕（离刃中心最近的），剪下那截的长度决定收益。

import { Strand, Push, type StrandParams } from './strand'
import type { Raster } from './raster'
import { Rng } from '../core/rng'
import { SCENE, RAMPS, u32 } from '../art/palette'
import { HAIR_TYPES, pickHairKind, type HairKind } from '../data/hair'
import { HAIR_WORLD } from '../data/tools'

export const WORLD_W = 540
const SEG = 16
const SUBS = 4

/** 头皮弧线：发根的 y（中间低、两边高）。 */
export function rootYAt(x: number): number {
  const u = (x - WORLD_W / 2) / (WORLD_W * 0.56)
  return Math.round(64 + 40 * (1 - u * u))
}

const HAIR = SCENE.hair.map((h) => u32(h))
const GLINT = u32(SCENE.hairGlint[0])
const STEEL = RAMPS.slate.map((h) => u32(h))
const WHITE = RAMPS.head.map((h) => u32(h))
const FLASH = u32(SCENE.hairGlint[1])

/** 剪下来的一截：4 根细发丝的折线（局部坐标）冻结下来，整体旋转下落。 */
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
  /** 每根细发丝：交错的 x,y 局部坐标 */
  lines: Float32Array[]
  cols: Uint32Array[]
  /** 包围半径（判断出画面用） */
  radius: number
  len: number
  kind: HairKind
  value: number
  age: number
}

export interface Hit {
  lock: Strand
  x: number
  y: number
  piece: Piece
  len: number
}

export interface SnapResult {
  /** 缠住了（什么也没剪断） */
  jam: boolean
  /** 刃上穿过了几缕 */
  crossing: number
  tangle: number
  hits: Hit[]
  /** 钢丝发剪不动的位置 */
  blocked: Array<[number, number]>
  /** 打结发剪了一下没断的位置 */
  knots: Array<[number, number]>
}

export interface SnapTool {
  radius: number
  thick: number
  capacity: number
  grip: number
  sharpness: number
}

interface Cand {
  s: Strand
  seg: number
  t: number
  hx: number
  hy: number
  depth: number
}

export interface WorldMetrics {
  /** 95% 分位的发梢 y（镜头跟着它） */
  front: number
  /** 能剪动的头发里最长的发梢 y */
  maxCuttable: number
  /** 平均长度 */
  avgLen: number
}

export interface HairSaveData {
  seed: number
  lens: number[]
  kinds: string[]
  initialAvg: number
}

/** 每缕头发的渲染参数（和 Strand 放一起） */
interface LockLook {
  sub: Float32Array // 每根细发丝的横向偏移基数
  subPhase: Float32Array
  subEnd: Float32Array // 发梢处每根细发丝比整缕短多少
  shade: number // 整体明暗偏移
}

export class HairWorld {
  locks: Strand[] = []
  looks = new WeakMap<Strand, LockLook>()
  pieces: Piece[] = []
  readonly push = new Push()
  private p: StrandParams
  private rng: Rng
  seed = 1
  initialAvg = 3000
  /** 打结发少剪几下（技能） */
  knotEase = 0

  constructor() {
    this.rng = new Rng(1)
    this.p = {
      segLen: SEG,
      gravity: 420,
      damping: 0.955,
      wind: 16,
      curlAmp: 3.2,
      floorY: 1e9,
      maxLen: 20000,
    }
  }

  /** 新的一轮：按缕数和长度长一头新头发。 */
  fresh(seed: number, count: number, lenMin: number, lenMax: number, rareMult = 1): void {
    this.seed = seed
    this.rng = new Rng(seed)
    const lens: number[] = []
    const kinds: string[] = []
    const r2 = new Rng(seed ^ 0x5bd1e995)
    for (let i = 0; i < count; i++) {
      lens.push(r2.range(lenMin, lenMax))
      kinds.push(pickHairKind(r2.next(), rareMult))
    }
    this.load({ seed, lens, kinds, initialAvg: (lenMin + lenMax) / 2 })
  }

  /** 从存档恢复（发根位置由 seed 决定，长度和种类存着）。 */
  load(d: HairSaveData): void {
    this.seed = d.seed
    this.initialAvg = d.initialAvg
    const rng = new Rng(d.seed)
    this.rng = new Rng(d.seed + 17)
    this.locks = []
    this.pieces = []
    const n = d.lens.length
    for (let i = 0; i < n; i++) {
      const x = 6 + ((i + rng.range(0.15, 0.85)) / n) * (WORLD_W - 12)
      const back = rng.chance(0.35)
      const s = new Strand(
        x,
        rootYAt(x) + (back ? -3 : 0),
        back ? 0 : 1,
        rng.range(0, Math.PI * 2),
        (Math.PI * 2) / rng.range(60, 130),
        rng.range(0, Math.PI * 2),
        rng.chance(0.3),
        false,
        Math.max(4, d.lens[i]!),
        SEG,
      )
      const kind = (HAIR_KINDS_SET.has(d.kinds[i] ?? '') ? d.kinds[i] : 'normal') as HairKind
      this.setKind(s, kind)
      const sub = new Float32Array(SUBS)
      const subPhase = new Float32Array(SUBS)
      const subEnd = new Float32Array(SUBS)
      for (let k = 0; k < SUBS; k++) {
        sub[k] = (k - (SUBS - 1) / 2) * rng.range(1.3, 1.9)
        subPhase[k] = rng.range(0, Math.PI * 2)
        subEnd[k] = k === 1 || k === 2 ? rng.range(0, 8) : rng.range(10, 34)
      }
      this.looks.set(s, { sub, subPhase, subEnd, shade: rng.range(-0.15, 0.15) })
      this.locks.push(s)
    }
    this.locks.sort((a, b) => a.layer - b.layer)
    for (let i = 0; i < 40; i++) for (const s of this.locks) s.step(1 / 60, i / 60, this.p, null)
  }

  save(): HairSaveData {
    // 存档按发根 x 的顺序（和 load 一致）
    const sorted = [...this.locks].sort((a, b) => a.rootX - b.rootX)
    return {
      seed: this.seed,
      lens: sorted.map((s) => Math.round(s.length * 10) / 10),
      kinds: sorted.map((s) => s.kind),
      initialAvg: this.initialAvg,
    }
  }

  private setKind(s: Strand, kind: HairKind): void {
    s.kind = kind
    s.hitsLeft = Math.max(1, HAIR_TYPES[kind].hits - (kind === 'knot' ? this.knotEase : 0))
    s.knotMat = s.emitted - Math.min(s.length * 0.5, 260)
  }

  /** 生长（主界面里也会调用；不跑物理时新长度会先挤在根部，下次模拟时自然垂下）。 */
  grow(dt: number, mult: number): void {
    const g = HAIR_WORLD.growth * mult * dt
    for (const s of this.locks) s.grow(g * HAIR_TYPES[s.kind].growth, this.p)
  }

  step(dt: number, t: number): void {
    for (const s of this.locks) {
      s.step(dt, t, this.p, this.push)
      if (s.flash > 0) s.flash -= dt
    }
    const drag = Math.pow(0.6, dt)
    let w = 0
    for (const pc of this.pieces) {
      pc.pcx = pc.cx
      pc.pcy = pc.cy
      pc.pang = pc.ang
      pc.vy += 900 * dt
      pc.vx *= drag
      pc.cx += pc.vx * dt
      pc.cy += pc.vy * dt
      pc.ang += pc.av * dt
      pc.av *= Math.pow(0.75, dt)
      pc.age += dt
      this.pieces[w++] = pc
    }
    this.pieces.length = w
  }

  /** 取出已经掉出镜头下方（或太久）的断发。 */
  takeFallen(camBottom: number): Piece[] {
    const out: Piece[] = []
    let w = 0
    for (const pc of this.pieces) {
      if (pc.cy - pc.radius > camBottom + 20 || pc.age > 5) out.push(pc)
      else this.pieces[w++] = pc
    }
    this.pieces.length = w
    return out
  }

  /** 刃线穿过的每一缕头发（交点 + 剪下来会有多长）。 */
  private crossings(sx: number, sy: number, tool: { radius: number; thick: number }): Cand[] {
    const x0 = sx - tool.radius
    const x1 = sx + tool.radius
    const cands: Cand[] = []
    for (const s of this.locks) {
      const n = s.count
      if (n < 2 || s.rootY > sy + tool.thick || s.tipY < sy - tool.thick) continue
      let prevX = s.x[0]! + s.curlAt(0, this.p.curlAmp)
      let prevY = s.y[0]!
      for (let i = 0; i < n - 1; i++) {
        const nx = s.x[i + 1]! + s.curlAt(i + 1, this.p.curlAmp)
        const ny = s.y[i + 1]!
        let t = -1
        if ((prevY - sy) * (ny - sy) <= 0 && prevY !== ny) t = (sy - prevY) / (ny - prevY)
        else if (Math.abs(prevY - sy) <= tool.thick || Math.abs(ny - sy) <= tool.thick) t = Math.abs(prevY - sy) < Math.abs(ny - sy) ? 0 : 1
        if (t >= 0) {
          const hx = prevX + (nx - prevX) * t
          if (hx >= x0 - 3 && hx <= x1 + 3) {
            // 剪下来会有多长
            let tail = s.rest[i]! * (1 - t)
            for (let j = i + 1; j < n - 1; j++) tail += s.rest[j]!
            if (tail >= 3) cands.push({ s, seg: i, t, hx, hy: prevY + (ny - prevY) * t, depth: tail })
            break
          }
        }
        prevX = nx
        prevY = ny
      }
    }
    return cands
  }

  private tangleOf(cands: readonly Cand[], tool: SnapTool, tangleMult: number): number {
    let tangle = 0
    // 剪不动的硬发（钢丝发）刃会滑开，不算纠缠
    for (const c of cands) if (tool.sharpness >= HAIR_TYPES[c.s.kind].hardness) tangle += Math.min(HAIR_WORLD.tangleCap, c.depth / HAIR_WORLD.tangleDepth) * tangleMult
    return tangle
  }

  /** 试剪（不改变头发）：会不会缠住、能剪下哪几截（离刃中心近的先剪）。平衡测试机器人用。 */
  probe(sx: number, sy: number, tool: SnapTool, tangleMult: number): { jam: boolean; lens: number[] } {
    const cands = this.crossings(sx, sy, tool)
    const jam = this.tangleOf(cands, tool, tangleMult) > tool.grip
    cands.sort((a, b) => Math.abs(a.hx - sx) - Math.abs(b.hx - sx))
    const lens = cands.filter((c) => tool.sharpness >= HAIR_TYPES[c.s.kind].hardness).slice(0, tool.capacity).map((c) => c.depth)
    return { jam, lens }
  }

  /**
   * 剪一下：刃线 = 以 (sx, sy) 为中心、半长 radius 的水平线段，厚 thick。
   * tangleMult：纠缠度倍率（技能"顺滑"降低它）。
   */
  snap(sx: number, sy: number, tool: SnapTool, tangleMult: number): SnapResult {
    const res: SnapResult = { jam: false, crossing: 0, tangle: 0, hits: [], blocked: [], knots: [] }
    const cands = this.crossings(sx, sy, tool)
    res.crossing = cands.length
    if (!cands.length) return res
    // 纠缠度：离发梢越远越缠
    const tangle = this.tangleOf(cands, tool, tangleMult)
    res.tangle = tangle
    if (tangle > tool.grip) {
      res.jam = true
      // 被缠住：刃附近的头发被扯向剪刀
      for (const c of cands) {
        c.s.flash = 0.1
        for (let i = Math.max(1, c.seg - 3); i <= Math.min(c.s.count - 1, c.seg + 3); i++) c.s.x[i]! += (sx - c.s.x[i]!) * 0.25
      }
      return res
    }
    // 离刃中心最近的先剪
    cands.sort((a, b) => Math.abs(a.hx - sx) - Math.abs(b.hx - sx))
    let cut = 0
    const born: Strand[] = []
    for (const c of cands) {
      if (cut >= tool.capacity) break
      const s = c.s
      if (tool.sharpness < HAIR_TYPES[s.kind].hardness) {
        s.flash = 0.12
        res.blocked.push([c.hx, c.hy])
        continue
      }
      if (s.hitsLeft > 1) {
        s.hitsLeft--
        s.flash = 0.12
        res.knots.push([c.hx, c.hy])
        cut++
        continue
      }
      const kind = s.kind
      const piece = this.cutLock(s, c.seg, c.t, sx, sy)
      res.hits.push({ lock: s, x: c.hx, y: c.hy, piece, len: piece.len })
      cut++
      if (kind === 'knot') this.setKind(s, 'normal')
      if (kind === 'split') {
        this.setKind(s, 'normal')
        if (this.locks.length + born.length < 200) born.push(this.sibling(s))
      }
    }
    if (born.length) {
      this.locks.push(...born)
      this.locks.sort((a, b) => a.layer - b.layer)
    }
    return res
  }

  private sibling(s: Strand): Strand {
    const rng = this.rng
    const x = Math.max(4, Math.min(WORLD_W - 4, s.rootX + rng.jitter(4)))
    const n = new Strand(x, rootYAt(x), 1, rng.range(0, 6.28), s.curlFreq * rng.range(0.9, 1.1), rng.range(0, 6.28), false, false, Math.max(8, s.length * 0.8), SEG)
    this.setKind(n, 'normal')
    const look = this.looks.get(s)
    if (look) this.looks.set(n, look)
    return n
  }

  /** 剪开一缕，返回断下来的一截（按当前渲染形状冻结 4 根细发丝）。 */
  private cutLock(s: Strand, seg: number, t: number, sx: number, sy: number): Piece {
    const look = this.looks.get(s)!
    const emitted = s.emitted
    const lenBefore = s.length
    const cut = s.cut(seg, t, this.p.curlAmp)
    const len = Math.max(0, lenBefore - s.length)
    const m = cut.xs.length
    let cx = 0
    let cy = 0
    for (let i = 0; i < m; i++) {
      cx += cut.xs[i]!
      cy += cut.ys[i]!
    }
    cx /= m
    cy /= m
    let radius = 0
    const lines: Float32Array[] = []
    const cols: Uint32Array[] = []
    const tipMat = cut.mats[m - 1]!
    for (let k = 0; k < SUBS; k++) {
      const arr = new Float32Array(m * 2)
      const col = new Uint32Array(m)
      for (let i = 0; i < m; i++) {
        const mat = cut.mats[i]!
        const off = subOffset(look, k, mat, emitted - mat, mat - tipMat)
        const lx = cut.xs[i]! + off - cx
        const ly = cut.ys[i]! - cy
        arr[i * 2] = lx
        arr[i * 2 + 1] = ly
        radius = Math.max(radius, Math.hypot(lx, ly))
        col[i] = lockColor(s, look, k, emitted - mat, mat, false)
      }
      lines.push(arr)
      cols.push(col)
    }
    const rng = this.rng
    const dir = Math.sign(cut.xs[0]! - sx) || rng.sign()
    const heavy = Math.min(1, len / 400)
    return {
      cx,
      cy,
      pcx: cx,
      pcy: cy,
      vx: cut.vx * 0.4 + dir * rng.range(30, 80) * (1 - heavy * 0.6),
      vy: cut.vy * 0.4 - rng.range(20, 70) * (1 - heavy) + (cy - sy) * 0.2,
      ang: 0,
      pang: 0,
      av: rng.range(1.5, 6) * rng.sign() * Math.max(0.15, Math.min(1.2, 60 / Math.max(20, len))),
      lines,
      cols,
      radius,
      len,
      kind: s.kind,
      value: 0,
      age: 0,
    }
  }

  metrics(capY: number, sharpness: number): WorldMetrics {
    const n = this.locks.length
    if (!n) return { front: 0, maxCuttable: 0, avgLen: 0 }
    const tips: number[] = []
    let maxCuttable = 0
    let sum = 0
    for (const s of this.locks) {
      // 用"根 + 长度"当发梢高度（不受摆动影响，判定稳定）
      const tip = s.rootY + s.length
      tips.push(tip)
      sum += s.length
      if (HAIR_TYPES[s.kind].hardness <= sharpness && tip > maxCuttable) maxCuttable = tip
    }
    tips.sort((a, b) => a - b)
    void capY
    return { front: tips[Math.min(n - 1, Math.floor(n * 0.95))]!, maxCuttable, avgLen: sum / n }
  }

  /** 所有某种头发里、镜头内的随机一点（白发闪星用）。 */
  randomPointOf(kind: HairKind, camY: number, h: number): [number, number] | null {
    const list = this.locks.filter((s) => s.kind === kind)
    if (!list.length) return null
    const s = this.rng.pick(list)
    for (let tries = 0; tries < 6; tries++) {
      const i = this.rng.int(1, s.count - 1)
      const y = s.y[i]!
      if (y > camY && y < camY + h) return [s.x[i]! + s.curlAt(i, this.p.curlAmp), y]
    }
    return null
  }

  // ------------------------------------------------------------ 渲染

  render(r: Raster, camY: number, alpha: number): void {
    const H = r.h
    const top = camY - 40
    const bot = camY + H + 40
    const amp = this.p.curlAmp
    for (const s of this.locks) {
      const look = this.looks.get(s)!
      const n = s.count
      // 找可见的点范围（头发大致从上往下单调）
      let i0 = 0
      while (i0 < n - 1 && s.y[i0 + 1]! < top) i0++
      let i1 = i0
      while (i1 < n - 1 && s.y[i1]! < bot) i1++
      if (i1 <= i0) continue
      drawLockRibbon(r, s, look, i0, i1, camY, alpha, amp)
      if (s.kind === 'knot' && s.hitsLeft > 1) this.drawKnot(r, s, camY)
    }
    for (const pc of this.pieces) {
      const cx = pc.pcx + (pc.cx - pc.pcx) * alpha
      const cy = pc.pcy + (pc.cy - pc.pcy) * alpha - camY
      if (cy - pc.radius > H + 10 || cy + pc.radius < -10) continue
      const a = pc.pang + (pc.ang - pc.pang) * alpha
      const c = Math.cos(a)
      const sn = Math.sin(a)
      for (let k = 0; k < pc.lines.length; k++) {
        const L = pc.lines[k]!
        const C = pc.cols[k]!
        const m = L.length / 2
        let px = cx + L[0]! * c - L[1]! * sn
        let py = cy + L[0]! * sn + L[1]! * c
        for (let i = 1; i < m; i++) {
          const lx = L[i * 2]!
          const ly = L[i * 2 + 1]!
          const nx = cx + lx * c - ly * sn
          const ny = cy + lx * sn + ly * c
          r.line(px, py, nx, ny, C[i]!, 0, true)
          px = nx
          py = ny
        }
      }
    }
  }

  private drawKnot(r: Raster, s: Strand, camY: number): void {
    let idx = s.count - 1
    for (let i = 0; i < s.count; i++) {
      if (s.mat[i]! <= s.knotMat) {
        idx = i
        break
      }
    }
    const x = Math.round(s.x[idx]! + s.curlAt(idx, this.p.curlAmp))
    const y = Math.round(s.y[idx]! - camY)
    const big = s.hitsLeft >= 3 ? 3 : 2
    const flash = s.flash > 0
    for (let dy = -big; dy <= big; dy++) {
      for (let dx = -big - 1; dx <= big + 1; dx++) {
        if ((dx * dx) / ((big + 1) * (big + 1)) + (dy * dy) / (big * big) > 1) continue
        const lit = dx + dy < -big
        r.plot(x + dx, y + dy, flash ? FLASH : lit ? HAIR[3]! : (dx * 3 + dy) % 4 === 0 ? HAIR[2]! : HAIR[1]!)
      }
    }
    r.plot(x - 1, y - big + 1, HAIR[4]!)
  }
}

const HAIR_KINDS_SET = new Set(Object.keys(HAIR_TYPES))

/**
 * 细发丝 k 在材料坐标 mat 处的横向偏移。
 * 发根处 4 根收拢，往下散开；每根有自己的卷曲，互相交织；发梢收尖。
 */
function subOffset(look: LockLook, k: number, mat: number, fromRoot: number, fromTip: number): number {
  const spread = Math.min(1, fromRoot / 50) * Math.min(1, 0.35 + fromTip / 60)
  return look.sub[k]! * spread + Math.sin(mat * 0.05 + look.subPhase[k]!) * 1.1 * spread
}

/**
 * 细发丝颜色：根部深 → 发梢略亮；左边的细发丝受光亮一档、右边暗一档（整缕有体积）；
 * 卷曲朝左上的地方出现高光段；后层整体暗。钢丝发 slate、白发 head 色阶。
 */
function lockColor(s: Strand, look: LockLook, k: number, fromRoot: number, mat: number, live: boolean): number {
  const c = Math.cos(mat * s.curlFreq + s.curlPhase)
  const sideLight = k === 0 ? 1 : k === SUBS - 1 ? -1 : 0
  if (s.kind === 'steel') return STEEL[Math.max(1, Math.min(4, 2 + sideLight + (c > 0.7 ? 1 : 0)))]!
  if (s.kind === 'white') return WHITE[Math.max(1, Math.min(4, 2 + sideLight + (c > 0.6 ? 1 : 0)))]!
  let v = (fromRoot < 60 ? 0 : fromRoot < 400 ? 1 : 1.6) + look.shade + sideLight * 0.7
  if (s.layer === 0) v -= 0.8
  if (s.shiny && s.layer === 1 && fromRoot > 30 && k <= 1) {
    if (c > 0.93) return live && k === 0 && ((mat | 0) & 7) === 0 ? GLINT : HAIR[4]!
    if (c > 0.6) v += 1.2
  }
  const idx = Math.max(0, Math.min(3, Math.round(v)))
  return HAIR[idx]!
}

/** 缕的半宽（像素）：前层粗、后层细。 */
const HALF_W_FRONT = 3.4
const HALF_W_BACK = 2.6

/**
 * 把一缕头发画成有体积的"发带"：逐行填横向像素，左边受光亮、右边暗，
 * 中间有一丝丝竖向的暗线（发丝纹理），卷曲朝左上的地方出现高光段，发根和发梢收窄。
 * 发梢最后一小段散成几根细丝。
 */
function drawLockRibbon(r: Raster, s: Strand, look: LockLook, i0: number, i1: number, camY: number, alpha: number, amp: number): void {
  const buf = r.buf
  const RW = r.w
  const RH = r.h
  const n = s.count
  const tipMat = s.mat[n - 1]!
  const flash = s.flash > 0
  const back = s.layer === 0
  const baseW = back ? HALF_W_BACK : HALF_W_FRONT
  const steel = s.kind === 'steel'
  const white = s.kind === 'white'
  const ramp = steel ? STEEL : white ? WHITE : HAIR
  const seed = (look.shade * 1000) | 0
  let ax = 0
  let ay = 0
  let aw = 0
  let am = 0
  for (let i = i0; i <= i1; i++) {
    const mat = s.mat[i]!
    const fromRoot = s.emitted - mat
    const fromTip = mat - tipMat
    const x = s.px[i]! + (s.x[i]! - s.px[i]!) * alpha + s.curlAt(i, amp)
    const y = s.py[i]! + (s.y[i]! - s.py[i]!) * alpha - camY
    const w = baseW * Math.min(1, 0.45 + fromRoot / 60) * Math.min(1, fromTip / 46)
    if (i > i0) {
      let y0 = ay
      let y1 = y
      let x0 = ax
      let x1 = x
      let w0 = aw
      let w1 = w
      let m0 = am
      let m1 = mat
      if (y1 < y0) {
        ;[y0, y1] = [y1, y0]
        ;[x0, x1] = [x1, x0]
        ;[w0, w1] = [w1, w0]
        ;[m0, m1] = [m1, m0]
      }
      const ys = Math.max(0, Math.ceil(y0))
      const ye = Math.min(RH - 1, Math.floor(y1))
      const dy = y1 - y0
      if (dy < 0.5) {
        // 几乎横着的一段：退回画线
        r.line(x0, y0, x1, y1, ramp[1]!, 0, true)
      }
      for (let yy = ys; yy <= ye; yy++) {
        const t = dy > 0 ? (yy - y0) / dy : 0
        const cx = x0 + (x1 - x0) * t
        const hw = w0 + (w1 - w0) * t
        const mm = m0 + (m1 - m0) * t
        const fr = s.emitted - mm
        const c = Math.cos(mm * s.curlFreq + s.curlPhase)
        const shine = !back && s.shiny && fr > 30 && c > 0.72
        const hwi = Math.max(0, Math.round(hw))
        const xc = Math.round(cx)
        const row = yy * RW
        for (let dx = -hwi; dx <= hwi; dx++) {
          const px = xc + dx
          if (px < 0 || px >= RW) continue
          if (flash) {
            buf[row + px] = FLASH
            continue
          }
          const u = hwi > 0 ? dx / hwi : 0
          let v = u < -0.55 ? 2 : u > 0.45 ? 0 : 1
          if (fr < 70) v -= 1
          else if (fr > 700 && u < 0) v += 0.5
          // 发丝纹理：几条固定的竖向暗线
          if (((dx + seed) & 3) === 0 && hwi >= 2) v -= 1
          if (shine && u < 0.2) v = u < -0.55 ? (c > 0.95 ? 4 : 3) : Math.max(v, 2)
          if (back) v -= 1
          const idx = v < 0 ? 0 : v > 4 ? 4 : Math.round(v)
          buf[row + px] = ramp[steel || white ? Math.max(1, idx) : idx]!
        }
      }
    }
    ax = x
    ay = y
    aw = w
    am = mat
  }
  // 发梢：最后一段散成几根细丝
  const tx = s.x[n - 1]! + s.curlAt(n - 1, amp)
  const ty = s.y[n - 1]! - camY
  if (ty > -20 && ty < RH + 20 && n > 3) {
    const bx = s.x[n - 3]! + s.curlAt(n - 3, amp)
    const by = s.y[n - 3]! - camY
    for (let k = 0; k < SUBS; k++) {
      const spread = look.sub[k]! * 1.4
      const extra = look.subEnd[k]! * 0.35
      r.line(bx + look.sub[k]! * 0.6, by, tx + spread, ty + 4 - extra * 0.3 + (k % 2) * 3, back ? ramp[0]! : ramp[k === 0 ? 2 : 1]!, 0, true)
    }
  }
}
