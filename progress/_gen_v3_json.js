// 生成 V3 内置工作流 script-to-video-v3.json（通用视觉策略：imagery 意象空镜 / asset 素材驱动）
// 策略：以 V2 产物 JSON 为基线（require 深拷贝），定点改造：
//   +start.visualStrategy 输入
//   +strategy(code) 节点（auto 解析/素材门控/policyText 渲染），插在 preset→outlineGen 之间
//   shotsGen/splitShots/shotPack/matItem/matBase/boardMerge 语义升级（concept/imagery/assetIdx、mode/source）
//   素材环路由 strategy.result.mode 驱动（imagery→loopMat 生成意象空镜；asset→loopBase 素材直用）
// M2 视频段沿用 V2（vidShot image=素材首帧/意象图），两级审核与素材板闸门语义不变。
const fs = require('fs')
const path = require('path')

const BASE = require(path.join(__dirname, '..', 'src', 'core', 'database', 'migrations', 'builtin-apps', 'script-to-video-v2.json'))
const doc = JSON.parse(JSON.stringify(BASE)) // 深拷贝基线
const g = doc.graph

// ---------- 工具 ----------
function node(id) {
  const n = g.nodes.find(x => x.id === id)
  if (!n) throw new Error('node not found: ' + id)
  return n
}
function edgeId() { return 'e' + (Date.now().toString(36)) + Math.floor(Math.random() * 1e6).toString(36) }
function addEdge(sourceNodeId, targetNodeId, kind, extra) {
  const e = { id: edgeId(), sourceNodeId, targetNodeId, kind }
  if (extra) Object.assign(e, extra)
  g.edges.push(e)
  return e
}
function removeEdge(sourceNodeId, targetNodeId) {
  const i = g.edges.findIndex(e => e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId)
  if (i < 0) throw new Error('edge not found: ' + sourceNodeId + '->' + targetNodeId)
  g.edges.splice(i, 1)
}
function addNode(id, type, name, x, y, config) {
  if (g.nodes.some(n => n.id === id)) throw new Error('dup node id ' + id)
  g.nodes.push({ id, type, name, position: { x, y }, config: config || {} })
}

// ---------- 元信息 ----------
doc.name = '[内置] 短视频脚本生成视频V3（通用视觉策略）'
doc.description =
  '脚本/主题+多知识库 → 视频类型预设与视觉策略装配（imagery 意象化空镜 / asset 素材驱动，按类型自动）→ ' +
  '大纲生成与审核 → 分镜拆解（concept/意象 或 素材引用 assetIdx）→ 逐镜素材生产（imagery=意象文生图；' +
  'asset=用户素材直用，缺素材即拦截）→ 图文素材板整体审核 → 逐片段视频生成（逐镜确认，ComfyUI H3）→ ' +
  '配音+烧字幕+合成 → 大纲/素材板/成片存档。'

// ---------- 1) start：增加 visualStrategy ----------
{
  const startCfg = node('start').config
  const inputs = startCfg.inputs
  const vi = inputs.findIndex(i => i.key === 'videoStyle')
  inputs.splice(vi + 1, 0, {
    key: 'visualStrategy', label: '画面策略', type: 'select', required: false, defaultValue: 'auto',
    options: [
      { label: '自动（按视频类型）', value: 'auto' },
      { label: '意象化空镜（imagery）', value: 'imagery' },
      { label: '素材驱动（asset）', value: 'asset' },
    ],
    help: 'auto=按 videoType 预设默认：财经/资讯/知识/文旅→意象化空镜；电商/品牌→素材驱动(需提供素材图)。可手动强制。',
  })
}

