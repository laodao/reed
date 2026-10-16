# -*- coding: utf-8 -*-
"""长文写作内置应用 v2 改造：风格卡逐章 + 大纲确认 + 去AI味 + 终稿确认 + 修订分支 + 版本链"""
import json

P = 'src/core/database/migrations/builtin-apps/long-form-writing.json'
d = json.load(open(P, encoding='utf-8'))
g = d['graph']
nodes = {n['id']: n for n in g['nodes']}

# ---------- 1. start 输入扩展 ----------
si = nodes['start']['config']['inputs']
keys = [i['key'] for i in si]
def add_input(idx, spec):
    keys.insert(idx, spec['key']); si.insert(idx, spec)

i = keys.index('style')
add_input(i, {"key": "style_card", "label": "风格卡（writing-styles 风格库；auto=按主题自动判定）", "type": "select", "defaultValue": "auto", "options": [
    {"label": "自动判定（按主题选最合适的风格卡）", "value": "auto"},
    {"label": "时政深度·书面分析体", "value": "affairs-formal"},
    {"label": "深度叙事·说书杂谈", "value": "luke-narrative"},
    {"label": "深度叙事·人物特稿", "value": "luke-feature"},
    {"label": "深度叙事·战局复盘", "value": "luke-war"},
    {"label": "科技解读·科普特稿（诺奖/新技术，类比通俗化）", "value": "science-explainer"},
    {"label": "财经产业史诗", "value": "finance-story"},
    {"label": "调查特稿", "value": "feature-report"},
    {"label": "情感共鸣文", "value": "emotional"},
    {"label": "干货教程", "value": "knowledge"},
    {"label": "知乎高赞回答体", "value": "zhihu-answer"},
    {"label": "小红书清单体", "value": "listicle"},
    {"label": "短视频口播脚本", "value": "script-spoken"},
]})
i = keys.index('premise')
add_input(i, {"key": "current_content", "label": "已有成稿（修订模式；非空=跳过创作管线，直接按意见修订）", "type": "textarea"})
add_input(i, {"key": "base_asset_id", "label": "基底资产 ID（修订续链：填上次运行产出的资产 ID，终稿将追加为该资产新版本）", "type": "string"})
add_input(i, {"key": "feedback", "label": "修改意见（修订模式）/版本说明", "type": "textarea"})
i = keys.index('model')
add_input(i, {"key": "intensity", "label": "去AI味强度", "type": "select", "defaultValue": "标准", "options": [
    {"label": "保守（学术/公文，只删连接词与套话）", "value": "保守"},
    {"label": "标准（自媒体/公关，完整去AI清单+适度口语化）", "value": "标准"},
    {"label": "激进（创意写作/社交帖，可大改句式注入口语）", "value": "激进"},
]})
add_input(i, {"key": "keep", "label": "去AI味时必须保留（默认保护引语与口径）", "type": "textarea", "defaultValue": "直接引语一字不动；数字、日期与口径标注不得改"})
add_input(i, {"key": "libaiModel", "label": "去AI味模型（建议与写作模型不同族，保证独立视角）", "type": "model", "required": True})

# ---------- 2. outline 升级（卡点/钩子） ----------
o = nodes['outline']['config']
o['systemPrompt'] += '\n每个章节的输出字段增加 "hook"（本章末尾的钩子/卡点：悬念、反差或未解问题，负责把读者推向下一章；至少两章设置卡点，末章负责收束或留开放问题）。开篇章必须执行既定钩子方案。'
o['maxTokens'] = 8192

# ---------- 3. loop1 改吃确认后的大纲 ----------
nodes['loop1']['config']['listExpression'] = '{{parseOutline.result.sections}}'

# ---------- 4. chapter → writing-styles 技能调用 ----------
nodes['chapter']['type'] = 'skill-call'
nodes['chapter']['config'] = {
    "skillId": "writing-styles",
    "inputs": [
        {"key": "topic", "value": "{{start.topic}}"},
        {"key": "material", "value": "{{start.material}}"},
        {"key": "style", "value": "{{start.style_card}}"},
        {"key": "platform", "value": "{{start.reader}}"},
        {"key": "word_count", "value": "{{start.wordCountPerChapter}}"},
        {"key": "extra", "value": "{{start.premise}}"},
        {"key": "current_content", "value": ""},
        {"key": "feedback", "value": ""},
        {"key": "section_brief", "value": "第 {{loop1.index}} 章「{{loop1.item.title}}」\n本章要点：{{loop1.item.summary}}\n本章素材要点：{{loop1.item.facts}}\n本章末尾钩子/卡点：{{loop1.item.hook}}\n开篇钩子（首章执行）：{{angle.parsed.chosen}}\n全文主线：{{storyline.content}}\n写作模式：{{modePick.result.mode}}（nonfiction=纪实锁定素材口径；fiction=小说模式自由写作）"},
    ],
    "providerConfigId": "{{start.model.providerConfigId}}",
    "modelId": "{{start.model.modelId}}",
    "maxTokens": 16384,
}

