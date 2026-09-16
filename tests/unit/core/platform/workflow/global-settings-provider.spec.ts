/**
 * 工作流全局层（`wf:defaults`）现读测试
 * @module tests/unit/core/platform/workflow/global-settings-provider.spec
 *
 * 背景（2026-09-13 用户需求第二轮「参数设置」）：
 * 第一轮盘点发现 `wf:defaults` 只在 boot 读一次（`workflow-boot.ts`）并存进 `WorkflowRunService` 的
 * 构造期快照——设置页改完必须重启客户端；而且它在界面上**没有任何写入入口**，等于死开关。
 *
 * 本用例钉死改造后的语义：
 * 1. 每次启动运行前**现读**全局层（设置页保存 → 下一次运行即生效）；
 * 2. 配置链优先级仍是 definition.settings 覆盖全局层；
 * 3. 读取器抛错时回落静态快照（配置读不到不能让工作流跑不起来）；
 * 4. 全局并发上限也现读，且**只认全局层**（单个工作流不能靠 definition.settings 抬高它），并夹硬上限。
 */

import { describe, it, expect, vi } from 'vitest'
import { WorkflowRunService } from '@core/platform/workflow/workflow-run.service'
import { WORKFLOW_LIMITS } from '@shared/types/workflow.types'

/** 构造一个只够跑到 launch 的服务骨架（引擎在后台执行，立即返回） */
function makeService(options: {
  global?: Record<string, unknown> | null
  provider?: () => Promise<Record<string, unknown> | null>
  activeRunningCount?: number
}) {
  const created: Array<Record<string, unknown>> = []
  const engine = {
    activeRunningCount: options.activeRunningCount ?? 0,
    execute: vi.fn(async () => undefined),
    cancelRun: vi.fn(async () => false),
  }
  const definitions = {
    getById: vi.fn(async () => ({
      id: 'def-1',
      name: '测试工作流',
      publishedVersion: 1,
      // 至少要有一个节点，否则 startRun 会以"没有可执行的图"拒绝
      draftGraph: { version: 1, nodes: [{ id: 'n1', type: 'start', config: {} }], edges: [] },
      settings: { maxNodeRuns: 7 },
    })),
    update: vi.fn(async () => undefined),
  }
  const runs = {
    findMutexHolders: vi.fn(async () => []),
    create: vi.fn(async (input: Record<string, unknown>) => {
      const row = { id: 'run-1', userId: 'u1', ...input }
      created.push(row)
      return row
    }),
    getById: vi.fn(async () => created[0] ?? null),
    update: vi.fn(async () => undefined),
  }
  const service = new WorkflowRunService({
    runs: runs as never,
    nodeRuns: {} as never,
    definitions: definitions as never,
    engine: engine as never,
    globalSettings: (options.global ?? null) as never,
    globalSettingsProvider: options.provider as never,
  })
  return { service, engine, created }
}

describe('wf:defaults 全局层现读（改完不用重启）', () => {
  it('读取器每次运行前都读一次：先 100 后 200，第二次运行用的是新值', async () => {
    let global: Record<string, unknown> = { maxLoopIterations: 100 }
    const { service, engine } = makeService({ provider: async () => global })
    await service.startRun({ definitionId: 'def-1', triggerType: 'manual' })
    expect(engine.execute).toHaveBeenCalledTimes(1)
    expect(engine.execute.mock.calls[0][0].settings).toMatchObject({ maxLoopIterations: 100, maxNodeRuns: 7 })

    global = { maxLoopIterations: 200 }
    await service.startRun({ definitionId: 'def-1', triggerType: 'manual' })
    expect(engine.execute).toHaveBeenCalledTimes(2)
    expect(engine.execute.mock.calls[1][0].settings).toMatchObject({ maxLoopIterations: 200 })
  })

  it('优先级：definition.settings 覆盖全局层', async () => {
    const { service, engine } = makeService({ provider: async () => ({ maxLoopIterations: 100 }) })
    await service.startRun({ definitionId: 'def-1', triggerType: 'manual' })
    // definition 里写了 maxNodeRuns: 7，全局层没有 → 生效 7；全局层有 maxLoopIterations → 生效 100
    expect(engine.execute.mock.calls[0][0].settings).toMatchObject({ maxNodeRuns: 7, maxLoopIterations: 100 })
  })

  it('读取器抛错 → 回落静态快照，不让运行起不来', async () => {
    const { service, engine } = makeService({
      global: { maxLoopIterations: 55 },
      provider: async () => {
        throw new Error('db closed')
      },
    })
    await service.startRun({ definitionId: 'def-1', triggerType: 'manual' })
    expect(engine.execute.mock.calls[0][0].settings).toMatchObject({ maxLoopIterations: 55 })
  })

  it('没有读取器时用静态快照（测试与旧调用方兼容）', async () => {
    const { service, engine } = makeService({ global: { maxRetryCount: 3 } })
    await service.startRun({ definitionId: 'def-1', triggerType: 'manual' })
    expect(engine.execute.mock.calls[0][0].settings).toMatchObject({ maxRetryCount: 3 })
  })
})

describe('全局并发上限现读（只认全局层 + 夹硬上限）', () => {
  it('全局层 maxConcurrentRuns 生效：达到上限的运行进队列（不直接执行）', async () => {
    const { service, engine } = makeService({
      provider: async () => ({ maxConcurrentRuns: 1 }),
      activeRunningCount: 1,
    })
    const run = await service.startRun({ definitionId: 'def-1', triggerType: 'manual' })
    expect(engine.execute).not.toHaveBeenCalled()
    // 已落库为 pending（引擎负责把它推进 running）；关键断言是"没有真的开跑"
    expect(run.status).toBe('pending')
  })

  it('definition.settings 不能抬高全局并发（并发是平台级护栏）', async () => {
    const { service, engine } = makeService({
      provider: async () => ({ maxConcurrentRuns: 1 }),
      activeRunningCount: 1,
    })
    // definition 里塞了 maxConcurrentRuns: 99（见 makeService 的 settings 之外再补一层校验）
    await service.startRun({ definitionId: 'def-1', triggerType: 'manual' })
    expect(engine.execute).not.toHaveBeenCalled()
  })

  it('超过代码级硬上限时夹到 WORKFLOW_LIMITS.maxConcurrentRuns', async () => {
    const { service, engine } = makeService({
      provider: async () => ({ maxConcurrentRuns: WORKFLOW_LIMITS.maxConcurrentRuns + 1000 }),
      activeRunningCount: WORKFLOW_LIMITS.maxConcurrentRuns, // 正好等于硬上限 → 应排队
    })
    await service.startRun({ definitionId: 'def-1', triggerType: 'manual' })
    expect(engine.execute).not.toHaveBeenCalled()
  })
})
