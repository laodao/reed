/**
 * 全节点目录一致性测试：21 个内置节点 handler 与 NODE_TYPE_CATALOG 全对齐
 * @module tests/workflow/node-registry-consistency
 * @description 这是不变量测试：目录是编辑器 UI 的单一事实源，handler 是运行时实现，
 *              两者的 controlKind/cancellable/outputSchema 漂移会造成
 *              "界面说可取消实际不能""变量提示与实际输出不符"——必须锁死。
 */
import { describe, it, expect } from 'vitest'
import { createFullNodeRegistry, assertNodeRegistryConsistent } from '@core/platform/workflow/nodes/index'
import { checkRegistryConsistency } from '@core/platform/workflow/engine/node-registry'
import { NODE_TYPE_CATALOG } from '@shared/types/workflow-node-catalog'

describe('全节点目录一致性', () => {
  it('全部节点注册且元数据一致（assert 不抛错）', () => {
    const registry = createFullNodeRegistry()
    expect(registry.list()).toHaveLength(NODE_TYPE_CATALOG.length)
    expect(() => assertNodeRegistryConsistent(registry)).not.toThrow()
  })

  it('checkRegistryConsistency 对全量注册表返回空问题列表', () => {
    expect(checkRegistryConsistency(createFullNodeRegistry())).toEqual([])
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
    expect(Object.keys(NODE_CONFIG_FORMS)).toHaveLength(NODE_TYPE_CATALOG.length)
  })
})
})
