/**
 * 技能蒸馏节点测试（skill-distill：SkillDistillService 的薄适配）
 * @module tests/unit/core/platform/workflow/skill-distill-node
 * @description mock skill-distill-registry（getSkillDistillService 注入假服务），
 *              断言：validateConfig、execute 的快照→输出映射（成功/取消/失败）、
 *              进度接线（onProgress → emitProgress）、模型覆盖时新建 runner。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const executeMock = vi.fn()

vi.mock('@core/platform/workflow/skills/skill-distill-registry', () => ({
  getSkillDistillService: () => ({ execute: executeMock }),
}))

import { SKILL_DISTILL_NODE_HANDLERS } from '@core/platform/workflow/nodes/skill-distill-nodes'
import type { WorkflowNodeContext } from '@core/platform/workflow/engine/node-handler'

const node = SKILL_DISTILL_NODE_HANDLERS[0]!

function makeCtx(config: Record<string, unknown>): WorkflowNodeContext {
  const progress: Array<{ progress: number; message?: string }> = []
  return {
    runId: 'run-1',
    nodeId: 'distill1',
    config,
    signal: new AbortController().signal,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    emitProgress: (p: number, m?: string) => progress.push({ progress: p, message: m }),
  } as never as WorkflowNodeContext
}

function doneSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'distill_x',
    status: 'done',
    stage: 'done',
    progress: 100,
    message: '已生成技能「测试技能」（my-skill）',
    contentType: 'auto',
    detectedType: 'style',
    stats: { chunksTotal: 3, chunksDone: 3, llmCalls: 4, sourceChars: 9000, notesChars: 5000, outputChars: 4000, repairPasses: 1 },
    issues: [{ level: 'warn', code: 'body-over-budget', message: '正文偏长' }],
    resultSkillId: 'my-skill',
    resultSkillName: '测试技能',
    resultSkillDescription: '测试描述；当需要时使用',
    createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  executeMock.mockReset()
})

describe('skill-distill 节点', () => {
  it('validateConfig：sourceText 必填、contentType 限定枚举', () => {
    expect(node.validateConfig({})).toHaveLength(1)
    expect(node.validateConfig({ sourceText: '内容' })).toEqual([])
    expect(node.validateConfig({ sourceText: '内容', contentType: 'poem' })).toHaveLength(1)
    expect(node.validateConfig({ sourceText: '内容', contentType: 'style' })).toEqual([])
  })

  it('成功：请求组装正确（nameHint/hints 透传），输出映射 snapshot 字段', async () => {
    executeMock.mockResolvedValue(doneSnapshot())
    const ctx = makeCtx({
      sourceText: '待蒸馏全文',
      contentType: 'style',
      hints: '侧重决策规则',
      nameHint: 'luke-style',
    })
    const r = await node.execute(ctx)
    expect(r.status).toBe('succeeded')
    const output = (r as { output: Record<string, unknown> }).output
    expect(output).toMatchObject({
      skillId: 'my-skill',
      skillName: '测试技能',
      description: '测试描述；当需要时使用',
      detectedType: 'style',
    })
    expect((output.issues as unknown[]).length).toBe(1)
    expect((output.stats as Record<string, unknown>).llmCalls).toBe(4)
    // 请求组装：text/contentType/hints/nameHint 逐项透传
    const req = executeMock.mock.calls[0][0]
    expect(req).toMatchObject({ inputType: 'text', text: '待蒸馏全文', contentType: 'style', hints: '侧重决策规则', nameHint: 'luke-style' })
    // 进度接线：onProgress → emitProgress（终态 100）
    const opts = executeMock.mock.calls[0][1]
    expect(opts.signal).toBeDefined()
    opts.onProgress({ progress: 42, message: '阅读中' })
    opts.onProgress({ progress: 100, message: '完成' })
  })

  it('取消 → failed 不可重试；审计失败 → failed 可重试', async () => {
    executeMock.mockResolvedValue(doneSnapshot({ status: 'cancelled', resultSkillId: undefined }))
    const cancelled = await node.execute(makeCtx({ sourceText: 'x' }))
    expect(cancelled).toMatchObject({ status: 'failed', retryable: false })

    executeMock.mockResolvedValue(doneSnapshot({ status: 'failed', error: '审计未通过（1 个 error）：孤儿卡片', resultSkillId: undefined }))
    const failed = await node.execute(makeCtx({ sourceText: 'x' }))
    expect(failed).toMatchObject({ status: 'failed', retryable: true })
    expect((failed as { error: string }).error).toContain('审计未通过')
  })

  it('服务抛异常 → failed 可重试（LLM 临时性失败交引擎重试）', async () => {
    executeMock.mockRejectedValue(new Error('模型输出无法解析为 JSON'))
    const r = await node.execute(makeCtx({ sourceText: 'x' }))
    expect(r.status).toBe('failed')
    expect((r as { retryable?: boolean }).retryable).toBe(true)
    expect((r as { error: string }).error).toContain('无法解析')
  })
})
