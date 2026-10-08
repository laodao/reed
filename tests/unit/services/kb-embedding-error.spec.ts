/**
 * embedding 失败必须带出「真实原因」而不是笼统的「向量生成失败」。
 *
 * 背景（用户实际遭遇）：文档处理失败只显示「向量生成失败」，
 * 但真正原因（API Key 失效 / 余额不足 / 模型名错 / 网络不可达）在
 * getEmbeddingVectors 的 `catch { return null }` 里被吞掉，用户完全无法定位。
 *
 * 新契约（变更 B：改为抛错，由调用方按各自场景转成用户可读信息）：
 *  1. 失败时抛 Error，message 必须包含接口返回的真实原因
 *  2. 未配置 provider / 配置不存在 / 网络异常 等也要有明确原因
 *  3. 成功路径不受影响，仍返回 number[][]
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as dbModule from '@core/database/database-manager.interface'
import * as storageModule from '@core/interfaces/storage.interface'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'

describe('getEmbeddingVectors 失败原因透传', () => {
  let svc: KnowledgeBaseService
  let providerRow: Record<string, unknown> | null

  beforeAll(() => {
    svc = new KnowledgeBaseService()

    vi.spyOn(storageModule, 'getSecureStorage').mockReturnValue({
      isInitialized: () => true,
      initialize: async () => undefined,
      decrypt: (s: string) => s,
    } as any)

    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      providerConfigs: {
        getById: async () => providerRow,
      },
    } as any)
  })

  afterAll(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  /** 构造一个 provider 行（dashscope 模板） */
  function setProvider(templateId = 'dashscope') {
    providerRow = { id: 'p1', templateId, apiKey: 'enc-key', baseUrl: null }
  }

  it('接口返回错误体 → 抛出错误并含接口原话', async () => {
    setProvider()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid API-key provided.' } }),
      })),
    )

    await expect(
      svc.getEmbeddingVectors(['hello'], { providerConfigId: 'p1', modelId: 'text-embedding-v3' } as any),
    ).rejects.toThrow(/Invalid API-key provided\./)
  })

  it('接口返回非 JSON 错误体 → 仍带出 HTTP 状态，不退化成笼统文案', async () => {
    setProvider()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => {
          throw new Error('not json')
        },
      })),
    )

    const err = await svc
      .getEmbeddingVectors(['hello'], { providerConfigId: 'p1' } as any)
      .then(() => null)
      .catch(e => e as Error)
    expect(err).toBeTruthy()
    expect(err!.message).toMatch(/429|Too Many Requests/)
  })

  it('网络异常（fetch 抛错）→ 抛出错误并含网络原因', async () => {
    setProvider()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND dashscope.aliyuncs.com')
      }),
    )

    await expect(
      svc.getEmbeddingVectors(['hello'], { providerConfigId: 'p1' } as any),
    ).rejects.toThrow(/ENOTFOUND|网络/)
  })

  it('未配置 providerConfigId → 明确报错', async () => {
    await expect(svc.getEmbeddingVectors(['hello'], {} as any)).rejects.toThrow(/Embedding 提供商/)
  })

  it('提供商配置不存在 → 明确报错', async () => {
    providerRow = null
    await expect(
      svc.getEmbeddingVectors(['hello'], { providerConfigId: 'missing' } as any),
    ).rejects.toThrow(/配置不存在|提供商/)
  })

  it('成功路径不受影响：仍返回向量数组', async () => {
    setProvider()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ index: 0, embedding: [0.1, 0.2] }] }),
      })),
    )

    const v = await svc.getEmbeddingVectors(['hello'], { providerConfigId: 'p1' } as any)
    expect(v).toEqual([[0.1, 0.2]])
  })
})