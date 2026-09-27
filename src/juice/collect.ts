// 吸入：断发落地后化成发丝光点，沿贝塞尔曲线加速飞向左上角的计数器。

import type { Rng } from '../core/rng'
import { SCENE } from '../art/palette'

interface Spark {
  x0: number
  y0: number
  cx: number
  cy: number
  t: number
  dur: number
  value: number
  /** 开始前的停顿（落地后稍微停一下再飞，更有"化成光点"的感觉） */
  delay: number
  seed: number
}

export class Collector {
  private list: Spark[] = []

  constructor(
    public tx: number,
    public ty: number,
  ) {}

  add(x: number, y: number, value: number, dur: number, rng: Rng, delay = 0): void {
    // 控制点：先往上、往外甩，再弯进计数器
    const cx = x + rng.range(-70, 70)
    const cy = Math.min(y, this.ty + 200) - rng.range(80, 220)
    this.list.push({ x0: x, y0: y, cx, cy, t: 0, dur, value, delay, seed: rng.next() })
  }

  get count(): number {
    return this.list.length
  }

  /** 返回这一步到达计数器的光点总价值和个数。 */
  update(dt: number): { value: number; n: number } {
    let value = 0
    let n = 0
    let w = 0
    for (const s of this.list) {
      if (s.delay > 0) {
        s.delay -= dt
        this.list[w++] = s
        continue
      }
      s.t += dt / s.dur
      if (s.t >= 1) {
        value += s.value
        n++
        continue
      }
      this.list[w++] = s
    }
    this.list.length = w
    return { value, n }
  }

  private pos(s: Spark, t: number): [number, number] {
    // 加速进入（吸入感）
    const k = t * t * (1.6 - 0.6 * t)
    const a = (1 - k) * (1 - k)
    const b = 2 * (1 - k) * k
    const c = k * k
    return [a * s.x0 + b * s.cx + c * this.tx, a * s.y0 + b * s.cy + c * this.ty]
  }

  render(ctx: CanvasRenderingContext2D): void {
    const [glint, white] = SCENE.hairGlint
    const trail = SCENE.hair[4]
    for (const s of this.list) {
      if (s.delay > 0) {
        // 停顿期间在原地闪一下
        const on = Math.floor(s.delay * 30 + s.seed * 10) % 2 === 0
        ctx.fillStyle = on ? white : glint
        ctx.fillRect(Math.round(s.x0), Math.round(s.y0) - 1, 1, 1)
        continue
      }
      // 拖尾：往回取几个点
      for (let k = 3; k >= 1; k--) {
        const [x, y] = this.pos(s, Math.max(0, s.t - k * 0.035))
        ctx.fillStyle = k === 1 ? glint : trail
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
      }
      const [x, y] = this.pos(s, s.t)
      const rx = Math.round(x)
      const ry = Math.round(y)
      ctx.fillStyle = glint
      ctx.fillRect(rx - 1, ry, 3, 1)
      ctx.fillRect(rx, ry - 1, 1, 3)
      ctx.fillStyle = white
      ctx.fillRect(rx, ry, 1, 1)
    }
  }
}
