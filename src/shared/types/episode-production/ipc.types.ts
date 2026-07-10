/**
 * episode-production · IPC · 类型定义
 * @module shared/types/episode-production/ipc.types
 * @description IPC 通道任务 / 流事件类型。
 *              本 phase 暂为空骨架；P3+ 实施时填充具体通道 / 事件类型。
 */

/** 「AI 写剧本」生成故事原文的请求（IPC: ep:ai-generate-text） */
export interface EpAiGenerateTextRequest {
  /** 用户提示词（必填）—— 创作要求 / 故事方向 */
  prompt: string
  /** 故事背景：年代（拼入提示词，来自创建对话框） */
  storyEra?: string
  /** 故事背景：地域 */
  storyRegion?: string
  /** 故事背景：其他说明（阶级/文化/时代事件等自由文本） */
  storyBackgroundExtra?: string
  /** AI 提供商配置 ID；缺省走 callAI 的默认 provider fallback */
  providerConfigId?: string
  /** 模型 ID；缺省走 callAI 的模型 fallback 链 */
  modelId?: string
  /** 最大 token；缺省 16000（适配长文生成） */
  maxTokens?: number
}

/** ep:ai-generate-text 成功时返回的数据 */
export interface EpAiGenerateTextResult {
  text: string
}

/** 「批量创建剧集」请求（IPC: ep:batch-create-episodes） */
export interface EpBatchCreateEpisodesRequest {
  projectId: string
  /** 待创建的剧集列表（title 来自章节标题，content 作为 uploadedContent） */
  episodes: Array<{ title: string; content: string }>
}

/** ep:batch-create-episodes 成功时返回的数据 */
export interface EpBatchCreateEpisodesResult {
  /** 实际创建数量 */
  created: number
  /** 新建剧集的 ID 列表（供后续批量识别资产等使用） */
  episodeIds: string[]
}

/** 「批量识别资产」请求（IPC: ep:batch-identify-entities） */
export interface EpBatchIdentifyEntitiesRequest {
  projectId: string
  /** 待识别的剧集 ID 列表 */
  episodeIds: string[]
  /** AI 提供商配置 ID（必填） */
  providerConfigId: string
  /** 模型 ID（必填） */
  modelId: string
}

/** ep:batch-identify-entities 成功时返回的数据 */
export interface EpBatchIdentifyEntitiesResult {
  /** 实际处理的剧集数 */
  episodes: number
  /** 识别到的角色数（含跨集重复识别；落库时已去重） */
  characters: number
  locations: number
  items: number
}

/** 「分析剧本文件」成功时返回（IPC: ep:analyze-script-file） */
export interface EpAnalyzeScriptResult {
  /** 文件名（用于前端展示） */
  fileName: string
  /** 是否识别到章节结构 */
  hasStructure: boolean
  /** 结构类型：markdown / novel / none */
  structureType: string
  /** 拆分出的剧集候选（标题来自章节标题，内容为章节正文） */
  episodes: Array<{ title: string; content: string }>
}

export {} // 保持文件为模块（避免 TS isolatedModules 警告）
