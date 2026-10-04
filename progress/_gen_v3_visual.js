/**
 * V3 视觉层改造生成器：在**当前** script-to-video-v3.json 基础上落地「配图相关性」升级。
 *
 * 背景：`_gen_v3_json.js`（以 V2 为基线）已被写作层改造（writerPick/writerCall/writerMd）超越，
 * 不再是 v3 定义的真相源；本脚本以现有 v3 JSON 为基线做定点改造，并在已改造时拒绝重复执行。
 *
 * 改造内容：
 *   1) start：+stockCredentialId / stockProvider / stockKind / clipSource / visionModel；出片规格默认 1080×1920
 *   2) shotsGen：注入场景词典（{{preset.sceneText}}）+ 每镜新增 subject/setting/searchQuery/altQueries/shotSize/cameraMove
 *   3) 素材环：删 shotPack/imgShot，改为 visualShot(shot-visual) → matItem（真实素材优先→生成兜底→视觉质检）
 *   4) boardMerge：摘要带来源/相关性/出处（授权留痕）
 *   5) 片段规划：boardReview → segPlan（真实视频直用 / 图片运镜 / H3 可选）→ loopVideo(仅 H3 镜头) → segments
 *
 * 用法：node progress/_gen_v3_visual.js
 */
const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, '..', 'src', 'core', 'database', 'migrations', 'builtin-apps', 'script-to-video-v3.json')
const doc = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
const g = doc.graph

const find = id => {
  const n = g.nodes.find(x => x.id === id)
  if (!n) throw new Error('缺少节点：' + id)
  return n
}
const has = id => g.nodes.some(x => x.id === id)
const removeNode = id => {
  const i = g.nodes.findIndex(x => x.id === id)
  if (i < 0) throw new Error('缺少节点：' + id)
  g.nodes.splice(i, 1)
}
const removeEdge = (s, t, kind) => {
  const i = g.edges.findIndex(e => e.sourceNodeId === s && e.targetNodeId === t && (!kind || e.kind === kind))
  if (i < 0) throw new Error('缺少边：' + s + '->' + t)
  g.edges.splice(i, 1)
}
const addEdge = (s, t, kind = 'normal') => {
  if (g.edges.some(e => e.sourceNodeId === s && e.targetNodeId === t && e.kind === kind)) return
  g.edges.push({ id: 'ev' + Math.random().toString(36).slice(2, 10), sourceNodeId: s, targetNodeId: t, kind })
}
const addNode = (id, type, name, x, y, config) => {
  if (has(id)) throw new Error('节点已存在：' + id)
  g.nodes.push({ id, type, name, position: { x, y }, config })
}

// 幂等保护：已改造过则拒绝重复执行（避免二次套用把图改坏）
if (has('visualShot') || has('segPlan')) {
  console.log('已是改造后版本，跳过（避免重复套用）。')
  process.exit(0)
}

