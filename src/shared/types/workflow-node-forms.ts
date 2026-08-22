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
    /** Provider+模型联动下拉（写 providerConfigId 与 modelId 两键） */
    | 'model-pair'
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
    /** OAS 接口下拉（选项从同节点 config.oasSpec 本地解析） */
    | 'oas-operations'
    /** OAS 参数编辑（kv-list + 按接口声明生成参数行） */
    | 'oas-params'
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
    { key: 'providerConfigId', label: '模型', type: 'model-pair', group: '模型', help: '留空 = 按默认 Provider 自动回退选择' },
    T('systemPrompt', '系统提示词', { type: 'textarea', group: '对话' }),
    T('prompt', '用户消息', { type: 'textarea', templateHint: true, group: '对话', placeholder: '{{start.topic}}' }),
    { key: 'temperature', label: '温度', type: 'slider', min: 0, max: 2, step: 0.1, group: '参数' },
    { key: 'maxTokens', label: '最大 Token', type: 'number', group: '参数' },
    { key: 'jsonMode', label: 'JSON 输出模式', type: 'switch', group: '参数', help: '输出自动解析为 parsed 字段，非 JSON 则节点失败' },
    { key: 'vision', label: '视觉模式', type: 'switch', group: '视觉', help: '开启后走视觉模型（当前不可中断）' },
    T('imageInput', '图片输入', {
      type: 'textarea', group: '视觉', templateHint: true,
      placeholder: '本地路径 / http(s) URL / base64，多张用逗号或换行分隔（最多4张，当前取第一张）',
    }),
  ],
  'kb-retrieve': [
    { key: 'knowledgeBaseId', label: '知识库', type: 'select-dynamic', source: 'knowledgeBases' },
    T('query', '查询内容', { type: 'textarea', templateHint: true, placeholder: '{{start.question}}' }),
    { key: 'topK', label: '返回条数', type: 'number', min: 1, max: 50, group: '参数' },
    { key: 'threshold', label: '相似度阈值', type: 'slider', min: 0, max: 1, step: 0.05, group: '参数' },
    { key: 'includeDialogFiles', label: '包含本对话上传的文件', type: 'switch', group: '参数', help: '把对话附件也纳入检索范围（仅从 AI 对话中触发时生效）' },
    { key: 'useRerank', label: '重排序（rerank）', type: 'switch', group: '参数', help: '知识库配置了 rerank 模型时对检索结果重排（默认开）' },
    { key: 'vectorWeight', label: '向量/关键词权重', type: 'slider', min: 0, max: 1, step: 0.05, group: '参数', help: '1=纯向量语义检索（默认）；0=纯 BM25 关键词；中间值=混合加权' },
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
  'video-extract-audio': [
    T('videoPath', '本地视频文件路径', { type: 'textarea', templateHint: true, placeholder: '{{start.video.path}}（表单 file 字段的路径）' }),
    T('videoUrl', '视频链接', { type: 'textarea', templateHint: true, placeholder: 'https://...（mp4 直链 / B站 BV 链接；抖音请手动下载后本地导入）', help: '本地文件与链接二选一；支持常规直链与 B站（公开 API 解析音频直链），抖音受风控不支持自动解析' }),
    T('language', '语言', { help: '透传给下游 stt 的语言提示（本节点仅提取音频）' }),
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

  'oas-tool': [
    T('oasSpec', 'OpenAPI JSON', {
      type: 'textarea',
      help: '粘贴接口文档的 OpenAPI/Swagger JSON（V1 不支持 $ref 引用）',
    }),
    { key: 'operationId', label: '接口', type: 'oas-operations', help: '从上方 JSON 解析出的接口列表' },
    { key: 'params', label: '参数', type: 'oas-params', help: '值支持 {{模板}}；点「按接口定义生成」自动带出参数行' },
    T('baseUrlOverride', 'BaseURL 覆盖', { placeholder: '留空用文档里的 servers/host', collapsible: true }),
    { key: 'headers', label: '附加请求头', type: 'kv-list', keyPlaceholder: 'Header（如 Authorization）', valuePlaceholder: '值，支持 {{模板}}', collapsible: true },
    { key: 'timeoutMs', label: '超时（毫秒）', type: 'number', group: '参数' },
  ],
  'tool-call': [
    { key: 'toolType', label: '工具来源', type: 'select', options: [
      { label: '自定义工具', value: 'custom' },
      { label: '预设工具', value: 'preset' },
    ] },
    { key: 'toolId', label: '工具', type: 'tool-select', help: '选择自定义工具或预设工具；选中后参数表单按工具 schema 生成' },
    { key: 'credentialId', label: '凭据', type: 'tool-credential-select', help: '工具为 credential 鉴权时选择（可选，未选则按工具默认）' },
    { key: 'params', label: '参数', type: 'tool-params', help: '值支持 {{模板}}；按工具参数 schema 生成' },
  ],
  'code': [
    T('code', '代码', { type: 'textarea', help: '输入在 inputs 对象（键=下方参数键）；return 一个对象作为节点输出，如 return { sum: inputs.a + inputs.b }。V1 不暴露 require/process/fs，5s 超时' }),
    { key: 'inputs', label: '输入参数', type: 'kv-list', keyPlaceholder: '参数键（inputs.键 引用）', valuePlaceholder: '值，支持 {{模板}}' },
  ],
  'sub-workflow': [
    T('definitionId', '子工作流 ID', { placeholder: '在子工作流详情/导出中查看（运行其发布图）', templateHint: true }),
    { key: 'inputs', label: '入参', type: 'kv-list', keyPlaceholder: '子工作流 start 参数键', valuePlaceholder: '值，支持 {{模板}}' },
  ],
  'variable': [
    { key: 'op', label: '操作', type: 'select', options: [{ label: '读取 get', value: 'get' }, { label: '写入 set', value: 'set' }] },
    { key: 'scope', label: '作用域', type: 'select', options: [{ label: '全局', value: 'global' }, { label: '当前用户', value: 'user' }] },
    T('key', '变量键', { templateHint: true }),
    { key: 'value', label: '写入值', type: 'textarea', templateHint: true, help: 'set 时写入（JSON 字符串或文本；模板可用）' },
    T('defaultValue', '兜底值', { help: 'get 无值时返回此值' }),
  ],
  'data-table': [
    { key: 'op', label: '操作', type: 'select', options: [
      { label: '插入行 insert', value: 'insert' }, { label: '查询 query', value: 'query' },
      { label: '更新 update', value: 'update' }, { label: '删除 delete', value: 'delete' },
    ] },
    T('tableId', '表 ID', { help: 'insert 可留空按 tableName 自动建表；query/update/delete 必填其一' }),
    T('tableName', '表名', { help: '表不存在时 insert 自动创建（列从 row 键推导）' }),
    T('row', '行 JSON', { type: 'textarea', templateHint: true, help: 'insert/update 用，如 {"name":"{{start.name}}","qty":3}' }),
    T('rowId', '行 ID', { help: 'update/delete 用' }),
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
  'template-transform': [
    T('template', '输出模板', {
      type: 'textarea',
      templateHint: true,
      placeholder: '{{llm1.content}}\n\n—— 由 {{start.topic}} 生成',
      help: '多个变量占位拼接为一段文本输出',
    }),
  ],
  'parameter-extractor': [
    T('input', '待抽取文本', { type: 'textarea', templateHint: true, placeholder: '{{start.text}} 或 {{web1.text}}' }),
    T('instruction', '抽取要求', { type: 'textarea', placeholder: '例如：抽出人名、地点和时间', collapsible: true }),
    { key: 'fields', label: '抽取字段', type: 'fields-list', help: '字段将展开为本节点输出（{{本节点ID.字段}}）' },
    { key: 'providerConfigId', label: 'Provider 配置', type: 'model-pair', group: '模型' },
  ],
  'web-extract': [
    T('url', '网页地址', { templateHint: true, placeholder: 'https://...' }),
    { key: 'maxLength', label: '正文最大长度', type: 'number', group: '参数', help: '超长截断（默认 100000）' },
  ],

  'kb-qa': [
    { key: 'knowledgeBaseId', label: '知识库', type: 'select-dynamic', source: 'knowledgeBases' },
    T('question', '问题', { type: 'textarea', templateHint: true, placeholder: '{{start.question}}' }),
    T('systemPrompt', '系统提示词', {
      type: 'textarea', group: '生成', collapsible: true,
      help: '留空使用默认 RAG 提示词（仅依据资料回答，不编造）',
    }),
    { key: 'providerConfigId', label: '模型', type: 'model-pair', group: '生成' },
    { key: 'temperature', label: '温度', type: 'slider', min: 0, max: 2, step: 0.1, group: '生成' },
    { key: 'topK', label: '返回条数', type: 'number', min: 1, max: 50, group: '检索' },
    { key: 'threshold', label: '相似度阈值', type: 'slider', min: 0, max: 1, step: 0.05, group: '检索' },
    { key: 'resultMaxLength', label: '资料最大长度（字符）', type: 'number', group: '检索', help: '超限整条丢弃（默认 8000）' },
    { key: 'includeDialogFiles', label: '包含本对话上传的文件', type: 'switch', group: '检索', help: '把对话附件也纳入检索范围（仅从 AI 对话中触发时生效）' },
    { key: 'useRerank', label: '重排序（rerank）', type: 'switch', group: '检索', help: '知识库配置了 rerank 模型时对检索结果重排（默认开）' },
    { key: 'vectorWeight', label: '向量/关键词权重', type: 'slider', min: 0, max: 1, step: 0.05, group: '检索', help: '1=纯向量语义检索（默认）；0=纯 BM25 关键词；中间值=混合加权' },
  ],
  'report': [
    T('title', '报告标题', { templateHint: true }),
    T('template', '模板（markdown）', {
      type: 'textarea', templateHint: true,
      placeholder: '# {{start.topic}} 报告\n\n{{llm1.content}}',
      help: '支持 markdown 图片/表格语法；多变量占位拼接为全文',
    }),
    T('format', '输出格式', {
      type: 'select',
      options: [
        { label: 'Markdown（双端）', value: 'markdown' },
        { label: 'Word 文档（桌面端本地文件）', value: 'docx' },
      ],
      help: 'PDF 导出：运行详情页预览后打印（双端可用）',
    }),
  ],

  'form-collect': [
    T('formTitle', '表单标题', { templateHint: true, placeholder: '例如：请上传待翻译文件' }),
    { key: 'fields', label: '表单字段', type: 'inputs-list', help: '字段值经 {{本节点.values.字段key}} 引用；文件字段值为 { path, name, text }' },
    { key: 'timeoutMs', label: '等待超时（毫秒）', type: 'number', group: '参数', help: '留空 = 一直等待用户提交' },
  ],
  'message': [
    T('content', '消息内容', { type: 'textarea', templateHint: true, placeholder: '例如：已完成翻译，请查看 {{report.filePath}}' }),
  ],
  'report-image': [
    T('title', '报告标题', { templateHint: true }),
    T('template', '模板（markdown）', {
      type: 'textarea', templateHint: true,
      placeholder: '# 每日早间新闻\n\n{{llm1.content}}',
      help: '支持 markdown；渲染为竖版长图',
    }),
    {
      key: 'templateId', label: '排版模板', type: 'select', group: '版式',
      options: [
        { label: '通用文档', value: 'generic' },
        { label: '早报长图（红头卡片）', value: 'morningReport' },
      ],
    },
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
  'save-asset': [
    T('content', '内容', {
      type: 'textarea', templateHint: true,
      placeholder: '{{imageGen1.images[0].url}} / {{tts1.audioPath}} / 文本 / JSON',
      help: '文件路径、http(s)/data:/local-*:// 链接、文本或 JSON；auto 模式自动识别',
    }),
    T('kind', '内容形态', {
      type: 'select',
      options: [
        { label: '自动识别（推荐）', value: 'auto' },
        { label: '文件', value: 'file' },
        { label: '链接', value: 'url' },
        { label: '文本', value: 'text' },
        { label: 'JSON', value: 'json' },
      ],
    }),
    T('category', '资产分类', {
      type: 'select',
      options: [
        { label: '自动按文件类型', value: 'auto' },
        { label: '图片', value: 'image' },
        { label: '音频', value: 'audio' },
        { label: '视频', value: 'video' },
        { label: '文档', value: 'document' },
        { label: '文本', value: 'text' },
        { label: '数据', value: 'json' },
        { label: '其他', value: 'other' },
      ],
    }),
    T('name', '资产名', { help: '留空按文件名/内容自动生成', placeholder: '例如：今日早报图' }),
    T('tags', '标签', { help: '逗号分隔，资产中心可按标签搜索' }),
    T('description', '描述', { group: '其他' }),
  ],
  'read-asset': [
    T('assetId', '资产 ID', { templateHint: true, placeholder: '{{saveAsset1.assetId}} 或 {{start.assetId}}' }),
    T('output', '输出模式', {
      type: 'select',
      options: [
        { label: '可访问链接 url', value: 'url' },
        { label: '本地文件路径 path（文件型）', value: 'path' },
        { label: '内容 content（文本/JSON 型）', value: 'content' },
        { label: '全部元数据 metadata', value: 'metadata' },
      ],
      help: 'url=前端可加载链接；path=供下游节点直接使用的本地路径',
    }),
  ],
}
