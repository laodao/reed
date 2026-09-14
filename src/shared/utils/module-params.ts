/**
 * 模块参数解析与读写（纯函数，主进程与设置页共用）
 * @module shared/utils/module-params
 *
 * 职责：拿一份「模块参数登记表」（`ModuleParamDefinition`）+ settings 里的**任意输入**，
 * 解析出**生效值**（内置默认 → 用户覆盖 → 硬上限夹取 → 跨字段一致性修正），
 * 并把过程中的取舍写进 `notes`（不静默），同时给出设置页直接可渲染的分组视图模型。
 *
 * 纪律：
 * - 任何输入都不抛错（配置坏了绝不能让功能跑不起来）；
 * - 数字必须有限、正向、整数化；字符串/NaN/负数/0 一律回落默认（0 有明确语义时例外，见 `zeroMeansDisabled`）；
 * - 超过硬上限不报错，夹到上限并记说明（用户能看到"我调的值没被完整采纳"）。
 */

import type {
  ModuleNumberMapParamSpec,
  ModuleNumberParamSpec,
  ModuleParamDefinition,
  ModuleParamEffect,
  ModuleParamEntry,
  ModuleParamGroup,
  ModuleParamRawMap,
  ModuleParamSpec,
  ModuleParamValue,
  ResolvedModuleParamGroup,
  ResolvedModuleParams,
} from '../types/module-params.types'

/** 自定义键的缺省键名格式（工具名等注册名：小写 + 下划线） */
export const DEFAULT_PARAM_KEY_PATTERN = '^[a-z][a-z0-9_]{2,48}$'

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** 登记表里的全部参数（按声明顺序展开） */
export function moduleParamSpecs(def: ModuleParamDefinition): ModuleParamSpec[] {
  return def.groups.flatMap((g) => g.params)
}

/** 该模块涉及的全部 settings 键（设置页据此一次性读取载荷） */
export function moduleParamSettingsKeys(def: ModuleParamDefinition): string[] {
  return [
    ...new Set(def.groups.flatMap((g) => g.params.map((s) => paramSettingsKey(def, s, g)))),
  ]
}

/** 某参数最终生效时机（参数级 → 分组级 → 模块级） */
export function paramEffect(
  def: ModuleParamDefinition,
  spec: ModuleParamSpec,
  group?: ModuleParamGroup,
): ModuleParamEffect {
  return spec.effect ?? group?.effect ?? def.effect
}

/** 某参数存放的 settings 键（参数级 → 分组级 → 模块级） */
export function paramSettingsKey(
  def: ModuleParamDefinition,
  spec: ModuleParamSpec,
  group?: ModuleParamGroup,
): string {
  return spec.settingsKey ?? group?.settingsKey ?? def.settingsKey
}

/** 某参数的路径前缀（参数级 → 分组级 → 模块级） */
export function paramPathPrefix(
  def: ModuleParamDefinition,
  spec: ModuleParamSpec,
  group?: ModuleParamGroup,
): string {
  return spec.pathPrefix ?? group?.pathPrefix ?? def.pathPrefix ?? ''
}

/** 某参数在 settings 载荷里的绝对路径 */
export function paramAbsolutePath(
  def: ModuleParamDefinition,
  spec: ModuleParamSpec,
  relPath = spec.path,
  group?: ModuleParamGroup,
): string {
  const prefix = paramPathPrefix(def, spec, group)
  return prefix ? `${prefix}.${relPath}` : relPath
}

/** 数字参数的允许下限（缺省：允许 0 时为 0，否则 1） */
export function paramFloor(spec: ModuleNumberParamSpec): number {
  if (spec.floor !== undefined) return spec.floor
  return spec.allowZero || spec.zeroMeansDisabled ? 0 : 1
}

/** 数字参数在 UI 上的步长 */
export function paramStep(spec: ModuleNumberParamSpec | ModuleNumberMapParamSpec): number {
  return spec.step ?? 1
}

// ==================== 载荷路径读写（设置页保存"只写用户碰过的字段"用） ====================

/** 按点分路径取值（任一层不是对象则 undefined） */
export function readParamPath(raw: unknown, path: string): unknown {
  let node: unknown = raw
  for (const seg of path.split('.')) {
    if (!isPlainObject(node)) return undefined
    node = node[seg]
  }
  return node
}

