/**
 * 分组数字参数的进程级持有者（通用工厂）
 * @module shared/utils/param-holder
 *
 * 「参数设置」里有一类参数是**进程级、被深层模块在使用点现读**的
 * （工作流运行参数、Agent 上下文与记忆预算……）。它们的形态完全一样：
 *
 *   内置默认（分组）→ settings 覆盖 → 硬上限夹取 → 分组间一致性修正 → 使用点现读
 *
 * 于是把"持有者"抽成这一个工厂：每个模块只需声明 defaults / limits（+可选一致性护栏）与
 * "如何从 settings 解析"（解析仍走登记表 `resolveModuleParams`，保证与设置页同一口径），
 * 不必各写一份 set/reset/夹取。
 *
 * 生效时机：使用点每次现读 `holder.get()`，装配方在启动与**每次 settings 写入后**重新注入
 * （`settings-reload`），因此改完不必重启。
 *
 * 类型说明：分组既可以是 `Record<string, number>`，也可以是具名接口（`AgentContextParams` 这类）。
 * 后者没有索引签名，故这里的泛型放宽到 `object`，内部按"字段→数字"遍历（分组只放数字字段）。
 */

/** 分组数字参数的最小结构（内部遍历用） */
type NumericRecord = Record<string, number>

/** 部分覆盖（只写关心的组/字段） */
export type ParamGroupsPatch<G extends object> = {
  [K in keyof G]?: Partial<G[K]>
}

export interface ParamHolder<G extends object> {
  /** 读当前生效值（使用点现读；未注入时即内置默认） */
  get(): G
  /**
   * 注入生效值。只接受有限非负数，非法项保留当前值——
   * 参数坏了宁可保守（例如"间隔 0/负数"不能把外部站点打爆）。
   */
  set(patch: ParamGroupsPatch<G>): G
  /** 测试隔离用：回到内置默认 */
  reset(): void
}

const asRecord = (value: unknown): NumericRecord => (value ?? {}) as NumericRecord

/** 分组深拷贝（分组是纯数字表，逐字段复制即可；不用 structuredClone 以免碰上 Proxy） */
function cloneGroups<G extends object>(groups: G): G {
  const out: Record<string, NumericRecord> = {}
  for (const [group, values] of Object.entries(groups)) out[group] = { ...asRecord(values) }
  return out as G
}

/**
 * 冻结一份生效值：持有者是**进程级单例**，`get()` 返回的引用若可写，
 * 任何调用点一次误改就会污染全进程（而且很难查）。冻结后误改会直接抛错（ESM 严格模式），
 * 比"静默改坏"好得多；读取成本不变。
 */
function freezeGroups<G extends object>(groups: G): G {
  for (const values of Object.values(groups as Record<string, unknown>)) {
    if (values && typeof values === 'object') Object.freeze(values)
  }
  return Object.freeze(groups)
}

/**
 * 造一个持有者。
 * @param cfg.defaults 内置默认（= 改造前写死在代码里的常量）
 * @param cfg.limits 代码级硬上限（配置值一律夹到这里）
 * @param cfg.normalize 分组内/跨字段一致性修正（原地改）
 */
export function createParamHolder<G extends object>(cfg: {
  defaults: G
  limits: G
  normalize?: (groups: G) => void
}): ParamHolder<G> {
  let current = freezeGroups(cloneGroups(cfg.defaults))

  return {
    get: () => current,

    set(patch: ParamGroupsPatch<G>): G {
      const defaultsAll = cfg.defaults as Record<string, unknown>
      const limitsAll = cfg.limits as Record<string, unknown>
      const currentAll = current as Record<string, unknown>
      const patchAll = patch as Record<string, unknown>
      const next: Record<string, NumericRecord> = {}
      for (const group of Object.keys(defaultsAll)) {
        const defaults = asRecord(defaultsAll[group])
        const limits = asRecord(limitsAll[group])
        const currentGroup = asRecord(currentAll[group])
        const patchGroup = asRecord(patchAll[group])
        const out: NumericRecord = {}
        for (const key of Object.keys(defaults)) {
          const raw = patchGroup[key]
          const v = typeof raw === 'number' ? raw : Number(raw)
          out[key] =
            Number.isFinite(v) && v >= 0
              ? Math.min(Math.floor(v), limits[key] ?? defaults[key])
              : (currentGroup[key] ?? defaults[key])
        }
        next[group] = out
      }
      const merged = next as unknown as G
      cfg.normalize?.(merged)
      current = freezeGroups(merged)
      return current
    },

    reset(): void {
      current = freezeGroups(cloneGroups(cfg.defaults))
    },
  }
}

/**
 * 取一层的数字字段（缺失/类型不对时回落默认）。
 * @param tree 载荷里的一段（对象）
 * @param defaults 字段 → 默认值
 */
export function pickNumericFields<T extends object>(tree: unknown, defaults: T): T {
  const source = (tree && typeof tree === 'object' ? tree : {}) as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const [key, fallback] of Object.entries(defaults as Record<string, unknown>)) {
    const v = source[key]
    out[key] = typeof v === 'number' && Number.isFinite(v) ? v : (fallback as number)
  }
  return out as T
}

// ==================== 布尔开关持有者 ====================

export interface FlagHolder<F extends object> {
  /** 读当前生效值（使用点现读；未注入时即内置默认） */
  get(): F
  /** 注入（只接受真正的布尔值，其它类型保留原值——避免字符串 'false' 变成真） */
  set(patch: { [K in keyof F]?: boolean }): F
  /** 测试隔离用：回到内置默认 */
  reset(): void
}

/**
 * 布尔开关的持有者。
 *
 * **为什么不复用 `createParamHolder`**：数字持有者会对每个字段做 `Number()` 与夹取，
 * 布尔进到那里会被静默当成 0/1（`'false'` 也会变真），这类"配置看着关了其实没关"的问题
 * 比不支持布尔更糟。所以布尔单独一个持有者，只做布尔判定。
 */
export function createFlagHolder<F extends object>(defaults: F): FlagHolder<F> {
  let current = Object.freeze({ ...defaults })
  return {
    get: () => current,
    set(patch: { [K in keyof F]?: boolean }): F {
      const next = { ...current } as Record<string, unknown>
      for (const key of Object.keys(defaults as Record<string, unknown>)) {
        const v = (patch as Record<string, unknown>)[key]
        if (typeof v === 'boolean') next[key] = v
      }
      current = Object.freeze(next) as F
      return current
    },
    reset(): void {
      current = Object.freeze({ ...defaults })
    },
  }
}

/** 取一层的布尔字段（缺失/非布尔时回落默认） */
export function pickBooleanFields<T extends object>(tree: unknown, defaults: T): T {
  const source = (tree && typeof tree === 'object' ? tree : {}) as Record<string, unknown>
  const out: Record<string, boolean> = {}
  for (const [key, fallback] of Object.entries(defaults as Record<string, unknown>)) {
    const v = source[key]
    out[key] = typeof v === 'boolean' ? v : (fallback as boolean)
  }
  return out as T
}

/**
 * 从登记表解析出的 `tree` 里取分组值（缺失/类型不对时回落默认）。
 * 各模块的"从 settings 解析"都用它，保证与设置页口径一致。
 */
export function pickNumericGroups<G extends object>(tree: unknown, defaults: G): G {
  const source = (tree && typeof tree === 'object' ? tree : {}) as Record<string, unknown>
  const out: Record<string, NumericRecord> = {}
  for (const [group, fields] of Object.entries(defaults as Record<string, unknown>)) {
    out[group] = pickNumericFields(source[group], asRecord(fields))
  }
  return out as G
}
