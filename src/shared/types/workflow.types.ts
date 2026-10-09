/**
 * 工作流领域类型定义
 * @module shared/types/workflow
 * @description 引擎（core）、编辑器（renderer）、IPC 三方共用的图结构契约。
 *
 *              存储格式为自定义结构（非 Vue Flow 原生格式）——引擎不依赖渲染层库，
 *              导入导出格式跨版本稳定；编辑器负责与 Vue Flow 的双向映射
 *              （加载：自定义格式 → Vue Flow nodes/edges；保存：逆映射，只回写 position）。
 *
 *              ⚠️ 关键语义决策（修改前必读）：
 *              1. 显式并行：只有 parallel 节点允许多条 normal 出边（扇出），
 *                 其余节点 normal 出边最多 1 条（graph-validator 强制）。
 *                 防止用户意外连线导致双重执行。
 *              2. 循环体边界：body = 从 loop-body 边目标可达的节点集合，
 *                 body 内节点的非 loop-back 出边禁止逃逸到 body 外（校验器强制）。
 *                 这消除了"某节点每迭代执行还是循环后执行一次"的歧义。
 *              3. 嵌套循环 V1 不支持（校验器报错）——嵌套时"引用循环外节点取哪个迭代
 *                 的输出"语义模糊，明确禁止优于半支持。V2 计划通过命名空间链支持。
 *              4. 运行终态严格语义：任何未恢复（未走 fail 边恢复）的节点失败
 *                 ⇒ 运行失败，即使其它分支已到达 end 节点。
 */

import type { ModelType } from './provider-template.types'

// ==================== 出边类型 ====================

/**
 * 出边类型。
 * - normal        正常出边（parallel 节点可有多条形成扇出，其余节点最多 1 条）
 * - fail          失败出边（节点重试耗尽后的错误分支，每个节点最多 1 条，可选）
 * - approve       人工审核 · 批准出边（含"修改后批准"），审核节点必需
 * - reject        人工审核 · 驳回出边（可选；无则驳回时运行终止）
 * - branch        条件分支 · 命中出边（edge.branchId 区分多路，每路最多 1 条边）
 * - loop-body     循环 · 循环体入口出边（循环节点必需，恰好 1 条）
 * - loop-back     循环体 · 迭代回边（指向所属循环节点；唯一允许构成环的边）
 * - loop-done     循环 · 全部迭代完成出边（循环节点必需，恰好 1 条）
 */
export type WorkflowEdgeKind =
  | 'normal'
  | 'fail'
  | 'approve'
  | 'reject'
  | 'branch'
  | 'loop-body'
  | 'loop-back'
  | 'loop-done'

// ==================== 节点类型 ====================

/** 节点类型全集（与 WorkflowNodeConfigMap 的键一一对应） */
export type WorkflowNodeType =
  // 流程控制
  | 'start'
  | 'end'
  | 'condition'
  | 'parallel'
  | 'parallel-merge'
  | 'loop'
  | 'delay'
  | 'human-review'
  | 'assign'
  // AI 能力（调用本系统已有服务）
  | 'llm-chat'
  | 'kb-retrieve'
  | 'kb-query-multi'
  | 'kb-ingest'
  | 'web-search'
  | 'translate'
  | 'image-gen'
  | 'shot-visual'
  | 'tts'
  | 'stt'
  | 'voice-clone'
  | 'video-extract-audio'
  | 'video-gen'
  | 'video-compose'
  | 'video-preset'
  // 播客视频（幻灯片承载核心要点 + 逐页口播配音讲解，音画天然对齐）
  | 'slide-render'
  | 'podcast-compose'
  // 技能（Skill 技能包调用）
  | 'skill-call'
  // 技能蒸馏（内容 → 生成技能包落盘技能库；两遍流水线 + 审计修复）
  | 'skill-distill'
  // Agent 循环（LLM 自主多轮工具调用；22 号 §8 工作流↔harness 焊点）
  | 'agent-loop'
  // 通用
  | 'http-request'
  | 'app-notify'
  // 扩展（第三批：对齐 Dify/Bisheng 核心组件面）
  | 'template-transform'
  | 'parameter-extractor'
  | 'web-extract'
  | 'kb-qa'
  | 'report'
  | 'report-image'
  | 'form-collect'
  | 'message'
  | 'oas-tool'
  | 'tool-call'
  | 'code'
  | 'sub-workflow'
  | 'variable'
  | 'data-table'
  // 资产（通用资产库：工作流成果沉淀与复用）
  | 'save-asset'
  | 'read-asset'
  | 'read-assets'
  // 网页收藏（把网页归档为资产中心「网页收藏」：single-file html + markdown 正文）
  | 'collect-webpage'
  // 日记（知识提炼存日记等场景：成果落日记库，/diary 阅读）
  | 'save-diary'
  // 日记聚合（按时间范围拉日记成 markdown 素材，周报/月报复盘的数据面）
  | 'collect-diary'
  // 信息采集（信息来源库多源抓取：来源多选/来源分组/自定义 URL → 链接清单）
  | 'crawl-news'
  // 批量抓取页面提取链接（两级采集：专栏页 → 新闻链接）
  | 'crawl-links'
  // 信源目录（「信息来源」库 → 候选清单文本，供下游 LLM 按主题挑选后取证）
  | 'source-catalog'
  // 长文写作（章节写作章法：设计卡→自检→出场实体→一致性门禁→写正文→写后检查）
  | 'chapter-writing'
  // 长文写作（卷设计章法：骨架→人物层→网格分批→整合，每 pass 过 L0 校验+修复回路）
  | 'volume-design'

// ==================== 开始节点输入参数 ====================

/** 开始节点定义的输入参数（触发运行时以表单/payload/defaultValue 填充） */
export interface WorkflowStartInput {
  /** 参数键（{{start.键}} 引用） */
  key: string
  /** 显示名 */
  label: string
  type: 'string' | 'textarea' | 'number' | 'boolean' | 'json' | 'select' | 'file' | 'model' | 'select-dynamic'
  /** type='select' 时的选项 */
  options?: Array<{ label: string; value: string | number }>
  /** type='select' 时是否多选（提交值为数组） */
  multi?: boolean
  /**
   * type='select' 或 type='select-dynamic' 时的数据来源标识（选项由系统从数据源加载；
   * select 留空 = 手写 options）：
   * - 'assets:template'：模板资产列表（值=资产 ID；read-asset 节点引用 {{start.键}}）
   * - 'infoSourceCategories'：信息来源类别列表（值=类别 id，如 news）
   * - 'infoSourceTopics'：信息来源分组列表（值=分组 id；crawl-news 节点 {{start.键}}）
   * - 'infoSources'：信息来源列表（值=来源 ID；crawl-news 节点 {{start.键}}）
   * - 'newsTopics' / 'newsSources'：等价于限定内置「新闻来源」类别的上一组来源
   *   （旧工作流兼容：历史定义里存的是这两个标识）
   * - 'knowledgeBases'：用户知识库列表（值=知识库 ID；kb-ingest/kb-qa 节点引用）
   * - 'assetCategories'：已定义业务分类列表（值=分类名；save-asset 节点 subCategory）
   */
  source?:
    | 'assets:template'
    | 'infoSourceCategories'
    | 'infoSourceTopics'
    | 'infoSources'
    | 'newsTopics'
    | 'newsSources'
    | 'knowledgeBases'
    | 'assetCategories'
    | 'credentials'
  /**
   * 声明式联动（通用机制，工作流数据声明驱动，表单引擎不感知业务字段）：
   * 监听 watch 字段的值 X，本字段的候选选项收窄为"选项元数据[matchBy] === X"，
   * 并自动填充这些选项（multi 填数组=全选，单选填首个匹配值）。
   * 用于 select / select-dynamic；监听值为空时不过滤（全部选项可选）。
   * 例：sourceIds 字段 { linkage: { watch: 'topic', matchBy: 'topicId' } } ——
   * 切换分组时只列该分组下的信息来源，并自动选中全部（选项缓存需保留 topicId 元数据）。
   */
  linkage?: { watch: string; matchBy: string }
  /**
   * type='model' 时的模型类型过滤（留空=全部可用模型）。
   * 提交值为 { providerConfigId, modelId }，节点配置用 {{start.键.providerConfigId}} / {{start.键.modelId}} 引用。
   */
  modelTypes?: ModelType[]
  /** 是否必填 */
  required?: boolean
  /** 扩展校验规则（除必填外；前端实时提示 + 服务端启动时兜底） */
  validation?: WorkflowStartInputValidation
  /** 默认值（定时触发无来源时使用） */
  defaultValue?: unknown
}

