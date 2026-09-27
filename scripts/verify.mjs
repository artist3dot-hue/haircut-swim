// 验证脚本：启动 vite preview（需先 npm run build），用 Playwright 打开，按阶段截图、
// 模拟拖动剪发，打印控制台报错和平均帧时间。
// 用法：node scripts/verify.mjs [--stage v2|0] [--only 名字] [--out 目录]
import { preview } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`)
  return i >= 0 ? args[i + 1] : d
}
const stage = arg('stage', 'v2')
const only = arg('only', null)
const outDir = join(root, arg('out', `docs/screenshots/stage${stage}`))
const PORT = 4180

const DESKTOP = { viewport: { width: 1280, height: 800 }, dpr: 1 }
const DESKTOP_1080 = { viewport: { width: 1920, height: 969 }, dpr: 1 }
const MOBILE = { viewport: { width: 390, height: 844 }, dpr: 3, mobile: true }

/** 每个阶段要拍的画面。steps 里的坐标都是逻辑坐标（360×640）。 */
const PLANS = {
  0: [
    { name: 'desktop-test', device: DESKTOP, url: '?scene=test', steps: [{ wait: 1500 }, { shot: 'desktop-test' }] },
  ],
  // v2：开场 → 泳池边 → 拉近剪发 → 缠住 → 回去买工具 / 技能 → 泳帽线 → 去游泳
  v2: [
    {
      name: 'v2-intro',
      device: DESKTOP_1080,
      url: '',
      steps: [
        { wait: 1500 },
        { shot: 'intro-01-summer' },
        { wait: 3200 },
        { shot: 'intro-02-walk' },
        { wait: 4200 },
        { shot: 'intro-03-sign' },
        { wait: 1900 },
        { shot: 'intro-04-pop' },
        { wait: 3000 },
        { shot: 'intro-05-knife' },
        { wait: 2800 },
        { shot: 'intro-06-title' },
        { click: [270, 620] },
        { wait: 1200 },
        { shot: 'hub-01-first' },
        { stats: '进入泳池边' },
      ],
    },
    {
      name: 'v2-play',
      device: DESKTOP_1080,
      url: '?scene=pool',
      init: () => localStorage.setItem('hs.save', JSON.stringify({ version: 2, introSeen: true })),
      steps: [
        { wait: 1500 },
        { click: [100, 180] },
        { drag: 0.5, from: [200, 300], to: [270, 520] },
        { wait: 200 },
        { shot: 'hub-02-hover-afa' },
        { click: [270, 520] },
        { wait: 380 },
        { shot: 'cut-01-zoom', noWait: true },
        { wait: 900 },
        { shot: 'cut-02-start' },
        { resetPerf: true },
        { drag: 10, pattern: 'sweep', y: [700, 900] },
        { perf: '剪发 10 秒（发梢附近）' },
        { shot: 'cut-03-after-10s', noWait: true },
        { drag: 1.5, from: [270, 300], to: [300, 320] },
        { shot: 'cut-04-tangle', noWait: true },
        { stats: '剪了一会儿' },
        { click: [460, 40] },
        { wait: 1200 },
        { shot: 'hub-03-back' },
        { eval: 'window.__hs.debug().addHairs(3000)' },
        { click: [420, 370] },
        { wait: 400 },
        { shot: 'hub-04-toolshop' },
        { click: [440, 247] },
        { wait: 300 },
        { shot: 'hub-05-bought-scissors' },
        { click: [470, 50] },
        { wait: 300 },
        { click: [86, 320] },
        { wait: 500 },
        { shot: 'hub-06-tree' },
        { click: [270, 280] },
        { click: [270, 902] },
        { wait: 300 },
        { shot: 'hub-07-tree-bought' },
        { click: [470, 50] },
        { wait: 300 },
        { click: [468, 660] },
        { wait: 400 },
        { shot: 'hub-08-settings' },
      ],
    },
    {
      name: 'v2-cap',
      device: DESKTOP_1080,
      url: '?scene=cut',
      init: () => localStorage.setItem('hs.save', JSON.stringify({ version: 2, introSeen: true })),
      steps: [
        { wait: 1500 },
        { click: [270, 900] },
        { eval: 'window.__hs.debug().setTool("garden")' },
        { eval: 'window.__hs.debug().trimTo(700)' },
        { drag: 3, pattern: 'sweep', y: [500, 900] },
        { shot: 'cut-05-near-top', noWait: true },
        { eval: 'window.__hs.debug().trimTo(200)' },
        { drag: 2.5, from: [30, 940], to: [40, 940] },
        { shot: 'cut-06-capline', noWait: true },
        { wait: 2500 },
        { shot: 'cut-07-can-swim' },
        { click: [270, 540] },
        { wait: 1300 },
        { shot: 'hub-09-pool-glow' },
        { click: [270, 880] },
        { wait: 500 },
        { shot: 'swim-01-confirm' },
        { eval: 'window.__hs.debug().closeDialog(); window.__hs.debug().startSwim()' },
        { wait: 900 },
        { shot: 'swim-02-cap' },
        { wait: 1600 },
        { shot: 'swim-03-jump' },
        { wait: 1800 },
        { shot: 'swim-04-swim' },
        { wait: 3200 },
        { shot: 'swim-05-regrow' },
        { wait: 2400 },
        { shot: 'swim-06-medals' },
        { click: [270, 630] },
        { wait: 600 },
        { shot: 'hub-10-after-swim' },
        { stats: '去游泳之后' },
      ],
    },
    {
      name: 'v2-mobile',
      device: MOBILE,
      url: '?scene=pool',
      init: () => localStorage.setItem('hs.save', JSON.stringify({ version: 2, introSeen: true })),
      steps: [
        { wait: 1500 },
        { shot: 'mobile-01-hub' },
        { click: [270, 520] },
        { wait: 1400 },
        { drag: 3, pattern: 'sweep', y: [650, 880] },
        { shot: 'mobile-02-cut', noWait: true },
      ],
    },
  ],
}

const plan = PLANS[stage]
if (!plan) {
  console.error(`没有阶段 ${stage} 的验证计划`)
  process.exit(2)
}
if (!existsSync(join(root, 'dist/index.html'))) {
  console.error('dist/ 不存在，先运行 npm run build')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const server = await preview({ root, logLevel: 'warn', preview: { port: PORT, strictPort: true, host: '127.0.0.1' } })
const base = `http://127.0.0.1:${PORT}/`
// Playwright 自带的浏览器不存在时（例如云端环境预装的是别的版本），退回到预装的 Chromium
const launchOpts = { args: ['--autoplay-policy=no-user-gesture-required'] }
if (!existsSync(chromium.executablePath())) {
  const fallback = process.env.HS_CHROMIUM ?? '/opt/pw-browsers/chromium'
  if (existsSync(fallback)) launchOpts.executablePath = fallback
}
const browser = await chromium.launch(launchOpts)
const problems = []
const shots = []

