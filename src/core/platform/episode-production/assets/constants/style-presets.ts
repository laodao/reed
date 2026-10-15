/**
 * 主流图像风格预设
 * @module platform/episode-production/assets/constants/style-presets
 *
 * 用于角色 / 地点 / 物品设定卡的"风格"多选锚点。AI 主图与派生图生成时把选中的风格
 * 拼到 prompt（参与 styleAnchors 字段）。
 *
 * 选取标准：主流文生图模型（DashScope wanx / SD / DALL-E / Midjourney 等）都能稳定
 * 命中的风格关键词；中英双写让 prompt 兼容中文优先与英文优先两类 provider。
 *
 * 双端共用：core 包，不依赖 fs / browser API。
 */

/**
 * 用户在设定卡看到的下拉选项列表。中文标签，落库时也存中文（与 character 现有
 * styleAnchors 用法一致）。Prompt 拼接时由 buildStylePromptHint 转成中英双写。
 */
export const STYLE_PRESETS: readonly string[] = [
  '写实',
  '电影感',
  '日系二次元',
  '美式卡通',
  '吉卜力',
  '迪士尼3D',
  '皮克斯3D',
  '国风工笔',
  '中国水墨',
  '浮世绘',
  '油画',
  '水彩',
  '素描线稿',
  '黑白漫画',
  '像素风',
  '低多边形',
  '蒸汽朋克',
  '赛博朋克',
  '末日废土',
  '超现实',
] as const

/**
 * 中文风格 → 英文等价描述（拼 prompt 时附加，提升各家 provider 命中率）。
 * 用户自定义的中文风格如不在表中，原样输出（不强制翻译，避免出错）。
 */
const STYLE_EN_HINT: Record<string, string> = {
  写实: 'photorealistic, realistic photo style',
  电影感: 'cinematic lighting, movie still, film grain',
  日系二次元: 'anime style, Japanese manga aesthetic',
  美式卡通: 'American cartoon style, bold outlines',
  吉卜力: 'Studio Ghibli style, Hayao Miyazaki aesthetic',
  迪士尼3D: 'Disney 3D animation style',
  皮克斯3D: 'Pixar 3D style, soft lighting',
  国风工笔: 'Chinese gongbi painting, fine brush strokes',
  中国水墨: 'Chinese ink wash painting, sumi-e',
  浮世绘: 'ukiyo-e woodblock print style',
  油画: 'oil painting, rich brush textures',
  水彩: 'watercolor painting, soft washes',
  素描线稿: 'pencil sketch, line art',
  黑白漫画: 'black and white manga, ink drawing',
  像素风: 'pixel art, 8-bit style',
  低多边形: 'low poly 3D style',
  蒸汽朋克: 'steampunk aesthetic, brass and gears',
  赛博朋克: 'cyberpunk neon style, futuristic',
  末日废土: 'post-apocalyptic wasteland',
  超现实: 'surrealism, dreamlike imagery',
}

/**
 * 把用户选中的风格数组转成 prompt 片段（中英双写）。空数组返回空字符串。
 *
 * 示例：['日系二次元','吉卜力'] → '日系二次元（anime style, ...），吉卜力（Studio Ghibli style, ...）'
 */
export function buildStylePromptHint(styles: string[] | null | undefined): string {
  if (!Array.isArray(styles) || styles.length === 0) return ''
  return styles
    .map((s) => {
      const trimmed = s?.trim()
      if (!trimmed) return ''
      const en = STYLE_EN_HINT[trimmed]
      return en ? `${trimmed}（${en}）` : trimmed
    })
    .filter(Boolean)
    .join('，')
}