/**
 * 深拷贝"普通数据"（对象/数组/原始值）。
 * 不用 `structuredClone`：设置页传进来的载荷是 Vue 的响应式 Proxy，
 * `structuredClone` 对 Proxy 会抛 DataCloneError（渲染期实测）。
 */
function clonePlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => clonePlain(v)) as unknown as T
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = clonePlain(v)
    return out as unknown as T
  }
  return value
}

/**
 * 按点分路径写值（不可变：返回新载荷；`value === undefined` 表示删除该字段）。
 * 设置页用它维护"用户显式设过的字段"载荷——没碰过的字段保持缺省，将来默认值升级能吃到。
 */
export function writeParamPath(
  raw: unknown,
  path: string,
  value: ModuleParamValue | undefined,
): Record<string, unknown> {
  const root: Record<string, unknown> = isPlainObject(raw) ? clonePlain(raw) : {}
  const segs = path.split('.')
  let node: Record<string, unknown> = root
  for (const seg of segs.slice(0, -1)) {
    const cur = node[seg]
    if (!isPlainObject(cur)) node[seg] = {}
    node = node[seg] as Record<string, unknown>
  }
  const leaf = segs[segs.length - 1]
  if (value === undefined) delete node[leaf]
  else node[leaf] = value
  return root
}

/** 清掉载荷里的空对象（保存前收尾：某组全恢复默认后不留 `{}` 残渣） */
export function pruneEmptyObjects(raw: unknown): Record<string, unknown> {
  if (!isPlainObject(raw)) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (isPlainObject(v)) {
      const child = pruneEmptyObjects(v)
      if (Object.keys(child).length > 0) out[k] = child
      continue
    }
    out[k] = v
  }
  return out
}

// ==================== 解析 ====================

/** 取一个受约束的整数（非法值回落默认、超限夹取并记说明） */
function clampInt(
  raw: unknown,
  path: string,
  dflt: number,
  ceiling: number,
  floor: number,
  zeroMeansDisabled: boolean,
  notes: string[],
): number {
  if (raw === undefined || raw === null) return dflt
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    notes.push(`${path}：值「${String(raw)}」不是有效数字，已回落默认 ${dflt}`)
    return dflt
  }
  const v = Math.floor(n)
  // 0 语义："0 = 不启用"的字段允许 0 原样生效，其余视 0 为误操作
  if (v === 0 && zeroMeansDisabled) return 0
  if (v <= 0) {
    notes.push(`${path}：值「${String(raw)}」不是有效正数，已回落默认 ${dflt}`)
    return dflt
  }
  if (v < floor) {
    notes.push(`${path}：${v} 低于下限 ${floor}，已按下限生效`)
    return floor
  }
  if (v > ceiling) {
    notes.push(`${path}：${v} 超过硬上限 ${ceiling}，已按上限生效`)
    return ceiling
  }
  return v
}

/** 解析一个数字型参数 */
function resolveNumber(raw: unknown, spec: ModuleNumberParamSpec, notes: string[]): number {
  return clampInt(
    raw,
    spec.path,
    spec.default,
    spec.ceiling,
    paramFloor(spec),
    spec.zeroMeansDisabled === true,
    notes,
  )
}

/** 解析一个布尔型参数（只有真正的布尔才算有效，其它类型回落默认并记说明） */
function resolveBoolean(raw: unknown, path: string, dflt: boolean, notes: string[]): boolean {
  if (raw === undefined || raw === null) return dflt
  if (typeof raw === 'boolean') return raw
  notes.push(`${path}：值「${String(raw)}」不是布尔值，已回落默认 ${dflt}`)
  return dflt
}

interface MapResolution {
  /** 合并后的表（已知键打底 + 用户覆盖） */
  merged: Record<string, number>
  /** 载荷里出现过的键（不论值是否合法）——"用户碰过这个参数"的判定口径 */
  present: Record<string, true>
  /** 行的展示顺序：已知键（按声明）+ 用户新增的自定义键（按载荷顺序） */
  order: string[]
}

