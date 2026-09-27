// 头发种类数值表（GDD 第 9 节）。纯数据，方便调参。
// 阶段 2 只有 MVP 需要的 5 种：普通、打结、分叉、钢丝、白发。

export type HairKind = 'normal' | 'knot' | 'split' | 'steel' | 'white'

export interface HairType {
  readonly kind: HairKind
  /** 剪几下才断 */
  readonly hits: number
  /** 硬度：剪刀锋利度 < 硬度时剪不动（"铛"） */
  readonly hardness: number
  /** 发丝倍率（单根收益 = 基础值 × 这个 × 连击倍率） */
  readonly value: number
  /** 出现权重 */
  readonly weight: number
  /** 生长速度倍率 */
  readonly growth: number
  /** 是否算稀有（剪断时 40ms 顿帧 + 手机震 20ms） */
  readonly rare: boolean
}

export const HAIR_TYPES: Readonly<Record<HairKind, HairType>> = {
  normal: { kind: 'normal', hits: 1, hardness: 1, value: 1, weight: 80, growth: 1, rare: false },
  // 打结发：剪 3 下才断，掉落更多
  knot: { kind: 'knot', hits: 3, hardness: 1, value: 4, weight: 6, growth: 1, rare: false },
  // 分叉发：剪断后头上那截分裂成两根短发
  split: { kind: 'split', hits: 1, hardness: 1, value: 1, weight: 7, growth: 1.1, rare: false },
  // 钢丝发：锋利度不够剪不动；长得慢一点（否则开局就注定剪不到泳帽线）
  steel: { kind: 'steel', hits: 1, hardness: 2, value: 6, weight: 4, growth: 0.5, rare: false },
  // 白头发：发丝 ×10
  white: { kind: 'white', hits: 1, hardness: 1, value: 10, weight: 3, growth: 1, rare: true },
}

export const HAIR_KINDS = Object.keys(HAIR_TYPES) as HairKind[]

/** 按权重随机一种头发。r ∈ [0, 1)。 */
export function pickHairKind(r: number): HairKind {
  let total = 0
  for (const k of HAIR_KINDS) total += HAIR_TYPES[k].weight
  let x = r * total
  for (const k of HAIR_KINDS) {
    x -= HAIR_TYPES[k].weight
    if (x < 0) return k
  }
  return 'normal'
}

/** 一局的数值（GDD 第 5、12 节）。 */
export const ROUND = {
  /** 初始时长（秒） */
  duration: 45,
  /** 剪刀锋利度（之后由技能树提升） */
  sharpness: 1,
  /** 单根基础收益 */
  baseValue: 1,
  /** 泳帽线：画面上方约 20% 处 */
  capY: 128,
  /** 地板线 */
  floorY: 604,
  /** 生长随时间加快：速度 = 基础 × (1 + 已过秒数 / growthRampSec) */
  growthRampSec: 40,
  /** 爆表：这个比例以上的头发末端碰到地板线 */
  overflowFrac: 0.2,
  /** 爆表时发丝结算比例 */
  overflowPayout: 0.5,
  /** 剪到泳帽线以上要保持的秒数 */
  capHoldSec: 3,
  /** "再剪一会儿"：收益倍率、生长倍率 */
  extraValueMult: 2,
  extraGrowthMult: 1.6,
  /** 危险预兆开始的发量比例（0 = 泳帽线，1 = 爆表） */
  warnFrom: 0.65,
  /** 分叉发最多让头发总数涨到开局的几倍 */
  maxStrandMult: 1.6,
} as const
