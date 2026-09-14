// 生成 V2 内置工作流 script-to-video-v2.json（素材前置 · 两级审核 · KB/资产引用）
// 用 JS 构建图再 JSON.stringify 落盘，保证 JSON 合法（含中文/换行自动转义）
const fs = require('fs')
const path = require('path')

let nid = 0
const nodes = []
const edges = []
function addNode(id, type, name, x, y, config) {
  nodes.push({ id, type, name, position: { x, y }, config: config || {} })
}
function addEdge(sourceNodeId, targetNodeId, kind, extra) {
  const e = { id: `e${++nid}`, sourceNodeId, targetNodeId, kind }
  if (extra) Object.assign(e, extra)
  edges.push(e)
}

// ============ 提示词片段（避免超长重复） ============
const SCENE_RULE =
  '【画面硬性要求】visual 只描述可实拍物理场景（主体/动作/环境/光线/色调/构图景别/情绪/镜头运动），' +
  '禁止任何文字/UI/图形/图表/水印/贴片字幕（所有文字一律走 caption 字幕层）；每镜 1~3 句并给出运镜。'

const SHOT_OUT_SCHEMA =
  'JSON 数组结构：{"narration":"全片口播（原样保留可用 | 分句）","shots":[{"visual":"画面描述","caption":"该镜字幕短句","duration":秒数字,"baseChoice":-1}]}' +
  ' baseChoice=-1 表示不用底图资产；当存在与画面主体一致的底图资产时填其索引(>=0)。镜头总数 1~20。'

// ============ 节点 ============
addNode('start', 'start', '开始（脚本/主题+KB/风格/资产引用）', 40, 600, {
  inputs: [
    { key: 'scriptSource', label: '脚本来源', type: 'select', required: true, defaultValue: 'topic',
      options: [
        { label: '粘贴脚本文案（text）', value: 'text' },
        { label: '引用脚本/文案资产（asset）', value: 'asset' },
        { label: '主题+要点，从知识库生成脚本与大纲（topic）', value: 'topic' },
      ] },
    { key: 'scriptText', label: '脚本文案（粘贴，可为空）', type: 'textarea', required: false, defaultValue: '',
      help: '与 V1 相同的完整脚本 markdown；留空则由大纲阶段按主题+知识库生成' },
    { key: 'topic', label: '选题主题（scriptSource=topic 或脚本文案为空时使用）', type: 'string', required: false, defaultValue: '' },
    { key: 'keyPoints', label: '要点/口径期望（可选）', type: 'textarea', required: false, defaultValue: '',
      help: '希望覆盖的要点、涉及口径、倾向结论等' },
    { key: 'scriptAssetIds', label: '脚本/文案资产（多选，scriptSource=asset）', type: 'select-dynamic', source: 'assets:text', multi: true, required: false,
      help: '资产中心文本类资产多选（值=资产 ID），多个资产正文会合并引用' },
    { key: 'knowledgeBaseIds', label: '知识库（多选，脚本与大纲的事实口径参考）', type: 'select-dynamic', source: 'knowledgeBases', multi: true, required: false },
    { key: 'videoType', label: '视频类型预设', type: 'select', required: true, defaultValue: 'financial-deep',
      options: [
        { label: '财经深度', value: 'financial-deep' },
        { label: '资讯口播', value: 'news-talk' },
        { label: '知识科普', value: 'knowledge' },
        { label: '电商种草', value: 'ecommerce' },
        { label: '品牌宣传', value: 'brand' },
        { label: '旅行记录', value: 'travel' },
      ] },
    { key: 'videoStyle', label: '自由风格叠加（可选）', type: 'textarea', required: false, defaultValue: '' },
    { key: 'referenceAssetIds', label: '参考图资产（多选，作风格/主体参考）', type: 'select-dynamic', source: 'assets:image', multi: true, required: false,
      help: '图片资产多选；生成时取第一张作参考图生图' },
    { key: 'baseImageAssetIds', label: '底图资产（多选，供镜头直接作素材）', type: 'select-dynamic', source: 'assets:image', multi: true, required: false,
      help: '当某镜画面主体与某张底图一致时直接使用（拆解阶段自动匹配索引）' },
    { key: 'width', label: '视频宽度', type: 'number', defaultValue: 704 },
    { key: 'height', label: '视频高度', type: 'number', defaultValue: 1248 },
    { key: 'voiceId', label: '配音音色', type: 'string', required: true, defaultValue: '' },
    { key: 'voiceProviderConfigId', label: '配音 Provider', type: 'select-dynamic', source: 'providerConfigs', required: true },
    { key: 'videoProviderConfigId', label: '视频 Provider', type: 'select-dynamic', source: 'providerConfigs', required: true },
    { key: 'videoModelId', label: '视频模型 ID', type: 'string', required: true, defaultValue: 'h3' },
    { key: 'videoQuality', label: 'H3 画质档', type: 'select', required: false, defaultValue: 'high',
      options: [
        { label: '高清 high（704×1248 全质量）', value: 'high' },
        { label: '快速 low（480×864）', value: 'low' },
      ],
      help: 'ComfyUI H3：高清慢、快速档数倍提速（成片分辨率仍按 width/height 合成）' },
    { key: 'h3Steps', label: 'H3 采样步数', type: 'number', defaultValue: 20,
      help: '20=全质量（每镜约 5~15 分钟）；4=turbo（数倍提速，适合长视频试跑）' },
    { key: 'imageProviderConfigId', label: '文生图 Provider', type: 'select-dynamic', source: 'providerConfigs', required: true },
    { key: 'imageModelId', label: '文生图模型 ID', type: 'string', required: true, defaultValue: 'krea2' },
    { key: 'bgmPath', label: '背景音乐（可选）', type: 'string', required: false, defaultValue: '' },
    { key: 'model', label: '文案/拆解模型', type: 'model', modelTypes: ['text'], required: true },
  ],
})