// ───────────────────────── 1) start 输入 ─────────────────────────
{
  const inputs = find('start').config.inputs
  const afterKey = (key, item) => {
    const i = inputs.findIndex(x => x.key === key)
    if (i < 0) throw new Error('start 缺少输入：' + key)
    inputs.splice(i + 1, 0, item)
  }
  // 画面策略之后：真实素材库与片段来源
  afterKey('visualStrategy', {
    key: 'stockProvider', label: '真实素材库', type: 'select', required: false, defaultValue: 'pexels',
    options: [
      { label: 'Pexels（实测可用）', value: 'pexels' },
      { label: 'Pixabay', value: 'pixabay' },
    ],
    help: '真实版权素材库（免费商用、无需署名）；需先在「设置 → 工具 → 凭据」保存 API Key。',
  })
  afterKey('stockProvider', {
    key: 'stockCredentialId', label: '素材库凭据（API Key）', type: 'select-dynamic', source: 'credentials',
    required: false,
    help: '留空=不使用真实素材（仅 AI 生成）。选中的凭据 key 只在主进程解密使用，不会进入运行记录。',
  })
  afterKey('stockCredentialId', {
    key: 'stockKind', label: '素材种类偏好', type: 'select', required: false, defaultValue: 'auto',
    options: [
      { label: '自动（真实视频优先，其次真实图片）', value: 'auto' },
      { label: '只用真实视频', value: 'video' },
      { label: '只用真实图片', value: 'image' },
    ],
    help: '真实视频直接作为该镜片段；真实图片做缓慢运镜（Ken Burns）成片段。',
  })
  afterKey('stockKind', {
    key: 'clipSource', label: '片段来源', type: 'select', required: false, defaultValue: 'auto',
    options: [
      { label: '自动（真实素材/图片运镜，不跑 AI 视频）', value: 'auto' },
      { label: '全部用 H3 图生视频（慢，AI 动态）', value: 'h3' },
    ],
    help: 'auto=真实素材优先、图片用缓慢运镜合成，速度快且画面真实；h3=逐镜跑 ComfyUI H3 图生视频（单镜 50s~15min）。',
  })
  // 视觉质检模型（放在文案模型之后）
  const modelIdx = inputs.findIndex(x => x.key === 'model')
  inputs.splice(modelIdx + 1, 0, {
    key: 'visionModel', label: '视觉质检模型（可选）', type: 'model', required: false,
    help: '用于判断"配图是否与脚本相符、画面是否出现文字"；留空=跳过质检（会在素材板如实标注）。需选支持图片输入的模型。',
  })
  // 出片规格：可投放标准竖屏
  const w = inputs.find(x => x.key === 'width'); if (w) w.defaultValue = 1080
  const h = inputs.find(x => x.key === 'height'); if (h) h.defaultValue = 1920
  const im = inputs.find(x => x.key === 'imageModelId')
  if (im) im.help = '生成兜底用的图像模型（推荐云端高质量模型，如火山 Seedream 4.5 / 百炼 qwen-image；本地 krea2 质量较弱）'
  // 片段来源=auto 时根本不跑 H3，因此视频 Provider 不该再是必填（改由 segPlan 在 h3 模式运行期把关）
  const vp = inputs.find(x => x.key === 'videoProviderConfigId')
  if (vp) {
    vp.required = false
    vp.help = '仅在「片段来源=全部用 H3 图生视频」时需要（如 ComfyUI 生成网关配置）；auto 模式不用填。'
  }
  const vm = inputs.find(x => x.key === 'videoModelId')
  if (vm) vm.help = '仅 H3 模式使用（如 h3）；auto 模式不用填。'
}

// ───────────────────────── 2) shotsGen：场景词典 + 逐镜真实场景字段 ─────────────────────────
{
  const n = find('shotsGen')
  n.config.systemPrompt =
    '你是资深短视频分镜师兼画面导演。依据用户确认的大纲把视频拆为 1~20 个镜头，并为每镜设计**真实世界里拍得到的画面**。\n' +
    '【视频类型/风格规范】\n{{preset.promptBlock}}\n' +
    '【视觉策略（当前模式 {{strategy.result.mode}}）】\n{{strategy.result.policyText}}\n' +
    '【镜头真实场景词典（抽象主题 → 可拍场景 + 素材库英文检索词）】\n{{preset.sceneText}}\n' +
    '【素材池（asset 模式引用；imagery 模式可参考）】（名称/描述/索引）\n{{baseList.result.text}}\n' +
    '【大纲全文（用户已审核）】\n{{outlineReview.md}}\n' +
    '【画面硬性要求】\n' +
    '1) 每镜画面必须是"真实世界可拍摄的具体场景"：点名主体实体 + 场所环境 + 光线氛围 + 景别 + 运镜；\n' +
    '   禁止把抽象概念（指数/趋势/信心/生态/赋能/风险/格局）单独成画；禁止任何文字/图表/UI/水印/海报/贴片（所有文字一律走 caption 字幕层）。\n' +
    '2) 先用上面的场景词典把该镜语义归到某个主题簇，再落成该簇的可拍场景；词典未覆盖时自选一个真实存在、能拍到的场景。\n' +
    '3) searchQuery 是给真实素材库用的**英文检索词**（2~4 个单词，只写画面里真实存在的实物与场所，如 container port terminal / factory production line / stock exchange trading floor）。\n' +
    '【镜头规则】caption 为该镜字幕短句（≤18 字，不是口播原文）；duration 整数秒 4~16；一镜一场景一事件，一句口播含多地点/多事件时必须拆镜。\n' +
    '【模式化镜头输出】依据上方"视觉策略"里的模式：\n' +
    ' - imagery 模式：每镜另给 subject（画面主体实体）/ setting（场所环境）/ visual（可执行画面描述）/ imagery（意象对象）/ searchQuery（英文检索词）/ altQueries（1~2 个备选英文检索词）/ shotSize（景别）/ cameraMove（运镜）。\n' +
    ' - asset 模式：每镜必须给 assetIdx（引用素材池索引，取值 0..{{strategy.result.baseCount}}-1）与 visual（描述该镜展示素材的角度/景别/运镜/氛围，主体来自素材）。\n' +
    '输出 JSON 结构：{"narration":"全片口播（原样保留可用 | 分句）","shots":[{"concept":"语义主题","subject":"画面主体实体","setting":"场所环境","visual":"画面描述（含光线/景别/运镜）","imagery":"意象对象(仅 imagery)","searchQuery":"英文检索词","altQueries":["备选1","备选2"],"shotSize":"景别","cameraMove":"运镜","caption":"字幕短句","duration":秒,"assetIdx":素材索引(仅 asset)}]}。镜头总数 1~20。'
  n.config.prompt = '请基于大纲与视觉策略输出镜头 JSON（每镜必须落到真实可拍场景，并给出英文 searchQuery）。'
}

