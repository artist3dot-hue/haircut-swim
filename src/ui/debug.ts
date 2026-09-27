// 调试面板（` 键开关）：实时调 src/data/juice.ts 里的手感参数。极简 DOM，不影响游戏画面。
// 改过的值存在 localStorage（只给调试用，和存档无关），"恢复默认"清掉。

import { JUICE, JUICE_SLIDERS, type JuiceKey } from '../data/juice'
import { S } from '../data/strings'
import { SCENE } from '../art/palette'

const STORE_KEY = 'hs.debugJuice'
const DEFAULTS = { ...JUICE }

export class DebugPanel {
  private root: HTMLDivElement
  private statsEl: HTMLPreElement
  private inputs = new Map<JuiceKey, { input: HTMLInputElement; out: HTMLSpanElement }>()
  open = false

  constructor(
    private readonly onChange: (key: JuiceKey) => void,
    private readonly getStats: () => Record<string, string | number>,
  ) {
    this.load()
    const ui = SCENE.ui
    const root = document.createElement('div')
    root.id = 'debug-panel'
    Object.assign(root.style, {
      position: 'fixed',
      top: '8px',
      right: '8px',
      width: '270px',
      maxHeight: 'calc(100% - 16px)',
      overflowY: 'auto',
      background: ui.panel,
      border: `3px solid ${ui.border}`,
      color: ui.text,
      font: '12px "ZCOOL QingKe HuangYou", "Microsoft YaHei", sans-serif',
      padding: '8px 10px',
      zIndex: '10',
      display: 'none',
      boxSizing: 'border-box',
    } satisfies Partial<CSSStyleDeclaration>)
    root.addEventListener('pointerdown', (e) => e.stopPropagation())

    const title = document.createElement('div')
    title.textContent = S.debug.title
    title.style.fontSize = '15px'
    title.style.marginBottom = '6px'
    root.appendChild(title)

    for (const [key, min, max, step] of JUICE_SLIDERS) {
      const row = document.createElement('label')
      Object.assign(row.style, { display: 'grid', gridTemplateColumns: '1fr 44px', alignItems: 'center', margin: '2px 0' })
      const name = document.createElement('span')
      name.textContent = S.debug.params[key]
      const out = document.createElement('span')
      out.style.textAlign = 'right'
      const input = document.createElement('input')
      input.type = 'range'
      input.min = String(min)
      input.max = String(max)
      input.step = String(step)
      input.value = String(JUICE[key])
      input.style.gridColumn = '1 / span 2'
      input.style.width = '100%'
      input.style.accentColor = ui.border
      out.textContent = fmt(JUICE[key])
      input.addEventListener('input', () => {
        JUICE[key] = Number(input.value)
        out.textContent = fmt(JUICE[key])
        this.save()
        this.onChange(key)
      })
      row.append(name, out, input)
      root.appendChild(row)
      this.inputs.set(key, { input, out })
    }

    const btns = document.createElement('div')
    btns.style.display = 'flex'
    btns.style.gap = '6px'
    btns.style.margin = '8px 0'
    const mk = (label: string, fn: () => void): void => {
      const b = document.createElement('button')
      b.textContent = label
      Object.assign(b.style, { flex: '1', background: ui.border, color: ui.panel, border: 'none', padding: '4px', font: 'inherit', cursor: 'pointer' })
      b.addEventListener('click', fn)
      btns.appendChild(b)
    }
    mk(S.debug.reset, () => this.reset())
    mk(S.debug.close, () => this.toggle(false))
    root.appendChild(btns)

    this.statsEl = document.createElement('pre')
    Object.assign(this.statsEl.style, { margin: '0', font: '11px monospace', whiteSpace: 'pre-wrap' })
    root.appendChild(this.statsEl)

    document.body.appendChild(root)
    this.root = root

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' || e.key === '`' || e.key === '·') {
        e.preventDefault()
        this.toggle()
      }
    })
    setInterval(() => {
      if (!this.open) return
      const st = this.getStats()
      this.statsEl.textContent = `${S.debug.stats}\n` + Object.entries(st).map(([k, v]) => `${k}: ${v}`).join('\n')
    }, 250)
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open
    this.root.style.display = this.open ? 'block' : 'none'
  }

  private reset(): void {
    for (const k of Object.keys(DEFAULTS) as JuiceKey[]) JUICE[k] = DEFAULTS[k]
    try {
      localStorage.removeItem(STORE_KEY)
    } catch {
      /* 无痕模式等拿不到 localStorage，忽略 */
    }
    for (const [k, { input, out }] of this.inputs) {
      input.value = String(JUICE[k])
      out.textContent = fmt(JUICE[k])
      this.onChange(k)
    }
  }

  private save(): void {
    const diff: Partial<Record<JuiceKey, number>> = {}
    for (const k of Object.keys(DEFAULTS) as JuiceKey[]) if (JUICE[k] !== DEFAULTS[k]) diff[k] = JUICE[k]
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(diff))
    } catch {
      /* 忽略 */
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORE_KEY)
      if (!raw) return
      const diff = JSON.parse(raw) as Record<string, unknown>
      for (const [k, v] of Object.entries(diff)) {
        if (k in JUICE && typeof v === 'number' && Number.isFinite(v)) JUICE[k as JuiceKey] = v
      }
    } catch {
      /* 坏数据就忽略 */
    }
  }
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}
