# 开发进度

## 阶段 0：搭项目 + 自动部署 ✅

- Vite + TypeScript（strict），纯 Canvas 2D；npm scripts：dev / build / preview / typecheck / verify
- 主循环：固定 60Hz 逻辑 + 渲染插值（`src/core/loop.ts`）
- 360×640 逻辑分辨率，PC 横屏居中、两侧模糊背景（`src/core/screen.ts`）
- `docs/art-refs/palette_ramps.json` → `src/art/palette.ts`（`npm run palette` 重新生成）
- `src/art/sprites.ts` 注册表：10 个已有图标；`assets/sprites/同名.png` 可顶替代码画的图
- `.github/workflows/deploy.yml`：推到 main 自动构建发布 GitHub Pages（Settings → Pages → Source 选 GitHub Actions，已设置）
- 测试画面：`?scene=test`
- 截图：`docs/screenshots/stage0/desktop-test.png`、`docs/screenshots/stage0/mobile-test.png`

## 阶段 1：手感原型 ✅

默认进入剪发画面（还没有主界面）；`?scene=cut&seed=7` 固定随机种子，`?scene=test` 是阶段 0 测试画面。无计时、无结算，可以无限剪。

| 反馈 | 做法 | 代码 |
| --- | --- | --- |
| 头发 | 160 根 Verlet 链（前层 60%、后层 40%），从头皮弧线垂下、根部持续送出新长度；风让发丝波浪式摆动；按"材料坐标"加卷曲，剪断时形状不跳 | `src/hair/strand.ts`、`field.ts` |
| 渲染 | 自写像素光栅（ImageData Uint32），1px 线；前层近景 30% 画 2px（右侧暗一档）；根深末端亮，约 1/4 头发在卷曲朝左上处有 `#324143`→`#819aab` 高光段 | `src/hair/raster.ts` |
| 剪刀 | 代码画的像素剪刀（blade 刃 + 粉色把手 + 影子），6 帧开合；指数平滑跟手；每 0.3 秒闭合的瞬间用刃线（带厚度）求交，每根头发取最靠根部的交点 | `src/art/scissors.ts`、`src/scenes/cut.ts` |
| 预反馈 | 剪刀附近的头发被带着走、往两边拨开一点 | `Push`（strand.ts） |
| 咔嚓音 | 高通噪声 + 4 个金属泛音 + 低"咔"，音高随机 ±8%，每 10 连击升半音（最多一个八度）；同帧多根时错开几毫秒 | `src/audio/sfx.ts` |
| 限流 | 同一帧最多 6 个剪断音，其余并入常驻的"沙沙"噪声层（断发落地也往里加能量） | `sfx.snip()` / `rustle()` |
| 断发 | 断口以下的部分冻结成折线，带角速度、重力、空气阻力，向两边弹出 | `HairField.makePiece` |
| 碎屑 | 每次剪断 3–6 个 1px 碎屑（发色 + 偶尔蓝灰高光） | `src/juice/particles.ts` |
| 飘字 | 每根 "+1" 从断口弹出上飘 0.6 秒；一下剪 ≥3 根再在剪刀上方出总数；连击越高越大越金 | `src/juice/floaters.ts` |
| 吸入 | 断发落地 → 原地闪一下 → 光点沿贝塞尔曲线加速飞向左上计数器（带拖尾）→ 计数器弹簧缩放 + 变金 + 轻"叮"（连续到达音高上升） | `src/juice/collect.ts` |
| 连击 | 1 秒没剪到就断；10 ×1.1（升调）、50 ×1.5（大字 + 重音 + 3px 震屏）、100 ×2（剪刀彩虹拖尾）、500 ×3（屏幕边缘金光 + 鼓点）；下方显示连击数和断连倒计时条 | `src/scenes/cut.ts`、`src/data/juice.ts` |
| 手机 | 剪断时 `navigator.vibrate(8)`；手指操作时剪刀在手指上方 44px | |
| 调试面板 | 按 ` 键开关（DOM），19 个参数实时调，改过的值记在 localStorage，"恢复默认"清掉；下方显示 fps 和各种计数 | `src/ui/debug.ts` |

**验证**：build、typecheck 通过；`node scripts/verify.mjs --stage 1` 模拟拖动剪发 10 秒无报错，1080p 横屏平均帧时间 16.7ms（60fps），逻辑+绘制平均 3.2ms。10 秒内剪断约 400 根、连击到 200+，播放了约 115 个剪断音、约 270 个并入沙沙层。

截图（`docs/screenshots/stage1/`）：
- `cut-00-start.png` 开局
- `cut-01-first-cuts.png` 第一刀
- `cut-02-sweeping.png` 来回扫
- `cut-03-after-10s.png` 10 秒后（连击 200+，彩虹拖尾）
- `cut-04-debug-panel.png` 调试面板
- `cut-05-mobile.png` 手机竖屏

### 最影响手感的参数（`src/data/juice.ts`）

1. **`snapInterval`（咔嚓间隔 0.3）**：决定节奏感。0.2 以下变成"嗡嗡"连发，爽但没有节奏；0.4 以上会觉得剪刀迟钝。
2. **`scissorRadius` / `cutThickness`（22 / 7）**：一下能剪几根。现在扫过密集区一下约 10 根，飘字和声音刚好不糊；再大会一次剪几十根，限流会吞掉大部分咔嚓声。
3. **`followSharpness`（28）**：跟手。低于 15 有明显"拖着走"的延迟感，高于 40 在触屏上会抖。
4. **`growthSpeed`（14 像素/秒）**：追上玩家的压力。阶段 2 有了计时和爆表后要重新调。
5. **`pieceKick` / `pieceGravity`（70 / 620）**：断发飞散的"脆"感。弹出太小头发像直接掉下去，太大像爆炸。
6. **`comboTimeout`（1 秒）**：GDD 规定 1 秒；在头发被剪稀之后很容易断连，是之后"断连宽限"技能的调节空间。

## 决策记录

- **缩放**：能放下 2 倍以上用整数倍最近邻；只能放 1 倍时（1080p 横屏）先最近邻放大到向上取整倍，再平滑缩到填满高度（锐利缩放）；`screen.scaleMode = 'integer'` 可强制整数倍。
- **文字**：中文画在高清层（`screen.overlay()`，字体 ZCOOL QingKe HuangYou，加载失败用系统字体兜底）；数字用像素字体（`src/art/pixelfont.ts`）。
- **大数字**：1,234 → 1.23K → 4.56M → 7.89B → 之后用科学计数 1.23e12。
- **剪断飞出的是哪一截**：CLAUDE.md 写"上半截飞出"，GDD 第 7 节写"交点以下部分脱离"。按 GDD：断口以下的部分带旋转和重力下落，根部那截留在头上继续长。
- **端口**：dev 5180，preview 4180。
- **推送**：EDY 选择方案 A，每个阶段完成后同时推 `main-txf7on` 和 `main`，`main` 自动部署到 GitHub Pages。
- **头皮颜色**：调色板里没有肤色，头皮（发缝）借用暖粉地砖色阶 `SCENE.floor`。头顶整片画成梳过的头发（深色 + 左上光泽带），只在发缝露出一点头皮。
- **剪刀配色**：刃用 `blade` 色阶，把手用 `bladep`（粉），螺丝用 `steel`；影子用最深的瓷砖色半透明。
- **剪刀判定**：刃线是以鼠标为中心的水平线段（半长 = 剪刀半径），头发竖着垂，水平刃最符合直觉；闭合那一刻判定。
- **收益计入时机**：剪断时就计入（`bank`），计数器显示的是光点飞到后的值（`shown`），两者最终一致。
- **没动过鼠标时不自动剪**：开局剪刀停在中间不咔嚓，避免玩家还没操作就自己剪了；PC 上移动鼠标即可剪（不用按住），手机上拖动手指。
- **声音解锁**：浏览器要求用户手势后才能出声；PC 上只移动鼠标不算手势，所以画面底部提示"点一下画面开启声音"。
- **飘字数量**：一下剪 10 根时 10 个飘字会糊成一团，所以每下最多 4 个单根飘字（1 倍大小），另出一个总数飘字（随连击变大变金）。
- **头发段长**：GDD 写每根 8–16 段；头发最长要从头顶垂到地板（约 580px），16 段时每段 36px 太折，所以用固定 10px 一段（最多约 58 段），性能仍然足够（CPU 每帧约 3ms）。
- **两侧模糊背景**：CSS `filter: blur()` 在无 GPU 环境每帧多花约 70ms，改成把画面缩到 18×32 再让浏览器双线性放大（本身就是糊的），并用深青压暗。
- **验证脚本的浏览器**：Playwright 自带版本的浏览器不存在时，`scripts/verify.mjs` 自动退回到 `/opt/pw-browsers/chromium`（可用环境变量 `HS_CHROMIUM` 指定）。外链字体加载失败只记为提示，不算报错。

## 已知问题

- 无

## 设计建议

- 无
