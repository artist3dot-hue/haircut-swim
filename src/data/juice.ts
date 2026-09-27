// 手感参数：全部集中在这里，调试面板（` 键）可以实时改。
// 单位：像素 = 逻辑像素（360×640），时间 = 秒。

export const JUICE = {
  // ---- 剪刀 ----
  /** 自动咔嚓间隔 */
  snapInterval: 0.3,
  /** 剪刀半径：刃长的一半，也是剪断判定胶囊的半长 */
  scissorRadius: 22,
  /** 剪断判定胶囊的半厚度（刃上下多宽算剪到） */
  cutThickness: 7,
  /** 跟手速度（越大越紧，指数平滑系数） */
  followSharpness: 28,
  /** 手指触屏时剪刀在手指上方多少像素（不被手指挡住） */
  touchOffsetY: 44,
  /** 闭合动画时长（咔嚓那一下） */
  snapCloseTime: 0.05,
  /** 推开头发的额外范围（剪刀附近的头发被推开、轻轻摆动） */
  pushRange: 10,
  /** 推开力度（0–1，每步修正穿透量的比例） */
  pushStrength: 0.35,

  // ---- 头发 ----
  /** 头发根数（前后两层合计） */
  hairCount: 160,
  /** 后层所占比例 */
  backRatio: 0.4,
  /** 生长速度（像素/秒，从根部送出） */
  growthSpeed: 14,
  /** 开局头发长度范围 */
  startLenMin: 300,
  startLenMax: 470,
  /** 每段长度 */
  segLen: 10,
  /** 重力（头发模拟） */
  hairGravity: 380,
  /** 阻尼（每步保留的速度比例） */
  hairDamping: 0.965,
  /** 风力幅度 */
  wind: 22,
  /** 卷曲幅度（像素） */
  curlAmp: 3.2,

  // ---- 剪下的头发 ----
  /** 断发下落重力 */
  pieceGravity: 620,
  /** 断发向外弹出的速度 */
  pieceKick: 70,
  /** 断发角速度范围（弧度/秒） */
  pieceSpinMin: 2.5,
  pieceSpinMax: 8,
  /** 空气阻力（每秒保留速度比例） */
  pieceDrag: 0.55,

  // ---- 碎屑、飘字、光点 ----
  /** 每次剪断的碎屑数（GDD：3–6） */
  debrisMin: 3,
  debrisMax: 6,
  /** 碎屑速度 */
  debrisSpeed: 90,
  /** 飘字上飘时间（GDD：0.6 秒） */
  floaterTime: 0.6,
  /** 飘字上飘距离 */
  floaterRise: 18,
  /** 一次咔嚓最多几个单根飘字（其余合进总数飘字） */
  floaterMaxPerSnap: 6,
  /** 每段断发落地后变成几个光点 */
  sparksPerPiece: 1,
  /** 光点飞向计数器的时间 */
  sparkFlyMin: 0.45,
  sparkFlyMax: 0.75,
  /** 计数器弹跳幅度 */
  counterBump: 0.35,

  // ---- 连击 ----
  /** 多久没剪到就断连 */
  comboTimeout: 1.0,

  // ---- 震屏 / 顿帧（只在规定场合） ----
  /** 连击档位震屏幅度（GDD：2–4px） */
  shakeTier: 3,
  shakeTime: 0.22,

  // ---- 声音 ----
  masterVolume: 0.7,
  /** 同一帧最多几个剪断音（其余并入沙沙底噪） */
  maxSnipsPerFrame: 6,
  /** 剪断音高随机幅度（±8%） */
  pitchJitter: 0.08,
  /** 手机震动（毫秒） */
  vibrateMs: 8,
}

export type JuiceKey = keyof typeof JUICE

/** 调试面板上显示的参数：[键, 最小, 最大, 步长]。名字在 strings.ts 的 S.debug.params 里。 */
export const JUICE_SLIDERS: ReadonlyArray<readonly [JuiceKey, number, number, number]> = [
  ['snapInterval', 0.08, 1, 0.01],
  ['scissorRadius', 10, 60, 1],
  ['cutThickness', 2, 20, 1],
  ['followSharpness', 4, 60, 1],
  ['growthSpeed', 0, 80, 1],
  ['hairCount', 20, 600, 10],
  ['wind', 0, 80, 1],
  ['curlAmp', 0, 8, 0.1],
  ['pushRange', 0, 30, 1],
  ['pieceKick', 0, 200, 5],
  ['pieceGravity', 100, 1500, 10],
  ['debrisMin', 0, 12, 1],
  ['debrisMax', 0, 20, 1],
  ['floaterMaxPerSnap', 0, 20, 1],
  ['sparksPerPiece', 0, 6, 1],
  ['comboTimeout', 0.3, 3, 0.1],
  ['shakeTier', 0, 6, 1],
  ['masterVolume', 0, 1, 0.05],
  ['maxSnipsPerFrame', 1, 12, 1],
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
