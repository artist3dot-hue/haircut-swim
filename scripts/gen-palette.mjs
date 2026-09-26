// 把 docs/art-refs/palette_ramps.json 转成 src/art/palette.ts 里 RAMPS 这一段。
// 只替换 `// <ramps>` 和 `// </ramps>` 之间的内容，文件其余部分（场景主色等）手写维护。
// 用法：npm run palette
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'docs/art-refs/palette_ramps.json')
const out = join(root, 'src/art/palette.ts')

const ramps = JSON.parse(readFileSync(src, 'utf8'))
const lines = ['export const RAMPS = {']
for (const [name, colors] of Object.entries(ramps)) {
  if (!Array.isArray(colors) || colors.length !== 5) throw new Error(`色阶 ${name} 不是 5 档`)
  lines.push(`  ${name}: [${colors.map((c) => `'${c.toLowerCase()}'`).join(', ')}],`)
}
lines.push('} as const')
const block = `// <ramps>\n// 由 scripts/gen-palette.mjs 从 docs/art-refs/palette_ramps.json 生成，不要手改这一段。\n${lines.join('\n')}\n// </ramps>`

if (!existsSync(out)) throw new Error('src/art/palette.ts 不存在')
const text = readFileSync(out, 'utf8')
const re = /\/\/ <ramps>[\s\S]*?\/\/ <\/ramps>/
if (!re.test(text)) throw new Error('palette.ts 里找不到 <ramps> 标记')
writeFileSync(out, text.replace(re, block))
console.log(`已写入 ${Object.keys(ramps).length} 个色阶 → src/art/palette.ts`)
