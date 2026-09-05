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

/** 日记节点集合 */
export const DIARY_NODE_HANDLERS: WorkflowNodeHandler[] = [saveDiaryNode]
