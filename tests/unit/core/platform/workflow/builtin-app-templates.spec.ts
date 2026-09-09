/**
 * 内置应用工作流模板合法性测试（数量 = builtin-apps 目录随包 JSON 数，随模板新增同步递增）
 * @module tests/unit/core/platform/workflow/builtin-app-templates
 * @description 与 renderer workflow-templates.spec 同纪律：模板 JSON 经
 *              importDefinition 同等校验（validateGraph + 节点类型存在性）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateGraph } from '@core/platform/workflow/engine/graph-validator'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import { previewCronExpression } from '@core/platform/workflow/trigger/workflow-trigger-scheduler.service'
import type { WorkflowGraph, WorkflowTrigger } from '@shared/types/workflow.types'

const TEMPLATE_DIR = resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps')

const files = readdirSync(TEMPLATE_DIR).filter(f => f.endsWith('.json'))
const templates = files.map(f => {
  const raw = JSON.parse(readFileSync(resolve(TEMPLATE_DIR, f), 'utf-8'))
  return { name: f, raw }
})

describe('内置应用模板库（随包 JSON 自动发现）', () => {
  it(`找到 ${files.length} 份内置模板`, () => {
    expect(files.length).toBe(24)
  })

  it('全部为合法导出格式', () => {
    for (const t of templates) {
      expect(t.raw.kind, t.name).toBe('the-bot-workflow')
      expect(t.raw.formatVersion, t.name).toBe(1)
      expect(t.raw.graph?.nodes?.length, t.name).toBeGreaterThan(2)
    }
  })

  it('全部通过结构校验（importDefinition 同等校验）', () => {
    for (const t of templates) {
      const result = validateGraph(t.raw.graph as WorkflowGraph)
      if (!result.valid) throw new Error(`${t.name}: ${result.errors.join('；')}`)
      expect(result.valid, t.name).toBe(true)
    }
  })

  it('节点类型全部存在于目录', () => {
    for (const t of templates) {
      for (const node of (t.raw.graph as WorkflowGraph).nodes) {
        expect(NODE_TYPE_CATALOG_MAP[node.type as keyof typeof NODE_TYPE_CATALOG_MAP], `${t.name}/${node.type}`).toBeDefined()
      }
    }
  })

  it('start 输入类型全部合法', () => {
    for (const t of templates) {
      const start = (t.raw.graph as WorkflowGraph).nodes.find(n => n.type === 'start')
      const inputs = start?.config?.inputs ?? []
      const validTypes = ['string', 'textarea', 'number', 'boolean', 'json', 'select', 'file', 'model', 'select-dynamic']
      for (const input of inputs as Array<{ key?: string; type?: string }>) {
        expect(validTypes, `${t.name}/${input.key}`).toContain(input.type)
      }
    }
  })

  it('cron 触发器表达式合法（含禁用的）', () => {
    for (const t of templates) {
      const triggers = (t.raw.triggers ?? []) as WorkflowTrigger[]
      const crons = triggers.filter(tr => tr.type === 'cron')
      expect(crons.length, t.name).toBeLessThanOrEqual(1)
      for (const c of crons) {
        const r = previewCronExpression((c as Extract<WorkflowTrigger, { type: 'cron' }>).expression)
        expect(r.valid, `${t.name}/${(c as Extract<WorkflowTrigger, { type: 'cron' }>).expression}`).toBe(true)
      }
    }
  })

  it('使用 select-dynamic 的 start 输入 source 合法', () => {
    // 运行时（RunInputForm.loadDynamicOptions）支持 assets:<大类> 前缀（资产中心按大类列表）+
    // 若干具名数据源；这里以白名单 + 前缀规则断言，避免与运行时能力脱节
    const NON_ASSET_SOURCES = ['newsTopics', 'newsSources', 'knowledgeBases', 'assetCategories', 'searchEngineConfigs', 'providerConfigs']
    const isAllowed = (source?: string): boolean =>
      !!source && (source.startsWith('assets:') || NON_ASSET_SOURCES.includes(source))
    for (const t of templates) {
      const start = (t.raw.graph as WorkflowGraph).nodes.find(n => n.type === 'start')
      const inputs = start?.config?.inputs ?? []
      for (const input of inputs as Array<{ key?: string; type?: string; source?: string }>) {
        if (input.type === 'select-dynamic') {
          expect(isAllowed(input.source), `${t.name}/${input.key} source=${input.source}`).toBe(true)
        }
      }
    }
  })
})
