// 极简 DOM 文本框：导出 / 导入存档时用（要能复制粘贴，Canvas 做不到）。

import { SCENE } from '../art/palette'
import { S } from '../data/strings'

export function showTextBox(o: { title: string; value?: string; readonly?: boolean; onOk?: (text: string) => void }): void {
  const ui = SCENE.ui
  const wrap = document.createElement('div')
  Object.assign(wrap.style, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.35)',
    zIndex: '20',
  } satisfies Partial<CSSStyleDeclaration>)
  const box = document.createElement('div')
  Object.assign(box.style, {
    width: 'min(320px, 90vw)',
    background: ui.panel,
    border: `3px solid ${ui.border}`,
    color: ui.text,
    padding: '12px',
    font: '14px "ZCOOL QingKe HuangYou", "Microsoft YaHei", sans-serif',
  } satisfies Partial<CSSStyleDeclaration>)
  const title = document.createElement('div')
  title.textContent = o.title
  title.style.marginBottom = '8px'
  const ta = document.createElement('textarea')
  ta.value = o.value ?? ''
  ta.readOnly = !!o.readonly
  Object.assign(ta.style, { width: '100%', height: '110px', boxSizing: 'border-box', font: '11px monospace', color: ui.text, border: `1px solid ${ui.border}` })
  const row = document.createElement('div')
  Object.assign(row.style, { display: 'flex', gap: '8px', marginTop: '8px' })
  const close = (): void => wrap.remove()
  const btn = (label: string, primary: boolean, fn: () => void): void => {
    const b = document.createElement('button')
    b.textContent = label
    Object.assign(b.style, { flex: '1', padding: '6px', font: 'inherit', cursor: 'pointer', border: 'none', background: primary ? ui.border : ui.text, color: ui.panel })
    b.addEventListener('click', fn)
    row.appendChild(b)
  }
  if (o.onOk) {
    btn(S.settings.ok, true, () => {
      o.onOk?.(ta.value)
      close()
    })
    btn(S.settings.cancel, false, close)
  } else {
    btn(S.hub.close, true, close)
  }
  box.append(title, ta, row)
  wrap.appendChild(box)
  // 弹窗里的点击不要穿透到游戏
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation())
  document.body.appendChild(wrap)
  if (o.readonly) ta.select()
  else ta.focus()
}
