import { defineConfig } from 'vite'

// base 用相对路径：同一份构建产物既能在本地 preview 跑，也能放在
// https://artist3dot-hue.github.io/haircut-swim/ 这种子路径下跑。
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
  server: {
    strictPort: true,
  },
})
