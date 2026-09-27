// 平衡测试：让一个"会玩的机器人"加速玩一整轮（直到剪到泳帽线），打印各个里程碑的游戏时间。
// 机器人每次挑镜头里"一刀收益最高、又不会缠住"的位置，有钱就买（先买工具，再买最便宜的技能）。
// 用法：npm run build && node scripts/balance.mjs [--speed 12] [--minutes 90]
// 注意：机器人比真人会找位置，真人大约要慢 1.5–2 倍。
import { preview } from 'vite'
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`)
  return i >= 0 ? Number(args[i + 1]) : d
}
const SPEED = arg('speed', 12)
const MINUTES = arg('minutes', 90)

const server = await preview({ root, logLevel: 'warn', preview: { port: 4185, strictPort: true, host: '127.0.0.1' } })
const { chromium: _c } = { chromium }
const launch = { args: ['--autoplay-policy=no-user-gesture-required'] }
if (!existsSync(chromium.executablePath())) launch.executablePath = process.env.HS_CHROMIUM ?? '/opt/pw-browsers/chromium'
const browser = await chromium.launch(launch)
const ctx = await browser.newContext({ viewport: { width: 540, height: 960 } })
await ctx.addInitScript(() => localStorage.setItem('hs.save', JSON.stringify({ version: 2, introSeen: true })))
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto('http://127.0.0.1:4185/?scene=cut')
await page.waitForFunction(() => !!window.__hs)
await page.evaluate((speed) => {
  const hs = window.__hs
  const dbg = () => hs.debug()
  hs.setSpeed(speed)
  const log = []
  window.__bal = log
  const save = () => hs.save()
  let lastBuy = 0
  let lastTools = ''
  const mark = (ev) => log.push({ t: Math.round(save().playTime), ev, hairs: Math.round(save().hairs) })
  mark('start')
  setInterval(() => {
    const st = hs.stats()
    if (!st) return
    const inp = hs.game.input
    const [x, y] = dbg().botTarget()
    inp.x = x
    inp.y = y
    inp.seen = true
    inp.pointerType = 'mouse'
    const pt = save().playTime
    if (pt - lastBuy > 30) {
      lastBuy = pt
      const b = dbg().bestBuy()
      if (b) mark('buy ' + b.trim())
    }
    const tools = save().tools.join(',')
    if (tools !== lastTools) {
      lastTools = tools
      mark('tools ' + tools)
    }
    if (save().capReached && !log.some((l) => l.ev === 'cap')) mark('cap')
    // 泳帽线弹窗：关掉接着（测试到此为止）
    if (dbg().state().dialog) dbg().closeDialog()
  }, 40)
}, SPEED)

const t0 = Date.now()
let lastPrint = 0
while (Date.now() - t0 < (MINUTES * 60 * 1000) / SPEED + 30000) {
  await page.waitForTimeout(2000)
  const st = await page.evaluate(() => ({ s: window.__hs.stats(), done: window.__bal.some((l) => l.ev === 'cap') }))
  if (Date.now() - lastPrint > 20000) {
    lastPrint = Date.now()
    console.log(`[${Math.round(st.s.playTime / 60)} 分钟] 工具 ${st.s.tool}  发丝 ${st.s.hairs}  剩余 ${st.s.progressPct}%  咔嚓 ${st.s.snaps}  剪断 ${st.s.cuts}  缠住 ${st.s.jams}`)
  }
  if (st.done) break
}
const log = await page.evaluate(() => window.__bal)
console.log('\n里程碑（游戏时间）：')
for (const l of log) console.log(`  ${String(Math.floor(l.t / 60)).padStart(2)}:${String(l.t % 60).padStart(2, '0')}  ${l.ev}  (发丝 ${l.hairs})`)
console.log('\n最终：', JSON.stringify(await page.evaluate(() => window.__hs.stats())))
await browser.close()
await (server.close ? server.close() : new Promise((r) => server.httpServer.close(r)))
