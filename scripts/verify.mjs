// 验证脚本：启动 vite preview（需先 npm run build），用 Playwright 打开，按阶段截图、
// 模拟拖动剪发，打印控制台报错和平均帧时间。
// 用法：node scripts/verify.mjs --stage 1 [--only 名字] [--out 目录]
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
const stage = arg('stage', '0')
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
    { name: 'mobile-test', device: MOBILE, url: '?scene=test', steps: [{ wait: 1500 }, { shot: 'mobile-test' }] },
  ],
  1: [
    {
      name: 'cut-desktop',
      device: DESKTOP_1080,
      url: '?scene=cut&seed=7',
      steps: [
        { wait: 1200 },
        { shot: 'cut-00-start' },
        // 点一下：解锁声音（浏览器要求用户手势）
        { click: [180, 560] },
        { resetPerf: true },
        { drag: 1.2, from: [60, 330], to: [300, 360] },
        { shot: 'cut-01-first-cuts', noWait: true },
        { drag: 3, pattern: 'sweep', y: [300, 470] },
        { shot: 'cut-02-sweeping', noWait: true },
        { drag: 6, pattern: 'sweep', y: [220, 520] },
        { perf: '拖动剪发 10 秒' },
        { shot: 'cut-03-after-10s', noWait: true },
        { key: '`' },
        { wait: 300 },
        { shot: 'cut-04-debug-panel' },
      ],
    },
    {
      name: 'cut-mobile',
      device: MOBILE,
      url: '?scene=cut&seed=11',
      steps: [{ wait: 1200 }, { click: [180, 560] }, { drag: 3, pattern: 'sweep', y: [260, 480] }, { shot: 'cut-05-mobile', noWait: true }],
    },
  ],
  2: [
    {
      name: 'round-desktop',
      device: DESKTOP_1080,
      url: '?scene=cut&seed=7',
      steps: [
        { wait: 1200 },
        { shot: 'round-00-start' },
        { click: [180, 560] },
        { resetPerf: true },
        { drag: 10, pattern: 'sweep', y: [150, 520] },
        { perf: '一局中拖动 10 秒' },
        { shot: 'round-01-mid', noWait: true },
        // 头发一下长很多 → 危险预兆（边缘被头发侵占、发量条闪）
        // 剪刀先挪到左下角，别把刚长出来的头发剪掉
        { drag: 0.3, from: [4, 600], to: [4, 600] },
        { eval: 'window.__hs.debug().growAll(260)' },
        { drag: 0.6, from: [4, 600], to: [6, 600] },
        { shot: 'round-02-warning', noWait: true },
        // 再长 → 爆表 → 被头发淹没
        { eval: 'window.__hs.debug().growAll(400)' },
        { stats: '长头发后' },
        { wait: 1100 },
        { shot: 'round-03-drown', noWait: true },
        { wait: 1400 },
        { shot: 'round-04-result-drown', noWait: true },
        { stats: '爆表后' },
      ],
    },
    {
      name: 'round-cap',
      device: DESKTOP,
      url: '?scene=cut&seed=9',
      steps: [
        { wait: 1000 },
        { click: [180, 560] },
        { drag: 1.5, pattern: 'sweep', y: [200, 300] },
        // 把能剪的头发都剪到泳帽线以上，等 3 秒 → "可以去游泳了！"
        { eval: 'window.__hs.debug().trimAll()' },
        { drag: 1.6, from: [180, 560], to: [200, 560] },
        { shot: 'round-05-holding', noWait: true },
        { wait: 2200 },
        { shot: 'round-06-cap-prompt' },
        { click: [180, 418] },
        { drag: 2, pattern: 'sweep', y: [150, 400] },
        { shot: 'round-07-keep-cutting', noWait: true },
        { eval: 'window.__hs.debug().setTime(1.2)' },
        { wait: 3000 },
        { shot: 'round-08-result-time' },
        { stats: '时间到后' },
        { click: [180, 461] },
        { wait: 500 },
        { shot: 'round-09-again' },
      ],
    },
    {
      name: 'round-mobile',
      device: MOBILE,
      url: '?scene=cut&seed=11',
      steps: [{ wait: 1200 }, { click: [180, 560] }, { drag: 3, pattern: 'sweep', y: [140, 380] }, { shot: 'round-10-mobile', noWait: true }],
    },
  ],
  3: [
    {
      name: 'hub-desktop',
      device: DESKTOP_1080,
      url: '',
      steps: [
        { wait: 1400 },
        { shot: 'hub-00-first-visit' },
        // 点一下空墙解锁声音（点泳池会打开泳池弹窗）
        { click: [180, 240] },
        { drag: 0.5, from: [120, 300], to: [68, 118] },
        { wait: 150 },
        { shot: 'hub-01-hover-mirror' },
        { eval: 'window.__hs.debug().addHairs(20000)' },
        { click: [68, 118] },
        { wait: 500 },
        { shot: 'hub-02-skill-tree' },
        // 买：范围（上）、收获（右下）×2、时间（下）
        { click: [180, 192] },
        { click: [180, 606] },
        { click: [241, 297] },
        { click: [180, 606] },
        { click: [180, 606] },
        { click: [180, 332] },
        { click: [180, 606] },
        { wait: 200 },
        { shot: 'hub-03-tree-bought' },
        { stats: '买完技能' },
        { click: [322, 20] },
        { wait: 400 },
        { click: [320, 400] },
        { wait: 400 },
        { shot: 'hub-04-settings' },
        { click: [180, 470] },
        { eval: 'window.__hs.debug().setHubHair(0.95)' },
        { drag: 0.4, from: [180, 560], to: [180, 600] },
        { shot: 'hub-05-panic' },
        { click: [180, 380] },
        { wait: 280 },
        { shot: 'hub-06-transition', noWait: true },
        { wait: 900 },
        { drag: 2, pattern: 'sweep', y: [150, 420] },
        { shot: 'hub-07-cut-upgraded', noWait: true },
        { stats: '升级后的一局' },
        { eval: 'window.__hs.debug().setTime(1)' },
        { wait: 3200 },
        { shot: 'hub-08-result' },
        { click: [112, 461] },
        { wait: 1300 },
        { shot: 'hub-09-back-home' },
        { stats: '回到主界面' },
        { reload: true },
        { wait: 1400 },
        { stats: '刷新页面后（存档）' },
        { shot: 'hub-10-reloaded' },
      ],
    },
    {
      name: 'hub-mobile',
      device: MOBILE,
      url: '',
      steps: [{ wait: 1400 }, { eval: 'window.__hs.debug().setHubHair(0.3)' }, { wait: 300 }, { shot: 'hub-11-mobile' }],
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
      return [r.left + (x / 360) * r.width, r.top + (y / 640) * r.height]
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
    const x = 180 + Math.sin(t * 2.6) * 150
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
