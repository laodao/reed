/**
 * 写作方法论提示词素材（49 号）
 * @module core/platform/services/writing-methodology
 *
 * 消费方：长文大纲/章节生成（longwriting-ai.service）与 EP 剧本生成（narrative/ai/script-generator）。
 * 纯函数零依赖——方法论是数据配置而非散落 prompt（同 room-phases 的设计纪律），
 * 来源与论证见 docs/design/2026-09-09-writing-quality-optimization.md（R1/R3 调研）。
 */

export type ContentTarget = 'novel' | 'script'

/** 分集大纲条目（script 模式下 generateOneLevelOutline 的扩展字段） */
export interface ScriptEpisodeFields {
  hook?: string
  highlight?: string
  cliffhanger?: string
  hookType?: string
}

/** 大纲 summary 的结构化前缀标记（探测与组装的唯一事实源） */
export const SCRIPT_SUMMARY_MARKERS = ['【开场钩子】', '【本集爽点】', '【集尾卡点】'] as const

/**
 * 分集大纲（script 模式）system prompt。
 * 节拍纪律来自行业调研（R1）：爽点硬配额/卡点公式/钩子类型配比轮换/反派四层递进。
 */
export function buildScriptOutlineSystemPrompt(episodeCount: number): string {
  // 评审 P3-2：锚点集必须落在 1..episodeCount 内，避免对 3 集剧下令"第 4 集是卡点"
  const mid = Math.min(Math.max(3, Math.ceil(episodeCount / 2)), episodeCount)
  const paywall = Math.min(Math.max(4, episodeCount - 2), episodeCount)
  return `你是爆款短剧的金牌分集编剧。请根据故事概要，把故事拆成 ${episodeCount} 集的短剧分集大纲。
你的回复必须是严格的 JSON 数组格式，只包含集的信息，不要包含其他结构。
每集格式：
[
  {
    "name": "第1集 集名",
    "summary": "本集梗概（80-150字：本集戏剧任务+主要冲突+爽点如何落地）",
    "estimatedWords": 目标字数（数字）,
    "hook": "开场钩子：前10秒怎么抓人（从冲突/情绪顶点切入）",
    "highlight": "本集爽点/情绪高点（谁被打脸/什么身份即将揭露）",
    "cliffhanger": "集尾卡点：切在问题上，不切在答案上",
    "hookType": "悬念、危机、情绪、信息、反转 五选一"
  }
]

节奏纪律（硬配额，违反即废稿）：
1. 每集至少 1 个小爽点 + 1 个反转；第一个大反转必须出现在前 3 集。
2. 第 ${mid} 集安排公开反击级的中爽点大场面；第 ${paywall} 集是全剧卡点位=全剧情绪最高点+极致悬念；最后两集完成揭露兑现与终极清算。
3. 憋屈不过夜——受辱必须当集内开始反击；高潮点后移会让留存暴跌。
4. 钩子类型在 悬念/危机/情绪/信息/反转 间轮换，相邻两集不得同型。
5. 反派递进：小反派（前1/4）→中反派（前2/3）→大反派→隐藏反派；反派结局必须输在信息差而非降智。
6. 打脸四步完整：羞辱→隐忍→反击→释放；反派台词越狠越好，且要留打脸漏洞。
只返回 JSON 数组，不要有任何其他文字。`
}

/** 字段容错（评审 P2-2）：模型可能返回非字符串，归一为 trim 后的字符串或空串 */
function toSafeText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** 把分集扩展字段组装成 summary 结构化后缀（零迁移：随 summary 进库，天然流入章节生成上下文） */
export function enrichScriptEpisodeSummary(summary: string, fields: ScriptEpisodeFields): string {
  const lines = [
    summary?.trim() || '',
    toSafeText(fields.hook) ? `【开场钩子】${toSafeText(fields.hook)}` : '',
    toSafeText(fields.highlight) ? `【本集爽点】${toSafeText(fields.highlight)}` : '',
    toSafeText(fields.cliffhanger)
      ? `【集尾卡点】${toSafeText(fields.cliffhanger)}${toSafeText(fields.hookType) ? `（${toSafeText(fields.hookType)}钩）` : ''}`
      : '',
  ].filter(Boolean)
  return lines.join('\n')
}

/** 大纲 summary 是否携带分集节拍结构（探测章节生成是否处于 script 纪律） */
export function detectScriptSummary(summary: string | null | undefined): boolean {
  if (!summary) return false
  return SCRIPT_SUMMARY_MARKERS.some((m) => summary.includes(m))
}

