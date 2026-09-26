// 主循环：逻辑固定 60Hz，渲染跟随屏幕刷新率，用 alpha 在上一步和这一步之间插值。

export const STEP = 1 / 60
/** 切后台回来时最多补这么多秒，防止一口气追太多步 */
const MAX_FRAME = 0.25

export class FixedLoop {
  private acc = 0
  private last = -1
  private running = false
  /** 逻辑步数（从启动开始计） */
  ticks = 0

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return
    this.running = true
    requestAnimationFrame(this.frame)
  }

  private frame = (t: number): void => {
    if (!this.running) return
    const now = t / 1000
    let delta = this.last < 0 ? STEP : now - this.last
    this.last = now
    if (delta > MAX_FRAME) delta = MAX_FRAME
    if (delta < 0) delta = 0
    this.acc += delta
    while (this.acc >= STEP) {
      this.update(STEP)
      this.ticks++
      this.acc -= STEP
    }
    this.render(this.acc / STEP, delta)
    requestAnimationFrame(this.frame)
  }
}
