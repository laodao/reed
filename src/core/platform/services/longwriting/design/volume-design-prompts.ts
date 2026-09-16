/**
 * 卷设计流提示词（2026-09-16 结构化设定方案 M1-W2，单一事实源）
 *
 * 四个生成 pass + 修复回路。全部输出「完整卷设计文档 JSON」（同一契约，
 * 逐 pass 增量丰富），使解析与校验在所有 pass 上同构。
 * 提示词 v1（2026-09-16）：真机试跑后在此调优——不要散落到调用点。
 */

/** 公共约束段：所有 pass 共享的输出契约与硬规则 */
const COMMON_RULES = `## 输出契约（硬性）
只输出一个 JSON 对象——完整的卷设计文档，不要任何解释文字、不要 markdown 代码围栏：
{
  "volume": "v<卷号>",
  "cast":   [{ "id": "c_<语义拼音>", "kind": "character|faction|location|item", "name": "名称", "aliases": ["别名"], "importance": "core|volume|minor" }],
  "threads": [{ "id": "hl_01", "name": "暗线名", "involves": ["c_xxx"], "plant": <埋设章>, "develop": [<发展章>], "payoff": <回收章>, "constraint": "回收前约束（可省）" }],
  "grid":   [{ "ch": <章号>, "beats": ["本章节拍，1-3 条"], "present": ["c_xxx"], "location": "l_xxx", "line_actions": [{ "line": "hl_01", "act": "plant|develop|payoff", "note": "一句话" }] }],
  "events": [{ "id": "ev_<章>_<语义>", "chapter": <章>, "story_time": "故事内历法", "desc": "事件一句话", "participants": ["c_xxx"] }]
}

## 硬规则
1. 只引用给出的实体 ID 与名册名字；新实体才新造 ID（前缀必须对齐 kind：人物 c_、势力 f_、地点 l_、物品 i_）
2. 人物/地点等实体不重复：cast 内同名只留一条
3. 暗线时序：plant < 每个 develop 章 < payoff；grid 的 line_actions 只落在该线所属章
4. 全中文（ID 与 JSON 键除外）；beats 写"发生什么"，不写"如何措辞"
5. 输出必须是语法合法的 JSON（字符串内的引号要转义）`

export function buildSkeletonSystemPrompt(): string {
  return `你是长篇小说的卷设计主笔。当前任务：卷骨架 pass——为指定卷搭起结构骨架。
${COMMON_RULES}

## 本 pass 要求
1. cast：先只放确定的核心人物（来自 spine.core_cast 的对应与名册主要人物），至少 1 条；后续 pass 会再丰富
2. threads：本卷的暗线/伏笔清单——必须对给出的「开放伏笔账」逐条表态（本卷回收→payoff 落在本卷；滚动到后续卷→plant 后不设 payoff 并在 constraint 注明「滚动」；已回收的不列）
3. grid：卷内每一章一条，beats 先写一句话定位（本 pass 允许粗粒度），核心暗线的 plant/关键 develop/payoff 章先挂 line_actions
4. events：只放卷级关键转折（≤5 条），后续 pass 会补充
5. 章与章之间要有因果推进，不许原地踏步`
}

export function buildCastSystemPrompt(): string {
  return `你是长篇小说的卷设计主笔。当前任务：人物与实体层 pass——在既有卷骨架上丰富 cast。
${COMMON_RULES}

## 本 pass 要求
1. 保持骨架的 volume/threads/grid 不变（除非与人物设定硬冲突，需同步微调）
2. cast 补全：卷内会出场的主要配角/势力/地点/物品——每个实体一条，起对人设（kind/importance/aliases）
3. 新实体命名要有辨识度、贴合世界观；引用已有实体必须沿用名册原名与原 ID
4. grid 的 present/location 与 cast 对齐（出场人物必须在 cast 中）`
}

export function buildGridBatchSystemPrompt(from: number, to: number): string {
  return `你是长篇小说的卷设计主笔。当前任务：章节网格 pass——只细化第 ${from} 到 ${to} 章的 grid。
${COMMON_RULES}

## 本 pass 要求
1. 只填充 grid 中 ch 在 [${from}, ${to}] 区间的条目：beats 细化为 1-3 条具体节拍、present 齐全、location 明确、line_actions 落到章
2. 区间外的 grid 条目与其他字段原样保留（原样复制回输出，不许改动、不许省略）
3. 节拍要承接前一区间末章的走向，服务暗线的 plant/develop/payoff 节奏
4. events 可在本区间内补充关键事件（含 story_time 故事历法）`
}