/**
 * 章节生成的 contentTarget 决议：显式指定 > 项目 room 状态 > 大纲 summary 探测 > novel。
 * 纯函数，供服务层与单测共用。
 */
export function resolveContentTarget(
  explicit: ContentTarget | undefined,
  roomContentTarget: string | null | undefined,
  outlineSummary: string | null | undefined,
): ContentTarget {
  if (explicit) return explicit
  if (roomContentTarget === 'script') return 'script'
  if (detectScriptSummary(outlineSummary)) return 'script'
  return 'novel'
}

/**
 * script 模式章节纪律：本篇 = 一集短剧的正文底稿，之后被拆成剧本。
 * nextTask = 下一集大纲（去向卡，让本章知道要把故事落到哪里——AI_NovelGenerator 下一章卡片配方）。
 */
export function buildScriptChapterDiscipline(nextTask?: { name?: string; summary?: string } | null): string {
  const next = nextTask?.summary?.trim()
    ? `\n### 下一集去向（本章收束的方向）\n下一集「${nextTask.name || ''}」：${nextTask.summary!.trim()}\n本章结尾必须为上述去向铺好台阶（卡点指向它）。`
    : ''
  return `## 短剧分集写作纪律（本篇=一集短剧的正文底稿，之后将被拆成剧本）

### 单集四拍引擎
- 开场（前10%）：从冲突/情绪顶点切入，禁止平铺直叙或环境铺垫开场；陌生人没有前情也能看懂。
- 摩擦（中段前半）：三句对白之内必须浮出本集核心冲突；无闲聊、无铺垫句。
- 顶点（中段后半）：本集最大一击（爽点或虐点）正面展开，写足情绪峰值。
- 卡点（最后5%）：在问题最紧处戛然而止——切在问题上，不切在答案上。

### 体量与台词
- 场景不超过 3 个；对白以短句为主（每句≤30字），对白占比不低于四成。
- 角色首次出场必须有完整外貌锚定（年龄感/发型/服装/气质），后续描写保持一致。
- 角色不解释情绪，只行动、否认或转移；独白全篇最多 1 处。

### 大纲落实
- 大纲中标注的【开场钩子】【本集爽点】【集尾卡点】必须如实落地，不得弱化或挪移。${next}`
}

/**
 * novel 模式章节纪律（网文章节钩子+悬念交替）。
 * chapterNumber ≤3 时追加"黄金三章"任务（第一章出事钉住读者/第二章期待+反转/第三章亮金手指）。
 */
export function buildNovelChapterDiscipline(chapterNumber?: number): string {
  const golden = chapterNumber !== undefined && chapterNumber <= 3
    ? `\n### 黄金三章（本章在第 ${chapterNumber} 章，执行网文开篇任务）\n- 第1章：立刻出事，把读者钉住。\n- 第2章：给期待、给反转、给"惨"（退婚/羞辱/被当废物/追杀）。\n- 第3章：亮金手指或引出主线，给足期待感。`
    : ''
  return `## 章节钩子纪律${golden}

- 开篇第一段即入事（冲突/异常/悬念），不用大段环境描写开场。
- 解扣同时系新扣：本章至少推进解决一个悬念，同时埋下或加深一个新悬念。
- 章节结尾必须停在钩子上（悬念/危机/情绪爆点），给读者"必须点开下一章"的理由。${golden ? '\n- 黄金三章期间节奏优先于文笔：先抓住人，再谈铺陈。' : ''}`
}

/** EP 剧本生成纪律：原著正文 → 竖屏短剧剧本的改编硬规范 */
export function buildScriptGenerationDiscipline(): string {
  return `## 短剧剧本改编纪律（原著正文 → 竖屏短剧剧本）

- 黄金三秒：第一场直接从冲突或动作切入，禁止环境铺垫开场。
- 台词口语化短句（每句≤20字为宜）；每场戏三句对白内必须浮出冲突。
- 原著注明的集尾卡点必须落在最后一场的最后一拍——切在问题上，不切在答案上。
- 角色首次出场在 outfit/expression 中给出完整外貌锚定（颜色/风格/年龄感），后续场景保持一致。
- 每场 mood 标注情绪基调；重要转折场在 sceneDescription 尾部给出镜头建议（特写/全景/对切）。
- 原著注明的本集爽点必须落进对应场景正面展开，不得弱化为侧面交代。`
}
