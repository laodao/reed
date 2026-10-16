/**
 * 平滑位移场——规则网格变形核心（照搬 face-sculpt-demo evalField 设计）
 * @module portrait/geometry/displacementField
 * @description 基于 FaceMeasure（M）和 WarpParams，计算任意归一化坐标 (x,y) 的
 *   变形后位置 (x',y')。所有维度独立计算后叠加，用高斯/smoothstep 遮罩限定范围。
 *   纵向：piecewise 分段线性 y 重映射，首尾钉死在 0/1。
 *   横向：(滑块值-1) × (点到支点向量) × 遮罩(点位置)。
 *   纯函数，不依赖 canvas/DOM，可单测。
 *
 *   注：除 eyeSize（眼睛大小）与 noseTipLift/noseTipSize（鼻尖上翘/大小）外，
 *   其余参数保持原始实现（gauss2D 无限尾部），按用户要求还原。
 */
import type { FaceMeasure } from './faceMeasure'
import type { WarpParams } from './bandWarp'

// ── 数学工具（纯函数，方便测试） ──

export function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, x))
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** 单调分段线性映射：xs 分界线 → ys 对应值 */
export function piecewise(y: number, xs: number[], ys: number[]): number {
  if (y <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) {
    if (y <= xs[i]) {
      const t = (y - xs[i - 1]) / (xs[i] - xs[i - 1])
      return ys[i - 1] + t * (ys[i] - ys[i - 1])
    }
  }
  return ys[ys.length - 1]
}

// ── 位移场参数 ──

/** 展开后的位移场参数（WarpParams + 纵向分界线映射） */
export interface FieldParams {
  // 整体
  faceW: number; jaw: number; eye: number
  // 纵向 6 带缩放系数
  foreH: number; eyeH: number; noseH: number
  philH: number; mouthH: number; chinH: number
  // 横向 6 带缩放系数
  bridgeW: number; alaW: number; philW: number
  mouthW: number; chinW: number; cheekW: number
  // 五官精调
  eyeSize: number; eyeTilt: number; eyeLen: number
  noseTipLift: number; noseTipSize: number
  lip: number; cupidH: number; mouthCorner: number
  cheekUp: number; cheekProject: number
  /** 纵向分界线输入序列（归一化 y，长度 9：含首尾 0/1） */
  ysIn: number[]
  /** 纵向分界线输出序列（缩放后的累积位置，长度 9） */
  ysOut: number[]
}

// ── 构建位移场参数 ──

/**
 * 从 FaceMeasure 和用户 WarpParams 构建完整的位移场参数 F。
 * 纵向 6 带各自高度缩放，保持 yTop 固定，逐带累加得到新分界线。
 * 端点 0/1 钉死 → 融入画面边框、不撕裂。
 */
export function buildFieldParams(M: FaceMeasure, params: WarpParams): FieldParams {
  const { yTop, yBrow, yEye, yNose, yLip, yMouth, yChin } = M

  const sFore  = params.foreH ?? 1
  const sEye   = params.eyeH ?? 1
  const sNose  = params.noseH ?? 1
  const sPhil  = params.philH ?? 1
  const sMou   = params.mouthH ?? 1
  const sChin  = params.chinH ?? 1

  let b1 = yTop + (yBrow  - yTop ) * sFore
  let b2 = b1   + (yEye   - yBrow) * sEye
  let b3 = b2   + (yNose  - yEye ) * sNose
  let b4 = b3   + (yLip   - yNose) * sPhil
  let b5 = b4   + (yMouth - yLip ) * sMou
  let b6 = b5   + (yChin  - yMouth) * sChin

  // 保证严格单调、不越过下边界
  b6 = clamp(b6, yTop + 0.06, 0.985)
  b5 = clamp(b5, yTop + 0.05, b6 - 0.004)
  b4 = clamp(b4, yTop + 0.04, b5 - 0.004)
  b3 = clamp(b3, yTop + 0.03, b4 - 0.004)
  b2 = clamp(b2, yTop + 0.02, b3 - 0.004)
  b1 = clamp(b1, yTop + 0.01, b2 - 0.004)

  return {
    faceW:   params.faceW ?? 1,
    jaw:     params.jaw ?? 1,
    eye:     params.eye ?? 0,
    foreH:   sFore,
    eyeH:    sEye,
    noseH:   sNose,
    philH:   sPhil,
    mouthH:  sMou,
    chinH:   sChin,
    bridgeW: params.bridgeW ?? 1,
    alaW:    params.alaW ?? 1,
    philW:   params.philW ?? 1,
    mouthW:  params.mouthW ?? 1,
    chinW:   params.chinW ?? 1,
    cheekW:  params.cheekW ?? 1,
    eyeSize: params.eyeSize ?? 1,
    eyeTilt: params.eyeTilt ?? 0,
    eyeLen:  params.eyeLen ?? 1,
    noseTipLift:  params.noseTipLift ?? 0,
    noseTipSize:  params.noseTipSize ?? 1,
    lip:     params.lip ?? 1,
    cupidH:  params.cupidH ?? 0,
    mouthCorner: params.mouthCorner ?? 0,
    cheekUp:      params.cheekUp ?? 0,
    cheekProject: params.cheekProject ?? 0,
    ysIn:  [0, yTop, yBrow, yEye, yNose, yLip, yMouth, yChin, 1],
    ysOut: [0, yTop, b1,   b2,   b3,    b4,   b5,     b6,    1],
  }
}

