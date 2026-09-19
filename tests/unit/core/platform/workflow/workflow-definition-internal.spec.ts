/**
 * 工作流内部定义（internal）行为测试
 * @module tests/workflow/workflow-definition-internal
 * @description internal 定义是业务包自动创建的运行载体（如「章节写作章法」）：
 *              列表默认过滤（includeInternal 显式放行）、创建可带 internal 标记、
 *              导入覆盖（duplicatePolicy=overwrite）不得命中 internal 行——
 *              名称是业务包幂等查找的键，被导入副本顶替会劫持章法运行。
 */
import { describe, it, expect } from 'vitest'
import { WorkflowDefinitionService } from '@core/platform/workflow/workflow-definition.service'
import { WORKFLOW_EXPORT_KIND, WORKFLOW_EXPORT_FORMAT_VERSION } from '@shared/types/workflow.types'

const GRAPH = {
  version: 1 as const,
  nodes: [
    { id: 'start', type: 'start', name: '开始', position: { x: 80, y: 200 }, config: { inputs: [] } },
    { id: 'end', type: 'end', name: '结束', position: { x: 480, y: 200 }, config: {} },
  ],
  edges: [{ id: 'e1', sourceNodeId: 'start', targetNodeId: 'end', kind: 'normal' as const }],
}

class StubRepo {
  items: any[] = []
  created: any[] = []
  updateCalls: Array<{ id: string; patch: any }> = []
  async getById(id: string) { return this.items.find(d => d.id === id) ?? null }
  async list(params: any) {
    const kw = (params.keyword ?? '').toLowerCase()
    const filtered = this.items.filter(d => !kw || d.name.toLowerCase().includes(kw))
    return { items: filtered, total: filtered.length }
  }
  async create(data: any) {
    const rec = { id: `def_${this.created.length + 1}`, publishedVersion: 0, triggers: [], ...data }
    this.created.push(rec)
    this.items.push(rec)
    return rec
  }
  async update(id: string, patch: any) {
    this.updateCalls.push({ id, patch })
    const def = this.items.find(d => d.id === id)
    if (def) Object.assign(def, patch)
    return def ?? null
  }
}

class StubRegistry {
  get() { return { validateConfig: () => [] as string[] } }
}

function setup() {
  const repo = new StubRepo()
  const service = new WorkflowDefinitionService(repo as any, new StubRegistry() as any)
  return { repo, service }
}

function exportJson(name: string): string {
  return JSON.stringify({
    kind: WORKFLOW_EXPORT_KIND,
    formatVersion: WORKFLOW_EXPORT_FORMAT_VERSION,
    name,
    description: null,
    category: null,
    graph: GRAPH,
    triggers: [],
    settings: null,
  })
}

describe('WorkflowDefinitionService internal 定义', () => {
  it('创建可带 internal 标记；service.list 透传 includeInternal 给仓库', async () => {
    const { repo, service } = setup()
    await service.create({ name: '章节写作章法', internal: true, draftGraph: GRAPH })
    expect(repo.created[0].internal).toBe(true)

    let captured: any = null
    ;(repo as any).list = async (params: any) => { captured = params; return { items: [], total: 0 } }
    await service.list({ page: 1, pageSize: 10 })
    expect(captured.includeInternal).toBeUndefined() // 默认不过滤（repo 侧 internal=0 过滤）
    await service.list({ page: 1, pageSize: 10, includeInternal: true })
    expect(captured.includeInternal).toBe(true)
  })

  it('导入 overwrite 不得命中 internal 行——重名时落到新建而不是顶替运行载体', async () => {
    const { repo, service } = setup()
    await service.create({ name: '章节写作章法', internal: true, draftGraph: GRAPH })
    repo.updateCalls = []

    const result = await service.importDefinition(exportJson('章节写作章法'), { duplicatePolicy: 'overwrite' })
    expect(result.success).toBe(true)
    // internal 行未被更新（导入覆盖跳过内部定义）
    expect(repo.updateCalls).toHaveLength(0)
    // 落到新建（副本行，用户可见）
    expect(repo.created).toHaveLength(2)
    expect(repo.created[1].internal ?? false).toBeFalsy()
  })

  it('导入 overwrite 正常命中非 internal 同名行（原有语义不变）', async () => {
    const { repo, service } = setup()
    await service.create({ name: '早报', draftGraph: GRAPH })
    repo.updateCalls = []

    const result = await service.importDefinition(exportJson('早报'), { duplicatePolicy: 'overwrite' })
    expect(result.success).toBe(true)
    expect(repo.updateCalls).toHaveLength(1)
    expect(repo.updateCalls[0].id).toBe(repo.created[0].id)
    expect(repo.created).toHaveLength(1)
  })
})
