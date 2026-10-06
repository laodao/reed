/**
 * 剧集制作 · 时代档案注册表（提示词优化方案 §2.5，原则 P1/P2）
 * @module platform/episode-production/prompts/era-profiles
 *
 * 背景（已实锤漂移）：同一仓库存在**两套互不复用的古风判定**——
 *   - `render/keyframe/keyframe-prompt-builder.ts:297-304`：20 词正则 + 中文单语后缀
 *     + negative `modern buildings, modern clothing, cars, power lines, glass`
 *   - `assets/prompts/asset-identity-prompt.ts:346-360`：10 词正则 + 中英双写后缀
 *     + negative `…, electricity, glass curtain wall`
 * 两者词表互不包含（`修真/架空/元/秦/隋/晋` 只在关键帧侧；`玄幻/古装` 只在资产侧），
 * 后缀与负向词文案也不同——同一部剧在两条链路上得到不同的时代约束。
 *
 * 另：优化前**只有命中古风正则**才注入时代约束，"1980 年代""近未来"完全无锚；
 * 且 `"汉"` 会误伤"武汉"这类现代词。
 *
 * 本模块把时代约束收敛为**档案注册表**：判定与文案都来自同一份定义，
 * 且所有时代都注入时代锚（不只是古风）。
 */

/** 内置时代档案键 */
export type EraProfileKey = 'ancient_chinese' | 'modern' | 'near_future' | 'period_drama' | 'generic'

/**
 * 时代档案：一个时代的全部提示词侧约束。
 */
export interface EraProfile {
  key: EraProfileKey
  /** 中文显示名 */
  label: string
  /**
   * 正向约束后缀（拼进图像/视频 prompt）。
   * 空串 = 该时代不加额外硬约束（仅靠 storyEra 文本锚点）。
   */
  constraintSuffix: string
  /**
   * negative 追加词（逗号分隔的英文词表）。
   * 空串 = 不追加。
   */
  negativeExtra: string
  /**
   * 触发该档案的关键词（用于从 storyEra 文本推断）。
   * 用**词边界安全**的匹配方式（见 `matchesEraTrigger`），避免"汉"命中"武汉"。
   */
  triggers: string[]
}

/**
 * 古风档案（合并两套历史实现：关键帧侧 20 词 + 资产侧 10 词 = 并集 22 词）。
 * 后缀取中英双写版（覆盖单语版语义并补英文），negative 取并集。
 */
const ANCIENT_CHINESE: EraProfile = {
  key: 'ancient_chinese',
  label: '古代中国',
  constraintSuffix:
    '严格古代中国风，严禁出现任何现代建筑、现代服饰、现代物品、现代交通工具、电线杆、玻璃幕墙' +
    '（strictly ancient Chinese style, absolutely no modern buildings, no modern clothing, no modern objects, no modern vehicles, no power lines, no glass curtain wall）',
  negativeExtra:
    'modern buildings, modern clothing, cars, electricity, glass curtain wall, power lines',
  triggers: [
    '古',
    '武侠',
    '仙侠',
    '玄幻',
    '修真',
    '朝代',
    '历史',
    '古装',
    '架空',
    '古代',
    '唐',
    '宋',
    '元',
    '明',
    '清',
    '汉',
    '秦',
    '隋',
    '晋',
    '三国',
    '春秋',
    '战国',
    '五代',
  ],
}

const MODERN: EraProfile = {
  key: 'modern',
  label: '现代',
  constraintSuffix:
    '现代都市写实风格，画面元素符合当代生活常识（modern realistic style, contemporary everyday setting）',
  negativeExtra: 'ancient costume, historical architecture, retro props',
  triggers: ['现代', '当代', '都市', '今日', '当下'],
}

const NEAR_FUTURE: EraProfile = {
  key: 'near_future',
  label: '近未来',
  constraintSuffix:
    '近未来科幻风格，设备与场景体现技术演进但符合物理常识（near-future sci-fi style, plausible advanced technology）',
  negativeExtra: 'medieval, ancient costume, primitive tools',
  triggers: ['未来', '科幻', '赛博', '近未来', '末世'],
}

const PERIOD_DRAMA: EraProfile = {
  key: 'period_drama',
  label: '年代戏',
  constraintSuffix:
    '特定历史年代写实风格，服饰、道具与场景需符合该年代特征（period-accurate style, historically appropriate wardrobe and props）',
  negativeExtra: 'modern technology, contemporary clothing, smartphones, plastic objects',
  triggers: ['年代', '民国', '抗战', '解放', '世纪'],
}

/** 兜底档案：不加约束，仅靠 storyEra 文本锚点（"所有时代都注入时代锚"的落点） */
const GENERIC: EraProfile = {
  key: 'generic',
  label: '通用',
  constraintSuffix: '',
  negativeExtra: '',
  triggers: [],
}

export const ERA_PROFILES: Record<EraProfileKey, EraProfile> = {
  ancient_chinese: ANCIENT_CHINESE,
  modern: MODERN,
  near_future: NEAR_FUTURE,
  period_drama: PERIOD_DRAMA,
  generic: GENERIC,
}

export const DEFAULT_ERA_PROFILE_KEY: EraProfileKey = 'generic'

const ERA_KEYS = Object.keys(ERA_PROFILES) as EraProfileKey[]

