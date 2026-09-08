/**
 * EP Agent 工具集单测（M6.5-a，35 号 subtasks/ep-1）
 * - 懒注册幂等 + pack 命名空间
 * - 共享注册形态：缺项目上下文必须拒绝（聊天宿主不可误调）
 * - skipped/错误/越权路径（mock computeEpProductionState + fake db，零 API 成本）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import { registerCoreDatabaseManager, type ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { registerEventEmitter } from '@core/interfaces/event.interface'
import { registerEpAgentTools, buildEpConfirmChoiceDef, EP_AGENT_PACK_ID } from '@core/platform/episode-production/agent/ep-agent-tools'

// computeEpProductionState 可控化（依赖检查/重算断言）；checkEpActionDependency 保持真实实现
const computeStateMock = vi.hoisted(() => vi.fn())
vi.mock('@core/platform/episode-production/agent/ep-agent-deps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/platform/episode-production/agent/ep-agent-deps')>()
  return { ...actual, computeEpProductionState: (...args: unknown[]) => computeStateMock(...args) }
})

const noScriptState = {
  episode: { id: 'e1', hasScript: false },
  scenes: { total: 0, countWithBindings: 0, locations: [] },
  storyboards: { total: 0, scenesCovered: 0, scenesTotal: 0 },
  assets: { characters: { count: 0, names: [] }, locations: { count: 0, names: [] }, items: { count: 0, names: [] } },
}
const withScriptState = {
  ...noScriptState,
  episode: { id: 'e1', hasScript: true },
  scenes: { total: 1, countWithBindings: 0, locations: [] },
  assets: { characters: { count: 1, names: ['张三'] }, locations: { count: 0, names: [] }, items: { count: 0, names: [] } },
}

/** fake db：可按用例覆写 binding 仓库 */
const fakeDb: any = {
  dataSource: {},
  videoEpisodes: { getById: vi.fn().mockResolvedValue({ projectId: 'p1' }) },
  characterBindings: { getById: vi.fn() },
  locationBindings: { getById: vi.fn() },
  itemBindings: { getById: vi.fn() },
}

function mkRegistry() {
  const registry = new AgentToolRegistry()
  registerEpAgentTools(registry)
  return registry
}

beforeEach(() => {
  computeStateMock.mockReset()
  computeStateMock.mockResolvedValue(noScriptState)
  fakeDb.characterBindings.getById.mockReset()
  fakeDb.locationBindings.getById.mockReset()
  fakeDb.itemBindings.getById.mockReset()
  registerCoreDatabaseManager(() => fakeDb as ICoreDatabaseManager)
  // 事件总线（ctx.emit 经 emitEpAgentEvent → getEventEmitter）：测试注册内存 fake
  const listeners = new Set<(e: unknown) => void>()
  registerEventEmitter(() => ({
    on: (_c: string, fn: (e: unknown) => void) => { listeners.add(fn) },
    off: (_c: string, fn: (e: unknown) => void) => { listeners.delete(fn) },
    emit: (_c: string, e: unknown) => { for (const fn of [...listeners]) fn(e) },
  }) as never)
})

const errMsg = (res: { ok: boolean; error?: unknown }) => String((res.error as { message?: string } | undefined)?.message ?? res.error)

