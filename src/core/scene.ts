// 场景接口与切换。切换时有一个像素抖动（Bayer 4×4）的擦除过渡：
// 旧场景从上往下被深青色一格格盖住 → 换场景 → 新场景从上往下露出来。

import { SCENE } from '../art/palette'

export interface Scene {
  readonly name: string
  enter?(): void
  exit?(): void
  /** 固定步长逻辑（1/60 秒） */
  update(dt: number): void
  /** 画进低分辨率画布；alpha 是插值系数 */
  render(alpha: number): void
  /** 高清层（中文字等），坐标仍是逻辑像素 */
  overlay?(ctx: CanvasRenderingContext2D, alpha: number): void
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
/** 过渡一半的时长（盖住 / 露出各这么久） */
const HALF = 0.32

export class SceneManager {
  current: Scene | null = null
  private next: (() => Scene) | null = null
  /** 0 = 没盖，1 = 全盖住 */
  private cover = 0
  private dir: 0 | 1 | -1 = 0
  private patterns: Array<CanvasPattern | null> = []
  onSwitch: (() => void) | null = null

  /** 立刻切换（启动时用）。 */
  set(scene: Scene): void {
    this.current?.exit?.()
    this.current = scene
    scene.enter?.()
  }

  /** 带过渡动画切换。 */
  go(factory: () => Scene): void {
    if (this.dir !== 0) return
    this.next = factory
    this.dir = 1
    this.onSwitch?.()
  }

  get transitioning(): boolean {
    return this.dir !== 0
  }

  update(dt: number): void {
    if (this.dir === 1) {
      this.cover = Math.min(1, this.cover + dt / HALF)
      if (this.cover >= 1 && this.next) {
        this.set(this.next())
        this.next = null
        this.dir = -1
      }
      return
    }
    if (this.dir === -1) {
      this.cover = Math.max(0, this.cover - dt / HALF)
      if (this.cover <= 0) this.dir = 0
    }
    this.current?.update(dt)
  }

  render(alpha: number, ctx: CanvasRenderingContext2D): void {
    this.current?.render(alpha)
    if (this.cover > 0) this.drawCover(ctx)
  }

  overlay(ctx: CanvasRenderingContext2D, alpha: number): void {
    if (this.cover > 0.5) return
    this.current?.overlay?.(ctx, alpha)
  }

  /** 从上往下的抖动擦除：每 8 像素一条，越靠上盖得越多。 */
  private drawCover(ctx: CanvasRenderingContext2D): void {
    if (!this.patterns.length) this.buildPatterns(ctx)
    const w = ctx.canvas.width
    const h = ctx.canvas.height
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    for (let y = 0; y < h; y += 8) {
      const k = Math.max(0, Math.min(1, this.cover * 1.6 - (y / h) * 0.6))
      const level = Math.round(k * 16)
      if (level <= 0) continue
      const p = this.patterns[level]
      if (!p) continue
      ctx.fillStyle = p
      ctx.fillRect(0, y, w, 8)
    }
    ctx.restore()
  }

  private buildPatterns(ctx: CanvasRenderingContext2D): void {
    const color = SCENE.ui.text
    for (let level = 0; level <= 16; level++) {
      const c = document.createElement('canvas')
      c.width = 4
      c.height = 4
      const g = c.getContext('2d')
      if (!g) {
        this.patterns.push(null)
        continue
      }
      g.fillStyle = color
      for (let i = 0; i < 16; i++) if (BAYER[i]! < level) g.fillRect(i % 4, i >> 2, 1, 1)
      this.patterns.push(ctx.createPattern(c, 'repeat'))
    }
  }
}