// ---------- 2) strategy(code)：auto 解析 + 素材门控 + policyText ----------
{
  const stratCfg = {
    code: `const choice = String(inputs.choice || 'auto');
const pol = inputs.policy || {};
const baseCount = (Array.isArray(inputs.baseAssets) ? inputs.baseAssets : []).length;
const dep = pol.assetDependency || 'none';
const mode0 = (pol.mode === 'asset') ? 'asset' : 'imagery';
let mode = (choice === 'auto') ? mode0 : ((choice === 'imagery' || choice === 'asset') ? choice : mode0);
let note = '';
if (mode === 'asset') {
  if (dep === 'required' && baseCount === 0) {
    throw new Error('该视频类型为素材驱动（asset）：需要在「底图资产」中提供产品/素材图片后再运行（当前 0 张素材）');
  }
  if (dep !== 'required' && baseCount === 0) {
    mode = 'imagery';
    note = '未提供素材：画面策略由 asset 回落为意象化空镜（imagery）';
  }
}
const use = pol.assetUse || {};
const map = Array.isArray(pol.imageryMap) ? pol.imageryMap : [];
const rules = map.map(function (r) {
  return '- 主题簇「' + String(r.conceptClass || '') + '」（触发：' + (r.match || []).join('/') + '）→ 意象：' + String(r.imagery || '');
}).join('\\n');
let policyText = '';
if (mode === 'asset') {
  policyText = '【视觉策略】素材驱动 asset：画面主体一律来自用户提供的素材图（共 ' + baseCount + ' 张）。'
    + (use.requireFirstFrame === false ? '' : '视频首帧必须=该镜素材图；')
    + (use.allowGeneratedScene ? '允许少量氛围空镜补位（不改素材主体）。' : '禁止生成替代素材主体的画面。')
    + '禁止在素材上加文字/改外观；负向提示：' + (Array.isArray(use.negative) ? use.negative.join('；') : '') + '。';
} else {
  policyText = '【视觉策略】意象化空镜 imagery：画面与口播语义相关、但不逐字还原；每镜按 narration 的语义主题命中原意象表，产出代表性意象空镜（真实可拍物理场景、无文字）。禁止把口播原文/名词直接画成文字或海报。'
    + (rules ? '\\n【意象表】\\n' + rules : '');
  if (baseCount > 0) policyText += '（用户已提供 ' + baseCount + ' 张素材：意象与素材主体一致时可用素材优先）';
}
// 注意：code 节点返回值会被引擎再包裹一层 {result}，故此处直接返回字段（勿再包 result）
return { mode: mode, note: note, policyText: policyText, baseCount: baseCount, choice: choice };`,
    inputs: [
      { key: 'choice', value: '{{start.visualStrategy}}' },
      { key: 'policy', value: '{{preset.policy}}' },
      { key: 'baseAssets', value: '{{readBase.assets}}' },
    ],
  }
  addNode('strategy', 'code', '画面策略决策', 1500, 700, stratCfg)
  removeEdge('preset', 'outlineGen')
  addEdge('preset', 'strategy', 'normal')
  addEdge('strategy', 'outlineGen', 'normal')
}

// ---------- 3) shotsGen：注入策略 + 模式化拆镜 schema ----------
{
  const n = node('shotsGen')
  n.config = {
    systemPrompt:
      '你是资深视频分镜师。依据用户确认的大纲把视频拆为 1~20 个镜头。\n' +
      '【视频类型/风格规范】\n{{preset.promptBlock}}\n' +
      '【视觉策略（当前模式 {{strategy.result.mode}}）】\n{{strategy.result.policyText}}\n' +
      '【素材池（asset 模式引用；imagery 模式可参考）】（名称/描述/索引）\n{{baseList.result.text}}\n' +
      '【大纲全文（用户已审核）】\n{{outlineReview.md}}\n' +
      '【画面硬性要求】visual 只描述可实拍物理场景（主体/动作/环境/光线/色调/构图景别/情绪/镜头运动），' +
      '禁止任何文字/UI/图形/图表/水印/贴片字幕（所有文字一律走 caption 字幕层）；每镜 1~3 句并给出运镜。\n' +
      '【镜头规则】字幕 caption 为画面要传达的文字（烧录为字幕）；duration 整数秒 4~16；每镜给出 concept（该镜语义主题）。\n' +
      '【模式化镜头输出】依据上方“视觉策略”里的模式：\n' +
      ' - imagery 模式：每镜另给 imagery（意象对象：按意象表命中 + concept 细化的代表性意象画面，可拍无文字）与 visual（=该意象的可执行画面描述）。\n' +
      ' - asset 模式：每镜必须给 assetIdx（引用素材池索引，取值 0..{{strategy.result.baseCount}}-1）与 visual（描述该镜展示素材的角度/景别/运镜/氛围，主体来自素材，不新增文字）。\n' +
      '输出 JSON 数组结构：{"narration":"全片口播（原样保留可用 | 分句）","shots":[{"concept":"语义主题","visual":"画面描述","caption":"字幕短句","duration":秒,"imagery":"意象对象(仅 imagery)","assetIdx":素材索引(仅 asset)}]}。镜头总数 1~20。',
    prompt: '请基于大纲与视觉策略输出镜头 JSON（concept/imagery 或 assetIdx 依模式填写）。',
    jsonMode: true,
    providerConfigId: '{{start.model.providerConfigId}}',
    modelId: '{{start.model.modelId}}',
  }
}

