// 统计未跟踪文件规模（决定是否入库归档）
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const out = execSync('git status --porcelain', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const untracked = out
  .split('\n')
  .filter(l => l.startsWith('?? '))
  .map(l => l.slice(3).trim().replace(/^"|"$/g, ''))

const files = []
const walk = p => {
  let st
  try {
    st = fs.statSync(p)
  } catch {
    return
  }
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) walk(path.join(p, e))
  } else {
    files.push({ path: p, size: st.size })
  }
}
for (const u of untracked) walk(u.replace(/\/$/, ''))

const total = files.reduce((a, f) => a + f.size, 0)
console.log(`未跟踪条目 ${untracked.length} 个 → 文件 ${files.length} 个，合计 ${(total / 1024 / 1024).toFixed(2)} MB`)
console.log('\n最大的 10 个:')
files.sort((a, b) => b.size - a.size).slice(0, 10).forEach(f => {
  console.log(`  ${(f.size / 1024).toFixed(1)} KB  ${f.path.replace(/\\/g, '/')}`)
})
const byExt = new Map()
for (const f of files) {
  const ext = path.extname(f.path) || '(无扩展名)'
  const cur = byExt.get(ext) ?? { n: 0, size: 0 }
  cur.n++
  cur.size += f.size
  byExt.set(ext, cur)
}
console.log('\n按扩展名:')
;[...byExt.entries()]
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 12)
  .forEach(([ext, v]) => console.log(`  ${(v.size / 1024 / 1024).toFixed(2)} MB  ${ext}  (${v.n} 个)`))
