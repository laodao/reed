/**
 * 知识大脑 Prompt 模板（P-1/P-3，详细设计 §4）
 * @module platform/services/kb-brain/prompts
 *
 * P-4 反思 / P-5 设定归纳 / P-6 视角遍随 M2 里程碑加入。
 * 判例来源：Graphiti dedupe/反泛化协议（调研存档 b/zep-graphiti-temporal-kg.md）。
 */

/* ==================== P-1 ATOMIZE（两段式合一调用） ==================== */

export const ATOMIZE_SYSTEM = `你是文学资料研究员。把给定章节文本提炼为「原子论断」。

规则：
1. 每条论断必须自包含（无代词悬挂、无"它/本书/本章"回指）、一句话、不超过60字。
2. 忠实原文细节：专名、数量、身份不许泛化（例如"Gamecube"不得写成"游戏机"，"福特野马"不得写成"汽车"）。
3. type 分类：
   fact=情节/设定事实；claim=观点/作者态度（表述时保留"据称/在作者看来"等限定）；
   concept=概念定义；method=写作手法/结构规律；insight=可迁移洞见；
   open-question=文本未交代的悬置点（是创作与深挖的钩子，鼓励标出）。
4. validFrom/validUntil 仅当文本明确给出事实的有效期或先后变化时填写（如"第三卷开始后"），否则省略。
5. 事件序列：相邻句之间若有因果/转折推进，输出 events（fromQuote/toQuote 引原文短句 + 一句 evidence）。
6. 宁缺毋滥：纯过场描写、无信息量的对话不产出。
7. quote 必须是原文中连续的一小段文字（供程序定位，禁止改写、禁止拼接两处）。

只输出 JSON，不要任何解释。`

export function buildAtomizeUser(input: {
  chapterTitle: string
  windowText: string
  knownEntityNames?: string[]
}): string {
  const known = input.knownEntityNames?.length
    ? `\n已知名词表（论断的 subject/object 优先使用这些规范名）：${input.knownEntityNames.join('、')}`
    : ''
  return `章节标题：${input.chapterTitle}\n${known}\n文本：\n${input.windowText}`
}

/* ==================== P-3 ADJUDICATE（Graphiti dedupe 协议） ==================== */

export const ADJUDICATE_SYSTEM = `你是知识库裁决员。NEW FACTS 是刚提炼的论断，EXISTING FACTS 是库中已存在的论断，都已编号。

对每条 NEW FACTS 判定三选一：
- duplicate：语义上与某条旧论断等同（只是措辞不同）。
- contradicts：与某条旧论断冲突。分两档：
  - severity=update：同一事实的更新版本（如职务晋升、状态变化）——新替旧。
  - severity=conflict：事实互斥且无法用"时间先后/更新"解释——标记存疑待人审。
- novel：与现有论断都无关。

判例：
- 旧"程野是捕头" + 新"程野是总捕头" → contradicts（update，职务变化）
- 旧"程野周二跑了5公里" + 新"程野周三跑了3公里" → novel（不同事件）
- 旧"复仇必升级" + 新"复仇必升级（措辞不同）" → duplicate
- 同一条旧论断可以同时出现在 duplicates 与 contradictions 中（语义等同但被新证据更新）。

只裁决事实与方法层；视角/观感类论断不在裁决范围。
只输出 JSON，不要任何解释。`

export function buildAdjudicateUser(input: {
  newItems: Array<{ idx: number; statement: string }>
  existingItems: Array<{ idx: number; statement: string; status: string }>
}): string {
  const fmt = (rows: Array<{ idx: number; statement: string; status?: string }>): string =>
    rows
      .map((r) => (r.status ? `[${r.idx}] (${r.status}) ${r.statement}` : `[${r.idx}] ${r.statement}`))
      .join('\n')
  return `NEW FACTS:\n${fmt(input.newItems)}\n\nEXISTING FACTS:\n${fmt(input.existingItems)}`
}
