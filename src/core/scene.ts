// 场景接口与切换。

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

export class SceneManager {
  current: Scene | null = null

  set(scene: Scene): void {
    this.current?.exit?.()
    this.current = scene
    scene.enter?.()
  }

  update(dt: number): void {
    this.current?.update(dt)
  }

  render(alpha: number): void {
    this.current?.render(alpha)
  }

  overlay(ctx: CanvasRenderingContext2D, alpha: number): void {
    this.current?.overlay?.(ctx, alpha)
  }
}
