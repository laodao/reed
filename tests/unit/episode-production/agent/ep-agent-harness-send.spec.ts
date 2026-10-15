/**
 * EpAgentHarnessService.sendMessage 链路回归
 *
 * 背景：doSend 5b 步曾引用作用域外的裸 `db`（buildPromptContextForEpisode(db, episodeId)），
 * 运行时抛 ReferenceError: db is not defined——此前被 standalone 项目更早的会话外键失败
 * （fix-lw-design-conversations-project-fk）掩盖，外键修复后流程推进至此才暴露。
 * 本测试桩掉全部重 IO 依赖，驱动 sendMessage 完整走一轮（runTurn 桩返回固定结果），断言：
 * ①不抛 ReferenceError；②用户/助手消息双落库；③standalone 项目以视频项目 id 作容器标签；
 * ④scope（界面域，2026-10-15）贯通：会话 id / 事件通道按域分叉，各界面独立会话。
 */
import { describe, it, expect, vi } from 'vitest'

const addCalls: Array<{ conversationId: string; msg: { role: string; content: string }; opts?: { projectId?: string } }> = []
/** 事件通道构造记录（scope 贯通断言用） */
const channelCalls: Array<{ projectId: string; episodeId: string; scope?: string }> = []

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({ dataSource: { __mock: true } }),
}))
vi.mock('@core/interfaces/event.interface', () => ({
  getEventEmitter: () => ({ emit: vi.fn(), tapEvents: () => () => {} }),
}))
vi.mock('@core/platform/workflow/nodes/agent-loop-node', () => ({
  getAgentLoopHarness: () => ({
    registry: { listSpecs: () => [], buildToolDefs: () => ({}) },
    resolveModel: () => ({}),
    trajectoryRepo: null,
  }),
}))
vi.mock('@core/platform/workflow/workflow-boot', () => ({ getMemoryFlywheel: () => null }))
vi.mock('@core/platform/agent-runtime', async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>()
  return {
    ...orig,
    createHostKit: () => ({
      runTurn: async () => ({ stopReason: 'done', output: '好的，已为当前角色生成定妆图。', iterations: 1 }),
    }),
  }
})
vi.mock('@core/platform/agent-runtime/budget/agent-budget', () => ({
  loadAgentBudget: async () => ({ budget: { maxCalls: { overrides: {} }, maxSteps: { episode: 3 } } }),
}))
vi.mock('@core/platform/episode-production/agent/ep-agent-deps', () => ({
  computeEpProductionState: async () => ({}),
  buildEpSuggestions: () => [],
}))
vi.mock('@core/platform/episode-production/agent/ep-agent-events', () => ({
  emitEpAgentEvent: vi.fn(),
  epAgentEventChannel: (p: string, e: string, scope?: string) => {
    channelCalls.push({ projectId: p, episodeId: e, scope })
    return scope ? `ep-agent:${p}:${e}:${scope}` : `ep-agent:${p}:${e}`
  },
}))
vi.mock('@core/platform/episode-production/agent/ep-agent-tools', () => ({
  EP_AGENT_PACK_ID: 'pack:ep-agent',
  EP_TOOL_MAX_CALLS: { generate_char_asset: 3 },
  EP_CONFIRM_CHOICE_TOOL: 'ep_confirm_choice',
  registerEpAgentTools: vi.fn(),
}))
// 桩掉提示词上下文装配不影响回归目标：被修的 bug 在**实参求值**（裸 db 引用），
// 调用前即抛 ReferenceError，与被调函数实现无关
vi.mock('@core/platform/episode-production/prompts/episode-prompt-context.service', () => ({
  buildPromptContextForEpisode: vi.fn(async () => ({ stylePrompt: '测试风格' })),
}))

import { EpAgentHarnessService } from '@core/platform/episode-production/agent/ep-agent-harness.service'
import { epAgentConversationId } from '@core/platform/episode-production/agent/ep-agent-workflow.service'

/** standalone 视频项目（longWritingProjectId=null——外键报障项目的同款形态） */
function buildMockManager() {
  return {
    lwDesignMessages: {
      getByConversationId: async () => [],
      add: async (
        conversationId: string,
        msg: { role: string; content: string },
        opts?: { projectId?: string },
      ) => {
        addCalls.push({ conversationId, msg, opts })
        return { ...msg, metadata: null }
      },
    },
    providerConfigs: { getEnabled: async () => [] },
    videoProjects: { getById: async () => ({ id: 'vp-1', longWritingProjectId: null }) },
    settings: {},
  }
}

describe('EpAgentHarnessService.sendMessage 链路', () => {
  it('完整走一轮不抛 ReferenceError，用户/助手消息双落库', async () => {
    const svc = EpAgentHarnessService.getInstance(buildMockManager() as never)
    const result = await svc.sendMessage('vp-1', 'ep-1', '为当前角色生成定妆图')

    // 用户消息 + 助手回复都落库（修复前流程死在 5b，助手消息永不出现）
    expect(addCalls.map((c) => c.msg.role)).toEqual(['user', 'assistant'])
    expect(addCalls[0].msg.content).toBe('为当前角色生成定妆图')
    expect(result.assistantMessage.content).toContain('定妆图')
    expect(result.conversationId).toBe('ep-agent:ep-1')
  })

  it('standalone 项目（映射不到长文项目）以视频项目 id 作会话容器标签', async () => {
    const svc = EpAgentHarnessService.getInstance(buildMockManager() as never)
    await svc.sendMessage('vp-1', 'ep-1', '继续')

    expect(addCalls.every((c) => c.opts?.projectId === 'vp-1')).toBe(true)
  })

  it('scope（界面域）贯通：会话 id 尾接 scope，落库与事件通道同域', async () => {
    addCalls.length = 0
    channelCalls.length = 0
    const svc = EpAgentHarnessService.getInstance(buildMockManager() as never)
    const result = await svc.sendMessage('vp-1', 'ep-1', '帮我把剧本拆成场景', { scope: 'script' })

    // 会话 id：ep-agent:<episodeId>:<scope>——与无域会话（ep-agent:ep-1）互不可见
    expect(result.conversationId).toBe('ep-agent:ep-1:script')
    expect(addCalls.map((c) => c.conversationId)).toEqual(['ep-agent:ep-1:script', 'ep-agent:ep-1:script'])
    // 事件通道同域（动作摘要 tap 订阅走同一构造函数）
    expect(channelCalls).toContainEqual({ projectId: 'vp-1', episodeId: 'ep-1', scope: 'script' })
  })

  it('epAgentConversationId：scope 缺省退化为无域（存量数据兼容），scope 不含冒号约定不破坏尾段推导', () => {
    expect(epAgentConversationId('ep-1')).toBe('ep-agent:ep-1')
    expect(epAgentConversationId('ep-1', 'script')).toBe('ep-agent:ep-1:script')
    expect(epAgentConversationId('ep-1', 'asset-character')).toBe('ep-agent:ep-1:asset-character')
    expect(epAgentConversationId('ep-1', 'asset-character').split(':').pop()).toBe('asset-character')
  })
})