// 资产读取：脚本/文案资产 + 参考图资产 + 底图资产
addNode('readScript', 'read-assets', '读取脚本/文案资产', 320, 420, { assetIds: '{{start.scriptAssetIds}}' })
addNode('readRef', 'read-assets', '读取参考图资产', 320, 560, { assetIds: '{{start.referenceAssetIds}}' })
addNode('readBase', 'read-assets', '读取底图资产', 320, 700, { assetIds: '{{start.baseImageAssetIds}}' })

// 参考图取首张（供 image-gen referenceImages）
addNode('refPick', 'code', '参考图取首张', 600, 560, {
  code: `const refs = inputs.refs || [];
return { first: (Array.isArray(refs) && refs.length > 0) ? refs[0] : '' };`,
  inputs: [
    { key: 'refs', value: '{{readRef.imagePaths}}' },
  ],
})

// 知识库多库检索（脚本/大纲参考；无库时也允许通过——查询来自主题/要点）
addNode('kbQuery', 'kb-query-multi', '多知识库检索参考', 600, 420, {
  knowledgeBaseIds: '{{start.knowledgeBaseIds}}',
  query: '{{start.topic}} {{start.keyPoints}}',
  topKPerKb: 6,
  maxResults: 24,
})

// KB 检索结果 → 可读文本（来源标注）
addNode('kbText', 'code', 'KB 结果转文本', 760, 420, {
  code: `const rows = Array.isArray(inputs.rows) ? inputs.rows : [];
if (rows.length === 0) return { text: '' };
return { text: rows.map((r, i) => '【来源' + (i + 1) + '｜库:' + String(r.knowledgeBaseId || '') + '｜文档:' + String(r.documentName || '') + '】' + String(r.content || '').slice(0, 500)).join('\\n\\n') };`,
  inputs: [
    { key: 'rows', value: '{{kbQuery.results}}' },
  ],
})