// ──────────────────────── 3) 素材环：visualShot 取代 shotPack/imgShot ─────────────────────────
{
  removeEdge('loopMat', 'shotPack', 'loop-body')
  removeEdge('shotPack', 'imgShot')
  removeEdge('imgShot', 'matItem')
  removeNode('shotPack')
  removeNode('imgShot')

  addNode('visualShot', 'shot-visual', '镜头画面生产（真实素材优先）', 2860, 560, {
    concept: '{{loopMat.item.concept}}',
    subject: '{{loopMat.item.subject}}',
    setting: '{{loopMat.item.setting}}',
    searchQuery: '{{loopMat.item.searchQuery}}',
    altQueries: '{{loopMat.item.altQueries}}',
    visual: '{{loopMat.item.visual}}',
    shotSize: '{{loopMat.item.shotSize}}',
    cameraMove: '{{loopMat.item.cameraMove}}',
    styleText: '{{preset.styleText}}',
    stockMode: 'auto',
    stockProvider: '{{start.stockProvider}}',
    stockCredentialId: '{{start.stockCredentialId}}',
    stockKind: '{{start.stockKind}}',
    stockPerPage: 8,
    stockMaxCandidates: 3,
    stockMinWidth: 720,
    stockMinDurationSec: 3,
    stockMinScore: 60,
    generateFallback: true,
    imageProviderConfigId: '{{start.imageProviderConfigId}}',
    imageModelId: '{{start.imageModelId}}',
    maxAttempts: 2,
    negativePrompt: '文字,字体,字幕,水印,logo,标志,UI元素,界面,图表,表格,数据图,柱状图,折线图,海报字,贴纸,图标,按钮,二维码,边框,画中画,畸变,多手指',
    qaProviderConfigId: '{{start.visionModel.providerConfigId}}',
    qaModelId: '{{start.visionModel.modelId}}',
    minScore: 60,
    width: '{{start.width}}',
    height: '{{start.height}}',
    referenceImages: '{{refPick.result.first}}',
  })
  addEdge('loopMat', 'visualShot', 'loop-body')
  addEdge('visualShot', 'matItem')

  find('matItem').config = {
    code: `const it = inputs.item || {};
const v = (inputs.visual && inputs.visual.result) ? inputs.visual.result : (inputs.visual || {});
const dur = Number(it.duration) > 0 ? it.duration : 5;
return {
  _origIndex: it._origIndex,
  mode: 'imagery',
  source: v.source || 'generated',
  concept: it.concept || '', subject: it.subject || '', setting: it.setting || '',
  imagery: it.imagery || '', visual: it.visual || '',
  caption: it.caption || '', duration: dur,
  imagePath: v.imagePath || '', imageUrl: v.imageUrl || '',
  clipPath: v.clipPath || '', clipUrl: v.clipUrl || '',
  relevance: typeof v.relevance === 'number' ? v.relevance : -1,
  attempts: Number(v.attempts) || 0,
  provider: v.provider || '', stockId: v.stockId || '', pageUrl: v.pageUrl || '',
  author: v.author || '', license: v.license || '',
  searchQuery: v.searchQuery || '', prompt: v.prompt || '', note: v.note || '',
  baseImagePath: '', imageAssetId: ''
};`,
    inputs: [
      { key: 'item', value: '{{loopMat.item}}' },
      { key: 'visual', value: '{{visualShot}}' },
    ],
  }
}

