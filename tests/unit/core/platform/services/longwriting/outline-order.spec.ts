/**
 * 章号文档序原语单测（复核修复 P1-1）
 * @description 覆盖三类树形：扁平章、多卷树（旧扁平排序会交错）、卷→章→节
 */
import { describe, expect, it } from 'vitest'
import {
  buildOutlineDocOrder,
  isWritableOutlineNode,
  outlineChapterNumber,
  type OutlineNodeLike,
} from '@core/platform/services/longwriting/outline-order'

function node(overrides: Partial<OutlineNodeLike> & { id: string }): OutlineNodeLike {
  return { nodeType: 'chapter', orderIndex: 1, parentId: null, ...overrides }
}

describe('buildOutlineDocOrder', () => {
  it('扁平章树：与 orderIndex 顺序一致（无回归）', () => {
    const nodes = [
      node({ id: 'c1', orderIndex: 1 }),
      node({ id: 'c2', orderIndex: 2 }),
      node({ id: 'c3', orderIndex: 3 }),
    ]
    const order = buildOutlineDocOrder(nodes)
    expect([...order.leafNumbers.entries()]).toEqual([
      ['c1', 1],
      ['c2', 2],
      ['c3', 3],
    ])
  })

  it('多卷树：旧扁平排序会交错，文档序按卷内顺序编号', () => {
    // 两卷各 3 章；orderIndex 是兄弟序——旧实现全局排序 v1c1,v2c1,v1c2,v2c2…
    const nodes = [
      node({ id: 'vol1', nodeType: 'volume', orderIndex: 1 }),
      node({ id: 'vol2', nodeType: 'volume', orderIndex: 2 }),
      node({ id: 'v1c1', parentId: 'vol1', orderIndex: 1 }),
      node({ id: 'v1c2', parentId: 'vol1', orderIndex: 2 }),
      node({ id: 'v2c1', parentId: 'vol2', orderIndex: 1 }),
      node({ id: 'v2c2', parentId: 'vol2', orderIndex: 2 }),
    ]
    const order = buildOutlineDocOrder(nodes)
    expect(order.leafNumbers.get('v1c1')).toBe(1)
    expect(order.leafNumbers.get('v1c2')).toBe(2)
    expect(order.leafNumbers.get('v2c1')).toBe(3)
    expect(order.leafNumbers.get('v2c2')).toBe(4)
    // 卷不是可写节点，无章号
    expect(order.leafNumbers.has('vol1')).toBe(false)
  })

  it('卷→章→节：节也计章号（正文可挂节）；章号连续', () => {
    const nodes = [
      node({ id: 'vol', nodeType: 'volume', orderIndex: 1 }),
      node({ id: 'c1', parentId: 'vol', orderIndex: 1 }),
      node({ id: 'c1s1', parentId: 'c1', nodeType: 'section', orderIndex: 1 }),
      node({ id: 'c1s2', parentId: 'c1', nodeType: 'section', orderIndex: 2 }),
      node({ id: 'c2', parentId: 'vol', orderIndex: 2 }),
    ]
    const order = buildOutlineDocOrder(nodes)
    expect(order.leafNumbers.get('c1')).toBe(1)
    expect(order.leafNumbers.get('c1s1')).toBe(2)
    expect(order.leafNumbers.get('c1s2')).toBe(3)
    expect(order.leafNumbers.get('c2')).toBe(4)
    expect(order.ordered.map((n) => n.id)).toEqual(['vol', 'c1', 'c1s1', 'c1s2', 'c2'])
  })

  it('孤儿节点（parentId 指向不存在节点）按根处理', () => {
    const nodes = [
      node({ id: 'ghost-child', parentId: 'no-such-parent', orderIndex: 2 }),
      node({ id: 'root', orderIndex: 1 }),
    ]
    const order = buildOutlineDocOrder(nodes)
    // 根排序：root(orderIndex 1) 在 ghost-child(2) 前
    expect(order.ordered.map((n) => n.id)).toEqual(['root', 'ghost-child'])
    expect(order.leafNumbers.get('root')).toBe(1)
    expect(order.leafNumbers.get('ghost-child')).toBe(2)
  })

  it('outlineChapterNumber：非可写节点/未知 id 返回 null', () => {
    const order = buildOutlineDocOrder([node({ id: 'c1' }), node({ id: 'vol', nodeType: 'volume' })])
    expect(outlineChapterNumber(order, 'c1')).toBe(1)
    expect(outlineChapterNumber(order, 'vol')).toBeNull()
    expect(outlineChapterNumber(order, 'missing')).toBeNull()
    expect(isWritableOutlineNode({ id: 'x', nodeType: 'section' })).toBe(true)
    expect(isWritableOutlineNode({ id: 'x', nodeType: 'volume' })).toBe(false)
  })
})