// ---------- 4) splitShots：按 mode 分流（imagery→gen；asset→base 带素材图） ----------
{
  const n = node('splitShots')
  n.config = {
    code: `const shots = Array.isArray(inputs.shots) ? inputs.shots : [];
if (shots.length === 0) throw new Error('分镜拆解结果为空：请检查脚本/大纲内容后重试');
const mode = String(inputs.mode || 'imagery');
const bases = Array.isArray(inputs.bases) ? inputs.bases : [];
const gen = [];
const base = [];
shots.forEach(function (s, i) {
  const s2 = Object.assign({}, s, { _origIndex: i, mode: mode });
  if (mode === 'asset') {
    const idx = Number(s.assetIdx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= bases.length) {
      throw new Error('素材驱动镜头 ' + (i + 1) + ' 缺少有效素材引用（assetIdx=' + String(s.assetIdx) + '，素材池 ' + bases.length + ' 张）：请为每个镜头标注素材索引后重试');
    }
    s2.assetIdx = idx;
    s2.baseImagePath = bases[idx].path || '';
    s2.baseImageUrl = bases[idx].url || '';
    s2.baseImageName = bases[idx].name || '';
    s2.baseAssetId = bases[idx].assetId || bases[idx].id || '';
    base.push(s2);
  } else {
    s2.assetIdx = -1;
    gen.push(s2);
  }
});
return { shots: shots, gen: gen, base: base, mode: mode };`,
    inputs: [
      { key: 'shots', value: '{{shotsGen.parsed.shots}}' },
      { key: 'mode', value: '{{strategy.result.mode}}' },
      { key: 'bases', value: '{{readBase.assets}}' },
    ],
  }
}

// ---------- 5) shotPack：提示词包携带 concept/imagery（意象细化） ----------
{
  const n = node('shotPack')
  n.config.systemPrompt =
    '为单个镜头产出可执行素材包（JSON）：' +
    '{"concept":"语义主题","visual":"画面描述（服从大纲/风格；仅实拍物理场景、无文字、含运镜）","imagery":"意象对象（imagery 模式：依意象表命中细化为可执行画面；asset 模式填空）",' +
    '"caption":"字幕短句","duration":秒,"prompt":"给文生图的完整画面提示词（已含风格与参考图说明；asset 模式此字段可空）"}' +
    '\n【预设规范】\n{{preset.promptBlock}}\n【视觉策略】\n{{strategy.result.policyText}}\n【参考图提示】画面风格与主体须贴合参考图（若有）；意象化空镜禁止出现文字。'
  n.config.prompt =
    '大纲段落：{{loopMat.item.sectionIdx}}\n语义主题：{{loopMat.item.concept}}\n画面要点：{{loopMat.item.visual}}' +
    '\n意象对象：{{loopMat.item.imagery}}\n字幕：{{loopMat.item.caption}}\n时长：{{loopMat.item.duration}}秒\n\n输出该镜头素材包 JSON。'
}