// ───────────────────────── 4) boardMerge：摘要带来源/相关性/出处 ─────────────────────────
{
  const n = find('boardMerge')
  n.config.code = `const unwrap = (r) => (r && typeof r === 'object' && r.result && typeof r.result === 'object' && !('visual' in r)) ? r.result : r;
const a = (Array.isArray(inputs.a) ? inputs.a : []).map(unwrap);
const b = (Array.isArray(inputs.b) ? inputs.b : []).map(unwrap);
const all = a.concat(b).sort(function (x, y) { return (x._origIndex || 0) - (y._origIndex || 0); }).map(function (it, i) {
  const c = Object.assign({}, it, { cardIndex: i });
  delete c._origIndex;
  return c;
});
function srcLabel(s) {
  if (s === 'stock-video') return '真实视频';
  if (s === 'stock-image') return '真实图片';
  if (s === 'generated') return 'AI生成';
  if (typeof s === 'string' && s.indexOf('asset:') === 0) return '自有素材';
  return String(s || '未知');
}
const summary = all.map(function (c, i) {
  const rel = Number(c.relevance) >= 0 ? '｜相关性 ' + c.relevance : '｜未质检';
  const org = c.pageUrl ? '｜出处 ' + c.pageUrl : '';
  const au = c.author ? '（' + c.author + '）' : '';
  const st = c.stockId ? '#' + c.stockId + au : '';
  const q = c.searchQuery ? '｜检索词 ' + c.searchQuery : '';
  const fb = c.note ? '｜供给说明 ' + c.note : '';
  return '镜头' + (i + 1) + '：' + String(c.caption || '') + '｜' + String(c.duration || '') + 's｜来源：' + srcLabel(c.source) + st + rel + org + q + fb;
}).join('\\n');
return { cards: all, summary: summary, mode: String(inputs.mode || '') };`
}

