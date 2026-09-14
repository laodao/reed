/**
 * 信息来源模块 IPC 处理器（设置 → 信息来源；工作流采集节点与各业务模块的数据源）
 * @module electron/ipc/handlers/info-source.handler
 * @description 三层结构的薄适配层：
 *  - infoSourceCategory:* 来源类别（设置界面一个类别 = 一个 tab；内置「新闻来源」禁删禁改）
 *  - infoSourceTopic:*    类别内分组（内置新闻分组禁删；删除级联删其下来源）
 *  - infoSource:*         来源（名称 + URL；内置来源禁删禁改）
 *  业务规则（级联、默认分组、内置保护、入参校验）在此编排，数据访问在仓库层。
 *  与 asset.handler 同 via ipcBridge（Electron + Web 双端注册）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'

function categoryRepo() {
  const db = getCoreDatabaseManager()
  if (!db.infoSourceCategories) throw new Error('信息来源类别仓库未初始化')
  return db.infoSourceCategories
}

function topicRepo() {
  const db = getCoreDatabaseManager()
  if (!db.infoSourceTopics) throw new Error('信息来源分组仓库未初始化')
  return db.infoSourceTopics
}

function sourceRepo() {
  const db = getCoreDatabaseManager()
  if (!db.infoSources) throw new Error('信息来源仓库未初始化')
  return db.infoSources
}

/** 名称校验：非空（来源类别/分组/来源共用） */
function requireName(name: unknown, what: string): string {
  const v = String(name ?? '').trim()
  if (!v) throw new Error(`${what}名称不能为空`)
  return v
}

