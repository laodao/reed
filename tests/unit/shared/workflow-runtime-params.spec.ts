/**
 * 工作流运行参数（分组）测试
 * @module tests/unit/shared/workflow-runtime-params
 *
 * 背景（2026-09-13 参数设置第二轮）：抓取礼貌 / 长任务轮询 / 代码沙箱超时以前是模块级常量，
 * 用户改不动。改成"运行时持有者 + settings 保存后重注入"。
 *
 * 这里钉死：
 * 1. 不配置时 = 改造前写死的常量（行为不变）；
 * 2. 覆盖生效、超上限夹取、非法值保留原值（"间隔配成 0/负数"不能把站点打爆）；
 * 3. 分组一致性：抓取间隔下限不得大于上限；
 * 4. **解析走登记表**：`workflowRuntimeParamsFromSettings` 与设置页同一口径（页面显示 = 节点实际用）。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetWorkflowRuntimeParams,
  setWorkflowRuntimeParams,
  workflowRuntimeParams,
  workflowRuntimeParamsFromSettings,
} from '@shared/utils/workflow-runtime-params'
import {
  WORKFLOW_PARAMS_DEFAULTS,
  WORKFLOW_PARAMS_LIMITS,
} from '@shared/types/workflow-params.types'
import { getModuleParams } from '@shared/constants/module-params'
import { resolveModuleParams } from '@shared/utils/module-params'
import { SETTINGS_KEYS } from '@shared/constants/settings-keys'

beforeEach(() => resetWorkflowRuntimeParams())

describe('工作流运行参数：默认值 = 改造前写死的常量', () => {
  it('不注入时就是内置默认（含各分组）', () => {
    expect(workflowRuntimeParams()).toEqual(WORKFLOW_PARAMS_DEFAULTS)
    expect(workflowRuntimeParams().crawl.delayMsMin).toBe(800)
    expect(workflowRuntimeParams().crawl.delayMsMax).toBe(2_500)
    expect(workflowRuntimeParams().crawl.hostConcurrency).toBe(1)
    expect(workflowRuntimeParams().crawl.httpRequestTimeoutMs).toBe(30_000)
    expect(workflowRuntimeParams().polling.kbIngestIntervalMs).toBe(500)
    expect(workflowRuntimeParams().polling.kbIngestWaitTimeoutMs).toBe(120_000)
    expect(workflowRuntimeParams().polling.imageIntervalMs).toBe(2_000)
    expect(workflowRuntimeParams().polling.imageWaitTimeoutMs).toBe(300_000)
    expect(workflowRuntimeParams().polling.voiceCloneIntervalMs).toBe(3_000)
    expect(workflowRuntimeParams().polling.voiceCloneWaitTimeoutMs).toBe(600_000)
    expect(workflowRuntimeParams().codeSandbox.timeoutMs).toBe(5_000)
  })

  it('默认值不超过代码级硬上限（登记表的一致性纪律）', () => {
    for (const group of Object.keys(WORKFLOW_PARAMS_DEFAULTS) as Array<keyof typeof WORKFLOW_PARAMS_DEFAULTS>) {
      const d = WORKFLOW_PARAMS_DEFAULTS[group] as unknown as Record<string, number>
      const l = WORKFLOW_PARAMS_LIMITS[group] as unknown as Record<string, number>
      for (const key of Object.keys(d)) {
        expect(d[key], `${group}.${key} 默认超过硬上限`).toBeLessThanOrEqual(l[key])
      }
    }
  })

  it('第五批（数据源连接池 / UI 契约）默认 = 改造前写死的字面量', () => {
    const p = workflowRuntimeParams()
    expect(p.datasource.poolIdleTtlMs).toBe(5 * 60_000)
    expect(p.datasource.maxPools).toBe(20)
    expect(p.datasource.maxPoolConnections).toBe(5)
    expect(p.datasource.connectTimeoutMs).toBe(8_000)
    expect(p.datasource.queryTimeoutMs).toBe(30_000)
    expect(p.ui.defaultPageSize).toBe(20)
    expect(p.ui.formUploadMaxBytes).toBe(10 * 1024 * 1024)
  })

  it('数据源连接池：覆盖生效、超限夹取（池大小与建连超时对已建连接需重启才生效）', () => {
    setWorkflowRuntimeParams({ datasource: { maxPoolConnections: 12, queryTimeoutMs: 999_999 } })
    expect(workflowRuntimeParams().datasource.maxPoolConnections).toBe(12)
    expect(workflowRuntimeParams().datasource.queryTimeoutMs).toBe(
      WORKFLOW_PARAMS_LIMITS.datasource.queryTimeoutMs,
    )
    const def = getModuleParams('workflow')!
    const r = resolveModuleParams(def, {})
    const entry = (k: string) => r.groups.flatMap((g) => g.entries).find((e) => e.valueKey === k)!
    expect(entry('datasource.maxPoolConnections').effect).toBe('restart')
    expect(entry('datasource.queryTimeoutMs').effect).toBe('immediate')
  })

  it('第四批（工具超时/视频等待/cron 宽限/对话附件检索）默认 = 改造前写死的字面量', () => {    const p = workflowRuntimeParams()
    expect(p.tools.cliTimeoutMs).toBe(30_000)
    expect(p.tools.videoUrlResolveTimeoutMs).toBe(10_000)
    expect(p.tools.ytDlpDownloadTimeoutMs).toBe(120_000)
    expect(p.tools.ytDlpSocketTimeoutSec).toBe(30)
    expect(p.polling.videoWaitTimeoutMs).toBe(70 * 60 * 1000)
    expect(p.trigger.cronGraceFactor).toBe(2)
    expect(p.retrieval.dialogFileChunkChars).toBe(800)
    expect(p.retrieval.dialogFileChunkOverlapChars).toBe(100)
    expect(p.retrieval.dialogFileMaxMessages).toBe(200)
    expect(p.retrieval.dialogFileTopK).toBe(5)
  })

  it('分块重叠超过分块一半 → 自动收到一半（否则检索块几乎全重叠）', () => {
    const def = getModuleParams('workflow')!
    const r = resolveModuleParams(def, {
      [SETTINGS_KEYS.wfDefaults]: { retrieval: { dialogFileChunkChars: 400, dialogFileChunkOverlapChars: 350 } },
    })
    expect(r.values['retrieval.dialogFileChunkOverlapChars']).toBe(200)
    expect(r.notes.some((n) => n.includes('一半'))).toBe(true)
  })

  it('对话附件检索条数：effectiveTopK 的缺省值读设置，显式传参仍优先', async () => {
    const { effectiveTopK } = await import('@core/platform/workflow/nodes/dialog-file-retriever')
    expect(effectiveTopK(undefined)).toBe(5)
    setWorkflowRuntimeParams({ retrieval: { dialogFileTopK: 9 } })
    expect(effectiveTopK(undefined)).toBe(9)
    expect(effectiveTopK(3)).toBe(3)
  })

  it('第三批（抓取类/长任务类）默认 = 改造前写死的字面量', () => {
    const p = workflowRuntimeParams()
    expect(p.crawl.responseMaxBytes).toBe(50 * 1024 * 1024)
    expect(p.crawl.extractMaxChars).toBe(100_000)
    expect(p.crawl.maxLinksPerSource).toBe(30)
    expect(p.crawl.maxLinksPerPage).toBe(50)
    expect(p.crawl.maxSources).toBe(10)
    expect(p.crawl.maxConcurrentPages).toBe(5)
    expect(p.polling.kbQaContextMaxChars).toBe(8_000)
    expect(p.polling.subflowWaitTimeoutMs).toBe(600_000)
    expect(p.polling.subflowIntervalMs).toBe(500)
  })

  it('第三批：覆盖生效、超限夹取', () => {
    setWorkflowRuntimeParams({ crawl: { extractMaxChars: 250_000 }, polling: { subflowIntervalMs: 9_999_999 } })
    expect(workflowRuntimeParams().crawl.extractMaxChars).toBe(250_000)
    expect(workflowRuntimeParams().polling.subflowIntervalMs).toBe(WORKFLOW_PARAMS_LIMITS.polling.subflowIntervalMs)
  })

  it('第二批分组（系统工具面/草稿/触发/界面截断）默认 = 改造前写死的常量', () => {    const p = workflowRuntimeParams()
    expect(p.systemTools.catalogMaxItems).toBe(20)
    expect(p.systemTools.runPollIntervalMs).toBe(2_000)
    expect(p.systemTools.runWaitTimeoutMs).toBe(180_000)
    expect(p.systemTools.nodeSummaryMax).toBe(20)
    expect(p.systemTools.nodeOutputDigestChars).toBe(400)
    expect(p.systemTools.runErrorDigestChars).toBe(2_000)
    expect(p.systemTools.runMissingStreakLimit).toBe(3)
    expect(p.draft.maxAttempts).toBe(2)
    expect(p.draft.maxNodes).toBe(20)
    expect(p.trigger.eventMaxPerMinute).toBe(20)
    expect(p.ui.contextTextChars).toBe(1_600)
    expect(p.ui.contextPartChars).toBe(400)
    expect(p.ui.approvalTaskChars).toBe(200)
  })

  it('第二批分组：覆盖生效、超限夹取', () => {
    setWorkflowRuntimeParams({ systemTools: { catalogMaxItems: 5 }, draft: { maxNodes: 999_999 } })
    expect(workflowRuntimeParams().systemTools.catalogMaxItems).toBe(5)
    expect(workflowRuntimeParams().draft.maxNodes).toBe(WORKFLOW_PARAMS_LIMITS.draft.maxNodes)
    // 未提到的分组沿用上次生效值
    expect(workflowRuntimeParams().ui.contextTextChars).toBe(WORKFLOW_PARAMS_DEFAULTS.ui.contextTextChars)
  })

  it('第二批分组也能从 settings 解析', () => {
    const parsed = workflowRuntimeParamsFromSettings({
      systemTools: { runWaitTimeoutMs: 600_000 },
      ui: { approvalTaskChars: 500 },
      trigger: { eventMaxPerMinute: 9_999 },
    })
    expect(parsed.systemTools.runWaitTimeoutMs).toBe(600_000)
    expect(parsed.ui.approvalTaskChars).toBe(500)
    expect(parsed.trigger.eventMaxPerMinute).toBe(WORKFLOW_PARAMS_LIMITS.trigger.eventMaxPerMinute)
    expect(parsed.draft.maxNodes).toBe(WORKFLOW_PARAMS_DEFAULTS.draft.maxNodes)
  })
})

describe('工作流运行参数：注入与夹取', () => {
  it('覆盖生效（只影响写了的项，其余保留默认）', () => {
    setWorkflowRuntimeParams({ polling: { imageWaitTimeoutMs: 500_000 } as never })
    expect(workflowRuntimeParams().polling.imageWaitTimeoutMs).toBe(500_000)
    expect(workflowRuntimeParams().polling.kbIngestWaitTimeoutMs).toBe(120_000)
    expect(workflowRuntimeParams().crawl.delayMsMin).toBe(800)
  })

  it('超上限夹到上限', () => {
    setWorkflowRuntimeParams({
      polling: { kbIngestWaitTimeoutMs: 99_999_999 } as never,
      codeSandbox: { timeoutMs: 9_999_999 } as never,
    })
    expect(workflowRuntimeParams().polling.kbIngestWaitTimeoutMs).toBe(
      WORKFLOW_PARAMS_LIMITS.polling.kbIngestWaitTimeoutMs,
    )
    expect(workflowRuntimeParams().codeSandbox.timeoutMs).toBe(WORKFLOW_PARAMS_LIMITS.codeSandbox.timeoutMs)
  })

  it('非法值（负数/NaN/字符串）保留原值，不把"间隔 0/负数"打进去', () => {
    setWorkflowRuntimeParams({ crawl: { delayMsMax: 1_000 } as never })
    setWorkflowRuntimeParams({
      crawl: { delayMsMax: -5, delayMsMin: Number.NaN, hostConcurrency: 'x' } as never,
    })
    expect(workflowRuntimeParams().crawl.delayMsMax).toBe(1_000) // 上次的有效值保留
    expect(workflowRuntimeParams().crawl.delayMsMin).toBe(WORKFLOW_PARAMS_DEFAULTS.crawl.delayMsMin)
    expect(workflowRuntimeParams().crawl.hostConcurrency).toBe(WORKFLOW_PARAMS_DEFAULTS.crawl.hostConcurrency)
  })

  it('抓取间隔下限不得大于上限（一致性护栏）', () => {
    setWorkflowRuntimeParams({ crawl: { delayMsMin: 5_000, delayMsMax: 500 } as never })
    const p = workflowRuntimeParams().crawl
    expect(p.delayMsMin).toBeLessThanOrEqual(p.delayMsMax)
    expect(p.delayMsMin).toBe(500)
  })

  it('reset 回到内置默认（测试隔离）', () => {
    setWorkflowRuntimeParams({ crawl: { hostConcurrency: 4 } as never })
    expect(workflowRuntimeParams().crawl.hostConcurrency).toBe(4)
    resetWorkflowRuntimeParams()
    expect(workflowRuntimeParams()).toEqual(WORKFLOW_PARAMS_DEFAULTS)
  })
})

describe('从 settings 解析（与设置页同一口径）', () => {
  it('解析 wf:defaults 的分组字段并夹取；未配置的用默认', () => {
    const parsed = workflowRuntimeParamsFromSettings({
      crawl: { delayMsMin: 100, delayMsMax: 200, httpRequestTimeoutMs: 60_000 },
      polling: { imageIntervalMs: 9_999_999 },
      codeSandbox: { timeoutMs: 20_000 },
    })
    expect(parsed.crawl.delayMsMin).toBe(100)
    expect(parsed.crawl.delayMsMax).toBe(200)
    expect(parsed.crawl.httpRequestTimeoutMs).toBe(60_000)
    expect(parsed.crawl.hostConcurrency).toBe(WORKFLOW_PARAMS_DEFAULTS.crawl.hostConcurrency)
    expect(parsed.polling.imageIntervalMs).toBe(WORKFLOW_PARAMS_LIMITS.polling.imageIntervalMs) // 夹到上限
    expect(parsed.polling.voiceCloneIntervalMs).toBe(WORKFLOW_PARAMS_DEFAULTS.polling.voiceCloneIntervalMs)
    expect(parsed.codeSandbox.timeoutMs).toBe(20_000)
  })

  it('垃圾载荷一律回落默认（配置坏了不能让工作流跑不起来）', () => {
    for (const raw of [null, undefined, 42, 'x', []]) {
      expect(workflowRuntimeParamsFromSettings(raw)).toEqual(WORKFLOW_PARAMS_DEFAULTS)
    }
    expect(workflowRuntimeParamsFromSettings({ crawl: 'nope' })).toEqual(WORKFLOW_PARAMS_DEFAULTS)
  })

  it('解析口径来自登记表：抓取间隔一致性在页面上也会有说明', () => {
    const def = getModuleParams('workflow')!
    const r = resolveModuleParams(def, {
      [SETTINGS_KEYS.wfDefaults]: { crawl: { delayMsMin: 5_000, delayMsMax: 500 } },
    })
    expect(r.values['crawl.delayMsMin']).toBe(500)
    expect(r.notes.some((n) => n.includes('大于'))).toBe(true)
    // 同一份载荷交给持有者解析，结果一致（页面显示 = 节点实际用）
    const viaHolder = workflowRuntimeParamsFromSettings({ crawl: { delayMsMin: 5_000, delayMsMax: 500 } })
    expect(viaHolder.crawl.delayMsMin).toBe(500)
  })

  it('代码沙箱超时：默认 5s、可调高到 60s（改造前"上限=默认"导致配不长）', () => {
    const def = getModuleParams('workflow')!
    const r = resolveModuleParams(def, { [SETTINGS_KEYS.wfDefaults]: null })
    expect(r.values['codeSandbox.timeoutMs']).toBe(5_000)
    const raised = resolveModuleParams(def, { [SETTINGS_KEYS.wfDefaults]: { codeSandbox: { timeoutMs: 30_000 } } })
    expect(raised.values['codeSandbox.timeoutMs']).toBe(30_000)
  })
})
