// 调色板：游戏里所有颜色只从这里取。
// 1) RAMPS：每种材质 5 档 [描边, 暗部, 中间, 亮部, 高光]，来源 docs/art-refs/palette_ramps.json
// 2) SCENE：场景主色，来源 docs/ART_STYLE.md「场景主色」表
// 不要在别处随手写新颜色；需要新颜色先改文档再改这里。

// <ramps>
// 由 scripts/gen-palette.mjs 从 docs/art-refs/palette_ramps.json 生成，不要手改这一段。
export const RAMPS = {
  steel: ['#2b3f7a', '#7d93cf', '#a8bdea', '#cddcfa', '#f4f8ff'],
  slate: ['#161d2c', '#2c364d', '#3d4a66', '#556585', '#7f91b4'],
  head: ['#2a3656', '#6f7c9e', '#a2aecb', '#cbd4e8', '#ffffff'],
  pink: ['#a83a66', '#e17aa2', '#f39fbf', '#ffc3da', '#ffe9f2'],
  glass: ['#1c4c98', '#58acd8', '#83cbe8', '#b3e4f5', '#ecfbff'],
  label: ['#8a5aa8', '#d4addf', '#e8cdf0', '#f5e5f9', '#ffffff'],
  capg: ['#46527a', '#95a2c3', '#b9c4dc', '#dce3f1', '#ffffff'],
  orange: ['#8a3c10', '#d8742a', '#ef983a', '#fbbd60', '#ffe2a0'],
  blade: ['#2c4f86', '#7aa4d6', '#b3d0f0', '#e0edfc', '#ffffff'],
  bladep: ['#9a3a66', '#e07aa0', '#f3a0c0', '#ffc6dc', '#ffffff'],
  lglass: ['#5a5498', '#aaa4dc', '#c6c0ee', '#e0dcfb', '#ffffff'],
  liquid: ['#5e4a96', '#9c86d6', '#b39ee4', '#cdbcf2', '#efe6ff'],
  pcap: ['#a8466f', '#e585ab', '#f6a8c6', '#ffc9de', '#ffecf4'],
  pband: ['#7a55a4', '#b595de', '#cbb2ee', '#dfd0f8', '#ffffff'],
  bcap: ['#2a58a6', '#6c9edd', '#92bbf0', '#bcd7fb', '#f0f7ff'],
  bband: ['#26529c', '#5f93d6', '#84b1ea', '#aacbf6', '#e6f1ff'],
  gold: ['#83440f', '#d6832a', '#eea43e', '#fbc866', '#fff0b0'],
  mglass: ['#3a78ab', '#86c0e4', '#aed9f2', '#d5ecfb', '#ffffff'],
  gem: ['#8e2a55', '#dc5a8a', '#f088ae', '#ffbdd4', '#ffffff'],
} as const
// </ramps>

export type RampName = keyof typeof RAMPS
/** 色阶下标：0 描边 1 暗部 2 中间 3 亮部 4 高光 */
export const OUTLINE = 0
export const DARK = 1
export const MID = 2
export const LIGHT = 3
export const SHINE = 4

export const SCENE = {
  /** 泳池瓷砖（青绿），亮 → 暗 */
  tile: ['#749e94', '#6d9c93', '#518076', '#297675'],
  /** 瓷砖缝 */
  grout: '#c3d2b6',
  /** 池边米黄 */
  poolside: '#fde3be',
  /** 暖粉地砖，亮 → 暗 */
  floor: ['#fee4c7', '#fbd6bb', '#d2b3a1'],
  /** 池边珊瑚粉线 */
  coral: '#e8a0a0',
  /** 池水，深 → 浅 */
  water: ['#3fb6c8', '#7fd6e0', '#d8f4f6'],
  /** 头发，由深到亮；最后一档是高光 */
  hair: ['#031313', '#0d2427', '#18323c', '#324143', '#819aab'],
  /** 头发高光点缀：蓝灰，偶尔纯白 */
  hairGlint: ['#b8c8e8', '#ffffff'],
  /** 金发闪星 */
  goldSpark: '#fff0b0',
  /** 彩虹发，沿发丝渐变 */
  rainbow: ['#ff7eb6', '#ffcc5c', '#7ee0a0', '#6ab8ff', '#b58cff'],
  /** UI 面板：奶白底、珊瑚粉边、深青文字 */
  ui: { panel: '#fff8ee', border: '#e8a0a0', text: '#1d4f55' },
} as const

// ---- 颜色工具 ----

const u32Cache = new Map<string, number>()

/** '#rrggbb' → ImageData 用的 Uint32（小端 ABGR）。 */
export function u32(hex: string, alpha = 255): number {
  const key = hex + alpha
  let v = u32Cache.get(key)
  if (v === undefined) {
    const n = parseInt(hex.slice(1), 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    v = ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0
    u32Cache.set(key, v)
  }
  return v
}

/** '#rrggbb' + 透明度 → 'rgba(...)'，给 Canvas 的 fillStyle 用。 */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** 拆出 r,g,b（0–255）。 */
export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
