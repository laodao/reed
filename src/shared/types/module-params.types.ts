/**
 * 模块参数设置契约（平台级；2026-09-13 用户需求第二轮）
 * @module shared/types/module-params.types
 *
 * ── 背景 ──
 * 用户：「这个功能应该叫参数设置，界面内按照模块应该有多个 tab，每个模块有一个 tab，
 * 把每个模块的相关参数设置都要做成这类参数设置功能。」
 *
 * 第一轮只把 agent 侧写死的参数（步数/频控/落库额度/护栏）做成了 `agent:budget` 一处配置，
 * 设置页也就只有「AI 预算（高级）」一个区块。这一轮把它抽成**平台级通用能力**：
 *
 *   一份**声明式参数登记表**（`shared/constants/module-params/`）
 *     ↓ 通用解析（`shared/utils/module-params.ts`：默认 → 覆盖 → 硬上限夹取 + 说明）
 *     ↓ 通用读取（`core/platform/settings/module-params.service.ts`，宿主按模块取生效值）
 *     ↓ 通用渲染（`components/settings/ModuleParamsSettings.vue`：一模块一个 Tab）
 *
 * 于是「新增一个模块的可调参数」= 加一份登记表 + 在读取点改成读生效值，
 * **不再**每处各写一套 clamp、各画一套表单。
 *
 * ── 为什么 Tab 按"模块"而不是按 settings 键 ──
 * 用户要的是"每个模块一个 Tab"。所以一个 Tab（`ModuleParamDefinition`）= 一个业务模块，
 * 它的参数**可以分布在多个 settings 键/路径下**（例：剧集制作自己的键 + `agent:budget.maxSteps.episode`）。
 * 参数在存储层怎么放是实现细节，用户看到的是"这个模块有哪些能调"。
 * 每个参数通过 `settingsKey` / `pathPrefix` 声明自己的存放位置，缺省继承模块级。
 *
 * ── 命名规范 ──
 * settings 键名规范见 `shared/constants/settings-keys.ts`，字段名规范见
 * `shared/types/agent-budget.types.ts` 头部（max 前缀 / 单位后缀 / ...Ceiling / 布尔用形容词）。
 *
 * ── 三条纪律（沿用第一轮经验）──
 * 1. **不配置时行为与改造前完全一致**：默认值就是改造前写死在代码里的那个数；
 * 2. **不静默**：非法值回落、超上限夹取、跨字段修正都写进 `notes`，设置页如实展示；
 * 3. **登记表里只能出现"代码真的会读"的参数**——登记了却在读取点没接线，等于骗用户。
 *    `tests/unit/shared/module-params.spec.ts` 会校验登记表与默认值、上限的一致性。
 */

/** 参数值类型 */
export type ModuleParamValue = number | boolean

/** 参数值的种类（决定 UI 控件与解析口径） */
export type ModuleParamKind = 'number' | 'boolean' | 'numberMap'

/**
 * 生效时机（设置页按此提示用户"改完什么时候起作用"）。
 * - `immediate`：下一次读取立刻生效（按轮/按次读取的超时、阈值、体积上限）
 * - `next-run`：下一轮/下一次任务生效（宿主在本轮启动时读一次，如单轮步数）
 * - `restart`：需要重启客户端（启动时装配进进程级常量或引擎）
 */
export type ModuleParamEffect = 'immediate' | 'next-run' | 'restart'

/** 单位后缀（展示用；"次数/条数"没有单位，留空） */
export type ModuleParamUnit = 'Ms' | 'Bytes' | 'Chars' | 'Tokens' | 'Depth' | 'Px' | 'Percent'

interface ModuleParamSpecBase {
  /**
   * 载荷路径（相对本模块的存放位置；点分）。
   * 例：`maxSteps.research`、`saveBudget.concepts`、`maxCalls.byTool.dl_save_concept`。
   */
  path: string
  /** 设置页显示的中文名 */
  label: string
  /** 一句话说明"这个数大了/小了会怎样"（用户判断该不该调的**唯一依据**，必填） */
  hint: string
  /** 生效时机（缺省继承模块级 `effect`） */
  effect?: ModuleParamEffect
  /** 单位（展示用） */
  unit?: ModuleParamUnit
  /** 存放位置覆盖：settings 键（缺省继承模块级） */
  settingsKey?: string
  /** 存放位置覆盖：路径前缀（缺省继承模块级） */
  pathPrefix?: string
}

