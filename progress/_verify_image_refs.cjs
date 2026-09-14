// 校验：DB 中的图片引用是否都是 dataPath 相对路径，且逐一能在磁盘找到文件
// 运行：$env:ELECTRON_RUN_AS_NODE='1'; npx electron progress/_verify_image_refs.cjs
const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

const db = new Database('C:\\Users\\daoge\\the-bot\\the_bot.db', { readonly: true })
const dataPath = 'C:\\Users\\daoge\\the-bot'

const refs = new Map() // ref → 出现次数
for (const table of ['kb_chunks', 'kb_chapters']) {
  const rows = db.prepare(`SELECT content FROM ${table} WHERE content LIKE '%![%'`).all()
  for (const row of rows) {
    for (const m of String(row.content).matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      const ref = m[1].trim()
      refs.set(ref, (refs.get(ref) ?? 0) + 1)
    }
  }
}

console.log(`图片引用（去重）: ${refs.size}，出现总次数: ${[...refs.values()].reduce((a, b) => a + b, 0)}`)
let relative = 0
let absolute = 0
let remote = 0
let missing = 0
const missingSamples = []
for (const ref of refs.keys()) {
  if (/^https?:|^data:/i.test(ref)) {
    remote++
    continue
  }
  if (/^[A-Za-z]:[\\/]/.test(ref) || ref.startsWith('/')) {
    absolute++
    continue
  }
  relative++
  if (!fs.existsSync(path.join(dataPath, ref))) {
    missing++
    if (missingSamples.length < 5) missingSamples.push(ref)
  }
}

console.log(`相对路径 ${relative} | 绝对路径 ${absolute} | 远程 ${remote} | 相对但文件缺失 ${missing}`)
missingSamples.forEach(s => console.log('  缺失:', s))

// 磁盘上图片目录概况
const assetsRoot = path.join(dataPath, 'knowledge-base')
let dirs = 0
let files = 0
let bytes = 0
const walk = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'assets') dirs++
      walk(p)
    } else {
      files++
      bytes += fs.statSync(p).size
    }
  }
}
walk(assetsRoot)
console.log(`knowledge-base 下文件总数 ${files}，资源目录数 ${dirs}，合计 ${(bytes / 1024 / 1024).toFixed(2)} MB`)
db.close()