async function toClient(page, lx, ly) {
  return page.evaluate(
    ([x, y]) => {
      const r = window.__hs.game.screen.view.getBoundingClientRect()
      return [r.left + (x / 540) * r.width, r.top + (y / 960) * r.height]
    },
    [lx, ly],
  )
}

async function drag(page, step) {
  const t0 = Date.now()
  const dur = step.drag * 1000
  if (step.from) {
    const [x0, y0] = step.from
    const [x1, y1] = step.to
    const [cx0, cy0] = await toClient(page, x0, y0)
    await page.mouse.move(cx0, cy0)
    while (Date.now() - t0 < dur) {
      const k = Math.min(1, (Date.now() - t0) / dur)
      const [cx, cy] = await toClient(page, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)
      await page.mouse.move(cx, cy)
      await page.waitForTimeout(16)
    }
    return
  }
  // sweep：左右来回扫，同时上下缓慢移动，像玩家找头发密的地方
  const [ya, yb] = step.y
  while (Date.now() - t0 < dur) {
    const t = (Date.now() - t0) / 1000
    const x = 270 + Math.sin(t * 2.6) * 230
    const y = ya + (yb - ya) * (0.5 + 0.5 * Math.sin(t * 0.7))
    const [cx, cy] = await toClient(page, x, y)
    await page.mouse.move(cx, cy)
    await page.waitForTimeout(16)
  }
}