/** 数字型参数 */
export interface ModuleNumberParamSpec extends ModuleParamSpecBase {
  kind: 'number'
  /** 内置默认值（= 改造前写死的值） */
  default: number
  /** 代码级硬上限（用户能填的最大值） */
  ceiling: number
  /** 下限（缺省：允许 0 时为 0，否则 1） */
  floor?: number
  /** UI 步长（缺省 1） */
  step?: number
  /**
   * `true` = 0 是这个字段的合法取值（如"0 = 不等待"），下限因此放到 0。
   * 与 `zeroMeansDisabled` 的区别：后者表示 0 有"关闭该功能"的语义（如"0 = 不启用预算"），
   * 解析时 0 会原样生效；`allowZero` 只放宽下限，0 仍按普通值处理。
   */
  allowZero?: boolean
  /**
   * `true` = 这个数的 0 有明确语义（如"0 = 不启用"），不是"配错了"。
   * 解析时 0 会原样保留而**不会**被当成非法值回落默认。
   */
  zeroMeansDisabled?: boolean
}

/** 布尔型参数 */
export interface ModuleBooleanParamSpec extends ModuleParamSpecBase {
  kind: 'boolean'
  default: boolean
}

/**
 * 记录型数字参数（键 → 次数；如"每个工具单轮最多调几次"）。
 * 已知键逐行展示；`allowCustomKeys` 为真时用户可自行添加键（补齐"默认表里没有的工具"）。
 */
export interface ModuleNumberMapParamSpec extends ModuleParamSpecBase {
  kind: 'numberMap'
  /** 已知键的默认表（UI 逐行展示；也是解析时的打底表） */
  defaults: Record<string, number>
  /** 已知键的中文名（缺省显示键名本身，键名按注册名原样展示） */
  labels?: Record<string, string>
  /** 已知键各自的硬上限（缺省用下面的 `ceiling`） */
  ceilings?: Record<string, number>
  /** `ceilings` 未覆盖的键使用的硬上限 */
  ceiling: number
  /** 是否允许用户新增自定义键 */
  allowCustomKeys: boolean
  /** 自定义键的键名格式（缺省 `^[a-z][a-z0-9_]{2,48}$`） */
  keyPattern?: string
  /** 自定义键的值非法时的回落值（缺省 3：与改造前 `mergeCountMap` 一致） */
  customFallback?: number
  /** 自定义键的输入步长（缺省 1） */
  step?: number
}

export type ModuleParamSpec =
  | ModuleNumberParamSpec
  | ModuleBooleanParamSpec
  | ModuleNumberMapParamSpec

/** 参数分组（设置页里的一段，带小标题） */
export interface ModuleParamGroup {
  title: string
  /** 这一段在讲什么（可缺省） */
  description?: string
  /**
   * 该组参数缺省的存放位置（可缺省；逐参数还能再覆盖）。
   * 用途：一个 Tab 覆盖多个 settings 键时（如「上下文与记忆」= `agent:context` + `agent:memory`），
   * 按组声明一次即可，不必每个参数重复写。
   */
  settingsKey?: string
  /** 该组参数缺省的路径前缀 */
  pathPrefix?: string
  /** 该组参数缺省的生效时机（逐参数仍可覆盖） */
  effect?: ModuleParamEffect
  params: ModuleParamSpec[]
}

/**
 * 一个模块的参数登记表（设置页里 = 一个 Tab）。
 *
 * @example
 * ```ts
 * export const WORKFLOW_PARAMS: ModuleParamDefinition = {
 *   key: 'workflow',
 *   name: '工作流',
 *   description: '所有工作流运行共享的执行护栏（时长/迭代/重试/并发/截断）',
 *   settingsKey: SETTINGS_KEYS.wfDefaults,
 *   effect: 'next-run',
 *   groups: [ ... ],
 * }
 * ```
 */