/** 开始节点输入参数的扩展校验规则（错误提示由系统按规则自动生成，无需人工填写） */
export interface WorkflowStartInputValidation {
  /** 最小长度（string/textarea；计入空白字符） */
  minLength?: number
  /** 最大长度（string/textarea；计入空白字符） */
  maxLength?: number
  /** 正则校验（string/textarea；JS 正则字面量文本，如 "^\\d{11}$"） */
  pattern?: string
  /** 最小值（number） */
  min?: number
  /** 最大值（number） */
  max?: number
}

// ==================== 节点级执行设置 ====================

/** 节点级执行设置（覆盖工作流级默认值） */
export interface WorkflowNodeSettings {
  /** 失败自动重试次数（默认 0；封顶于工作流级 maxRetryCount） */
  retryCount?: number
  /** 重试间隔毫秒（默认 0；封顶 WORKFLOW_LIMITS.retryDelayMs） */
  retryDelayMs?: number
}

// ==================== 节点 config（按类型判别的联合） ====================

/** 条件分支的单个比较条件 */
export interface WorkflowConditionItem {
  /** 左值模板，如 "{{llm1.score}}" */
  left: string
  operator:
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'not_contains'
    | 'is_empty'
    | 'not_empty'
    | 'regex'
    | 'starts_with'
    | 'ends_with'
  /** 右值模板（is_empty / not_empty 时可省略） */
  right?: string
}

/** 条件分支的一路 */
export interface WorkflowConditionBranch {
  branchId: string
  label: string
  /** 条件列表，AND 关系（全部满足才命中） */
  conditions: WorkflowConditionItem[]
}

/**
 * 各节点类型的配置。
 * 键 = WorkflowNodeType 字符串（kebab-case），保证 node.type → node.config 正确收窄。
 * 字符串字段均支持 {{}} 模板（引擎执行前统一解析，handler 拿到的是实参）。
 */
export interface WorkflowNodeConfigMap {
  start: {
    /** 输入参数定义 */
    inputs: WorkflowStartInput[]
  }
  end: Record<string, never>

  condition: {
    /** 多路分支：按声明顺序求值，命中第一个即走该路 */
    branches: WorkflowConditionBranch[]
    /** 全部未命中时：fallback=走 fallbackBranchId 边 | fail=节点失败 */
    noMatchPolicy: 'fallback' | 'fail'
    /** noMatchPolicy='fallback' 时必填（指向 branches 中某一路） */
    fallbackBranchId?: string
  }

  parallel: Record<string, never>

  'parallel-merge': {
    /** 等待策略：all=等齐全部入边（默认） | any=任一到达即通过 */
    waitPolicy: 'all' | 'any'
    /** 输出模式：merge=各入边来源输出合并为 { [nodeId]: output } | first=仅首个到达的输出 */
    outputMode: 'merge' | 'first'
  }

  loop: {
    /**
     * 迭代模式：foreach=遍历列表（缺省，现有语义）| until=重复执行循环体直到 stop 条件满足
     * （until 无列表；每轮 body 收敛后在当轮作用域解析 stopExpression 等值比较 stopValue）
     */
    mode?: 'foreach' | 'until'
    /** 遍历列表：模板表达式，解析结果必须是数组，如 "{{http1.items}}"（foreach 必填，until 禁用） */
    listExpression?: string
    /** 空列表策略：skip=直接走 done 边（输出空 results，默认） | fail=节点失败 */
    emptyPolicy?: 'skip' | 'fail'
    /**
     * 迭代错误策略：fail=任一迭代体内节点失败则循环失败（默认，现有行为）
     * | skip=失败迭代被跳过（results 对应位置记 { error, skipped:true }），
     * 循环继续跑完其余迭代，最后成功。适用于批量采集等"单条失败不应中断整体"的场景。
     */
    errorPolicy?: 'fail' | 'skip'
    /** until 模式：停止表达式（每轮循环体收敛后、在当轮作用域内解析的模板），解析值 === stopValue 即收尾 */
    stopExpression?: string
    /** until 模式：停止值（缺省 'true'），与解析结果做字符串化等值比较 */
    stopValue?: string | number | boolean
    /** until 模式：最大轮数（1..运行级 maxLoopIterations）；到达上限无条件收尾（不算失败） */
    maxIterations?: number
  }

  delay: {
    /** 延时毫秒（模板可用；如 "{{start.waitMs}}" 或 "5000"） */
    durationMs: string
  }

  'human-review': {
    /** 送审内容：对象模板的 JSON 字符串或纯文本模板 */
    payload: string
    /** 指派审批人（可选；用户 id，支持 {{模板}}。非空时仅该用户可决策——S7） */
    assigneeId?: string
    /** 审核超时毫秒；null=无限等待（默认） */
    timeoutMs?: number | null
    /** 超时策略：approve=视为批准 | reject=视为驳回 | fail=节点失败（默认 fail） */
    timeoutPolicy?: 'approve' | 'reject' | 'fail'
    /** 允许审核人修改的字段（"修改后批准"用）；缺省=不允许修改 */
    editableFields?: Array<{
      key: string
      label: string
      type: 'string' | 'number' | 'boolean' | 'json'
    }>
    /** 交互模式：review=批准/驳回（默认）| choose=选项路由 | input=文本编辑提交 */
    interaction?: 'review' | 'choose' | 'input'
    /** choose 模式的选项（每项对应一条 branch 出边，key=branchId——复用条件分支边机制） */
    options?: Array<{ key: string; label: string }>
  }

  assign: {
    /** 赋值列表：写入本节点输出 {{assignN.values.键}} */
    assignments: Array<{ key: string; value: string }>
  }

  'llm-chat': {
    /** Provider 配置 ID（缺省=用户默认 Provider） */
    providerConfigId?: string
    modelId?: string
    systemPrompt: string
    /** 用户消息模板 */
    prompt: string
    temperature?: number
    maxTokens?: number
    /** 解析 JSON 输出（输出多 parsed 字段；解析失败=节点失败） */
    jsonMode?: boolean
  }

