// 可设种子的随机数（mulberry32）。玩法里的随机都走这里，方便复现问题。

export class Rng {
  private s: number

  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.s = seed >>> 0
  }

  /** [0, 1) */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** [a, b) */
  range(a: number, b: number): number {
    return a + (b - a) * this.next()
  }

  /** [a, b] 整数 */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)] as T
  }

  /** 以 0 为中心的随机抖动：[-amount, amount) */
  jitter(amount: number): number {
    return (this.next() * 2 - 1) * amount
  }
}

export const rng = new Rng()
