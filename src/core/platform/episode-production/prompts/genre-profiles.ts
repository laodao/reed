/**
 * 剧集制作 · 体裁档案注册表（提示词优化方案 §2.2，原则 P2/P3）
 * @module platform/episode-production/prompts/genre-profiles
 *
 * 背景：优化前"竖屏短剧改编纪律"（黄金三秒/集尾卡点/爽点）**无条件注入**所有项目的
 * 剧本提示词，cogen 约束 6 也写死"打脸/身份揭示/短剧留存底线"话术——
 * 一部文艺片或动画项目的提示词里照样出现短剧话术，属类型定制污染。
 *
 * 本模块把体裁差异收敛为**档案注册表**：每个体裁声明自己的剧作纪律片段、
 * 节奏密度偏好与叙事要求，剧本/cogen/故事原文按 `ctx.genre` 取用对应档案。
 *
 * `custom` 允许项目级覆写任意片段（`overrides`）。
 */

/** 内置体裁键 */
export type GenreKey = 'short_drama' | 'series' | 'film' | 'animation' | 'custom'

/**
 * 体裁档案：一个体裁的全部提示词侧差异。
 */
export interface GenreProfile {
  key: GenreKey
  /** 中文显示名 */
  label: string
  /**
   * 剧作改编纪律片段（Markdown 正文，不含外层标题）。
   * 空串 = 该体裁不注入额外改编纪律。
   */
  adaptationDiscipline: string
  /**
   * 节奏密度偏好（分镜侧）：单镜时长与"每 N 秒 1 镜"的留存口径。
   * `null` = 不注入密度分档（非强节奏体裁）。
   */
  pacingPreference: PacingPreference | null
  /**
   * 节奏话术（如"每 2 秒 1 镜是短剧留存底线"）——只挂在该体裁上。
   * 空串 = 不注入。
   */
  pacingRhetoric: string
  /**
   * 故事原文的体裁叙事要求（§3.3，故事原文生成用）。
   */
  narrativeRequirement: string
  /**
   * 台词长度指导（剧本侧）：如"每句≤20字为宜"。空串 = 不限制。
   */
  dialogueLengthGuide: string
}

/** 节奏密度偏好（数值口径，提示词与校验共用） */
export interface PacingPreference {
  /** 快节奏段单镜时长区间（秒） */
  fastShotSec: [number, number]
  /** 常规段单镜时长区间（秒） */
  normalShotSec: [number, number]
  /** 呼吸镜头时长区间（秒） */
  breathingShotSec: [number, number]
  /** 该片段预算下的镜数区间（显式声明，不用秒数除法推算——除法会给出
   *  15/1=15 这种"每镜 1 秒刚好塞满"的理论值，与剧作实践口径不符） */
  fastShotsRange: [number, number]
  normalShotsRange: [number, number]
  /** 常规叙事段平均时长上限（秒） */
  maxAvgSec: number
}

const SHORT_DRAMA_PACING: PacingPreference = {
  fastShotSec: [1, 1.5],
  normalShotSec: [1.5, 2.5],
  breathingShotSec: [3, 8],
  fastShotsRange: [8, 12],
  normalShotsRange: [6, 9],
  maxAvgSec: 2.5,
}

/** 短剧改编纪律（迁移自 platforms/services/writing-methodology.ts:139-148） */
const SHORT_DRAMA_DISCIPLINE = `- 黄金三秒：第一场直接从冲突或动作切入，禁止环境铺垫开场。
- 台词口语化短句（每句≤20字为宜）；每场戏三句对白内必须浮出冲突。
- 原著注明的集尾卡点必须落在最后一场的最后一拍——切在问题上，不切在答案上。
- 角色首次出场在 outfit/expression 中给出完整外貌锚定（颜色/风格/年龄感），后续场景保持一致。
- 每场 mood 标注情绪基调；重要转折场在 sceneDescription 尾部给出镜头建议（特写/全景/对切）。
- 原著注明的本集爽点必须落进对应场景正面展开，不得弱化为侧面交代。`

