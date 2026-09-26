// 帧时间统计：验证脚本通过 window.__hs.perf() 读取；URL 带 ?perf 时每 5 秒在控制台打印。

const N = 240

export class PerfStats {
  private frames = new Float32Array(N)
  private cpu = new Float32Array(N)
  private i = 0
  private count = 0
  private logTimer = 0
  private readonly logEnabled = new URLSearchParams(location.search).has('perf')
  /** 累计：用于验证脚本算整段平均 */
  totalFrames = 0
  totalFrameMs = 0
  totalCpuMs = 0
  worstFrameMs = 0

  record(frameDt: number, cpuMs: number): void {
    const ms = frameDt * 1000
    this.frames[this.i] = ms
    this.cpu[this.i] = cpuMs
    this.i = (this.i + 1) % N
    this.count = Math.min(this.count + 1, N)
    this.totalFrames++
    this.totalFrameMs += ms
    this.totalCpuMs += cpuMs
    if (this.totalFrames > 30 && ms > this.worstFrameMs) this.worstFrameMs = ms
    if (this.logEnabled) {
      this.logTimer += frameDt
      if (this.logTimer >= 5) {
        this.logTimer = 0
        const s = this.snapshot()
        console.log(`[perf] 平均帧时间 ${s.avgFrameMs.toFixed(2)}ms（${s.fps.toFixed(0)}fps），逻辑+绘制 ${s.avgCpuMs.toFixed(2)}ms`)
      }
    }
  }

  snapshot(): { avgFrameMs: number; avgCpuMs: number; fps: number; worstFrameMs: number } {
    let f = 0
    let c = 0
    for (let k = 0; k < this.count; k++) {
      f += this.frames[k]!
      c += this.cpu[k]!
    }
    const n = Math.max(1, this.count)
    const avgFrameMs = f / n
    return { avgFrameMs, avgCpuMs: c / n, fps: avgFrameMs > 0 ? 1000 / avgFrameMs : 0, worstFrameMs: this.worstFrameMs }
  }

  resetTotals(): void {
    this.totalFrames = 0
    this.totalFrameMs = 0
    this.totalCpuMs = 0
    this.worstFrameMs = 0
  }
}
