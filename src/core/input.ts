// 输入：鼠标 / 手指统一成指针，坐标换算成逻辑像素。
// PC 上不用按住，移动鼠标剪刀就跟着走（参考 Nodebuster：只移动、攻击自动）；手机上手指拖动。

import type { Screen } from './screen'

export interface Tap {
  x: number
  y: number
}

export class Input {
  /** 逻辑坐标，可能超出 0–360 / 0–640（指针在画面外） */
  x = 180
  y = 420
  /** 是否见过指针（还没动过鼠标时剪刀停在默认位置） */
  seen = false
  down = false
  pointerType = 'mouse'
  /** 最近一次指针移动的时间（performance.now 毫秒） */
  lastMove = 0
  private taps: Tap[] = []
  private keys: string[] = []
  private gestureHandlers: Array<() => void> = []

  constructor(private readonly screen: Screen) {
    const move = (e: PointerEvent): void => {
      const p = this.screen.toLogical(e.clientX, e.clientY)
      this.x = p.x
      this.y = p.y
      this.seen = true
      this.pointerType = e.pointerType
      this.lastMove = performance.now()
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', (e) => {
      move(e)
      this.down = true
      this.taps.push({ x: this.x, y: this.y })
      this.fireGesture()
    })
    const up = (e: PointerEvent): void => {
      this.down = false
      // 手指抬起后剪刀留在原地；鼠标离开窗口也一样
      if (e.pointerType !== 'mouse') this.lastMove = performance.now()
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('keydown', (e) => {
      this.keys.push(e.key)
      this.fireGesture()
    })
  }

  /** 取走自上次以来的点击（逻辑坐标）。 */
  consumeTaps(): Tap[] {
    const t = this.taps
    this.taps = []
    return t
  }

  consumeKeys(): string[] {
    const k = this.keys
    this.keys = []
    return k
  }

  /** 第一次用户手势时回调（用来解锁音频）。 */
  onGesture(fn: () => void): void {
    this.gestureHandlers.push(fn)
  }

  private fireGesture(): void {
    for (const fn of this.gestureHandlers) fn()
  }
}
