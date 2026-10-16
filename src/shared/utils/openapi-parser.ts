/**
 * OpenAPI/Swagger 最小解析器（C5 自定义接口节点，spec v2 §5）
 * @module shared/utils/openapi-parser
 * @description 纯函数、零依赖——core 的 oas-tool handler 与前端表单共用。
 *              支持 Swagger 2.0（host+basePath）与 OpenAPI 3.x（servers[0].url）。
 *              V2（25 号 M2 批3）：解析期展开文档内 $ref（#/components/schemas、
 *              #/definitions 及任意 JSON 指针），循环引用/外部引用报可读错误；
 *              下游 listOperations/listParameters/buildRequest 看到的始终是已展开形态。
 */

/** 解析出的操作项 */
export interface OasOperation {
  operationId: string
  method: string
  path: string
  summary?: string
}

/** 操作的参数声明（表单自动生成依据） */
export interface OasParameter {
  name: string
  in: 'path' | 'query' | 'header'
  required: boolean
  /** 类型描述（string/number/boolean；schema 缺省为 string） */
  type: string
}

interface OasSpecShape {
  openapi?: string
  swagger?: string
  host?: string
  basePath?: string
  schemes?: string[]
  servers?: Array<{ url: string }>
  paths?: Record<string, Record<string, unknown>>
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

/** $ref 展开深度上限（非循环的病态深链防御） */
const REF_DEPTH_LIMIT = 64
/** 展开节点数预算（review B7：菱形引用 A→[B,B]→… 深度有限但 2^depth 指数重复展开） */
const REF_NODE_BUDGET = 100_000
/** OAS 文本大小上限（同步 IPC 校验路径的 DoS 防线） */
const SPEC_TEXT_MAX_BYTES = 1_000_000

/** 原型链危险键（review B6：'__proto__' 普通赋值会触发 setter 污染产物原型） */
function isDangerousKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype'
}

/** JSON 指针定位（RFC 6901；只支持文档内 '#/...' 引用；危险段拒绝） */
function resolveJsonPointer(root: unknown, pointer: string): unknown {
  const path = pointer.slice(2).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
  if (path.some(isDangerousKey)) return undefined
  let cur: unknown = root
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

/** 深度展开 $ref（解析期一次性；循环/外部引用/超深链/超预算报可读错误） */
function dereferenceRefs(
  node: unknown,
  root: unknown,
  stack: string[],
  depth: number,
  budget: { nodes: number },
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (depth > REF_DEPTH_LIMIT) return { ok: false, error: `$ref 展开深度超过 ${REF_DEPTH_LIMIT}（病态嵌套）` }
  if (budget.nodes-- <= 0) return { ok: false, error: `spec 展开节点数超过 ${REF_NODE_BUDGET}（疑似病态引用结构）` }
  if (Array.isArray(node)) {
    const out: unknown[] = []
    for (const item of node) {
      const r = dereferenceRefs(item, root, stack, depth + 1, budget)
      if (!r.ok) return r
      out.push(r.value)
    }
    return { ok: true, value: out }
  }
  if (node !== null && typeof node === 'object') {
    const ref = (node as Record<string, unknown>)['$ref']
    if (typeof ref === 'string') {
      if (!ref.startsWith('#/')) {
        return { ok: false, error: `不支持外部 $ref（仅支持文档内 #/... 引用）：${ref}` }
      }
      if (stack.includes(ref)) {
        return { ok: false, error: `$ref 循环引用：${[...stack, ref].join(' → ')}` }
      }
      const target = resolveJsonPointer(root, ref)
      if (target === undefined) {
        return { ok: false, error: `$ref 无法解析（文档内不存在该路径）：${ref}` }
      }
      return dereferenceRefs(target, root, [...stack, ref], depth + 1, budget)
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const r = dereferenceRefs(v, root, stack, depth + 1, budget)
      if (!r.ok) return r
      // defineProperty 绕开 '__proto__' 的 setter（review B6：普通赋值会改写产物原型）
      Object.defineProperty(out, k, { value: r.value, enumerable: true, writable: true, configurable: true })
    }
    return { ok: true, value: out }
  }
  return { ok: true, value: node }
}

/** 解析 JSON 文本为规范对象（含 $ref 展开）；不合法/非对象返回 error（不抛异常） */
export function parseSpecJson(text: string): { ok: true; spec: OasSpecShape } | { ok: false; error: string } {
  if (text.length > SPEC_TEXT_MAX_BYTES) {
    return { ok: false, error: `OAS 文本超过 ${Math.floor(SPEC_TEXT_MAX_BYTES / 1024)}KB 上限（同步解析防 DoS）` }
  }
  let spec: unknown
  try {
    spec = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `OAS JSON 解析失败：${e instanceof Error ? e.message : String(e)}` }
  }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, error: 'OAS 必须是 JSON 对象' }
  }
  const s = spec as OasSpecShape
  if (!s.openapi && !s.swagger) return { ok: false, error: '缺少 openapi/swagger 版本字段（不是合法的 OAS 文档）' }
  if (!s.paths || typeof s.paths !== 'object') return { ok: false, error: '缺少 paths 字段（没有可调用的接口）' }
  const resolved = dereferenceRefs(spec, spec, [], 0, { nodes: REF_NODE_BUDGET })
  if (!resolved.ok) return resolved
  return { ok: true, spec: resolved.value as OasSpecShape }
}