export interface ModuleParamDefinition {
  /** 模块标识（Tab 的 name；也是登记表内的唯一键） */
  key: string
  /** Tab 名（中文） */
  name: string
  /**
   * 功能开关模块 id（features.config.json 的 modules 键；2026-10-15）。
   * 设置页据此隐藏未启用模块的 Tab；缺省 = 不随功能开关（平台级/永远显示）。
   */
  feature?: string
  /** 这个模块的参数是干什么的（Tab 顶部说明） */
  description: string
  /** 参数缺省存放的 settings 键（必须来自 `SETTINGS_KEYS`；逐参数可覆盖） */
  settingsKey: string
  /** 参数缺省路径前缀（逐参数可覆盖） */
  pathPrefix?: string
  /** 模块级缺省生效时机（逐参数可覆盖） */
  effect: ModuleParamEffect
  groups: ModuleParamGroup[]
  /**
   * 跨字段一致性护栏：单字段夹取**之后**执行，可原地修正 `values` 并返回说明。
   * 例：`relations ≥ concepts`、`subagentCeiling ≥ subagent`（配错了只会让功能半死，必须兜住）。
   */
  crossFieldGuard?: (values: Record<string, ModuleParamValue>) => string[]
}

/** settings 载荷按键的映射（模块参数可能分布在多个键下） */
export type ModuleParamRawMap = Record<string, unknown>

/** 解析后的单个参数（设置页渲染 + 保存定位用；UI 只认这个视图模型） */
export interface ModuleParamEntry {
  /** `values` / `touched` 里的键（模块内相对路径；numberMap 展开为 `path.key`） */
  valueKey: string
  kind: ModuleParamKind
  label: string
  hint: string
  effect: ModuleParamEffect
  unit?: ModuleParamUnit
  /** 生效值 */
  value: ModuleParamValue
  /** 内置默认值 */
  default: ModuleParamValue
  /** 是否被用户显式设置过（未设置 = 跟随内置默认） */
  touched: boolean
  /** numberMap 专用：本行对应的键名 */
  mapKey?: string
  /** numberMap 专用：这张表的名字（如「写类工具」；逐行展示时只显示一次） */
  mapLabel?: string
  /** numberMap 专用：是否为用户自定义键（可删除；已登记的键不能删） */
  isCustom?: boolean
  /** 数字型：硬上限 / 下限 / UI 步长 */
  ceiling?: number
  floor?: number
  step?: number
  /** 数字型：0 是否有明确语义（"0 = 不启用"） */
  zeroMeansDisabled?: boolean
  /** 是否允许用户新增自定义键（仅 numberMap 的第一行携带该标记） */
  allowCustomKeys?: boolean
  /** 保存/复位定位：settings 键 */
  settingsKey: string
  /** 保存/复位定位：该键内的绝对路径 */
  absolutePath: string
}

/** 解析后的分组（与登记表同构，但参数已变成 `ModuleParamEntry`） */
export interface ResolvedModuleParamGroup {
  title: string
  description?: string
  entries: ModuleParamEntry[]
}

/** 一个模块的解析结果 */
export interface ResolvedModuleParams {
  /** 模块标识 */
  moduleKey: string
  /** 生效值：`valueKey → 值`（numberMap 展开成 `path.key → 次数`） */
  values: Record<string, ModuleParamValue>
  /**
   * 生效值按原结构还原、**按 settings 键**给出（宿主直接取用；numberMap 为合并后的表）。
   * 同一模块参数分布在多个键时会有多项。
   */
  trees: Record<string, Record<string, unknown>>
  /** `valueKey → 是否被用户显式设置过` */
  touched: Record<string, boolean>
  /** 解析取舍说明（被夹上限/非法回落/一致性修正），供设置页与日志展示 */
  notes: string[]
  /** 设置页渲染用的分组视图模型 */
  groups: ResolvedModuleParamGroup[]
}
