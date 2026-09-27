// 主界面（第 1 层"小区泳池"）的代码像素图：青绿瓷砖墙、暖粉地砖、池水、各种物件、理发椅上的阿发。
// 只学参考图的画风（用色、左上受光、描边用自身最深档），构图按 GDD 4.1 自己排。
// 所有物件都是函数，传入偏移量就能做"悬停轻弹"。

import { SCENE, RAMPS } from './palette'
import { drawTiles, drawPoolside } from './pool'
import { drawSprite } from './sprites'
import type { Raster } from '../hair/raster'
import { u32 } from './palette'

export const WALL_BOTTOM = 256
export const FLOOR_TOP = 266
export const POOL_TOP = 472
/** 阿发脚下（头发铺开的地面高度） */
export const HUB_FLOOR_Y = 452

export type Expression = 'normal' | 'panic' | 'expect' | 'teary'

/** 静态背景：墙、踢脚线、地砖、池边、池水底色。 */
export function drawHubBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawTiles(ctx, 0, 0, w, WALL_BOTTOM, 20, 21)
  // 墙脚：珊瑚粉线 + 米黄踢脚线
  ctx.fillStyle = SCENE.coral
  ctx.fillRect(0, WALL_BOTTOM, w, 2)
  ctx.fillStyle = SCENE.poolside
  ctx.fillRect(0, WALL_BOTTOM + 2, w, FLOOR_TOP - WALL_BOTTOM - 2)
  ctx.fillStyle = SCENE.grout
  ctx.fillRect(0, FLOOR_TOP - 1, w, 1)
  for (let x = 12; x < w; x += 24) ctx.fillRect(x, WALL_BOTTOM + 2, 1, FLOOR_TOP - WALL_BOTTOM - 3)

  // 暖粉地砖：24px 一块，左上亮边、右下暗边
  const [fl, fm, fd] = SCENE.floor
  const tile = 24
  for (let y = FLOOR_TOP; y < POOL_TOP; y += tile) {
    for (let x = -6; x < w; x += tile) {
      const th = Math.min(tile, POOL_TOP - y)
      ctx.fillStyle = fd
      ctx.fillRect(x, y, tile, th)
      ctx.fillStyle = fm
      ctx.fillRect(x + 1, y + 1, tile - 1, th - 1)
      ctx.fillStyle = fl
      ctx.fillRect(x + 1, y + 1, tile - 2, 1)
      ctx.fillRect(x + 1, y + 1, 1, th - 2)
      // 稀疏抖点
      if (((x * 7 + y * 13) >>> 0) % 5 === 0) {
        ctx.fillStyle = fl
        ctx.fillRect(x + 8, y + 9, 1, 1)
        ctx.fillRect(x + 15, y + 5, 1, 1)
      }
    }
  }
  // 池边
  drawPoolside(ctx, 0, POOL_TOP, w, 14)
  // 池水：底色 + 水下瓷砖格
  const [wd, wm] = SCENE.water
  ctx.fillStyle = wd
  ctx.fillRect(0, POOL_TOP + 14, w, h - POOL_TOP - 14)
  ctx.fillStyle = wm
  for (let y = POOL_TOP + 30; y < h; y += 22) ctx.fillRect(0, y, w, 1)
  for (let x = 10; x < w; x += 22) ctx.fillRect(x, POOL_TOP + 14, 1, h - POOL_TOP - 14)
  // 池边在水里的影子
  ctx.fillStyle = SCENE.tile[3]
  ctx.fillRect(0, POOL_TOP + 14, w, 2)
}

