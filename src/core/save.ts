// 存档：localStorage，结构带 version，读档时按版本一步步迁移。
// 导出 / 导入用 base64 包一层 JSON（中文也安全）。

const KEY = 'hs.save'
export const SAVE_VERSION = 1

export interface Settings {
  /** 总音量 0..1（乘在 JUICE.masterVolume 上） */
  volume: number
  vibrate: boolean
}

export interface SaveData {
  version: number
  /** 当前发丝（技能树花的就是它） */
  hairs: number
  /** 历史累计发丝 */
  totalHairs: number
  /** 技能等级 */
  skills: Record<string, number>
  /** 是否已经剪到过泳帽线（解锁去游泳） */
  swimUnlocked: boolean
  bestCombo: number
  rounds: number
  /** 主界面阿发的头发长度 0..1（待在主界面时慢慢长） */
  hubHair: number
  /** 上一局怎么结束的（主界面表情用） */
  lastEnd: 'none' | 'time' | 'drown' | 'swim'
  settings: Settings
  savedAt: number
}

export function freshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    hairs: 0,
    totalHairs: 0,
    skills: { root: 1 },
    swimUnlocked: false,
    bestCombo: 0,
    rounds: 0,
    hubHair: 0.55,
    lastEnd: 'none',
    settings: { volume: 0.8, vibrate: true },
    savedAt: Date.now(),
  }
}

/**
 * 迁移：每个版本一个函数，把 vN 的数据变成 vN+1。
 * 以后改存档结构时：SAVE_VERSION + 1，在这里加一个迁移。
 */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  // v0：还没有 version 字段的数据（理论上不存在，留作示例和兜底）
  0: (d) => ({ ...d, version: 1 }),
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
  // 缺的字段用默认值补齐，类型不对的丢掉
  const base = freshSave()
  const out: SaveData = { ...base }
  const num = (k: keyof SaveData): void => {
    const x = d[k]
    if (typeof x === 'number' && Number.isFinite(x)) (out as unknown as Record<string, unknown>)[k] = x
  }
  num('hairs')
  num('totalHairs')
  num('bestCombo')
  num('rounds')
  num('hubHair')
  num('savedAt')
  if (typeof d.swimUnlocked === 'boolean') out.swimUnlocked = d.swimUnlocked
  if (d.lastEnd === 'time' || d.lastEnd === 'drown' || d.lastEnd === 'swim' || d.lastEnd === 'none') out.lastEnd = d.lastEnd
  if (d.skills && typeof d.skills === 'object') {
    const sk: Record<string, number> = { root: 1 }
    for (const [k, v2] of Object.entries(d.skills as Record<string, unknown>)) if (typeof v2 === 'number' && v2 >= 0) sk[k] = Math.floor(v2)
    out.skills = sk
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
  save.savedAt = Date.now()
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    /* 存不了就算了，游戏照玩 */
  }
}

export function resetGame(): void {
  save = freshSave()
  saveGame()
}

/** 导出成一行文本（base64 包 JSON）。 */
export function exportSave(): string {
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
    saveGame()
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
