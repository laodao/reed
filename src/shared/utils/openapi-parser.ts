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

/** 列出全部操作（operationId 缺省用 method+path 生成） */
export function listOperations(text: string): { ok: true; operations: OasOperation[] } | { ok: false; error: string } {
  const parsed = parseSpecJson(text)
  if (!parsed.ok) return parsed
  const operations: OasOperation[] = []
  for (const [path, methods] of Object.entries(parsed.spec.paths ?? {})) {
    if (!methods || typeof methods !== 'object') continue
    for (const method of HTTP_METHODS) {
      const op = methods[method] as { operationId?: string; summary?: string } | undefined
      if (!op || typeof op !== 'object') continue
      operations.push({
        operationId: op.operationId || `${method}_${path.replace(/[^a-zA-Z0-9]+/g, '_')}`,
        method: method.toUpperCase(),
        path,
        summary: op.summary,
      })
    }
  }
  return { ok: true, operations }
}

/** 取单个操作的参数声明（path/query/header） */
export function listParameters(text: string, operationId: string): OasParameter[] {
  const parsed = parseSpecJson(text)
  if (!parsed.ok) return []
  for (const [path, methods] of Object.entries(parsed.spec.paths ?? {})) {
    if (!methods || typeof methods !== 'object') continue
    for (const method of HTTP_METHODS) {
      const op = methods[method] as
        | { operationId?: string; parameters?: Array<{ name?: string; in?: string; required?: boolean; schema?: { type?: string }; type?: string }> }
        | undefined
      if (!op) continue
      if ((op.operationId || `${method}_${path.replace(/[^a-zA-Z0-9]+/g, '_')}`) !== operationId) continue
      return (op.parameters ?? [])
        .filter(p => p && typeof p.name === 'string' && ['path', 'query', 'header'].includes(String(p.in)))
        .map(p => ({
          name: String(p.name),
          in: String(p.in) as OasParameter['in'],
          required: !!p.required,
          type: p.schema?.type ?? p.type ?? 'string',
        }))
    }
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
  // 定位操作
  let found: { method: string; path: string } | null = null
  for (const [path, methods] of Object.entries(parsed.spec.paths ?? {})) {
    if (!methods || typeof methods !== 'object') continue
    for (const method of HTTP_METHODS) {
      const op = methods[method] as { operationId?: string } | undefined
      if (!op) continue
      if ((op.operationId || `${method}_${path.replace(/[^a-zA-Z0-9]+/g, '_')}`) === operationId) {
        if (JSON.stringify(op).includes('"$ref"')) {
          return { ok: false, error: 'V1 不支持 $ref 引用：请展开为内联 schema 后粘贴' }
        }
        found = { method: method.toUpperCase(), path }
        break
      }
    }
    if (found) break
  }
  if (!found) return { ok: false, error: `OAS 中不存在 operationId：${operationId}` }

  const base = baseUrlOverride?.trim() || defaultBaseUrl(parsed.spec)
  if (!base) return { ok: false, error: 'OAS 未提供 servers/host，且未填写 baseUrl 覆盖' }

  const paramMap = new Map(params.map(p => [p.key, p.value]))
  const declared = listParameters(text, operationId)
  const declaredNames = new Set(declared.map(d => d.name))

  // path 替换
  let urlPath = found.path
  for (const d of declared.filter(p => p.in === 'path')) {
    const v = paramMap.get(d.name)
    if (v === undefined || v === null || String(v).trim() === '') {
      return { ok: false, error: `缺少路径参数：${d.name}` }
    }
    urlPath = urlPath.replace(`{${d.name}}`, encodeURIComponent(String(v)))
  }
  // query 拼接（声明为 query 的 + 未声明但提供了的也进 query？——不，未声明的进 body/忽略）
  const query = new URLSearchParams()
  for (const d of declared.filter(p => p.in === 'query')) {
    const v = paramMap.get(d.name)
    if (v !== undefined && v !== null && String(v).trim() !== '') query.set(d.name, String(v))
  }
  const url = `${base.replace(/\/$/, '')}${urlPath}${query.size > 0 ? `?${query.toString()}` : ''}`

  // headers：OAS header 参数 + JSON 内容类型（有 body 时）
  const headers: Record<string, string> = {}
  for (const d of declared.filter(p => p.in === 'header')) {
    const v = paramMap.get(d.name)
    if (v !== undefined && v !== null && String(v).trim() !== '') headers[d.name] = String(v)
  }

  // body：非 path/query/header 的参数（显式 body 语义）+ 声明外的额外参数（自由透传）
  const bodyParams: Record<string, unknown> = {}
  for (const [k, v] of paramMap) {
    if (declaredNames.has(k)) continue
    if (v !== undefined && v !== null && String(v).trim() !== '') bodyParams[k] = v
  }
  let body: string | undefined
  if (['POST', 'PUT', 'PATCH'].includes(found.method) && Object.keys(bodyParams).length > 0) {
    body = JSON.stringify(bodyParams)
    headers['Content-Type'] = 'application/json'
  }

  return { ok: true, request: { method: found.method, url, headers, body } }
}
