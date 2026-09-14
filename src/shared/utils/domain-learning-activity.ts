/**
 * 领域共学：Agent 活动描述（纯函数；2026-09-13 用户需求）
 * @module shared/utils/domain-learning-activity
 *
 * 背景（用户反馈）：起步研究与「研究此概念」动辄跑两三分钟，界面只有一个「正在起步研究…」，
 * 用户感知不到系统在工作。底层其实每步都有事件（`tool-start` 带工具名与入参、`tool-end` 带成败、
 * `step` 带步数），只是被翻成了一个笼统的「决定中/执行中」。
 *
 * 本模块把「一次工具调用」翻译成一行**人话**（1-3 行滚动显示用），例如：
 *   正在联网检索：股票 期货 美元
 *   正在落库知识点：资产配置与分散化
 *   ⚠️ 落库知识点「指数基金与定投」未成功——原因见本轮总结
 *
 * 设计取向：宁可朴素也不猜——只根据工具名与入参生成，拿不到关键入参就退化为工具级描述。
 */

/** 活动严重度：info=正常推进；warn=失败/被拦（必须让用户看见） */
export type DlActivityKind = 'info' | 'warn'

export interface DlActivityInput {
  toolName: string
  /** 工具入参原值（tool-start 事件携带；可能缺失或不是对象） */
  args?: unknown
  /** 当前步数（step 事件给出；缺省不显示步号） */
  step?: number
  /** 工具是否执行成功（tool-end 事件；undefined=调用开始） */
  ok?: boolean
  /** 失败时的补充说明（如 registry 给出的 hint 摘要） */
  detail?: string
}

export interface DlActivityLine {
  line: string
  kind: DlActivityKind
}

/** 工具名 → 动作短语（"正在…" 后面的部分） */
const TOOL_ACTIONS: Record<string, string> = {
  discover_capabilities: '查看可用技能',
  invoke_skill: '执行技能',
  web_search: '联网检索',
  wf_web_extract: '读取网页',
  http_get: '抓取页面/接口',
  wf_kb_retrieve: '检索知识库',
  wf_kb_list: '查看知识库清单',
  wf_translate: '翻译资料',
  dl_save_space_prereqs: '落库主题前置要求',
  dl_save_concept: '落库知识点',
  dl_save_relation: '建立前置关系',
  dl_save_card: '编写讲义',
  dl_answer_question: '存档答疑',
  dl_task_progress: '上报进度',
  run_workflow: '运行工作流',
  get_workflow_run: '查看工作流状态',
  code_run: '运行代码',
  data_table_query: '查询数据表',
  data_table_write: '写入数据表',
}

/**
 * 从入参里挑出"这一行最该显示的东西"（对象名/检索词/URL 主机）。
 * 只认明确的键，避免把整段 JSON 糊到界面上。
 */
function subjectOf(toolName: string, args: unknown): string | null {
  if (!args || typeof args !== 'object') return typeof args === 'string' ? clip(args) : null
  const a = args as Record<string, any>
  const pick = (...vals: unknown[]): string | null => {
    for (const v of vals) {
      if (typeof v === 'string' && v.trim()) return clip(v.trim())
    }
    return null
  }
  const nested = (key: string): Record<string, any> | null =>
    a[key] && typeof a[key] === 'object' ? (a[key] as Record<string, any>) : null

  switch (toolName) {
    case 'dl_save_concept': {
      const c = nested('concept')
      return pick(c?.name, a.name)
    }
    case 'dl_save_card': {
      const c = nested('card')
      return pick(c?.conceptName, c?.conceptId, a.conceptName, a.conceptId)
    }
    case 'dl_save_relation': {
      const r = nested('relation')
      const src = pick(r?.sourceId, r?.source)
      const tgt = pick(r?.targetId, r?.target)
      return src && tgt ? `${src} → ${tgt}` : (src ?? tgt)
    }
    case 'dl_answer_question': {
      const q = nested('question')
      return pick(q?.question, a.question)
    }
    case 'dl_task_progress':
      return pick(a.label, a.message)
    case 'invoke_skill':
      return pick(a.skillId, a.skill, a.name)
    case 'web_search':
      return pick(a.query, a.q, a.keywords)
    case 'wf_kb_retrieve':
      return pick(a.query, a.question, a.keywords)
    case 'wf_web_extract':
    case 'http_get':
      return hostOf(pick(a.url, a.href, a.target))
    case 'run_workflow':
      return pick(a.templateId, a.definitionId, a.workflowId, a.name)
    default:
      return pick(a.name, a.title, a.query, a.url, a.label, a.skillId)
  }
}

/** URL → 主机名（只显示域名，避免长 URL 挤爆一行） */
function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).host || url
  } catch {
    return clip(url)
  }
}

/** 截断（保持一行可读） */
function clip(text: string, max = 48): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * 生成活动行。
 * - `ok === false` → warn 行（失败必须可见：额度用尽/门禁拒绝都走这里）；
 * - 其余 → info 行「第 N 步 · 正在<动作>：<对象>」。
 */
export function describeDlActivity(input: DlActivityInput): DlActivityLine {
  const action = TOOL_ACTIONS[input.toolName] ?? `执行 ${input.toolName}`
  const subject = subjectOf(input.toolName, input.args)

  if (input.ok === false) {
    const detail = input.detail ? `（${clip(input.detail, 40)}）` : ''
    const what = subject ? `${action}「${subject}」` : action
    return { kind: 'warn', line: `⚠️ ${what}未成功${detail}——原因见本轮总结` }
  }

  const step = typeof input.step === 'number' && input.step > 0 ? `第 ${input.step} 步 · ` : ''
  return { kind: 'info', line: `${step}正在${action}${subject ? `：${subject}` : ''}` }
}

/**
 * 滚动行缓冲（保留最近 N 行；同一条重复到达不重复堆叠——回退重试同一动作很常见）。
 * 返回新数组，不改原数组（便于 Vue 响应式与测试）。
 */
export function pushActivityLine(lines: string[], line: string, cap = 3): string[] {
  const text = String(line ?? '').trim()
  if (!text) return lines
  if (lines[lines.length - 1] === text) return lines
  const next = [...lines, text]
  return next.length > cap ? next.slice(next.length - cap) : next
}
