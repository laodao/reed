/**
 * 应用定义服务测试（片1）：创建/幂等/渠道/分享/级联删除/聚合
 * @module tests/app/app-definition
 */
import { describe, it, expect, beforeAll } from 'vitest'

import { AppDefinitionService } from '@core/modules/app/app-definition.service'
import { APPLICATION_SOURCE_KINDS } from '@shared/types/app.types'

// ---- 内存假仓库（结构与真仓库公共方法对齐的最小子集） ----
class MemAppRepo {
  rows: Map<string, any> = new Map()
  seq = 0
  async findById(id: string) { return this.rows.get(id) ?? null }
  async findBySource(sourceKind: string, sourceId: string) {
    return [...this.rows.values()].find(r => r.sourceKind === sourceKind && r.sourceId === sourceId) ?? null
  }
  async create(i: any) {
    // 模拟 TypeORM save 语义：undefined 字段不落库（走 DB 默认值），
    // 避免 ...i 展开把显式 undefined 覆盖掉本仓库的默认值（channelSession=1 等）
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(i ?? {})) if (v !== undefined) clean[k] = v
    const id = `app_${++this.seq}`
    const row = { id, userId: 'u1', sourceKind: APPLICATION_SOURCE_KINDS.workflow,
      channelSession: 1, channelShare: 0, channelApi: 1, enabled: 1, shareToken: null, createdAt: new Date(), updatedAt: new Date(), ...clean }
    this.rows.set(id, row)
    return { ...row }
  }
  async update(id: string, patch: any) {
    const row = this.rows.get(id)
    if (!row) return null
    Object.assign(row, patch, { updatedAt: new Date() })
    return { ...row }
  }
  async delete(id: string) { return this.rows.delete(id) ? 1 : 0 }
  async listApp() { return { items: [...this.rows.values()], total: this.rows.size } }
  async findByShareToken(token: string) {
    return [...this.rows.values()].find(r => r.shareToken === token && r.enabled === 1 && (r.channelShare ?? 0) === 1) ?? null
  }
}
class MemSessionRepo {
  rows: Map<string, any> = new Map()
  deletedByApp: string[] = []
  async listByApp(appId: string) {
    return [...this.rows.values()].filter(r => r.appId === appId)
  }
  async countByApp(appId: string) {
    return [...this.rows.values()].filter(r => r.appId === appId).length
  }
  async countByAppIds(appIds: string[]) {
    const m = new Map<string, number>()
    for (const id of appIds) m.set(id, [...this.rows.values()].filter(r => r.appId === id).length)
    return m
  }
  async deleteByApp(appId: string) { this.deletedByApp.push(appId); return 0 }
}
class MemDefs {
  rows: Map<string, any> = new Map()
  async getById(id: string) { return this.rows.get(id) ?? null }
}
class MemMessages {
  deleted: string[] = []
  async deleteByDialogId(dialogId: string) { this.deleted.push(dialogId); return 0 }
}

function setup() {
  const apps = new MemAppRepo()
  const sessions = new MemSessionRepo()
  const defs = new MemDefs()
  const messages = new MemMessages()
  const service = new AppDefinitionService(apps as any, sessions as any, defs as any, messages as any)
  return { apps, sessions, defs, messages, service }
}

function def(id: string, publishedVersion = 1) {
  return { id, name: `工作流${id}`, publishedVersion, publishedGraph: { version: 1, nodes: [{ id: 'start', type: 'start', config: {} }], edges: [] }, userId: 'u1' }
}

describe('AppDefinitionService：createFromWorkflow', () => {
  it('已发布工作流 → 创建应用（sourceVersion 快照 + 默认渠道）', async () => {
    const { defs, service } = setup()
    defs.rows.set('d1', def('d1', 3))
    const app = await service.createFromWorkflow('d1')
    expect(app).toMatchObject({ sourceId: 'd1', sourceVersion: 3, channelSession: 1, channelApi: 1, enabled: 1 })
  })

  it('未发布（publishedVersion=0）→ 抛"只有已发布"', async () => {
    const { defs, service } = setup()
    defs.rows.set('d2', def('d2', 0))
    await expect(service.createFromWorkflow('d2')).rejects.toThrow('发布')
  })

  it('同定义重复创建 → 幂等返回既有（不二次建）', async () => {
    const { defs, apps, service } = setup()
    defs.rows.set('d1', def('d1'))
    const first = await service.createFromWorkflow('d1')
    const second = await service.createFromWorkflow('d1')
    expect(second.id).toBe(first.id)
    expect(apps.rows.size).toBe(1)
  })

  it('同定义重复创建且已发布新版本 → 幂等返回既有并更新 sourceVersion（版本演进，不新增应用）', async () => {
    const { defs, apps, service } = setup()
    defs.rows.set('d1', def('d1', 2))
    const first = await service.createFromWorkflow('d1')
    expect(first.sourceVersion).toBe(2)
    // 工作流发布 v3 后再创建 → 应用跟随版本（本体不变）
    defs.rows.set('d1', def('d1', 3))
    const second = await service.createFromWorkflow('d1')
    expect(second.id).toBe(first.id)
    expect(second.sourceVersion).toBe(3)
    expect(apps.rows.size).toBe(1)
  })

  it('定义不存在 → 抛错', async () => {
    const { service } = setup()
    await expect(service.createFromWorkflow('ghost')).rejects.toThrow('不存在')
  })
})

