// 画面：所有像素图先画进 360×640 的低分辨率画布，再按倍数放大到屏幕上。
//
// 缩放规则（决策记录见 docs/PROGRESS.md）：
// - 能放下 2 倍及以上时，用整数倍 + 最近邻放大（像素绝对整齐）。
// - 只能放下 1 倍时（常见的 1080p 横屏），1 倍太小。这时先用最近邻放大到
//   向上取整的整数倍，再平滑缩到刚好填满高度（"锐利缩放"），像素仍然等大、只是边缘略软。
// - 设置 scaleMode = 'integer' 可以强制整数倍。
// PC 横屏时画面居中，两侧由背后一张模糊放大的画面填充。
//
// 中文字不画进低分辨率画布（会糊成一团），而是在放大后的屏幕画布上按同一坐标系
// 直接高清绘制，见 overlay()。

import { SCENE } from '../art/palette'

const BACKDROP_DIM = SCENE.ui.text

export const W = 540
export const H = 960

export type ScaleMode = 'auto' | 'integer'

export class Screen {
  readonly low: HTMLCanvasElement
  readonly lctx: CanvasRenderingContext2D
  readonly view: HTMLCanvasElement
  readonly vctx: CanvasRenderingContext2D
  private readonly bg: HTMLCanvasElement
  private readonly bctx: CanvasRenderingContext2D
  private mid: HTMLCanvasElement | null = null
  private midCtx: CanvasRenderingContext2D | null = null
  private bgTimer = 0

  scaleMode: ScaleMode = 'auto'
  /** 每个逻辑像素占多少个设备像素 */
  scale = 1
  /** 当前是否在用锐利缩放（非整数倍） */
  sharp = false
  dpr = 1

  constructor(root: HTMLElement) {
    this.low = document.createElement('canvas')
    this.low.width = W
    this.low.height = H
    this.lctx = ctx2d(this.low, false)

    this.bg = document.createElement('canvas')
    this.bg.className = 'bg'
    this.bg.width = 18
    this.bg.height = 32
    this.bctx = ctx2d(this.bg, false)
    this.bctx.imageSmoothingEnabled = true
    root.appendChild(this.bg)

    this.view = document.createElement('canvas')
    this.view.className = 'view'
    this.vctx = ctx2d(this.view, false)
    root.appendChild(this.view)

    const onResize = (): void => this.resize()
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    this.resize()
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1
    const cw = window.innerWidth
    const ch = window.innerHeight
    const dw = Math.max(1, Math.round(cw * dpr))
    const dh = Math.max(1, Math.round(ch * dpr))
    const fit = Math.min(dw / W, dh / H)
    const k = Math.floor(fit)
    let s: number
    if (k >= 2 || (this.scaleMode === 'integer' && k >= 1)) {
      s = k
      this.sharp = false
    } else {
      s = fit
      this.sharp = true
    }
    const vw = Math.max(1, Math.round(W * s))
    const vh = Math.max(1, Math.round(H * s))
    this.view.width = vw
    this.view.height = vh
    const left = Math.floor((dw - vw) / 2)
    const top = Math.floor((dh - vh) / 2)
    this.view.style.width = `${vw / dpr}px`
    this.view.style.height = `${vh / dpr}px`
    this.view.style.left = `${left / dpr}px`
    this.view.style.top = `${top / dpr}px`
    this.scale = vw / W
    this.dpr = dpr

    if (this.sharp) {
      const m = Math.max(1, Math.ceil(fit))
      if (!this.mid || this.mid.width !== W * m) {
        this.mid = document.createElement('canvas')
        this.mid.width = W * m
        this.mid.height = H * m
        this.midCtx = ctx2d(this.mid, false)
      }
    } else {
      this.mid = null
      this.midCtx = null
    }
  }

  /** 把低分辨率画布放大画到屏幕上。 */
  present(): void {
    const v = this.vctx
    v.setTransform(1, 0, 0, 1, 0, 0)
    if (this.sharp && this.mid && this.midCtx) {
      this.midCtx.imageSmoothingEnabled = false
      this.midCtx.drawImage(this.low, 0, 0, this.mid.width, this.mid.height)
      v.imageSmoothingEnabled = true
      v.imageSmoothingQuality = 'high'
      v.drawImage(this.mid, 0, 0, this.view.width, this.view.height)
    } else {
      v.imageSmoothingEnabled = false
      v.drawImage(this.low, 0, 0, this.view.width, this.view.height)
    }
  }

  /** 返回屏幕画布，坐标系已换成逻辑像素（360×640），用来画高清文字。 */
  overlay(): CanvasRenderingContext2D {
    this.vctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    return this.vctx
  }

  /** 每隔一小段时间刷新背后的模糊画面（很便宜：只画一张 18×32 的小图）。 */
  tickBackdrop(dt: number, force = false): void {
    this.bgTimer -= dt
    if (this.bgTimer > 0 && !force) return
    this.bgTimer = 0.25
    const b = this.bctx
    b.globalAlpha = 1
    b.drawImage(this.low, 0, 0, this.bg.width, this.bg.height)
    // 压暗一点，让中间的游戏画面更突出（颜色取 UI 深青）
    b.globalAlpha = 0.32
    b.fillStyle = BACKDROP_DIM
    b.fillRect(0, 0, this.bg.width, this.bg.height)
    b.globalAlpha = 1
  }

  /** 屏幕坐标（clientX/Y）→ 逻辑坐标。 */
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.view.getBoundingClientRect()
    return {
      x: ((clientX - r.left) / r.width) * W,
      y: ((clientY - r.top) / r.height) * H,
    }
  }
}

function ctx2d(c: HTMLCanvasElement, alpha: boolean): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { alpha })
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D')
  ctx.imageSmoothingEnabled = false
  return ctx
}
