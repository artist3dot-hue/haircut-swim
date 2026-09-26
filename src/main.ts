// 入口：搭好画面、输入、主循环，然后进入第一个场景。

import './style.css'
import { Screen } from './core/screen'
import { Input } from './core/input'
import { SceneManager } from './core/scene'
import { FixedLoop } from './core/loop'
import { PerfStats } from './core/perf'
import { loadSpriteFiles } from './art/sprites'
import { loadFonts } from './art/text'
import { allText } from './data/strings'
import { TestScene } from './scenes/test'
import type { Game } from './game'

async function boot(): Promise<void> {
  const root = document.getElementById('app')
  if (!root) throw new Error('找不到 #app')
  const screen = new Screen(root)
  const input = new Input(screen)
  const scenes = new SceneManager()
  const perf = new PerfStats()
  const game: Game = { screen, input, scenes, perf }

  await Promise.all([loadSpriteFiles(), loadFonts(allText())])

  scenes.set(new TestScene(game))

  const loop = new FixedLoop(
    (dt) => scenes.update(dt),
    (alpha, frameDt) => {
      const t0 = performance.now()
      scenes.render(alpha)
      screen.present()
      scenes.overlay(screen.overlay(), alpha)
      screen.tickBackdrop(frameDt)
      perf.record(frameDt, performance.now() - t0)
    },
  )
  loop.start()
  document.getElementById('boot')?.remove()

  // 给验证脚本和调试用
  ;(window as unknown as { __hs: unknown }).__hs = {
    game,
    perf: () => perf.snapshot(),
    perfTotals: () => ({ frames: perf.totalFrames, avgFrameMs: perf.totalFrameMs / Math.max(1, perf.totalFrames), avgCpuMs: perf.totalCpuMs / Math.max(1, perf.totalFrames), worstFrameMs: perf.worstFrameMs }),
    resetPerf: () => perf.resetTotals(),
    scene: () => scenes.current?.name,
  }
}

boot().catch((err: unknown) => {
  console.error(err)
  const el = document.getElementById('boot')
  if (el) el.textContent = `启动失败：${err instanceof Error ? err.message : String(err)}`
})
