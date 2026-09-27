// 全局上下文：各场景通过它拿到画面、输入、场景管理等。

import type { Screen } from './core/screen'
import type { Input } from './core/input'
import type { SceneManager } from './core/scene'
import type { PerfStats } from './core/perf'

export type SceneName = 'hub' | 'cut' | 'test'

export interface Game {
  readonly screen: Screen
  readonly input: Input
  readonly scenes: SceneManager
  readonly perf: PerfStats
  /** 带过渡动画切到某个场景（场景之间不直接互相 import） */
  goto(name: SceneName): void
}
