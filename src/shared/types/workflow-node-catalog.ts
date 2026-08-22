/**
 * 工作流节点目录（单一事实源）
 * @module shared/types/workflow-node-catalog
 * @description 节点类型的元数据目录：编辑器节点面板、handle 渲染、配置表单提示、
 *              变量提示、graph-validator 的出边约束校验全部由此驱动。
 *
 *              新增节点 = 此处加一项 + core 实现一个 WorkflowNodeHandler 并注册。
 *              core 的 node-registry 有配套测试保证「目录每项都有 handler」。
 *
 *              端口约束语义：
 *              - ports 列出该节点类型的合法出边类型及数量约束
 *              - required 端口缺失 → 校验错误（阻断发布）。仅用于语义构造：
 *                start 的出边、condition 的 branch、loop 的 loop-body/loop-done、
 *                human-review 的 approve——缺了引擎无法执行
 *              - 任务节点的 normal 出边不设 required：悬空节点是合法草稿态
 *                （校验器只给"不可达"警告），任务节点可作为流程终点
 *              - max 省略 = 最多 1 条；max: -1 = 不限
 *              - loop-back 边是唯一不在此声明端口约束的出边
 *                （任意循环体尾部节点都可能有，由 graph-validator 的循环体规则单独校验）
 */

import type { WorkflowEdgeKind, WorkflowNodeType } from './workflow.types'

/** 输出字段描述（编辑器变量提示用） */
export interface WorkflowOutputField {
  key: string
  type: 'string' | 'number' | 'boolean' | 'json'
  desc: string
}

/** 出边端口描述 */
export interface WorkflowPortDescriptor {
  kind: WorkflowEdgeKind
  /** 端口显示名 */
  label: string
  /** 是否必需（缺出边 = 校验错误） */
  required?: boolean
  /** 出边数量上限；省略 = 1；-1 = 不限 */
  max?: number
}

/** 节点目录项 */
export interface WorkflowCatalogEntry {
  type: WorkflowNodeType
  /** 编辑器显示名 */
  label: string
  /** 一句话说明（节点面板 tooltip） */
  description: string
  /** 分类（编辑器面板分组） */
  category: 'flow' | 'ai' | 'general'
  /** element-plus 图标组件名（编辑器 markRaw 引用） */
  icon: string
  /** 引擎执行类别：control=引擎内同步求值（不进并发池） | task=异步执行 */
  controlKind: 'control' | 'task'
  /** 底层是否真支持 AbortSignal 取消（前端"可取消"徽标 + 引擎降级依据） */
  cancellable: boolean
  /** 出边端口约束 */
  ports: readonly WorkflowPortDescriptor[]
  /** 结构性必需的 config 键（编辑器必填标记；深度校验由 handler.validateConfig 负责） */
  requiredConfigKeys?: readonly string[]
  /** 编辑器新建节点时的初始 config */
  defaultConfig: Record<string, unknown>
  /** 输出字段（变量选择器提示） */
  outputSchema: readonly WorkflowOutputField[]
}