// ---------- 6) matItem（imagery）：卡片带 mode/source ----------
{
  const n = node('matItem')
  n.config = {
    code: `const list = Array.isArray(inputs.img) ? inputs.img : ((inputs.img && inputs.img.images) || []);
const img = (list && list[0]) || {};
const pack = inputs.pack || {};
const it = inputs.item || {};
return { _origIndex: it._origIndex, mode: 'imagery', source: 'generated',
  concept: pack.concept || it.concept || '', imagery: pack.imagery || it.imagery || '',
  visual: pack.visual || it.visual, caption: pack.caption || it.caption,
  duration: Number(pack.duration) > 0 ? pack.duration : it.duration,
  prompt: pack.prompt || '', baseImagePath: '', imagePath: img.path || '', imageUrl: img.localUrl || img.url || '', imageAssetId: '' };`,
    inputs: [
      { key: 'item', value: '{{loopMat.item}}' },
      { key: 'pack', value: '{{shotPack.parsed}}' },
      { key: 'img', value: '{{imgShot.images}}' },
    ],
  }
}

// ---------- 7) matBase（asset）：素材直用卡片带 mode/source/assetIdx ----------
{
  const n = node('matBase')
  n.config = {
    code: `const it = inputs.item || {};
const srcId = it.baseAssetId || '';
return { _origIndex: it._origIndex, mode: 'asset', source: srcId ? 'asset:' + srcId : (it.baseImageName ? '素材:' + it.baseImageName : 'asset'),
  concept: it.concept || '', imagery: '', assetIdx: it.assetIdx,
  visual: it.visual || '', caption: it.caption || '', duration: Number(it.duration) > 0 ? it.duration : 5,
  prompt: it.visual || '', baseImagePath: it.baseImagePath || '', imagePath: it.baseImagePath || '',
  imageUrl: it.baseImageUrl || it.baseImagePath || '', imageAssetId: srcId, imageAssetName: it.baseImageName || '' };`,
    inputs: [
      { key: 'item', value: '{{loopBase.item}}' },
    ],
  }
}

// ---------- 8) boardMerge：聚合带 mode/source 标注；摘要含来源 ----------
{
  const n = node('boardMerge')
  n.config.code = `const unwrap = (r) => (r && typeof r === 'object' && r.result && typeof r.result === 'object' && !('visual' in r)) ? r.result : r;
const a = (Array.isArray(inputs.a) ? inputs.a : []).map(unwrap);
const b = (Array.isArray(inputs.b) ? inputs.b : []).map(unwrap);
const all = a.concat(b).sort(function (x, y) { return (x._origIndex || 0) - (y._origIndex || 0); }).map(function (it, i) {
  const c = Object.assign({}, it, { cardIndex: i });
  delete c._origIndex;
  return c;
});
const summary = all.map(function (c, i) {
  const src = c.source === 'asset' ? (c.imageAssetName ? '（素材:' + String(c.imageAssetName) + '）' : '（素材）') : (c.source === 'generated' ? '（意象生成）' : '');
  return '镜头' + (i + 1) + '：' + String(c.caption || '') + '｜' + String(c.duration || '') + 's' + src;
}).join('\\n');
return { cards: all, summary: summary, mode: String(inputs.mode || '') };`
  n.config.inputs = [
    { key: 'a', value: '{{loopMat.results}}' },
    { key: 'b', value: '{{loopBase.results}}' },
    { key: 'mode', value: '{{strategy.result.mode}}' },
  ]
}

// ---------- 9) 素材板审核：payload 携带视觉策略标注 ----------
{
  const n = node('boardReview')
  const p = n.config.payload || {}
  p.visualStrategy = '{{strategy.result.mode}}'
  n.config.payload = p
}

// ---------- 输出 ----------
const outFile = path.join(__dirname, '..', 'src', 'core', 'database', 'migrations', 'builtin-apps', 'script-to-video-v3.json')
fs.writeFileSync(outFile, JSON.stringify(doc, null, 2), 'utf-8')
console.log('WROTE', outFile, 'nodes=' + g.nodes.length, 'edges=' + g.edges.length, '| has strategy:', g.nodes.some(n => n.id === 'strategy'))