// ── 高斯辅助 ──

function gauss2D(px: number, py: number, cx: number, cy: number, sigma: number): number {
  const d2 = (px - cx) ** 2 + (py - cy) ** 2
  return Math.exp(-d2 / (2 * sigma * sigma))
}

/**
 * 紧支撑高斯：标准高斯形状 × 平滑削尾，在 2.4σ 处精确归零。
 * 仅 eyeSize（眼睛大小）与 noseTip（鼻尖上翘/大小）使用——把影响范围
 * 严格限定在目标区域附近，避免普通高斯无限尾部造成的跨区域联动。
 * @param sigma 高斯标准差（归一化坐标）
 */
export function localGauss2D(px: number, py: number, cx: number, cy: number, sigma: number): number {
  if (sigma <= 0) return 0
  const d = Math.hypot(px - cx, py - cy)
  const R = sigma * 2.4
  if (d >= R) return 0
  const w = Math.exp(-(d * d) / (2 * sigma * sigma))
  // 尾部平滑削到 0（R*0.6≈1.44σ 处开始衰减，避免硬切痕）
  return w * (1 - smoothstep(R * 0.6, R, d))
}

// ── 位移场求值 ──

/**
 * 计算归一化坐标 (x, y) 变形后的新坐标 (x', y')。
 * 所有维度独立计算后叠加：x' = x + Σdx, y' = piecewise(y) + Σdy。
 */