/** 池水表面的波光（每帧画）。glow：解锁去游泳后更亮、带闪星。 */
export function drawWater(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, glow: boolean): void {
  const [, wm, wl] = SCENE.water
  for (let y = POOL_TOP + 20; y < h; y += 9) {
    for (let x = 0; x < w; x += 3) {
      const v = Math.sin(x * 0.06 + t * 1.6 + y * 0.3) + Math.sin(x * 0.11 - t * 1.1 + y)
      if (v > 1.3) {
        ctx.fillStyle = v > 1.75 || glow ? wl : wm
        ctx.fillRect(x, y + Math.round(Math.sin(x * 0.2 + t * 2) * 1.5), 3, 1)
      }
    }
  }
  if (glow) {
    const k = (Math.sin(t * 3) + 1) / 2
    for (let i = 0; i < 8; i++) {
      const x = Math.round(((i * 97 + Math.floor(t * 2) * 31) % 340) + 10)
      const y = Math.round(POOL_TOP + 30 + ((i * 53) % 120))
      ctx.fillStyle = SCENE.goldSpark
      if ((i + Math.floor(t * 4)) % 3 === 0) {
        ctx.fillRect(x - 2, y, 5, 1)
        ctx.fillRect(x, y - 2, 1, 5)
      }
      ctx.fillStyle = SCENE.hairGlint[1]
      ctx.fillRect(x, y, 1, 1)
    }
    ctx.fillStyle = SCENE.water[2]
    ctx.globalAlpha = 0.18 + k * 0.12
    ctx.fillRect(0, POOL_TOP + 14, w, h - POOL_TOP - 14)
    ctx.globalAlpha = 1
  }
}

/** 挂钩 + 泳帽。 */
export function drawCapHook(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const s = RAMPS.steel
  ctx.fillStyle = s[0]
  ctx.fillRect(x - 3, y - 22, 7, 5)
  ctx.fillStyle = s[3]
  ctx.fillRect(x - 2, y - 21, 5, 3)
  ctx.fillStyle = s[0]
  ctx.fillRect(x, y - 17, 2, 8)
  ctx.fillRect(x - 3, y - 10, 5, 2)
  drawSprite(ctx, 'icon.swim_cap_blue', x, y + 12)
}

/** 工具架：一块木板（orange 色阶当木头）+ 三件工具。 */
export function drawRack(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const o = RAMPS.orange
  // 支架
  ctx.fillStyle = o[0]
  ctx.fillRect(x + 8, y + 4, 3, 10)
  ctx.fillRect(x + 112, y + 4, 3, 10)
  // 板
  ctx.fillStyle = o[0]
  ctx.fillRect(x, y - 1, 124, 7)
  ctx.fillStyle = o[3]
  ctx.fillRect(x + 1, y, 122, 2)
  ctx.fillStyle = o[2]
  ctx.fillRect(x + 1, y + 2, 122, 3)
  ctx.fillStyle = o[4]
  ctx.fillRect(x + 1, y, 40, 1)
  drawSprite(ctx, 'icon.scissors', x + 24, y - 22)
  drawSprite(ctx, 'icon.comb', x + 62, y - 22)
  drawSprite(ctx, 'icon.clipper', x + 101, y - 22)
}

/** 小推车：steel 色阶的车架 + 两层，上面放洗发水和护发素。 */
export function drawTrolley(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const s = RAMPS.steel
  // 车腿
  ctx.fillStyle = s[0]
  ctx.fillRect(x + 2, y, 3, 60)
  ctx.fillRect(x + 71, y, 3, 60)
  ctx.fillStyle = s[3]
  ctx.fillRect(x + 3, y, 1, 58)
  ctx.fillRect(x + 72, y, 1, 58)
  // 两层托盘
  for (const yy of [y, y + 36]) {
    ctx.fillStyle = s[0]
    ctx.fillRect(x - 2, yy - 1, 80, 6)
    ctx.fillStyle = s[3]
    ctx.fillRect(x - 1, yy, 78, 2)
    ctx.fillStyle = s[2]
    ctx.fillRect(x - 1, yy + 2, 78, 2)
  }
  // 轮子
  for (const xx of [x + 3, x + 72]) {
    ctx.fillStyle = RAMPS.slate[0]
    ctx.fillRect(xx - 3, y + 60, 7, 6)
    ctx.fillStyle = RAMPS.slate[2]
    ctx.fillRect(xx - 2, y + 61, 5, 3)
  }
  drawSprite(ctx, 'icon.shampoo', x + 20, y - 23)
  drawSprite(ctx, 'icon.conditioner', x + 54, y - 23)
  // 下层：一条毛巾（pink 色阶）
  const p = RAMPS.pink
  ctx.fillStyle = p[0]
  ctx.fillRect(x + 10, y + 26, 40, 10)
  ctx.fillStyle = p[2]
  ctx.fillRect(x + 11, y + 27, 38, 8)
  ctx.fillStyle = p[3]
  ctx.fillRect(x + 11, y + 27, 38, 2)
  ctx.fillStyle = p[1]
  ctx.fillRect(x + 11, y + 32, 38, 1)
}

