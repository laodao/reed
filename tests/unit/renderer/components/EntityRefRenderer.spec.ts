/**
 * entity-ref-parser 单测（FU5-A2）
 *
 * 测纯函数 parseEntityRefs（@xxx 文本切分 + entity 字典查找）。
 * 组件本身（EntityRefRenderer.vue）只是渲染层，不需单测；逻辑全在 parser。
 */
import { describe, it, expect } from 'vitest'
import {
  parseEntityRefs,
  type EntityRefMeta,
} from '../../../../src/renderer/src/components/episode-production/shared/entity-ref-parser'

describe('parseEntityRefs', () => {
  it('单个 linked_lw @xxx 切分为 entity + text 段', () => {
    const segs = parseEntityRefs('@张三 走入茶馆', [
      { name: '张三', sourceType: 'linked_lw' },
    ])
    expect(segs.length).toBe(2)
    expect(segs[0]).toMatchObject({
      type: 'entity',
      name: '张三',
      sourceType: 'linked_lw',
    })
    expect(segs[1]).toMatchObject({ type: 'text', text: ' 走入茶馆' })
  })

  it('standalone 来源原样返回 sourceType', () => {
    const segs = parseEntityRefs('@老板娘 走过', [
      { name: '老板娘', sourceType: 'standalone' },
    ])
    const ent = segs.find(s => s.type === 'entity')
    expect(ent).toMatchObject({ sourceType: 'standalone' })
  })

  it('多个 @xxx 按顺序切分', () => {
    const ents: EntityRefMeta[] = [
      { name: '张三', sourceType: 'linked_lw' },
      { name: '折扇', sourceType: 'linked_lw' },
      { name: '茶馆', sourceType: 'linked_lw' },
    ]
    const segs = parseEntityRefs('@张三 收起 @折扇，走向 @茶馆', ents)
    const entities = segs.filter(s => s.type === 'entity')
    expect(entities.length).toBe(3)
    expect(entities.map(e => (e as any).name)).toEqual(['张三', '折扇', '茶馆'])
  })

  it('容错：未知 @xxx 不替换、保留为文本', () => {
    const segs = parseEntityRefs('@未知人物 路过 @张三', [
      { name: '张三', sourceType: 'linked_lw' },
    ])
    const entities = segs.filter(s => s.type === 'entity')
    expect(entities.length).toBe(1)
    expect((entities[0] as any).name).toBe('张三')
    // @未知人物 仍在 text 段
    const fullText = segs
      .filter(s => s.type === 'text')
      .map(s => (s as any).text)
      .join('')
    expect(fullText).toContain('@未知人物')
  })

  it('空文本返回空数组', () => {
    expect(parseEntityRefs('', [])).toEqual([])
    expect(parseEntityRefs('', [{ name: '张三', sourceType: 'linked_lw' }])).toEqual([])
  })

  it('entity 含 id 时透传到 segment', () => {
    const segs = parseEntityRefs('@张三', [
      { name: '张三', sourceType: 'linked_lw', id: 'cb_001' },
    ])
    expect(segs[0]).toMatchObject({ id: 'cb_001' })
  })

  it('中文标点边界：@张三，缓缓 → 切到"张三" 不吞标点', () => {
    const segs = parseEntityRefs('@张三，缓缓走入', [
      { name: '张三', sourceType: 'linked_lw' },
    ])
    const ent = segs.find(s => s.type === 'entity') as any
    expect(ent.name).toBe('张三')
    const tail = segs.find(s => s.type === 'text') as any
    expect(tail.text).toBe('，缓缓走入')
  })

  it('英文标点边界：@john, hi → 切到"john"', () => {
    const segs = parseEntityRefs('@john, hi', [
      { name: 'john', sourceType: 'linked_lw' },
    ])
    const ent = segs.find(s => s.type === 'entity') as any
    expect(ent.name).toBe('john')
  })

  it('段顺序保留：原文前置纯文本不丢失', () => {
    const segs = parseEntityRefs('开头文字 @张三 中间', [
      { name: '张三', sourceType: 'linked_lw' },
    ])
    expect(segs[0]).toMatchObject({ type: 'text', text: '开头文字 ' })
    expect(segs[1]).toMatchObject({ type: 'entity', name: '张三' })
    expect(segs[2]).toMatchObject({ type: 'text', text: ' 中间' })
  })
})
