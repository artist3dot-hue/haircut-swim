// 高清中文字：画在放大后的屏幕画布上（坐标仍是逻辑像素），不会糊。
// 字体优先 Google Fonts 的 "ZCOOL QingKe HuangYou"，加载失败就用系统字体兜底。

export const FONT_FAMILY =
  '"ZCOOL QingKe HuangYou", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif'

let fontReady = false

/** 预加载字体里会用到的字（Google Fonts 的中文字体按字切片下载）。最多等 timeoutMs。 */
export async function loadFonts(sample: string, timeoutMs = 3000): Promise<boolean> {
  if (!('fonts' in document)) return false
  const timeout = new Promise<false>((r) => setTimeout(() => r(false), timeoutMs))
  const load = document.fonts
    .load(`16px "ZCOOL QingKe HuangYou"`, sample)
    .then((faces) => faces.length > 0)
    .catch(() => false)
  fontReady = await Promise.race([load, timeout])
  return fontReady
}

export function isFontReady(): boolean {
  return fontReady
}

export interface HiTextOpts {
  /** 字号，单位逻辑像素 */
  size: number
  color: string
  /** 描边颜色 */
  stroke?: string
  /** 描边宽度，逻辑像素 */
  strokeWidth?: number
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  alpha?: number
}

export function hiText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, o: HiTextOpts): void {
  const a = o.alpha ?? 1
  if (a <= 0) return
  ctx.save()
  ctx.globalAlpha = a
  ctx.font = `${o.size}px ${FONT_FAMILY}`
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = o.baseline ?? 'alphabetic'
  if (o.stroke) {
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.strokeStyle = o.stroke
    ctx.lineWidth = (o.strokeWidth ?? 2) * 2
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = o.color
  ctx.fillText(text, x, y)
  ctx.restore()
}

export function hiTextWidth(ctx: CanvasRenderingContext2D, text: string, size: number): number {
  ctx.save()
  ctx.font = `${size}px ${FONT_FAMILY}`
  const w = ctx.measureText(text).width
  ctx.restore()
  return w
}