/** 收音机：pink 色阶机身 + steel 喇叭网 + gold 旋钮 + 天线；旁边飘音符。 */
export function drawRadio(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const p = RAMPS.pink
  const s = RAMPS.steel
  // 天线
  ctx.fillStyle = s[0]
  for (let i = 0; i < 16; i++) ctx.fillRect(x + 6 - Math.round(i * 0.5), y - 12 - i, 1, 1)
  ctx.fillStyle = s[4]
  ctx.fillRect(x - 2, y - 28, 2, 2)
  // 机身
  ctx.fillStyle = p[0]
  ctx.fillRect(x - 1, y - 13, 42, 26)
  ctx.fillRect(x, y - 14, 40, 28)
  ctx.fillStyle = p[2]
  ctx.fillRect(x + 1, y - 12, 38, 24)
  ctx.fillStyle = p[3]
  ctx.fillRect(x + 1, y - 12, 38, 2)
  ctx.fillRect(x + 1, y - 12, 2, 24)
  ctx.fillStyle = p[1]
  ctx.fillRect(x + 1, y + 10, 38, 2)
  ctx.fillRect(x + 37, y - 12, 2, 24)
  // 喇叭网
  ctx.fillStyle = s[0]
  ctx.fillRect(x + 5, y - 8, 18, 16)
  ctx.fillStyle = s[2]
  for (let j = 0; j < 7; j++) for (let i = 0; i < 8; i++) if ((i + j) % 2 === 0) ctx.fillRect(x + 6 + i * 2, y - 7 + j * 2, 1, 1)
  // 旋钮
  const g = RAMPS.gold
  ctx.fillStyle = g[0]
  ctx.fillRect(x + 27, y - 7, 7, 7)
  ctx.fillStyle = g[2]
  ctx.fillRect(x + 28, y - 6, 5, 5)
  ctx.fillStyle = g[4]
  ctx.fillRect(x + 28, y - 6, 2, 2)
  ctx.fillStyle = g[0]
  ctx.fillRect(x + 27, y + 3, 7, 3)
  // 飘出来的音符
  for (let i = 0; i < 2; i++) {
    const k = (t * 0.6 + i * 0.5) % 1
    const nx = Math.round(x + 44 - k * 6 + Math.sin(k * 6 + i) * 3)
    const ny = Math.round(y - 14 - k * 26)
    if (k > 0.85) continue
    ctx.fillStyle = SCENE.ui.text
    ctx.fillRect(nx + 3, ny - 6, 1, 7)
    ctx.fillRect(nx + 3, ny - 6, 3, 1)
    ctx.fillRect(nx + 1, ny, 3, 2)
  }
}

/** 理发椅（slate 椅身 + steel 立柱）。 */
export function drawChair(ctx: CanvasRenderingContext2D, cx: number, by: number): void {
  const sl = RAMPS.slate
  const st = RAMPS.steel
  // 底盘
  ctx.fillStyle = sl[0]
  ctx.fillRect(cx - 24, by - 3, 48, 7)
  ctx.fillRect(cx - 22, by - 4, 44, 9)
  ctx.fillStyle = sl[3]
  ctx.fillRect(cx - 22, by - 3, 44, 2)
  ctx.fillStyle = sl[2]
  ctx.fillRect(cx - 22, by - 1, 44, 3)
  // 立柱
  ctx.fillStyle = st[0]
  ctx.fillRect(cx - 4, by - 34, 8, 31)
  ctx.fillStyle = st[3]
  ctx.fillRect(cx - 3, by - 34, 2, 31)
  ctx.fillStyle = st[2]
  ctx.fillRect(cx - 1, by - 34, 3, 31)
  ctx.fillStyle = st[1]
  ctx.fillRect(cx + 2, by - 34, 1, 31)
  // 座
  ctx.fillStyle = sl[0]
  ctx.fillRect(cx - 35, by - 49, 70, 16)
  ctx.fillStyle = sl[3]
  ctx.fillRect(cx - 34, by - 48, 68, 3)
  ctx.fillStyle = sl[2]
  ctx.fillRect(cx - 34, by - 45, 68, 10)
  ctx.fillStyle = sl[1]
  ctx.fillRect(cx - 34, by - 37, 68, 3)
  // 扶手（steel）
  for (const sx of [-1, 1]) {
    const ax = cx + sx * 36 - (sx < 0 ? 4 : 0)
    ctx.fillStyle = st[0]
    ctx.fillRect(ax, by - 62, 5, 16)
    ctx.fillStyle = st[3]
    ctx.fillRect(ax + 1, by - 61, 2, 14)
  }
}