describe('ep-agent-tools 共享注册（M6.5-a）', () => {
  it('懒注册幂等：重复注册不重复；9 动作+choice 工具带 pack 全名', () => {
    const registry = new AgentToolRegistry()
    registerEpAgentTools(registry)
    registerEpAgentTools(registry)
    const names = registry.listSpecs({ packId: EP_AGENT_PACK_ID }).map((s) => s.name)
    expect(names).toHaveLength(10)
    expect(names).toContain('pack:ep-agent:generate_script')
    expect(names).toContain('pack:ep-agent:ep_confirm_choice')
    expect(new Set(names).size).toBe(10)
  })

  it('ep_confirm_choice：需审批注册；未选择/越候选清单被拒、有效选择回显（直调 execute）', async () => {
    const registry = mkRegistry()
    const specs = registry.listSpecs({ packId: EP_AGENT_PACK_ID }).find((s) => s.name === 'pack:ep-agent:ep_confirm_choice')
    expect(specs?.requiresApproval).toBe(true) // 挂起语义（EP-2 通路在宿主桥接）
    const def = buildEpConfirmChoiceDef()
    const ctx = { scopeId: 's1', rawInput: '', logContext: { projectId: 'p1', episodeId: 'e1' } } as never
    // 模型首呼（无 selected）→ 明确等待语义
    await expect(def.execute({ actionType: 'generate_char_asset', param: 'name', choices: ['张三', '李四'] } as never, ctx)).rejects.toThrow('等待用户选择')
    // selected 不在候选清单 → 拒绝
    await expect(def.execute({ actionType: 'generate_char_asset', param: 'name', choices: ['张三', '李四'], selected: '王五' } as never, ctx)).rejects.toThrow('不在候选清单')
    // 有效选择 → 回显
    const ok = await def.execute({ actionType: 'generate_char_asset', param: 'name', choices: ['张三', '李四'], selected: '张三' } as never, ctx)
    expect((ok as { data: { data: { selected: string } } }).data.data.selected).toBe('张三')
  })

  it('缺项目上下文必须拒绝（聊天宿主不可误调——共享注册红线）', async () => {
    const registry = mkRegistry()
    const res = await registry.execute({ toolName: 'pack:ep-agent:generate_script', args: {} })
    expect(res.ok).toBe(false)
    expect(errMsg(res)).toContain('缺少剧集上下文')
  })

  it('skipped 路径：依赖不满足不执行不重算，摘要进结果', async () => {
    const registry = mkRegistry()
    const res = await registry.execute({
      toolName: 'pack:ep-agent:split_scenes',
      args: {},
      context: { projectId: 'p1', episodeId: 'e1' },
    })
    expect(res.ok).toBe(true)
    const data = (res.data as { data: { status: string; message: string } }).data
    expect(data.status).toBe('skipped')
    expect(data.message).toContain('缺少')
    // 依赖检查前取一次状态；skipped 不重算 → 恰好 1 次
    expect(computeStateMock).toHaveBeenCalledTimes(1)
  })

  it('成功路径后重算生产状态（#49 同轮依赖语义）', async () => {
    const registry = mkRegistry()
    // generate_storyboards 依赖场景；fake db 让 execute 报错也没关系——
    // 这里只验证"依赖通过后"状态被重算（调用 ≥2 次：前置 1 + 重算 1）
    computeStateMock.mockResolvedValue(withScriptState)
    await registry.execute({
      toolName: 'pack:ep-agent:split_scenes',
      args: { scriptId: 'sc-1' },
      context: { projectId: 'p1', episodeId: 'e1' },
    })
    expect(computeStateMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('错误路径：执行失败 → {ok:false} 带原因（管线收口，不裸穿）', async () => {
    const registry = mkRegistry()
    const res = await registry.execute({
      toolName: 'pack:ep-agent:generate_char_asset',
      args: { name: '张三' },
      context: { projectId: 'p1', episodeId: 'e1' },
    })
    expect(res.ok).toBe(false)
    expect(errMsg(res).length).toBeGreaterThan(0)
  })

  it('越权：update_entity 的 id 指向他项目资产必须拒绝（评审 P2-4）', async () => {
    fakeDb.characterBindings.getById.mockResolvedValue({ id: 'b1', projectId: 'other-project' })
    const registry = mkRegistry()
    computeStateMock.mockResolvedValue(withScriptState)
    const res = await registry.execute({
      toolName: 'pack:ep-agent:update_entity',
      args: { type: 'character', id: 'b1', patch: { name: '改' } },
      context: { projectId: 'p1', episodeId: 'e1' },
    })
    expect(res.ok).toBe(false)
    expect(errMsg(res)).toContain('越权')
  })
})
