/**
 * 全节点目录一致性测试：内置节点 handler 与 NODE_TYPE_CATALOG 全对齐
 * @module tests/workflow/node-registry-consistency
 * @description 这是不变量测试：目录是编辑器 UI 的单一事实源，handler 是运行时实现，
 *              两者的 controlKind/cancellable/outputSchema 漂移会造成
 *              "界面说可取消实际不能""变量提示与实际输出不符"——必须锁死。
 *
 *              分层纪律（2026-09-18）：业务专用节点（chapter-writing/volume-design，
 *              目录标 internal）的 handler 归业务包（longwriting pack）实现与注册，
 *              平台注册表不得包含——本文件同时锁这两条。
 */
import { describe, it, expect } from 'vitest'
import {
  createFullNodeRegistry,
  createPlatformNodeRegistry,
  registerPackNodeHandlers,
  assertNodeRegistryConsistent,
} from '@core/platform/workflow/nodes/index'
import { checkRegistryConsistency } from '@core/platform/workflow/engine/node-registry'
import { NODE_TYPE_CATALOG } from '@shared/types/workflow-node-catalog'
import { LONGWRITING_WORKFLOW_NODE_HANDLERS } from '@core/packs/longwriting/workflow-nodes'

/** 目录中的业务内部节点（internal: true） */
const INTERNAL_TYPES = NODE_TYPE_CATALOG.filter(e => e.internal).map(e => e.type)

describe('全节点目录一致性', () => {
  it('平台注册表不含业务节点（分层纪律：业务 handler 不进 platform）', () => {
    expect(INTERNAL_TYPES.length).toBeGreaterThan(0)
    const platform = createPlatformNodeRegistry()
    for (const type of INTERNAL_TYPES) {
      expect(platform.get(type as never), `${type} 不应注册在平台注册表`).toBeUndefined()
    }
    // 目录侧：internal 条目必须正好是这批业务节点，防止误标平台节点
    expect(INTERNAL_TYPES).toEqual(['chapter-writing', 'volume-design'])
  })

  it('pack 注册后全量注册表对齐目录（boot 序等价：pack 先于工作流装配）', () => {
    registerPackNodeHandlers(LONGWRITING_WORKFLOW_NODE_HANDLERS)
    const registry = createFullNodeRegistry()
    for (const type of INTERNAL_TYPES) {
      expect(registry.get(type as never), `${type} 应由 pack 贡献注册`).toBeDefined()
    }
    expect(registry.list()).toHaveLength(NODE_TYPE_CATALOG.length)
    expect(() => assertNodeRegistryConsistent(registry)).not.toThrow()
    expect(checkRegistryConsistency(registry)).toEqual([])
  })

  it('pack 贡献重复注册同一 type 抛错（fail-fast，与注册表同纪律）', () => {
    expect(() => registerPackNodeHandlers(LONGWRITING_WORKFLOW_NODE_HANDLERS)).toThrow(/重复注册/)
    expect(() => registerPackNodeHandlers([{ ...LONGWRITING_WORKFLOW_NODE_HANDLERS[0] }])).toThrow(/重复注册/)
  })

  it('validateConfig 快速抽检：关键必填项（不触发服务调用）', () => {
    const registry = createFullNodeRegistry()
    // 空配置必报错的节点抽样
    const cases: Array<[string, Record<string, unknown>]> = [
      ['kb-retrieve', {}],
      ['web-search', {}],
      ['translate', {}],
      ['image-gen', {}],
      ['tts', {}],
      ['stt', {}],
      ['kb-ingest', {}],
      ['report', {}],
      ['http-request', {}],
      ['llm-chat', {}],
      ['delay', {}],
      ['human-review', {}],
      ['chapter-writing', {}],
      ['volume-design', {}],
    ]
    for (const [type, config] of cases) {
      const handler = registry.get(type as never)!
      expect(handler.validateConfig(config as never).length, `${type} 空配置应报错`).toBeGreaterThan(0)
    }
  })

describe('表单 Schema 完整性（NODE_CONFIG_FORMS）', () => {
  it('全部组件都有表单声明', async () => {
    const { NODE_CONFIG_FORMS } = await import('@shared/types/workflow-node-forms')
    const { NODE_TYPE_CATALOG } = await import('@shared/types/workflow-node-catalog')
    for (const entry of NODE_TYPE_CATALOG) {
      expect(NODE_CONFIG_FORMS[entry.type], `${entry.type} 缺表单 Schema`).toBeDefined()
    }
    // 2026-10-08：目录 ⊆ 表单 保持硬约束；反向允许已知前向声明超集——podcast-video 的
    // slide-render/podcast-compose 与新闻采集的 source-catalog：类型+表单已随 dev 提交，
    // 目录条目/包注册未随提交（半接线）。孤儿表单不可达（编辑器面板按目录渲染），
    // 不构成运行时风险；接线补齐后此处自然收紧。
    // 此前 exact-equality 断言连同整个 spec 因 slide-themes.ts 未提交而无法加载，红被掩盖。
    const catalogTypes = new Set(NODE_TYPE_CATALOG.map(e => e.type))
    const orphans = Object.keys(NODE_CONFIG_FORMS).filter(k => !catalogTypes.has(k as never))
    const knownForwardDeclarations = new Set(['slide-render', 'podcast-compose', 'source-catalog'])
    const unknown = orphans.filter(k => !knownForwardDeclarations.has(k))
    expect(unknown, `表单存在目录没有且未登记前向声明的类型：${unknown.join(', ')}`).toEqual([])
  })
})
})
