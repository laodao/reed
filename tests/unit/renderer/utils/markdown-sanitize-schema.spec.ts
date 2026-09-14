/**
 * bytemd sanitize schema 变更器测试（extendSanitizeSchema）
 * @module tests/unit/renderer/utils/markdown-sanitize-schema.spec
 *
 * 背景（2026-09-12 修「公式不渲染」）：bytemd 的 `sanitize` 是 schema 变更器而不是
 * HTML 消毒器；误用会让 `className` 白名单丢失，插件类名锚点全部失效。
 * 本 spec 钉死变更器的行为契约（幂等、无副作用、只放开类名、其余白名单不动）。
 */

import { describe, it, expect } from 'vitest'
import { extendSanitizeSchema, type HastSanitizeSchema } from '@/utils/markdown-sanitize-schema'

/** 模拟 bytemd 调用前的 schema（已是 hast-util-sanitize 的 GitHub 默认白名单形状） */
function baseSchema(): HastSanitizeSchema {
  return {
    tagNames: ['p', 'span', 'code'],
    attributes: {
      '*': ['abbr', 'accept'],
      a: [['href', 'http', 'https']],
      li: [['className', 'task-list-item']],
    },
    clobberPrefix: 'user-content-',
  }
}

describe('extendSanitizeSchema', () => {
  it('把 className 追加进全局属性白名单（插件靠它定位渲染锚点）', () => {
    const out = extendSanitizeSchema(baseSchema())
    expect(out.attributes!['*']).toContain('className')
    // 原有全局属性不被丢弃
    expect(out.attributes!['*']).toContain('abbr')
  })

  it('幂等：重复调用不产生重复项', () => {
    const once = extendSanitizeSchema(baseSchema())
    const twice = extendSanitizeSchema(once)
    const global = twice.attributes!['*'].filter((a) => a === 'className')
    expect(global).toHaveLength(1)
  })

  it('纯函数：不修改入参', () => {
    const input = baseSchema()
    const snapshot = JSON.stringify(input)
    extendSanitizeSchema(input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('不放开 style / 事件属性 / id（安全面保持默认口径）', () => {
    const out = extendSanitizeSchema(baseSchema())
    const global = out.attributes!['*']
    expect(global).not.toContain('style')
    expect(global).not.toContain('onerror')
    expect(global).not.toContain('id')
  })

  it('保留 rest 字段（tagNames/protocols/clobberPrefix 等原样透传）', () => {
    const out = extendSanitizeSchema(baseSchema())
    expect(out.tagNames).toEqual(['p', 'span', 'code'])
    expect(out.clobberPrefix).toBe('user-content-')
    expect(out.attributes!.li).toEqual([['className', 'task-list-item']])
  })

  it('schema 缺少 attributes 时不崩（容错成只含 className 的全局白名单）', () => {
    const out = extendSanitizeSchema({ tagNames: ['p'] })
    expect(out.attributes!['*']).toEqual(['className'])
  })
})