// 脚本/文案资产正文 → 待用文本
addNode('scriptSrc', 'code', '整理脚本文案来源', 760, 700, {
  code: `const mode = String(inputs.mode || 'topic');
const assetText = String(inputs.assetText || '');
const text = String(inputs.scriptText || '');
if (mode === 'asset') return { text: assetText };
if (mode === 'text') return { text };
return { text: '' }; // topic：由大纲阶段按主题+KB 生成`,
  inputs: [
    { key: 'mode', value: '{{start.scriptSource}}' },
    { key: 'scriptText', value: '{{start.scriptText}}' },
    { key: 'assetText', value: '{{readScript.textJoined}}' },
  ],
})

addNode('preset', 'video-preset', '视频类型预设装配', 600, 700, { videoType: '{{start.videoType}}', freeStyle: '{{start.videoStyle}}' })

// A. 大纲生成（含脚本补全/知识库参考）
addNode('outlineGen', 'llm-chat', '大纲生成（脚本/主题+知识库）', 900, 560, {
  systemPrompt:
    '你是资深短视频策划。输出可执行大纲 JSON。\n' +
    '【视频类型/风格规范】\n{{preset.promptBlock}}\n' +
    '【脚本来源】已有脚本则精炼为大纲；仅有主题/要点时结合知识库参考生成完整口播与大纲。\n' +
    '【知识库参考】（为空则忽略，不为空则事实口径须以其为准并标注来源：官方通报/当事人自述/媒体报道/年报数据等）\n{{kbText.result.text}}\n' +
    '【脚本/文案资产或粘贴文本参考】（为空则忽略）\n{{scriptSrc.result.text}}\n' +
    '【主题与要点】\n主题：{{start.topic}}\n要点：{{start.keyPoints}}\n' +
    '【产出 JSON】{"title":"标题","positioning":"一句话定位","narration":"全片完整口播（可分段，用 | 分句）",' +
    '"sections":[{"role":"段落作用","keyPoint":"本段要点","narration":"本段口播句"}],"structureNote":"结构说明"}' +
    '\n口播面向中文普通话，总时长估算 ≤300 秒（约 ≤20 镜）；事实与观点分离，涉来源口径标注。',
  prompt: '请综合以上素材输出大纲 JSON（无脚本文案且无知识库参考时，直接按主题与视频类型创作）。',
  jsonMode: true,
  providerConfigId: '{{start.model.providerConfigId}}',
  modelId: '{{start.model.modelId}}',
})

// 大纲渲染 markdown（供审核与存档）
addNode('outlineMd', 'code', '大纲渲染 markdown', 1180, 560, {
  code: `const o = inputs.outline || {};
const secs = Array.isArray(o.sections) ? o.sections : [];
const rows = secs.map((s, i) => '- **段落' + (i + 1) + '** ' + String(s.role || '') + '｜' + String(s.keyPoint || '') + '｜口播：' + String(s.narration || '')).join('\\n');
return { md: '## ' + String(o.title || '') + '\\n\\n**定位**：' + String(o.positioning || '') + '\\n\\n**结构**：' + String(o.structureNote || '') + '\\n\\n## 口播全文\\n\\n' + String(o.narration || '') + '\\n\\n## 分段\\n\\n' + rows };`,
  inputs: [
    { key: 'outline', value: '{{outlineGen.parsed}}' },
  ],
})

// 大纲审核（可改/驳）
addNode('outlineReview', 'human-review', '大纲审核', 1460, 560, {
  payload: { stage: '大纲审核：批准后进入分镜拆解', md: '{{outlineMd.result.md}}' },
  editableFields: [
    { key: 'md', label: '大纲全文', type: 'string' },
  ],
  timeoutMs: null,
  timeoutPolicy: 'fail',
})

// 底图清单文本（供拆解阶段自动匹配）
addNode('baseList', 'code', '底图清单文本', 1740, 760, {
  code: `const assets = Array.isArray(inputs.assets) ? inputs.assets : [];
return { text: assets.map((a, i) => '[' + i + '] ' + (a.name || '') + (a.description ? '：' + a.description : '')).join('\\n') };`,
  inputs: [
    { key: 'assets', value: '{{readBase.assets}}' },
  ],
})

