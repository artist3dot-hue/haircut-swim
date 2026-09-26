// 全局上下文：各场景通过它拿到画面、输入、场景管理等。

import type { Screen } from './core/screen'
import type { Input } from './core/input'
import type { SceneManager } from './core/scene'
import type { PerfStats } from './core/perf'

export interface Game {
  readonly screen: Screen
  readonly input: Input
  readonly scenes: SceneManager
  readonly perf: PerfStats
}