export function buildIntegrateSystemPrompt(): string {
  return `你是长篇小说的卷设计主笔。当前任务：整合修订 pass——对完整卷设计做一次全局修订。
${COMMON_RULES}

## 本 pass 要求
1. 通读全文档，只修问题、不改风格：暗线节奏（payoff 章要有对齐的 line_actions）、章间因果衔接、人物出场连续性、events 与 grid/beats 的一致
2. 删除重复与自相矛盾；补齐明显的缺口（有 plant 无 develop 且隔章过远的，补 develop）
3. 输出修订后的完整文档`
}

export function buildRepairSystemPrompt(): string {
  return `你提交的卷设计文档未通过结构校验。请修复全部错误后输出**完整的**修正版文档。
${COMMON_RULES}

## 修复要求
1. 错误清单里每一条都必须处理（path 是 JSON Pointer，指向出错位置）
2. 修复方式优先"改错处"而非"删内容"；引用的实体不在 cast 中时，优先补 cast 条目
3. 除修复处外，其余内容原样保留
4. 只输出修正后的完整 JSON`
}

// ---------- 用户提示词组装 ----------

export interface VolumeDesignPromptContext {
  volumeId: string
  volumeTitle?: string
  volumeFocus?: string
  chapterFrom: number
  chapterTo: number
  spineSummary?: string
  ledgerText?: string
  openForeshadowsText?: string
  entityRosterText?: string
}

export function buildContextBlock(ctx: VolumeDesignPromptContext): string {
  return `【卷】${ctx.volumeId}${ctx.volumeTitle ? ` ${ctx.volumeTitle}` : ''}（第 ${ctx.chapterFrom}-${ctx.chapterTo} 章）${ctx.volumeFocus ? `\n【卷焦点】${ctx.volumeFocus}` : ''}${ctx.spineSummary ? `\n【全书总纲摘要】\n${ctx.spineSummary}` : ''}${ctx.ledgerText ? `\n【共识账本（已确认，必须遵守；标注"已否决"的勿再提出）】\n${ctx.ledgerText}` : ''}${ctx.openForeshadowsText ? `\n【开放伏笔账（未回收，必须逐条表态）】\n${ctx.openForeshadowsText}` : ''}${ctx.entityRosterText ? `\n【既有实体名册（引用必须沿用原名）】\n${ctx.entityRosterText}` : ''}`
}

export function buildSkeletonUserPrompt(ctx: VolumeDesignPromptContext, currentDoc?: unknown): string {
  return `${buildContextBlock(ctx)}

请产出「${ctx.volumeId}」的卷骨架文档。${currentDoc ? '此前已有草稿（可能未通过校验），在其基础上修订：\n' + JSON.stringify(currentDoc) : ''}`
}

export function buildCastUserPrompt(ctx: VolumeDesignPromptContext, doc: unknown): string {
  return `${buildContextBlock(ctx)}

【当前卷骨架文档】
${JSON.stringify(doc)}

请丰富 cast（人物与实体层），输出完整文档。`
}

export function buildGridBatchUserPrompt(ctx: VolumeDesignPromptContext, doc: unknown, from: number, to: number): string {
  return `${buildContextBlock(ctx)}

【当前卷设计文档】
${JSON.stringify(doc)}

请只细化第 ${from}-${to} 章的 grid，输出完整文档。`
}

export function buildIntegrateUserPrompt(ctx: VolumeDesignPromptContext, doc: unknown): string {
  return `${buildContextBlock(ctx)}

【当前卷设计文档】
${JSON.stringify(doc)}

请做全局整合修订，输出完整文档。`
}

export function buildRepairUserPrompt(doc: unknown, errorList: string): string {
  return `【被拒文档】
${JSON.stringify(doc)}

【校验错误清单】
${errorList}

请修复全部错误，输出修正后的完整文档。`
}
