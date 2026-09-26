// 所有界面文案集中在这里（简体中文）。

export const S = {
  gameTitle: '剪发去游泳',
  loading: '加载中…',
  test: {
    title: '剪发去游泳 · 阶段 0',
    icons: '已有图标（assets/icons）',
    palette: '调色板（palette_ramps.json）',
    scaleInt: (k: number) => `整数倍放大 ×${k}`,
    scaleSharp: (s: number) => `锐利缩放 ×${s.toFixed(2)}`,
    res: '逻辑分辨率 360×640',
  },
} as const

/** 所有会出现在屏幕上的中文字，启动时交给字体预加载。 */
export function allText(): string {
  const out: string[] = []
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v)
    else if (typeof v === 'function') out.push(String((v as (...a: number[]) => string)(0, 0)))
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x)
  }
  walk(S)
  return out.join('') + '0123456789'
}