// B. 分镜拆解（含底图自动匹配）
addNode('shotsGen', 'llm-chat', '分镜拆解（含底图匹配）', 2020, 560, {
  systemPrompt:
    '你是资深视频分镜师。依据用户确认的大纲把视频拆为 1~20 个镜头。' + SCENE_RULE + '\n' +
    '【大纲全文（用户已审核）】\n{{outlineReview.md}}\n' +
    '【可用底图资产】（名称/描述/索引，画面主体一致才选，否则 -1）：\n{{baseList.result.text}}\n' +
    '【镜头规则】字幕 caption 为画面要传达的文字（会烧录为字幕）；每镜 visual 独立可执行；duration 整数秒 4~16。' +
    '输出 ' + SHOT_OUT_SCHEMA,
  prompt: '请基于以上大纲与底图清单输出镜头 JSON。',
  jsonMode: true,
  providerConfigId: '{{start.model.providerConfigId}}',
  modelId: '{{start.model.modelId}}',
})

// 拆分：需生成的镜头 vs 直接用底图的镜头
addNode('splitShots', 'code', '拆分镜头（生成/底图）', 2300, 560, {
  code: `const shots = Array.isArray(inputs.shots) ? inputs.shots : [];
if (shots.length === 0) throw new Error('分镜拆解结果为空：请检查脚本/大纲内容后重试');
const hasBase = Array.isArray(inputs.bases) && inputs.bases.length > 0;
const gen = [];
const base = [];
shots.forEach((s, i) => {
  const s2 = Object.assign({}, s, { _origIndex: i });
  const bi = hasBase ? Number(s.baseChoice) : -1;
  if (Number.isInteger(bi) && bi >= 0 && bi < inputs.bases.length) {
    s2.baseImagePath = inputs.bases[bi].path || '';
    s2.baseImageUrl = inputs.bases[bi].url || '';
    s2.baseImageName = inputs.bases[bi].name || '';
    base.push(s2);
  } else {
    s2.baseChoice = -1;
    gen.push(s2);
  }
});
return { shots, gen, base };`,
  inputs: [
    { key: 'shots', value: '{{shotsGen.parsed.shots}}' },
    { key: 'bases', value: '{{readBase.assets}}' },
  ],
})

// C1 素材循环：需生成图的镜头（提示词包 → 文生图）
addNode('loopMat', 'loop', '素材循环（生成镜头）', 2600, 560, { listExpression: '{{splitShots.result.gen}}', emptyPolicy: 'skip' })
addNode('shotPack', 'llm-chat', '片段提示词包', 2800, 420, {
  systemPrompt:
    '为单个镜头产出可执行素材包（JSON）：' +
    '{"visual":"画面描述（服从大纲/风格；仅实拍物理场景、无文字、含运镜）","caption":"字幕短句","duration":秒,"prompt":"给文生图的完整画面提示词（已含风格与参考图说明）"}' +
    '\n【预设规范】\n{{preset.promptBlock}}\n【参考图提示】画面风格与主体须贴合参考图（若有）。',
  prompt: '大纲段落背景：{{loopMat.item.sectionIdx}}\n镜头画面要点：{{loopMat.item.visual}}\n字幕：{{loopMat.item.caption}}\n时长：{{loopMat.item.duration}}秒\n\n输出该镜头素材包 JSON。',
  jsonMode: true,
  providerConfigId: '{{start.model.providerConfigId}}',
  modelId: '{{start.model.modelId}}',
})
addNode('imgShot', 'image-gen', '文生图(镜头画面)', 3000, 560, {
  prompt: '{{shotPack.parsed.prompt}}（竖版构图；写实、干净、无任何文字）',
  negativePrompt: '文字、字体、logo、水印、UI 元素、图标、按钮、弹窗、乱码、涂鸦、图形、表格、图表、标注、贴片字幕、卡通',
  providerConfigId: '{{start.imageProviderConfigId}}',
  modelId: '{{start.imageModelId}}',
  width: '{{start.width}}',
  height: '{{start.height}}',
  referenceImages: '{{refPick.result.first}}',
  promptExtend: false,
})
addNode('matItem', 'code', '素材项（生成图）', 3200, 560, {
  code: `const list = Array.isArray(inputs.img) ? inputs.img : ((inputs.img && inputs.img.images) || []);
const img = (list && list[0]) || {};
const pack = inputs.pack || {};
return { _origIndex: inputs.item._origIndex, visual: pack.visual || inputs.item.visual, caption: pack.caption || inputs.item.caption,
  duration: Number(pack.duration) > 0 ? pack.duration : inputs.item.duration,
  prompt: pack.prompt || '', baseImagePath: '', imagePath: img.path || '', imageUrl: img.localUrl || img.url || '', imageAssetId: '' };`,
  inputs: [
    { key: 'item', value: '{{loopMat.item}}' },
    { key: 'pack', value: '{{shotPack.parsed}}' },
    { key: 'img', value: '{{imgShot.images}}' },
  ],
})
addEdge('loopMat', 'shotPack', 'loop-body')
addEdge('shotPack', 'imgShot', 'normal')
addEdge('imgShot', 'matItem', 'normal')
addEdge('matItem', 'loopMat', 'loop-back')

