// 监视文档资源目录：定位「图片落盘后又消失」的删除时刻与文件
// 运行：node progress/_watch_assets.cjs <dir> [秒数]
const fs = require('fs')
const path = require('path')

const dir = process.argv[2] || 'C:\\Users\\daoge\\the-bot\\knowledge-base\\3dca5cae-8c6f-4bb6-bfa5-bc829df90f5d\\documents\\assets\\5bf8f597-2042-4966-989e-ce6505851353'
const seconds = Number(process.argv[3] || 180)

function countFiles(root) {
  let n = 0
  const walk = d => {
    let entries
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) walk(path.join(d, e.name))
      else n++
    }
  }
  walk(root)
  return n
}

console.log(`[watch] 目录: ${dir}，监视 ${seconds}s`)
console.log(`[watch] 起始文件数: ${countFiles(dir)}`)

let added = 0
let removed = 0
const recentRemoved = []
const start = Date.now()

let watcher = null
try {
  watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
    const full = filename ? path.join(dir, filename) : ''
    const exists = full ? fs.existsSync(full) : false
    const t = ((Date.now() - start) / 1000).toFixed(1)
    if (eventType === 'rename' && !exists) {
      removed++
      if (recentRemoved.length < 12) recentRemoved.push(`${t}s ${filename}`)
    } else if (eventType === 'rename' && exists) {
      added++
    }
  })
} catch (e) {
  console.error('[watch] 无法监视:', e.message)
}

const timer = setInterval(() => {
  console.log(`[watch] t=${((Date.now() - start) / 1000).toFixed(0)}s 文件数=${countFiles(dir)} 新增事件=${added} 删除事件=${removed}`)
}, 5000)

setTimeout(() => {
  clearInterval(timer)
  if (watcher) watcher.close()
  console.log(`[watch] 结束：新增事件=${added} 删除事件=${removed} 结束文件数=${countFiles(dir)}`)
  console.log('[watch] 最早的删除样本:')
  recentRemoved.forEach(x => console.log('   ', x))
  process.exit(0)
}, seconds * 1000)