/** URL 校验：仅接受 http(s)，避免存入 javascript:/file: 等不可抓取地址 */
function requireHttpUrl(url: unknown): string {
  const v = String(url ?? '').trim()
  if (!/^https?:\/\//i.test(v)) throw new Error('URL 需以 http:// 或 https:// 开头')
  return v
}

export function registerInfoSourceHandlers(): void {
  // ==================== 来源类别（tab） ====================
  ipcBridge.handle('infoSourceCategory:list', () => wrap(() => categoryRepo().listAll()))
  ipcBridge.handle('infoSourceCategory:create', (_e, p: { name: string }) =>
    wrap(() => categoryRepo().create({ name: requireName(p?.name, '类别') })),
  )
  ipcBridge.handle('infoSourceCategory:update', (_e, p: { id: string; name?: string }) =>
    wrap(() =>
      categoryRepo().update(p.id, {
        name: p.name === undefined ? undefined : requireName(p.name, '类别'),
      }),
    ),
  )
  ipcBridge.handle('infoSourceCategory:delete', (_e, p: { id: string }) =>
    wrap(async () => {
      const category = await categoryRepo().findById(p.id)
      if (!category) throw new Error('类别不存在')
      if (category.isBuiltin) throw new Error('内置类别不可删除')
      // 级联：删除该类别下全部分组（含默认分组「未分组」）及其下用户自有来源。
      // 分组删除走 deleteByCategory（批量按类别删），不走带「默认分组禁删」护栏的
      // 单条 delete——否则未分组会残留成孤立分组。
      const topics = await topicRepo().list({ categoryId: p.id })
      await sourceRepo().deleteByTopics(topics.map(t => t.id))
      await topicRepo().deleteByCategory(p.id)
      return { deleted: await categoryRepo().delete(p.id) }
    }),
  )

  // ==================== 分组（类别内一级分组） ====================
  ipcBridge.handle('infoSourceTopic:list', (_e, p: { categoryId?: string }) =>
    wrap(() => topicRepo().list({ categoryId: p?.categoryId })),
  )
  ipcBridge.handle('infoSourceTopic:create', (_e, p: { categoryId: string; name: string }) =>
    wrap(async () => {
      if (!p?.categoryId) throw new Error('请先选择来源类别')
      const category = await categoryRepo().findById(p.categoryId)
      if (!category) throw new Error('来源类别不存在')
      return topicRepo().create({ categoryId: p.categoryId, name: requireName(p.name, '分组') })
    }),
  )
  ipcBridge.handle('infoSourceTopic:update', (_e, p: { id: string; name?: string; categoryId?: string }) =>
    wrap(async () => {
      const topic = await topicRepo().findById(p.id)
      if (!topic) throw new Error('分组不存在')
      if (topic.isBuiltin) throw new Error('内置分组不可修改')
      if (topic.isDefault) throw new Error('「未分组」为系统默认分组，不可改名')
      return topicRepo().update(p.id, {
        name: p.name === undefined ? undefined : requireName(p.name, '分组'),
        categoryId: p.categoryId,
      })
    }),
  )
  ipcBridge.handle('infoSourceTopic:delete', (_e, p: { id: string }) =>
    wrap(async () => {
      const topic = await topicRepo().findById(p.id)
      if (!topic) throw new Error('分组不存在')
      if (topic.isDefault) throw new Error('「未分组」为系统默认分组，不可删除')
      if (topic.isBuiltin) {
        // 内置分组：其下仍有来源时禁删（防止误删预置源目录）
        const remaining = await sourceRepo().list({ topicId: p.id })
        if (remaining.length > 0) throw new Error('内置分组仍有来源，请先删除其下来源')
      }
      // 级联删除分组下全部来源（含用户自有）
      await sourceRepo().deleteByTopic(p.id)
      return { deleted: await topicRepo().delete(p.id) }
    }),
  )

  // ==================== 来源（名称 + URL） ====================
  ipcBridge.handle(
    'infoSource:list',
    (_e, p: { categoryId?: string; topicId?: string; keyword?: string; onlyEnabled?: boolean }) =>
      wrap(() =>
        sourceRepo().list({
          categoryId: p?.categoryId,
          topicId: p?.topicId,
          keyword: p?.keyword,
          onlyEnabled: p?.onlyEnabled,
        }),
      ),
  )
  ipcBridge.handle('infoSource:get', (_e, p: { id: string }) => wrap(() => sourceRepo().findById(p.id)))
  ipcBridge.handle(
    'infoSource:create',
    (_e, p: { topicId?: string; categoryId?: string; name: string; url: string }) =>
      wrap(async () => {
        const name = requireName(p?.name, '来源')
        const url = requireHttpUrl(p?.url)
        // 未指定分组：落到类别的默认分组「未分组」（按需自动创建）——
        // 支持「这个类别不需要分组」的用法，用户不必先建分组
        let topicId = String(p?.topicId ?? '').trim()
        if (!topicId) {
          if (!p?.categoryId) throw new Error('请指定来源类别或分组')
          const category = await categoryRepo().findById(p.categoryId)
          if (!category) throw new Error('来源类别不存在')
          topicId = (await topicRepo().ensureDefault(p.categoryId)).id
        }
        return sourceRepo().create({ topicId, name, url })
      }),
  )
  ipcBridge.handle(
    'infoSource:update',
    (_e, p: { id: string; topicId?: string; categoryId?: string; name?: string; url?: string; enabled?: boolean }) =>
      wrap(async () => {
        // topicId 显式传空串 = 移入该类别的「未分组」（后端按需创建默认分组）
        let topicId: string | undefined
        if (p.topicId !== undefined) {
          const raw = String(p.topicId).trim()
          if (raw) topicId = raw
          else {
            if (!p.categoryId) throw new Error('移入「未分组」需要指定来源类别')
            const category = await categoryRepo().findById(p.categoryId)
            if (!category) throw new Error('来源类别不存在')
            topicId = (await topicRepo().ensureDefault(p.categoryId)).id
          }
        }
        return sourceRepo().update(p.id, {
          topicId,
          name: p.name === undefined ? undefined : requireName(p.name, '来源'),
          url: p.url === undefined ? undefined : requireHttpUrl(p.url),
          enabled: p.enabled,
        })
      }),
  )
  ipcBridge.handle('infoSource:delete', (_e, p: { id: string }) =>
    wrap(async () => {
      const source = await sourceRepo().findById(p.id)
      if (!source) throw new Error('来源不存在')
      if (source.isBuiltin) throw new Error('内置来源不可删除')
      return { deleted: await sourceRepo().delete(p.id) }
    }),
  )
}

/** 统一 IpcResponse 包裹 */
function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ success: true, data }))
    .catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : String(e) }))
}
