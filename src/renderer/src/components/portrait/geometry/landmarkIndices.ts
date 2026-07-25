/**
 * FaceMesh 关键点索引（478 点拓扑，@mediapipe/tasks-vision FaceLandmarker）
 * @module portrait/geometry/landmarkIndices
 * @description 仅声明本功能用到的索引，全部有官方拓扑依据；
 *              颌角/鼻翼等为近似点（在注释中标注），后续按实测微调。
 */

/** 眉心（两眉之间，glabella） */
export const LM_GLABELLA = 9
/** 额头轮廓顶点（注意：非发际线，上庭需外推，标 estimated） */
export const LM_FOREHEAD_TOP = 10
/** 鼻底（鼻尖/鼻小柱位置，subnasale 近似） */
export const LM_SUBNASALE = 2
/** 颏底（下巴最低点） */
export const LM_CHIN_BOTTOM = 152

/** 右眼外眼角（人脸自身右侧） */
export const LM_RIGHT_EYE_OUTER = 33
/** 右眼内眼角 */
export const LM_RIGHT_EYE_INNER = 133
/** 左眼外眼角 */
export const LM_LEFT_EYE_OUTER = 263
/** 左眼内眼角 */
export const LM_LEFT_EYE_INNER = 362

/** 鼻翼右点（近似） */
export const LM_NOSE_ALAR_RIGHT = 49
/** 鼻翼左点（近似） */
export const LM_NOSE_ALAR_LEFT = 279

/** 右颧点（面宽右端，近似） */
export const LM_ZYGOMA_RIGHT = 234
/** 左颧点 */
export const LM_ZYGOMA_LEFT = 454

/** 右下颌角（近似） */
export const LM_JAW_ANGLE_RIGHT = 136
/** 左下颌角（近似） */
export const LM_JAW_ANGLE_LEFT = 365

/** 上庭外推系数：额头轮廓顶点 → 发际线的距离 ≈ (顶点→眉心) × 系数。
 *  正面人像经验值 1.5-1.7，取中值 1.6（spec D3，上庭一律标 estimated） */
export const FOREHEAD_EXTRAPOLATION = 1.6