describe('AppDefinitionService：渠道与启停', () => {
  it('updateChannels 只改传入字段，其余不变', async () => {
    const { apps, service } = setup()
    apps.rows.set('a1', { id: 'a1', userId: 'u1', channelSession: 1, channelShare: 0, channelApi: 1, enabled: 1, shareToken: null })
    const app = await service.updateChannels('a1', { channelShare: 1 })
    expect(app!.channelShare).toBe(1)
    expect(app!.channelSession).toBe(1)   // 未传字段不碰
    expect(app!.channelApi).toBe(1)
  })

  it('setEnabled(false) → enabled=0', async () => {
    const { apps, service } = setup()
    apps.rows.set('a1', { id: 'a1', userId: 'u1', channelSession: 1, enabled: 1, shareToken: null })
    const app = await service.setEnabled('a1', false)
    expect(app!.enabled).toBe(0)
  })
})

describe('AppDefinitionService：分享令牌', () => {
  it('enableShare 生成 64 位 hex 且幂等（重复启用原样）；disableShare 清除', async () => {
    const { apps, service } = setup()
    apps.rows.set('a1', { id: 'a1', userId: 'u1', channelSession: 1, enabled: 1, shareToken: null })
    const r1 = await service.enableShare('a1')
    expect(r1!.shareToken).toMatch(/^[0-9a-f]{64}$/)
    const r2 = await service.enableShare('a1')
    expect(r2!.shareToken).toBe(r1!.shareToken)
    const d = await service.disableShare('a1')
    expect(d!.shareToken).toBeNull()
  })

  it('getByShareToken：channel_share=0 或 enabled=0 → null；合法 → 返回', async () => {
    const { apps, service } = setup()
    apps.rows.set('a1', { id: 'a1', userId: 'u1', channelSession: 1, enabled: 1, channelShare: 0, shareToken: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })
    apps.rows.set('a2', { id: 'a2', userId: 'u1', channelSession: 1, enabled: 0, channelShare: 1, shareToken: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' })
    apps.rows.set('a3', { id: 'a3', userId: 'u1', channelSession: 1, enabled: 1, channelShare: 1, shareToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
    expect(await service.getByShareToken('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBeNull()
    expect(await service.getByShareToken('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')).toBeNull()
    expect((await service.getByShareToken('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))?.id).toBe('a3')
  })
})

describe('AppDefinitionService：级联删除与聚合', () => {
  it('deleteApp 级联删会话与消息', async () => {
    const { apps, sessions, messages, service } = setup()
    apps.rows.set('a1', { id: 'a1', userId: 'u1', shareToken: null })
    sessions.rows.set('s1', { id: 's1', appId: 'a1' })   // 级联删除要删的会话
    await service.deleteApp('a1')
    expect(sessions.deletedByApp).toContain('a1')
    expect(messages.deleted).toContain('s1')   // 会话 id 即 dialog_id
    expect(apps.rows.size).toBe(0)
  })

  it('listApps 聚合 sessionCount', async () => {
    const { apps, sessions, service } = setup()
    apps.rows.set('a1', { id: 'a1', userId: 'u1' })
    apps.rows.set('a2', { id: 'a2', userId: 'u1' })
    sessions.rows.set('s1', { appId: 'a1' })
    sessions.rows.set('s2', { appId: 'a1' })
    const { items } = await service.listApps({ page: 1, pageSize: 20 })
    expect(items.find(a => a.id === 'a1')!.sessionCount).toBe(2)
    expect(items.find(a => a.id === 'a2')!.sessionCount).toBe(0)
  })
})