// ───────────────────────── 5) 片段规划：segPlan → loopVideo(H3 可选) → segments ─────────────────────────
{
  removeEdge('boardReview', 'loopVideo', 'approve')
  addNode('segPlan', 'code', '片段来源规划', 3780, 560, {
    code: `const cards = Array.isArray(inputs.cards) ? inputs.cards : [];
if (cards.length === 0) throw new Error('素材板为空：没有可合成的镜头');
const clipSource = String(inputs.clipSource || 'auto');
const hasVideoProvider = !!String(inputs.videoProviderConfigId || '').trim();
const motions = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left'];
const h3List = [];
const segments = [];
cards.forEach(function (c, i) {
  const dur = Number(c.duration) > 0 ? c.duration : 5;
  const caption = String(c.caption || '');
  const cardIndex = Number.isInteger(c.cardIndex) ? c.cardIndex : i;
  const clip = String(c.clipPath || '').trim();
  const img = String(c.imagePath || '').trim();
  if (clip) {
    segments.push({ cardIndex: cardIndex, kind: 'video', source: clip, duration: dur, caption: caption, origin: c.source || 'stock-video' });
    return;
  }
  if (clipSource === 'h3' && img) {
    if (!hasVideoProvider) {
      throw new Error('镜头 ' + (i + 1) + ' 需要跑 H3 图生视频，但未配置「视频 Provider」：请补充视频 Provider（如 ComfyUI 生成网关）或改为 auto（真实素材/图片运镜）');
    }
    h3List.push(Object.assign({}, c, { cardIndex: cardIndex }));
    segments.push({ cardIndex: cardIndex, kind: 'video', source: '', duration: dur, caption: caption, pending: true, origin: 'h3' });
    return;
  }
  if (img) {
    segments.push({ cardIndex: cardIndex, kind: 'image', source: img, duration: dur, caption: caption, motion: motions[i % motions.length], origin: c.source || 'generated' });
    return;
  }
  throw new Error('镜头 ' + (i + 1) + ' 没有任何画面素材（真实素材未命中且未生成图片）：请检查素材板该镜卡片');
});
return { h3List: h3List, segments: segments, count: segments.length, h3Count: h3List.length };`,
    inputs: [
      { key: 'cards', value: '{{boardReview.cards}}' },
      { key: 'clipSource', value: '{{start.clipSource}}' },
      { key: 'videoProviderConfigId', value: '{{start.videoProviderConfigId}}' },
    ],
  })
  addEdge('boardReview', 'segPlan', 'approve')
  addEdge('segPlan', 'loopVideo')

  const lv = find('loopVideo')
  lv.name = 'H3 逐片段视频循环（仅 clipSource=h3 时执行）'
  lv.config.listExpression = '{{segPlan.result.h3List}}'

  const seg = find('segments')
  seg.config = {
    code: `const segs = Array.isArray(inputs.segments) ? inputs.segments : [];
const results = Array.isArray(inputs.results) ? inputs.results : [];
const h3List = Array.isArray(inputs.h3List) ? inputs.h3List : [];
if (segs.length === 0) throw new Error('片段规划结果为空：请检查素材板与片段来源设置');
const h3ByCard = {};
h3List.forEach(function (c, i) {
  const r = inputs.results ? (results[i] || {}) : {};
  const inner = (r && r.result && typeof r.result === 'object') ? r.result : r;
  const p = (inner && (inner.videoPath || inner.videoUrl)) || '';
  if (p) h3ByCard[String(c.cardIndex)] = inner.videoPath || '';
});
const out = [];
segs.forEach(function (s) {
  const src = s.pending ? (h3ByCard[String(s.cardIndex)] || '') : s.source;
  if (!src) return;
  out.push({ source: src, kind: s.kind, duration: s.duration, caption: s.caption, motion: s.motion || 'none' });
});
if (out.length === 0) throw new Error('没有任何可合成的片段（检查素材板与片段来源设置）');
if (out.length !== segs.length) {
  throw new Error('片段素材缺失：规划 ' + segs.length + ' 段，实际可合成 ' + out.length + ' 段（H3 生成结果可能未回填）');
}
return { segments: out, count: out.length };`,
    inputs: [
      { key: 'segments', value: '{{segPlan.result.segments}}' },
      { key: 'results', value: '{{loopVideo.results}}' },
      { key: 'h3List', value: '{{segPlan.result.h3List}}' },
    ],
  }
}

// ──────────────────────── 写回 ─────────────────────────
doc.description =
  '脚本/主题+多知识库 → 视频类型预设与视觉策略装配（imagery/asset）→ 大纲生成与审核 → ' +
  '分镜拆解（真实场景导演：subject/setting/英文检索词）→ 逐镜画面生产（真实视频素材 → 真实图片素材 → ' +
  'AI 生成兜底，均过视觉相关性闸）→ 图文素材板整体审核 → 片段规划（真实视频直用 / 图片缓慢运镜 / 可选 H3 图生视频）→ ' +
  '配音+烧字幕+合成（默认 1080×1920 竖屏）→ 大纲/素材板/成片存档。'

fs.writeFileSync(FILE, JSON.stringify(doc, null, 2), 'utf-8')
console.log('WROTE', FILE, 'nodes=' + g.nodes.length, 'edges=' + g.edges.length)
console.log('节点：', g.nodes.map(n => n.id + ':' + n.type).join(', '))