for (const item of plan) {
  if (only && item.name !== only) continue
  const ctx = await browser.newContext({
    viewport: item.device.viewport,
    deviceScaleFactor: item.device.dpr,
    isMobile: !!item.device.mobile,
    hasTouch: !!item.device.mobile,
  })
  if (item.init) await ctx.addInitScript(item.init)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    // 资源加载失败另外按 URL 判断（外链字体在无网或代理环境下会失败，属于可接受的兜底）
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) problems.push(`[${item.name}] console.error: ${m.text()}`)
    else if (m.type() === 'warning') console.log(`  (${item.name}) warn: ${m.text()}`)
  })
  const localRes = (u) => u.startsWith(base)
  page.on('requestfailed', (r) => {
    if (localRes(r.url())) problems.push(`[${item.name}] 本地资源加载失败: ${r.url()}`)
    else console.log(`  (${item.name}) 外链加载失败（字体会用系统字体兜底）: ${r.url()}`)
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && localRes(r.url())) problems.push(`[${item.name}] HTTP ${r.status()}: ${r.url()}`)
  })
  page.on('pageerror', (e) => problems.push(`[${item.name}] pageerror: ${e.message}`))
  await page.goto(base + (item.url ?? ''), { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__hs, null, { timeout: 15000 })
  for (const step of item.steps) {
    if (step.wait) await page.waitForTimeout(step.wait)
    if (step.reload) {
      await page.reload({ waitUntil: 'load' })
      await page.waitForFunction(() => !!window.__hs, null, { timeout: 15000 })
    }
    if (step.resetPerf) await page.evaluate(() => window.__hs.resetPerf())
    if (step.drag) await drag(page, step)
    if (step.key) await page.keyboard.press(step.key === '`' ? 'Backquote' : step.key)
    if (step.click) {
      const [cx, cy] = await toClient(page, step.click[0], step.click[1])
      await page.mouse.click(cx, cy)
    }
    if (step.eval) await page.evaluate(step.eval)
    if (step.perf) {
      const p = await page.evaluate(() => window.__hs.perfTotals())
      console.log(
        `[帧时间] ${step.perf}：平均帧时间 ${p.avgFrameMs.toFixed(2)}ms（约 ${(1000 / p.avgFrameMs).toFixed(0)}fps），逻辑+绘制平均 ${p.avgCpuMs.toFixed(2)}ms，最差一帧 ${p.worstFrameMs.toFixed(1)}ms，共 ${p.frames} 帧`,
      )
      const extra = await page.evaluate(() => (window.__hs.stats ? window.__hs.stats() : null))
      if (extra) console.log(`[统计] ${JSON.stringify(extra)}`)
    }
    if (step.stats) {
      const st = await page.evaluate(() => (window.__hs.stats ? window.__hs.stats() : null))
      console.log(`[统计] ${step.stats}：${JSON.stringify(st)}`)
    }
    if (step.shot) {
      if (!step.noWait) await page.waitForTimeout(100)
      const file = join(outDir, `${step.shot}.png`)
      await page.screenshot({ path: file })
      shots.push(file)
    }
  }
  await ctx.close()
}

await browser.close()
await (server.close ? server.close() : new Promise((r) => server.httpServer.close(r)))

console.log('\n截图：')
for (const s of shots) console.log('  ' + s.replace(root + '\\', '').replace(root + '/', ''))
if (problems.length) {
  console.log('\n发现问题：')
  for (const p of problems) console.log('  ' + p)
  process.exit(1)
} else {
  console.log('\n没有控制台报错。')
}
