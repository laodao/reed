// 摘要 V3 定义（graph 内层）：start 入参 + 时长/画质相关字段
const fs = require('fs')
const g = JSON.parse(fs.readFileSync('src/core/database/migrations/builtin-apps/script-to-video-v3.json', 'utf8'))
const nodes = g.graph.nodes
console.log('DEF:', g.name, '| kind:', g.kind, '| nodes:', nodes.length, '| edges:', g.graph.edges.length)
const start = nodes.find(n => n.id === 'start')
if (start) {
  console.log('\nSTART inputs:')
  for (const i of (start.config && start.config.inputs) || []) {
    console.log(`- ${i.name} [${i.type}]${i.required ? ' *' : ''} default=${JSON.stringify(i.default)} opts=${JSON.stringify(i.options || null)}`)
  }
}
for (const n of nodes) {
  const s = JSON.stringify(n.config || {})
  if (/(videoQuality|h3Steps|总时长|目标时长|60 秒|60秒)/.test(s)) {
    console.log('\nNODE', n.id, n.type, '→', s.slice(0, 500))
  }
}
