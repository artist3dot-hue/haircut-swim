// 像素光栅：直接往 ImageData 的 Uint32 视图里画 1px 线和点，比 Canvas 画几千条线快得多，
// 而且保证像素对齐、没有抗锯齿。

export class Raster {
  readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly img: ImageData
  readonly buf: Uint32Array

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = w
    this.canvas.height = h
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('浏览器不支持 Canvas 2D')
    this.ctx = ctx
    this.img = ctx.createImageData(w, h)
    this.buf = new Uint32Array(this.img.data.buffer)
  }

  clear(): void {
    this.buf.fill(0)
  }

  /** 画完后调用，把像素推到 canvas 上。 */
  flush(): void {
    this.ctx.putImageData(this.img, 0, 0)
  }

  plot(x: number, y: number, c: number): void {
    x |= 0
    y |= 0
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.buf[y * this.w + x] = c
  }

  /**
   * Bresenham 线。thick：右侧再画一列 c2（左上受光，右边暗一点，做出 2px 发丝的体积）。
   * skipFirst：不画起点（折线连续画时避免重复点）。
   */
  line(x0: number, y0: number, x1: number, y1: number, c: number, c2 = 0, skipFirst = false): void {
    x0 = Math.round(x0)
    y0 = Math.round(y0)
    x1 = Math.round(x1)
    y1 = Math.round(y1)
    const w = this.w
    const h = this.h
    const buf = this.buf
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    let first = true
    for (;;) {
      if (!(first && skipFirst) && x0 >= 0 && y0 >= 0 && x0 < w && y0 < h) {
        const k = y0 * w + x0
        buf[k] = c
        if (c2 && x0 + 1 < w) buf[k + 1] = c2
      }
      first = false
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
}
