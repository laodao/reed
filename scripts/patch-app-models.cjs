const { DatabaseSync } = require('node:sqlite')

const db = new DatabaseSync(process.env.DB)

// 每个应用要添加的 model 字段（modelTypes 按该应用使用的模型类节点类型决定）
const APP_SPECS = [
  {
    defId: 'wfdef_1787369961893_tiyl3pdkn', // 文档翻译
    modelKeyType: 'text', // translate 节点用文本模型
    nodeTypes: ['translate'],
  },
  {
    defId: 'wfdef_1787369961905_x5enk8slj', // 文本转语音
    modelKeyType: 'audio',
    nodeTypes: ['tts'],
  },
  {
    defId: 'wfdef_1787369961915_tl8hmxva4', // 语音转文本
    modelKeyType: 'audio',
    nodeTypes: ['stt'],
  },
  {
    defId: 'wfdef_1787370001463_8ouustokt', // 语音复刻
    modelKeyType: 'audio',
    nodeTypes: ['tts'], // 复刻里的 tts 节点
  },
  {
    defId: 'wfdef_1787369961870_73ms9hnrp', // 图像生成
    modelKeyType: 'image',
    nodeTypes: ['image-gen'],
  },
]

const MODEL_TYPE_MAP = {
  text: ['text', 'multimodal'],
  audio: ['audio', 'multimodal'],
  image: ['image'],
}

function transformGraph(graph, spec) {
  if (!graph || !Array.isArray(graph.nodes)) return null
  const start = graph.nodes.find(n => n.type === 'start')
  if (!start) return graph
  const inputs = start.config?.inputs ?? []
  // 移除旧的裸 modelId 字符串输入（图像生成/早期模板遗留），改用 model 联动字段
  const filtered = inputs.filter(i => !(i.type === 'string' && i.key === 'modelId'))
  // 已加过 model 字段则跳过
  if (!filtered.some(i => i.type === 'model')) {
    filtered.push({
      key: 'model',
      label: spec.nodeTypes[0] === 'translate' ? '模型' : spec.nodeTypes[0] === 'image-gen' ? '图像模型' : spec.nodeTypes[0] === 'tts' ? '合成模型' : '模型',
      type: 'model',
      modelTypes: MODEL_TYPE_MAP[spec.modelKeyType],
      ...(spec.nodeTypes[0] === 'image-gen' ? { required: true } : {}),
    })
  }
  start.config.inputs = filtered
  // 给目标节点加 providerConfigId/modelId 引用
  for (const node of graph.nodes) {
    if (!spec.nodeTypes.includes(node.type)) continue
    node.config = node.config ?? {}
    node.config.providerConfigId = '{{start.model.providerConfigId}}'
    node.config.modelId = '{{start.model.modelId}}'
  }
  return graph
}

let changed = 0
const stmt = db.prepare('SELECT id, name, draft_graph, published_graph FROM workflow_definitions WHERE id = ?')
const upd = db.prepare('UPDATE workflow_definitions SET draft_graph = ?, published_graph = ?, updated_at = ? WHERE id = ?')
for (const spec of APP_SPECS) {
  const row = stmt.get(spec.defId)
  if (!row) { console.log(`[skip] ${spec.defId} 不存在`); continue }
  const draft = row.draft_graph ? JSON.parse(row.draft_graph) : null
  const pub = row.published_graph ? JSON.parse(row.published_graph) : null
  const nd = transformGraph(draft, spec)
  const np = transformGraph(pub, spec)
  if (!nd && !np) { console.log(`[skip] ${row.name} 无图`); continue }
  const now = new Date().toISOString()
  upd.run(JSON.stringify(nd ?? draft), JSON.stringify(np ?? pub), now, spec.defId)
  changed++
  console.log(`[ok] ${row.name} (${spec.defId}) 已更新`)
}

console.log(`完成，更新 ${changed} 条定义`)
