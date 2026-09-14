/**
 * 进程级限额接线测试（transcript 截断 / 工具产物上限）
 * @module tests/unit/core/platform/agent-runtime/runtime-limits-wiring.spec
 *
 * 背景（2026-09-13 参数配置化）：这两个体积护栏原本是模块常量；
 * 现在读 `runtimeLimits()`（启动时由 settings `agent:budget`.guards 注入）。
 * 本用例钉死"注入了就真生效、没注入用默认"。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { truncateTranscriptContent } from '@core/platform/agent-runtime/memory/transcript-store'
import { createToolArtifactStore } from '@core/platform/agent-runtime/tools/artifacts'
import {
  RUNTIME_LIMITS_DEFAULTS,
  resetRuntimeLimits,
  setRuntimeLimits,
} from '@shared/utils/runtime-limits'

afterEach(() => {
  resetRuntimeLimits()
})

describe('会话流水消息截断（transcript）', () => {
  it('未注入限额：小内容原样、超过默认 512KB 存占位', () => {
    expect(truncateTranscriptContent('{"a":1}')).toBe('{"a":1}')
    const huge = 'x'.repeat(RUNTIME_LIMITS_DEFAULTS.maxTranscriptMessageBytes + 10)
    const out = truncateTranscriptContent(huge)
    expect(out).toContain('_truncated')
    expect(out).not.toContain('xxxxx')
  })

  it('注入限额后按新上限判定（进程级，启动时生效）', () => {
    setRuntimeLimits({ maxTranscriptMessageBytes: 32 })
    expect(truncateTranscriptContent('y'.repeat(20))).toBe('y'.repeat(20))
    expect(truncateTranscriptContent('y'.repeat(100))).toContain('_truncated')
  })

  it('显式传参优先于进程级限额（调用方可覆盖）', () => {
    setRuntimeLimits({ maxTranscriptMessageBytes: 1 })
    expect(truncateTranscriptContent('z'.repeat(50), 1000)).toBe('z'.repeat(50))
  })
})

describe('工具产物上限（artifacts）', () => {
  function makeStore(saved: unknown[]) {
    return createToolArtifactStore({
      repo: {
        upsert: async (r) => {
          saved.push(r)
        },
        findByToolCallId: async () => undefined,
        deleteByScope: async () => 0,
      },
    })
  }

  it('未注入限额：超 256KB 拒存（不落脏行），小产物正常落', async () => {
    const saved: unknown[] = []
    const store = makeStore(saved)
    await store.save({
      scopeKey: 's',
      toolCallId: 'c1',
      toolName: 't',
      args: {},
      result: { blob: 'x'.repeat(RUNTIME_LIMITS_DEFAULTS.maxArtifactBytes + 100) },
      ok: true,
    })
    expect(saved).toHaveLength(0)
    await store.save({ scopeKey: 's', toolCallId: 'c2', toolName: 't', args: {}, result: { ok: 1 }, ok: true })
    expect(saved).toHaveLength(1)
  })

  it('注入限额后按新上限拒存（可调小以省库）', async () => {
    setRuntimeLimits({ maxArtifactBytes: 64 })
    const saved: unknown[] = []
    const store = makeStore(saved)
    await store.save({
      scopeKey: 's',
      toolCallId: 'c1',
      toolName: 't',
      args: {},
      result: { blob: 'x'.repeat(200) },
      ok: true,
    })
    expect(saved).toHaveLength(0)
  })
})
