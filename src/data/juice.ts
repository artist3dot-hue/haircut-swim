// 手感参数：全部集中在这里，调试面板（` 键）可以实时改。
// 工具本身的数值（刃长、间隔、抓力……）在 data/tools.ts，头发的数值在 data/tools.ts 的 HAIR_WORLD。
// 单位：像素 = 逻辑像素（540×960），时间 = 秒。

export const JUICE = {
  // ---- 剪刀 ----
  /** 手指触屏时剪刀在手指上方多少像素（不被手指挡住） */
  touchOffsetY: 64,
  /** 闭合动画时长（咔嚓那一下） */
  snapCloseTime: 0.05,
  /** 推开头发的额外范围（剪刀附近的头发被推开、轻轻摆动） */
  pushRange: 14,
  /** 推开力度 */
  pushStrength: 0.35,
  /** 镜头跟随速度 */
  cameraFollow: 2.2,

  // ---- 碎屑、飘字、光点 ----
  /** 每次剪断的碎屑数（GDD：3–6） */
  debrisMin: 3,
  debrisMax: 6,
  /** 碎屑速度 */
  debrisSpeed: 120,
  /** 飘字上飘时间（GDD：0.6 秒） */
  floaterTime: 0.6,
  /** 飘字上飘距离 */
  floaterRise: 26,
  /** 一次咔嚓最多几个单根飘字（其余合进总数飘字） */
  floaterMaxPerSnap: 4,
  /** 每段断发变成几个光点 */
  sparksPerPiece: 1,
  /** 光点飞向计数器的时间 */
  sparkFlyMin: 0.45,
  sparkFlyMax: 0.8,
  /** 计数器弹跳幅度 */
  counterBump: 0.3,

  // ---- 震屏 / 顿帧（只在规定场合） ----
  /** 连击档位震屏幅度（GDD：2–4px；540 宽下放大 1.5 倍） */
  shakeTier: 4,
  shakeTime: 0.22,

  // ---- 声音 ----
  masterVolume: 0.7,
  /** 同一帧最多几个剪断音（其余并入沙沙底噪） */
  maxSnipsPerFrame: 6,
  /** 剪断音高随机幅度（±8%） */
  pitchJitter: 0.08,
  /** 手机震动（毫秒） */
  vibrateMs: 8,
  /** 稀有头发手机震动（毫秒） */
  vibrateRareMs: 20,
  /** 稀有头发顿帧（GDD：40 毫秒） */
  hitstopRare: 0.04,
}

export type JuiceKey = keyof typeof JUICE

/** 调试面板上显示的参数：[键, 最小, 最大, 步长]。名字在 strings.ts 的 S.debug.params 里。 */
export const JUICE_SLIDERS: ReadonlyArray<readonly [JuiceKey, number, number, number]> = [
  ['pushRange', 0, 40, 1],
  ['pushStrength', 0, 1, 0.05],
  ['cameraFollow', 0.5, 8, 0.1],
  ['debrisMin', 0, 12, 1],
  ['debrisMax', 0, 20, 1],
  ['debrisSpeed', 20, 300, 10],
  ['floaterTime', 0.2, 2, 0.05],
  ['floaterMaxPerSnap', 0, 20, 1],
  ['sparkFlyMin', 0.1, 2, 0.05],
  ['sparkFlyMax', 0.1, 3, 0.05],
  ['counterBump', 0, 1, 0.05],
  ['shakeTier', 0, 8, 1],
  ['masterVolume', 0, 1, 0.05],
  ['maxSnipsPerFrame', 1, 12, 1],
  ['pitchJitter', 0, 0.3, 0.01],
]

/** 连击档位（GDD 第 6 节）。 */
export const COMBO_TIERS = [
  { at: 10, mult: 1.1 },
  { at: 50, mult: 1.5 },
  { at: 100, mult: 2 },
  { at: 500, mult: 3 },
] as const

export function comboMult(combo: number): number {
  let m = 1
  for (const t of COMBO_TIERS) if (combo >= t.at) m = t.mult
  return m
}

/** 每 10 连击升一个半音，最多一个八度。 */
export function comboSemitones(combo: number): number {
  return Math.min(12, Math.floor(combo / 10))
}
