/**
 * 图像边界 mesh（boundary triangles）
 * @module portrait/geometry/boundaryMesh
 * @description 在 468 脸部关键点之外，沿图像四条边生成边界点 + 过渡三角，
 *   让变形场从脸中心向外单调衰减到图像边缘（边界点 source==target，位移=0）。
 *
 *   照搬 ComfyUI_FaceProcessor 的 create_boundary_triangles 设计（core/base_mesh.py）：
 *   脸椭圆分段连到图像四边插值点，整张图参与变形，消除「让出区」与边界硬边。
 *   - top 边：脸点 [54..284] 连到上边 9 点（8 段）
 *   - right 边：脸点 [284..365] 连到右边 10 点（9 段）
 *   - bottom 边：脸点 [365..136] 连到下边 11 点（10 段）
 *   - left 边：脸点 [136..54] 连到左边 10 点（9 段）
 *   四条边首尾相连构成脸椭圆完整一圈。共 40 边界点 + 72 边界三角。
 *
 *   边界点坐标为图像像素坐标（归一化 0-1 × 尺寸），source==target（恒等锚点）。
 *   纯函数，不依赖 DOM/canvas，可单测。
 */
import type { Point } from './faceMetrics'

/** 脸部基础顶点数（MediaPipe 468，不含 iris）；边界点索引从此起 */
export const BASE_VERTEX_COUNT = 468

/** 边定义：脸椭圆上一段 landmarks + 图像边的起止归一化坐标 + 分段数 */
interface EdgeDef {
  /** 脸椭圆上的关键点索引（沿边走向，首尾与邻边衔接） */
  landmarks: number[]
  /** 边起点归一化坐标 (x, y)，左上角为 (0,0) */
  start: [number, number]
  /** 边终点归一化坐标 (x, y) */
  end: [number, number]
  /** 分段数（= landmarks 数 - 1，每段一个 quad -> 2 三角） */
  segments: number
}

/**
 * 四条边的配置（照搬 ComfyUI base_mesh.py edges 表，首尾相连）。
 * top 末点 284 = right 首点；right 末点 365 = bottom 首点；
 * bottom 末点 136 = left 首点；left 末点 54 = top 首点。
 */
const EDGES: EdgeDef[] = [
  { landmarks: [54, 103, 67, 109, 10, 338, 297, 332, 284], start: [0, 0], end: [1, 0], segments: 8 },
  { landmarks: [284, 251, 389, 356, 454, 323, 361, 288, 397, 365], start: [1, 0], end: [1, 1], segments: 9 },
  { landmarks: [365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136], start: [1, 1], end: [0, 1], segments: 10 },
  { landmarks: [136, 172, 58, 132, 93, 234, 127, 162, 21, 54], start: [0, 1], end: [0, 0], segments: 9 },
]

/** 沿边插值 nSegments+1 个归一化点（t=0..1，含两端） */
function interpolateEdge(start: [number, number], end: [number, number], nSegments: number): Point[] {
  const pts: Point[] = []
  for (let i = 0; i <= nSegments; i++) {
    const t = i / nSegments
    pts.push({
      x: start[0] + t * (end[0] - start[0]),
      y: start[1] + t * (end[1] - start[1]),
    })
  }
  return pts
}

export interface BoundaryMesh {
  /** 边界点像素坐标（长度 40） */
  points: Point[]
  /** 边界三角顶点索引（指向 [0,468) 脸点 + [468,508) 边界点；长度 72） */
  triangles: [number, number, number][]
}

/**
 * 生成图像边界 mesh：边界点（像素坐标）+ 过渡三角。
 *
 * 边界点索引从 BASE_VERTEX_COUNT(468) 起，连续递增到 507。
 * 渲染时边界点 source==target（位移=0），使变形场从脸中心衰减到图像边缘为恒等。
 *
 * @param width 图像宽（像素）
 * @param height 图像高（像素）
 * @returns { points, triangles }
 */
export function createBoundaryMesh(width: number, height: number): BoundaryMesh {
  const points: Point[] = []
  const triangles: [number, number, number][] = []
  let currentIdx = BASE_VERTEX_COUNT

  for (const edge of EDGES) {
    const edgePoints = interpolateEdge(edge.start, edge.end, edge.segments)

    // 边界点转像素坐标
    for (const p of edgePoints) {
      points.push({ x: p.x * width, y: p.y * height })
    }

    // 每段一个 quad [脸点i, 脸点i+1, 边界点i+1, 边界点i] -> 2 三角
    for (let i = 0; i < edge.segments; i++) {
      const lm0 = edge.landmarks[i]
      const lm1 = edge.landmarks[i + 1]
      const bp0 = currentIdx + i
      const bp1 = currentIdx + i + 1
      triangles.push([lm0, lm1, bp1])
      triangles.push([lm0, bp1, bp0])
    }

    currentIdx += edgePoints.length
  }

  return { points, triangles }
}