/** 椅背（在阿发身后，先画）。 */
export function drawChairBack(ctx: CanvasRenderingContext2D, cx: number, top: number, bottom: number): void {
  const sl = RAMPS.slate
  ctx.fillStyle = sl[0]
  ctx.fillRect(cx - 29, top + 2, 58, bottom - top - 2)
  ctx.fillRect(cx - 27, top, 54, 4)
  ctx.fillStyle = sl[2]
  ctx.fillRect(cx - 28, top + 3, 56, bottom - top - 4)
  ctx.fillStyle = sl[3]
  ctx.fillRect(cx - 28, top + 3, 56, 2)
  ctx.fillRect(cx - 28, top + 3, 3, bottom - top - 4)
  ctx.fillStyle = sl[1]
  ctx.fillRect(cx + 24, top + 3, 4, bottom - top - 4)
}

/**
 * 阿发：坐在椅子上，围着理发围布（label 色阶），脸和手用暖粉色阶。
 * (cx, headY) 是头的中心。expr 决定表情和手的动作。
 */
export function drawAfa(ctx: CanvasRenderingContext2D, cx: number, headY: number): void {
  const skin = SCENE.floor
  const hair = SCENE.hair
  const cape = RAMPS.label
  const sl = RAMPS.slate

  // 腿和鞋（围布下面露出来）
  for (const lx of [cx - 14, cx + 4]) {
    ctx.fillStyle = sl[0]
    ctx.fillRect(lx - 1, headY + 102, 12, 30)
    ctx.fillStyle = sl[2]
    ctx.fillRect(lx, headY + 102, 10, 26)
    ctx.fillStyle = sl[3]
    ctx.fillRect(lx, headY + 102, 2, 26)
    // 鞋
    ctx.fillStyle = hair[0]
    ctx.fillRect(lx - 2, headY + 128, 14, 6)
    ctx.fillStyle = sl[3]
    ctx.fillRect(lx - 1, headY + 129, 4, 1)
  }

  // 围布：从脖子往下展开的梯形，下摆锯齿
  const top = headY + 24
  const bottom = headY + 106
  for (let y = top; y <= bottom; y++) {
    const k = (y - top) / (bottom - top)
    const hw = Math.round(12 + k * 34)
    ctx.fillStyle = cape[0]
    ctx.fillRect(cx - hw - 1, y, hw * 2 + 2, 1)
    ctx.fillStyle = cape[2]
    ctx.fillRect(cx - hw, y, hw * 2, 1)
    ctx.fillStyle = cape[3]
    ctx.fillRect(cx - hw, y, Math.max(1, Math.round(hw * 0.55)), 1)
    ctx.fillStyle = cape[1]
    ctx.fillRect(cx + hw - Math.max(1, Math.round(hw * 0.45)), y, Math.max(1, Math.round(hw * 0.45)), 1)
  }
  // 下摆锯齿 + 领口
  ctx.fillStyle = cape[0]
  for (let x = cx - 46; x < cx + 46; x += 6) ctx.fillRect(x, bottom + 1, 3, 2)
  ctx.fillStyle = cape[4]
  ctx.fillRect(cx - 12, top, 24, 2)
  // 围布上的褶子
  ctx.fillStyle = cape[1]
  for (const fx of [-18, -6, 8, 20]) ctx.fillRect(cx + fx, top + 30, 1, 40 + (fx % 3) * 4)

  // 脖子
  ctx.fillStyle = skin[2]
  ctx.fillRect(cx - 6, headY + 14, 12, 12)
  ctx.fillStyle = skin[1]
  ctx.fillRect(cx - 5, headY + 14, 9, 11)
}

