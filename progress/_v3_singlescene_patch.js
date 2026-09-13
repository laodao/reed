// 给 v3 JSON 的 shotsGen/shotPack 提示词追加“分镜原子/单场景”纪律
const fs = require('fs')
const FILE = 'src/core/database/migrations/builtin-apps/script-to-video-v3.json'
const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const g = doc.graph
const shotsGen = g.nodes.find(n => n.id === 'shotsGen')
const shotPack = g.nodes.find(n => n.id === 'shotPack')

const d1 = '\n【分镜原子纪律】以“口播的 | 分句/大纲段落”为镜头原子：同一镜只承载一个事件、一个地点、一个语义点；一句口播含多个事件或地点时必须拆成多个镜头，禁止把多个场景塞进同一镜的 visual。'
const d2 = '\n【单场景纪律】visual 与 imagery 只描述“一个主体 + 一处环境”的单一可拍场景；严禁“先…随后…/接着切到…/再出现…”这类多场景转场拼接；对比性修辞句只取一个代表性意象。'
if (!String(shotsGen.config.systemPrompt).includes('分镜原子纪律')) shotsGen.config.systemPrompt += d1
if (!String(shotPack.config.systemPrompt).includes('单场景纪律')) shotPack.config.systemPrompt += d2
fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n', 'utf-8')
console.log('patched shotsGen+shotPack single-scene discipline')
