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

## 决策记录

- **缩放**：能放下 2 倍以上用整数倍最近邻；只能放 1 倍时（1080p 横屏）先最近邻放大到向上取整倍，再平滑缩到填满高度（锐利缩放）；`screen.scaleMode = 'integer'` 可强制整数倍。
- **文字**：中文画在高清层（`screen.overlay()`，字体 ZCOOL QingKe HuangYou，加载失败用系统字体兜底）；数字用像素字体（`src/art/pixelfont.ts`）。
- **大数字**：1,234 → 1.23K → 4.56M → 7.89B → 之后用科学计数 1.23e12。
- **剪断飞出的是哪一截**：CLAUDE.md 写"上半截飞出"，GDD 第 7 节写"交点以下部分脱离"。按 GDD：断口以下的部分带旋转和重力下落，根部那截留在头上继续长。
- **端口**：dev 5180，preview 4180。
- **验证脚本的浏览器**：Playwright 自带版本的浏览器不存在时，`scripts/verify.mjs` 自动退回到 `/opt/pw-browsers/chromium`（可用环境变量 `HS_CHROMIUM` 指定）。外链字体加载失败只记为提示，不算报错。

## 已知问题

- 无

## 设计建议

- 无
