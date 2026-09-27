// 技能树数值表（GDD 第 11 节）。纯数据，方便调参。
// 从中心"一把剪刀"向外展开 6 个分支，共 15 个节点；买了一个节点才露出和它相连的下一个。
// 价格 = 基础价 × 1.15^等级。

export type Branch = 'root' | 'sharp' | 'range' | 'rhythm' | 'harvest' | 'time' | 'combo'

export interface SkillDef {
  readonly id: string
  readonly branch: Branch
  /** 前置节点（买了它才露出这个） */
  readonly parent: string | null
  readonly base: number
  readonly max: number
  /** 在技能树上的位置：分支方向上的第几环（0 = 中心） */
  readonly ring: number
}

export const PRICE_GROWTH = 1.15

export const SKILLS: readonly SkillDef[] = [
  { id: 'root', branch: 'root', parent: null, base: 0, max: 1, ring: 0 },
  // 锋利
  { id: 'sharp', branch: 'sharp', parent: 'root', base: 4000, max: 1, ring: 1 },
  { id: 'crit', branch: 'sharp', parent: 'sharp', base: 2500, max: 5, ring: 2 },
  // 范围
  { id: 'range', branch: 'range', parent: 'root', base: 500, max: 6, ring: 1 },
  { id: 'thick', branch: 'range', parent: 'range', base: 2200, max: 3, ring: 2 },
  // 节奏
  { id: 'rhythm', branch: 'rhythm', parent: 'root', base: 700, max: 5, ring: 1 },
  { id: 'follow', branch: 'rhythm', parent: 'rhythm', base: 1800, max: 3, ring: 2 },
  // 收获
  { id: 'harvest', branch: 'harvest', parent: 'root', base: 400, max: 10, ring: 1 },
  { id: 'rare', branch: 'harvest', parent: 'harvest', base: 2600, max: 5, ring: 2 },
  { id: 'untangle', branch: 'harvest', parent: 'rare', base: 6000, max: 2, ring: 3 },
  // 时间
  { id: 'time', branch: 'time', parent: 'root', base: 900, max: 6, ring: 1 },
  { id: 'slow', branch: 'time', parent: 'time', base: 3500, max: 5, ring: 2 },
  { id: 'bigcap', branch: 'time', parent: 'slow', base: 12000, max: 3, ring: 3 },
  // 连击
  { id: 'grace', branch: 'combo', parent: 'root', base: 1000, max: 5, ring: 1 },
  { id: 'combomult', branch: 'combo', parent: 'grace', base: 3200, max: 5, ring: 2 },
]

export const SKILL_BY_ID: Readonly<Record<string, SkillDef>> = Object.fromEntries(SKILLS.map((s) => [s.id, s]))

/** 分支在技能树上的方向（弧度，0 = 右，向下为正）。 */
export const BRANCH_ANGLE: Record<Branch, number> = {
  root: 0,
  sharp: (-150 * Math.PI) / 180,
  range: (-90 * Math.PI) / 180,
  rhythm: (-30 * Math.PI) / 180,
  harvest: (30 * Math.PI) / 180,
  time: (90 * Math.PI) / 180,
  combo: (150 * Math.PI) / 180,
}

export function priceOf(id: string, level: number): number {
  const s = SKILL_BY_ID[id]!
  return Math.ceil(s.base * Math.pow(PRICE_GROWTH, level))
}

/** 技能对一局的影响（全部是在 JUICE / ROUND 基础值上的修正）。 */
export interface Upgrades {
  /** 剪刀半径 + */
  radius: number
  /** 剪断判定厚度 + */
  thickness: number
  /** 咔嚓间隔 × */
  snapMult: number
  /** 跟手速度 + */
  follow: number
  sharpness: number
  /** 暴击率（一刀收益 ×5） */
  crit: number
  /** 发丝倍率 */
  valueMult: number
  /** 白发出现权重 × */
  rareMult: number
  /** 打结发要剪的下数 − */
  knotEase: number
  /** 单局时长 + 秒 */
  time: number
  /** 生长速度 × */
  growthMult: number
  /** 泳帽线往下放宽的像素 */
  capLower: number
  /** 断连判定 + 秒 */
  grace: number
  /** 连击倍率 × */
  comboMult: number
}

export function upgradesFrom(levels: Record<string, number>): Upgrades {
  const L = (id: string): number => Math.min(levels[id] ?? 0, SKILL_BY_ID[id]?.max ?? 0)
  return {
    radius: L('range') * 3,
    thickness: L('thick') * 1.5,
    snapMult: 1 - L('rhythm') * 0.05,
    follow: L('follow') * 6,
    sharpness: 1 + L('sharp'),
    crit: L('crit') * 0.03,
    valueMult: 1 + L('harvest') * 0.25,
    rareMult: 1 + L('rare') * 0.5,
    knotEase: L('untangle'),
    time: L('time') * 5,
    growthMult: 1 - L('slow') * 0.06,
    capLower: L('bigcap') * 10,
    grace: L('grace') * 0.15,
    comboMult: 1 + L('combomult') * 0.1,
  }
}
