/**
 * 清理 electron-vite 误生成的孤儿编译产物
 *
 * 背景：electron.vite.config.ts 有时会被 IDE / vue-tsc / 误用 tsc --emit 等
 * 工具自动编译成 .js / .d.ts 并落到工程根。electron-vite 启动时按
 * "extensions: [.js, .mjs, .ts]" 顺序找配置，**优先加载 .js**——一旦本地存在
 * 老版本 .js 编译产物（不含最新 alias / plugin），所有 .ts 改动会被静默忽略，
 * 导致诡异的 "Rollup failed to resolve import @core/..." 等仅本机出现的错误。
 *
 * 这两个产物 .gitignore 已经忽略，但本地工具会反复生成。本脚本由
 * package.json 的 prebuild / predev hook 在 build / dev 之前清掉，让
 * electron-vite 始终从 .ts 源加载最新配置。
 *
 * 不依赖 rimraf——用 node 内置 fs 跨平台。
 */

const fs = require('fs')
const path = require('path')

const STALE = ['electron.vite.config.js', 'electron.vite.config.d.ts']

const root = path.resolve(__dirname, '..')
let removed = 0
for (const name of STALE) {
  const abs = path.join(root, name)
  if (fs.existsSync(abs)) {
    fs.unlinkSync(abs)
    console.log(`[clean-stale-vite-config] removed stale ${name}`)
    removed++
  }
}
if (removed === 0) {
  // 静默成功（绝大多数运行不会有产物）；输出为空，CI log 不会被刷屏
}
