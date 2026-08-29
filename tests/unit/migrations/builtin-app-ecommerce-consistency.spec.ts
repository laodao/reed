/**
 * 电商套图"商品主体一致性"专项测试
 * @module tests/migrations/builtin-app-ecommerce-consistency
 * @description 修复"商品外观变化"回归：内置电商套图工作流的三个视觉规划节点必须
 *              输出"参考图主体锁定"的图像编辑指令（而非文生图式完整描述），
 *              且 image-gen 节点必须关掉 prompt 扩写（promptExtend=false）。
 *              这条测试锁住"主体一致"约束，防止回退成"文字化重述商品→生成式重画"。
 */
import { describe, it, expect } from 'vitest'
import ecommerceRaw from '../../../src/core/database/migrations/builtin-apps/ecommerce-poster.json'
import { validateGraph } from '@core/modules/workflow/engine/graph-validator'
import type { WorkflowGraph } from '@shared/types/workflow.types'

type Node = {
  id: string
  type: string
  name: string
  config: Record<string, unknown>
}

const nodes = (ecommerceRaw.graph as unknown as { nodes: Node[] }).nodes ?? []

/** 按节点名定位 LLM 规划节点 */
function llmPromptByName(name: string): string {
  const n = nodes.find(x => x.type === 'llm-chat' && x.name === name)
  expect(n, `找不到 llm-chat 节点 ${name}`).toBeTruthy()
  return String(n?.config?.systemPrompt ?? '')
}

/** 所有 image-gen 节点的 config */
const imageGenNodes = nodes.filter(x => x.type === 'image-gen')

describe('电商套图商品主体一致性（内置模板约束）', () => {
  it('图结构通过校验（节点/边/类型合法，不因提示词改动破坏）', () => {
    const result = validateGraph(ecommerceRaw.graph as unknown as WorkflowGraph)
    if (!result.valid) throw new Error(result.errors.join('；'))
    expect(result.valid).toBe(true)
  })

  it('三个视觉规划节点都应写"参考图主体锁定"编辑指令（Keep the product / completely unchanged / Only change）', () => {
    const names = ['套图规划（非场景）', '场景设计', '场景结构化']
    for (const name of names) {
      const sp = llmPromptByName(name)
      expect(sp, `${name} 应包含编辑指令引导语`).toContain('Keep the product')
      expect(sp, `${name} 应包含 "completely unchanged"`).toContain('completely unchanged')
      expect(sp, `${name} 应包含 "Only change"`).toContain('Only change')
    }
  })

  it('plan1（非场景）不得再要求"写完整商品外观描述段"这种文生图式重述', () => {
    const sp = llmPromptByName('套图规划（非场景）')
    // 曾经的漂移源：以一段商品外观描述开头"完整描述商品"，让生成式模型重画主体
    expect(sp).not.toContain('商品外观描述段')
    expect(sp).not.toMatch(/完整描述商品|商品外观描述/)
    // 明确约束：不要重述商品外观，交给参考图锁定主体
    expect(sp).toContain('不要重述商品外观')
  })

  it('编辑指令应明确"仅改变背景/场景/构图/光线，主体形状/颜色/材质/图案/logo 禁止改变"', () => {
    const sp = llmPromptByName('套图规划（非场景）')
    expect(sp).toMatch(/only change the background|仅改变背景|只改变背景/i)
    expect(sp).toMatch(/shape, color, material|形状、颜色、材质|形状、颜色、材质、图案、logo/i)
  })

  it('三个视觉规划节点都应约束"风格/质感与参考图一致"（防同套图风格漂移）', () => {
    const names = ['套图规划（非场景）', '场景设计', '场景结构化']
    for (const name of names) {
      const sp = llmPromptByName(name)
      expect(sp, `${name} 应约束风格一致`).toContain('风格与质感一致')
      expect(sp, `${name} 应引用"保持参考图"`).toContain('保持参考图')
    }
  })

  it('plan1 应禁止图中出现文字（消除促销海报 AI 乱码文案）', () => {
    const sp = llmPromptByName('套图规划（非场景）')
    expect(sp).toContain('禁止出现任何文字')
  })

  it('所有 image-gen 节点必须显式关闭 prompt 扩写（promptExtend=false）', () => {
    expect(imageGenNodes.length).toBeGreaterThan(0)
    for (const node of imageGenNodes) {
      expect(node.config.promptExtend, `${node.id} 应显式关闭扩写`).toBe(false)
    }
  })

  it('每个 image-gen 节点都把商品参考图作为参考输入（referenceImages 非空）', () => {
    for (const node of imageGenNodes) {
      const ref = node.config.referenceImages
      expect(String(ref), `${node.id} 应设置参考图`).toMatch(/productImage|referenceImages/)
    }
  })
})
