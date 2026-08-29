/**
 * 搜索引擎模板清单一致性测试
 * @module tests/unit/search-engines/search-engine-templates
 * @description 锁定两条 8/28 评审结论：
 *              - #94 bing-api 预置指向已退役的 Bing Search API（2025-08-11 退役），
 *                不得再作为可选项对外提供（模板列表不得含 bing-api）。
 *              - #95 deepseek-web 预置名不副实：DeepSeek 模型无实时联网能力，模板
 *                名称/描述必须诚实标注"模型生成、链接可能编造"，不得自称"联网搜索"。
 */
import { describe, it, expect } from 'vitest'
import { SEARCH_ENGINE_TEMPLATES, getSearchEngineTemplate } from '@core/search-engines'

describe('搜索引擎模板清单（8/28 评审加固）', () => {
  it('bing-api（已退役 API）不再是可选项', () => {
    expect(getSearchEngineTemplate('bing-api' as never)).toBeUndefined()
    expect(SEARCH_ENGINE_TEMPLATES.find(t => t.id === 'bing-api')).toBeUndefined()
  })

  it('deepseek-web 模板诚实标注为模型生成（非实时联网）', () => {
    const tpl = getSearchEngineTemplate('deepseek-web')
    expect(tpl).toBeDefined()
    expect(tpl!.name).toContain('模型生成')
    // 描述须提示"无实时联网/链接可能编造"，不得只写"联网搜索"误导
    expect(tpl!.description).toMatch(/模型无实时联网|链接可能.?编造|编造、不准确|非真实联网搜索/)
  })

  it('deepseek-web 模板不再自称真实联网搜索（描述不误导）', () => {
    const tpl = getSearchEngineTemplate('deepseek-web')
    expect(tpl!.description).not.toBe('DeepSeek 联网搜索（OpenAI 兼容端点）')
    expect(tpl!.description.toLowerCase()).not.toMatch(/^deepseek 联网搜索/)
  })
})
