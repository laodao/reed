/**
 * 节点配置表单 Schema（组件化的表单层）
 * @module shared/types/workflow-node-forms
 * @description 每个节点组件自带的配置表单声明——编辑器按 Schema 渲染表单，
 *              新增组件时在此（或随组件包）加一份 Schema 即获得完整表单，
 *              编辑器零改动（与 NODE_TYPE_CATALOG 同为组件元数据，分离关注：
 *              catalog 服务于引擎校验/变量提示，本文件服务于编辑器呈现）。
 *
 *              动态选项（type='select-dynamic'）由编辑器按 source 标识拉取：
 *              - 'knowledgeBases'：用户知识库列表（id → name）
 */

import type { WorkflowNodeType } from './workflow.types'

/** 表单字段声明 */
export interface CatalogFormField {
  /** config 内的键（支持一级点路径，如 'branches'） */
  key: string
  label: string
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'select-dynamic'
    | 'switch'
    | 'slider'
    /** 键值对列表（assignments / headers） */
    | 'kv-list'
    /** 条件分支专用编辑器 */
    | 'branches'
    /** 开始节点输入参数专用编辑器 */
    | 'inputs-list'
    /** 审核可编辑字段专用编辑器 */
    | 'fields-list'
  placeholder?: string
  /** select 的静态选项 */
  options?: Array<{ label: string; value: string | number }>
  /** select-dynamic 的数据源标识 */
  source?: 'knowledgeBases'
  help?: string
  /** 字段值支持 {{}} 模板的提示标记（表单角标） */
  templateHint?: boolean
  min?: number
  max?: number
  step?: number
  /** 分组标题（同组字段渲染在同一分隔区块） */
  group?: string
  /** 折叠分组（默认收起） */
  collapsible?: boolean
}

const T = (key: string, label: string, extra: Partial<CatalogFormField> = {}): CatalogFormField => ({
  key,
  label,
  type: 'text',
  ...extra,
})

