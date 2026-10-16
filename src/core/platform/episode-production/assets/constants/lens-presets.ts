/**
 * 镜头摄像机参数预设（spec 2026-05-09 ep-redesign §3.2 B5 · P-12）
 *
 * 焦距 / 光圈 / 相机风格三组预设。每项含中英双写：
 *   - label: 中文（大众用户视觉效果一句话理解）
 *   - value: provider 写入 storyboards.metadata 的 key
 *   - visualEffect: tooltip 给大众用户
 *   - promptHint: 拼到 prompt 的英文片段（给 AI）
 *
 * 双母语：
 *   大众用户 → label / visualEffect 通俗描述
 *   专业用户 → value / promptHint 影视行业术语
 */

export interface LensPreset {
  value: string
  label: string
  visualEffect: string
  promptHint: string
}

export const LENS_FOCAL_PRESETS: LensPreset[] = [
  { value: '24mm',  label: '超广角 24mm', visualEffect: '环境感强，畸变明显（外景大全景）',     promptHint: 'shot at 24mm wide angle, environmental context' },
  { value: '35mm',  label: '广角 35mm',   visualEffect: '环境与主体平衡（街拍 / 纪录片）',     promptHint: 'shot at 35mm, balanced perspective' },
  { value: '50mm',  label: '标准 50mm',   visualEffect: '接近肉眼视角（自然 / 中性）',          promptHint: 'shot at 50mm, natural perspective' },
  { value: '85mm',  label: '人像 85mm',   visualEffect: '中近景人物焦点（人像首选）',           promptHint: 'shot at 85mm portrait lens, subject isolation' },
  { value: '125mm', label: '长焦 125mm',  visualEffect: '特写压缩感（人物面部特写）',           promptHint: 'shot at 125mm telephoto, compressed perspective' },
]

export const APERTURE_PRESETS: LensPreset[] = [
  { value: 'f/1.8', label: '极浅景深 f/1.8', visualEffect: '强烈背景虚化（人像虚焦）',     promptHint: 'aperture f/1.8, strong bokeh, shallow depth of field' },
  { value: 'f/2.8', label: '浅景深 f/2.8',   visualEffect: '柔和虚化（人像 / 静物）',     promptHint: 'aperture f/2.8, soft bokeh' },
  { value: 'f/4',   label: '中景深 f/4',     visualEffect: '主体清晰背景柔化',           promptHint: 'aperture f/4' },
  { value: 'f/8',   label: '深景深 f/8',     visualEffect: '前后皆清（风景 / 建筑）',     promptHint: 'aperture f/8, deep focus' },
  { value: 'f/11',  label: '全景清晰 f/11',  visualEffect: '从近到远全清楚',             promptHint: 'aperture f/11, deep depth of field' },
]

export const CAMERA_STYLE_PRESETS: LensPreset[] = [
  { value: 'cinematic', label: '电影感',     visualEffect: '电影级色彩 + 颗粒感',     promptHint: 'cinematic, film grain, color graded' },
  { value: 'digital',   label: '数码',       visualEffect: '清晰 / 锐利 / 现代',     promptHint: 'digital camera, sharp, modern' },
  { value: 'film_35mm', label: '胶片 35mm',  visualEffect: '柔和颗粒 + 复古色调',    promptHint: '35mm film stock, vintage tone, organic grain' },
  { value: 'vintage',   label: '复古',       visualEffect: '老照片质感',             promptHint: 'vintage style, faded colors, retro feel' },
]

/** 按 value 反查 preset；找不到返回 null */
export function findLensFocalPreset(value: string | null | undefined): LensPreset | null {
  if (!value) return null
  return LENS_FOCAL_PRESETS.find((p) => p.value === value) ?? null
}
export function findAperturePreset(value: string | null | undefined): LensPreset | null {
  if (!value) return null
  return APERTURE_PRESETS.find((p) => p.value === value) ?? null
}
export function findCameraStylePreset(value: string | null | undefined): LensPreset | null {
  if (!value) return null
  return CAMERA_STYLE_PRESETS.find((p) => p.value === value) ?? null
}