// C2 底图镜头直接成素材（不生成图）
addNode('loopBase', 'loop', '素材循环（直接用底图镜头）', 2600, 800, { listExpression: '{{splitShots.result.base}}', emptyPolicy: 'skip' })
addNode('matBase', 'code', '素材项（底图直用）', 2800, 800, {
  code: `const it = inputs.item || {};
return { _origIndex: it._origIndex, visual: it.visual || '', caption: it.caption || '', duration: Number(it.duration) > 0 ? it.duration : 5,
  prompt: it.visual || '', baseImagePath: it.baseImagePath || '', imagePath: it.baseImagePath || '', imageUrl: it.baseImageUrl || it.baseImagePath || '', imageAssetName: it.baseImageName || '' };`,
  inputs: [
    { key: 'item', value: '{{loopBase.item}}' },
  ],
})
addEdge('loopBase', 'matBase', 'loop-body')
addEdge('matBase', 'loopBase', 'loop-back')

// C3 素材板聚合（按原镜头顺序排序）
addNode('boardMerge', 'code', '素材板聚合', 3400, 560, {
  code: `const unwrap = (r) => (r && typeof r === 'object' && r.result && typeof r.result === 'object' && !('visual' in r)) ? r.result : r;
const a = (Array.isArray(inputs.a) ? inputs.a : []).map(unwrap);
const b = (Array.isArray(inputs.b) ? inputs.b : []).map(unwrap);
const all = a.concat(b).sort((x, y) => (x._origIndex || 0) - (y._origIndex || 0)).map((it, i) => {
  const c = Object.assign({}, it, { cardIndex: i });
  delete c._origIndex;
  return c;
});
const summary = all.map((c, i) => '镜头' + (i + 1) + '：' + String(c.caption || '') + '｜' + String(c.duration || '') + 's' + (c.baseImagePath ? '（底图:' + String(c.imageAssetName || '') + '）' : '')).join('\\n');
return { cards: all, summary };`,
  inputs: [
    { key: 'a', value: '{{loopMat.results}}' },
    { key: 'b', value: '{{loopBase.results}}' },
  ],
})

// 素材板审核（整体批准/驳回）
addNode('boardReview', 'human-review', '素材板审核（图文）', 3600, 560, {
  payload: {
    stage: '素材板审核：大纲与逐镜素材批准后开始逐片段视频生成',
    videoType: '{{start.videoType}}',
    summary: '{{boardMerge.result.summary}}',
    cards: '{{boardMerge.result.cards}}',
  },
  editableFields: [
    { key: 'cards', label: '逐镜素材（可逐条改画面/字幕/时长）', type: 'json' },
  ],
  timeoutMs: null,
  timeoutPolicy: 'fail',
})

