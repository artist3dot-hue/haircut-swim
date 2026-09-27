// 剪发工具数值表（DESIGN_V2 第 3 节）。纯数据，方便调参。
// 在主界面"工具架"用发丝购买；买了就换上（只能用最好的那把）。

export type ToolId = 'knife' | 'scissors' | 'shears' | 'garden' | 'clipper'

export interface ToolDef {
  readonly id: ToolId
  /** 半刃长：剪断判定线段的一半长度（像素） */
  readonly radius: number
  /** 剪断判定厚度 */
  readonly thick: number
  /** 一下最多剪断几缕 */
  readonly capacity: number
  /** 咔嚓间隔（秒）；电推子是连续剪，间隔很短 */
  readonly interval: number
  /** 抓力：刃上头发的纠缠度加起来超过它就会缠住 */
  readonly grip: number
  /** 锋利度：小于头发硬度剪不动（钢丝发硬度 2） */
  readonly sharpness: number
  readonly price: number
  /** 跟手速度 */
  readonly follow: number
  /** 连续剪（电推子） */
  readonly continuous: boolean
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'knife', radius: 10, thick: 5, capacity: 1, interval: 0.55, grip: 0.6, sharpness: 1, price: 0, follow: 22, continuous: false },
  { id: 'scissors', radius: 20, thick: 6, capacity: 2, interval: 0.45, grip: 1.4, sharpness: 1, price: 400, follow: 26, continuous: false },
  { id: 'shears', radius: 30, thick: 7, capacity: 3, interval: 0.36, grip: 3.5, sharpness: 1, price: 6000, follow: 30, continuous: false },
  { id: 'garden', radius: 50, thick: 9, capacity: 5, interval: 0.55, grip: 8, sharpness: 2, price: 150000, follow: 20, continuous: false },
  { id: 'clipper', radius: 32, thick: 8, capacity: 2, interval: 0.1, grip: 20, sharpness: 3, price: 1500000, follow: 34, continuous: true },
]

export const TOOL_BY_ID: Readonly<Record<ToolId, ToolDef>> = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<ToolId, ToolDef>

/** 最好的已拥有工具。 */
export function bestTool(owned: readonly string[]): ToolDef {
  let best = TOOLS[0]!
  for (const t of TOOLS) if (owned.includes(t.id)) best = t
  return best
}

/** 头发（一整轮）的数值。 */
export const HAIR_WORLD = {
  /** 开局头发缕数 */
  locks: 60,
  /** 每一缕的长度范围（像素） */
  lenMin: 2700,
  lenMax: 3200,
  /** 每转生一次：长度 ×、缕数 + */
  loopLenMult: 1.25,
  loopLockAdd: 8,
  /** 每缕每秒长多少像素（游戏开着时） */
  growth: 0.12,
  /** 一刀剪下 len 像素值多少发丝：valueK × len^valueExp（次线性：往上一刀剪得多、单刀赚得多，但总量上细细修发梢更赚） */
  valueK: 0.2,
  valueExp: 0.75,
  /** 纠缠度：离自己发梢每这么多像素算 1 */
  tangleDepth: 200,
  /** 单缕纠缠度上限 */
  tangleCap: 12,
  /** 缠住后卡多久（秒） */
  jamTime: 0.5,
  /** 泳帽线（世界坐标 y） */
  capY: 250,
  /** 泳帽线保持秒数 */
  capHold: 3,
  /** 连击断连时间 */
  comboTimeout: 1.2,
} as const
