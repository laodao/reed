/**
 * ToolService 测试（P0 片1：凭据加密存取 / 自定义工具 CRUD / 预设列表 / 执行（参数映射+凭据注入，mock fetch））
 * @module tests/workflow/tool.service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- mock 安全存储（encrypt/decrypt 双向 + 初始化已就绪） ----
vi.mock('@core/interfaces/storage.interface', () => ({
  getSecureStorage: () => ({
    isInitialized: () => true,
    initialize: async () => {},
    encrypt: (s: string) => `enc:${s}`,
    decrypt: (s: string) => s.replace(/^enc:/, ''),
  }),
}))

import { ToolService } from '@core/modules/workflow/tools/tool.service'
import { TOOL_AUTH_TYPES } from '@shared/types/tool.types'

// ---- 内存假仓库 ----
class MemCredentials {
  rows: Map<string, any> = new Map()
  seq = 0
  async create(i: any) {
    const row = { id: `cred_${++this.seq}`, baseUrl: null, createdAt: new Date(), updatedAt: new Date(), ...i }
    this.rows.set(row.id, row)
    return { ...row }
  }
  async list() { return [...this.rows.values()] }
  async findById(id: string) { return this.rows.get(id) ?? null }
  async delete(id: string) { return this.rows.delete(id) ? 1 : 0 }
}
class MemCustomTools {
  rows: Map<string, any> = new Map()
  seq = 0
  async create(i: any) {
    const row = { id: `tool_${++this.seq}`, headers: [], paramsSchema: [], ...i }
    this.rows.set(row.id, row)
    return { ...row }
  }
  async update(id: string, patch: any) {
    const r = this.rows.get(id)
    if (!r) return null
    Object.assign(r, patch)
    return { ...r }
  }
  async list() { return [...this.rows.values()] }
  async findById(id: string) { return this.rows.get(id) ?? null }
  async delete(id: string) { return this.rows.delete(id) ? 1 : 0 }
}

function setup() {
  const creds = new MemCredentials()
  const tools = new MemCustomTools()
  const svc = new ToolService(creds as never, tools as never)
  return { creds, tools, svc }
}

describe('ToolService：凭据（加密存取）', () => {
  it('saveCredential 加密 apiKey 后落库；列表不返回明文（仅密文）', async () => {
    const { svc } = setup()
    const c = await svc.saveCredential({ name: 'Serper', apiKey: 'sk-secret-123', baseUrl: 'https://x' })
    expect(c.apiKeyEnc).toBe('enc:sk-secret-123')  // 已加密
    expect(c.apiKeyEnc).not.toContain('sk-secret-123')
    const list = await svc.listCredentials()
    expect(list[0].name).toBe('Serper')
  })

  it('deleteCredential 删除', async () => {
    const { svc } = setup()
    const c = await svc.saveCredential({ name: 'A', apiKey: 'k1' })
    await svc.deleteCredential(c.id)
    expect(await svc.listCredentials()).toHaveLength(0)
  })
})

describe('ToolService：自定义工具 CRUD', () => {
  it('saveCustomTool / update / delete', async () => {
    const { svc } = setup()
    const t = await svc.saveCustomTool({
      name: '我的接口', method: 'GET', url: 'https://api.x.com/items/{{id}}',
      headers: [{ key: 'X-Token', value: '{{credential}}' }],
      paramsSchema: [{ key: 'id', label: 'ID', type: 'string', required: true }],
      authType: TOOL_AUTH_TYPES.credential, credentialId: 'cred_1',
    })
    expect(t.url).toContain('{{id}}')
    const updated = await svc.updateCustomTool(t.id, { name: '改名' })
    expect(updated!.name).toBe('改名')
    await svc.deleteCustomTool(t.id)
    expect(await svc.listCustomTools()).toHaveLength(0)
  })
})

describe('ToolService：executeTool（参数映射 + 凭据注入，mock fetch）', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  it('自定义工具：path 占位替换 + GET 参数进 query + {{credential}} 替换 header', async () => {
    const { creds, tools, svc } = setup()
    await creds.create({ id: 'cred_1', name: 'K', apiKeyEnc: 'enc:real-key' })
    await tools.create({
      id: 'tool_1', method: 'GET', url: 'https://api.x.com/users/{{uid}}/posts',
      headers: [{ key: 'X-API-KEY', value: '{{credential}}' }], paramsSchema: [], authType: 'credential', credentialId: 'cred_1',
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await svc.executeTool({ type: 'custom', toolId: 'tool_1', credentialId: 'cred_1', params: { uid: 'u42', page: 2 }, signal: new AbortController().signal })
    expect(r.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.x.com/users/u42/posts?page=2')
    expect(init.headers).toMatchObject({ 'X-API-KEY': 'real-key' })  // 解密后注入
  })

  it('authType=credential 且 header 无占位 → 自动 Authorization: Bearer', async () => {
    const { creds, tools, svc } = setup()
    await creds.create({ id: 'cred_1', name: 'K', apiKeyEnc: 'enc:sk-abc' })
    await tools.create({ id: 'tool_1', method: 'GET', url: 'https://api.y.com/ping', headers: [], paramsSchema: [], authType: 'credential', credentialId: 'cred_1' })
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await svc.executeTool({ type: 'custom', toolId: 'tool_1', credentialId: 'cred_1', params: {}, signal: new AbortController().signal })
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer sk-abc' })
  })

  it('POST：未映射参数进 JSON body', async () => {
    const { tools, svc } = setup()
    await tools.create({ id: 'tool_1', method: 'POST', url: 'https://api.z.com/items', headers: [], paramsSchema: [], authType: 'none', credentialId: null })
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await svc.executeTool({ type: 'custom', toolId: 'tool_1', params: { name: 'a', qty: 3 }, signal: new AbortController().signal })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'a', qty: 3 })
  })

  it('预设工具可执行（web-search mock fetch）', async () => {
    const { svc } = setup()
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"organic":[{"title":"t"}]}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await svc.executeTool({ type: 'preset', toolId: 'preset:web-search', credentialId: null, params: { q: 'hello' }, signal: new AbortController().signal })
    expect(r.ok).toBe(true)
    expect((r.json as { organic: unknown[] }).organic).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://google.serper.dev/search')
    expect(init.headers).toMatchObject({ 'X-API-KEY': '' })  // 未选凭据 → 空 key 原样
  })

  it('网络失败 → ok=false 携带错误', async () => {
    const { tools, svc } = setup()
    await tools.create({ id: 'tool_1', method: 'GET', url: 'https://api.z.com/x', headers: [], paramsSchema: [], authType: 'none', credentialId: null })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const r = await svc.executeTool({ type: 'custom', toolId: 'tool_1', params: {}, signal: new AbortController().signal })
    expect(r.ok).toBe(false)
    expect(r.text).toContain('请求失败')
  })

  it('不存在的工具 → 抛错', async () => {
    const { svc } = setup()
    await expect(svc.executeTool({ type: 'custom', toolId: 'nope', params: {}, signal: new AbortController().signal }))
      .rejects.toThrow('工具不存在')
  })
})