/** 目录常量：所有内置节点类型 */
export const NODE_TYPE_CATALOG: readonly WorkflowCatalogEntry[] = [
  // ==================== 流程控制 ====================
  {
    type: 'start',
    label: '开始',
    description: '定义工作流输入参数，每次运行的起点',
    category: 'flow',
    icon: 'VideoPlay',
    controlKind: 'control',
    cancellable: false,
    ports: [{ kind: 'normal', label: '出', required: true, max: 1 }],
    defaultConfig: { inputs: [] },
    outputSchema: [
      { key: '*', type: 'json', desc: '输入参数按 key 展开（{{start.参数key}}）' },

    ],
  },
  {
    type: 'end',
    label: '结束',
    description: '流程终点（可放置多个）',
    category: 'flow',
    icon: 'CircleCheck',
    controlKind: 'control',
    cancellable: false,
    ports: [],
    defaultConfig: {},
    outputSchema: [],
  },
  {
    type: 'condition',
    label: '条件分支',
    description: '按条件表达式多路分流，命中第一路',
    category: 'flow',
    icon: 'Switch',
    controlKind: 'control',
    cancellable: false,
    ports: [{ kind: 'branch', label: '分支', required: true, max: -1 }],
    requiredConfigKeys: ['branches'],
    defaultConfig: {
      branches: [{ branchId: 'br1', label: '分支一', conditions: [] }],
      noMatchPolicy: 'fail',
    },
    outputSchema: [{ key: 'matchedBranch', type: 'string', desc: '命中的 branchId' }],
  },
  {
    type: 'parallel',
    label: '并行分支',
    description: '多路同时执行（唯一允许扇出的节点）',
    category: 'flow',
    icon: 'Share',
    controlKind: 'control',
    cancellable: false,
    ports: [{ kind: 'normal', label: '分支', max: -1 }],
    defaultConfig: {},
    outputSchema: [],
  },
  {
    type: 'parallel-merge',
    label: '并行合并',
    description: '等待并行分支汇聚（可配等齐或任一）',
    category: 'flow',
    icon: 'Merge',
    controlKind: 'control',
    cancellable: false,
    ports: [{ kind: 'normal', label: '出', max: 1 }],
    defaultConfig: { waitPolicy: 'all', outputMode: 'merge' },
    outputSchema: [
      { key: '*', type: 'json', desc: 'merge 模式按来源 nodeId 展开；first 模式为首达分支输出' },
    ],
  },
  {
    type: 'loop',
    label: '循环',
    description: '遍历列表，每项执行一遍循环体（V1 不支持嵌套）',
    category: 'flow',
    icon: 'Refresh',
    controlKind: 'control',
    cancellable: true,
    ports: [
      { kind: 'loop-body', label: '循环体', required: true, max: 1 },
      { kind: 'loop-done', label: '完成', required: true, max: 1 },
    ],
    requiredConfigKeys: ['listExpression'],
    defaultConfig: { listExpression: '{{start.items}}', emptyPolicy: 'skip' },
    outputSchema: [
      { key: 'item', type: 'json', desc: '当前迭代元素（循环体内引用）' },
      { key: 'index', type: 'number', desc: '当前迭代下标（循环体内引用）' },
      { key: 'results', type: 'json', desc: '各迭代汇聚输出的数组' },
      { key: 'count', type: 'number', desc: '迭代总数' },
    ],
  },
  {
    type: 'delay',
    label: '延时',
    description: '等待指定毫秒后继续',
    category: 'flow',
    icon: 'Timer',
    controlKind: 'task',
    cancellable: true,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['durationMs'],
    defaultConfig: { durationMs: '1000' },
    outputSchema: [{ key: 'waitedMs', type: 'number', desc: '实际等待毫秒' }],
  },
  {
    type: 'human-review',
    label: '人工审核',
    description: '挂起等待人工批准/修改后批准/驳回（应用重启后保持等待）',
    category: 'flow',
    icon: 'User',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'approve', label: '批准', required: true, max: 1 },
      { kind: 'reject', label: '驳回', max: 1 },
    ],
    requiredConfigKeys: ['payload'],
    defaultConfig: { payload: '{}', timeoutMs: null, timeoutPolicy: 'fail' },
    outputSchema: [
      { key: 'payload', type: 'json', desc: '送审内容（修改后批准时为修改版）' },
      { key: 'decision', type: 'string', desc: 'approved / approved_with_changes / rejected' },
      { key: 'rejected', type: 'boolean', desc: '驳回路径时为 true' },
    ],
  },
  {
    type: 'assign',
    label: '变量赋值',
    description: '构造/修改变量供下游引用',
    category: 'flow',
    icon: 'EditPen',
    controlKind: 'control',
    cancellable: false,
    ports: [{ kind: 'normal', label: '出', max: 1 }],
    requiredConfigKeys: ['assignments'],
    defaultConfig: { assignments: [{ key: 'foo', value: '' }] },
    outputSchema: [
      { key: 'values', type: 'json', desc: '赋值结果（{{assignN.values.foo}}）' },
    ],
  },

  // ==================== AI 能力 ====================
  {
    type: 'llm-chat',
    label: 'LLM 对话',
    description: '调用大语言模型（可选模型/温度/JSON 模式）',
    category: 'ai',
    icon: 'ChatDotRound',
    controlKind: 'task',
    cancellable: true,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['prompt'],
    defaultConfig: { systemPrompt: '', prompt: '', jsonMode: false },
    outputSchema: [
      { key: 'content', type: 'string', desc: '模型回复全文' },
      { key: 'parsed', type: 'json', desc: 'jsonMode 时的解析结果' },
      { key: 'usage', type: 'json', desc: 'token 用量 { promptTokens, completionTokens }' },
    ],
  },
  {
    type: 'kb-retrieve',
    label: '知识库检索',
    description: '向量检索知识库文档片段',
    category: 'ai',
    icon: 'Collection',
    controlKind: 'task',
    cancellable: true,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['knowledgeBaseId', 'query'],
    defaultConfig: { knowledgeBaseId: '', query: '{{start.query}}', topK: 5, threshold: 0.5, includeDialogFiles: false, useRerank: true, vectorWeight: 1 },
    outputSchema: [
      { key: 'results', type: 'json', desc: '[{ content, score, documentId, documentName }]' },
      { key: 'count', type: 'number', desc: '命中数量' },
    ],
  },
  {
    type: 'kb-ingest',
    label: '知识库入库',
    description: '把上游产出作为文档写入知识库',
    category: 'ai',
    icon: 'Upload',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['knowledgeBaseId', 'title', 'content'],
    defaultConfig: { knowledgeBaseId: '', title: '', content: '', waitForCompletion: true },
    outputSchema: [
      { key: 'documentId', type: 'string', desc: '文档 ID' },
      { key: 'status', type: 'string', desc: 'waitForCompletion=false 时为 submitted' },
    ],
  },
  {
    type: 'web-search',
    label: '联网搜索',
    description: '调用搜索引擎获取结果（不可中断，取消时降级）',
    category: 'ai',
    icon: 'Search',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['query'],
    defaultConfig: { query: '{{start.query}}', maxResults: 5 },
    outputSchema: [
      { key: 'results', type: 'json', desc: '[{ title, url, snippet }]' },
      { key: 'count', type: 'number', desc: '结果数量' },
    ],
  },
  {
    type: 'translate',
    label: '翻译',
    description: '文本翻译（不可中断，取消时降级）',
    category: 'ai',
    icon: 'Edit',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['text', 'targetLang'],
    defaultConfig: { text: '{{start.text}}', targetLang: 'en' },
    outputSchema: [{ key: 'text', type: 'string', desc: '译文' }],
  },
  {
    type: 'image-gen',
    label: '图像生成',
    description: '按提示词生成图像（异步任务，取消为软取消）',
    category: 'ai',
    icon: 'Picture',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['prompt'],
    defaultConfig: { prompt: '', width: 1024, height: 1024, count: 1 },
    outputSchema: [
      { key: 'taskId', type: 'string', desc: '生成任务 ID' },
      { key: 'images', type: 'json', desc: '[{ id, url }]' },
    ],
  },
  {
    type: 'tts',
    label: '语音合成',
    description: '文本转语音（不可中断，取消时降级）',
    category: 'ai',
    icon: 'Microphone',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['text'],
    defaultConfig: { text: '{{start.text}}', voiceId: '' },
    outputSchema: [
      { key: 'audioPath', type: 'string', desc: '音频文件路径（供 STT 节点串联）' },
      { key: 'durationMs', type: 'number', desc: '音频时长（毫秒）' },
    ],
  },
  {
    type: 'stt',
    label: '语音识别',
    description: '音频转文本（不可中断，取消时降级）',
    category: 'ai',
    icon: 'Headset',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['audio'],
    defaultConfig: { audio: '{{tts1.audioPath}}' },
    outputSchema: [{ key: 'text', type: 'string', desc: '识别文本' }],
  },
  {
    type: 'voice-clone',
    label: '语音复刻',
    description: '上传样本音频训练专属音色（长任务，可等待完成）',
    category: 'ai',
    icon: 'MagicStick',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['samplePath', 'name'],
    defaultConfig: { samplePath: '{{start.sample.path}}', name: '', prefix: '', waitForCompletion: true },
    outputSchema: [
      { key: 'clonedVoiceId', type: 'string', desc: '复刻记录 ID' },
      { key: 'voiceId', type: 'string', desc: '训练完成后的音色 ID（tts 节点引用）' },
      { key: 'status', type: 'string', desc: 'ready / training / failed' },
      { key: 'name', type: 'string', desc: '音色名' },
    ],
  },
  {
    type: 'video-extract-audio',
    label: '视频提取音频',
    description: '从视频文件提取 16kHz 单声道 wav 音频（供语音识别 stt 节点转写文案）',
    category: 'general',
    icon: 'Film',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: [],
    defaultConfig: { videoPath: '', videoUrl: '' },
    outputSchema: [
      { key: 'audioPath', type: 'string', desc: '提取的 wav 音频路径（供 stt.audio 引用）' },
      { key: 'videoName', type: 'string', desc: '原始视频文件名' },
      { key: 'durationMs', type: 'number', desc: '视频时长毫秒（未知为 0）' },
    ],
  },
  {
    type: 'lw-generate-chapter',
    label: '长文·生成章节',
    description: '调用长文写作服务生成章节（长任务，默认提交即返回）',
    category: 'ai',
    icon: 'Document',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['projectId', 'outlineId'],
    defaultConfig: { projectId: '', outlineId: '', waitForCompletion: false },
    outputSchema: [
      { key: 'eventId', type: 'string', desc: '生成事件 ID（流式进度用它订阅）' },
      { key: 'chapterId', type: 'string', desc: 'waitForCompletion=true 时章节 ID' },
      { key: 'content', type: 'string', desc: 'waitForCompletion=true 时章节内容' },
    ],
  },
  {
    type: 'lw-polish',
    label: '长文·润色',
    description: '润色长文背景字段内容（不可中断，取消时降级）',
    category: 'ai',
    icon: 'MagicStick',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['projectId', 'field', 'content'],
    defaultConfig: { projectId: '', field: '', content: '', waitForCompletion: true },
    outputSchema: [{ key: 'content', type: 'string', desc: '润色后内容' }],
  },

  // ==================== 通用 ====================
  {
    type: 'http-request',
    label: 'HTTP 请求',
    description: '调用外部 HTTP 接口（可取消）',
    category: 'general',
    icon: 'Link',
    controlKind: 'task',
    cancellable: true,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['method', 'url'],
    defaultConfig: { method: 'GET', url: '', timeoutMs: 30_000 },
    outputSchema: [
      { key: 'status', type: 'number', desc: 'HTTP 状态码' },
      { key: 'body', type: 'string', desc: '响应体文本' },
      { key: 'json', type: 'json', desc: 'JSON 响应的解析结果' },
      { key: 'headers', type: 'json', desc: '响应头' },
    ],
  },
  {
    type: 'oas-tool',
    label: '自定义接口',
    description: '粘贴 OpenAPI JSON 选择接口调用（参数按接口声明自动生成；V1 不支持 $ref）',
    category: 'general',
    icon: 'Connection',
    controlKind: 'task',
    cancellable: true,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['oasSpec', 'operationId'],
    defaultConfig: { oasSpec: '', operationId: '', params: [], baseUrlOverride: '', timeoutMs: 30_000 },
    outputSchema: [
      { key: 'status', type: 'number', desc: 'HTTP 状态码' },
      { key: 'body', type: 'string', desc: '响应体文本' },
      { key: 'json', type: 'json', desc: 'JSON 响应的解析结果' },
      { key: 'headers', type: 'json', desc: '响应头' },
    ],
  },
  {
    type: 'tool-call',
    label: '调用工具',
    description: '调用自定义工具或预设工具（第三方 API，凭据自动注入，参数支持模板）',
    category: 'general',
    icon: 'Connection',
    controlKind: 'task',
    cancellable: true,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['toolType', 'toolId'],
    defaultConfig: { toolType: 'preset', toolId: '', credentialId: '', params: [] },
    outputSchema: [
      { key: 'status', type: 'number', desc: 'HTTP 状态码（网络失败为 0）' },
      { key: 'ok', type: 'boolean', desc: '是否 2xx' },
      { key: 'json', type: 'json', desc: '响应 JSON（非 JSON 为 null）' },
      { key: 'text', type: 'string', desc: '响应原文' },
      { key: 'durationMs', type: 'number', desc: '耗时毫秒' },
    ],
  },
  {
    type: 'code',
    label: '代码执行',
    description: 'JavaScript 沙箱执行任意数据处理逻辑（V1 不暴露 require/process/fs，5s 超时）',
    category: 'general',
    icon: 'Cpu',
    controlKind: 'task',
    cancellable: true,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['code'],
    defaultConfig: { language: 'js', code: '// 输入在 inputs 对象中，return 一个对象作为输出\nreturn { sum: (inputs.a ?? 0) + (inputs.b ?? 0) }', inputs: [] },
    outputSchema: [{ key: 'result', type: 'json', desc: '代码返回值（任意 JSON 值）' }],
  },
  {
    type: 'sub-workflow',
    label: '子工作流',
    description: '调用另一个已发布工作流（运行其发布图），等待完成并输出其 message/report 结果',
    category: 'general',
    icon: 'FolderOpened',
    controlKind: 'task',
    cancellable: true,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['definitionId'],
    defaultConfig: { definitionId: '', inputs: [] },
    outputSchema: [
      { key: 'runId', type: 'string', desc: '子运行 id' },
      { key: 'status', type: 'string', desc: '子运行终态' },
      { key: 'result', type: 'string', desc: '子工作流 message 输出或 report markdown' },
    ],
  },
  {
    type: 'variable',
    label: '变量读写',
    description: '跨运行持久化键值变量（scope+key；get 无值可给兜底 / set 写入）',
    category: 'general',
    icon: 'Coin',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['op', 'key'],
    defaultConfig: { op: 'get', scope: 'global', key: '', value: '', defaultValue: '' },
    outputSchema: [
      { key: 'value', type: 'json', desc: 'get：变量值（无则 defaultValue）；set：写入的值' },
      { key: 'ok', type: 'boolean', desc: 'set 是否成功' },
    ],
  },
  {
    type: 'data-table',
    label: '数据表',
    description: '结构化数据持久化（insert 自动建表 / query 全查 / update、delete 按行操作）',
    category: 'general',
    icon: 'Grid',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['op'],
    defaultConfig: { op: 'insert', tableName: '', tableId: '', row: '', rowId: '' },
    outputSchema: [
      { key: 'rows', type: 'json', desc: 'query：行数组 [{id, ...}]' },
      { key: 'rowId', type: 'string', desc: 'insert：新行 id' },
      { key: 'tableId', type: 'string', desc: 'insert：表 id' },
      { key: 'ok', type: 'boolean', desc: 'update/delete 是否成功' },
    ],
  },
  {
    type: 'app-notify',
    label: '应用通知',
    description: '向用户推送应用内通知',
    category: 'general',
    icon: 'Bell',
    controlKind: 'task',
    cancellable: false,
    ports: [
      { kind: 'normal', label: '出', max: 1 },
      { kind: 'fail', label: '失败' },
    ],
    requiredConfigKeys: ['title', 'message'],
    defaultConfig: { title: '', message: '', level: 'info' },
    outputSchema: [{ key: 'sent', type: 'boolean', desc: '是否已发送' }],
  },
  // ==================== 扩展 ====================
  {
    type: 'template-transform',
    label: '模板转换',
    description: '把变量填充进模板输出文本（拼接/格式化）',
    category: 'general',
    icon: 'DocumentCopy',
    controlKind: 'task',
    cancellable: false,
    ports: [{ kind: 'normal', label: '出', max: 1 }, { kind: 'fail', label: '失败' }],
    requiredConfigKeys: ['template'],
    defaultConfig: { template: '' },
    outputSchema: [{ key: 'text', type: 'string', desc: '渲染后的文本' }],
  },
  {
    type: 'parameter-extractor',
    label: '参数提取',
    description: 'LLM 从文本中抽取结构化参数（按声明字段）',
    category: 'ai',
    icon: 'Key',
    controlKind: 'task',
    cancellable: true,
    ports: [{ kind: 'normal', label: '出', max: 1 }, { kind: 'fail', label: '失败' }],
    requiredConfigKeys: ['input', 'fields'],
    defaultConfig: { input: '', instruction: '', fields: [] },
    outputSchema: [
      { key: '*', type: 'json', desc: '按声明字段展开' },
      { key: '_raw', type: 'string', desc: '模型原始回复' },
    ],
  },
  {
    type: 'web-extract',
    label: '网页正文',
    description: '抓取 URL 并提取正文文本（去标签）',
    category: 'general',
    icon: 'Reading',
    controlKind: 'task',
    cancellable: true,
    ports: [{ kind: 'normal', label: '出', max: 1 }, { kind: 'fail', label: '失败' }],
    requiredConfigKeys: ['url'],
    defaultConfig: { url: '', maxLength: 100_000 },
    outputSchema: [
      { key: 'title', type: 'string', desc: '页面标题' },
      { key: 'text', type: 'string', desc: '正文文本' },
      { key: 'length', type: 'number', desc: '文本长度' },
    ],
  },
  // ==================== A2 扩展 ====================
  {
    type: 'kb-qa',
    label: '知识库问答',
    description: '检索+生成一体（RAG）：选知识库提问，引用来源一并输出',
    category: 'ai',
    icon: 'ChatLineSquare',
    controlKind: 'task',
    cancellable: true,
    ports: [{ kind: 'normal', label: '出', max: 1 }, { kind: 'fail', label: '失败' }],
    requiredConfigKeys: ['knowledgeBaseId', 'question'],
    defaultConfig: { knowledgeBaseId: '', question: '{{start.question}}', includeDialogFiles: false, useRerank: true, vectorWeight: 1 },
    outputSchema: [
      { key: 'answer', type: 'string', desc: '基于知识库的回答' },
      { key: 'sources', type: 'json', desc: '引用来源 [{documentName, score}]' },
    ],
  },
  {
    type: 'report',
    label: '报告生成',
    description: '模板渲染为 markdown / docx 报告（docx 落盘桌面端）',
    category: 'general',
    icon: 'Notebook',
    controlKind: 'task',
    cancellable: false,
    ports: [{ kind: 'normal', label: '出', max: 1 }, { kind: 'fail', label: '失败' }],
    requiredConfigKeys: ['template'],
    defaultConfig: { title: '报告', template: '', format: 'markdown' },
    outputSchema: [
      { key: 'markdown', type: 'string', desc: '渲染后全文' },
      { key: 'format', type: 'string', desc: 'markdown / docx' },
      { key: 'filePath', type: 'string', desc: 'docx 路径（桌面端）' },
      { key: 'title', type: 'string', desc: '报告标题' },
    ],
  },
  {
    type: 'form-collect',
    label: '表单收集',
    description: '流程中途挂起，弹出表单让用户填写（文本/下拉/文件上传等），提交后继续执行',
    category: 'control',
    icon: 'DocumentChecked',
    controlKind: 'task',
    cancellable: true,
    ports: [
      { kind: 'approve', label: '提交', required: true, max: 1 },
      { kind: 'reject', label: '取消' },
    ],
    requiredConfigKeys: ['formTitle', 'fields'],
    defaultConfig: { formTitle: '请填写', fields: [] },
    outputSchema: [
      { key: 'values', type: 'json', desc: '用户提交的表单值' },
      { key: 'cancelled', type: 'boolean', desc: '用户取消时 true' },
    ],
  },
  {
    type: 'message',
    label: '输出消息',
    description: '向运行流/会话输出消息内容（支持变量引用）',
    category: 'control',
    icon: 'ChatDotRound',
    controlKind: 'task',
    cancellable: false,
    ports: [{ kind: 'normal', label: '出', max: 1 }],
    requiredConfigKeys: ['content'],
    defaultConfig: { content: '' },
    outputSchema: [
      { key: 'content', type: 'string', desc: '输出内容' },
    ],
  },
  {
    type: 'report-image',
    label: '长图报告',
    description: '把内容渲染成竖版 PNG 长图（早报/简报场景；Web 端降级为排版 HTML）',
    category: 'ai',
    icon: 'PictureFilled',
    controlKind: 'task',
    cancellable: false,
    ports: [{ kind: 'normal', label: '出', max: 1 }],
    requiredConfigKeys: ['template'],
    defaultConfig: { title: '', template: '# 报告\n\n{{llm1.content}}', templateId: 'generic' },
    outputSchema: [
      { key: 'markdown', type: 'string', desc: 'markdown 全文' },
      { key: 'format', type: 'string', desc: 'image / html' },
      { key: 'filePath', type: 'string', desc: 'PNG 落盘路径（桌面端）' },
      { key: 'html', type: 'string', desc: '完整排版 HTML（Web 端/打印兜底）' },
      { key: 'title', type: 'string', desc: '报告标题' },
    ],
  },
  {
    type: 'save-asset',
    label: '保存资产',
    description: '把上游输出（文件/链接/文本/JSON）按分类保存到资产库，资产中心统一管理',
    category: 'general',
    icon: 'Collection',
    controlKind: 'task',
    cancellable: false,
    ports: [{ kind: 'normal', label: '出', max: 1 }, { kind: 'fail', label: '失败' }],
    requiredConfigKeys: ['content'],
    defaultConfig: { content: '', kind: 'auto', category: 'auto' },
    outputSchema: [
      { key: 'assetId', type: 'string', desc: '资产 ID（read-asset 节点引用）' },
      { key: 'name', type: 'string', desc: '资产名' },
      { key: 'category', type: 'string', desc: '资产大类' },
      { key: 'kind', type: 'string', desc: '存储形态（file/url/text/json）' },
      { key: 'url', type: 'string', desc: '可访问链接（文件型/链接型）' },
    ],
  },
  {
    type: 'read-asset',
    label: '读取资产',
    description: '按资产 ID 读取已保存资产（路径/内容/链接），供下游节点复用',
    category: 'general',
    icon: 'FolderOpened',
    controlKind: 'task',
    cancellable: false,
    ports: [{ kind: 'normal', label: '出', max: 1 }, { kind: 'fail', label: '失败' }],
    requiredConfigKeys: ['assetId'],
    defaultConfig: { assetId: '', output: 'url' },
    outputSchema: [
      { key: 'assetId', type: 'string', desc: '资产 ID' },
      { key: 'name', type: 'string', desc: '资产名' },
      { key: 'category', type: 'string', desc: '资产大类' },
      { key: 'kind', type: 'string', desc: '存储形态' },
      { key: 'url', type: 'string', desc: '可访问链接（url 模式）' },
      { key: 'path', type: 'string', desc: '本地文件路径（path 模式，文件型）' },
      { key: 'content', type: 'string', desc: '文本内容（content 模式，text 型）' },
      { key: 'json', type: 'json', desc: '结构化内容（content 模式，json 型）' },
    ],
  },

]

/** 目录查找表：type → 条目（O(1)，校验器/编辑器用） */
export const NODE_TYPE_CATALOG_MAP: Readonly<
  Record<WorkflowNodeType, WorkflowCatalogEntry>
> = Object.fromEntries(NODE_TYPE_CATALOG.map(entry => [entry.type, entry])) as Record<
  WorkflowNodeType,
  WorkflowCatalogEntry
>

/**
 * 类型守卫：字符串是否为已知节点类型
 */
export function isKnownWorkflowNodeType(type: string): type is WorkflowNodeType {
  return type in NODE_TYPE_CATALOG_MAP
}
