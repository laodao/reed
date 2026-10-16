/**
 * faceMeshTopology 拓扑完整性测试
 * @see src/renderer/src/components/portrait/geometry/faceMeshTopology.ts
 *
 * 锁定从 @mediapipe/face_mesh 提取的常量数据正确性：
 * 三角形数量、索引范围、顶点全覆盖、语义分组对称。
 */
import { describe, expect, it } from 'vitest'
import {
  FACEMESH_TRIANGLES,
  FACE_OVAL_VERTS,
  LEFT_EYE_VERTS,
  RIGHT_EYE_VERTS,
  LEFT_EYEBROW_VERTS,
  RIGHT_EYEBROW_VERTS,
  LIPS_VERTS,
  FACE_VERTEX_COUNT,
} from '@/components/portrait/geometry/faceMeshTopology'

describe('faceMeshTopology 拓扑完整性', () => {
  it('FACE_VERTEX_COUNT = 468（不含 iris）', () => {
    expect(FACE_VERTEX_COUNT).toBe(468)
  })

  it('FACEMESH_TRIANGLES 共 852 个三角形', () => {
    expect(FACEMESH_TRIANGLES).toHaveLength(852)
  })

  it('所有三角形索引 ∈ [0,467] 且三顶点互异', () => {
    for (const [a, b, c] of FACEMESH_TRIANGLES) {
      for (const i of [a, b, c]) {
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(468)
      }
      expect(new Set([a, b, c]).size).toBe(3)
    }
  })

  it('468 顶点全部被三角形引用（网格全覆盖）', () => {
    const used = new Set<number>()
    for (const [a, b, c] of FACEMESH_TRIANGLES) {
      used.add(a)
      used.add(b)
      used.add(c)
    }
    expect(used.size).toBe(468)
  })

  it('语义分组顶点集合法且非空', () => {
    const groups = {
      FACE_OVAL_VERTS,
      LEFT_EYE_VERTS,
      RIGHT_EYE_VERTS,
      LEFT_EYEBROW_VERTS,
      RIGHT_EYEBROW_VERTS,
      LIPS_VERTS,
    }
    for (const [name, verts] of Object.entries(groups)) {
      expect(verts.length, name).toBeGreaterThan(0)
      for (const v of verts) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(468)
      }
    }
  })

  it('左右眼 / 左右眉顶点集对称且互不重叠', () => {
    expect(LEFT_EYE_VERTS.length).toBe(RIGHT_EYE_VERTS.length)
    expect(LEFT_EYEBROW_VERTS.length).toBe(RIGHT_EYEBROW_VERTS.length)
    const lEye = new Set(LEFT_EYE_VERTS)
    expect(RIGHT_EYE_VERTS.every(v => !lEye.has(v))).toBe(true)
    const lBrow = new Set(LEFT_EYEBROW_VERTS)
    expect(RIGHT_EYEBROW_VERTS.every(v => !lBrow.has(v))).toBe(true)
  })
})
