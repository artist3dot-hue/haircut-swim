// 一根头发：从头皮挂下来的一串点（Verlet 链）。
//
// - 物理：Verlet 积分 + "跟随前一点"的长度约束（FTL，不会被重力拉长），根部钉在头皮上
// - 生长：根部那一段的静止长度不断变长，长到 2 倍段长时在根部插入一个新点（"从根部送出"）
// - 材料坐标 mat：每个点出生时记下"当时一共长出了多少"，之后不再改变。
//   渲染时按 mat 加正弦卷曲偏移，所以剪断时断下来的那截形状不会跳。

export interface StrandParams {
  segLen: number
  gravity: number
  damping: number
  wind: number
  curlAmp: number
  floorY: number
  maxLen: number
}

import type { HairKind } from '../data/hair'

let scratchX = new Float64Array(256)
let scratchY = new Float64Array(256)

export class Strand {
  /** 头发种类（见 src/data/hair.ts） */
  kind: HairKind = 'normal'
  /** 还要剪几下才断（打结发） */
  hitsLeft = 1
  /** 打结的位置（材料坐标） */
  knotMat = 0
  /** 刚被剪了一下的闪光时间（打结发、钢丝发） */
  flash = 0
  x: number[] = []
  y: number[] = []
  px: number[] = []
  py: number[] = []
  /** rest[i]：点 i 到点 i+1 的静止长度 */
  rest: number[] = []
  /** 材料坐标（越靠根越大） */
  mat: number[] = []
  /** 根部累计送出的长度（= 根点的 mat） */
  emitted = 0
  /** 当前总长 */
  length = 0

  constructor(
    readonly rootX: number,
    readonly rootY: number,
    /** 0 后层 1 前层 */
    readonly layer: 0 | 1,
    readonly phase: number,
    readonly curlFreq: number,
    readonly curlPhase: number,
    /** 是否带高光段（每 3–5 根一根） */
    readonly shiny: boolean,
    /** 前层里少数近景头发画 2px */
    readonly thick: boolean,
    startLen: number,
    segLen: number,
  ) {
    this.emitted = startLen
    const n = Math.max(2, Math.round(startLen / segLen) + 1)
    const step = startLen / (n - 1)
    for (let i = 0; i < n; i++) {
      const yy = rootY + i * step
      this.x.push(rootX)
      this.y.push(yy)
      this.px.push(rootX)
      this.py.push(yy)
      this.mat.push(startLen - i * step)
      if (i < n - 1) this.rest.push(step)
    }
    this.length = startLen
  }

  get count(): number {
    return this.x.length
  }

  get tipY(): number {
    return this.y[this.y.length - 1]!
  }

  /** 生长：根部送出 amount 像素。 */
  grow(amount: number, p: StrandParams): void {
    if (amount <= 0 || this.length >= p.maxLen) return
    amount = Math.min(amount, p.maxLen - this.length)
    this.emitted += amount
    this.length += amount
    this.mat[0] = this.emitted
    this.rest[0]! += amount
    // 根段太长就在根部这一段里插入新点：新点离下一个点正好一段长，
    // 所以一次长很多也会被切成一节一节（每节有自己的材料坐标，卷曲才连续）
    while (this.rest[0]! >= p.segLen * 2) {
      const r0 = this.rest[0]!
      const dx = this.x[1]! - this.x[0]!
      const dy = this.y[1]! - this.y[0]!
      const k = (r0 - p.segLen) / r0
      const nx = this.x[0]! + dx * k
      const ny = this.y[0]! + dy * k
      this.x.splice(1, 0, nx)
      this.y.splice(1, 0, ny)
      this.px.splice(1, 0, nx)
      this.py.splice(1, 0, ny)
      this.mat.splice(1, 0, this.mat[1]! + p.segLen)
      this.rest[0] = r0 - p.segLen
      this.rest.splice(1, 0, p.segLen)
    }
  }

  /** 一步物理。t：场景时间；push：剪刀对头发的推动（可为 null）。 */
  step(dt: number, t: number, p: StrandParams, push: Push | null): void {
    const n = this.x.length
    const back = this.layer === 0
    const damp = back ? p.damping * 0.99 : p.damping
    const g = p.gravity * dt * dt
    const windBase = p.wind * (back ? 0.6 : 1) * dt * dt
    const wt = t * (back ? 0.55 : 0.8) + this.phase
    for (let i = 1; i < n; i++) {
      const x = this.x[i]!
      const y = this.y[i]!
      let vx = (x - this.px[i]!) * damp
      let vy = (y - this.py[i]!) * damp
      // 风：沿发丝往下相位滞后，看起来像波浪往下传
      const w = Math.sin(wt - i * 0.18) + 0.4 * Math.sin(wt * 2.3 + i * 0.07)
      vx += windBase * w * Math.min(1, i / 8)
      vy += g
      this.px[i] = x
      this.py[i] = y
      this.x[i] = x + vx
      this.y[i] = y + vy
    }
    if (push) push.apply(this)
    // 长度约束（DFTL，Müller 2012）：从根往下，每个点放到"前一点 + 方向 × 静止长度"，
    // 记下每个点被挪了多少（d），然后用"下一个点的修正量"去修正这个点的速度。
    // 这样长链（上百个点）也不会慢慢积攒能量、缩成一团。
    const dxs = scratchX.length >= n ? scratchX : (scratchX = new Float64Array(n * 2))
    const dys = scratchY.length >= n ? scratchY : (scratchY = new Float64Array(n * 2))
    dxs[0] = 0
    dys[0] = 0
    for (let i = 1; i < n; i++) {
      const ax = this.x[i - 1]!
      const ay = this.y[i - 1]!
      const dx = this.x[i]! - ax
      const dy = this.y[i]! - ay
      const d = Math.hypot(dx, dy) || 1e-6
      const r = this.rest[i - 1]!
      const nx = ax + (dx / d) * r
      const ny = ay + (dy / d) * r
      dxs[i] = nx - this.x[i]!
      dys[i] = ny - this.y[i]!
      this.x[i] = nx
      this.y[i] = ny
    }
    const sDamp = 0.9
    const maxV = 40
    for (let i = 1; i < n; i++) {
      const cx = i + 1 < n ? dxs[i + 1]! : 0
      const cy = i + 1 < n ? dys[i + 1]! : 0
      // 隐式速度 = x - px；目标速度 = (新位置 - 旧位置) - s·d(i+1)
      this.px[i]! += sDamp * cx
      this.py[i]! += sDamp * cy
      // 保险：限制单步速度
      const vx = this.x[i]! - this.px[i]!
      const vy = this.y[i]! - this.py[i]!
      const v = Math.hypot(vx, vy)
      if (v > maxV) {
        this.px[i] = this.x[i]! - (vx / v) * maxV
        this.py[i] = this.y[i]! - (vy / v) * maxV
      }
      // 地板：躺在地上，带摩擦
      if (this.y[i]! > p.floorY) {
        this.y[i] = p.floorY
        this.py[i] = p.floorY
        this.px[i] = this.x[i]! - (this.x[i]! - this.px[i]!) * 0.4
      }
    }
  }