export const GENRE_PROFILES: Record<GenreKey, GenreProfile> = {
  short_drama: {
    key: 'short_drama',
    label: '竖屏短剧',
    adaptationDiscipline: SHORT_DRAMA_DISCIPLINE,
    pacingPreference: SHORT_DRAMA_PACING,
    pacingRhetoric: '每 2 秒 1 镜是短剧留存底线',
    narrativeRequirement: '以强冲突与快节奏推进，开篇即入事，场面集中、对白密集。',
    dialogueLengthGuide: '每句≤20字为宜',
  },
  series: {
    key: 'series',
    label: '剧集（长剧/网剧）',
    adaptationDiscipline: `- 每集围绕一条主线推进，结尾留悬念钩子。
- 对白自然口语，避免功能性解说；允许必要的过场与铺垫。
- 角色首次出场给出外貌锚定，后续场景保持一致。
- 每场 mood 标注情绪基调；重要转折场在 sceneDescription 尾部给出镜头建议。`,
    pacingPreference: {
      fastShotSec: [1.5, 2.5],
      normalShotSec: [2.5, 4],
      breathingShotSec: [4, 8],
      fastShotsRange: [5, 8],
      normalShotsRange: [4, 6],
      maxAvgSec: 4,
    },
    pacingRhetoric: '',
    narrativeRequirement: '以人物关系与情节推进为主，节奏从容，允许铺陈与留白。',
    dialogueLengthGuide: '每句≤40字为宜',
  },
  film: {
    key: 'film',
    label: '电影',
    adaptationDiscipline: `- 以视听语言叙事，减少解释性对白；让动作与环境承载信息。
- 场景转换注重情绪与时空逻辑，避免机械切分。
- 角色首次出场给出外貌锚定，后续场景保持一致。
- 每场 mood 标注情绪基调；重要转折场给出镜头建议（景别/机位/运动）。`,
    pacingPreference: {
      fastShotSec: [2, 3],
      normalShotSec: [3, 6],
      breathingShotSec: [5, 10],
      fastShotsRange: [4, 6],
      normalShotsRange: [2, 4],
      maxAvgSec: 6,
    },
    pacingRhetoric: '',
    narrativeRequirement: '以画面与情绪张力为主，重视氛围与隐喻，对白精炼。',
    dialogueLengthGuide: '每句≤30字为宜',
  },
  animation: {
    key: 'animation',
    label: '动画',
    adaptationDiscipline: `- 动作与表情可适度夸张，服务于角色辨识度与节奏感。
- 转场与镜头语言可风格化；注意保持设定一致性。
- 角色首次出场给出完整外貌与配色锚定，后续场景严格保持一致。
- 每场 mood 标注情绪基调；重要转折场给出镜头建议。`,
    pacingPreference: {
      fastShotSec: [1, 2],
      normalShotSec: [2, 3.5],
      breathingShotSec: [3.5, 8],
      fastShotsRange: [6, 9],
      normalShotsRange: [5, 7],
      maxAvgSec: 3.5,
    },
    pacingRhetoric: '',
    narrativeRequirement: '强调动作表现力与角色个性，画面想象空间大，对白明快。',
    dialogueLengthGuide: '每句≤25字为宜',
  },
  custom: {
    key: 'custom',
    label: '自定义',
    adaptationDiscipline: '',
    pacingPreference: null,
    pacingRhetoric: '',
    narrativeRequirement: '',
    dialogueLengthGuide: '',
  },
}

export const DEFAULT_GENRE: GenreKey = 'short_drama'

const GENRE_KEYS = Object.keys(GENRE_PROFILES) as GenreKey[]

/** 是否内置体裁键 */
export function isGenreKey(v: unknown): v is GenreKey {
  return typeof v === 'string' && (GENRE_KEYS as string[]).includes(v)
}

/**
 * 取体裁档案。
 *
 * @param key 体裁键（非法/缺省 → 默认体裁）
 * @param overrides custom 体裁的项目级覆写（仅 key='custom' 或显式传入时生效）
 */
export function getGenreProfile(
  key?: string | null,
  overrides?: Partial<GenreProfile>,
): GenreProfile {
  const resolved: GenreKey = isGenreKey(key) ? key : DEFAULT_GENRE
  const base = GENRE_PROFILES[resolved]
  if (!overrides) return base
  return { ...base, ...overrides, key: base.key, label: overrides.label ?? base.label }
}

/** 全部内置体裁键（UI 下拉用） */
export function listGenreKeys(): GenreKey[] {
  return [...GENRE_KEYS]
}

/** 渲染体裁纪律段（含标题，空纪律返回空串） */
export function renderGenreDiscipline(profile: GenreProfile): string {
  const body = profile.adaptationDiscipline.trim()
  if (!body) return ''
  return `## 剧作改编纪律（${profile.label}）\n\n${body}`
}

/**
 * 渲染节奏密度分档段（§3.8：cogen 约束 6 改为引用体裁档案，不再内联重写）。
 *
 * 镜头数换算：窗口秒数 ÷ 单镜秒数；区间取"快端→慢端"对应的镜数区间
 * （镜头越短 → 数量越多，故下界由慢端除得、上界由快端除得）。
 *
 * @param windowSec 片段时长预算（秒），用于换算"该片段多少镜"
 */
export function renderPacingDensity(profile: GenreProfile, windowSec = 15): string {
  const p = profile.pacingPreference
  if (!p) return ''
  const fast = p.fastShotSec
  const normal = p.normalShotSec
  const breathing = p.breathingShotSec
  const rhetoric = profile.pacingRhetoric ? `（${profile.pacingRhetoric}）` : ''
  return (
    `### 镜头节奏密度分档（按剧情场景内容选择，同一场景/片段内可混合档位）\n` +
    `- 钩子开场/冲突爆发/高潮清算：单镜头 ${fast[0]}-${fast[1]}s，${windowSec}s 片段 ${p.fastShotsRange[0]}-${p.fastShotsRange[1]} 镜\n` +
    `- 对话交锋/情绪递进/常规叙事：单镜头 ${normal[0]}-${normal[1]}s，${windowSec}s 片段 ${p.normalShotsRange[0]}-${p.normalShotsRange[1]} 镜\n` +
    `- 关键台词/反转停顿/蓄势：单镜头 ${normal[1]}-${breathing[0]}s\n` +
    `- 情感沉淀/静态凝视/空镜（呼吸镜头）：单镜头 ${breathing[0]}-${breathing[1]}s，仅用于情感节点、整片少量使用\n` +
    `- 硬规则：各镜头 duration 之和必须等于本场景/片段目标总时长；常规叙事段镜头平均时长不得超过 ${p.maxAvgSec}s${rhetoric}，情感沉淀段除外`
  )
}