  'kb-retrieve': {
    knowledgeBaseId: string
    query: string
    topK?: number
    /** 相似度阈值 0-1 */
    threshold?: number
  }

  'kb-query-multi': {
    /** 知识库 id（多选数组；兼容逗号/空白分隔字符串或 JSON 数组字符串） */
    knowledgeBaseIds: string[] | string
    query: string
    /** 每库检索条数（默认 5） */
    topKPerKb?: number
    /** 跨库合并后最多返回条数（默认 20） */
    maxResults?: number
    /** 相似度阈值 0-1 */
    threshold?: number
  }

  'kb-ingest': {
    knowledgeBaseId: string
    /** 文档标题（模板可用） */
    title: string
    /** 文档内容（模板可用） */
    content: string
    /** 是否等待入库完成（false=提交即成功，默认 true） */
    waitForCompletion?: boolean
    /** 可选来源键：传值时按 (workflow, sourceKey) 幂等 upsert，重复运行覆盖不堆积 */
    sourceKey?: string
    /** 透传字段：{字段: 值模板}，合并进输出（循环体内供下游聚合引用） */
    passthrough?: Record<string, unknown>
  }

  'web-search': {
    query: string
    /** 搜索引擎类型（缺省=用户默认引擎） */
    engineType?: string
    searchConfigId?: string
    maxResults?: number
  }

  translate: {
    text: string
    sourceLang?: string
    targetLang: string
    providerConfigId?: string
    modelId?: string
  }

  'image-gen': {
    prompt: string
    negativePrompt?: string
    width?: number
    height?: number
    count?: number
    /** 参考图：本地文件路径数组（file 输入 .path 或下游产物路径），读取为 base64 透传（电商海报保留商品主体） */
    referenceImages?: unknown
    /** 图像服务 Provider 配置（缺省=图像服务默认） */
    providerConfigId?: string
    modelId?: string
  }

  /**
   * 镜头画面生产（V3 短视频配图核心节点）：
   * 真实视频素材 → 真实图片素材 → AI 生成（带视觉质检重试）三层回退，每层过相关性闸。
   */
  'shot-visual': {
    /** 语义主题（相关性判定锚点） */
    concept?: string
    /** 画面主体实体 */
    subject?: string
    /** 场所环境 */
    setting?: string
    /** 素材库检索词（英文；缺省由 scene lexicon 按 concept/subject/setting 解析） */
    searchQuery?: string
    /** 备选检索词（数组或逗号/换行分隔） */
    altQueries?: unknown
    /** 可执行画面描述（光线/色调/构图/运镜） */
    visual?: string
    /** 景别 */
    shotSize?: string
    /** 运镜 */
    cameraMove?: string
    /** 预设画面风格文本（并入生成提示词） */
    styleText?: string
    /** auto=有凭据即检索真实素材；off=只走生成 */
    stockMode?: string
    /** 素材库：pexels / pixabay */
    stockProvider?: string
    /** 素材库凭据 id（设置 → 工具 → 凭据） */
    stockCredentialId?: string
    stockPerPage?: number
    stockMinWidth?: number
    stockMinDurationSec?: number
    /** 真实素材相关性闸阈值（0-100） */
    stockMinScore?: number
    /** auto=视频优先 / video / image */
    stockKind?: string
    /** 相关性选优下载候选条数 */
    stockMaxCandidates?: number
    /** 是否允许 AI 生成兜底（默认允许） */
    generateFallback?: boolean
    imageProviderConfigId?: string
    imageModelId?: string
    width?: number
    height?: number
    negativePrompt?: string
    referenceImages?: unknown
    /** 生成层最多尝试次数（含首次；上限 4） */
    maxAttempts?: number
    /** 视觉质检模型（缺省=不做质检，按要求留痕） */
    qaProviderConfigId?: string
    qaModelId?: string
    /** 生成图相关性闸阈值（0-100） */
    minScore?: number
  }

  tts: {
    text: string
    voiceId?: string
    speed?: number
    providerConfigId?: string
    modelId?: string
  }

  stt: {
    /** 音频来源模板：文件路径或 base64 数据，如 "{{tts1.audioPath}}" */
    audio: string
    language?: string
    providerConfigId?: string
    modelId?: string
  }

  'voice-clone': {
    /** 样本音频路径模板（start 表单 file 字段的 .path，如 "{{start.sample.path}}"） */
    samplePath: string
    /** 音色展示名 */
    name: string
    /** voice_id 前缀（仅小写字母数字 ≤10 字符；DashScope 硬约束） */
    prefix?: string
    /** 语种 hint（默认 zh） */
    language?: string
    /** 是否等待训练完成（false=提交即成功输出 clonedVoiceId；默认 true） */
    waitForCompletion?: boolean
  }

  'video-extract-audio': {
    /** 视频文件路径模板：来自 start 表单 file 字段的 .path，如 "{{start.video}}" */
    videoPath?: string
    /** 视频链接模板：http(s) 视频 URL（常规直链 / B站 BV 链接）；videoPath 优先 */
    videoUrl?: string
    /** 输出采样语言提示（透传 stt 用；本节点仅提取音频） */
    language?: string
  }

  'http-request': {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url: string
    headers?: Array<{ key: string; value: string }>
    /** 请求体模板（JSON 字符串或纯文本） */
    body?: string
    /** 超时毫秒（默认 30s；封顶 WORKFLOW_LIMITS.httpTimeoutMs） */
    timeoutMs?: number
    /** 响应处理模式：auto=按 content-type（二进制→落盘 filePath）| text | json | base64 | file */
    responseType?: 'auto' | 'text' | 'json' | 'base64' | 'file'
  }

  'app-notify': {
    title: string
    message: string
    level?: 'info' | 'success' | 'warning' | 'error'
  }

  'template-transform': {
    /** 输出文本模板：多占位拼接（{{a.x}}-{{b.y}}） */
    template: string
  }

  'parameter-extractor': {
    /** 待抽取的文本来源模板 */
    input: string
    /** 抽取要求（补充给 LLM 的指令） */
    instruction?: string
    /** 抽取字段声明 */
    fields: Array<{ key: string; type?: 'string' | 'number' | 'boolean'; required?: boolean }>
    providerConfigId?: string
    modelId?: string
  }

  'web-extract': {
    url: string
    /** 正文最大长度（默认 100_000） */
    maxLength?: number
    /** 页面内链接提取上限（默认 30，0=不提取） */
    maxLinks?: number
    /** 爬取礼貌：请求前随机间隔下限（毫秒；缺省 800） */
    delayMsMin?: number
    /** 爬取礼貌：请求前随机间隔上限（毫秒；缺省 2500） */
    delayMsMax?: number
    /** 爬取礼貌：同一网站最大并发（缺省 1=单线程，上限 10） */
    hostConcurrency?: number
  }

  'kb-qa': {
    knowledgeBaseId: string
    question: string
    systemPrompt?: string
    topK?: number
    threshold?: number
    /** 检索上下文最大字符（默认 WORKFLOW_DEFAULTS.kbQaContextMaxChars） */
    resultMaxLength?: number
    providerConfigId?: string
    modelId?: string
    temperature?: number
  }

  'report': {
    title: string
    /** markdown 模板（引擎深解析后即为全文） */
    template: string
    format: 'markdown' | 'docx'
  }

