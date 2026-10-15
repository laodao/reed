import { describe, it, expect } from 'vitest'
import {
  parsePrompt,
  serializePrompt,
  lineToText,
  buildPromptText,
  splitPromptText,
} from '@/components/episode-production/storyboard/storyboard-prompt-format'

describe('storyboard-prompt-format', () => {
  it('parse 解析「镜头N [params] desc」行', () => {
    const text = '镜头1 [景别=full|运镜=static|时长=5|风格=cinematic] 夜色中，一艘画舫停在江心'
    const lines = parsePrompt(text)
    expect(lines).toHaveLength(1)
    expect(lines[0].shotNumber).toBe(1)
    expect(lines[0].params['景别']).toBe('full')
    expect(lines[0].params['运镜']).toBe('static')
    expect(lines[0].params['时长']).toBe('5')
    expect(lines[0].params['风格']).toBe('cinematic')
    expect(lines[0].description).toBe('夜色中，一艘画舫停在江心')
  })

  it('serialize 与 parse 可逆（round-trip）', () => {
    const text = '镜头1 [景别=full|运镜=static|时长=5|风格=cinematic] 夜色中\n镜头2 [景别=medium|运镜=pan_left|时长=4|风格=cinematic] 李甲站在岸边'
    const lines = parsePrompt(text)
    expect(serializePrompt(lines)).toBe(text)
  })

  it('lineToText 保持参数顺序与描述', () => {
    expect(
      lineToText({ shotNumber: 2, params: { 景别: 'medium', 运镜: 'pan_left', 时长: '4', 风格: 'cinematic' }, description: '李甲站在岸边' }),
    ).toBe('镜头2 [景别=medium|运镜=pan_left|时长=4|风格=cinematic] 李甲站在岸边')
  })

  it('buildPromptText 由分镜记录构造多行字符串', () => {
    const shots = [
      { shotNumber: 1, shotType: 'full', cameraMovement: 'static', duration: 5, frameDescription: '江面' },
      { shotNumber: 2, shotType: 'medium', cameraMovement: 'pan_left', duration: 4, frameDescription: '岸边' },
    ]
    const text = buildPromptText(shots, 'cinematic')
    expect(text).toBe(
      '镜头1 [景别=full|运镜=static|时长=5|风格=cinematic] 江面\n镜头2 [景别=medium|运镜=pan_left|时长=4|风格=cinematic] 岸边',
    )
  })

  it('splitPromptText 返回逐镜头行', () => {
    const lines = splitPromptText('镜头1 [景别=full|时长=5] 甲\n镜头2 [景别=medium|时长=4] 乙')
    expect(lines).toHaveLength(2)
    expect(lines[1].shotNumber).toBe(2)
  })

  it('非标准行作为原始描述保留且不丢', () => {
    const text = '自由输入的文本，没有参数段'
    const lines = parsePrompt(text)
    expect(lines).toHaveLength(1)
    expect(lines[0].description).toBe('自由输入的文本，没有参数段')
    expect(serializePrompt(lines)).toBe('镜头1 [] 自由输入的文本，没有参数段')
  })
})
