/**
 * 知识库参数默认值 / 硬上限
 * @module shared/types/knowledge-params.types
 *
 * ── 为什么这些要开放 ──
 * 知识库是"默认值不合理用户最难受"的典型：
 * - **检索返回条数 5 / 相似度阈值不过滤**：检索结果太少或太杂，用户只能改代码；
 * - **QA 直出最低分 0.75**（跳过 LLM 直接用原文作答的门槛）：调高更保守、调低更容易直出；
 * - **上传上限 50MB / 20 个文件**：大 PDF、整本书语料直接被拒；
 * - **章节摘要一次只处理 60 章**：整本书要跑好几轮。
 *
 * 归入「参数设置 → 知识库」Tab（三个 settings 键：`knowledge:retrieval` / `knowledge:ingest` /
 * `knowledge:summary`）。比率类参数按整数百分比登记，读取点除以 100。
 */

/** 检索 */
export interface KnowledgeRetrievalParams {
  /** 检索默认返回条数（调用方未指定时） */
  defaultTopK: number
  /** QA 直出检索条数 */
  qaTopK: number
  /** QA 直出最低相似度（百分比；低于它不直出，改走 LLM 生成） */
  qaDirectMinScorePercent: number
  /** 文档召回补偿条数（抵偿 QA 命名空间占用的名额） */
  qaVectorFetchPadding: number
  /** 多库检索时每个库的条数上限 */
  maxTopKPerKb: number
  /** 多库检索合并后的总条数上限 */
  maxMergedResults: number
}

/** 入库与导入 */
export interface KnowledgeIngestParams {
  /** 向量入库批量大小（一次送多少块给嵌入服务） */
  embeddingBatchSize: number
  /** 单文件上传大小上限（字节） */
  maxUploadBytes: number
  /** 单次上传文件数上限 */
  maxUploadFiles: number
  /** QA 对 xlsx 导入文件大小上限（字节） */
  qaImportMaxBytes: number
  /** QA 对 xlsx 导入行数上限 */
  qaImportMaxRows: number
}

/** 章节摘要（数字部分） */
export interface KnowledgeSummaryParams {
  /** 并发摘要章节数 */
  concurrency: number
  /** 单章摘要输入字符上限 */
  maxChars: number
  /** 单次最多处理多少章（成本护栏） */
  maxSummaries: number
}

/**
 * 章节摘要的布尔开关（单独一张表：布尔不能进数字持有者，否则会被当 0/1 夹取）。
 */
export interface KnowledgeSummaryFlags {
  /** 是否自动重试失败章节 */
  retryFailed: boolean
}

/** 知识库参数（分组；跨三个 settings 键） */
export interface KnowledgeRuntimeParams {
  retrieval: KnowledgeRetrievalParams
  ingest: KnowledgeIngestParams
  summary: KnowledgeSummaryParams
}

/** 内置默认值（= 改造前写死在各自模块里的常量） */
export const KNOWLEDGE_DEFAULTS: KnowledgeRuntimeParams = {
  retrieval: {
    defaultTopK: 5, // knowledge-base.service.ts 的 `req.topK || 5`
    qaTopK: 3, // searchQa 的 `req.topK || 3`
    qaDirectMinScorePercent: 75, // a2-nodes.ts QA_DIRECT_MIN_SCORE = 0.75
    qaVectorFetchPadding: 10, // QA_VECTOR_FETCH_PADDING
    maxTopKPerKb: 20, // ai-nodes.ts 多库检索硬夹
    maxMergedResults: 60, // ai-nodes.ts 合并硬夹
  },
  ingest: {
    embeddingBatchSize: 10, // BATCH_SIZE
    maxUploadBytes: 50 * 1024 * 1024, // getFileLimits().maxFileSize
    maxUploadFiles: 20, // getFileLimits().maxFilesPerUpload
    qaImportMaxBytes: 10 * 1024 * 1024, // QA_IMPORT_MAX_FILE_BYTES
    qaImportMaxRows: 10_000, // QA_IMPORT_MAX_ROWS
  },
  summary: {
    concurrency: 3, // summarizeDocument 的 opts 缺省
    maxChars: 6_000,
    maxSummaries: 60,
  },
}

/**
 * 代码级硬上限（配置值一律夹到这里）。
 * 说明：摘要并发/单次章数放开到 10 / 500（默认 3 / 60），上传体积放开到 500MB——
 * 这些是"用户可以调大但依然可控"的范围；真正的资源防线在代码里（流式解析/分块）。
 */
export const KNOWLEDGE_LIMITS: KnowledgeRuntimeParams = {  retrieval: {
    defaultTopK: 50,
    qaTopK: 20,
    qaDirectMinScorePercent: 100,
    qaVectorFetchPadding: 50,
    maxTopKPerKb: 50,
    maxMergedResults: 200,
  },
  ingest: {
    embeddingBatchSize: 64,
    maxUploadBytes: 500 * 1024 * 1024,
    maxUploadFiles: 100,
    qaImportMaxBytes: 100 * 1024 * 1024,
    qaImportMaxRows: 100_000,
  },
  summary: {
    concurrency: 10,
    maxChars: 30_000,
    maxSummaries: 500,
  },
}

/** 布尔开关的内置默认值（= 改造前的行为） */
export const KNOWLEDGE_FLAG_DEFAULTS: KnowledgeSummaryFlags = {
  retryFailed: true,
}