export function isEraProfileKey(v: unknown): v is EraProfileKey {
  return typeof v === 'string' && (ERA_KEYS as string[]).includes(v)
}

/**
 * 歧义单字触发词的**否定词表**（修复历史正则 `"汉"` 命中"武汉" 的真实缺陷）。
 *
 * 历史实现用 `/古|武侠|…|汉|…/` 裸匹配，任何含该字的文本都判定为古风——
 * "武汉""唐突""明清小说研究"这类现代语境会被误判。这里对歧义单字做白名单式排除：
 * 命中触发词后，若其在文本中的**每一次出现**都落在这些复合词内部，则不算命中。
 */
const AMBIGUOUS_TRIGGER_FALSE_POSITIVES: Record<string, string[]> = {
  汉: ['武汉', '汉中', '汉子', '好汉', '老汉', '汉语', '汉族'],
  唐: ['唐突', '唐诗', '唐氏'],
  // 注意：'北宋'/'南宋' 是朝代名而非歧义词，不得列入否定表（"北宋" 必须判定为古风）
  宋: ['宋体'],
  元: ['元素', '元旦', '单元', '美元', '欧元', '日元', '多元', '元首', '元气'],
  明: ['明天', '明日', '明白', '明确', '说明', '查明', '证明', '声明', '文明', '透明', '聪明', '明星', '分明'],
  清: ['清楚', '清晰', '清理', '清单', '清醒', '冷清', '清点', '澄清', '清晨'],
  秦: ['秦岭', '秦腔'],
  隋: [],
  晋: ['晋升', '晋级', '东晋', '西晋'],
  古: ['古怪', '古董', '古板'],
  历史: [],
}

/**
 * 判断 storyEra 文本是否命中某触发词。
 *
 * 规则：
 *   - 多字触发词（武侠/仙侠/玄幻/修真/架空/古装/古代/朝代…）：直接 includes；
 *   - 单字歧义触发词（古/汉/唐/宋/元/明/清/秦/隋/晋）：先剥掉否定词表里的歧义
 *     复合词（武汉/元素/明天/清楚/晋升…），再看剩余文本里是否仍含该字。
 *
 * 为什么不用"前后不紧邻汉字"的边界规则：中文没有词边界，"汉代""唐朝"这类
 * 朝代用法本身就与汉字紧邻；用边界规则会把"汉代"也判掉（过严），
 * 用否定词表则能精确排除"武汉"而保留"汉代"。
 *
 * 例："武汉" 不命中（被否定词表剥掉）；"汉代""唐朝""明清小说""某某元某某" 命中；
 *     "明天再说""元素周期" 不命中。
 */
export function matchesEraTrigger(text: string, trigger: string): boolean {
  if (!text || !trigger) return false
  if (trigger.length >= 2) return text.includes(trigger)

  let residue = text
  for (const fp of AMBIGUOUS_TRIGGER_FALSE_POSITIVES[trigger] ?? []) {
    residue = residue.split(fp).join('')
  }
  return residue.includes(trigger)
}

/**
 * 解析时代档案。
 *
 * 优先级：显式 eraProfileKey > storyEra 文本推断（按触发器特异性排序，多字优先）> 缺省 generic。
 *
 * @param explicitKey 项目显式配置的时代档案键（§2.5：`genre`/`eraProfile` 显式配置优先）
 * @param storyEra   剧集故事年代文本
 * @param genreKey   体裁键（体裁可作为时代推断的弱信号，当前用于 custom 兜底）
 */
export function resolveEraProfile(
  explicitKey?: string | null,
  storyEra?: string | null,
  genreKey?: string | null,
): EraProfile {
  if (isEraProfileKey(explicitKey)) return ERA_PROFILES[explicitKey]

  const text = (storyEra ?? '').trim()
  if (text) {
    // 最多字数的触发词优先（"近未来" 先于 "未来"；"三国" 先于 "国"）
    const candidates = ERA_KEYS.filter((k) => k !== 'generic').flatMap((k) =>
      ERA_PROFILES[k].triggers.map((t) => ({ key: k, trigger: t })),
    )
    candidates.sort((a, b) => b.trigger.length - a.trigger.length)
    for (const c of candidates) {
      if (matchesEraTrigger(text, c.trigger)) return ERA_PROFILES[c.key]
    }
  }

  // 体裁弱信号：动画/古风题材常见古装设定，但无 explicit 时不擅自加硬约束
  void genreKey
  return ERA_PROFILES[DEFAULT_ERA_PROFILE_KEY]
}

/** 时代锚文本段（§2.5：所有时代都注入，不再只有古风有约束） */
export function renderEraAnchor(ctx: {
  storyEra?: string
  storyRegion?: string
  eraProfile: EraProfile
}): string {
  const parts: string[] = []
  if (ctx.storyEra) parts.push(`故事年代：${ctx.storyEra}`)
  if (ctx.storyRegion) parts.push(`故事地域：${ctx.storyRegion}`)
  if (parts.length === 0) return ''
  return parts.join('，')
}

/**
 * 合并时代约束后缀与 negative（供资产图/关键帧两侧共用同一份文案）。
 *
 * @returns suffix 为空串时表示无需追加
 */
export function eraConstraintOf(profile: EraProfile): {
  suffix: string
  negativeExtra: string
} {
  return { suffix: profile.constraintSuffix, negativeExtra: profile.negativeExtra }
}