/**
 * 全节点目录一致性测试：内置节点 handler 与 NODE_TYPE_CATALOG 全对齐
 * @module tests/workflow/node-registry-consistency
 * @description 这是不变量测试：目录是编辑器 UI 的单一事实源，handler 是运行时实现，
 *              两者的 controlKind/cancellable/outputSchema 漂移会造成
 *              "界面说可取消实际不能""变量提示与实际输出不符"——必须锁死。
 *
 *              the-chat-bot 分支裁剪（2026-10-15）：业务专用节点（chapter-writing/
 *              volume-design/slide-render/podcast-compose）与视频生成节点
 *              （video-gen/video-compose/video-preset）随相应业务包裁剪移除，
 *              目录与注册表同步收窄；无 pack 贡献节点，平台注册表即全量注册表。
 */
import { describe, it, expect } from 'vitest'
import {
  createFullNodeRegistry,
  createPlatformNodeRegistry,
  assertNodeRegistryConsistent,
} from '@core/platform/workflow/nodes/index'
import { checkRegistryConsistency } from '@core/platform/workflow/engine/node-registry'
import { NODE_TYPE_CATALOG } from '@shared/types/workflow-node-catalog'

describe('全节点目录一致性', () => {
  it('平台注册表即全量注册表（业务包节点已随分支裁剪移除）', () => {
    const platform = createPlatformNodeRegistry()
    const full = createFullNodeRegistry()
    expect(platform.list().map(h => h.type).sort()).toEqual(full.list().map(h => h.type).sort())
    // 业务内部节点不在目录中（随包裁剪）
    const types = NODE_TYPE_CATALOG.map(e => e.type)
    for (const t of ['chapter-writing', 'volume-design', 'slide-render', 'podcast-compose', 'video-gen', 'video-compose', 'video-preset']) {
      expect(types, `${t} 应已从目录移除`).not.toContain(t)
    }
  })

  it('全量注册表对齐目录（boot 序等价：assertNodeRegistryConsistent 不抛）', () => {
    const registry = createFullNodeRegistry()
    expect(registry.list()).toHaveLength(NODE_TYPE_CATALOG.length)
    expect(() => assertNodeRegistryConsistent(registry)).not.toThrow()
    expect(checkRegistryConsistency(registry)).toEqual([])
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
    // 目录 ⊆ 表单 保持硬约束；反向允许已知前向声明超集（source-catalog：
    // 类型+表单已提交，目录条目未接线）。孤儿表单不可达（编辑器面板按目录渲染），
    // 不构成运行时风险；接线补齐后此处自然收紧。
    const catalogTypes = new Set(NODE_TYPE_CATALOG.map(e => e.type))
    const orphans = Object.keys(NODE_CONFIG_FORMS).filter(k => !catalogTypes.has(k as never))
    const knownForwardDeclarations = new Set(['source-catalog'])
    const unknown = orphans.filter(k => !knownForwardDeclarations.has(k))
    expect(unknown, `表单存在目录没有且未登记前向声明的类型：${unknown.join(', ')}`).toEqual([])
  })
})
})