/** 全部 21 个组件的表单 Schema */
export const NODE_CONFIG_FORMS: Record<WorkflowNodeType, CatalogFormField[]> = {
  start: [
    { key: 'inputs', label: '输入参数', type: 'inputs-list', help: '运行时以表单填写；定时触发用默认值' },
  ],
  end: [],
  condition: [
    { key: 'branches', label: '分支条件', type: 'branches' },
    T('noMatchPolicy', '全部未命中', {
      type: 'select',
      options: [
        { label: '节点失败', value: 'fail' },
        { label: '走兜底分支', value: 'fallback' },
      ],
    }),
    T('fallbackBranchId', '兜底分支 ID', {
      help: 'noMatchPolicy=fallback 时必填，填 branches 中声明的 branchId',
    }),
  ],
  parallel: [
    { key: '_hint', label: '', type: 'text', help: '扇出节点：出边数即并行分支数，无需配置' },
  ],
  'parallel-merge': [
    T('waitPolicy', '等待策略', {
      type: 'select',
      options: [
        { label: '等齐全部入边', value: 'all' },
        { label: '任一到达即通过', value: 'any' },
      ],
    }),
    T('outputMode', '输出模式', {
      type: 'select',
      options: [
        { label: '合并（按来源节点展开）', value: 'merge' },
        { label: '仅首个到达的输出', value: 'first' },
      ],
    }),
  ],
  loop: [
    T('listExpression', '遍历列表', {
      type: 'textarea',
      templateHint: true,
      placeholder: '{{start.items}}',
      help: '解析结果必须是数组；循环体内用 {{本节点ID.item}} / {{本节点ID.index}}',
    }),
    T('emptyPolicy', '空列表策略', {
      type: 'select',
      options: [
        { label: '跳过（直接完成）', value: 'skip' },
        { label: '节点失败', value: 'fail' },
      ],
    }),
  ],
  delay: [
    T('durationMs', '等待时长（毫秒）', { templateHint: true, placeholder: '1000 或 {{start.waitMs}}' }),
  ],
  'human-review': [
    T('payload', '送审内容', {
      type: 'textarea',
      templateHint: true,
      placeholder: '对象 JSON 或 {{上游节点.字段}}',
      help: '单占位模板会透传对象；纯文本会包成 { content }',
    }),
    { key: 'timeoutMs', label: '超时（毫秒）', type: 'number', placeholder: '留空 = 无限等待' },
    T('timeoutPolicy', '超时策略', {
      type: 'select',
      options: [
        { label: '节点失败', value: 'fail' },
        { label: '视为批准', value: 'approve' },
        { label: '视为驳回', value: 'reject' },
      ],
    }),
    { key: 'editableFields', label: '可修改字段', type: 'fields-list', help: '"修改后批准"时允许审核人改的字段；留空 = 不允许修改', collapsible: true },
  ],
  assign: [
    { key: 'assignments', label: '赋值', type: 'kv-list', keyPlaceholder: '变量名', valuePlaceholder: '值或 {{模板}}' },
  ],

  'llm-chat': [
    T('providerConfigId', 'Provider 配置 ID', {
      group: '模型',
      help: '留空 = 用户默认 Provider（设置页可查看配置 ID）',
    }),
    T('modelId', '模型 ID', { group: '模型', help: '留空 = 按配置自动回退选择' }),
    T('systemPrompt', '系统提示词', { type: 'textarea', group: '对话' }),
    T('prompt', '用户消息', { type: 'textarea', templateHint: true, group: '对话', placeholder: '{{start.topic}}' }),
    { key: 'temperature', label: '温度', type: 'slider', min: 0, max: 2, step: 0.1, group: '参数' },
    { key: 'maxTokens', label: '最大 Token', type: 'number', group: '参数' },
    { key: 'jsonMode', label: 'JSON 输出模式', type: 'switch', group: '参数', help: '输出自动解析为 parsed 字段，非 JSON 则节点失败' },
  ],
  'kb-retrieve': [
    { key: 'knowledgeBaseId', label: '知识库', type: 'select-dynamic', source: 'knowledgeBases' },
    T('query', '查询内容', { type: 'textarea', templateHint: true, placeholder: '{{start.question}}' }),
    { key: 'topK', label: '返回条数', type: 'number', min: 1, max: 50, group: '参数' },
    { key: 'threshold', label: '相似度阈值', type: 'slider', min: 0, max: 1, step: 0.05, group: '参数' },
  ],
  'kb-ingest': [
    { key: 'knowledgeBaseId', label: '知识库', type: 'select-dynamic', source: 'knowledgeBases' },
    T('title', '文档标题', { templateHint: true }),
    T('content', '文档内容', { type: 'textarea', templateHint: true, placeholder: '{{llm1.content}}' }),
    { key: 'waitForCompletion', label: '等待入库完成', type: 'switch', help: '关闭 = 提交即成功（后台处理）' },
  ],
  'web-search': [
    T('query', '搜索关键词', { type: 'textarea', templateHint: true }),
    T('engineType', '搜索引擎类型', { help: '留空 = 用户默认引擎', group: '参数' }),
    { key: 'maxResults', label: '结果数量', type: 'number', min: 1, max: 20, group: '参数' },
  ],
  translate: [
    T('text', '待翻译内容', { type: 'textarea', templateHint: true, placeholder: '{{start.text}}' }),
    T('sourceLang', '源语言', { help: '留空 = 自动检测', group: '语言' }),
    T('targetLang', '目标语言', { group: '语言', placeholder: 'en / zh / ja ...' }),
  ],
  'image-gen': [
    T('prompt', '提示词', { type: 'textarea', templateHint: true }),
    T('negativePrompt', '负面提示词', { group: '参数' }),
    { key: 'width', label: '宽度', type: 'number', group: '参数' },
    { key: 'height', label: '高度', type: 'number', group: '参数' },
    { key: 'count', label: '生成数量', type: 'number', min: 1, max: 4, group: '参数' },
    T('modelId', '图像模型 ID', { group: '模型', help: '必填（图像服务暂无默认模型机制）' }),
  ],
  tts: [
    T('text', '合成文本', { type: 'textarea', templateHint: true, placeholder: '{{llm1.content}}' }),
    T('voiceId', '音色 ID', { help: '语音页可查看音色列表' }),
    { key: 'speed', label: '语速', type: 'slider', min: 0.5, max: 2, step: 0.1, group: '参数' },
  ],
  stt: [
    T('audio', '音频来源', { type: 'textarea', templateHint: true, placeholder: '{{tts1.audioPath}} 或 base64' }),
    T('language', '语言', { help: '留空 = 自动' }),
  ],
  'lw-generate-chapter': [
    T('projectId', '长文项目 ID', { group: '目标' }),
    T('outlineId', '章节大纲 ID', { group: '目标' }),
    { key: 'targetWords', label: '目标字数', type: 'number', group: '参数' },
    { key: 'waitForCompletion', label: '等待生成完成', type: 'switch', group: '参数', help: '长任务：关闭 = 提交即成功（输出 eventId）' },
  ],
  'lw-polish': [
    T('projectId', '长文项目 ID', { group: '目标' }),
    T('field', '润色字段', {
      type: 'select',
      group: '目标',
      options: [
        { label: '时代描述', value: 'eraDescription' },
        { label: '社会结构', value: 'socialStructure' },
        { label: '科技水平', value: 'techLevel' },
        { label: '特殊规则', value: 'specialRules' },
        { label: '势力分布', value: 'factionDistribution' },
        { label: '地理导向', value: 'geographicOrientation' },
      ],
    }),
    T('eraType', '时代类型', { group: '目标', help: '可选' }),
    T('content', '原文内容', { type: 'textarea', templateHint: true, group: '目标' }),
    { key: 'waitForCompletion', label: '等待完成', type: 'switch', group: '参数' },
  ],

  'http-request': [
    T('method', '请求方法', {
      type: 'select',
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(v => ({ label: v, value: v })),
    }),
    T('url', 'URL', { placeholder: 'https://...', templateHint: true }),
    { key: 'headers', label: '请求头', type: 'kv-list', keyPlaceholder: 'Header', valuePlaceholder: '值或 {{模板}}', collapsible: true },
    T('body', '请求体', { type: 'textarea', templateHint: true, collapsible: true, help: 'GET 以外的方法可用' }),
    { key: 'timeoutMs', label: '超时（毫秒）', type: 'number', group: '参数' },
  ],
  'app-notify': [
    T('title', '通知标题', { templateHint: true }),
    T('message', '通知内容', { type: 'textarea', templateHint: true }),
    T('level', '级别', {
      type: 'select',
      options: [
        { label: '信息', value: 'info' },
        { label: '成功', value: 'success' },
        { label: '警告', value: 'warning' },
        { label: '错误', value: 'error' },
      ],
    }),
  ],
}