  'tool-call': {
    /** 工具来源：custom=自定义工具 / preset=预设工具 */
    toolType: 'custom' | 'preset'
    toolId: string
    /** 引用凭据（authType=credential 时注入） */
    credentialId?: string
    /** 工具参数（值支持 {{模板}}） */
    params?: Array<{ key: string; value: string }>
    /** 响应处理模式：auto=按 content-type（二进制→落盘 filePath）| text | json | base64 | file */
    responseType?: 'auto' | 'text' | 'json' | 'base64' | 'file'
  }

  'skill-call': {
    /** 技能 id（select-dynamic source=skills） */
    skillId: string
    /** 技能参数（键=技能 inputs schema 的 key；值支持 {{工作流变量}}） */
    inputs?: Array<{ key: string; value: string }>
    providerConfigId?: string
    modelId?: string
    temperature?: number
    maxTokens?: number
  }

  'skill-distill': {
    /** 待蒸馏全文（模板化；多篇文章用分隔符拼接，服务内部清洗/分块/两遍流水线） */
    sourceText: string
    /** 蒸馏目标：auto=让模型先判型（methodology 方法论 / style 写作风格 / persona 人物人设） */
    contentType?: 'auto' | 'methodology' | 'style' | 'persona'
    /** 蒸馏重点补充（模板化；如判类结论、技能用途、侧重维度） */
    hints?: string
    /** 技能 id 建议（模板化；kebab-case，强约束命名，落盘撞库自动加后缀） */
    nameHint?: string
    providerConfigId?: string
    modelId?: string
  }

  'agent-loop': {
    /** 任务目标（模板化；驱动 Agent 的用户消息） */
    task: string
    /** 系统提示词（角色/约束/输出格式要求） */
    systemPrompt?: string
    /** 工具白名单：工具名（存量形态）或绑定对象（approval/maxCalls/config 富配置，25 号 M2）；
     *  引擎侧 normalizeToolWhitelist 归一；缺省=无工具单轮直答 */
    toolWhitelist?: Array<string | import('./agent.types').AgentToolBinding>
    /** 最大迭代轮数（缺省 WORKFLOW_DEFAULTS.agentLoopMaxIterations；到顶未收敛=节点失败） */
    maxIterations?: number
    /** 节点级工具调用总上限（跨挂起-恢复累计；超过回填 LIMIT_EXCEEDED，模型需直接作答） */
    maxToolCalls?: number
    /** 节点级最长时长护栏毫秒（净时长——扣除挂起等待；上界 WORKFLOW_LIMITS.maxDurationMs） */
    maxDurationMs?: number
    /** 审核人可编辑字段（引擎 editedValues 白名单；固定 input=工具入参，供「修改后批准」） */
    editableFields?: Array<{ key: string; label: string; type: 'string' | 'number' | 'boolean' | 'json' }>
    providerConfigId?: string
    modelId?: string
  }

  'code': {
    /** V1 仅支持 JavaScript */
    language: 'js'
    /** 用户代码：return 一个对象作为输出（inputs 为入参） */
    code: string
    /** 输入参数（值支持 {{模板}}，作为 inputs 对象注入代码） */
    inputs?: Array<{ key: string; label?: string; type?: string; value: string }>
  }

  'sub-workflow': {
    /** 被调用的工作流定义 id（运行其发布图） */
    definitionId: string
    /** 子工作流入参（对应子工作流 start inputs；值支持 {{模板}}） */
    inputs?: Array<{ key: string; value: string }>
  }

  'variable': {
    /** get=读取 / set=写入（scope+key 跨运行持久化） */
    op: 'get' | 'set'
    scope?: 'global' | 'user'
    key: string
    /** set 时写入的值（模板可用）；get 时忽略 */
    value?: string
    /** get 无值时的兜底 */
    defaultValue?: string
  }

  'data-table': {
    /** 内置模式：insert=插入行（表不存在按名自动建）/ query=查全部 / update=按 rowId 更新 / delete=按 rowId 删
     *  外部模式（dataSourceId 已设置）：query=执行 SELECT / execute=执行 DML/DDL */
    op: 'insert' | 'query' | 'update' | 'delete' | 'execute'
    /** 可选：数据源 id。设置后读写第三方数据库（外部连接）；留空则读写本应用内置数据表 */
    dataSourceId?: string
    tableId?: string
    tableName?: string
    /** insert/update 的行 JSON（模板可用，如 {"name":"{{start.name}}"}） */
    row?: string
    rowId?: string
    /** 外部模式 SQL（SELECT/DML；参数用 $1,$2 占位，值取自 params） */
    sql?: string
    /** 外部模式参数值（JSON 数组，与 SQL 占位符一一对应） */
    params?: string
  }

  'save-asset': {
    /** 内容来源（模板可用）：本地路径 / http(s) URL / data: URI / local-*:// URL / 文本 / JSON */
    content: string
    /** 内容形态：auto=自动探测（推荐） | file | url | text | json */
    kind: 'auto' | 'file' | 'url' | 'text' | 'json'
    /** 资产大类（image/audio/video/document/text/json/other）；auto=按文件名探测 */
    category?: string
    /** 资产子分类（资产中心二级分组） */
    subCategory?: string
    /** 资产名（缺省按来源自动生成） */
    name?: string
    /** 标签（逗号分隔） */
    tags?: string
    /** 描述 */
    description?: string
    /** 保存开关（false=不落库，流程继续；用于"中间产物/清单不存资产"） */
    enabled?: boolean
    /** 资产组名（套图：同一次来源内同名组自动归组；缺省不分组） */
    groupName?: string
  }

  'read-asset': {
    /** 资产 ID（模板可用，如 {{saveAsset1.assetId}}） */
    assetId: string
    /** 输出模式：url=可访问链接 | path=本地文件路径（文件型） | content=文本/JSON 内容 | metadata=全部元数据 */
    output?: 'url' | 'path' | 'content' | 'metadata'
  }

  'read-assets': {
    /** 资产 ID 列表（多选；兼容数组/逗号或空白分隔字符串） */
    assetIds: string[] | string
  }

  'collect-webpage': {
    /** 网页 URL（模板可用，如 {{httpReq1.url}}） */
    url: string
    /** 标题（可选；缺省从页面 <title>/og:title 自动提取） */
    title?: string
    /** 标签（逗号分隔） */
    tags?: string
    /** 描述 */
    description?: string
    /** 收藏开关（false=不落库，流程继续） */
    enabled?: boolean
    /** 重复 URL 策略：skip=已收藏则跳过（缺省）| replace=覆盖刷新快照 */
    existingPolicy?: 'skip' | 'replace'
  }

  'save-diary': {
    /** 目标日记文件夹 ID（缺省=自动创建/复用「AI 提炼」根文件夹） */
    folderId?: string
    /** 日记标题（模板可用） */
    title: string
    /** 日记内容（markdown，模板可用） */
    content: string
  }

  'collect-diary': {
    /** 起始日期（YYYY-MM-DD；与 endDate 至少配合使用，优先于 days） */
    startDate?: string
    /** 结束日期（YYYY-MM-DD，含当天全天） */
    endDate?: string
    /** 最近 N 天（startDate 留空时生效，缺省 7） */
    days?: string
    /** 只聚合该目录（留空 = 全部目录） */
    folderId?: string
  }