# ---------- 5. concat1 剥离【本章梗概】 ----------
c1 = nodes['concat1']['config']
c1['code'] = "const chapters = Array.isArray(inputs.chapters) ? inputs.chapters : [];\nconst title = (inputs.title || '').trim();\nconst body = chapters.map(function (c, i) {\n  const text = c && c.content ? c.content : (typeof c === 'string' ? c : '');\n  const clean = text.replace(/\\n*【本章梗概】[^\\n]*/g, '').trim();\n  const head = (c && c.title) ? '## ' + c.title + '\\n\\n' : '';\n  return (i > 0 ? '\\n\\n' : '') + head + clean;\n}).join('');\nreturn (title ? '# ' + title + '\\n\\n' : '') + body;"

# ---------- 6. save1 接版本链 / saveKb1 吃终稿 ----------
nodes['save1']['config'].update({
    "content": "{{finalPick.result.content}}",
    "versioned": True,
    "versionOfAssetId": "{{start.base_asset_id}}",
    "feedback": "{{start.feedback}}",
})
nodes['saveKb1']['config']['content'] = "{{finalPick.result.content}}"

# ---------- 7. 新增节点 ----------
PARSE_OUTLINE_CODE = (
    "function tryParse(t) {\n"
    "  if (!t) return null;\n"
    "  const clean = String(t).replace(/^```(json)?/gm, '').replace(/```/gm, '').trim();\n"
    "  try { return JSON.parse(clean); } catch (e) { return null; }\n"
    "}\n"
    "let obj = tryParse(inputs.edited);\n"
    "if (!obj) obj = tryParse(inputs.fallback);\n"
    "if (Array.isArray(obj)) obj = { sections: obj };\n"
    "if (!obj || !Array.isArray(obj.sections)) obj = { sections: [] };\n"
    "return { sections: obj.sections };"
)

def add(node):
    g['nodes'].append(node)

add({"id": "outlineReview", "type": "human-review", "name": "大纲确认", "position": {"x": 1420, "y": 300}, "config": {
    "payload": "## 章节大纲（确认后执行；可直接修改「大纲」字段——每章 title/summary/facts/hook 均可改）\n\n{{outline.parsed}}",
    "editableFields": [{"key": "outline", "label": "章节大纲 JSON（可直接修改）", "type": "string"}],
    "timeoutMs": None, "timeoutPolicy": "fail"}})
add({"id": "parseOutline", "type": "code", "name": "解析确认后大纲", "position": {"x": 1660, "y": 300}, "config": {
    "language": "js",
    "inputs": [{"key": "edited", "value": "{{outlineReview.values.outline}}"}, {"key": "fallback", "value": "{{outline.parsed}}"}],
    "code": PARSE_OUTLINE_CODE}})
add({"id": "planHint", "type": "message", "name": "驳回提示（大纲）", "position": {"x": 1660, "y": 520}, "config": {
    "content": "结构大纲已驳回。请调整「设定/侧重」或「修改意见」后重新运行本应用，大纲将按新要求重新生成。"}})
add({"id": "cond_mode", "type": "condition", "name": "修订还是新写", "position": {"x": 300, "y": 300}, "config": {
    "branches": [
        {"branchId": "revision", "label": "修订模式（已有成稿）", "conditions": [{"left": "{{start.current_content}}", "operator": "not_empty"}]},
        {"branchId": "normal", "label": "全新创作", "conditions": [{"left": "{{start.current_content}}", "operator": "is_empty"}]},
    ],
    "noMatchPolicy": "fallback", "fallbackBranchId": "normal"}})
add({"id": "revise1", "type": "skill-call", "name": "按意见修订（writing-styles 修订模式）", "position": {"x": 540, "y": 560}, "config": {
    "skillId": "writing-styles",
    "inputs": [
        {"key": "topic", "value": "{{start.topic}}"},
        {"key": "material", "value": "{{start.material}}"},
        {"key": "style", "value": "{{start.style_card}}"},
        {"key": "platform", "value": "{{start.reader}}"},
        {"key": "word_count", "value": "{{start.wordCountPerChapter}}"},
        {"key": "extra", "value": "{{start.premise}}"},
        {"key": "current_content", "value": "{{start.current_content}}"},
        {"key": "feedback", "value": "{{start.feedback}}"},
        {"key": "section_brief", "value": ""},
    ],
    "providerConfigId": "{{start.model.providerConfigId}}",
    "modelId": "{{start.model.modelId}}",
    "maxTokens": 32768}})
add({"id": "mergePick", "type": "code", "name": "合流（修订稿/创作稿）", "position": {"x": 3060, "y": 300}, "config": {
    "language": "js",
    "inputs": [{"key": "revised", "value": "{{revise1.content}}"}, {"key": "draft", "value": "{{finalPack.result.md}}"}],
    "code": "const revised = String(inputs.revised || '').trim();\nconst draft = String(inputs.draft || '');\nreturn { content: revised || draft, revised: Boolean(revised) };"}})