export function evalField(x: number, y: number, F: FieldParams, M: FaceMeasure): [number, number] {
  // ── 纵向：三庭重映射 ──
  const ny = piecewise(y, F.ysIn, F.ysOut)

  // ── 横向：眼距（每只眼睛高斯加权平移）──
  let dx = 0
  if (F.eye !== 0) {
    for (const e of M.eyes) {
      const dir = Math.sign(e.x - M.midX) || 1
      const w = gauss2D(x, y, e.x, e.y, M.eyeSigma)
      dx += F.eye * M.eyeGap * dir * w
    }
  }

  // ── 横向衰减遮罩：消除"缩脸空隙"的关键 ──
  // 脸内（< halfW）：全量；脸外平滑衰减至 1.9×半脸宽归零
  const mx = 1 - smoothstep(M.halfW * 1.0, M.halfW * 1.9, Math.abs(x - M.midX))

  // ── 下颌宽度 ──
  if (F.jaw !== 1) {
    const my = smoothstep(M.yBrow, M.yChin, y) *
               (1 - smoothstep(M.yChin + 0.03, M.yChin + 0.13, y))
    dx += (F.jaw - 1) * (x - M.midX) * mx * my
  }

  // ── 脸部整体宽度 ──
  if (F.faceW !== 1) {
    const myf = smoothstep(M.yTop - 0.12, M.yTop - 0.02, y) *
                (1 - smoothstep(M.yChin + 0.02, M.yChin + 0.12, y))
    dx += (F.faceW - 1) * (x - M.midX) * mx * myf
  }

  let dy = 0

  // ── 眼睛大小（绕虹膜径向缩放，紧支撑限定在眼周；σ≈0.55 眼半径，止于眉下/鼻梁前）──
  if (F.eyeSize !== 1) {
    for (const e of M.eyes) {
      const ex = x - e.x, ey = y - e.y
      const w = localGauss2D(x, y, e.x, e.y, M.eyeRadius * 0.55)
      dx += ex * (F.eyeSize - 1) * w
      dy += ey * (F.eyeSize - 1) * w
    }
  }

  // ── 鼻梁宽 ──
  if (F.bridgeW !== 1) {
    const bx = 1 - smoothstep(M.noseHalfW * 0.7, M.noseHalfW * 1.8, Math.abs(x - M.midX))
    const cyB = (M.noseTop.y + M.yNose) / 2
    const syB = Math.max(0.01, (M.yNose - M.noseTop.y) * 0.5)
    const by = gauss2D(x, y, M.midX, cyB, syB)
    dx += (x - M.midX) * (F.bridgeW - 1) * bx * by
  }

  // ── 鼻翼宽 ──
  if (F.alaW !== 1) {
    const ax = 1 - smoothstep(M.noseHalfW * 1.0, M.noseHalfW * 2.2, Math.abs(x - M.midX))
    const ay = Math.exp(-((y - M.yNose) ** 2) / (2 * 0.02 * 0.02))
    dx += (x - M.midX) * (F.alaW - 1) * ax * ay
  }

  // ── 人中宽窄 ──
  if (F.philW !== 1) {
    const mpx = 1 - smoothstep(M.noseHalfW * 0.9, M.noseHalfW * 2.0, Math.abs(x - M.midX))
    const mpy = smoothstep(M.yNose - 0.008, M.yNose + 0.008, y) *
                (1 - smoothstep(M.yLip - 0.008, M.yLip + 0.008, y))
    dx += (x - M.midX) * (F.philW - 1) * mpx * mpy
  }

  // ── 嘴唇厚薄（绕唇中线纵向缩放）──
  if (F.lip !== 1) {
    const sy = M.mouthHalfW * 0.5
    const mlx = 1 - smoothstep(M.mouthHalfW * 0.9, M.mouthHalfW * 1.6, Math.abs(x - M.mouthC.x))
    const dyy = y - M.mouthC.y
    const mly = Math.exp(-(dyy * dyy) / (2 * sy * sy))
    dy += dyy * (F.lip - 1) * mlx * mly
  }

  // ── 嘴巴宽窄 ──
  if (F.mouthW !== 1) {
    const mwx = 1 - smoothstep(M.mouthHalfW * 1.0, M.mouthHalfW * 1.9, Math.abs(x - M.mouthC.x))
    const mwy = smoothstep(M.yLip - 0.015, M.yLip + 0.005, y) *
                (1 - smoothstep(M.yMouth - 0.005, M.yMouth + 0.015, y))
    dx += (x - M.mouthC.x) * (F.mouthW - 1) * mwx * mwy
  }

  // ── 下巴宽窄 ──
  if (F.chinW !== 1) {
    const mcx = 1 - smoothstep(M.halfW * 0.7, M.halfW * 1.5, Math.abs(x - M.midX))
    const mcy = smoothstep(M.yMouth, M.yChin, y)
    dx += (x - M.midX) * (F.chinW - 1) * mcx * mcy
  }

  // ── 五官精调 ──

  // 眼角上扬 / 眼睛拉长
  if (F.eyeTilt !== 0 || F.eyeLen !== 1) {
    for (let i = 0; i < 2; i++) {
      const c = M.eyes[i], oc = M.eyeOuter[i]
      if (F.eyeLen !== 1) {
        const w = gauss2D(x, y, c.x, c.y, M.eyeRadius)
        dx += (x - c.x) * (F.eyeLen - 1) * w
      }
      if (F.eyeTilt !== 0) {
        const w = gauss2D(x, y, c.x, c.y, M.eyeRadius * 1.2)
        const dir = Math.sign(oc.x - c.x) || -1
        const theta = -dir * F.eyeTilt
        dx += -(y - c.y) * theta * w
        dy += (x - c.x) * theta * w
      }
    }
  }

  // 鼻尖上翘 / 大小（紧支撑：2.4σ≈0.62 鼻半宽，止于鼻翼/人中/上唇之前）
  if (F.noseTipLift !== 0 || F.noseTipSize !== 1) {
    const t = M.noseTip
    const w = localGauss2D(x, y, t.x, t.y, M.noseHalfW * 0.26)
    if (F.noseTipSize !== 1) {
      dx += (x - t.x) * (F.noseTipSize - 1) * w
      dy += (y - t.y) * (F.noseTipSize - 1) * w
    }
    if (F.noseTipLift !== 0) dy += -F.noseTipLift * w
  }

  // 唇峰高低
  if (F.cupidH !== 0) {
    const w = gauss2D(x, y, M.midX, M.lipTopPt.y, M.mouthHalfW * 0.4)
    dy += -F.cupidH * w
  }

  // 嘴角上扬
  if (F.mouthCorner !== 0) {
    for (const mc of M.mCorners) {
      dy += -F.mouthCorner * gauss2D(x, y, mc.x, mc.y, M.mouthHalfW * 0.6)
    }
  }

  // 颧骨宽 / 高低 / 突起
  if (F.cheekW !== 1 || F.cheekUp !== 0 || F.cheekProject !== 0) {
    for (const cb of M.cheekbones) {
      const w = gauss2D(x, y, cb.x, cb.y, M.halfW * 0.5)
      if (F.cheekW !== 1) dx += (x - M.midX) * (F.cheekW - 1) * w * 0.5
      if (F.cheekUp !== 0) dy += -F.cheekUp * w
      if (F.cheekProject !== 0) {
        dx += (x - cb.x) * F.cheekProject * w
        dy += (y - cb.y) * F.cheekProject * w
      }
    }
  }

  return [x + dx, ny + dy]
}
