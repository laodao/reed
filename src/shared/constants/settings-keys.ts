/**
 * 系统参数（settings 表）键名注册表 —— **唯一命名来源**
 * @module shared/constants/settings-keys
 *
 * 用户 2026-09-13 要求：「系统参数设置，这些参数名，要统一命名规范」。
 *
 * ── 命名规范（新增配置必须遵守；护栏测试会扫描源码拒绝未注册的键）──
 * 1. 键名形如 `<模块>:<对象>`；模块 = 单个小写单词（无驼峰、无缩写），对象 = lowerCamelCase。
 *    例：`agent:budget`、`wf:defaults`、`ui:theme`、`event:rateLimits`。
 * 2. 不带命名空间的裸键（`theme`）与带驼峰的模块（`eventBus:`）都不合规。
 * 3. **键名只能来自本文件**：业务代码不得再写字面量（护栏 `tests/unit/settings-keys.spec.ts` 会扫）。
 * 4. 对象内部的字段命名规范见 `shared/types/agent-budget.types.ts` 头部（max 前缀、单位后缀等）。
 *
 * ── 兼容 ──
 * 2026-09-13 统一命名时改名的旧键登记在 `SETTINGS_KEY_LEGACY`：**读取时兜底旧键、写入只写新键**，
 * 老用户的历史配置不会丢（`getSettingWithLegacyFallback`）。旧键在后续版本清理。
 */

/** 系统参数键名（全部配置项的唯一登记处） */
export const SETTINGS_KEYS = {
  // UI / 外观（原裸键 theme / themeMode / skin / language / fontSize）
  uiTheme: 'ui:theme',
  uiThemeMode: 'ui:themeMode',
  uiSkin: 'ui:skin',
  uiLanguage: 'ui:language',
  uiFontSize: 'ui:fontSize',
  // 「参数设置」页面自身的开关（是否向用户开放参数编辑；原在 agent:budget 的 ui.enabled，2026-09-13 第二轮迁移）
  uiParams: 'ui:params',
  // 搜索引擎（原裸键 disabledQuickSearchEngines）
  searchDisabledQuickEngines: 'search:disabledQuickEngines',
  // 事件总线限流（原 eventBus:rateLimits，模块名带驼峰不合规）
  eventRateLimits: 'event:rateLimits',
  // 工作流执行设置全局层
  wfDefaults: 'wf:defaults',
  // Agent 预算 / 护栏（2026-09-13 新增）
  agentBudget: 'agent:budget',
  // Agent 上下文装配与压缩（2026-09-13 新增；「上下文与记忆」Tab）
  agentContext: 'agent:context',
  // Agent 记忆飞轮：蒸馏/查重/召回/归档（2026-09-13 新增）
  agentMemory: 'agent:memory',
  // Agent 工具执行与结果处理（2026-09-13 新增；「工具与审批」Tab）
  agentTools: 'agent:tools',
  // Agent 人工审批（2026-09-13 新增；「工具与审批」Tab）
  agentApproval: 'agent:approval',
  // 知识库：检索 / 入库与导入 / 章节摘要（2026-09-13 新增；「知识库」Tab）
  knowledgeRetrieval: 'knowledge:retrieval',
  knowledgeIngest: 'knowledge:ingest',
  knowledgeSummary: 'knowledge:summary',
  // 长文写作：章节生成主链 / 故事研讨室（2026-09-13 新增；「长文写作」Tab）
  longwritingWriting: 'longwriting:writing',
  longwritingStoryRoom: 'longwriting:storyRoom',
  // 素材与图片：素材下载/收藏/归档、站点图标、图片任务轮询（2026-09-13 新增；「素材与图片」Tab）
  assetLimits: 'asset:limits',
  faviconFetch: 'favicon:fetch',
  imagePolling: 'image:polling',
  // 画像：生成默认尺寸与强度（2026-09-13 新增；「画像」Tab）
  portraitImage: 'portrait:image',
  // 事件系统：事件总线 / 归档作业（2026-09-13 新增；「事件系统」Tab；改动需重启客户端）
  eventBus: 'event:bus',
  eventArchive: 'event:archive',
} as const

/** 已注册的键名联合类型 */
export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS]

/** 全部已注册键（护栏与设置页遍历用） */
export const ALL_SETTINGS_KEYS: readonly string[] = Object.values(SETTINGS_KEYS)

/** 键名规范（模块小写单词 + 冒号 + lowerCamelCase 对象名） */
export const SETTINGS_KEY_PATTERN = /^[a-z]+:[a-zA-Z][a-zA-Z0-9]*$/

/**
 * 改名前的旧键 → 现行键（读取兜底用）。
 * 键 = 现行键名，值 = 曾用键名列表（按优先级）。
 */
export const SETTINGS_KEY_LEGACY: Record<string, readonly string[]> = {
  [SETTINGS_KEYS.uiTheme]: ['theme'],
  [SETTINGS_KEYS.uiThemeMode]: ['themeMode'],
  [SETTINGS_KEYS.uiSkin]: ['skin'],
  [SETTINGS_KEYS.uiLanguage]: ['language'],
  [SETTINGS_KEYS.uiFontSize]: ['fontSize'],
  [SETTINGS_KEYS.searchDisabledQuickEngines]: ['disabledQuickSearchEngines'],
  [SETTINGS_KEYS.eventRateLimits]: ['eventBus:rateLimits'],
}

/** 旧键 → 现行键的反查表（迁移脚本/护栏用） */
export const LEGACY_TO_CURRENT_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(SETTINGS_KEY_LEGACY).flatMap(([current, legacies]) => legacies.map((l) => [l, current])),
)

/** 是否已注册（含旧键：兼容期内旧键仍视为合法输入） */
export function isRegisteredSettingsKey(key: string): boolean {
  return ALL_SETTINGS_KEYS.includes(key) || key in LEGACY_TO_CURRENT_KEY
}

/** 取某键允许的旧键列表（缺省空数组） */
export function legacyKeysOf(key: string): readonly string[] {
  return SETTINGS_KEY_LEGACY[key] ?? []
}

/** settings 读取端口（结构类型：Electron / Web / 测试都满足） */
export interface SettingsReadPort {
  get(key: string): Promise<unknown>
}

/**
 * 读配置：先读现行键，为空再依次读旧键（兼容 2026-09-13 改名前的历史数据）。
 * 不在这里做"读到旧键就写回新键"的迁移——写回的时机交给各业务点（避免读路径产生写副作用）。
 */
export async function getSettingWithLegacyFallback(
  port: SettingsReadPort | null | undefined,
  key: string,
): Promise<unknown> {
  if (!port) return null
  const current = await port.get(key)
  if (current !== null && current !== undefined) return current
  for (const legacy of legacyKeysOf(key)) {
    const old = await port.get(legacy)
    if (old !== null && old !== undefined) return old
  }
  return null
}