  'crawl-news': {
    /** 信息来源分组 id（设置 → 信息来源 中任意类别的分组；与 customUrls 可都填合并） */
    topicId?: string
    /** 信息来源 ID 列表（多选） */
    sourceIds?: string[] | string
    /** 自定义 URL 列表（JSON：string[] 或 [{name,url}]，或逗号/换行分隔） */
    customUrls?: string
    /** 每源链接提取上限（默认 30，上限 50） */
    maxLinks?: number
    /** 并行抓取的源数量上限（默认 10，上限 10） */
    maxSources?: number
    /** 爬取礼貌：请求前随机间隔下限（毫秒；缺省 800） */
    delayMsMin?: number
    /** 爬取礼貌：请求前随机间隔上限（毫秒；缺省 2500） */
    delayMsMax?: number
    /** 爬取礼貌：同一网站最大并发（缺省 1=单线程，上限 10） */
    hostConcurrency?: number
  }

  'source-catalog': {
    /** 信息来源 ID 列表（多选；空 = 目录内全部启用来源） */
    sourceIds?: string[] | string
  }

  'crawl-links': {
    /** 待抓取页面 URL 列表（数组模板，如 {{pick1.parsed}}） */
    urls: unknown
    /** 每页链接提取上限（默认 50，上限 100） */
    maxLinks?: number
    /** 并行抓取数量（默认 5，上限 10） */
    maxConcurrent?: number
    /** 抓取超时毫秒（默认走工作流默认值，上限 300s） */
    timeoutMs?: number
    /** 爬取礼貌：请求前随机间隔下限（毫秒；缺省 800） */
    delayMsMin?: number
    /** 爬取礼貌：请求前随机间隔上限（毫秒；缺省 2500） */
    delayMsMax?: number
    /** 爬取礼貌：同一网站最大并发（缺省 1=单线程，上限 10） */
    hostConcurrency?: number
  }

  'chapter-writing': {
    /** 长文项目 id（模板传参，如 {{start.projectId}}） */
    projectId: string
    /** 大纲章节节点 id */
    outlineId: string
    /** 覆盖重写本章（缺省 false=章已有正文时拒绝，防误重写） */
    overwrite?: boolean
    /** 目标字数（缺省走大纲预估字数） */
    targetWords?: number
  }

  'volume-design': {
    /** 长文项目 id（模板传参，如 {{start.projectId}}） */
    projectId: string
    /** 卷标识（契约 volume 字段，如 v1） */
    volumeId: string
    /** 卷标题（缺省取已确认 spine 的卷声明） */
    title?: string
    /** 卷焦点 */
    focus?: string
    /** 起始章（缺省取 spine 章界） */
    chapterFrom?: number
    /** 结束章（缺省取 spine 章界） */
    chapterTo?: number
    /** 网格分批大小（缺省 10，上限 10） */
    gridBatchSize?: number
    /** 单次生成的 maxTokens（缺省 8192） */
    maxTokens?: number
    /** 模型路由（缺省走默认 provider） */
    providerConfigId?: string
    modelId?: string
  }

  /**
   * 幻灯片渲染（播客视频画面）：幻灯片结构（标题/要点）→ PPT 风格 PNG 组。
   * SVG 版式 + 多主题；渲染经 sharp-worker 子进程（libvips 不进主进程）。
   */
  'slide-render': {
    /** 幻灯片结构（模板透传）：[{ kind: 'cover'|'content'|'ending', title, bullets[], narration? }] */
    slides: unknown
    /** 整期标题（封面辅助行 + 页脚） */
    deckTitle?: string
    /** 主题：light 简约白 / dark 深色科技 / warm 暖色杂志 / green 学术绿 */
    theme?: string
    /** 画布宽（默认 1920） */
    width?: number
    /** 画布高（默认 1080） */
    height?: number
  }

  /**
   * 播客合成：幻灯片图组 + 逐页配音 → 按配音时长对齐时间轴（页间停顿）→ 拼接混流成片。
   */
  'podcast-compose': {
    /** 幻灯片 PNG 路径数组（模板透传，如 {{renderSlides.slidePaths}}） */
    slideImages: unknown
    /** 逐页配音数组（模板透传：字符串路径或 { audioPath } 对象，如 {{loopTts.results}}） */
    audioFiles: unknown
    /** 页间停顿毫秒（同时加在末页结尾；0-5000，缺省 600） */
    gapMs?: number
    /** 背景音乐路径（可选；混音时压低避人声） */
    bgmPath?: string
    width?: number
    height?: number
    /** 帧率（默认 30） */
    fps?: number
    outputName?: string
  }
}

// ==================== 图结构 ====================

/**
 * 节点实例（编辑器 + 引擎共用）。
 * 类型收窄：node.type 为具体值时 node.config 自动收窄到对应配置类型。
 */
export interface WorkflowNodeTyped<K extends WorkflowNodeType = WorkflowNodeType> {
  /** 节点实例 ID（编辑器生成 uuid；变量引用 {{nodeId.字段}} 使用此 ID） */
  id: string
  type: K
  /** 显示名（用户可改；运行记录快照 node_name） */
  name: string
  /** 编辑器画布坐标（引擎忽略） */
  position: { x: number; y: number }
  /** 节点级执行设置 */
  settings?: WorkflowNodeSettings
  /** 按类型变化的配置 */
  config: WorkflowNodeConfigMap[K]
}

/** 节点判别联合：type 字符串 → config 正确收窄 */
export type WorkflowNode = {
  [K in WorkflowNodeType]: WorkflowNodeTyped<K>
}[WorkflowNodeType]

/** 边：源节点出边 → 目标节点 */
export interface WorkflowEdge {
  /** 边 ID（编辑器生成） */
  id: string
  sourceNodeId: string
  targetNodeId: string
  /** 出边类型（默认 'normal'） */
  kind: WorkflowEdgeKind
  /** kind='branch' 时：条件分支 branchId */
  branchId?: string
  /** 画布锚点（编辑器用，如 'out-right'/'in-left'；引擎忽略） */
  sourceHandle?: string
  targetHandle?: string
}

/** 整图 */
export interface WorkflowGraph {
  /** 格式版本（导入兼容判断；当前 1） */
  version: 1
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  /** 画布元信息（编辑器用：视口；引擎忽略） */
  viewport?: { x: number; y: number; zoom: number }
}

/** 图校验结果 */
export interface WorkflowValidationResult {
  valid: boolean
  /** 阻断性问题（不可发布/运行） */
  errors: string[]
  /** 非阻断提示（可发布） */
  warnings: string[]
}

// ==================== 工作流级执行设置（防失控） ====================

