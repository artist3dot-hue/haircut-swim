// 去掉文件开头的 UTF-8 BOM（Windows PowerShell 5.1 写文件会自动加）。
// 用法：node scripts/strip-bom.mjs 文件1 文件2 ...
import { readFileSync, writeFileSync } from 'node:fs'

for (const f of process.argv.slice(2)) {
  const buf = readFileSync(f)
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    writeFileSync(f, buf.subarray(3))
    console.log(`已去掉 BOM：${f}`)
  }
}
