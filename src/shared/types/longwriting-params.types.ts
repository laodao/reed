/**
 * 长文写作参数默认值 / 硬上限
 * @module shared/types/longwriting-params.types
 *
 * ── 为什么这些要开放 ──
 * 长文写作（章节生成主链 + 故事研讨室）此前把这些数**写死在各自模块里**，用户撞上只能改代码：
 * - 章节生成：`windowTokens = 32_768`、`maxTokens = Math.min(targetWords*2, 8192)` 是硬夹——
 *   章节目标字数调大后输出会被 8192 腰斩，而窗口预算用户根本看不见；
 * - 章节目标字数 3000 / 段落目标字数 500 / 上章结尾注入 550 / 记忆注入条数 10 与 5：
 *   不同题材（短剧 vs 长篇）需要的量级差别很大；
 * - 故事研讨室：历史只注入最近 40 条、单条截断（用户 600 / 主编 4000 分级）、摘要阈值 20 轮 /
 *   一次压缩 10 轮、前情提要上限 6000、主编单轮最多 24 步、账本容量 60、单次提炼最多 6 张卡、
 *   大纲叶子只列 30 个——
 *   研讨到中后期这些"小值"会直接变成"主编记不住前面聊了什么"。
 *
 * 归入「参数设置 → 长文写作」Tab（两个 settings 键：`longwriting:writing` / `longwriting:storyRoom`）。
 * 两个键的载荷都是**平铺**的（键名本身已是"模块:对象"，不再套一层 `writing.writing`）。
 */

/** 章节生成主链 */
export interface LongwritingWritingParams {
  /** 上下文窗口预算（token；章节工作台按它算占用率） */
  windowTokens: number
  /** 单次生成输出上限（token；与目标字数的两倍取小） */
  maxOutputTokens: number
  /** 章节目标字数（大纲未写 estimatedWords 且调用方未指定时的缺省值） */
  chapterTargetWords: number
  /** 段落（评论段落）目标字数缺省值 */
  sectionTargetWords: number
  /** 上章结尾注入字数 */
  previousChapterEndingChars: number
  /** 前文状态摘要链注入章数（W2.2：写作带最近 N 章的结束状态摘要；1=仅上一章，旧行为） */
  stateSummaryChainLimit: number
  /** 重要记忆注入条数 */
  normalMemoryLimit: number
  /** 次要记忆注入条数 */
  minorMemoryLimit: number
  /** 世界观库常驻注入预算（token；0=关闭库注入。设定资产库 2026-09-24） */
  worldContextMaxTokens: number
}

/** 故事研讨室 */
export interface LongwritingStoryRoomParams {
  /** 每轮注入的历史条数（原生 messages 窗口） */
  historyLimit: number
  /** 历史单条注入截断——用户输入（字符；分级截断见六扇门复盘 P0） */
  historyUserMaxChars: number
  /** 历史单条注入截断——主编（assistant）设计消息（字符；放宽防设计后半段被腰斩） */
  historyAssistantMaxChars: number
  /** 未摘要轮数达到该值触发滚动摘要 */
  summaryThresholdTurns: number
  /** 每次滚动摘要压缩的轮数 */
  summaryBatchTurns: number
  /** 前情提要总长上限（字符；超出从头丢弃最老分段） */
  maxSummaryChars: number
  /** 主编单轮最多几步 */
  editorMaxSteps: number
  /** 共识账本容量 */
  ledgerCap: number
  /** 单次提炼的卡片数上限 */
  maxCardsPerDistill: number
  /** 章节卡提炼时列出的大纲叶子节点上限 */
  outlineLeafLimit: number
}

/** 长文写作参数（分组；跨两个 settings 键） */
export interface LongwritingRuntimeParams {
  writing: LongwritingWritingParams
  storyRoom: LongwritingStoryRoomParams
}

/** 内置默认值（= 改造前写死在各自模块里的常量） */
export const LONGWRITING_DEFAULTS: LongwritingRuntimeParams = {
  writing: {
    windowTokens: 32_768, // longwriting-ai.service.ts `const windowTokens = 32_768`
    maxOutputTokens: 8_192, // 同文件 `Math.min(targetWordsFinal * 2, 8192)`
    chapterTargetWords: 3_000, // 同文件 `opts.targetWords || outline.estimatedWords || 3000`
    sectionTargetWords: 500, // generateSection 的 `targetWords || outline.estimatedWords || 500`
    previousChapterEndingChars: 550, // extractEndingContentByParagraph 的 `targetChars = 550`
    stateSummaryChainLimit: 3, // W2.2：写作带最近 3 章结束状态摘要（1=旧行为仅上一章）
    normalMemoryLimit: 10, // getMemoryContext 的 `normalMemories.slice(0, 10)`
    worldContextMaxTokens: 2_000, // 世界观库 pinned 条目直注入预算（0=关闭）
    minorMemoryLimit: 5, // 同函数 `minorMemories.slice(-5)`
  },
  storyRoom: {
    historyLimit: 40, // room-session.ts `ROOM_HISTORY_LIMIT`
    historyUserMaxChars: 600, // room-session.ts `HISTORY_USER_MAX`（六扇门复盘 P0 分级截断）
    historyAssistantMaxChars: 4_000, // room-session.ts `HISTORY_ASSISTANT_MAX`（同上；主编设计消息放宽）
    summaryThresholdTurns: 20, // room-session.ts `SUMMARY_THRESHOLD_TURNS`
    summaryBatchTurns: 10, // room-session.ts `SUMMARY_BATCH_TURNS`
    maxSummaryChars: 6_000, // room-session.ts `SUMMARY_MAX_CHARS`
    editorMaxSteps: 24, // room-agent-tools.ts `LW_ROOM_MAX_STEPS`（六扇门复盘：上限是失控兜底而非预算）
    ledgerCap: 60, // room-ledger.ts `LEDGER_CAP`
    maxCardsPerDistill: 6, // room-distiller.ts `MAX_CARDS_PER_DISTILL`
    outlineLeafLimit: 30, // room-distiller.ts `scopeContext` 的 `.slice(0, 30)`
  },
}

/** 代码级硬上限（配置值一律夹到这里） */
export const LONGWRITING_LIMITS: LongwritingRuntimeParams = {
  writing: {
    windowTokens: 200_000,
    maxOutputTokens: 32_768,
    chapterTargetWords: 30_000,
    sectionTargetWords: 20_000,
    previousChapterEndingChars: 5_000,
    stateSummaryChainLimit: 10,
    normalMemoryLimit: 50,
    minorMemoryLimit: 30,
    worldContextMaxTokens: 12_000,
  },
  storyRoom: {
    historyLimit: 120,
    historyUserMaxChars: 8_000,
    historyAssistantMaxChars: 32_000,
    summaryThresholdTurns: 200,
    summaryBatchTurns: 100,
    maxSummaryChars: 50_000,
    editorMaxSteps: 60,
    ledgerCap: 400,
    maxCardsPerDistill: 30,
    outlineLeafLimit: 300,
  },
}