/** 头 + 脸 + 手（在头发之后画，盖住发根）。 */
export function drawAfaHead(ctx: CanvasRenderingContext2D, cx: number, cy: number, expr: Expression, t: number): void {
  const skin = SCENE.floor
  const hair = SCENE.hair
  const rx = 13
  const ry = 16
  // 耳朵
  for (const sx of [-1, 1]) {
    ctx.fillStyle = skin[2]
    ctx.fillRect(cx + sx * (rx + 1) - (sx < 0 ? 3 : 0), cy + 1, 4, 7)
    ctx.fillStyle = skin[1]
    ctx.fillRect(cx + sx * (rx + 1) - (sx < 0 ? 2 : 0), cy + 2, 2, 5)
  }
  // 脸（椭圆）：左上亮、右下暗，描边用色阶最深档
  for (let y = -ry; y <= ry; y++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))))
    if (hw <= 0) continue
    ctx.fillStyle = skin[2]
    ctx.fillRect(cx - hw - 1, cy + y, hw * 2 + 2, 1)
    ctx.fillStyle = skin[1]
    ctx.fillRect(cx - hw, cy + y, hw * 2, 1)
    ctx.fillStyle = skin[0]
    ctx.fillRect(cx - hw, cy + y, Math.round(hw * 0.7), 1)
    ctx.fillStyle = skin[2]
    ctx.fillRect(cx + hw - 2, cy + y, 2, 1)
  }
  // 头顶的头发 + 刘海（锯齿）+ 两侧的鬓发
  for (let y = -ry - 3; y <= 2; y++) {
    const hw = Math.round((rx + 3) * Math.sqrt(Math.max(0, 1 - (y * y) / ((ry + 3) * (ry + 3)))))
    if (hw <= 0) continue
    for (let x = -hw; x <= hw; x++) {
      const bang = -8 + ((x * 7 + 3) % 4 === 0 ? 3 : 0) + (Math.abs(x) > rx - 3 ? 12 : 0)
      if (y > bang) continue
      const light = x < -2 && y < -ry + 5 && (x + y) % 3 === 0
      ctx.fillStyle = light ? hair[3] : (x * 3 + y) % 5 === 0 ? hair[1] : hair[0]
      ctx.fillRect(cx + x, cy + y, 1, 1)
    }
  }
  ctx.fillStyle = hair[4]
  ctx.fillRect(cx - 8, cy - ry, 4, 1)
  ctx.fillRect(cx - 10, cy - ry + 1, 2, 1)

  const eyeY = cy + 1
  const dark = hair[0]
  const white = SCENE.ui.panel
  const glass = RAMPS.glass
  const blink = Math.floor(t * 10) % 37 === 0
  ctx.fillStyle = dark
  switch (expr) {
    case 'panic': {
      // 眼睛瞪大、眉毛八字、嘴巴 O、汗珠
      for (const ex of [cx - 7, cx + 4]) {
        ctx.fillStyle = dark
        ctx.fillRect(ex - 1, eyeY - 2, 5, 5)
        ctx.fillStyle = white
        ctx.fillRect(ex, eyeY - 1, 3, 3)
        ctx.fillStyle = dark
        ctx.fillRect(ex + 1, eyeY, 1, 1)
      }
      ctx.fillStyle = dark
      ctx.fillRect(cx - 9, eyeY - 5, 3, 1)
      ctx.fillRect(cx - 6, eyeY - 6, 2, 1)
      ctx.fillRect(cx + 4, eyeY - 6, 2, 1)
      ctx.fillRect(cx + 6, eyeY - 5, 3, 1)
      ctx.fillRect(cx - 2, cy + 8, 4, 1)
      ctx.fillRect(cx - 3, cy + 9, 1, 3)
      ctx.fillRect(cx + 2, cy + 9, 1, 3)
      ctx.fillRect(cx - 2, cy + 12, 4, 1)
      ctx.fillStyle = RAMPS.pink[0]
      ctx.fillRect(cx - 2, cy + 9, 4, 3)
      // 汗珠（上下晃）
      const sy = cy - 10 + Math.round(Math.sin(t * 6) * 1)
      ctx.fillStyle = glass[0]
      ctx.fillRect(cx + 16, sy, 3, 5)
      ctx.fillRect(cx + 17, sy - 1, 1, 1)
      ctx.fillStyle = glass[3]
      ctx.fillRect(cx + 16, sy + 1, 2, 3)
      ctx.fillStyle = glass[4]
      ctx.fillRect(cx + 16, sy + 1, 1, 1)
      break
    }
    case 'expect': {
      // ^ ^ 眼、大笑、脸红
      for (const ex of [cx - 7, cx + 4]) {
        ctx.fillRect(ex, eyeY, 1, 1)
        ctx.fillRect(ex + 1, eyeY - 1, 1, 1)
        ctx.fillRect(ex + 2, eyeY, 1, 1)
      }
      ctx.fillRect(cx - 4, cy + 7, 8, 1)
      ctx.fillRect(cx - 3, cy + 8, 6, 2)
      ctx.fillStyle = RAMPS.pink[0]
      ctx.fillRect(cx - 2, cy + 9, 4, 1)
      ctx.fillStyle = RAMPS.pink[2]
      ctx.fillRect(cx - 11, cy + 5, 3, 1)
      ctx.fillRect(cx + 8, cy + 5, 3, 1)
      break
    }
    case 'teary': {
      // > < 眼、嘴巴波浪、眼泪往下流
      ctx.fillRect(cx - 8, eyeY - 1, 1, 1)
      ctx.fillRect(cx - 7, eyeY, 2, 1)
      ctx.fillRect(cx - 8, eyeY + 1, 1, 1)
      ctx.fillRect(cx + 7, eyeY - 1, 1, 1)
      ctx.fillRect(cx + 5, eyeY, 2, 1)
      ctx.fillRect(cx + 7, eyeY + 1, 1, 1)
      for (let i = 0; i < 6; i++) ctx.fillRect(cx - 3 + i, cy + 9 + (i % 2), 1, 1)
      const k = (t * 1.5) % 1
      ctx.fillStyle = glass[1]
      ctx.fillRect(cx - 7, eyeY + 2, 1, 3 + Math.round(k * 6))
      ctx.fillRect(cx + 6, eyeY + 2, 1, 3 + Math.round(((k + 0.5) % 1) * 6))
      ctx.fillStyle = glass[3]
      ctx.fillRect(cx - 7, eyeY + 5 + Math.round(k * 6), 1, 1)
      break
    }
    default: {
      if (blink) {
        ctx.fillRect(cx - 7, eyeY + 1, 3, 1)
        ctx.fillRect(cx + 4, eyeY + 1, 3, 1)
      } else {
        ctx.fillRect(cx - 7, eyeY - 1, 2, 3)
        ctx.fillRect(cx + 5, eyeY - 1, 2, 3)
        ctx.fillStyle = white
        ctx.fillRect(cx - 7, eyeY - 1, 1, 1)
        ctx.fillRect(cx + 5, eyeY - 1, 1, 1)
        ctx.fillStyle = dark
      }
      ctx.fillRect(cx - 8, eyeY - 4, 4, 1)
      ctx.fillRect(cx + 4, eyeY - 4, 4, 1)
      ctx.fillRect(cx - 2, cy + 8, 4, 1)
      ctx.fillRect(cx - 3, cy + 7, 1, 1)
      ctx.fillRect(cx + 2, cy + 7, 1, 1)
    }
  }
  // 鼻子：一个暗点
  ctx.fillStyle = skin[2]
  ctx.fillRect(cx, cy + 4, 2, 2)

  // 手
  const hand = (x: number, y: number, fist: boolean): void => {
    ctx.fillStyle = skin[2]
    ctx.fillRect(x - 1, y - 1, 8, 8)
    ctx.fillStyle = skin[1]
    ctx.fillRect(x, y, 6, 6)
    ctx.fillStyle = skin[0]
    ctx.fillRect(x, y, 3, 2)
    if (fist) {
      ctx.fillStyle = skin[2]
      ctx.fillRect(x + 1, y + 2, 4, 1)
      ctx.fillRect(x + 1, y + 4, 4, 1)
    }
  }
  const sleeve = (x0: number, y0: number, x1: number, y1: number): void => {
    const cape = RAMPS.label
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n)
      const y = Math.round(y0 + ((y1 - y0) * i) / n)
      ctx.fillStyle = cape[0]
      ctx.fillRect(x - 3, y - 3, 7, 7)
    }
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n)
      const y = Math.round(y0 + ((y1 - y0) * i) / n)
      ctx.fillStyle = cape[2]
      ctx.fillRect(x - 2, y - 2, 5, 5)
      ctx.fillStyle = cape[3]
      ctx.fillRect(x - 2, y - 2, 2, 2)
    }
  }
  if (expr === 'expect') {
    // 握拳举起
    const bob = Math.round(Math.sin(t * 5) * 1.5)
    sleeve(cx + 26, cy + 42, cx + 22, cy + 22 + bob)
    hand(cx + 19, cy + 13 + bob, true)
  } else if (expr === 'teary') {
    // 双手捂头
    sleeve(cx - 26, cy + 40, cx - 18, cy - 4)
    sleeve(cx + 26, cy + 40, cx + 18, cy - 4)
    hand(cx - 22, cy - 16, false)
    hand(cx + 16, cy - 16, false)
  } else if (expr === 'panic') {
    // 两手举在脸旁边抖
    const sh = Math.round(Math.sin(t * 30))
    sleeve(cx - 28, cy + 42, cx - 24 + sh, cy + 16)
    sleeve(cx + 28, cy + 42, cx + 24 - sh, cy + 16)
    hand(cx - 30 + sh, cy + 6, false)
    hand(cx + 24 - sh, cy + 6, false)
  }
}

