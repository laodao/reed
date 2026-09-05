/**
 * B6 内置模板合法性测试：模板经 importDefinition 全部成功（结构校验即测试）
 * @module tests/renderer/workflow-templates
 * @description P11：模板纳入单测——踩到校验器规则（保留字/边约束/choose 配对）在测试期暴露。
 */
import { describe, it, expect } from 'vitest'
import rawRag from '../../../src/renderer/src/assets/workflow-templates/rag-qa.json'
import rawTranslate from '../../../src/renderer/src/assets/workflow-templates/batch-translate.json'
import rawReview from '../../../src/renderer/src/assets/workflow-templates/content-review.json'
import rawDigest from '../../../src/renderer/src/assets/workflow-templates/daily-digest.json'
import rawVideo from '../../../src/renderer/src/assets/workflow-templates/video-transcript.json'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import { previewCronExpression } from '@core/platform/workflow/trigger/workflow-trigger-scheduler.service'
import type { WorkflowGraph, WorkflowTrigger } from '@shared/types/workflow.types'

const templates = [
  { name: 'rag-qa', raw: rawRag },
  { name: 'batch-translate', raw: rawTranslate },
  { name: 'content-review', raw: rawReview },
  { name: 'daily-digest', raw: rawDigest },
  { name: 'video-transcript', raw: rawVideo },
]

describe('内置模板库（B6/P11）', () => {
  it('5 份模板全部为合法导出格式', () => {
    for (const t of templates) {
      expect(t.raw.kind).toBe('the-bot-workflow')
      expect(t.raw.formatVersion).toBe(1)
      expect(t.raw.graph?.nodes?.length).toBeGreaterThan(1)
    }
  })

  it('模板图全部通过结构校验（importDefinition 同等校验）', () => {
    for (const t of templates) {
      const result = validateGraph(t.raw.graph as WorkflowGraph)
      if (!result.valid) throw new Error(`${t.name}: ${result.errors.join('；')}`)
      expect(result.valid, t.name).toBe(true)
    }
  })

  it('模板节点类型全部存在于目录', () => {
    for (const t of templates) {
      for (const node of (t.raw.graph as WorkflowGraph).nodes) {
        expect(NODE_TYPE_CATALOG_MAP[node.type as keyof typeof NODE_TYPE_CATALOG_MAP], `${t.name}/${node.type}`).toBeDefined()
      }
    }
  })

  it('含触发器的模板（daily-digest）：cron 表达式合法且满足 V1 单 cron 限制', () => {
    const triggers = (rawDigest.triggers ?? []) as WorkflowTrigger[]
    expect(triggers.filter(t => t.type === 'cron' && t.enabled)).toHaveLength(1)
    const cron = triggers.find(t => t.type === 'cron') as Extract<WorkflowTrigger, { type: 'cron' }>
    expect(previewCronExpression(cron.expression).valid).toBe(true)
  })
})
