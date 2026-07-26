/**
 * 面容关键点检测器封装
 * @module portrait/geometry/useFaceLandmarks
 * @description FaceLandmarker 单例懒加载 + variantId 级缓存 + 降级返回 null。
 *              纯渲染进程运行（WASM），模型经 vite public / resources 本地提供。
 *              spec 2026-07-25-face-geometry-studio §F1
 */
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { Point } from './faceMetrics'

export interface DetectResult {
  landmarks: Point[]
  /** 面框（用于占比校验与标注） */
  faceBox: { x: number; y: number; width: number; height: number }
}

export interface DetectFailure {
  reason: 'no_face' | 'face_too_small' | 'load_failed' | 'detect_failed'
  message: string
}

/** 面部占比下限（spec D2：仅半身像，面框高 ≥ 图像高 15%） */
const FACE_MIN_RATIO = 0.15

let landmarkerPromise: Promise<FaceLandmarker> | null = null
const cache = new Map<string, DetectResult | DetectFailure>()

/** 单例懒加载（WASM 与模型均走本地 /models 路径，不走 CDN） */
function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks('/models/facemesh/wasm')
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/facemesh/face_landmarker.task' },
        runningMode: 'IMAGE',
        numFaces: 1,
      })
    })()
  }
  return landmarkerPromise
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

/**
 * 检测图片面容关键点。
 * @param imageUrl 图片地址（local-image:// 或 data URL）
 * @param cacheKey 缓存键（通常为 variantId）
 * @returns 成功返回 DetectResult；失败返回 DetectFailure（不抛异常，调用方降级）
 */
export async function detectFaceLandmarks(
  imageUrl: string,
  cacheKey: string,
): Promise<DetectResult | DetectFailure> {
  const cached = cache.get(cacheKey)
  if (cached) return cached

  let result: DetectResult | DetectFailure
  try {
    const [landmarker, img] = await Promise.all([getLandmarker(), loadImage(imageUrl)])
    const detection = landmarker.detect(img)

    if (!detection.faceLandmarks || detection.faceLandmarks.length === 0) {
      result = { reason: 'no_face', message: '未检测到清晰人脸，请使用正面半身像' }
    } else {
      const points = detection.faceLandmarks[0]
      const w = img.naturalWidth
      const h = img.naturalHeight
      const landmarks: Point[] = points.map(p => ({ x: p.x * w, y: p.y * h, z: p.z }))

      const xs = landmarks.map(p => p.x)
      const ys = landmarks.map(p => p.y)
      const faceBox = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      }

      if (faceBox.height < h * FACE_MIN_RATIO) {
        result = {
          reason: 'face_too_small',
          message: '面部占比过小（<15%），本功能仅支持半身像',
        }
      } else {
        result = { landmarks, faceBox }
      }
    }
  } catch (error) {
    console.error('[useFaceLandmarks] 检测失败:', error)
    result = {
      reason: error instanceof Error && /wasm|model|fetch/i.test(error.message) ? 'load_failed' : 'detect_failed',
      message: error instanceof Error ? error.message : '检测失败',
    }
  }

  cache.set(cacheKey, result)
  return result
}

export function isDetectFailure(r: DetectResult | DetectFailure): r is DetectFailure {
  return 'reason' in r
}