  /** 卷曲偏移（只在水平方向，越靠根越小）。 */
  curlAt(i: number, amp: number): number {
    const m = this.mat[i]!
    const fromRoot = this.emitted - m
    const taper = Math.min(1, fromRoot / 36)
    return amp * taper * Math.sin(m * this.curlFreq + this.curlPhase)
  }

  /**
   * 剪断：在第 seg 段（点 seg 到 seg+1）的 t 处剪开。
   * 返回断下来那截的渲染形状（世界坐标，含卷曲），留在头上的部分变短。
   */
  cut(seg: number, t: number, curlAmp: number, alpha = 1): { xs: number[]; ys: number[]; mats: number[]; vx: number; vy: number } {
    const n = this.x.length
    const ix = (i: number): number => this.px[i]! + (this.x[i]! - this.px[i]!) * alpha
    const iy = (i: number): number => this.py[i]! + (this.y[i]! - this.py[i]!) * alpha
    const cx = this.x[seg]! + (this.x[seg + 1]! - this.x[seg]!) * t
    const cy = this.y[seg]! + (this.y[seg + 1]! - this.y[seg]!) * t
    const cm = this.mat[seg]! + (this.mat[seg + 1]! - this.mat[seg]!) * t
    const cpx = this.px[seg]! + (this.px[seg + 1]! - this.px[seg]!) * t
    const cpy = this.py[seg]! + (this.py[seg + 1]! - this.py[seg]!) * t

    // 断下来的形状（按当前渲染位置冻结）
    const xs: number[] = []
    const ys: number[] = []
    const mats: number[] = []
    const cutCurl = curlAmp * Math.min(1, (this.emitted - cm) / 36) * Math.sin(cm * this.curlFreq + this.curlPhase)
    xs.push(cpx + (cx - cpx) * alpha + cutCurl)
    ys.push(cpy + (cy - cpy) * alpha)
    mats.push(cm)
    let vx = 0
    let vy = 0
    for (let i = seg + 1; i < n; i++) {
      xs.push(ix(i) + this.curlAt(i, curlAmp))
      ys.push(iy(i))
      mats.push(this.mat[i]!)
      vx += this.x[i]! - this.px[i]!
      vy += this.y[i]! - this.py[i]!
    }
    const k = Math.max(1, n - seg - 1)

    // 留在头上的部分
    this.x.length = seg + 1
    this.y.length = seg + 1
    this.px.length = seg + 1
    this.py.length = seg + 1
    this.mat.length = seg + 1
    this.rest.length = seg
    const r = Math.max(1, Math.hypot(cx - this.x[seg]!, cy - this.y[seg]!))
    this.x.push(cx)
    this.y.push(cy)
    this.px.push(cpx)
    this.py.push(cpy)
    this.mat.push(cm)
    this.rest.push(r)
    let len = 0
    for (const v of this.rest) len += v
    this.length = len
    return { xs, ys, mats, vx: (vx / k) * 60, vy: (vy / k) * 60 }
  }
}

/** 剪刀对附近头发的推动：往两边轻轻分开 + 被剪刀带着走一点。 */
export class Push {
  cx = 0
  cy = 0
  halfW = 0
  halfH = 0
  /** 剪刀这一步的位移 */
  mvx = 0
  mvy = 0
  strength = 0.3
  /** 刃的半长：刃正下方的头发不拨开（否则剪刀停着时头发全被拨走、剪不到） */
  blade = 0

  apply(s: Strand): void {
    const n = s.x.length
    // 根部附近几段不推（头皮钉着）
    for (let i = 2; i < n; i++) {
      const dx = s.x[i]! - this.cx
      const dy = s.y[i]! - this.cy
      const ax = Math.abs(dx) / this.halfW
      const ay = Math.abs(dy) / this.halfH
      if (ax >= 1 || ay >= 1) continue
      const f = (1 - ay) * (1 - ax * 0.6) * this.strength
      // 被带着走
      s.x[i]! += this.mvx * f * 0.5
      s.y[i]! += this.mvy * f * 0.3
      // 往两边分开一点（剪刀的刃像梳子一样拨开头发）
      // 只拨开刃尖外侧的头发，且只在剪刀移动时
      if (Math.abs(dx) > this.blade) s.x[i]! += Math.sign(dx || 1) * f * 0.9 * Math.min(1, Math.hypot(this.mvx, this.mvy) / 3)
    }
  }
}
