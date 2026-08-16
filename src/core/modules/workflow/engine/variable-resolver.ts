/**
 * 工作流变量解析器（{{}} 模板）
 * @module core/modules/workflow/engine/variable-resolver
 * @description {{nodeId.path.to.field}} / {{start.inputKey}} / {{loopNode.item}} 的
 *              解析。纯逻辑、无 IO——每个 RunExecution 持有一个实例。
 *
 *              语义：
 *              - 字符串内多处占位 → 依次替换拼接为字符串
 *              - 整个字符串恰为单个占位 → 原样返回解析值（保留类型：
 *                对象/数组/数字/布尔——loop.listExpression 依赖此行为）
 *              - 引用缺失 → 字符串模式渲染为 ''，值模式返回 undefined（记警告）
 *              - 循环体内引用 body 节点 → 自动映射到当前迭代版本
 *                （nodeId → nodeId:i，由 iterationContext 提供）
 */

/** 迭代上下文：解析发生在循环体第 iteration 轮 */
export interface IterationContext {
  iterationIndex: number
  /** body 节点集合（引用这些节点时映射到带迭代后缀的键） */
  bodyNodeIds: Set<string>
}

/** 变量解析上下文（RunExecution 构建，节点执行期间只读） */
export interface VariableResolverContext {
  /** nodeKey（nodeId 或 nodeId:iteration）→ 输出对象 */
  variables: Map<string, Record<string, unknown>>
  /** 开始节点输入 */
  startInputs: Record<string, unknown>
}

/** 占位符语法：{{ root.field.nested }}，允许空白 */
const TEMPLATE_RE = /\{\{\s*([^{}\s]+(?:\.[^{}\s]+)*)\s*\}\}/g

export class VariableResolver {
  constructor(private ctx: VariableResolverContext) {}

  /**
   * 解析模板字符串。
   * @param template 含 {{}} 占位的字符串（或已是非字符串——直接原样返回）
   * @param iteration 迭代上下文（循环体内解析时提供）
   * @returns 单一完整占位时返回原始类型值；否则返回拼接字符串
   */
  resolve(template: string, iteration?: IterationContext): unknown {
    if (typeof template !== 'string') return template

    // 找出全部占位符
    const matches: Array<{ full: string; path: string }> = []
    TEMPLATE_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TEMPLATE_RE.exec(template)) !== null) {
      matches.push({ full: m[0], path: m[1] })
    }
    if (matches.length === 0) return template

    // 整串恰为单个占位 → 值透传（保留类型）
    if (matches.length === 1 && matches[0].full === template) {
      return this.lookup(matches[0].path, iteration)
    }

    // 多占位 / 混合文本 → 字符串拼接
    return template.replace(TEMPLATE_RE, (_full, path: string) => {
      const value = this.lookup(path, iteration)
      return this.stringify(value)
    })
  }

  /** 路径查找：root 是 nodeId / 'start' / 循环节点伪命名空间 */
  private lookup(path: string, iteration?: IterationContext): unknown {
    const segments = path.split('.')
    const root = segments[0]

    let source: unknown
    if (root === 'start') {
      source = this.ctx.startInputs
    } else {
      const key = this.nodeKeyFor(root, iteration)
      source = this.ctx.variables.get(key)
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

  /** 引用的节点是否在当前迭代上下文的 body 内 → 键加迭代后缀 */
  private nodeKeyFor(nodeId: string, iteration?: IterationContext): string {
    if (iteration && iteration.bodyNodeIds.has(nodeId)) {
      return `${nodeId}:${iteration.iterationIndex}`
    }
    return nodeId
  }

  private stringify(value: unknown): string {
    return stringifyValue(value)
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
