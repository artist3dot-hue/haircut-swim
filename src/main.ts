// 入口：搭好画面、输入、主循环，读存档，然后进入第一个场景。

import './style.css'
import { Screen } from './core/screen'
import { Input } from './core/input'
import { SceneManager, type Scene } from './core/scene'
import { FixedLoop } from './core/loop'
import { PerfStats } from './core/perf'
import { loadGame, startAutosave, save } from './core/save'
import { loadSpriteFiles } from './art/sprites'
import { drawCursor } from './art/cursor'
import { loadFonts } from './art/text'
import { allText } from './data/strings'
import { sfx } from './audio/sfx'
import { TestScene } from './scenes/test'
import { PoolScene } from './scenes/pool'
import { IntroScene } from './scenes/intro'
import type { Game, SceneName } from './game'

async function boot(): Promise<void> {
  const root = document.getElementById('app')
  if (!root) throw new Error('找不到 #app')
  const screen = new Screen(root)
  const input = new Input(screen)
  const scenes = new SceneManager()
  const perf = new PerfStats()
  loadGame()
  startAutosave()
  sfx.volume = save.settings.volume

  const make = (name: SceneName): Scene => {
    if (name === 'intro') return new IntroScene(game)
    if (name === 'test') return new TestScene(game)
    return new PoolScene(game)
  }
  const game: Game = {
    screen,
    input,
    scenes,
    perf,
    goto: (name) => scenes.go(() => make(name)),
  }
  scenes.onSwitch = () => sfx.whoosh()
  // 浏览器要求用户手势后才能出声：第一次点击 / 按键时解锁
  input.onGesture(() => sfx.unlock())

  await Promise.all([loadSpriteFiles(), loadFonts(allText())])

  // 按 ?scene= 进入场景（intro / cut / test）；第一次打开先放开场动画，之后直接到泳池边
  const which = new URLSearchParams(location.search).get('scene')
  if (which === 'test') scenes.set(make('test'))
  else if (which === 'intro' || (!which && !save.introSeen)) scenes.set(make('intro'))
  else scenes.set(make('pool'))

  const loop = new FixedLoop(
    (dt) => {
      scenes.update(dt)
      sfx.tick(dt)
    },
    (alpha, frameDt) => {
      const t0 = performance.now()
      scenes.render(alpha, screen.lctx)
      // 自己画的鼠标指针（只在用鼠标时；触屏不需要）
      const kind = scenes.current?.cursor ? scenes.current.cursor() : 'arrow'
      if (kind && input.seen && input.pointerType === 'mouse' && !scenes.transitioning) {
        screen.lctx.setTransform(1, 0, 0, 1, 0, 0)
        drawCursor(screen.lctx, kind, input.x, input.y)
      }
      screen.present()
      scenes.overlay(screen.overlay(), alpha)
      screen.tickBackdrop(frameDt)
      perf.record(frameDt, performance.now() - t0)
    },
  )
  loop.start()
  document.getElementById('boot')?.remove()

  // 给验证脚本和调试用
  type WithDebug = { stats?: () => Record<string, unknown>; debugApi?: () => Record<string, unknown> }
  const cur = (): WithDebug | null => scenes.current as unknown as WithDebug | null
  ;(window as unknown as { __hs: unknown }).__hs = {
    game,
    perf: () => perf.snapshot(),
    perfTotals: () => ({ frames: perf.totalFrames, avgFrameMs: perf.totalFrameMs / Math.max(1, perf.totalFrames), avgCpuMs: perf.totalCpuMs / Math.max(1, perf.totalFrames), worstFrameMs: perf.worstFrameMs }),
    resetPerf: () => perf.resetTotals(),
    scene: () => scenes.current?.name,
    stats: () => cur()?.stats?.() ?? null,
    debug: () => cur()?.debugApi?.() ?? null,
    save: () => save,
    setSpeed: (k: number) => {
      loop.speed = k
    },
  }
}

boot().catch((err: unknown) => {
  console.error(err)
  const el = document.getElementById('boot')
  if (el) el.textContent = `启动失败：${err instanceof Error ? err.message : String(err)}`
})
