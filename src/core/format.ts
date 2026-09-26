// 大数字格式化：999 → 1.23K → 4.56M → 7.89B → 之后用 1.23e12 这种科学计数。
// 保留 3 位有效数字（1.23K / 12.3K / 123K）。

const SUFFIX = ['', 'K', 'M', 'B'] as const

export function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '∞'
  const neg = n < 0
  let v = Math.abs(n)
  let out: string
  if (v < 1000) {
    out = String(Math.floor(v))
  } else if (v < 1e12) {
    let tier = Math.floor(Math.log10(v) / 3)
    let scaled = v / 10 ** (tier * 3)
    // 999.6K 这种四舍五入后会变成 1000K，进位到下一档
    if (Number(scaled.toPrecision(3)) >= 1000) {
      tier += 1
      scaled /= 1000
    }
    if (tier >= SUFFIX.length) {
      out = sci(v)
    } else {
      out = trimSig(scaled) + SUFFIX[tier]
    }
  } else {
    out = sci(v)
  }
  return neg ? '-' + out : out
}

function trimSig(x: number): string {
  if (x >= 100) return x.toFixed(0)
  if (x >= 10) return x.toFixed(1)
  return x.toFixed(2)
}

function sci(v: number): string {
  const e = Math.floor(Math.log10(v))
  let m = v / 10 ** e
  if (Number(m.toFixed(2)) >= 10) {
    return (m / 10).toFixed(2) + 'e' + (e + 1)
  }
  return m.toFixed(2) + 'e' + e
}

/** 秒数 → "45" 或 "1:05"。 */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  if (s < 60) return String(s)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