/**
 * 阿发的长发：从头顶分两边垂下，过肩、过椅子、拖到地上再向两边铺开。
 * len 0..1 是头发长度（主界面待着时慢慢变长）。画进像素光栅。
 */
export function drawAfaHair(r: Raster, cx: number, cy: number, len: number, t: number, count = 96): void {
  const H = SCENE.hair.map((h) => u32(h))
  const total = 150 + len * 420
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1)
    const side = u < 0.5 ? -1 : 1
    const a = -Math.PI + 0.25 + u * (Math.PI - 0.5)
    const spread = Math.abs(u - 0.5) * 2
    const jitter = ((i * 7919) % 97) / 97
    const ox = cx + Math.cos(a) * 12
    const oy = cy + Math.sin(a) * 15
    // 路径控制点：鬓角 → 肩 → 椅子两边 → 地面 → 在地上往外铺
    const pts: Array<[number, number]> = [
      [ox, oy],
      [cx + side * (14 + spread * 4), cy + 8],
      [cx + side * (20 + spread * 10 + jitter * 4), cy + 40],
      [cx + side * (26 + spread * 16 + jitter * 6), cy + 90],
      [cx + side * (30 + spread * 22 + jitter * 10), HUB_FLOOR_Y - 2 + jitter * 6],
    ]
    // 在地上呈扇形铺开：有的往外、有的往前（画面下方）
    const j2 = ((i * 104729) % 89) / 89
    const floorReach = 60 + j2 * 170
    pts.push([pts[4]![0] + side * floorReach * (0.4 + spread * 0.6), HUB_FLOOR_Y + (j2 - 0.35) * 26 + (1 - spread) * 10])
    const shiny = i % 4 === 1
    let left = total * (0.85 + jitter * 0.3)
    let px = pts[0]![0]
    let py = pts[0]![1]
    let s = 0
    for (let k = 1; k < pts.length && left > 0; k++) {
      const [x1, y1] = pts[k]!
      const [x0, y0] = pts[k - 1]!
      const segLen = Math.hypot(x1 - x0, y1 - y0)
      const steps = Math.max(1, Math.ceil(segLen / 4))
      for (let j = 1; j <= steps && left > 0; j++) {
        const f = j / steps
        let x = x0 + (x1 - x0) * f
        const y = y0 + (y1 - y0) * f
        const d = Math.min(4, segLen / steps)
        s += d
        left -= d
        const onFloor = k >= 5
        // 摆动：越往下越大；地上的只轻微飘
        const sway = onFloor ? Math.sin(t * 0.8 + i + s * 0.05) * 1.2 : Math.sin(t * 1.3 + i * 0.7 - s * 0.03) * Math.min(2.5, s / 50)
        x += sway + Math.sin(s * 0.12 + i) * 1.5
        const ci = s < 40 ? 0 : s < 140 ? 1 : 2
        let c = H[ci]!
        if (shiny && Math.cos(s * 0.12 + i) > 0.8 && s > 20) c = H[Math.cos(s * 0.12 + i) > 0.96 ? 4 : 3]!
        r.line(px, py, x, y, c, 0, true)
        px = x
        py = y
      }
    }
  }
}