add({"id": "libai", "type": "skill-call", "name": "去AI味（libai-skill）", "position": {"x": 3300, "y": 300}, "config": {
    "skillId": "libai-skill",
    "inputs": [
        {"key": "source_text", "value": "{{mergePick.result.content}}"},
        {"key": "intensity", "value": "{{start.intensity}}"},
        {"key": "keep", "value": "{{start.keep}}"},
    ],
    "providerConfigId": "{{start.libaiModel.providerConfigId}}",
    "modelId": "{{start.libaiModel.modelId}}",
    "maxTokens": 32768}})
add({"id": "pack", "type": "code", "name": "终稿切分", "position": {"x": 3540, "y": 300}, "config": {
    "language": "js",
    "inputs": [{"key": "libai", "value": "{{libai.content}}"}, {"key": "draft", "value": "{{mergePick.result.content}}"}],
    "code": "const SPLIT = '=====FINAL=====';\nconst src = String(inputs.libai || '');\nconst draft = String(inputs.draft || '');\nconst i = src.indexOf(SPLIT);\nlet final = '';\nlet diagnosis = '';\nif (i >= 0) {\n  diagnosis = src.slice(0, i).trim();\n  final = src.slice(i + SPLIT.length).trim();\n}\nif (!final) final = draft;\nreturn { final, diagnosis: diagnosis || '（未产出诊断段）', fallbackUsed: i < 0 };"}})
add({"id": "finalReview", "type": "human-review", "name": "终稿确认", "position": {"x": 3780, "y": 300}, "config": {
    "payload": "{{pack.result.final}}",
    "editableFields": [{"key": "content", "label": "终稿全文（可直接修改，修改后保存修改版）", "type": "string"}],
    "timeoutMs": None, "timeoutPolicy": "fail"}})
add({"id": "finalPick", "type": "code", "name": "终稿取值", "position": {"x": 4020, "y": 300}, "config": {
    "language": "js",
    "inputs": [{"key": "edited", "value": "{{finalReview.values.content}}"}, {"key": "final", "value": "{{pack.result.final}}"}],
    "code": "const edited = String(inputs.edited || '').trim();\nconst final = String(inputs.final || '');\nreturn { content: edited || final };"}})
add({"id": "reviseHint", "type": "message", "name": "驳回提示（终稿）", "position": {"x": 4020, "y": 540}, "config": {
    "content": "终稿已驳回。请在同一会话再次运行本应用：填「基底资产 ID」（上次运行产出的资产 ID）+「已有成稿」+「修改意见」，修订内容将作为该资产的新版本保存（历史版本可回滚）。"}})

# ---------- 8. 边重写 ----------
def E(sid, tid, kind='normal'):
    return {"id": 'e_%s_%s_%s' % (sid, tid, kind), "sourceNodeId": sid, "targetNodeId": tid, "kind": kind}

g['edges'] = [
    E('start', 'digest'),
    E('digest', 'modePick'),
    E('modePick', 'cond_mode'),
    E('cond_mode', 'revise1', 'branch'),
    E('cond_mode', 'angle', 'branch'),
    E('angle', 'storyline'),
    E('storyline', 'outline'),
    E('outline', 'outlineReview'),
    E('outlineReview', 'parseOutline', 'approve'),
    E('outlineReview', 'planHint', 'reject'),
    E('planHint', 'end'),
    E('parseOutline', 'loop1'),
    E('loop1', 'chapter', 'loop-body'),
    E('chapter', 'loop1', 'loop-back'),
    E('loop1', 'concat1', 'loop-done'),
    E('concat1', 'factCheck'),
    E('factCheck', 'applyFix'),
    E('applyFix', 'editLoop'),
    E('editLoop', 'editEval', 'loop-body'),
    E('editEval', 'editFix'),
    E('editFix', 'editPack'),
    E('editPack', 'editLoop', 'loop-back'),
    E('editLoop', 'titles', 'loop-done'),
    E('titles', 'finalPack'),
    E('finalPack', 'mergePick'),
    E('revise1', 'mergePick'),
    E('mergePick', 'libai'),
    E('libai', 'pack'),
    E('pack', 'finalReview'),
    E('finalReview', 'finalPick', 'approve'),
    E('finalReview', 'reviseHint', 'reject'),
    E('reviseHint', 'end'),
    E('finalPick', 'cond1'),
    E('cond1', 'saveKb1', 'branch'),
    E('cond1', 'save1', 'branch'),
    E('saveKb1', 'save1'),
    E('save1', 'end'),
]

# ---------- 9. 描述更新 ----------
d['description'] = ('长文引擎 v2（全新创作/修订双模式）：素材消化选材 → 模式分流（修订模式=按意见整篇修订续版本链）→ 开篇钩子比选 → 主线 → '
                    '章节大纲（每章末尾卡点）→ 大纲人工确认（可直接改大纲 JSON）→ 逐章写作（writing-styles 风格卡技能逐章承接前文）→ 合并 → '
                    '事实校验（纪实逐条对照素材）→ 编辑评审循环（独立模型五维评分）→ 合流 → libai 去AI味（独立模型）→ 终稿人工确认（可直接改稿，'
                    '驳回=带意见重跑续版本链）→ 备选标题 → 入资产（versioned 版本链，资产中心可查历史/回滚）')

json.dump(d, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('✅ long-form-writing v2 改造完成：nodes', len(g['nodes']), 'edges', len(g['edges']))
