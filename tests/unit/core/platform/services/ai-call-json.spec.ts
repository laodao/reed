/**
 * parseJsonString 渐进恢复阶梯单测（2026-09-16 review P0-PR1）
 *
 * 旧实现把清洗当破坏性前置：值内中文引号被替换成未转义 ASCII 引号必炸 JSON.parse，
 * `//` 注释剥离砍掉值内 URL。新实现「先 parse，失败才逐级恢复」，本文件锁定该语义。
 */
import { describe, expect, it } from 'vitest'
import { parseJsonString, isJsonTruncated } from '@core/platform/services/ai-call'

describe('parseJsonString：合规 JSON 零损耗快路径', () => {
  it('值内中文引号（对白）原样保留——旧实现此处必炸', () => {
    const raw = JSON.stringify({
      synopsis: '他说："你好"之后转身离开',
      scenes: [{ id: 's1', narration: '她低声说"别走"，然后哭了' }],
    })
    const parsed = parseJsonString(raw)
    expect(parsed.synopsis).toContain('："你好"')
    expect(parsed.scenes[0].narration).toContain('"别走"')
  })

  it('值内 URL 的 // 不被注释剥离误伤', () => {
    const raw = '{"img":"https://example.com/a.png","note":"见 http://x.cn"}'
    const parsed = parseJsonString(raw)
    expect(parsed.img).toBe('https://example.com/a.png')
    expect(parsed.note).toBe('见 http://x.cn')
  })
})

describe('parseJsonString：非破坏修复（注释/尾随逗号，仅字符串外）', () => {
  it('剥离行注释与块注释（字符串外）+ 尾随逗号', () => {
    const raw = `{
      // 场景清单
      "scenes": [
        {"id": "s1", "location": "客栈"}, // 首场
        {"id": "s2", "location": "码头"},
      ], /* 尾注 */
    }`
    const parsed = parseJsonString(raw)
    expect(parsed.scenes).toHaveLength(2)
    expect(parsed.scenes[0].location).toBe('客栈')
  })

  it('字符串内的 // 与尾随样文本不受影响', () => {
    const raw = '{"url": "http://a.b/c", "text": "path // 不是注释,也不是尾逗号"}'
    const parsed = parseJsonString(raw)
    expect(parsed.url).toBe('http://a.b/c')
    expect(parsed.text).toContain('// 不是注释')
  })
})

describe('parseJsonString：结构中文引号修复（键值整体被中文引号包裹）', () => {
  it('中文引号包裹的键与值转换为合法 JSON', () => {
    const raw = '{“synopsis”:“少年下山复仇”,“sceneCount”:“3”}'
    const parsed = parseJsonString(raw)
    expect(parsed.synopsis).toBe('少年下山复仇')
    expect(parsed.sceneCount).toBe('3')
  })

  it('中文引号结构 + 值内 URL：先转引号再剥注释（换序回归锁）', () => {
    // 0916 晚 review 复核发现：旧顺序先剥注释，扫描器只认 ASCII 引号为字符串边界，
    // 值内 URL 的 // 被当行注释砍掉（http:// → http:+换行）→ parse 必败。
    const raw = '{“img”: “https://x.cn/a.png”, “name”: “甲板”}'
    const parsed = parseJsonString(raw)
    expect(parsed.img).toBe('https://x.cn/a.png')
    expect(parsed.name).toBe('甲板')
  })

  it('混合场景：值内中文引号保留，尾随逗号由第 2 级修复', () => {
    // 真实故障模式：值内中文引号（合法字符）+ 尾随逗号（非法）——
    // 恢复路径必须只修结构、不动内容
    const raw = '{"a":"他说：\u201c你好\u201d","b":1,}'
    const parsed = parseJsonString(raw)
    expect(parsed.a).toContain('\u201c你好\u201d')
    expect(parsed.b).toBe(1)
  })

  it("值内非法转义 \\' 被修复", () => {
    const raw = `{"line":"他说：\\'天黑了\\'"}`.replace(/\\"/g, '"')
    const parsed = parseJsonString(raw)
    expect(parsed.line).toBe("他说：'天黑了'")
  })
})

describe('isJsonTruncated（既有行为回归）', () => {
  it('未闭合 JSON 判定为截断', () => {
    expect(isJsonTruncated('{"scenes": [{"id": "s1"}')).toBe(true)
    expect(isJsonTruncated('{"scenes": []}')).toBe(false)
  })
})
