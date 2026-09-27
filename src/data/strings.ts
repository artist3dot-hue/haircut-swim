// 所有界面文案集中在这里（简体中文）。

import type { JuiceKey } from './juice'

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
  cut: {
    combo: '连击',
    tapForSound: '点一下画面开启声音',
    dragHint: '拖动剪刀，剪掉头发！',
    debugHint: '按 ` 键打开调试面板',
  },
  round: {
    goSwim: '去游泳！',
    keepCutting: '再剪一会儿',
    keepCuttingHint: (m: number) => `再剪一会儿：收益 ×${m}，但头发长得更快`,
    canSwim: '可以去游泳了！',
    holdCap: (s: number) => `保持住！${Math.max(0, s).toFixed(1)} 秒`,
    drowned: '被头发淹没了！',
    timeUp: '时间到！',
    goSwimming: '收拾一下，去游泳！',
    again: '再来一局',
    titleTime: '时间到',
    titleDrown: '被头发淹没了',
    titleSwim: '剪够了，去游泳！',
    earned: '本局发丝',
    halfPay: '爆表只拿到一半发丝',
    maxCombo: '最高连击',
    strandsCut: '剪断根数',
    total: '累计发丝',
    swimUnlocked: '解锁：去游泳！',
    capTip: '把所有头发剪到泳帽线以上并保持 3 秒，就能去游泳',
  },
  debug: {
    title: '手感调试（` 键开关）',
    reset: '恢复默认',
    close: '关闭',
    stats: '状态',
    params: {
      snapInterval: '咔嚓间隔（秒）',
      scissorRadius: '剪刀半径',
      cutThickness: '剪断判定厚度',
      followSharpness: '跟手速度',
      touchOffsetY: '触屏剪刀上移',
      snapCloseTime: '闭合动画时长',
      pushRange: '推开范围',
      pushStrength: '推开力度',
      hairCount: '头发数量',
      backRatio: '后层比例',
      growthSpeed: '生长速度（像素/秒）',
      startLenMin: '开局最短',
      startLenMax: '开局最长',
      segLen: '每段长度',
      hairGravity: '头发重力',
      hairDamping: '头发阻尼',
      wind: '风力',
      curlAmp: '卷曲幅度',
      pieceGravity: '断发重力',
      pieceKick: '断发弹出速度',
      pieceSpinMin: '断发最小转速',
      pieceSpinMax: '断发最大转速',
      pieceDrag: '断发空气阻力',
      debrisMin: '碎屑最少',
      debrisMax: '碎屑最多',
      debrisSpeed: '碎屑速度',
      floaterTime: '飘字时长',
      floaterRise: '飘字上飘距离',
      floaterMaxPerSnap: '每下最多飘字',
      sparksPerPiece: '每段断发光点数',
      sparkFlyMin: '光点最短飞行',
      sparkFlyMax: '光点最长飞行',
      counterBump: '计数器弹跳',
      comboTimeout: '断连时间（秒）',
      shakeTier: '档位震屏幅度',
      shakeTime: '震屏时长',
      masterVolume: '总音量',
      maxSnipsPerFrame: '每帧最多剪断音',
      pitchJitter: '音高随机',
      vibrateMs: '震动毫秒',
      vibrateRareMs: '稀有头发震动毫秒',
      hitstopRare: '稀有头发顿帧（秒）',
    } satisfies Record<JuiceKey, string>,
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