/** 解析记录型参数：已知键打底 + 用户覆盖（含自定义键），逐键夹取 */
function resolveNumberMap(raw: unknown, spec: ModuleNumberMapParamSpec, notes: string[]): MapResolution {
  const merged: Record<string, number> = { ...spec.defaults }
  const present: Record<string, true> = {}
  const order: string[] = Object.keys(spec.defaults)
  const src = isPlainObject(raw) ? raw : {}
  if (raw !== undefined && raw !== null && !isPlainObject(raw)) {
    notes.push(`${spec.path}：不是对象，已忽略（用内置默认）`)
  }

  for (const key of order) {
    if (key in src) present[key] = true
    merged[key] = clampInt(src[key], `${spec.path}.${key}`, spec.defaults[key], spec.ceilings?.[key] ?? spec.ceiling, 0, false, notes)
  }

  for (const key of Object.keys(src)) {
    if (key in spec.defaults) continue
    if (!spec.allowCustomKeys) {
      notes.push(`${spec.path}：忽略未登记的键名「${key}」`)
      continue
    }
    const pattern = new RegExp(spec.keyPattern ?? DEFAULT_PARAM_KEY_PATTERN)
    if (!pattern.test(key)) {
      notes.push(`${spec.path}：忽略非法键名「${key}」`)
      continue
    }
    present[key] = true
    merged[key] = clampInt(src[key], `${spec.path}.${key}`, spec.customFallback ?? 3, spec.ceiling, 0, false, notes)
    order.push(key)
  }
  return { merged, present, order }
}

/** 在嵌套对象里写值（内部用；不删空对象——tree 是给宿主读的快照，结构稳定更好用） */
function setTreeValue(tree: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split('.')
  let node: Record<string, unknown> = tree
  for (const seg of segs.slice(0, -1)) {
    const cur = node[seg]
    if (!isPlainObject(cur)) node[seg] = {}
    node = node[seg] as Record<string, unknown>
  }
  node[segs[segs.length - 1]] = value
}

/**
 * 解析一个模块的参数（任何输入都不抛错）。
 * @param def 模块登记表
 * @param rawByKey settings 载荷（按键给出；缺省键可只传一个裸载荷）
 */
export function resolveModuleParams(
  def: ModuleParamDefinition,
  rawByKey: ModuleParamRawMap | unknown,
): ResolvedModuleParams {
  const keys = moduleParamSettingsKeys(def)
  // 容错：只涉及一个键时，允许直接传那个键的裸载荷（宿主调用更顺手）
  const map: ModuleParamRawMap =
    keys.length === 1 && !(isPlainObject(rawByKey) && hasAnyKey(rawByKey, keys))
      ? { [keys[0]]: rawByKey }
      : (isPlainObject(rawByKey) ? rawByKey : {})

  const notes: string[] = []
  const values: Record<string, ModuleParamValue> = {}
  const touched: Record<string, boolean> = {}
  const maps: Record<string, Record<string, number>> = {}
  const groups: ResolvedModuleParamGroup[] = []

  for (const group of def.groups) {
    const entries = group.params.flatMap((spec) =>
      resolveSpecEntries(def, group, spec, map, values, touched, maps, notes),
    )
    groups.push({ title: group.title, description: group.description, entries })
  }

  // 跨字段一致性护栏：单字段都已夹取完毕，这里只做"字段之间"的修正
  if (def.crossFieldGuard) {
    for (const n of def.crossFieldGuard(values)) notes.push(n)
  }

  // 按 settings 键还原成宿主可用的结构快照
  const trees: Record<string, Record<string, unknown>> = {}
  for (const key of keys) trees[key] = {}
  for (const group of def.groups) {
    for (const spec of group.params) {
      const key = paramSettingsKey(def, spec, group)
      const abs = paramAbsolutePath(def, spec, spec.path, group)
      if (spec.kind === 'numberMap') {
        setTreeValue(trees[key], abs, maps[spec.path] ?? {})
        continue
      }
      const v = values[spec.path]
      if (v === undefined) continue
      setTreeValue(trees[key], abs, v)
    }
  }

  return { moduleKey: def.key, values, trees, touched, notes, groups }
}

/** 载荷映射里是否已经出现过登记的键（用于区分"裸载荷"与"按键映射"） */
function hasAnyKey(raw: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((k) => k in raw)
}

