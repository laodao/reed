/**
 * 工作流变量解析器（{{}} 模板）
 * @module core/modules/workflow/engine/variable-resolver
 * @description {{nodeId.path.to.field}} / {{start.inputKey}} / {{loopNode.item}} 的
 *              解析。纯逻辑、无 IO——每个 RunExecution 持有一个实例。
 *
 *              作用域链（片4 作用域架构）：解析时可传入 LocalLookup——
 *              循环迭代作用域的 body 节点输出与循环伪变量（item/index/list）
 *              优先从局部查，未命中回退根命名空间变量。
 *
 *              语义：
 *              - 字符串内多处占位 → 依次替换拼接为字符串
 *              - 整个字符串恰为单个占位 → 原样返回解析值（保留类型：
 *                对象/数组/数字/布尔——loop.listExpression 依赖此行为）
 *              - 引用缺失 → 字符串模式渲染为 ''，值模式返回 undefined
 */

/** 局部查找接口（引擎按作用域提供：body 输出 + 循环伪变量） */
export interface LocalLookup {
  lookup(rootId: string): { hit: boolean; value: unknown }
}

/** 变量解析上下文（RunExecution 构建，节点执行期间只读） */
export interface VariableResolverContext {
  /** nodeId → 输出对象（根命名空间） */
  variables: Map<string, Record<string, unknown>>
  /** 开始节点输入 */
  startInputs: Record<string, unknown>
}

/** 系统变量根（保留，不可被节点 id 遮蔽——校验器同源限制） */
const SYS_VAR_ROOT = 'sys'

/**
 * 系统变量快照：每次解析时求值（同一运行内不同节点取值可差几秒，可接受语义）。
 * - now：ISO 时间字符串
 * - today：本地 yyyy-MM-dd
 * - week：周次标签（YYYY年第N周，与报告模板页眉同源口径）
 * - ts：epoch 毫秒
 */
function sysVarsSnapshot(): Record<string, unknown> {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  // ISO 周计数（周报等场景的周次口径）
  const startOfYear = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil((((d.getTime() - startOfYear.getTime()) / 86_400_000) + startOfYear.getDay() + 1) / 7)
  return {
    now: d.toISOString(),
    today: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    week: `${d.getFullYear()}年第${week}周`,
    ts: d.getTime(),
  }
}

/** 占位符语法：{{ root.field.nested }}，允许空白（引擎解析与图校验共用同一正则） */
export const TEMPLATE_RE = /\{\{\s*([^{}\s]+(?:\.[^{}\s]+)*)\s*\}\}/g

export class VariableResolver {
  constructor(private ctx: VariableResolverContext) {}

  /**
   * 解析模板字符串。
   * @param template 含 {{}} 占位的字符串（或已是非字符串——直接原样返回）
   * @param local 作用域局部查找（循环体内解析时提供）
   * @returns 单一完整占位时返回原始类型值；否则返回拼接字符串
   */
  resolve(template: string, local?: LocalLookup): unknown {
    if (typeof template !== 'string') return template

    const matches: Array<{ full: string; path: string }> = []
    TEMPLATE_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TEMPLATE_RE.exec(template)) !== null) {
      matches.push({ full: m[0], path: m[1] })
    }
    if (matches.length === 0) return template

    if (matches.length === 1 && matches[0].full === template) {
      return this.lookup(matches[0].path, local)
    }

    return template.replace(TEMPLATE_RE, (_full, path: string) => {
      const value = this.lookup(path, local)
      return stringifyValue(value)
    })
  }

  /** 路径查找：root 是 nodeId / 'start' / 'sys'；sys 不可遮蔽（先于变量表），local 命中优先回退根命名空间 */
  private lookup(path: string, local?: LocalLookup): unknown {
    const segments = path.split('.')
    const root = segments[0]

    let source: unknown
    if (root === SYS_VAR_ROOT) {
      source = sysVarsSnapshot()
    } else if (root === 'start') {
      source = this.ctx.startInputs
    } else {
      source = this.ctx.variables.get(root)
      if (source === undefined && local) {
        const found = local.lookup(root)
        if (found.hit) source = found.value
      }
    }
    if (source === undefined || source === null) {
      return undefined
    }
    // 逐级下钻（支持数组下标数字段：items.0.name）
    let current: unknown = source
    for (let i = 1; i < segments.length; i++) {
      if (current === null || current === undefined) return undefined
      current = (current as Record<string, unknown>)[segments[i]]
    }
    return current
  }
}

/**
 * 值字符串化（模块内唯一实现，条件比较/模板拼接/截断共用）：
 * null/undefined → 空串；对象 → JSON（失败回退 String）；其余 String()。
 */
export function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

/**
 * 深度解析对象中的全部字符串字段（引擎准备节点 config 时用：
 * handler 拿到的 config 已是全实参）。
 * 循环数组/普通对象；非字符串原样保留。
 */
export function resolveConfigDeep<T>(config: T, resolve: (template: string) => unknown): T {
  return deepWalk(config, resolve) as T
}

function deepWalk(value: unknown, resolve: (t: string) => unknown): unknown {
  if (typeof value === 'string') {
    return resolve(value)
  }
  if (Array.isArray(value)) {
    return value.map(item => deepWalk(item, resolve))
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepWalk(v, resolve)
    }
    return out
  }
  return value
}
