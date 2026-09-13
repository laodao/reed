// 解析 run final：列出 save-asset 产出
const fs = require('fs')
const j = JSON.parse(fs.readFileSync('progress/_v2_run_final.json', 'utf-8'))
const saves = (j.data && j.data.nodeRuns || j.nodeRuns || []).filter(n => n.nodeType === 'save-asset' && n.status === 'succeeded')
for (const s of saves) console.log(s.nodeId, '|', s.output.assetId, '|', s.output.name)
const comp = (j.data && j.data.nodeRuns || j.nodeRuns || []).find(n => n.nodeType === 'video-compose')
if (comp) console.log('compose:', comp.output.videoPath, 'duration=' + comp.output.duration)
