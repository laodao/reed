/**
 * 工作流版本管理测试（WorkflowDefinitionService）
 * @module tests/workflow/workflow-definition-versions
 * @description publish 固化为不可变版本快照（createVersion 调用与快照内容）、
 *              listVersions 透传、restoreVersion 把历史版本应用到当前草稿。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WorkflowDefinitionService } from '@core/platform/workflow/workflow-definition.service'

class StubRepo {
  def: any = null
  versionRows: any[] = []
  updateCalls: Array<{ id: string; patch: any }> = []
  createVersionCalls: any[] = []
  async getById(id: string) { return this.def }
  async update(id: string, patch: any) {
    this.updateCalls.push({ id, patch })
    this.def = { ...this.def, ...patch }
    return this.def
  }
  async createVersion(data: any) {
    this.createVersionCalls.push(data)
    const row = { id: `ver-${data.version}`, ...data }
    this.versionRows.push(row)
    return row
  }
  async listVersions(definitionId: string) {
    return this.versionRows.filter(r => r.definitionId === definitionId).sort((a, b) => b.version - a.version)
  }
  async getVersion(id: string) {
    return this.versionRows.find(r => r.id === id) ?? null
  }
}

class StubRegistry {
  get() { return { validateConfig: () => [] as string[] } }
}

const SKELETON = {
  version: 1,
  nodes: [
    { id: 'start', type: 'start', name: '开始', position: { x: 0, y: 0 }, config: { inputs: [] } },
    { id: 'end', type: 'end', name: '结束', position: { x: 100, y: 0 }, config: {} },
  ],
  edges: [{ id: 'e1', sourceNodeId: 'start', targetNodeId: 'end', kind: 'normal' }],
}

function makeDef(over: Record<string, unknown> = {}) {
  return {
    id: 'def-1',
    userId: 'user-1',
    name: '早报',
    description: null,
    category: 'news',
    draftGraph: SKELETON,
    publishedGraph: null,
    publishedVersion: 1,
    publishedAt: null,
    triggers: [],
    settings: null,
    isBuiltin: false,
    ...over,
  }
}

function setup() {
  const repo = new StubRepo()
  const service = new WorkflowDefinitionService(repo as any, new StubRegistry() as any)
  return { repo, service }
}

describe('WorkflowDefinitionService 版本管理', () => {
  let repo: StubRepo
  let service: WorkflowDefinitionService

  beforeEach(() => {
    const s = setup()
    repo = s.repo
    service = s.service
    repo.def = makeDef()
  })

  it('publish 成功后固化版本快照（version=新发布版本，含图/触发器/设置/名称）', async () => {
    const triggers = [{ type: 'cron', expression: '0 8 * * *', preset: 'daily', enabled: true }]
    const settings = { maxOutputChars: 500000 }
    const result = await service.publish('def-1', triggers, settings)
    expect(result.success).toBe(true)
    expect(repo.createVersionCalls).toHaveLength(1)
    const snap = repo.createVersionCalls[0]
    expect(snap.definitionId).toBe('def-1')
    expect(snap.version).toBe(2) // publishedVersion 1 + 1
    expect(snap.name).toBe('早报')
    expect(snap.graph.nodes[0].id).toBe('start')
    expect(snap.triggers).toEqual(triggers)
    expect(snap.settings).toEqual(settings)
    // 发布更新
    expect(repo.updateCalls[0].patch.publishedVersion).toBe(2)
  })

  it('listVersions 透传（按版本号降序）', async () => {
    await service.publish('def-1')
    await service.publish('def-1')
    const list = await service.listVersions('def-1')
    expect(list.map(v => v.version)).toEqual([3, 2])
  })

  it('restoreVersion：历史版本应用到当前草稿（图/触发器/设置，不发布）', async () => {
    // 先发布 v2（当前草稿）
    await service.publish('def-1')
    // 篡改草稿为"错误内容"
    repo.def.draftGraph = { version: 1, nodes: [], edges: [] }
    // 模拟版本库有 v1（发布历史）
    await repo.createVersion({
      definitionId: 'def-1', version: 1, name: '早报',
      description: null, category: 'news',
      graph: SKELETON,
      triggers: [{ type: 'cron', expression: '0 8 * * *', enabled: true }],
      settings: null, createdBy: 'user-1',
    })
    const v1 = repo.versionRows.find(r => r.version === 1)!
    const result = await service.restoreVersion('def-1', v1.id)
    expect(result.success).toBe(true)
    const patch = repo.updateCalls[repo.updateCalls.length - 1].patch
    expect(patch.draftGraph.nodes[0].id).toBe('start') // 图恢复
    expect(patch.triggers).toEqual([{ type: 'cron', expression: '0 8 * * *', enabled: true }])
    // 不发布：不写 publishedGraph / 不 +1 版本
    expect(patch.publishedGraph).toBeUndefined()
    expect(patch.publishedVersion).toBeUndefined()
  })

  it('restoreVersion：版本不存在或不属于该定义 → 失败', async () => {
    const result = await service.restoreVersion('def-1', 'ver-nope')
    expect(result.success).toBe(false)
    expect(result.error).toContain('版本不存在')
  })

  it('restoreVersion：定义不存在 → 失败', async () => {
    repo.def = null
    const result = await service.restoreVersion('nope', 'ver-1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('工作流不存在')
  })
})
