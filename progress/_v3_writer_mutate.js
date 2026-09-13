// P2b：V3 JSON 写作层技能化改造（删除 outlineGen/outlineMd，插入 writerPick/writerCall/writerMd）
const fs = require('fs')
const FILE = 'src/core/database/migrations/builtin-apps/script-to-video-v3.json'
const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const g = doc.graph

// ---------- 1) start 增加 writerSkill / writerAttitude / writerAngle ----------
const start = g.nodes.find(n => n.id === 'start')
const ins = start.config.inputs
const idx = ins.findIndex(i => i.key === 'visualStrategy')
const add = [
  { key: 'writerSkill', label: '脚本文体技能', type: 'select', required: false, defaultValue: 'auto', help: 'auto=按视频类型默认映射；也可直接选技能', options: [
    { label: '自动（按视频类型）', value: 'auto' },
    { label: '新闻调查·财经（video-writer-investigative）', value: 'video-writer-investigative' },
    { label: '通用标准（video-writer-standard）', value: 'video-writer-standard' },
  ] },
  { key: 'writerAttitude', label: '写作态度档', type: 'select', required: false, defaultValue: 'auto', help: '新闻调查技能的态度档：冷静调查/犀利质疑/共情叙事', options: [
    { label: '自动', value: 'auto' },
    { label: '冷静调查', value: '冷静调查' },
    { label: '犀利质疑', value: '犀利质疑' },
    { label: '共情叙事', value: '共情叙事' },
  ] },
  { key: 'writerAngle', label: '报道角度/想质疑的点（可空）', type: 'textarea', required: false, defaultValue: '', help: '自由描述报道主线/立场/想强调的质疑；空=技能默认角度' },
]
ins.splice(idx + 1, 0, ...add)

// ---------- 2) 移除 outlineGen / outlineMd 及其入边，改造相关出边 ----------
const dropNodes = new Set(['outlineGen', 'outlineMd'])
g.nodes = g.nodes.filter(n => !dropNodes.has(n.id))
const keep = []
for (const e of g.edges) {
  const s = e.sourceNodeId
  const t = e.targetNodeId
  if (s === 'strategy' && t === 'outlineGen') { e.targetNodeId = 'writerPick'; keep.push(e); continue }
  if (s === 'outlineMd' && t === 'outlineReview') { e.sourceNodeId = 'writerMd'; keep.push(e); continue }
  if (dropNodes.has(s) || dropNodes.has(t)) continue
  keep.push(e)
}
g.edges = keep

// ---------- 3) 插入 writerPick / writerCall / writerMd ----------
const posBase = { x: 340, y: 260 }
const newNode = (id, type, name, config, n) => ({ id, type, name, position: { x: posBase.x + n * 40, y: posBase.y + n * 30 }, config })
const writerPickCode = `const t = String(inputs.videoType || '');
const w = String(inputs.writerSkill || 'auto');
const map = { 'financial-deep': 'video-writer-investigative' };
if (w && w !== 'auto') return { skillId: w };
return { skillId: map[t] || 'video-writer-standard' };`
const writerMdCode = `const raw = String(inputs.content || '');
const cleaned = raw.replace(/^\`\`\`[a-zA-Z]*\\n?/, '').replace(/\`\`\`$/, '').trim();
if (!cleaned) throw new Error('写作技能输出为空，请重试或更换技能');
return { md: cleaned };`
const nodesAdd = [
  newNode('writerPick', 'code', '按类型选写作技能', { inputs: [
    { key: 'videoType', value: '{{start.videoType}}' },
    { key: 'writerSkill', value: '{{start.writerSkill}}' },
  ], code: writerPickCode }, 0),
  newNode('writerCall', 'skill-call', '写作技能调用', {
    skillId: '{{writerPick.result.skillId}}',
    providerConfigId: '{{start.model.providerConfigId}}',
    modelId: '{{start.model.modelId}}',
    inputs: [
      { key: 'material', value: '{{scriptSrc.result.text}}' },
      { key: 'context', value: '{{kbText.result.text}}' },
      { key: 'topic', value: '{{start.topic}}' },
      { key: 'keyPoints', value: '{{start.keyPoints}}' },
      { key: 'attitude', value: '{{start.writerAttitude}}' },
      { key: 'angle', value: '{{start.writerAngle}}' },
    ],
  }, 1),
  newNode('writerMd', 'code', '大纲规整', { inputs: [{ key: 'content', value: '{{writerCall.content}}' }], code: writerMdCode }, 2),
]
g.nodes = g.nodes.concat(nodesAdd)

// ---------- 4) 新增边 writerPick→writerCall、writerCall→writerMd ----------
const eid = (p) => 'w' + p
g.edges.push(
  { id: eid(1), sourceNodeId: 'writerPick', targetNodeId: 'writerCall', kind: 'normal' },
  { id: eid(2), sourceNodeId: 'writerCall', targetNodeId: 'writerMd', kind: 'normal' },
)

// ---------- 5) outlineReview.payload.md 绑定 writerMd ----------
const orv = g.nodes.find(n => n.id === 'outlineReview')
orv.config.payload.md = '{{writerMd.result.md}}'

// ---------- 6) 校验无残留引用 ----------
const blob = JSON.stringify(g)
for (const dead of ['outlineGen', 'outlineMd']) {
  if (blob.includes(dead)) throw new Error('仍存在对已删除节点的引用: ' + dead)
}

fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n', 'utf-8')
console.log('OK nodes=' + g.nodes.length + ' edges=' + g.edges.length)
