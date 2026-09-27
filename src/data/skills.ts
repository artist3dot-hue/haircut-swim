// 技能树（镜子）和奖牌商店的数值表（DESIGN_V2 第 4 节）。纯数据，方便调参。
// 技能树：从中心"一双手"向外展开 6 个分支；买了一个节点才露出和它相连的下一个。
// 价格 = 基础价 × 1.25^等级。去游泳（转生）时技能树清零，奖牌商店的加成永久保留。

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

export const PRICE_GROWTH = 1.25

export const SKILLS: readonly SkillDef[] = [
  { id: 'root', branch: 'root', parent: null, base: 0, max: 1, ring: 0 },
  // 锋利：抓力（往上剪不容易缠住）、暴击
  { id: 'grip', branch: 'sharp', parent: 'root', base: 80, max: 12, ring: 1 },
  { id: 'crit', branch: 'sharp', parent: 'grip', base: 1800, max: 5, ring: 2 },
  // 范围：刃更长、判定更厚
  { id: 'range', branch: 'range', parent: 'root', base: 120, max: 10, ring: 1 },
  { id: 'thick', branch: 'range', parent: 'range', base: 1400, max: 4, ring: 2 },
  // 节奏：咔嚓更快、跟手更紧
  { id: 'rhythm', branch: 'rhythm', parent: 'root', base: 160, max: 10, ring: 1 },
  { id: 'follow', branch: 'rhythm', parent: 'rhythm', base: 1000, max: 4, ring: 2 },
  // 收获：发丝倍率、白发、解结
  { id: 'harvest', branch: 'harvest', parent: 'root', base: 60, max: 25, ring: 1 },
  { id: 'rare', branch: 'harvest', parent: 'harvest', base: 3000, max: 5, ring: 2 },
  { id: 'untangle', branch: 'harvest', parent: 'rare', base: 10000, max: 2, ring: 3 },
  // 时间 / 头发：顺滑（纠缠度降低）、护发（长得慢）、大号泳帽
  { id: 'smooth', branch: 'time', parent: 'root', base: 240, max: 10, ring: 1 },
  { id: 'slow', branch: 'time', parent: 'smooth', base: 2400, max: 5, ring: 2 },
  { id: 'bigcap', branch: 'time', parent: 'slow', base: 80000, max: 3, ring: 3 },
  // 连击
  { id: 'grace', branch: 'combo', parent: 'root', base: 400, max: 5, ring: 1 },
  { id: 'combomult', branch: 'combo', parent: 'grace', base: 5000, max: 5, ring: 2 },
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

// ---------------------------------------------------------------- 奖牌商店（永久）

export interface MedalDef {
  readonly id: string
  readonly base: number
  readonly max: number
}

export const MEDALS: readonly MedalDef[] = [
  { id: 'm_value', base: 1, max: 20 },
  { id: 'm_grip', base: 2, max: 10 },
  { id: 'm_speed', base: 2, max: 10 },
  { id: 'm_start', base: 5, max: 2 },
  { id: 'm_slow', base: 3, max: 5 },
  { id: 'm_combo', base: 4, max: 5 },
]

export const MEDAL_BY_ID: Readonly<Record<string, MedalDef>> = Object.fromEntries(MEDALS.map((m) => [m.id, m]))

export function medalPrice(id: string, level: number): number {
  const m = MEDAL_BY_ID[id]!
  return Math.ceil(m.base * Math.pow(1.6, level))
}

/** 本轮累计发丝 → 去游泳拿到的奖牌数。 */
export function medalsFor(loopHairs: number): number {
  return Math.max(1, Math.floor(Math.sqrt(loopHairs / 2000)))
}

// ---------------------------------------------------------------- 汇总

/** 技能 + 奖牌加成对剪发的影响。 */
export interface Upgrades {
  /** 抓力 × */
  gripMult: number
  /** 半刃长 + */
  radius: number
  thickness: number
  /** 咔嚓间隔 × */
  snapMult: number
  follow: number
  /** 暴击率（这一刀收益 ×5） */
  crit: number
  valueMult: number
  rareMult: number
  knotEase: number
  /** 纠缠度 × */
  tangleMult: number
  growthMult: number
  /** 泳帽线往下放宽的像素 */
  capLower: number
  /** 断连判定 + 秒 */
  grace: number
  comboMult: number
}

export function upgradesFrom(skills: Record<string, number>, medals: Record<string, number>): Upgrades {
  const L = (id: string): number => Math.min(skills[id] ?? 0, SKILL_BY_ID[id]?.max ?? 0)
  const M = (id: string): number => Math.min(medals[id] ?? 0, MEDAL_BY_ID[id]?.max ?? 0)
  return {
    gripMult: (1 + L('grip') * 0.06) * (1 + M('m_grip') * 0.1),
    radius: L('range') * 1.5,
    thickness: L('thick') * 1.5,
    snapMult: Math.pow(0.95, L('rhythm')) * Math.pow(0.96, M('m_speed')),
    follow: L('follow') * 5,
    crit: L('crit') * 0.03,
    valueMult: (1 + L('harvest') * 0.12) * (1 + M('m_value') * 0.25),
    rareMult: 1 + L('rare') * 0.5,
    knotEase: L('untangle'),
    tangleMult: Math.pow(0.96, L('smooth')),
    growthMult: Math.pow(0.9, L('slow')) * Math.pow(0.88, M('m_slow')),
    capLower: L('bigcap') * 25,
    grace: L('grace') * 0.2,
    comboMult: (1 + L('combomult') * 0.1) * (1 + M('m_combo') * 0.1),
  }
}
