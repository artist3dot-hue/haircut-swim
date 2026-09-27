// 1px 碎屑粒子：剪断口蹦出的发屑、落地时的小尘。直接画进头发的像素光栅。

import type { Raster } from '../hair/raster'
import type { Rng } from '../core/rng'

export class Particles {
  private x = new Float32Array(0)
  private y = new Float32Array(0)
  private vx = new Float32Array(0)
  private vy = new Float32Array(0)
  private life = new Float32Array(0)
  private col = new Uint32Array(0)
  private grav = new Float32Array(0)
  count = 0

  constructor(private readonly max = 2000) {
    this.x = new Float32Array(max)
    this.y = new Float32Array(max)
    this.vx = new Float32Array(max)
    this.vy = new Float32Array(max)
    this.life = new Float32Array(max)
    this.col = new Uint32Array(max)
    this.grav = new Float32Array(max)
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, color: number, gravity = 420): void {
    let i = this.count
    if (i >= this.max) i = (Math.random() * this.max) | 0
    else this.count++
    this.x[i] = x
    this.y[i] = y
    this.vx[i] = vx
    this.vy[i] = vy
    this.life[i] = life
    this.col[i] = color
    this.grav[i] = gravity
  }

  /** 从 (x,y) 向四周喷 n 个碎屑。 */
  burst(x: number, y: number, n: number, speed: number, colors: readonly number[], rng: Rng, up = 0.6): void {
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, Math.PI * 2)
      const v = speed * rng.range(0.35, 1)
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v - speed * up, rng.range(0.35, 0.8), rng.pick(colors))
    }
  }

  update(dt: number, floorY: number): void {
    let w = 0
    for (let i = 0; i < this.count; i++) {
      const l = this.life[i]! - dt
      if (l <= 0) continue
      let vy = this.vy[i]! + this.grav[i]! * dt
      let vx = this.vx[i]! * Math.pow(0.3, dt)
      let y = this.y[i]! + vy * dt
      if (y > floorY) {
        y = floorY
        vy *= -0.3
        vx *= 0.5
      }
      this.x[w] = this.x[i]! + vx * dt
      this.y[w] = y
      this.vx[w] = vx
      this.vy[w] = vy
      this.life[w] = l
      this.col[w] = this.col[i]!
      this.grav[w] = this.grav[i]!
      w++
    }
    this.count = w
  }

  render(r: Raster): void {
    for (let i = 0; i < this.count; i++) r.plot(this.x[i]!, this.y[i]!, this.col[i]!)
  }
}
