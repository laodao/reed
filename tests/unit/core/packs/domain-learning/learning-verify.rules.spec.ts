/**
 * 讲义核验规则测试（learning-verify.rules，M4-UX2）
 * @module tests/unit/core/packs/domain-learning/learning-verify.rules.spec
 *
 * 钉死:解析围栏 JSON;无 unsupported → verified;含 unsupported → needs_review;
 * 无法解析 → null(保持未核验,不吞为 verified)。
 */

import { describe, it, expect } from 'vitest'
import {
  deriveVerificationStatus,
  extractJsonObject,
  parseVerifyOutcome,
} from '@core/packs/domain-learning/rules/learning-verify.rules'

describe('learning-verify.rules（M4-UX2）', () => {
  it('extractJsonObject 剥离 markdown 围栏取 JSON 对象', () => {
    const raw = '分析完成：\n```json\n{"status":"verified","issues":[]}\n```\n'
    expect(extractJsonObject(raw)).toBe('{"status":"verified","issues":[]}')
    expect(extractJsonObject('没有 JSON')).toBeNull()
  })

  it('全 supported/无存疑 → verified；含 unsupported → needs_review', () => {
    expect(deriveVerificationStatus([{ verdict: 'supported', reason: '与讲义推导一致' }])).toBe('verified')
    expect(
      deriveVerificationStatus([
        { claim: 'X 成立', verdict: 'unsupported', reason: '与 KB 结论冲突', sourceRef: 'kb:doc' },
      ]),
    ).toBe('needs_review')
  })

  it('parseVerifyOutcome：围栏 JSON → 归一化核验记录；坏输入 → null', () => {
    const ok = parseVerifyOutcome('```json\n{"issues":[{"claim":"a","verdict":"supported","reason":"ok"}]}\n```', new Date('2026-09-09T00:00:00Z'))
    expect(ok?.status).toBe('verified')
    expect(ok?.issues).toHaveLength(1)
    expect(ok?.checkedAt).toBe('2026-09-09T00:00:00.000Z')

    const bad = parseVerifyOutcome('模型没返回 JSON', new Date())
    expect(bad).toBeNull()

    const keep = parseVerifyOutcome('{"status":"needs_review","issues":[{"verdict":"needs_review","reason":"待核"}],"note":"x"}')
    expect(keep?.status).toBe('needs_review')
    expect(keep?.note).toBe('x')
  })
})