/** 工作流级执行设置（definition.settings 列；所有项缺省回退 WORKFLOW_DEFAULTS） */
export interface WorkflowExecutionSettings {
  /** 单次运行最长时长毫秒（封顶 24h） */
  maxDurationMs?: number
  /** 循环最大迭代数（封顶 10_000） */
  maxLoopIterations?: number
  /** 单节点输出 JSON 序列化后截断长度（封顶 1_000_000） */
  maxOutputChars?: number
  /** 单节点重试次数封顶 */
  maxRetryCount?: number
  /** 单运行内最大并行节点数（封顶 20） */
  maxParallelNodes?: number
  /** 单节点最大执行次数（防环/重入失控；封顶 1000） */
  maxNodeRuns?: number
  /**
   * 运行级总工具调用预算（可选；0/缺省 = 不启用）：agent-loop 等节点每次工具调用请求
   * 从运行级共享计数器扣减，跨节点/跨轮累计（挂起恢复续用；快照随运行持久化）。
   * 节点级 maxToolCalls 仍作为单节点护栏；二者取先到者。
   */
  maxTotalToolCalls?: number
  /**
   * 多轮对话：开启后工作流内 LLM 节点按执行顺序共享对话上下文——
   * 前面 LLM 调用的 prompt 与输出会作为后续 LLM 节点的历史 messages 传入。
   * 默认 false（节点间仅靠 {{变量}} 显式注入，保持无状态单轮）。
   */
  multiTurn?: boolean
  /**
   * 允许并行实例（同一工作流同时运行多个）。开启后 startRun 给每次启动自动派生
   * 独立 mutexScope，绕过同定义互斥（互斥唯一索引含 scope，天然不冲突）。
   * ⚠️ 实例间共享面：variable 节点的 global/user 作用域与内置 data-table——
   * 并行时建议改用 variable 的 run 作用域（实例独享，随运行清理）、
   * 表名/产物命名用 {{sys.runId}} 区分实例。
   */
  allowParallelInstances?: boolean
  /**
   * 全局并发运行数（同时最多跑几个工作流，超出的排队）。
   * **只在全局层（settings 表 `wf:defaults`）生效**：并发是平台级护栏，
   * 单个工作流的 `definition.settings` 不能抬高它（2026-09-13「参数设置」明确）。
   * 缺省 = `WORKFLOW_DEFAULTS.maxConcurrentRuns`，封顶 `WORKFLOW_LIMITS.maxConcurrentRuns`。
   */
  maxConcurrentRuns?: number
}

// ==================== 触发器 ====================

/** 触发器定义（存储于 definition.triggers JSON 列，对发布版生效） */
export type WorkflowTrigger =
  /** 手动触发（始终隐式可用，不入库） */
  | { type: 'manual' }
  | {
      type: 'cron'
      /** cron 表达式（5 段：分 时 日 月 周） */
      expression: string
      /**
       * IANA 时区（如 Asia/Shanghai）：表达式的解释时区。
       * 缺省 = 进程本地时区（桌面端语义不变；Web 端 UTC 服务器建议显式配置，
       * 否则「每天 9 点」会随部署环境漂移——评审 #36）。
       */
      timezone?: string
      /** 预设标识：every-minute / hourly / daily / weekly / monthly / custom（UI 还原用） */
      preset?: string
      enabled: boolean
    }
  | {
      type: 'event'
      /** 领域事件名（见 WORKFLOW_TRIGGERABLE_EVENTS 目录） */
      eventName: string
      /** 可选过滤：事件 payload 字段 === 期望值（等值匹配，AND 关系） */
      match?: Record<string, string | number | boolean>
      enabled: boolean
    }
  | {
      type: 'webhook'
      /** 32B hex 免签令牌（URL 路径即鉴权；不可枚举） */
      token: string
      enabled: boolean
    }

// ==================== 运行状态枚举 ====================

/** 运行状态（workflow_runs.status） */
export type WorkflowRunStatus =
  | 'pending' // 排队中（超出全局并发上限）
  | 'running'
  | 'waiting_review' // 挂起等待人工审核（仍占用同工作流互斥）
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted' // 应用退出/崩溃中断（可续跑）
  | 'skipped' // 触发被跳过（同工作流运行中），仅留痕
  | 'timed_out' // 超过最长运行时长

/** 节点运行状态（workflow_node_runs.status） */
export type WorkflowNodeRunStatus =
  | 'pending'
  | 'running'
  | 'waiting_review'
  | 'succeeded'
  | 'failed'
  /** 失败但走了 fail 边恢复（不算运行失败，下游可引用 {{nodeId.error}}） */
  | 'failed_recovered'
  | 'cancelled'
  | 'interrupted'
  | 'skipped'
  | 'timed_out'

/** 触发方式（workflow_runs.trigger_type） */
export type WorkflowTriggerType = 'manual' | 'cron' | 'event' | 'resume'

// ==================== 运行事件（wf:run-event 通道载荷） ====================

/**
 * 运行事件统一载荷（单通道复用，type 判别）。
 * 引擎产生 → IEventEmitter 推前端；Web 端按 ALS userId 路由。
 */
export type WorkflowRunEvent =
  | {
      type: 'run-status'
      runId: string
      definitionId: string
      status: WorkflowRunStatus
      stats?: { totalNodes: number; doneNodes: number; failedNodes: number; recoveredNodes: number }
      error?: string
    }
  | {
      type: 'node-status'
      runId: string
      nodeId: string
      iterationIndex: number
      status: WorkflowNodeRunStatus
      error?: string
      routeTaken?: string
      startedAt?: number
      finishedAt?: number
    }
  | {
      type: 'node-progress'
      runId: string
      nodeId: string
      iterationIndex: number
      progress: number
      message?: string
    }
  | {
      type: 'review-requested'
      runId: string
      definitionId: string
      nodeId: string
      nodeName: string
      payload: Record<string, unknown>
      waitExpiresAt?: number
    }
  | {
      type: 'notify'
      runId: string
      level: 'info' | 'success' | 'warning' | 'error'
      title: string
      message: string
    }
  | {
      // 节点内部日志（引擎 ctx.logger 镜像 → 执行日志时间线；前端默认忽略展示）
      type: 'node-log'
      runId: string
      nodeId: string
      iterationIndex: number
      level: 'debug' | 'info' | 'warn' | 'error'
      message: string
      detail?: string
    }



/** 触发方式常量（与 WorkflowTriggerType 一一对应） */
export const WORKFLOW_TRIGGER_TYPES = {
  manual: 'manual',
  cron: 'cron',
  event: 'event',
  resume: 'resume',
} as const satisfies Record<WorkflowTriggerType, WorkflowTriggerType>

/** 审核决策常量（含超时自动决策） */
export const WORKFLOW_REVIEW_DECISIONS = {
  approve: 'approve',
  approveWithChanges: 'approve_with_changes',
  reject: 'reject',
  timeoutApprove: 'timeout_approve',
  timeoutReject: 'timeout_reject',
} as const

/** 审核超时策略常量 */
export const WORKFLOW_REVIEW_TIMEOUT_POLICIES = {
  approve: 'approve',
  reject: 'reject',
  fail: 'fail',
} as const

/** wf:run-event 载荷判别常量（引擎产生、前端消费，双端契约） */
export const WORKFLOW_RUN_EVENT_TYPES = {
  runStatus: 'run-status',
  nodeStatus: 'node-status',
  nodeProgress: 'node-progress',
  reviewRequested: 'review-requested',
  notify: 'notify',
  nodeLog: 'node-log',
} as const

// ==================== Run Journal（11 号 §4.3，E1） ====================

/**
 * 引擎私有运行事件日志的类型全集（追加式；重放投影的判别依据）。
 * 注意与 WORKFLOW_RUN_EVENT_TYPES（UI 推送载荷）分立——journal 是恢复事实源，
 * 不进前端协议（11 号 §3.1 三套事件边界）。
 */
export const WORKFLOW_JOURNAL_EVENT_TYPES = {
  runStarted: 'run_started',
  edgeActivated: 'edge_activated',
  nodeLaunched: 'node_launched',
  nodeSuspended: 'node_suspended',
  nodeCompleted: 'node_completed',
  nodeFailed: 'node_failed',
  reviewDecided: 'review_decided',
  loopStarted: 'loop_started',
  loopIterationSettled: 'loop_iteration_settled',
  loopCompleted: 'loop_completed',
  snapshot: 'snapshot',
  runFinished: 'run_finished',
} as const

