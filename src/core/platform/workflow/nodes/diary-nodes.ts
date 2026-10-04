/**
 * 日记节点（save-diary：保存到日记）
 * @module core/platform/workflow/nodes/diary-nodes
 * @description 知识提炼存日记场景的核心节点：把上游 LLM 产出（读后感/书评式提炼结果）
 *              保存为日记条目（DiaryService.createEntry），落库后用户可在 /diary
 *              阅读、编辑、导出。
 *
 *              架构铁律：节点是服务的薄适配器——目录查询/创建/条目写入全部委托
 *              DiaryService（core 层，无 electron 依赖）。多租户由 DiaryService
 *              内部的 scoped repository + ALS userId 保证。
 *
 *              缺省 folderId 行为：不写死数据，而是按需创建「AI 提炼」根文件夹
 *              （已存在则复用），作为提炼内容的默认归宿。
 */

import { DiaryService } from '@core/platform/services/diary.service'
import type { WorkflowNodeContext, WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'

/** 缺省文件夹名（首版固定展示名；无既有同名目录时才创建） */
const DEFAULT_FOLDER_NAME = 'AI 提炼'

const saveDiaryNode: WorkflowNodeHandler = {
  type: 'save-diary',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'entryId', type: 'string', desc: '日记条目 ID' },
    { key: 'title', type: 'string', desc: '日记标题' },
    { key: 'folderId', type: 'string', desc: '所属目录 ID' },
  ],
  validateConfig(config) {
    const cfg = config as { title?: string; content?: string }
    const errors: string[] = []
    if (stringifyValue(cfg.content).trim() === '') errors.push('日记内容不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      folderId?: string
      title?: string
      content?: string
    }
    // 标题缺省：按内容首行或「知识提炼-日期」生成（不写死用户数据，合理默认）
    const rawTitle = stringifyValue(cfg.title).trim()
    const content = stringifyValue(cfg.content)
    const firstLine = content.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#'))
    const title = rawTitle || firstLine?.slice(0, 30) || `知识提炼-${new Date().toISOString().slice(0, 10)}`

    const service = new DiaryService()
    let folderId = stringifyValue(cfg.folderId).trim()

    // 缺省 folderId：按需创建「AI 提炼」根文件夹（已存在则复用）
    if (!folderId) {
      const foldersResp = await service.getAllFolders()
      const folders = foldersResp.success ? (foldersResp.data ?? []) : []
      const existing = folders.find(f => f.name === DEFAULT_FOLDER_NAME && !f.parentId)
      if (existing) {
        folderId = existing.id
      } else {
        const created = await service.createFolder({ name: DEFAULT_FOLDER_NAME })
        if (!created.success || !created.data) {
          return { status: 'failed', error: `创建日记文件夹失败: ${created.error ?? '未知错误'}` }
        }
        folderId = created.data.id
      }
    }

    const resp = await service.createEntry({ folderId, title, content })
    if (!resp.success || !resp.data) {
      return { status: 'failed', error: resp.error ?? '日记保存失败' }
    }

    return {
      status: 'succeeded',
      output: {
        entryId: resp.data.id,
        title: resp.data.title,
        folderId: resp.data.folderId,
      },
    }
  },
}

/**
 * collect-diary（聚合日记素材）：按时间范围拉取日记条目，聚合成 markdown 素材
 * （标题/日期/预览），供下游 llm-chat 做周报/月报复盘。周报复盘内置流的数据面。
 *
 * 设计（spec 2026-09-24 日记增强 §5.1）：日期二选一——显式 startDate/endDate，
 * 或 days=最近 N 天（缺省 7）。folderId 可选（留空 = 全部目录跨库复盘）。
 * v1 只聚合日记正文；大脑论断/卡片段落待 P2 日记消化落地后追加。
 */
const collectDiaryNode: WorkflowNodeHandler = {
  type: 'collect-diary',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'content', type: 'string', desc: '聚合后的 markdown 素材' },
    { key: 'count', type: 'number', desc: '纳入的日记篇数' },
    { key: 'from', type: 'string', desc: '实际起始时间（ISO）' },
    { key: 'to', type: 'string', desc: '实际结束时间（ISO）' },
  ],
  validateConfig(config) {
    const cfg = config as { startDate?: string; endDate?: string; days?: string }
    const errors: string[] = []
    const hasExplicitRange = stringifyValue(cfg.startDate).trim() !== '' || stringifyValue(cfg.endDate).trim() !== ''
    const days = Number(stringifyValue(cfg.days))
    if (!hasExplicitRange && (cfg.days !== undefined && (!Number.isFinite(days) || days <= 0))) {
      errors.push('days 必须为正数（或留空用默认 7 天）')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      startDate?: string
      endDate?: string
      days?: string
      folderId?: string
    }

    // 时间窗：显式日期优先，否则最近 N 天（缺省 7）
    const now = new Date()
    const daysRaw = Number(stringifyValue(cfg.days).trim())
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 7
    const startRaw = stringifyValue(cfg.startDate).trim()
    const endRaw = stringifyValue(cfg.endDate).trim()

    let from: Date
    let to: Date
    if (startRaw) {
      from = new Date(startRaw)
      if (Number.isNaN(from.getTime())) {
        return { status: 'failed', error: `startDate 无法解析：${startRaw}` }
      }
    } else {
      from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    }
    if (endRaw) {
      to = new Date(endRaw)
      if (Number.isNaN(to.getTime())) {
        return { status: 'failed', error: `endDate 无法解析：${endRaw}` }
      }
      to = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) // 含当天全天
    } else {
      to = now
    }

    const service = new DiaryService()
    const folderId = stringifyValue(cfg.folderId).trim() || undefined
    const resp = await service.getEntriesByDateRange(from.toISOString(), to.toISOString(), folderId)
    if (!resp.success) {
      return { status: 'failed', error: resp.error ?? '拉取日记失败' }
    }

    const entries = resp.data ?? []
    // 防爆量：最多 200 篇 / 素材总长 30000 字符（预览已截 200 字，正常远小于上限）
    const selected = entries.slice(0, 200)
    const sections: string[] = []
    let totalChars = 0
    for (const e of selected) {
      const date = new Date(e.createdAt)
      const dateLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const tags = (e.tags ?? []).length > 0 ? `（标签：${(e.tags ?? []).join('、')}）` : ''
      const section = `### ${dateLabel} ${e.title}${tags}\n${(e.preview || '').trim() || '（无正文）'}`
      if (totalChars + section.length > 30000) break
      sections.push(section)
      totalChars += section.length
    }

    const header = `# 复盘素材（${new Date(from)} ~ ${new Date(to)}，共 ${entries.length} 篇）`
    const content = sections.length > 0 ? `${header}\n\n${sections.join('\n\n')}\n` : `${header}\n\n（该时段没有日记）\n`

    return {
      status: 'succeeded',
      output: {
        content,
        count: sections.length,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    }
  },
}

/** 日记节点集合 */
export const DIARY_NODE_HANDLERS: WorkflowNodeHandler[] = [saveDiaryNode, collectDiaryNode]
