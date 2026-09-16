/**
 * 画像（人物形象）参数默认值 / 硬上限
 * @module shared/types/portrait-params.types
 *
 * ── 为什么这些要开放 ──
 * 生成人物形象时有两个"写死的默认值"，用户撞上只能改代码：
 * - **默认尺寸 768×1024**（`DEFAULT_PORTRAIT_WIDTH/HEIGHT`）：想要更高清的形象就得每张手填尺寸，
 *   而且这 12 处引用散落在全身/面部/变体/参考图各条生成路径上；
 * - **生成强度 0.55（全身合成）/ 0.5（面部）**：强度越低越像原图、越高越"自由发挥"；
 *   不同人物/风格需要的强度差别很大，写死必然有一部分人觉得"不像"或"没变化"。
 *
 * 归入「参数设置 → 画像」Tab（settings 键 `portrait:image`）。
 * 强度按命名规范存**整数百分比**（框架只收整数），读取点除以 100。
 */

/** 画像生成默认值 */
export interface PortraitImageParams {
  /** 默认生成宽度（像素） */
  width: number
  /** 默认生成高度（像素） */
  height: number
  /** 全身合成的默认生成强度（百分比） */
  fullBodyStrengthPercent: number
  /** 面部/形象变体的默认生成强度（百分比） */
  faceStrengthPercent: number
}

/** 画像参数（分组：本模块只有一组，直接以单组承载） */
export interface PortraitRuntimeParams {
  image: PortraitImageParams
}

/** 内置默认值（= 改造前写死在代码/类型文件里的常量） */
export const PORTRAIT_DEFAULTS: PortraitRuntimeParams = {
  image: {
    width: 768, // DEFAULT_PORTRAIT_WIDTH（竖版更适合全身照）
    height: 1024, // DEFAULT_PORTRAIT_HEIGHT
    fullBodyStrengthPercent: 55, // request.strength ?? 0.55（全身合成）
    faceStrengthPercent: 50, // request.strength ?? 0.5（面部/变体）
  },
}

/** 代码级硬上限（配置值一律夹到这里） */
export const PORTRAIT_LIMITS: PortraitRuntimeParams = {
  image: {
    width: 4096,
    height: 4096,
    fullBodyStrengthPercent: 100,
    faceStrengthPercent: 100,
  },
}
