/**
 * 「知识库」参数测试（登记表 + 持有者 + 读取点接线）
 * @module tests/unit/shared/knowledge-params
 *
 * 背景（2026-09-13 参数设置第五批）：知识库是最容易"默认值不合理导致用户没法用"的模块——
 * 检索条数太少搜不到、相似度不过滤答非所问、上传 50MB 挡掉大 PDF、整本书摘要一次只跑 60 章。
 *
 * 这里覆盖：三个 settings 键的归属与解析、默认=改造前常量、夹取/非法保留、百分比换算，
 * 以及**读取点真的读了持有者**（`getFileLimits()` 的上传上限）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  knowledgeFlagsFromSettings,
  knowledgeParams,
  knowledgeParamsFromSettings,
  knowledgeQaDirectMinScore,
  knowledgeSummaryFlags,
  resetKnowledgeParams,
  setKnowledgeParams,
  setKnowledgeSummaryFlags,
} from '@shared/utils/knowledge-params'
import { KNOWLEDGE_DEFAULTS, KNOWLEDGE_LIMITS } from '@shared/types/knowledge-params.types'
import { getModuleParams } from '@shared/constants/module-params'
import { moduleParamSettingsKeys, resolveModuleParams } from '@shared/utils/module-params'
import { SETTINGS_KEYS } from '@shared/constants/settings-keys'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'

const DEF = getModuleParams('knowledge')!

beforeEach(() => resetKnowledgeParams())
afterEach(() => resetKnowledgeParams())

describe('登记表：一个 Tab 覆盖三个 settings 键', () => {
  it('归属键', () => {
    expect(DEF.name).toBe('知识库')
    expect(moduleParamSettingsKeys(DEF).sort()).toEqual(
      [SETTINGS_KEYS.knowledgeRetrieval, SETTINGS_KEYS.knowledgeIngest, SETTINGS_KEYS.knowledgeSummary].sort(),
    )
  })

  it('默认值 = 改造前写死的常量；分组落在各自的键上', () => {
    const r = resolveModuleParams(DEF, {})
    expect(r.values['defaultTopK']).toBe(5)
    expect(r.values['qaTopK']).toBe(3)
    expect(r.values['qaDirectMinScorePercent']).toBe(75) // 0.75
    expect(r.values['maxTopKPerKb']).toBe(20)
    expect(r.values['maxMergedResults']).toBe(60)
    expect(r.values['embeddingBatchSize']).toBe(10)
    expect(r.values['maxUploadBytes']).toBe(50 * 1024 * 1024)
    expect(r.values['maxUploadFiles']).toBe(20)
    expect(r.values['qaImportMaxRows']).toBe(10_000)
    expect(r.values['concurrency']).toBe(3)
    expect(r.values['maxChars']).toBe(6_000)
    expect(r.values['maxSummaries']).toBe(60)

    const find = (k: string) => r.groups.flatMap((g) => g.entries).find((e) => e.valueKey === k)?.settingsKey
    expect(find('defaultTopK')).toBe(SETTINGS_KEYS.knowledgeRetrieval)
    expect(find('maxUploadBytes')).toBe(SETTINGS_KEYS.knowledgeIngest)
    expect(find('maxSummaries')).toBe(SETTINGS_KEYS.knowledgeSummary)
  })

  it('默认值不超过硬上限', () => {
    for (const group of Object.keys(KNOWLEDGE_DEFAULTS) as Array<'retrieval' | 'ingest' | 'summary'>) {
      const d = KNOWLEDGE_DEFAULTS[group] as unknown as Record<string, number>
      const l = KNOWLEDGE_LIMITS[group] as unknown as Record<string, number>
      for (const key of Object.keys(d)) expect(d[key], `${group}.${key}`).toBeLessThanOrEqual(l[key])
    }
  })
})

describe('持有者与从 settings 解析', () => {
  it('不注入时 = 内置默认；覆盖生效、超限夹取、非法值保留', () => {
    expect(knowledgeParams()).toEqual(KNOWLEDGE_DEFAULTS)
    setKnowledgeParams({ retrieval: { defaultTopK: 12 } })
    expect(knowledgeParams().retrieval.defaultTopK).toBe(12)
    setKnowledgeParams({ retrieval: { defaultTopK: 9999, qaTopK: -1 } })
    expect(knowledgeParams().retrieval.defaultTopK).toBe(KNOWLEDGE_LIMITS.retrieval.defaultTopK)
    expect(knowledgeParams().retrieval.qaTopK).toBe(KNOWLEDGE_DEFAULTS.retrieval.qaTopK)
  })

  it('三个键分别解析并夹取', () => {
    const parsed = knowledgeParamsFromSettings({
      [SETTINGS_KEYS.knowledgeRetrieval]: { defaultTopK: 8, qaDirectMinScorePercent: 90 },
      [SETTINGS_KEYS.knowledgeIngest]: { maxUploadBytes: 200 * 1024 * 1024 },
      [SETTINGS_KEYS.knowledgeSummary]: { maxSummaries: 9_999 },
    })
    expect(parsed.retrieval.defaultTopK).toBe(8)
    expect(parsed.retrieval.qaDirectMinScorePercent).toBe(90)
    expect(parsed.retrieval.qaTopK).toBe(KNOWLEDGE_DEFAULTS.retrieval.qaTopK)
    expect(parsed.ingest.maxUploadBytes).toBe(200 * 1024 * 1024)
    expect(parsed.summary.maxSummaries).toBe(KNOWLEDGE_LIMITS.summary.maxSummaries)
  })

  it('百分比参数在读取点换算成 0~1 小数', () => {
    expect(knowledgeQaDirectMinScore()).toBeCloseTo(0.75, 5)
    setKnowledgeParams({ retrieval: { qaDirectMinScorePercent: 85 } })
    expect(knowledgeQaDirectMinScore()).toBeCloseTo(0.85, 5)
  })

  it('布尔开关单独持有：只接受真正的布尔（字符串 "false" 不会变成真）', () => {
    expect(knowledgeSummaryFlags().retryFailed).toBe(true)
    setKnowledgeSummaryFlags({ retryFailed: false })
    expect(knowledgeSummaryFlags().retryFailed).toBe(false)
    setKnowledgeSummaryFlags({ retryFailed: 'false' as never })
    expect(knowledgeSummaryFlags().retryFailed).toBe(false) // 非法值保留原值
    resetKnowledgeParams()
    expect(knowledgeSummaryFlags().retryFailed).toBe(true)
  })

  it('布尔开关从 settings 解析（非布尔回落默认）', () => {
    const off = knowledgeFlagsFromSettings({
      [SETTINGS_KEYS.knowledgeSummary]: { retryFailed: false },
    })
    expect(off.retryFailed).toBe(false)
    const bad = knowledgeFlagsFromSettings({
      [SETTINGS_KEYS.knowledgeSummary]: { retryFailed: 'yes' },
    })
    expect(bad.retryFailed).toBe(true)
  })
})

describe('读取点接线（真实行为改变）', () => {
  it('上传上限：getFileLimits() 跟着「参数设置 → 知识库 → 入库与导入」走', () => {
    const service = new KnowledgeBaseService()
    const before = service.getFileLimits()
    expect(before.maxFileSize).toBe(KNOWLEDGE_DEFAULTS.ingest.maxUploadBytes)
    expect(before.maxFilesPerUpload).toBe(KNOWLEDGE_DEFAULTS.ingest.maxUploadFiles)
    // 支持的格式清单不受参数影响（不是数值参数）
    expect(before.supportedTypes).toContain('pdf')

    setKnowledgeParams({ ingest: { maxUploadBytes: 300 * 1024 * 1024, maxUploadFiles: 5 } })
    const after = service.getFileLimits()
    expect(after.maxFileSize).toBe(300 * 1024 * 1024)
    expect(after.maxFilesPerUpload).toBe(5)
  })
})
