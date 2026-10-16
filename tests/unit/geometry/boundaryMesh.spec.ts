/**
 * boundaryMesh 单元测试
 * @see src/renderer/src/components/portrait/geometry/boundaryMesh.ts
 *
 * 验证图像边界 mesh 生成：40 边界点 + 72 边界三角，
 * 照搬 ComfyUI_FaceProcessor base_mesh.py 的 edges 表设计。
 * 纯函数测试，不依赖 DOM/canvas。
 */
import { describe, expect, it } from 'vitest'
import {
  createBoundaryMesh,
  BASE_VERTEX_COUNT,
} from '@/components/portrait/geometry/boundaryMesh'

describe('createBoundaryMesh', () => {
  it('生成 40 个边界点（top9 + right10 + bottom11 + left10）', () => {
    const mesh = createBoundaryMesh(100, 100)
    expect(mesh.points).toHaveLength(40)
  })

  it('生成 72 个边界三角（36 段 × 2）', () => {
    const mesh = createBoundaryMesh(100, 100)
    expect(mesh.triangles).toHaveLength(72)
  })

  it('BASE_VERTEX_COUNT = 468（MediaPipe 脸点数，边界点索引从此起）', () => {
    expect(BASE_VERTEX_COUNT).toBe(468)
  })

  it('四角坐标正确（100x100 图）', () => {
    const mesh = createBoundaryMesh(100, 100)
    // top 边：索引 0 = (0,0)，索引 8 = (100,0)
    expect(mesh.points[0]).toEqual({ x: 0, y: 0 })
    expect(mesh.points[8]).toEqual({ x: 100, y: 0 })
    // right 边：索引 9 = (100,0)，索引 18 = (100,100)
    expect(mesh.points[9]).toEqual({ x: 100, y: 0 })
    expect(mesh.points[18]).toEqual({ x: 100, y: 100 })
    // bottom 边：索引 19 = (100,100)，索引 29 = (0,100)
    expect(mesh.points[19]).toEqual({ x: 100, y: 100 })
    expect(mesh.points[29]).toEqual({ x: 0, y: 100 })
    // left 边：索引 30 = (0,100)，索引 39 = (0,0)
    expect(mesh.points[30]).toEqual({ x: 0, y: 100 })
    expect(mesh.points[39]).toEqual({ x: 0, y: 0 })
  })

  it('四角衔接：相邻边共享角点坐标（索引不同但坐标相同）', () => {
    const mesh = createBoundaryMesh(200, 150)
    // top 末(8) = right 首(9) = (200,0)
    expect(mesh.points[8]).toEqual(mesh.points[9])
    // right 末(18) = bottom 首(19) = (200,150)
    expect(mesh.points[18]).toEqual(mesh.points[19])
    // bottom 末(29) = left 首(30) = (0,150)
    expect(mesh.points[29]).toEqual(mesh.points[30])
    // left 末(39) = top 首(0) = (0,0)
    expect(mesh.points[39]).toEqual(mesh.points[0])
  })

  it('所有三角顶点索引在 [0, 508) 范围内（468 脸点 + 40 边界点）', () => {
    const mesh = createBoundaryMesh(100, 100)
    for (const [a, b, c] of mesh.triangles) {
      for (const v of [a, b, c]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(508)
      }
    }
  })

  it('每个边界三角都含脸点（<468）和边界点（>=468）', () => {
    const mesh = createBoundaryMesh(100, 100)
    for (const [a, b, c] of mesh.triangles) {
      const hasBoundary = [a, b, c].some((v) => v >= BASE_VERTEX_COUNT)
      const hasFace = [a, b, c].some((v) => v < BASE_VERTEX_COUNT)
      expect(hasBoundary).toBe(true)
      expect(hasFace).toBe(true)
    }
  })

  it('坐标按图像尺寸缩放（200x150 图）', () => {
    const mesh = createBoundaryMesh(200, 150)
    // top 边 y=0，x 从 0 到 200 均匀 9 点
    for (let i = 0; i < 9; i++) {
      expect(mesh.points[i].y).toBe(0)
      expect(mesh.points[i].x).toBeCloseTo((i / 8) * 200, 5)
    }
    // right 边 x=200，y 从 0 到 150 均匀 10 点
    for (let i = 0; i < 10; i++) {
      expect(mesh.points[9 + i].x).toBe(200)
      expect(mesh.points[9 + i].y).toBeCloseTo((i / 9) * 150, 5)
    }
    // bottom 边 y=150，x 从 200 到 0 均匀 11 点
    for (let i = 0; i < 11; i++) {
      expect(mesh.points[19 + i].y).toBe(150)
      expect(mesh.points[19 + i].x).toBeCloseTo(200 - (i / 10) * 200, 5)
    }
  })

  it('边界点索引从 468 连续递增到 507', () => {
    const mesh = createBoundaryMesh(100, 100)
    // 边界点在三角中出现的最小索引应 >= 468
    const boundaryIndices = new Set<number>()
    for (const [a, b, c] of mesh.triangles) {
      for (const v of [a, b, c]) {
        if (v >= BASE_VERTEX_COUNT) boundaryIndices.add(v)
      }
    }
    expect(boundaryIndices.size).toBe(40)
    expect(Math.min(...boundaryIndices)).toBe(468)
    expect(Math.max(...boundaryIndices)).toBe(507)
  })
})
