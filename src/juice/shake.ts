// 震屏（只在规定场合用：大招、连击档位、Boss 受击）。偏移取整，保证像素对齐。

export class Shake {
  private amp = 0
  private time = 0
  private dur = 1
  x = 0
  y = 0

  kick(amp: number, dur: number): void {
    if (amp >= this.amp * (this.time / this.dur)) {
      this.amp = amp
      this.time = dur
      this.dur = dur
    }
  }

  update(dt: number): void {
    if (this.time <= 0) {
      this.x = 0
      this.y = 0
      return
    }
    this.time -= dt
    const k = Math.max(0, this.time / this.dur)
    const a = this.amp * k * k
    this.x = Math.round((Math.random() * 2 - 1) * a)
    this.y = Math.round((Math.random() * 2 - 1) * a)
  }
}
