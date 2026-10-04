/**
 * 火山引擎（Ark）多模态内容块映射测试
 * @module tests/unit/core/platform/providers/llm/volcengine-multimodal
 * @description 回归背景：内部块格式 { type:'image', image_url:{url} } 原样透传给 Ark 会被 400 拒
 *              （invalid value: image）→ 表现为"火山 provider 上视觉质检/识图不可用"。
 *              这里锁定映射契约：text 保留、image/image_url 归一为 image_url、其余块丢弃。
 */
import { describe, it, expect } from 'vitest'
import { mapVolcengineContentBlocks } from '@core/platform/providers/llm/sdk/volcengine-sdk-provider'

describe('mapVolcengineContentBlocks', () => {
  it('内部 image 块归一为 Ark 要求的 image_url 结构', () => {
    const out = mapVolcengineContentBlocks([
      { type: 'text', text: '判断这张图是否贴题' },
      { type: 'image', image_url: { url: 'data:image/png;base64,AAA' } },
    ])
    expect(out).toEqual([
      { type: 'text', text: '判断这张图是否贴题' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    ])
  })

  it('已是 image_url 的块保持可用（幂等）', () => {
    const out = mapVolcengineContentBlocks([{ type: 'image_url', image_url: { url: 'https://x/y.jpg' } }])
    expect(out).toEqual([{ type: 'image_url', image_url: { url: 'https://x/y.jpg' } }])
  })

  it('缺 url 的图片块与未知块被丢弃（不产生非法请求体）', () => {
    const out = mapVolcengineContentBlocks([
      { type: 'image' },
      { type: 'image', image_url: {} },
      { type: 'audio', text: 'x' },
      null,
    ])
    expect(out).toEqual([])
  })

  it('非数组输入返回空数组（调用方按纯文本路径处理）', () => {
    expect(mapVolcengineContentBlocks('纯文本')).toEqual([])
    expect(mapVolcengineContentBlocks(undefined)).toEqual([])
  })
})