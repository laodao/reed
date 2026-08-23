/**
 * 工作流定义触发器更新测试（应用详情页「配置定时」入口）
 * @module tests/workflow/workflow-definition-triggers
 * @description updateTriggers：仅更新触发器（不改图/不 +1 版本）、校验失败拒绝、
 *              定义不存在报错、注入调度器钩子时刷新调度。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WorkflowDefinitionService } from '@core/modules/workflow/workflow-definition.service'
import type { WorkflowTrigger } from '@shared/types/workflow.types'

class StubRepo {
  def: any = null
  updateCalls: Array<{ id: string; patch: any }> = []
  async getById(id: string) { return this.def }
  async update(id: string, patch: any) {
    this.updateCalls.push({ id, patch })
    return this.def
  }
  async updateTriggersOnly(id: string, patch: any) {
    this.updateCalls.push({ id, patch })
    if (this.def) this.def.triggers = patch.triggers
    return this.def
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

describe('WorkflowDefinitionService.updateTriggers', () => {
  let repo: StubRepo
  let service: WorkflowDefinitionService

  beforeEach(() => {
    const s = setup()
    repo = s.repo
    service = s.service
    repo.def = { id: 'def-1', name: '早报', triggers: [], publishedVersion: 1, draftGraph: { version: 1, nodes: [], edges: [] } }
  })

  it('成功更新：triggers 落库 + 清调度状态 + 不 +1 版本（不改图）', async () => {
    const triggers: WorkflowTrigger[] = [{ type: 'cron', expression: '0 8 * * *', preset: 'daily', enabled: true }]
    const result = await service.updateTriggers('def-1', triggers)
    expect(result.success).toBe(true)
    expect(repo.updateCalls.length).toBe(1)
    const patch = repo.updateCalls[0].patch
    expect(patch.triggers).toEqual(triggers)
    expect(patch.nextFireAt).toBeNull()
    expect(patch.lastFireAt).toBeNull()
    // 关键：不修改 publishedVersion / publishedGraph（与 publish 不同）
    expect(patch.publishedVersion).toBeUndefined()
    expect(patch.publishedGraph).toBeUndefined()
  })

  it('V1 单 cron 限制：多个启用 cron 拒绝', async () => {
    const triggers: WorkflowTrigger[] = [
      { type: 'cron', expression: '0 8 * * *', enabled: true },
      { type: 'cron', expression: '0 9 * * *', enabled: true },
    ]
    const result = await service.updateTriggers('def-1', triggers)
    expect(result.success).toBe(false)
    expect(result.error).toContain('只能启用 1 个')
    expect(repo.updateCalls.length).toBe(0)
  })

  it('cron 表达式非法拒绝', async () => {
    const triggers: WorkflowTrigger[] = [{ type: 'cron', expression: 'not-a-cron', enabled: true }]
    const result = await service.updateTriggers('def-1', triggers)
    expect(result.success).toBe(false)
    expect(result.error).toContain('无效')
    expect(repo.updateCalls.length).toBe(0)
  })

  it('定义不存在报错', async () => {
    repo.def = null
    const result = await service.updateTriggers('nope', [])
    expect(result.success).toBe(false)
    expect(result.error).toContain('不存在')
  })

  it('注入调度器钩子时刷新调度（recomputeOne）', async () => {
    const recomputeOne = vi.fn(async () => {})
    service.setTriggerScheduler({ recomputeOne })
    const result = await service.updateTriggers('def-1', [{ type: 'cron', expression: '0 8 * * *', enabled: true }])
    expect(result.success).toBe(true)
    expect(recomputeOne).toHaveBeenCalledWith('def-1')
  })

  it('停用 cron（enabled=false）同样落库并清调度', async () => {
    const result = await service.updateTriggers('def-1', [{ type: 'cron', expression: '0 8 * * *', enabled: false }])
    expect(result.success).toBe(true)
    expect(repo.updateCalls[0].patch.triggers).toEqual([{ type: 'cron', expression: '0 8 * * *', enabled: false }])
  })

  it('内置定义允许更新触发器（定时是全局调度配置；走 updateTriggersOnly）', async () => {
    repo.def = { id: 'builtin_def_x', name: '内置', triggers: [], publishedVersion: 1, isBuiltin: true }
    const result = await service.updateTriggers('builtin_def_x', [{ type: 'cron', expression: '0 8 * * *', preset: 'daily', enabled: true }])
    expect(result.success).toBe(true)
    expect(repo.updateCalls[0].id).toBe('builtin_def_x')
    expect(repo.def.triggers).toEqual([{ type: 'cron', expression: '0 8 * * *', preset: 'daily', enabled: true }])
  })
})