/** 解析一个参数 → 若干条视图模型（numberMap 展开成逐键多行） */
function resolveSpecEntries(
  def: ModuleParamDefinition,
  group: ModuleParamGroup,
  spec: ModuleParamSpec,
  map: ModuleParamRawMap,
  values: Record<string, ModuleParamValue>,
  touched: Record<string, boolean>,
  maps: Record<string, Record<string, number>>,
  notes: string[],
): ModuleParamEntry[] {
  const settingsKey = paramSettingsKey(def, spec, group)
  const payload = map[settingsKey]
  const rawAt = readParamPath(payload, paramAbsolutePath(def, spec, spec.path, group))
  const effect = paramEffect(def, spec, group)
  /** "用户碰过这个参数"的口径 = 载荷里出现过（不论值是否合法；不合法时 note 里会说明已回落） */
  const present = rawAt !== undefined && rawAt !== null
  const base = {
    label: spec.label,
    hint: spec.hint,
    effect,
    unit: spec.unit,
    settingsKey,
  }

  if (spec.kind === 'number') {
    const value = resolveNumber(rawAt, spec, notes)
    values[spec.path] = value
    if (present) touched[spec.path] = true
    return [
      {
        ...base,
        valueKey: spec.path,
        kind: 'number',
        value,
        default: spec.default,
        touched: present,
        ceiling: spec.ceiling,
        floor: paramFloor(spec),
        step: paramStep(spec),
        zeroMeansDisabled: spec.zeroMeansDisabled,
        absolutePath: paramAbsolutePath(def, spec, spec.path, group),
      },
    ]
  }

  if (spec.kind === 'boolean') {
    const value = resolveBoolean(rawAt, spec.path, spec.default, notes)
    values[spec.path] = value
    if (present) touched[spec.path] = true
    return [
      {
        ...base,
        valueKey: spec.path,
        kind: 'boolean',
        value,
        default: spec.default,
        touched: present,
        absolutePath: paramAbsolutePath(def, spec, spec.path, group),
      },
    ]
  }

  const r = resolveNumberMap(rawAt, spec, notes)
  maps[spec.path] = r.merged
  return r.order.map((key, i) => {
    const valueKey = `${spec.path}.${key}`
    const isKnown = key in spec.defaults
    const isPresent = key in r.present
    values[valueKey] = r.merged[key]
    if (isPresent) touched[valueKey] = true
    const dflt = isKnown ? spec.defaults[key] : (spec.customFallback ?? 3)
    const ceiling = isKnown ? (spec.ceilings?.[key] ?? spec.ceiling) : spec.ceiling
    return {
      ...base,
      // numberMap 的每行展示自己的键名（中文名可缺省）
      label: isKnown ? (spec.labels?.[key] ?? key) : key,
      valueKey,
      kind: 'numberMap' as const,
      mapKey: key,
      mapLabel: spec.label,
      isCustom: !isKnown,
      value: r.merged[key],
      default: dflt,
      touched: isPresent,
      ceiling,
      floor: 0,
      step: spec.step ?? 1,
      // 只有第一行携带"可新增自定义键"的标记，避免 UI 每行都画一个按钮
      allowCustomKeys: spec.allowCustomKeys && i === 0,
      absolutePath: `${paramAbsolutePath(def, spec, spec.path, group)}.${key}`,
    }
  })
}

/** 便捷：只要生效值（`valueKey → 值`），丢弃其余 */
export function resolveModuleParamValues(
  def: ModuleParamDefinition,
  rawByKey: ModuleParamRawMap | unknown,
): Record<string, ModuleParamValue> {
  return resolveModuleParams(def, rawByKey).values
}

/**
 * 设置页保存用：把「模块相对路径 → 值」写回按键组织的载荷（返回新载荷映射）。
 * 定位信息直接取 `entry`（它自带 `settingsKey` 与绝对路径），所以不需要传登记表。
 */
export function writeModuleParam(
  rawByKey: ModuleParamRawMap,
  entry: Pick<ModuleParamEntry, 'settingsKey' | 'absolutePath'>,
  value: ModuleParamValue | undefined,
): ModuleParamRawMap {
  return {
    ...rawByKey,
    [entry.settingsKey]: writeParamPath(rawByKey[entry.settingsKey], entry.absolutePath, value),
  }
}

/** 登记表分组（原样；宿主或文档需要遍历时用） */
export function moduleParamGroups(def: ModuleParamDefinition): ModuleParamGroup[] {
  return def.groups
}