export type WorkflowJournalEventType =
  (typeof WORKFLOW_JOURNAL_EVENT_TYPES)[keyof typeof WORKFLOW_JOURNAL_EVENT_TYPES]

/** journal 缺省参数（快照节奏等；definition.settings 可覆盖项的缺省源） */
export const WORKFLOW_JOURNAL_DEFAULTS = {
  /** 每 run 每 N 条事件写一次投影快照（挂起时强制另计） */
  snapshotEveryEvents: 200,
} as const

/** 导入导出文件格式标识 */
export const WORKFLOW_EXPORT_KIND = 'the-bot-workflow'
export const WORKFLOW_EXPORT_FORMAT_VERSION = 1

// ==================== 常量唯一源（禁止裸字符串比较/赋值） ====================

/**
 * 节点类型常量：键=值，satisfies 保证与 WorkflowNodeType 联合一一对应——
 * 新增类型必须同时加联合与此表（漏加编译报错），杜绝第二套写法。
 */
export const WORKFLOW_NODE_TYPES = {
  start: 'start',
  end: 'end',
  condition: 'condition',
  parallel: 'parallel',
  'parallel-merge': 'parallel-merge',
  loop: 'loop',
  delay: 'delay',
  'human-review': 'human-review',
  assign: 'assign',
  'llm-chat': 'llm-chat',
  'kb-retrieve': 'kb-retrieve',
  'kb-query-multi': 'kb-query-multi',
  'kb-ingest': 'kb-ingest',
  'web-search': 'web-search',
  translate: 'translate',
  'image-gen': 'image-gen',
  'shot-visual': 'shot-visual',
  tts: 'tts',
  stt: 'stt',
  'voice-clone': 'voice-clone',
  'video-extract-audio': 'video-extract-audio',
  'http-request': 'http-request',
  'app-notify': 'app-notify',
  'template-transform': 'template-transform',
  'parameter-extractor': 'parameter-extractor',
  'web-extract': 'web-extract',
  'kb-qa': 'kb-qa',
  'oas-tool': 'oas-tool',
  'report': 'report',
  'report-image': 'report-image',
  'form-collect': 'form-collect',
  'message': 'message',
  'tool-call': 'tool-call',
  'code': 'code',
  'sub-workflow': 'sub-workflow',
  'variable': 'variable',
  'data-table': 'data-table',
  'save-asset': 'save-asset',
  'read-asset': 'read-asset',
  'read-assets': 'read-assets',
  'collect-webpage': 'collect-webpage',
  'save-diary': 'save-diary',
  'collect-diary': 'collect-diary',
  'crawl-news': 'crawl-news',
  'crawl-links': 'crawl-links',
  'source-catalog': 'source-catalog',
  'chapter-writing': 'chapter-writing',
  'volume-design': 'volume-design',
  'video-gen': 'video-gen',
  'video-compose': 'video-compose',
  'video-preset': 'video-preset',
  'slide-render': 'slide-render',
  'podcast-compose': 'podcast-compose',
  'skill-call': 'skill-call',
  'skill-distill': 'skill-distill',
  'agent-loop': 'agent-loop',
} as const satisfies Record<WorkflowNodeType, WorkflowNodeType>

/** 出边类型常量（键=值，与 WorkflowEdgeKind 一一对应） */
export const WORKFLOW_EDGE_KINDS = {
  normal: 'normal',
  fail: 'fail',
  approve: 'approve',
  reject: 'reject',
  branch: 'branch',
  'loop-body': 'loop-body',
  'loop-back': 'loop-back',
  'loop-done': 'loop-done',
} as const satisfies Record<WorkflowEdgeKind, WorkflowEdgeKind>

/** 运行状态常量（键=值，与 WorkflowRunStatus 一一对应） */
export const WORKFLOW_RUN_STATUSES = {
  pending: 'pending',
  running: 'running',
  waiting_review: 'waiting_review',
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
  interrupted: 'interrupted',
  skipped: 'skipped',
  timed_out: 'timed_out',
} as const satisfies Record<WorkflowRunStatus, WorkflowRunStatus>

/**
 * 运行终态集合（单一事实源，双端共用）：
 * run-status 事件到达这些状态即不再推进——事件桥/SSE 关流/前端轮询兜底均以此判定。
 * 注意：running/waiting_review 是中间态，不得与终态混判。
 */
export const WORKFLOW_RUN_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  WORKFLOW_RUN_STATUSES.succeeded,
  WORKFLOW_RUN_STATUSES.failed,
  WORKFLOW_RUN_STATUSES.cancelled,
  WORKFLOW_RUN_STATUSES.skipped,
  WORKFLOW_RUN_STATUSES.timed_out,
  WORKFLOW_RUN_STATUSES.interrupted,
])

/** 节点运行状态常量（键=值，与 WorkflowNodeRunStatus 一一对应） */
export const WORKFLOW_NODE_RUN_STATUSES = {
  pending: 'pending',
  running: 'running',
  waiting_review: 'waiting_review',
  succeeded: 'succeeded',
  failed: 'failed',
  failed_recovered: 'failed_recovered',
  cancelled: 'cancelled',
  interrupted: 'interrupted',
  skipped: 'skipped',
  timed_out: 'timed_out',
} as const satisfies Record<WorkflowNodeRunStatus, WorkflowNodeRunStatus>

// ==================== handleId 编码（编辑器 ↔ 引擎共用） ====================

/** normal 出边的 handleId（Vue Flow sourceHandle） */
export const WORKFLOW_HANDLE_OUT = 'out'

const EDGE_KIND_TO_HANDLE_ID: Record<WorkflowEdgeKind, string> = {
  normal: WORKFLOW_HANDLE_OUT,
  fail: 'fail',
  approve: 'approve',
  reject: 'reject',
  branch: 'branch', // branch 实际编码为 `branch:${branchId}`（见 encodeHandleId）
  'loop-body': 'loop-body',
  'loop-back': 'loop-back',
  'loop-done': 'loop-done',
}

/**
 * 出边 → Vue Flow handleId 编码。
 * branch 边编码为 `branch:${branchId}`，其余为固定 id。
 * 引擎的 node_run.route_taken 也存此编码（单一编码源，双端共用）。
 */
export function encodeWorkflowHandleId(kind: WorkflowEdgeKind, branchId?: string): string {
  if (kind === 'branch') return `branch:${branchId ?? ''}`
  return EDGE_KIND_TO_HANDLE_ID[kind]
}

/** handleId → 出边类型解码（encodeWorkflowHandleId 的逆函数） */
export function decodeWorkflowHandleId(handleId: string): {
  kind: WorkflowEdgeKind
  branchId?: string
} {
  if (handleId.startsWith('branch:')) {
    return { kind: 'branch', branchId: handleId.slice('branch:'.length) || undefined }
  }
  const entry = (Object.entries(EDGE_KIND_TO_HANDLE_ID) as Array<
    [WorkflowEdgeKind, string]
  >).find(([, id]) => id === handleId)
  return entry ? { kind: entry[0] } : { kind: 'normal' }
}

