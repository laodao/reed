/**
 * OAS $ref V2 展开（25 号 M2 批3）
 *
 * 钉死：文档内 $ref 解析期展开（components/schemas + 任意 JSON 指针）、
 * 循环引用/外部引用/悬空引用报可读错误、展开后 buildRequest 正常组装。
 */

import { describe, it, expect } from 'vitest'
import { parseSpecJson, listParameters, buildRequest } from '@shared/utils/openapi-parser'

const SPEC_WITH_REF = JSON.stringify({
  openapi: '3.0.0',
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/pets/{petId}': {
      get: {
        operationId: 'getPet',
        parameters: [{ $ref: '#/components/parameters/PetId' }],
        responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
      },
    },
    '/pets': {
      post: {
        operationId: 'createPet',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
      },
    },
  },
  components: {
    parameters: { PetId: { name: 'petId', in: 'path', required: true, schema: { type: 'integer' } } },
    schemas: { Pet: { type: 'object', properties: { name: { type: 'string' } } } },
  },
})

describe('$ref 解析期展开', () => {
  it('components/parameters 引用展开后 listParameters 可见（此前 0 行）', () => {
    expect(parseSpecJson(SPEC_WITH_REF).ok).toBe(true)
    const params = listParameters(SPEC_WITH_REF, 'getPet')
    expect(params).toEqual([{ name: 'petId', in: 'path', required: true, type: 'integer' }])
  })

  it('展开后 buildRequest 正常组装（类型转换 integer 生效）', () => {
    const r = buildRequest(SPEC_WITH_REF, 'getPet', [{ key: 'petId', value: '42' }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.request.url).toBe('https://api.example.com/pets/42')
  })

  it('嵌套 $ref（requestBody → schema）展开为内联对象，引用键消失', () => {
    const parsed = parseSpecJson(SPEC_WITH_REF)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      const raw = JSON.stringify(parsed.spec)
      expect(raw.includes('"$ref"')).toBe(false)
      expect(raw.includes('"petId"')).toBe(true) // 参数体已内联（components 定义本身保留）
      expect(raw.includes('"name"')).toBe(true) // Pet schema 内容已并入
    }
  })

  it('循环引用 / 外部引用 / 悬空引用 报可读错误', () => {
    const cycle = JSON.stringify({
      openapi: '3.0.0', paths: { '/a': { get: { operationId: 'a', parameters: [{ $ref: '#/components/parameters/A' }] } } },
      components: { parameters: { A: { $ref: '#/components/parameters/A' } } },
    })
    expect(parseSpecJson(cycle)).toMatchObject({ ok: false, error: expect.stringContaining('循环引用') })

    const external = JSON.stringify({
      openapi: '3.0.0', paths: { '/a': { get: { operationId: 'a', parameters: [{ $ref: 'https://other.spec#/x' }] } } },
    })
    expect(parseSpecJson(external)).toMatchObject({ ok: false, error: expect.stringContaining('外部 $ref') })

    const dangling = JSON.stringify({
      openapi: '3.0.0', paths: { '/a': { get: { operationId: 'a', parameters: [{ $ref: '#/no/such/path' }] } } },
    })
    expect(parseSpecJson(dangling)).toMatchObject({ ok: false, error: expect.stringContaining('无法解析') })
  })

  it('原型链防御（review B6）：__proto__ 指针段拒绝展开、__proto__ 键经 defineProperty 落 own 属性不污染原型', () => {
    // 指针段 __proto__ / constructor → 无法解析（而非读到 Object.prototype）
    const protoRef = JSON.stringify({
      openapi: '3.0.0', paths: { '/a': { get: { operationId: 'a', parameters: [{ $ref: '#/__proto__/polluted' }] } } },
    })
    expect(parseSpecJson(protoRef)).toMatchObject({ ok: false, error: expect.stringContaining('无法解析') })

    // own '__proto__' 键：值进 own 属性，产物原型不被替换
    const protoKey = JSON.stringify({
      openapi: '3.0.0', paths: { '/a': { get: { operationId: 'a', parameters: [{ name: '__proto__', in: 'query', required: false }] } } },
    })
    const parsed = parseSpecJson(protoKey)
    expect(parsed.ok).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
  })

  it('菱形引用展开有节点预算（review B7）：指数级重复展开报错而非挂死', () => {
    // 每层 2 个属性引用下一层：朴素展开 2^depth 节点；层数取 18（递归深度
    // ~3×18+包装 < 64 不触发深度上限；朴素节点 2^18≈26 万 > 10 万预算 → 预算先触发）
    const components: Record<string, unknown> = {}
    for (let i = 0; i < 18; i++) {
      components[`L${i}`] = {
        type: 'object',
        properties: {
          a: i < 17 ? { $ref: `#/components/schemas/L${i + 1}` } : { type: 'string' },
          b: i < 17 ? { $ref: `#/components/schemas/L${i + 1}` } : { type: 'string' },
        },
      }
    }
    const diamond = JSON.stringify({
      openapi: '3.0.0', paths: { '/a': { get: { operationId: 'a', responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/L0' } } } } } } } },
      components: { schemas: components },
    })
    const r = parseSpecJson(diamond)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('节点数超过')
  })
})
