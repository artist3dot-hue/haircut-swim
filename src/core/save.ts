// 存档：localStorage，结构带 version，读档时按版本一步步迁移。
// 导出 / 导入用 base64 包一层 JSON（中文也安全）。

import type { HairSaveData } from '../hair/world'

const KEY = 'hs.save'
export const SAVE_VERSION = 2

export interface Settings {
  /** 总音量 0..1（乘在 JUICE.masterVolume 上） */
  volume: number
  vibrate: boolean
}

export interface SaveData {
  version: number
  /** 当前发丝（买工具、技能花的就是它） */
  hairs: number
  /** 本轮（这次去游泳之前）累计发丝，决定奖牌数 */
  loopHairs: number
  /** 历史累计发丝 */
  lifetimeHairs: number
  /** 技能等级（去游泳时清零） */
  skills: Record<string, number>
  /** 拥有的工具（去游泳时清零，奖牌"起跑器"可以保留剪刀） */
  tools: string[]
  /** 奖牌（永久货币）和奖牌商店等级（永久） */
  medals: number
  medalSkills: Record<string, number>
  /** 去游泳了几次 */
  loops: number
  /** 这一轮的头发（null = 还没生成） */
  hair: HairSaveData | null
  /** 这一轮是否已经剪到泳帽线（泳池发光，可以去游泳） */
  capReached: boolean
  /** 看过开场动画 */
  introSeen: boolean
  bestCombo: number
  /** 游戏时长（秒） */
  playTime: number
  settings: Settings
  savedAt: number
}

export function freshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    hairs: 0,
    loopHairs: 0,
    lifetimeHairs: 0,
    skills: { root: 1 },
    tools: ['knife'],
    medals: 0,
    medalSkills: {},
    loops: 0,
    hair: null,
    capReached: false,
    introSeen: false,
    bestCombo: 0,
    playTime: 0,
    settings: { volume: 0.8, vibrate: true },
    savedAt: Date.now(),
  }
}

/**
 * 迁移：每个版本一个函数，把 vN 的数据变成 vN+1。
 * 以后改存档结构时：SAVE_VERSION + 1，在这里加一个迁移。
 */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  // v0：还没有 version 字段的数据（兜底）
  0: (d) => ({ ...d, version: 1 }),
  // v1 → v2：玩法改版（DESIGN_V2），经济完全不同，进度从头开始；保留设置
  1: (d) => ({ version: 2, settings: d.settings }),
}

function num(d: Record<string, unknown>, k: string, def: number): number {
  const x = d[k]
  return typeof x === 'number' && Number.isFinite(x) ? x : def
}

function levels(x: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x as Record<string, unknown>)) if (typeof v === 'number' && v >= 0) out[k] = Math.floor(v)
  return out
}

function migrate(raw: Record<string, unknown>): SaveData {
  let d = raw
  let v = typeof d.version === 'number' ? d.version : 0
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v]
    if (!step) break
    d = step(d)
    v = typeof d.version === 'number' ? d.version : v + 1
  }
  const base = freshSave()
  const out: SaveData = { ...base }
  out.hairs = num(d, 'hairs', 0)
  out.loopHairs = num(d, 'loopHairs', 0)
  out.lifetimeHairs = num(d, 'lifetimeHairs', 0)
  out.medals = num(d, 'medals', 0)
  out.loops = num(d, 'loops', 0)
  out.bestCombo = num(d, 'bestCombo', 0)
  out.playTime = num(d, 'playTime', 0)
  out.savedAt = num(d, 'savedAt', Date.now())
  out.skills = { root: 1, ...levels(d.skills) }
  out.medalSkills = levels(d.medalSkills)
  if (Array.isArray(d.tools)) out.tools = (d.tools as unknown[]).filter((x): x is string => typeof x === 'string')
  if (!out.tools.includes('knife')) out.tools.unshift('knife')
  out.capReached = d.capReached === true
  out.introSeen = d.introSeen === true
  const h = d.hair as Record<string, unknown> | null | undefined
  if (h && typeof h === 'object' && Array.isArray(h.lens) && Array.isArray(h.kinds) && typeof h.seed === 'number') {
    out.hair = {
      seed: h.seed,
      lens: (h.lens as unknown[]).map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : 100)),
      kinds: (h.kinds as unknown[]).map((x) => (typeof x === 'string' ? x : 'normal')),
      initialAvg: typeof h.initialAvg === 'number' ? h.initialAvg : 3000,
    }
  }
  if (d.settings && typeof d.settings === 'object') {
    const st = d.settings as Record<string, unknown>
    out.settings = {
      volume: typeof st.volume === 'number' ? Math.max(0, Math.min(1, st.volume)) : base.settings.volume,
      vibrate: typeof st.vibrate === 'boolean' ? st.vibrate : base.settings.vibrate,
    }
  }
  out.version = SAVE_VERSION
  return out
}

/** 全局存档（启动时读一次）。 */
export let save: SaveData = freshSave()

/** 存档前的钩子（比如把头发长度写进 save.hair）。 */
const beforeSave: Array<() => void> = []
export function onBeforeSave(fn: () => void): void {
  beforeSave.push(fn)
}

export function loadGame(): SaveData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) save = migrate(JSON.parse(raw) as Record<string, unknown>)
  } catch {
    // 读不到（无痕模式）或坏数据：用新存档，不崩
    save = freshSave()
  }
  return save
}

export function saveGame(): void {
  for (const fn of beforeSave) fn()
  save.savedAt = Date.now()
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    /* 存不了就算了，游戏照玩 */
  }
}

export function resetGame(): void {
  const settings = save.settings
  save = freshSave()
  save.settings = settings
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    /* 忽略 */
  }
}

/** 导出成一行文本（base64 包 JSON）。 */
export function exportSave(): string {
  saveGame()
  const json = JSON.stringify(save)
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return 'HS1:' + btoa(bin)
}

/** 导入：成功返回 true。 */
export function importSave(text: string): boolean {
  try {
    const t = text.trim().replace(/^HS1:/, '')
    const bin = atob(t)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const data = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    if (!data || typeof data !== 'object') return false
    save = migrate(data)
    localStorage.setItem(KEY, JSON.stringify(save))
    return true
  } catch {
    return false
  }
}

/** 自动存档：每 10 秒、切到后台、关页面时。 */
export function startAutosave(): void {
  setInterval(saveGame, 10000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveGame()
  })
  window.addEventListener('pagehide', saveGame)
}