/**
 * 定位操作（唯一入口）：
 * - F13：operationId 重复时自动消歧——首个保留原 id，后续追加 `#method:path` 后缀
 *   （OAS 要求全局唯一但现实常违反；不消歧会导致下拉两项同值、执行永远选第一个）
 * - 返回 operations 映射（消歧后的 id -> 原始位置）与原始条目
 */
function locateOperations(spec: OasSpecShape): Map<string, { method: string; path: string; raw: Record<string, unknown> }> {
  const seen = new Map<string, number>()
  const out = new Map<string, { method: string; path: string; raw: Record<string, unknown> }>()
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    if (!methods || typeof methods !== 'object') continue
    for (const method of HTTP_METHODS) {
      const op = (methods as Record<string, unknown>)[method] as Record<string, unknown> | undefined
      if (!op || typeof op !== 'object') continue
      let id = String(op.operationId ?? `${method}_${path.replace(/[^a-zA-Z0-9]+/g, '_')}`)
      const dup = seen.get(id) ?? 0
      seen.set(id, dup + 1)
      if (dup > 0) id = `${id}#${method}:${path}` // 消歧后缀（显示层标注 method/path）
      out.set(id, { method, path, raw: op })
    }
  }
  return out
}

/** 列出全部操作（operationId 缺省用 method+path 生成；重复 id 消歧） */
export function listOperations(text: string): { ok: true; operations: OasOperation[] } | { ok: false; error: string } {
  const parsed = parseSpecJson(text)
  if (!parsed.ok) return parsed
  const operations: OasOperation[] = []
  for (const [id, { method, path, raw }] of locateOperations(parsed.spec)) {
    operations.push({
      operationId: id,
      method: method.toUpperCase(),
      path,
      summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    })
  }
  return { ok: true, operations }
}

type RawParameter = { name?: string; in?: string; required?: boolean; schema?: { type?: string }; type?: string }

function toOasParameter(p: RawParameter): OasParameter | null {
  if (!p || typeof p.name !== 'string' || !['path', 'query', 'header'].includes(String(p.in))) return null
  return {
    name: String(p.name),
    in: String(p.in) as OasParameter['in'],
    required: !!p.required,
    type: p.schema?.type ?? p.type ?? 'string',
  }
}

/**
 * 取单个操作的参数声明（path/query/header）。
 * F10：合并 path-item 级 parameters（OpenAPI 规范支持的共享参数写法——
 * 只读 operation 级会漏掉 path 共享参数，表单生成 0 行、运行时报缺参）。
 */
export function listParameters(text: string, operationId: string): OasParameter[] {
  const parsed = parseSpecJson(text)
  if (!parsed.ok) return []
  // 定位原始位置（消歧 id 的 `#method:path` 后缀反解回 path-item）
  for (const [id, { method, path, raw }] of locateOperations(parsed.spec)) {
    if (id !== operationId) continue
    const pathItem = (parsed.spec.paths ?? {})[path] as Record<string, unknown> | undefined
    const shared = Array.isArray(pathItem?.parameters) ? (pathItem.parameters as RawParameter[]) : []
    const own = Array.isArray(raw.parameters) ? (raw.parameters as RawParameter[]) : []
    // 操作级覆盖同名 path-item 级（规范语义：具体覆盖通用）
    const byName = new Map<string, OasParameter>()
    for (const p of [...shared, ...own]) {
      const conv = toOasParameter(p)
      if (conv) byName.set(`${conv.in}:${conv.name}`, conv)
    }
    return [...byName.values()]
  }
  return []
}

/** 规范默认 baseUrl：OpenAPI 3 servers[0] / Swagger 2 host+basePath+schemes */
function defaultBaseUrl(spec: OasSpecShape): string | null {
  if (spec.servers?.[0]?.url) return spec.servers[0].url
  if (spec.host) {
    const scheme = spec.schemes?.includes('https') ? 'https' : (spec.schemes?.[0] ?? 'https')
    return `${scheme}://${spec.host}${spec.basePath ?? ''}`
  }
  return null
}

