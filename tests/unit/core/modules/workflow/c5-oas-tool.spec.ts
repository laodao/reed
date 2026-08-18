/**
 * C5 OAS 自定义接口节点测试：解析器（合法/非法/无操作/$ref）/ 请求组装（GET query + POST body + path 参数）/ handler 校验与执行
 * @module tests/workflow/c5-oas-tool
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { listOperations, listParameters, buildRequest, parseSpecJson } from '@shared/utils/openapi-parser'
import { OAS_NODE_HANDLERS } from '@core/modules/workflow/nodes/oas-nodes'
import { NODE_TYPE_CATALOG_MAP, NODE_TYPE_CATALOG } from '@shared/types/workflow-node-catalog'
import { NODE_CONFIG_FORMS } from '@shared/types/workflow-node-forms'
import { WORKFLOW_NODE_TYPES } from '@shared/types/workflow.types'

const SPEC_V3 = JSON.stringify({
  openapi: '3.0.0',
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/pets/{petId}': {
      get: {
        operationId: 'getPet',
        summary: '查宠物',
        parameters: [
          { name: 'petId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'verbose', in: 'query', schema: { type: 'boolean' } },
          { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
        ],
      },
    },
    '/pets': {
      post: {
        operationId: 'createPet',
        parameters: [],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
      },
    },
  },
})

const SPEC_SWAGGER2 = JSON.stringify({
  swagger: '2.0',
  host: 'old.example.com',
  basePath: '/api',
  schemes: ['https'],
  paths: { '/ping': { get: { operationId: 'ping' } } },
})

const handler = OAS_NODE_HANDLERS[0]

describe('C5：OAS 解析器', () => {
  it('非法 JSON / 非对象 / 缺版本字段 / 缺 paths 均报错', () => {
    expect(parseSpecJson('not json').ok).toBe(false)
    expect(parseSpecJson('[1,2]').ok).toBe(false)
    expect(parseSpecJson('{"paths":{}}').ok).toBe(false)
    expect(parseSpecJson('{"openapi":"3.0.0"}').ok).toBe(false)
  })

  it('列出操作（含缺省 operationId 生成）', () => {
    const r = listOperations(SPEC_V3)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.operations.map(o => o.operationId).sort()).toEqual(['createPet', 'getPet'])
    }
    const r2 = listOperations(JSON.stringify({ openapi: '3.0.0', paths: { '/x': { get: {} } } }))
    expect(r2.ok && r2.operations[0].operationId).toBe('get__x')
  })

  it('参数声明：path/query/header 分类与 required 标记', () => {
    const params = listParameters(SPEC_V3, 'getPet')
    expect(params).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'petId', in: 'path', required: true }),
      expect.objectContaining({ name: 'verbose', in: 'query', required: false }),
      expect.objectContaining({ name: 'X-Trace', in: 'header' }),
    ]))
  })

  it('GET：path 替换 + query 拼接 + header 并入', () => {
    const r = buildRequest(SPEC_V3, 'getPet', [
      { key: 'petId', value: 'dog 1' },
      { key: 'verbose', value: 'true' },
      { key: 'X-Trace', value: 'abc' },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.request.method).toBe('GET')
      expect(r.request.url).toBe('https://api.example.com/v1/pets/dog%201?verbose=true')
      expect(r.request.headers['X-Trace']).toBe('abc')
      expect(r.request.body).toBeUndefined()
    }
  })

  it('POST：未声明参数进 JSON body；Swagger2 host 解析；baseUrl 覆盖', () => {
    const r = buildRequest(SPEC_V3, 'createPet', [{ key: 'name', value: '小白' }])
    expect(r.ok && r.request.body).toBe(JSON.stringify({ name: '小白' }))
    expect(r.ok && r.request.headers['Content-Type']).toBe('application/json')

    const r2 = buildRequest(SPEC_SWAGGER2, 'ping', [])
    expect(r2.ok && r2.request.url).toBe('https://old.example.com/api/ping')

    const r3 = buildRequest(SPEC_SWAGGER2, 'ping', [], 'https://override.example.com')
    expect(r3.ok && r3.request.url).toBe('https://override.example.com/ping')
  })

  it('缺必填 path 参数 / 未知 operationId / $ref 引用 拒绝', () => {
    expect(buildRequest(SPEC_V3, 'getPet', []).ok).toBe(false)
    expect(buildRequest(SPEC_V3, 'nope', []).ok).toBe(false)
    const refSpec = JSON.stringify({ openapi: '3.0.0', servers: [{ url: 'https://x.com' }], paths: { '/a': { get: { operationId: 'a', parameters: [{ $ref: '#/x' }] } } } })
    expect(buildRequest(refSpec, 'a', []).ok).toBe(false)
  })
})

describe('C5：oas-tool handler', () => {
  const baseCtx = (config: Record<string, unknown>) =>
    ({ config, signal: new AbortController().signal, logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} } }) as never

  it('validateConfig：缺 spec / 未知 operation / 缺必填参数', () => {
    expect(handler.validateConfig({} as never)).toEqual(expect.arrayContaining([expect.stringContaining('OpenAPI')]))
    expect(handler.validateConfig({ oasSpec: SPEC_V3, operationId: 'nope' } as never)).toEqual(expect.arrayContaining([expect.stringContaining('nope')]))
    expect(handler.validateConfig({ oasSpec: SPEC_V3, operationId: 'getPet', params: [] } as never)).toEqual(expect.arrayContaining([expect.stringContaining('petId')]))
    expect(handler.validateConfig({ oasSpec: SPEC_V3, operationId: 'getPet', params: [{ key: 'petId', value: 'p1' }] } as never)).toEqual([])
  })

  it('execute：按 OAS 组装并复用共享 HTTP 执行（mock fetch）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const result = await handler.execute(baseCtx({
        oasSpec: SPEC_V3,
        operationId: 'getPet',
        params: [{ key: 'petId', value: 'cat9' }],
        headers: [{ key: 'Authorization', value: 'Bearer t' }],
      }))
      expect(result.status).toBe('succeeded')
      if (result.status === 'succeeded') {
        expect(result.output).toMatchObject({ status: 200, json: { ok: true } })
      }
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://api.example.com/v1/pets/cat9')
      expect(init.headers).toMatchObject({ Authorization: 'Bearer t' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('execute：网络失败 → 节点 failed（走重试/fail 边语义）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    try {
      const result = await handler.execute(baseCtx({ oasSpec: SPEC_V3, operationId: 'getPet', params: [{ key: 'petId', value: 'x' }] }))
      expect(result.status).toBe('failed')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('C5：目录与表单契约', () => {
  it('catalog 含 oas-tool 且 requiredConfigKeys 覆盖 spec+operationId', () => {
    const entry = NODE_TYPE_CATALOG_MAP[WORKFLOW_NODE_TYPES['oas-tool']]
    expect(entry.label).toBe('自定义接口')
    expect(entry.requiredConfigKeys).toEqual(['oasSpec', 'operationId'])
    // 一致性：NODE_TYPE_CATALOG 每项都有 type 字段
    expect(NODE_TYPE_CATALOG.some(e => e.type === 'oas-tool')).toBe(true)
  })

  it('表单 Schema 含 oas-operations / oas-params 字段', () => {
    const keys = NODE_CONFIG_FORMS[WORKFLOW_NODE_TYPES['oas-tool']].map(f => `${f.key}:${f.type}`)
    expect(keys).toEqual(expect.arrayContaining(['operationId:oas-operations', 'params:oas-params', 'oasSpec:textarea']))
  })
})