// D. 逐片段视频循环（用审核后的素材卡）
addNode('loopVideo', 'loop', '逐片段视频循环', 3820, 560, { listExpression: '{{boardReview.cards}}', emptyPolicy: 'skip' })
addNode('shotReview', 'human-review', '片段确认(生成视频前)', 4000, 420, {
  payload: {
    stage: '逐片段审核：图生视频前确认',
    shotIndex: '{{loopVideo.index}}',
    visual: '{{loopVideo.item.visual}}',
    caption: '{{loopVideo.item.caption}}',
    duration: '{{loopVideo.item.duration}}',
    imageLocalUrl: '{{loopVideo.item.imageUrl}}',
  },
  editableFields: [
    { key: 'visual', label: '画面', type: 'string' },
    { key: 'caption', label: '字幕', type: 'string' },
    { key: 'duration', label: '时长(秒)', type: 'number' },
  ],
  timeoutMs: null,
  timeoutPolicy: 'fail',
})
addNode('vidShot', 'video-gen', '图生视频(动化)', 4180, 560, {
  providerConfigId: '{{start.videoProviderConfigId}}',
  model: '{{start.videoModelId}}',
  image: '{{shotReview.imageLocalUrl}}',
  prompt: '{{shotReview.visual}}（镜头风格：{{preset.styleText}}）。保持首帧主体一致，生成连贯自然运动（运动幅度与画面描述一致，避免剧烈形变）',
  negativePrompt: '画面扭曲、形变、闪烁、乱码文字、多余文字',
  duration: '{{shotReview.duration}}',
  width: '{{start.width}}',
  height: '{{start.height}}',
  quality: '{{start.videoQuality}}',
  steps: '{{start.h3Steps}}',
})
addEdge('loopVideo', 'shotReview', 'loop-body')
addEdge('shotReview', 'vidShot', 'approve')
addEdge('vidShot', 'loopVideo', 'loop-back')

// E. 配音 + 合成
addNode('tts1', 'tts', '口播配音', 4400, 560, {
  text: '{{shotsGen.parsed.narration}}',
  voiceId: '{{start.voiceId}}',
  providerConfigId: '{{start.voiceProviderConfigId}}',
})
addNode('segments', 'code', '组装片段段', 4400, 760, {
  code: `const cards = Array.isArray(inputs.cards) ? inputs.cards : [];
const res = Array.isArray(inputs.results) ? inputs.results : [];
const segs = [];
for (let i = 0; i < cards.length; i++) {
  const r = res[i] || {};
  const c = cards[i] || {};
  const vid = r.videoPath || '';
  if (vid) segs.push({ source: vid, kind: 'video', duration: Number(c.duration) || 3, caption: String(c.caption || '') });
}
return { segments: segs };`,
  inputs: [
    { key: 'cards', value: '{{boardReview.cards}}' },
    { key: 'results', value: '{{loopVideo.results}}' },
  ],
})
addNode('comp1', 'video-compose', '合成视频', 4600, 560, {
  segments: '{{segments.result.segments}}',
  audioPath: '{{tts1.audioPath}}',
  bgmPath: '{{start.bgmPath}}',
  width: '{{start.width}}',
  height: '{{start.height}}',
  outputName: '脚本成片',
})

