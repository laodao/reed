/**
 * 面部语义测量——从 MediaPipe 478 点提取三庭/眼/鼻/嘴等语义参数
 * @module portrait/geometry/faceMeasure
 * @description 照搬 face-sculpt-demo 的 measure() 设计：关键点仅用于"测量"，
 *   得到面部中线、纵向分界线、眼/鼻/嘴参数（M），变形通过规则网格位移场驱动。
 *   纯函数，不依赖 canvas/DOM，可单测。
 */
import type { Point } from './faceMetrics'
import {
  LM_GLABELLA,
  LM_FOREHEAD_TOP,
  LM_SUBNASALE,
  LM_CHIN_BOTTOM,
  LM_UPPER_LIP_MID,
  LM_LOWER_LIP_MID,
  LM_NOSE_TIP,
} from './landmarkIndices'

// ── face-sculpt-demo 专用的附加索引（仅本模块使用） ──

/** 左虹膜中心（MediaPipe 478 点中的 iris landmarks） */
const LM_LEFT_IRIS = 468
/** 右虹膜中心 */
const LM_RIGHT_IRIS = 473
/** 鼻梁顶（两眼之间，鼻骨最上端） */
const LM_NOSE_BRIDGE_TOP = 168
/** 左鼻翼 */
const LM_ALA_LEFT = 129
/** 右鼻翼 */
const LM_ALA_RIGHT = 358
/** 上唇内缘中点 */
const LM_LIP_INNER_UP = 13
/** 下唇内缘中点 */
const LM_LIP_INNER_LO = 14
/** 左嘴角 */
const LM_MOUTH_LEFT = 61
/** 右嘴角 */
const LM_MOUTH_RIGHT = 291
/** 左眼下缘（眼部/鼻部分界） */
const LM_EYE_LOWER_L = 145
/** 右眼下缘 */
const LM_EYE_LOWER_R = 374
/** 右眼外眼角（图左） */
const LM_EYE_OUTER_R = 33
/** 左眼外眼角（图右） */
const LM_EYE_OUTER_L = 263
/** 右颧骨 */
const LM_CHEEKBONE_R = 116
/** 左颧骨 */
const LM_CHEEKBONE_L = 345
/** 面宽左端（zygoma） */
const LM_FACE_LEFT = 234
/** 面宽右端（zygoma） */
const LM_FACE_RIGHT = 454

// ── 类型 ──

export interface FaceMeasure {
  /** 中轴线 x */
  midX: number
  /** 半脸宽 */
  halfW: number

  // 纵向 7 条分界线（归一化 y，0-1），从上到下
  yTop: number      // 额顶（上庭上界）
  yBrow: number     // 眉心（上庭/眼部分界）
  yEye: number      // 眼下缘（眼部/鼻部分界）
  yNose: number     // 鼻底（鼻部/人中分界）
  yLip: number      // 上唇顶（人中/嘴部分界）
  yMouth: number    // 下唇底（嘴部/下巴分界）
  yChin: number     // 下巴底

  // 眼睛
  eyes: [Point, Point]         // [左虹膜, 右虹膜]
  eyeGap: number               // 眼距
  eyeSigma: number             // 眼距高斯 sigma
  eyeRadius: number            // 眼部影响半径

  // 鼻子
  noseTop: Point               // 鼻梁顶
  noseTip: Point               // 鼻尖
  noseHalfW: number            // 鼻半宽

  // 嘴巴
  mouthC: Point                // 嘴心
  mouthHalfW: number           // 嘴半宽

  // 精调用
  eyeOuter: [Point, Point]     // [右外眼角, 左外眼角]
  cheekbones: [Point, Point]   // [右颧骨, 左颧骨]
  cheekY: number               // 颧骨平均 y
  mCorners: [Point, Point]     // [左嘴角, 右嘴角]
  lipTopPt: Point              // 上唇顶
}

// ── 测量函数 ──

/**
 * 从 478 个归一化关键点提取面部语义参数 M。
 * 参照 face-sculpt-demo app.js measure()。
 * @param landmarks 归一化坐标（0-1），含可选 z
 */
export function measureFace(landmarks: Point[]): FaceMeasure {
  const g = (i: number) => landmarks[i]

  // ── 中轴线 + 脸宽 ──
  const faceL = g(LM_FACE_LEFT)
  const faceR = g(LM_FACE_RIGHT)
  const midX = (faceL.x + faceR.x) / 2
  const halfW = Math.max(1e-4, (faceR.x - faceL.x) / 2)

  // ── 纵向 7 条分界线（从上到下） ──
  const yTop = g(LM_FOREHEAD_TOP).y
  const yBrow = g(LM_GLABELLA).y
  const yEye = (g(LM_EYE_LOWER_L).y + g(LM_EYE_LOWER_R).y) / 2
  const yNose = g(LM_SUBNASALE).y
  const yLip = g(LM_UPPER_LIP_MID).y
  const yMouth = g(LM_LOWER_LIP_MID).y
  const yChin = g(LM_CHIN_BOTTOM).y

  // ── 眼睛 ──
  const li = g(LM_LEFT_IRIS)
  const ri = g(LM_RIGHT_IRIS)
  const eyeGap = Math.abs(ri.x - li.x)
  const eyeSigma = Math.max(0.02, eyeGap * 0.42)
  const eyeRadius = Math.max(0.02, eyeGap * 0.33)

  // ── 鼻子 ──
  const noseTop = g(LM_NOSE_BRIDGE_TOP)
  const noseTip = g(LM_NOSE_TIP)
  const alaL = g(LM_ALA_LEFT)
  const alaR = g(LM_ALA_RIGHT)
  const noseHalfW = Math.max(0.01, Math.abs(alaR.x - alaL.x) / 2)

  // ── 嘴巴 ──
  const lipU = g(LM_LIP_INNER_UP)
  const lipL = g(LM_LIP_INNER_LO)
  const mouthC: Point = { x: (lipU.x + lipL.x) / 2, y: (lipU.y + lipL.y) / 2 }
  const mL = g(LM_MOUTH_LEFT)
  const mR = g(LM_MOUTH_RIGHT)
  const mouthHalfW = Math.max(0.01, Math.abs(mR.x - mL.x) / 2)

  // ── 精调用 ──
  const eyeOuter: [Point, Point] = [g(LM_EYE_OUTER_R), g(LM_EYE_OUTER_L)]
  const cheekbones: [Point, Point] = [g(LM_CHEEKBONE_R), g(LM_CHEEKBONE_L)]
  const cheekY = (cheekbones[0].y + cheekbones[1].y) / 2
  const mCorners: [Point, Point] = [mL, mR]
  const lipTopPt = g(LM_UPPER_LIP_MID)

  return {
    midX, halfW,
    yTop, yBrow, yEye, yNose, yLip, yMouth, yChin,
    eyes: [li, ri],
    eyeGap, eyeSigma, eyeRadius,
    noseTop, noseTip, noseHalfW,
    mouthC, mouthHalfW,
    eyeOuter, cheekbones, cheekY, mCorners, lipTopPt,
  }
}
