/**
 * skill-call 节点测试：技能解析、{{param.xxx}} 参数渲染、references 拼接、AI 调用透传
 * @module tests/unit/core/modules/workflow/skill-call-node
 * @description mock skill-registry（getSkillService）与 ai-call（callAIStream）；
 *              校验 validateConfig、成功链路输出、缺参告警、技能不存在/禁用模型调用失败。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const callAIStreamMock = vi.fn()
vi.mock('@core/services/ai-call', () => ({
  callAIStream: (...a: any[]) => callAIStreamMock(...a),
  callVLM: vi.fn(),
  toImageDataUrl: vi.fn(),
}))
vi.mock('@core/modules/workflow/skills/skill-registry', () => ({
  getSkillService: vi.fn(),
}))

import { SKILL_NODE_HANDLERS } from '@core/modules/workflow/nodes/skill-nodes'
import { getSkillService } from '@core/modules/workflow/skills/skill-registry'
import type { WorkflowNodeContext } from '@core/modules/workflow/engine/node-handler'

const handler = SKILL_NODE_HANDLERS[0]
const svcMock = vi.mocked(getSkillService)

const makeSkill = (over: Record<string, unknown> = {}) => ({
  id: 'short-video-script',
  name: '短视频脚本',
  description: '生成短视频脚本',
  category: '内容创作',
  source: 'builtin',
  dirPath: null,
  inputs: [],
  systemPrompt: '你是编导，风格：{{param.style}}',
  body: '素材：{{param.material}}，时长 {{param.duration}} 秒',
  modelInvocable: true,
  ...over,
})

const makeCtx = (config: Record<string, unknown>): WorkflowNodeContext => {
  const warns: string[] = []
  return {
    runId: 'run_1', nodeId: 'skill1', nodeType: 'skill-call' as never, config,
    signal: new AbortController().signal,
    logger: { debug() {}, info() {}, warn: (m: string) => warns.push(m), error() {} },
    emitProgress: () => {},
    resolveTemplate: (t: string) => t as never,
    warns,
  } as never
}

beforeEach(() => { vi.clearAllMocks(); callAIStreamMock.mockResolvedValue({ content: '成片', usage: { promptTokens: 10, completionTokens: 5 } }) })

describe('skill-call：validateConfig', () => {
  it('缺 skillId → 报错；合法 → 通过', () => {
    expect(handler.validateConfig({} as never)).toEqual(expect.arrayContaining([expect.stringContaining('技能')]))
    expect(handler.validateConfig({ skillId: 'short-video-script' } as never)).toEqual([])
  })
})

describe('skill-call：execute', () => {
  it('成功：解析技能 → 渲染 {{param.xxx}} → 调用 AI → 输出 content/skillId/usage', async () => {
    svcMock.mockReturnValue({ resolveSkill: vi.fn().mockReturnValue(makeSkill()) } as never)
    const ctx = makeCtx({
      skillId: 'short-video-script',
      inputs: [
        { key: 'material', value: '孙宇晨起诉景甜' },
        { key: 'duration', value: '60' },
        { key: 'style', value: '口播' },
      ],
      providerConfigId: 'pc_1',
      modelId: 'qwen3.5-plus',
      temperature: 0.5,
    })
    const r = await handler.execute(ctx)
    expect(r.status).toBe('succeeded')
    if (r.status === 'succeeded') {
      expect(r.output.content).toBe('成片')
      expect(r.output.skillId).toBe('short-video-script')
    }
    // AI 调用参数：参数已替换进 body/systemPrompt，模型配置透传
    const [callArgs] = callAIStreamMock.mock.calls[0]
    expect(callArgs.prompt).toContain('素材：孙宇晨起诉景甜，时长 60 秒')
    expect(callArgs.prompt).not.toContain('{{param.')
    expect(callArgs.systemPrompt).toBe('你是编导，风格：口播')
    expect(callArgs.providerConfigId).toBe('pc_1')
    expect(callArgs.modelId).toBe('qwen3.5-plus')
    expect(callArgs.temperature).toBe(0.5)
  })

  it('references 拼入正文（参考资料块）', async () => {
    svcMock.mockReturnValue({
      resolveSkill: vi.fn().mockReturnValue(makeSkill({
        references: [{ name: 'style.md', content: '风格：犀利' }],
      })),
    } as never)
    const r = await handler.execute(makeCtx({
      skillId: 'x',
      inputs: [{ key: 'material', value: '素材A' }, { key: 'duration', value: '30' }],
    }))
    expect(r.status).toBe('succeeded')
    const [callArgs] = callAIStreamMock.mock.calls[0]
    expect(callArgs.prompt).toContain('[style.md]')
    expect(callArgs.prompt).toContain('风格：犀利')
    expect(callArgs.prompt).toContain('===== 参考资料 =====')
  })

  it('缺参数 → 按空处理并告警（不阻断执行）', async () => {
    svcMock.mockReturnValue({ resolveSkill: vi.fn().mockReturnValue(makeSkill()) } as never)
    const ctx = makeCtx({ skillId: 'x', inputs: [{ key: 'material', value: '只有素材' }] })
    await handler.execute(ctx)
    const warns = (ctx as never as { warns: string[] }).warns
    expect(warns.some(w => w.includes('duration'))).toBe(true)
    const [callArgs] = callAIStreamMock.mock.calls[0]
    expect(callArgs.prompt).toContain('时长  秒') // 缺参按空
  })

  it('技能不存在 → failed；模型禁用调用 → failed', async () => {
    svcMock.mockReturnValue({ resolveSkill: vi.fn().mockReturnValue(null) } as never)
    let r = await handler.execute(makeCtx({ skillId: 'nope' }))
    expect(r.status).toBe('failed')
    expect((r as { error: string }).error).toContain('不存在')

    svcMock.mockReturnValue({ resolveSkill: vi.fn().mockReturnValue(makeSkill({ modelInvocable: false })) } as never)
    r = await handler.execute(makeCtx({ skillId: 'x' }))
    expect(r.status).toBe('failed')
    expect((r as { error: string }).error).toContain('禁用')
  })

  it('AI 调用失败 → failed（错误信息透传）', async () => {
    svcMock.mockReturnValue({ resolveSkill: vi.fn().mockReturnValue(makeSkill()) } as never)
    callAIStreamMock.mockRejectedValue(new Error('provider 503'))
    const r = await handler.execute(makeCtx({ skillId: 'x', inputs: [{ key: 'material', value: 'm' }, { key: 'duration', value: '10' }] }))
    expect(r.status).toBe('failed')
    expect((r as { error: string }).error).toContain('provider 503')
  })
})
