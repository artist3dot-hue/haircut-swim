// 图像注册表：游戏里所有图像都通过名字从这里取。
//
// - 已有图标：assets/icons/*.png → 名字 "icon.<文件名>"（锚点在中心）
// - 代码画的像素图：各模块在启动时 registerCanvas("scissors.open3", canvas)
// - 以后换正式美术：把 png 放进 assets/sprites/，文件名就是注册名（例如
//   assets/sprites/scissors.open3.png），它会自动顶替同名的代码占位图，不用改代码。

export interface Sprite {
  readonly name: string
  readonly img: CanvasImageSource
  readonly w: number
  readonly h: number
  /** 锚点：drawSprite 传入的 x,y 对应图内这个位置 */
  readonly ax: number
  readonly ay: number
  /** 是否来自 assets/sprites/ 的正式图 */
  readonly override: boolean
}

const registry = new Map<string, Sprite>()
const overrideImages = new Map<string, HTMLImageElement>()

const iconUrls = import.meta.glob('/assets/icons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const overrideUrls = import.meta.glob('/assets/sprites/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

function baseName(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1)
  return file.replace(/\.png$/i, '')
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`图片加载失败：${url}`))
    img.src = url
  })
}

/** 启动时调用：加载已有图标和 assets/sprites/ 里的正式图。 */
export async function loadSpriteFiles(): Promise<void> {
  const jobs: Array<Promise<void>> = []
  for (const [path, url] of Object.entries(overrideUrls)) {
    jobs.push(loadImage(url).then((img) => void overrideImages.set(baseName(path), img)))
  }
  for (const [path, url] of Object.entries(iconUrls)) {
    const name = `icon.${baseName(path)}`
    jobs.push(
      loadImage(url).then((img) => {
        registry.set(name, { name, img, w: img.width, h: img.height, ax: img.width >> 1, ay: img.height >> 1, override: false })
      }),
    )
  }
  await Promise.all(jobs)
  // 正式图也可以顶替图标
  for (const [name, img] of overrideImages) {
    const cur = registry.get(name)
    if (cur) registry.set(name, { ...cur, img, w: img.width, h: img.height, override: true })
  }
}

/** 注册一张代码画的图。若 assets/sprites/ 里有同名 png，则用 png。 */
export function registerCanvas(name: string, canvas: HTMLCanvasElement, ax = 0, ay = 0): Sprite {
  const ov = overrideImages.get(name)
  const s: Sprite = ov
    ? { name, img: ov, w: ov.width, h: ov.height, ax, ay, override: true }
    : { name, img: canvas, w: canvas.width, h: canvas.height, ax, ay, override: false }
  registry.set(name, s)
  return s
}

export function hasSprite(name: string): boolean {
  return registry.has(name)
}

export function sprite(name: string): Sprite {
  const s = registry.get(name)
  if (!s) throw new Error(`没有注册的图：${name}`)
  return s
}

export function spriteNames(prefix = ''): string[] {
  return [...registry.keys()].filter((n) => n.startsWith(prefix)).sort()
}

export interface DrawOpts {
  /** 整数倍放大 */
  scale?: number
  alpha?: number
  flipX?: boolean
}

/** 按锚点把图画到整数像素上。 */
export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite | string, x: number, y: number, o: DrawOpts = {}): void {
  const sp = typeof s === 'string' ? sprite(s) : s
  const k = o.scale ?? 1
  const dx = Math.round(x) - sp.ax * k
  const dy = Math.round(y) - sp.ay * k
  const a = o.alpha ?? 1
  if (a <= 0) return
  const prevA = ctx.globalAlpha
  if (a !== 1) ctx.globalAlpha = prevA * a
  if (o.flipX) {
    ctx.save()
    ctx.translate(dx + sp.w * k, dy)
    ctx.scale(-1, 1)
    ctx.drawImage(sp.img, 0, 0, sp.w * k, sp.h * k)
    ctx.restore()
  } else {
    ctx.drawImage(sp.img, dx, dy, sp.w * k, sp.h * k)
  }
  if (a !== 1) ctx.globalAlpha = prevA
}

/** 新建一张像素画布（给代码画图用）。 */
export function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D')
  ctx.imageSmoothingEnabled = false
  return { c, ctx }
}
