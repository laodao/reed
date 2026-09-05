/**
 * 打光命名预设（spec 2026-05-09 ep-redesign §3.2 B5 · P-14）
 *
 * 12 个命名预设：伦勃朗 / 三点 / 蝴蝶 / 黑色电影 / 赛博朋克霓虹 等。
 * 双母语：
 *   大众用户 → label / description 通俗
 *   专业用户 → 直接看 value / promptHint 影视术语
 */

export interface LightingPreset {
  value: string
  label: string
  description: string
  promptHint: string
}

export const LIGHTING_PRESETS: LightingPreset[] = [
  { value: 'rembrandt',      label: '伦勃朗光',     description: '45° 主光 + 鼻影投到对侧脸颊（经典人像）', promptHint: 'rembrandt lighting, 45 degree key light, triangle shadow on cheek' },
  { value: 'three_point',    label: '三点照明',     description: '主光 + 辅光 + 轮廓光（标准电影 setup）', promptHint: 'three-point lighting, key light fill light back light' },
  { value: 'butterfly',      label: '蝴蝶光',       description: '正前方高位主光 → 鼻下蝴蝶状阴影',         promptHint: 'butterfly lighting, paramount lighting, shadow under nose' },
  { value: 'split',          label: '分割光',       description: '90° 侧光 → 半亮半暗（戏剧 / 悬疑）',     promptHint: 'split lighting, half light half shadow, dramatic side light' },
  { value: 'rim_backlight',  label: '逆光轮廓',     description: '主光在背后 → 主体边缘发光剪影',           promptHint: 'rim light, backlit subject, silhouette outline glow' },
  { value: 'flat_softbox',   label: '平铺柔光',     description: '正前方大柔光箱 → 无阴影（产品 / 美妆）',  promptHint: 'flat softbox lighting, even diffuse, shadowless' },
  { value: 'golden_hour',    label: '黄金时刻',     description: '日出 / 日落柔和暖光',                     promptHint: 'golden hour lighting, warm soft sunlight, low angle sun' },
  { value: 'blue_hour',      label: '蓝调时刻',     description: '日落后 / 日出前的冷蓝调',                 promptHint: 'blue hour, twilight, cool blue ambient' },
  { value: 'noir_hard',      label: '黑色电影硬光', description: '强烈对比 + 百叶窗投影（黑色电影）',       promptHint: 'film noir lighting, hard chiaroscuro, venetian blind shadows' },
  { value: 'cyberpunk_neon', label: '赛博朋克霓虹', description: '紫粉霓虹 + 反射 + 雨夜',                 promptHint: 'cyberpunk neon lighting, magenta and cyan reflections, wet street' },
  { value: 'cozy_candle',    label: '温暖烛光',     description: '低色温 + 跳动光斑（家庭 / 温馨）',        promptHint: 'warm candlelight, low color temperature, flickering glow' },
  { value: 'cold_clinical',  label: '冷峻医院',     description: '高色温日光灯 + 无影（医院 / 实验室）',    promptHint: 'cold clinical lighting, fluorescent overhead, sterile feeling' },
]

export function findLightingPreset(value: string | null | undefined): LightingPreset | null {
  if (!value) return null
  return LIGHTING_PRESETS.find((p) => p.value === value) ?? null
}
