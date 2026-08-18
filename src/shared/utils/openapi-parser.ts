/**
 * OpenAPI/Swagger 最小解析器（C5 自定义接口节点，spec v2 §5）
 * @module shared/utils/openapi-parser
 * @description 纯函数、零依赖——core 的 oas-tool handler 与前端表单共用。
 *              支持 Swagger 2.0（host+basePath）与 OpenAPI 3.x（servers[0].url）；
 *              V1 限制（与 Bisheng 对齐）：不支持 $ref 引用与复杂 schema
 *              （ requestBody.content['application/json'].schema.$ref 等）。
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

/** 解析 JSON 文本为规范对象；不合法/非对象返回 error（不抛异常） */
export function parseSpecJson(text: string): { ok: true; spec: OasSpecShape } | { ok: false; error: string } {
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
  return { ok: true, spec: s }
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
  if (JSON.stringify(located.raw).includes('"$ref"')) {
    return { ok: false, error: 'V1 不支持 $ref 引用：请展开为内联 schema 后粘贴' }
  }
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