// ==================== 领域事件目录（事件触发器可选源） ====================

/** 节点 id 保留字（变量命名空间冲突：sys=系统变量根；start 已被开始节点语义占用） */
export const WORKFLOW_RESERVED_NODE_ID = 'sys'

/** 运行事件通道名（引擎→前端单通道；双端共用，禁止裸字符串） */
export const WORKFLOW_RUN_EVENT_CHANNEL = 'wf:run-event'

/** 领域事件名常量（埋点处与触发目录同源引用，防拼写漂移静默失配） */
export const WORKFLOW_EVENT_NAMES = {
  kbDocumentCompleted: 'kb:document-completed',
  kbDocumentFailed: 'kb:document-failed',
  imageGenerationCompleted: 'image:generation-completed',
  translationCompleted: 'translation:completed',
  translationFailed: 'translation:failed',
  voiceTtsCompleted: 'voice:tts-completed',
  voiceSttCompleted: 'voice:stt-completed',
} as const

/** 可触发工作流的领域事件（进程内事件总线发布；新增埋点时同步维护此目录） */
export const WORKFLOW_TRIGGERABLE_EVENTS: ReadonlyArray<{
  name: string
  label: string
  payloadKeys: string[]
}> = [
  {
    name: WORKFLOW_EVENT_NAMES.kbDocumentCompleted,
    label: '知识库文档入库完成',
    payloadKeys: ['documentId', 'status'],
  },
  {
    name: WORKFLOW_EVENT_NAMES.kbDocumentFailed,
    label: '知识库文档入库失败',
    payloadKeys: ['documentId', 'status'],
  },
  {
    name: WORKFLOW_EVENT_NAMES.imageGenerationCompleted,
    label: '图像生成完成',
    payloadKeys: ['taskId'],
  },
  {
    name: WORKFLOW_EVENT_NAMES.translationCompleted,
    label: '翻译完成',
    payloadKeys: ['translationId'],
  },
  {
    name: WORKFLOW_EVENT_NAMES.translationFailed,
    label: '翻译失败',
    payloadKeys: ['translationId'],
  },
  {
    name: WORKFLOW_EVENT_NAMES.voiceTtsCompleted,
    label: '语音合成完成',
    payloadKeys: ['recordId', 'text'],
  },
  {
    name: WORKFLOW_EVENT_NAMES.voiceSttCompleted,
    label: '语音识别完成',
    payloadKeys: ['recordId', 'text'],
  },
]

// ==================== 默认值与硬性上限（配置链末端） ====================

/**
 * 执行设置默认值（配置链：节点级 → 工作流级 → settings 表 wf:defaults → 此处）。
 * 修改数值属于产品决策，需同步更新功能设计文档。
 */
export const WORKFLOW_DEFAULTS = {
  /** 单次运行最长时长 30 分钟 */
  maxDurationMs: 30 * 60_000,
  /** 循环最大迭代 100 次 */
  maxLoopIterations: 100,
  /** 节点输出截断 512k 字符（2026-08-27 从 64k 提升：长文本节点（网页正文/报告 markdown）
   *  此前在引擎层被截断导致早报内容缺失；工作流级 settings.maxOutputChars 可再覆盖，上限 1M） */
  maxOutputChars: 512_000,
  /** 节点重试封顶 5 次 */
  maxRetryCount: 5,
  /** 单运行并行节点上限 5 */
  maxParallelNodes: 5,
  /** 全局并发运行数 3 */
  maxConcurrentRuns: 3,
  /** 单节点最大执行次数 100（按节点计；必须 ≥ maxLoopIterations，否则合法循环提前被护栏误杀） */
  maxNodeRuns: 100,
  /** 多轮对话默认关闭（节点间仅靠 {{变量}} 显式注入，保持无状态单轮） */
  multiTurn: false,
  /** agent-loop 节点默认最大迭代轮数（12 号 §7.3：节点级护栏——引擎 maxNodeRuns 对节点内循环无效） */
  agentLoopMaxIterations: 20,
  /** agent-loop 节点 maxIterations 配置上限（护栏的护栏：防单节点配成千轮空转烧 token） */
  agentLoopMaxIterationsCeiling: 500,
  /** cron 调度间隔 30s */
  cronTickMs: 30_000,
  /** cron 错过宽限窗口 = 2 × tick（超过视为错过，推进到未来首个触发点） */
  cronGraceFactor: 2,
  /** 审核超时扫描间隔（独立于 cronTick——语义无关，可独立调优） */
  reviewTimeoutTickMs: 30_000,
  /** HTTP 请求节点默认超时（封顶 WORKFLOW_LIMITS.httpTimeoutMs） */
  httpRequestTimeoutMs: 30_000,
  /** 爬取礼貌：请求前随机间隔（毫秒）——同站单线程 + 随机延迟，降低反爬/打爆概率 */
  crawlDelayMsMin: 800,
  crawlDelayMsMax: 2_500,
  /** 爬取礼貌：同一网站（host）最大并发（1 = 同站单线程） */
  crawlHostConcurrency: 1,
  /** 知识库入库等待：轮询间隔 / 总超时 */
  kbIngestPollIntervalMs: 500,
  kbIngestWaitTimeoutMs: 120_000,
  /** kb-qa 检索上下文最大字符（P4 常量化，禁止 handler 写死） */
  kbQaContextMaxChars: 8_000,
  /** 图像生成等待：轮询间隔 / 总超时 */
  imagePollIntervalMs: 2_000,
  imagePollTimeoutMs: 300_000,
  /** 语音复刻训练等待：轮询间隔 / 总超时 */
  voiceClonePollIntervalMs: 3_000,
  voiceCloneWaitTimeoutMs: 600_000,
  /**
   * 代码节点沙箱单次执行超时（毫秒）。
   * 2026-09-13 参数设置：以前"默认值"和"上限"都是 `WORKFLOW_LIMITS.codeTimeoutMs`（5s），
   * 于是节点想配更长也会被夹回 5s —— 现在默认在此、上限在 LIMITS（60s）。
   */
  codeTimeoutMs: 5_000,
} as const

/** 硬性上限（任何层级的配置都不可超过；防失控的最终防线） */
export const WORKFLOW_LIMITS = {
  maxDurationMs: 24 * 3_600_000,
  maxLoopIterations: 10_000,
  maxOutputChars: 1_000_000,
  maxRetryCount: 10,
  maxParallelNodes: 20,
  maxConcurrentRuns: 10,
  maxNodeRuns: 1000,
  /** 运行级总工具调用预算硬上限（防失控兜底） */
  maxTotalToolCalls: 10_000,
  retryDelayMs: 60_000,
  httpTimeoutMs: 300_000,
  imagePollTimeoutMs: 600_000,
  /** 爬取礼貌硬上限：随机间隔上限 / 同站最大并发 */
  crawlDelayMsMax: 60_000,
  /** 爬取礼貌间隔**下限**的硬上限（2026-09-13 参数设置补：此前 min 完全没有夹取，可配出 min > max） */
  crawlDelayMsMin: 60_000,
  crawlHostConcurrency: 10,
  /** 代码节点沙箱执行超时（防死循环拖垮引擎）；默认值见 WORKFLOW_DEFAULTS.codeTimeoutMs */
  codeTimeoutMs: 60_000,
  /** 子工作流节点等待子运行终态的超时 */
  subflowTimeoutMs: 600_000,
} as const