// F. 存档
addNode('saveVideo', 'save-asset', '视频存档', 4820, 560, {
  content: '{{comp1.videoPath}}',
  kind: 'file',
  category: 'video',
  subCategory: '短视频',
  name: '{{start.topic}}脚本成片-{{sys.today}}',
  tags: '短视频,视频,{{start.videoType}}',
})
addNode('saveOutline', 'save-asset', '大纲存档', 4820, 300, {
  content: '{{outlineReview.md}}',
  kind: 'text',
  category: 'text',
  subCategory: '视频大纲',
  name: '{{start.topic}}视频大纲-{{sys.today}}',
  tags: '视频,大纲,{{start.videoType}}',
  enabled: true,
})
addNode('saveBoard', 'save-asset', '素材板存档', 4820, 420, {
  content: '{{boardMerge.result.summary}}',
  kind: 'text',
  category: 'text',
  subCategory: '视频素材板',
  name: '{{start.topic}}素材板-{{sys.today}}',
  tags: '视频,素材板,{{start.videoType}}',
  enabled: true,
})
addNode('notify1', 'app-notify', '通知完成', 5020, 560, {
  title: '短视频生成完成',
  message: '成片已保存到资产库：{{saveVideo.assetId}}（大纲/素材板同步存档）',
  level: 'success',
})
addNode('end', 'end', '结束', 5220, 560, {})

// ============ 主链边 ============
addEdge('start', 'readScript', 'normal')
addEdge('readScript', 'readRef', 'normal')
addEdge('readRef', 'readBase', 'normal')
addEdge('readBase', 'refPick', 'normal')
addEdge('refPick', 'kbQuery', 'normal')
addEdge('kbQuery', 'kbText', 'normal')
addEdge('kbText', 'scriptSrc', 'normal')
addEdge('scriptSrc', 'preset', 'normal')
addEdge('preset', 'outlineGen', 'normal')
addEdge('outlineGen', 'outlineMd', 'normal')
addEdge('outlineMd', 'outlineReview', 'normal')
addEdge('outlineReview', 'baseList', 'approve')
addEdge('outlineReview', 'end', 'reject')
addEdge('baseList', 'shotsGen', 'normal')
addEdge('shotsGen', 'splitShots', 'normal')
addEdge('splitShots', 'loopMat', 'normal')
addEdge('loopMat', 'loopBase', 'loop-done')
addEdge('loopBase', 'boardMerge', 'loop-done')
addEdge('boardMerge', 'boardReview', 'normal')
addEdge('boardReview', 'loopVideo', 'approve')
addEdge('boardReview', 'end', 'reject')
addEdge('loopVideo', 'tts1', 'loop-done')
addEdge('tts1', 'segments', 'normal')
addEdge('segments', 'comp1', 'normal')
addEdge('comp1', 'saveVideo', 'normal')
addEdge('saveVideo', 'saveOutline', 'normal')
addEdge('saveOutline', 'saveBoard', 'normal')
addEdge('saveBoard', 'notify1', 'normal')
addEdge('notify1', 'end', 'normal')

// ============ 变量接线说明（kb/资产注入到 LLM prompt） ============
// kb 检索结果 / 脚本文本 / 底图清单 注入（kbQuery 等已按需并入提示词模板）

const graph = { version: 1, nodes, edges }
const doc = {
  kind: 'the-bot-workflow',
  formatVersion: 1,
  name: '[内置] 短视频脚本生成视频V2（素材前置）',
  description:
    '脚本/主题+多知识库 → 视频类型预设装配 → 大纲生成与审核 → 分镜拆解（底图资产自动匹配）→ 逐镜素材生产（提示词包+文生图，参考图资产引用）→ 图文素材板整体审核 → 逐片段视频生成（逐镜确认，ComfyUI H3）→ 配音+烧字幕+合成 → 大纲/素材板/成片存档。',
  category: '视频制作',
  graph,
  triggers: [],
  settings: { maxOutputChars: 1200000, maxDurationMs: 12 * 60 * 60 * 1000 },
}

const outFile = path.join(__dirname, '..', 'src', 'core', 'database', 'migrations', 'builtin-apps', 'script-to-video-v2.json')
fs.writeFileSync(outFile, JSON.stringify(doc, null, 2), 'utf-8')
console.log('WROTE', outFile, 'nodes=' + nodes.length, 'edges=' + edges.length)
