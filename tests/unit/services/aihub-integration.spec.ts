/**
 * AI Hub 集成单元测试
 * @see src/core/platform/aihub/*
 *
 * 跑真 sqlite/pg DataSource（与 VoiceCloneService 风格一致），
 * mock global fetch（ai-hub 网关 HTTP）/ SecureStorage / EventEmitter。
 *
 * 覆盖（P1 验收核心逻辑）：
 * - aihub-client：信封解包、code!==0 抛 AihubError、HTTP 401 抛 AihubHttpError、地址规整
 * - aihubLogin：自动建 config + JWT 物化 + 模型清单直写库 + 会话可读
 * - 登出/401 状态机（决策五）：登出 → config 禁用 + autoDisabled 标记 + Key 清空；
 *   重新登录自动恢复；用户手动禁用（清标记）后重新登录保持禁用
 * - fetchAihubModels：x-ai-hub.model_type → ModelDefinition 映射（chat/image/video，跳过 embedding/music）
 * - 计费：余额微积分换算、兑换码 errcode 中文映射
 * - 模板：PROVIDER_TEMPLATES 含 ai-hub（openai-compatible 类目，密钥可选）
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'

import { ProviderConfigRepository } from '@core/database/repositories/provider-config.repository'
import { SettingsRepository } from '@core/database/repositories/settings.repository'
import * as dbModule from '@core/database/database-manager.interface'
import * as storageModule from '@core/interfaces/storage.interface'
import * as eventModule from '@core/interfaces/event.interface'

import {
  aihubLogin,
  aihubLogout,
  onAihubTokenExpired,
  getAihubSession,
  hasValidAihubSession,
  getAihubSessionInfo,
  getAihubGatewayConfig,
  saveAihubGatewayConfig,
} from '@core/platform/aihub/aihub-auth.service'
import { fetchAihubModels } from '@core/platform/aihub/aihub-models.service'
import { getAihubBalance, redeemAihubCode, redeemErrcodeMessage } from '@core/platform/aihub/aihub-billing.service'
import { AihubError, AihubHttpError, aihubRequest, normalizeGatewayUrl } from '@core/platform/aihub/aihub-client'
import { AIHUB_TEMPLATE_ID, AIHUB_AUTO_DISABLED_FLAG } from '@core/platform/aihub/aihub.types'
import { PROVIDER_TEMPLATES } from '@core/platform/services/provider-template.service'

// ==================== mock 基础设施 ====================

/** ai-hub 网关 HTTP mock：按 (method,path) 注册响应 */
function makeFetchMock() {
  const routes = new Map<string, (body: any, init: RequestInit) => any | Promise<any>>()
  const calls: Array<{ path: string; init: RequestInit }> = []
  const fn = vi.fn(async (url: string, init: RequestInit = {} as RequestInit) => {
    const path = new URL(url).pathname
    calls.push({ path, init })
    const handler = routes.get(path)
    if (!handler) {
      return new Response(JSON.stringify({ code: 5, message: `route not found: ${path}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    const result = await handler(init.body ? JSON.parse(String(init.body)) : undefined, init)
    if (result instanceof Response) return result
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as unknown as typeof fetch
  return { fn, routes, calls }
}

const JWT = 'eyJ-test-jwt'
const GATEWAY = 'http://aihub.test:8081'

function installGatewayMock(routes: Map<string, any>): void {
  const mock = makeFetchMock()
  for (const [k, v] of routes) mock.routes.set(k, v)
  vi.stubGlobal('fetch', mock.fn)
}

describe.each(getTestDialects())('aihub 集成 [%s]', (dialect) => {
  let tds: TestDataSource

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)

    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      providerConfigs: new ProviderConfigRepository(tds.ds),
      settings: new SettingsRepository(tds.ds),
      dataSource: tds.ds,
    } as any)

    vi.spyOn(storageModule, 'getSecureStorage').mockReturnValue({
      isInitialized: () => true,
      initialize: async () => {},
      encrypt: (s: string) => `enc:${s}`,
      decrypt: (s: string) => s.replace(/^enc:/, ''),
    } as any)

    vi.spyOn(eventModule, 'getEventEmitter').mockReturnValue({
      emit: vi.fn(),
      emitProgress: vi.fn(),
      emitStatus: vi.fn(),
      tapEvents: vi.fn(() => () => {}),
    } as any)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await tds.close()
  })

  beforeEach(async () => {
    vi.unstubAllGlobals()
    // 用例隔离：清 settings（会话/网关配置 KV）与 provider_configs
    await tds.truncateAll()
  })

  // ==================== aihub-client ====================

  describe('aihub-client', () => {
    it('normalizeGatewayUrl：去尾斜杠与 /v1 版本段', () => {
      expect(normalizeGatewayUrl('http://x:8081/')).toBe('http://x:8081')
      expect(normalizeGatewayUrl('http://x:8081/v1')).toBe('http://x:8081')
      expect(normalizeGatewayUrl('  http://x:8081/v1/ ')).toBe('http://x:8081')
    })

    it('信封端点：code=0 解包 data', async () => {
      installGatewayMock(new Map([
        ['/api/v1/me/balance', () => ({ code: 0, message: 'success', data: { user_id: 'u1', balance: 1500000 } })],
      ]))
      const data = await aihubRequest({ gatewayUrl: GATEWAY, path: '/api/v1/me/balance', jwt: JWT })
      expect(data).toEqual({ user_id: 'u1', balance: 1500000 })
    })

    it('信封端点：code!==0 抛 AihubError', async () => {
      installGatewayMock(new Map([
        ['/api/x', () => ({ code: 70011, message: '已使用', trace_id: 't1' })],
      ]))
      await expect(aihubRequest({ gatewayUrl: GATEWAY, path: '/api/x' })).rejects.toMatchObject({
        code: 70011,
        message: '已使用',
        traceId: 't1',
      })
      await expect(aihubRequest({ gatewayUrl: GATEWAY, path: '/api/x' })).rejects.toBeInstanceOf(AihubError)
    })

    it('HTTP 401 抛 AihubHttpError（供会话失效判定）', async () => {
      installGatewayMock(new Map([
        ['/api/secure', () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })],
      ]))
      await expect(aihubRequest({ gatewayUrl: GATEWAY, path: '/api/secure', jwt: 'bad' }))
        .rejects.toBeInstanceOf(AihubHttpError)
    })

    it('连接失败给可读错误（含网关地址）', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
      await expect(aihubRequest({ gatewayUrl: 'http://127.0.0.1:1', path: '/api/x' }))
        .rejects.toThrow(/无法连接 AI Hub 网关/)
    })
  })

  // ==================== 登录/登出状态机 ====================

  function gatewayRoutes(): [string, any][] {
    return [
      ['/api/account/login', (body: any) => ({
        code: 0, message: 'success',
        data: { id: 'acc_1', email: body?.identity ?? 'u@test.com', token: `${JWT}-${body?.identity}`, expires_at: new Date(Date.now() + 86400_000).toISOString() },
      })],
      ['/api/account/register', (body: any) => ({
        code: 0, message: 'created',
        data: { id: 'acc_2', email: body?.email, token: `${JWT}-reg`, expires_at: new Date(Date.now() + 86400_000).toISOString() },
      })],
      ['/v1/models', () => ({
        object: 'list',
        data: [
          { id: 'gpt-x', object: 'model', 'x-ai-hub': { model_type: 'chat', context_length: 128000, supports_streaming: true, supports_function_calling: true, supports_vision: true } },
          { id: 'img-x', object: 'model', 'x-ai-hub': { model_type: 'image' } },
          { id: 'vid-x', object: 'model', 'x-ai-hub': { model_type: 'video' } },
          { id: 'emb-x', object: 'model', 'x-ai-hub': { model_type: 'embedding' } },
          { id: 'mus-x', object: 'model', 'x-ai-hub': { model_type: 'music' } },
        ],
      })],
    ]
  }

  it('登录成功：自动建 config + 物化 JWT + 模型直写库 + 会话可读', async () => {
    installGatewayMock(new Map(gatewayRoutes()))
    const info = await aihubLogin({ gatewayUrl: GATEWAY, identity: 'u@test.com', password: 'pw' })
    expect(info.loggedIn).toBe(true)
    expect(info.email).toBe('u@test.com')

    const session = await getAihubSession()
    expect(session).not.toBeNull()
    expect(session!.gatewayUrl).toBe(GATEWAY)
    expect(await hasValidAihubSession()).toBe(true)

    const db = dbModule.getCoreDatabaseManager()
    const configs = await db.providerConfigs!.getByTemplateId(AIHUB_TEMPLATE_ID)
    expect(configs.length).toBe(1)
    const cfg = configs[0]
    // JWT 物化 + 启用 + baseUrl 带 /v1
    expect(cfg.isEnabled).toBe(true)
    expect(cfg.baseUrl).toBe(`${GATEWAY}/v1`)
    expect(cfg.apiKey).toBe(`enc:${JWT}-u@test.com`)
    // 模型清单：chat/image/video 入库，embedding/music 跳过
    const ids = (cfg.models ?? []).map((m) => m.id)
    expect(ids).toEqual(['gpt-x', 'img-x', 'vid-x'])
    // 第一个 chat 模型成为默认模型
    expect(cfg.defaultModelId).toBe('gpt-x')
  })

  it('模型映射：vision chat → multimodal，能力字段对齐', async () => {
    installGatewayMock(new Map(gatewayRoutes()))
    await aihubLogin({ gatewayUrl: GATEWAY, identity: 'u@test.com', password: 'pw' })
    const session = (await getAihubSession())!
    const models = await fetchAihubModels(session)
    const chat = models.find((m) => m.id === 'gpt-x')!
    expect(chat.type).toBe('multimodal')
    expect(chat.contextWindow).toBe(128000)
    expect(chat.supportsTools).toBe(true)
    expect(chat.features).toContain('streaming')
    expect(models.find((m) => m.id === 'img-x')!.type).toBe('image')
    expect(models.find((m) => m.id === 'vid-x')!.type).toBe('video')
  })

  it('登出：会话清除 + config 禁用 + autoDisabled 标记 + 物化 Key 清空；自有 Key provider 不受影响', async () => {
    installGatewayMock(new Map(gatewayRoutes()))
    await aihubLogin({ gatewayUrl: GATEWAY, identity: 'u@test.com', password: 'pw' })

    // 先造一条自有 Key 的配置，验证登出不波及
    const db = dbModule.getCoreDatabaseManager()
    await db.providerConfigs!.create({
      templateId: 'deepseek', name: '自有 DS', apiKey: 'enc:sk-own', isEnabled: true, isDefault: false,
    } as any)

    await aihubLogout()
    expect(await hasValidAihubSession()).toBe(false)

    const cfg = (await db.providerConfigs!.getByTemplateId(AIHUB_TEMPLATE_ID))[0]
    expect(cfg.isEnabled).toBe(false)
    expect(cfg.apiKey).toBeUndefined()
    expect((cfg.customParams as any)?.[AIHUB_AUTO_DISABLED_FLAG]).toBe(true)

    const own = (await db.providerConfigs!.getByTemplateId('deepseek'))[0]
    expect(own.isEnabled).toBe(true)
    expect(own.apiKey).toBe('enc:sk-own')
  })

  it('重新登录自动恢复启用（autoDisabled=true → enable + 清标记）', async () => {
    installGatewayMock(new Map(gatewayRoutes()))
    await aihubLogin({ gatewayUrl: GATEWAY, identity: 'u@test.com', password: 'pw' })
    await aihubLogout()

    await aihubLogin({ gatewayUrl: GATEWAY, identity: 'u@test.com', password: 'pw' })
    const db = dbModule.getCoreDatabaseManager()
    const cfg = (await db.providerConfigs!.getByTemplateId(AIHUB_TEMPLATE_ID))[0]
    expect(cfg.isEnabled).toBe(true)
    expect((cfg.customParams as any)?.[AIHUB_AUTO_DISABLED_FLAG]).toBe(false)
  })

  it('用户手动禁用后重新登录保持禁用（尊重用户偏好）', async () => {
    installGatewayMock(new Map(gatewayRoutes()))
    await aihubLogin({ gatewayUrl: GATEWAY, identity: 'u@test.com', password: 'pw' })
    const db = dbModule.getCoreDatabaseManager()
    let cfg = (await db.providerConfigs!.getByTemplateId(AIHUB_TEMPLATE_ID))[0]

    // 用户手动禁用（provider-config:update 路径会清标记——这里直接模拟清标记后的禁用态）
    await db.providerConfigs!.update(cfg.id, {
      isEnabled: false,
      customParams: { ...(cfg.customParams ?? {}), [AIHUB_AUTO_DISABLED_FLAG]: false },
    })

    await aihubLogout()
    await aihubLogin({ gatewayUrl: GATEWAY, identity: 'u@test.com', password: 'pw' })

    cfg = (await db.providerConfigs!.getByTemplateId(AIHUB_TEMPLATE_ID))[0]
    expect(cfg.isEnabled).toBe(false)
    // JWT 仍要物化（恢复启用即刻可用），但不替用户打开开关
    expect(cfg.apiKey).toBe(`enc:${JWT}-u@test.com`)
  })

  it('401 处理（onAihubTokenExpired）等同登出', async () => {
    installGatewayMock(new Map(gatewayRoutes()))
    await aihubLogin({ gatewayUrl: GATEWAY, identity: 'u@test.com', password: 'pw' })
    await onAihubTokenExpired()
    expect(await hasValidAihubSession()).toBe(false)
    const db = dbModule.getCoreDatabaseManager()
    const cfg = (await db.providerConfigs!.getByTemplateId(AIHUB_TEMPLATE_ID))[0]
    expect(cfg.isEnabled).toBe(false)
    expect((cfg.customParams as any)?.[AIHUB_AUTO_DISABLED_FLAG]).toBe(true)
  })

  it('注册：响应携带 token，等价登录（config 建立并物化）', async () => {
    installGatewayMock(new Map(gatewayRoutes()))
    const info = await aihubRegister0()
    expect(info.loggedIn).toBe(true)
    const db = dbModule.getCoreDatabaseManager()
    const cfg = (await db.providerConfigs!.getByTemplateId(AIHUB_TEMPLATE_ID))[0]
    expect(cfg.apiKey).toBe(`enc:${JWT}-reg`)
  })

  async function aihubRegister0() {
    const { aihubRegister } = await import('@core/platform/aihub/aihub-auth.service')
    return aihubRegister({ gatewayUrl: GATEWAY, email: 'new@test.com', password: 'pw' })
  }

  it('过期会话视为未登录', async () => {
    installGatewayMock(new Map([
      ['/api/account/login', () => ({
        code: 0, message: 'success',
        data: { id: 'acc_3', email: 'e@test.com', token: JWT, expires_at: new Date(Date.now() - 1000).toISOString() },
      })],
    ]))
    await aihubLogin({ gatewayUrl: GATEWAY, identity: 'e@test.com', password: 'pw' })
    expect(await hasValidAihubSession()).toBe(false)
    const info = await getAihubSessionInfo()
    expect(info.loggedIn).toBe(true)
    expect(info.valid).toBe(false)
  })

  // ==================== 网关配置 ====================

  it('网关配置：保存/读取/回落默认', async () => {
    const def = await getAihubGatewayConfig()
    expect(def.gatewayUrl).toBeTruthy()
    await saveAihubGatewayConfig({ gatewayUrl: 'http://gw.example.com:9000/v1/', rechargeUrl: 'http://web/#/recharge' })
    const cfg = await getAihubGatewayConfig()
    expect(cfg.gatewayUrl).toBe('http://gw.example.com:9000')
    expect(cfg.rechargeUrl).toBe('http://web/#/recharge')
  })

  // ==================== 计费 ====================

  it('余额：微积分 → 积分换算', async () => {
    installGatewayMock(new Map(gatewayRoutes()))
    await aihubLogin({ gatewayUrl: GATEWAY, identity: 'u@test.com', password: 'pw' })
    installGatewayMock(new Map([
      ['/api/v1/me/balance', () => ({ code: 0, message: 'success', data: { user_id: 'u1', balance: 10_000_000, frozen: 1_000_000, total_consumed: 2_000_000 } })],
    ]))
    const bal = await getAihubBalance()
    expect(bal.balancePoints).toBe(10)
    expect(bal.frozenPoints).toBe(1)
    expect(bal.totalConsumedPoints).toBe(2)
  })

  it('未登录查余额报可读错误', async () => {
    await expect(getAihubBalance()).rejects.toThrow(/未登录/)
  })

  it('兑换码：成功与 errcode 中文映射', async () => {
    installGatewayMock(new Map(gatewayRoutes()))
    await aihubLogin({ gatewayUrl: GATEWAY, identity: 'u@test.com', password: 'pw' })
    installGatewayMock(new Map([
      ['/api/v1/me/redeem', () => ({ code: 0, message: 'success', data: { user_id: 'u1', balance: 1, amount: 1 } })],
    ]))
    const r = await redeemAihubCode(' CODE-1 ')
    expect(r.amount).toBe(1)
    expect(redeemErrcodeMessage(70011, 'x')).toMatch(/已被使用/)
    expect(redeemErrcodeMessage(70015, 'x')).toMatch(/不存在/)
    expect(redeemErrcodeMessage(99999, '原始错误')).toBe('原始错误')
  })

  // ==================== 模板登记 ====================

  it('PROVIDER_TEMPLATES 含 ai-hub 模板（openai-compatible、密钥可选、bearer）', () => {
    const t = PROVIDER_TEMPLATES.find((x) => x.id === AIHUB_TEMPLATE_ID)
    expect(t).toBeDefined()
    expect(t!.category).toBe('openai-compatible')
    expect(t!.apiKeyOptional).toBe(true)
    expect(t!.apiConfig.authType).toBe('bearer')
    expect(t!.apiConfig.baseUrl).toMatch(/\/v1$/)
    expect(t!.capabilities).toContain('chat')
  })
})