/**
 * 组装请求（模板已由引擎解析后的实参）：
 * - path 参数替换 {name} 占位
 * - query 参数拼接（值非空才拼）
 * - header 参数并入 headers
 * - POST/PUT/PATCH：bodyParams（非 path/query/header 的参数）作为 JSON body
 */
export function buildRequest(
  text: string,
  operationId: string,
  params: Array<{ key: string; value: unknown }>,
  baseUrlOverride?: string
): { ok: true; request: { method: string; url: string; headers: Record<string, string>; body?: string } } | { ok: false; error: string } {
  const parsed = parseSpecJson(text)
  if (!parsed.ok) return parsed
  // 定位操作（locateOperations 统一消歧口径）
  const located = locateOperations(parsed.spec).get(operationId)
  if (!located) return { ok: false, error: `OAS 中不存在 operationId：${operationId}` }
  // $ref 已在 parseSpecJson 解析期展开（V2）——此处不再拒绝
  const found = { method: located.method.toUpperCase(), path: located.path }

  const base = baseUrlOverride?.trim() || defaultBaseUrl(parsed.spec)
  if (!base) return { ok: false, error: 'OAS 未提供 servers/host，且未填写 baseUrl 覆盖' }
  // F12：相对 server URL（如 "/api/v1"）会让 fetch 抛无法解析的 URL——给可读错误
  if (!/^https?:\/\//i.test(base)) {
    return { ok: false, error: `BaseURL 必须以 http(s):// 开头（当前：${base}）——请填写 baseUrl 覆盖` }
  }

  const paramMap = new Map(params.map(p => [p.key, p.value]))
  const declared = listParameters(text, operationId)
  const declaredNames = new Set(declared.map(d => d.name))
  // F11：按声明类型转换（模板解析后值全是字符串；严格校验的 API 会把 "18"/"true" 打回 422）
  const coerce = (v: unknown, type: string): unknown => {
    const str = String(v)
    if (type === 'number') { const n = Number(str); return Number.isFinite(n) ? n : str }
    if (type === 'boolean') return str === 'true' || str === '1' ? true : (str === 'false' || str === '0' ? false : str)
    if (type === 'integer') { const n = Number.parseInt(str, 10); return Number.isFinite(n) ? n : str }
    return str
  }

  // path 替换（F9：同名参数可能多次出现——replaceAll 全量替换）
  let urlPath = found.path
  for (const d of declared.filter(p => p.in === 'path')) {
    const v = paramMap.get(d.name)
    if (v === undefined || v === null || String(v).trim() === '') {
      return { ok: false, error: `缺少路径参数：${d.name}` }
    }
    urlPath = urlPath.replaceAll(`{${d.name}}`, encodeURIComponent(String(v)))
  }
  // query 拼接（F14：不用 URLSearchParams.size——Node<19.4/旧浏览器 undefined 会静默丢 query）
  const query = new URLSearchParams()
  for (const d of declared.filter(p => p.in === 'query')) {
    const v = paramMap.get(d.name)
    if (v !== undefined && v !== null && String(v).trim() !== '') query.set(d.name, String(coerce(v, d.type)))
  }
  const qs = query.toString()
  const url = `${base.replace(/\/$/, '')}${urlPath}${qs !== '' ? `?${qs}` : ''}`

  // headers：OAS header 参数 + JSON 内容类型（有 body 时）
  const headers: Record<string, string> = {}
  for (const d of declared.filter(p => p.in === 'header')) {
    const v = paramMap.get(d.name)
    if (v !== undefined && v !== null && String(v).trim() !== '') headers[d.name] = String(v)
  }

  // body：非 path/query/header 的参数（显式 body 语义）+ 声明外的额外参数（自由透传）
  const bodyParams: Record<string, unknown> = {}
  const declaredByKey = new Map(declared.map(d => [d.name, d]))
  for (const [k, v] of paramMap) {
    if (v === undefined || v === null || String(v).trim() === '') continue
    if (declaredByKey.has(k)) continue // path/query/header 已在上面处理
    // F11：自由透传参数维持原值（无声明类型可依）
    bodyParams[k] = v
  }
  let body: string | undefined
  if (['POST', 'PUT', 'PATCH'].includes(found.method) && Object.keys(bodyParams).length > 0) {
    body = JSON.stringify(bodyParams)
    headers['Content-Type'] = 'application/json'
  }

  return { ok: true, request: { method: found.method, url, headers, body } }
}
