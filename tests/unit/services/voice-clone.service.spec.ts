/**
 * VoiceCloneService 单元测试
 * @see src/core/services/voice-clone.service.ts
 *
 * 跑真 sqlite/pg DataSource（与 KnowledgeBaseService 风格一致），
 * 注入 mock provider / mock secureStorage / mock pathProvider。
 *
 * 覆盖：
 * - cloneVoice：入参校验、enabled provider 缺失、provider 失败回滚、成功路径
 * - refreshClonedVoiceStatus：终态短路、训练中刷新、voice_id 缺失降级
 * - previewClonedVoice：自定义 text 拒绝、training 拒绝、缓存命中、首次下载
 * - listClonedVoices：全量 / 按状态筛
 * - deleteClonedVoice：完整链路（解绑 + DB 删 + 文件删）+ provider 失败仍删 DB
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'

import { VoiceCloneService } from '@core/services/voice-clone.service'
import { ClonedVoiceRepository } from '@core/database/repositories/cloned-voice.repository'
import { ProviderConfigRepository } from '@core/database/repositories/provider-config.repository'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'

import * as dbModule from '@core/database/database-manager.interface'
import * as pathModule from '@core/interfaces/path.interface'
import * as storageModule from '@core/interfaces/storage.interface'

import {
  DashScopeVoiceCloneError,
  type DashScopeVoiceCloneProvider,
} from '@core/voice-providers/dashscope-voice-clone-provider'

/**
 * 简易 provider mock —— 模拟 cloneVoice / queryCloneStatus / deleteClonedVoice
 * 三方法。可设置预定行为 + 调用记录。
 */
function makeMockProvider() {
  const calls = {
    clone: 0,
    query: 0,
    del: 0,
    queryArgs: [] as string[],
    delArgs: [] as string[],
  }
  let cloneBehavior: () => Promise<any> = async () => ({
    voiceId: 'cosyvoice-v3-plus-mine-x',
    targetModel: 'cosyvoice-v3.5-plus',
    status: 'training',
  })
  let queryBehavior: (voiceId: string) => Promise<any> = async () => ({
    status: 'ready',
    previewAudioUrl: 'https://demo.example.com/preview.mp3',
  })
  let delBehavior: (voiceId: string) => Promise<void> = async () => undefined

  const provider = {
    cloneVoice: async (input: any) => {
      calls.clone++
      return cloneBehavior()
    },
    queryCloneStatus: async (vid: string) => {
      calls.query++
      calls.queryArgs.push(vid)
      return queryBehavior(vid)
    },
    deleteClonedVoice: async (vid: string) => {
      calls.del++
      calls.delArgs.push(vid)
      return delBehavior(vid)
    },
  } as unknown as DashScopeVoiceCloneProvider

  return {
    provider,
    calls,
    setCloneBehavior(fn: () => Promise<any>) {
      cloneBehavior = fn
    },
    setQueryBehavior(fn: (voiceId: string) => Promise<any>) {
      queryBehavior = fn
    },
    setDelBehavior(fn: (voiceId: string) => Promise<void>) {
      delBehavior = fn
    },
    reset() {
      calls.clone = 0
      calls.query = 0
      calls.del = 0
      calls.queryArgs = []
      calls.delArgs = []
      cloneBehavior = async () => ({
        voiceId: 'cosyvoice-v3-plus-mine-x',
        targetModel: 'cosyvoice-v3.5-plus',
        status: 'training',
      })
      queryBehavior = async () => ({
        status: 'ready',
        previewAudioUrl: 'https://demo.example.com/preview.mp3',
      })
      delBehavior = async () => undefined
    },
  }
}

/** 写一份临时音频文件（10s+ 的 sample 占位），返回绝对路径 */
function writeTempSample(dir: string): string {
  const p = path.join(dir, `sample-${Math.random().toString(16).slice(2)}.wav`)
  fs.writeFileSync(p, Buffer.from('fake-wav-content'))
  return p
}

describe.each(getTestDialects())('VoiceCloneService [%s]', (dialect) => {
  let tds: TestDataSource
  let tmpDataDir: string
  let tmpInputDir: string
  let clonedRepo: ClonedVoiceRepository
  let pcRepo: ProviderConfigRepository
  const mock = makeMockProvider()

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcs-data-'))
    tmpInputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcs-input-'))

    clonedRepo = new ClonedVoiceRepository(tds.ds)
    pcRepo = new ProviderConfigRepository(tds.ds)

    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      clonedVoices: clonedRepo,
      providerConfigs: pcRepo,
      dataSource: tds.ds,
    } as any)

    vi.spyOn(pathModule, 'getPathProvider').mockReturnValue({
      getDataPath: () => tmpDataDir,
      toAssetUrl: (rel: string) => `file://${rel}`,
    } as any)

    vi.spyOn(storageModule, 'getSecureStorage').mockReturnValue({
      isInitialized: () => true,
      initialize: async () => {},
      // 测试 apiKey 不加密 — 直接返回原值
      decrypt: (s: string) => s.replace(/^enc:/, ''),
      encrypt: (s: string) => `enc:${s}`,
    } as any)

    VoiceCloneService.setProviderFactory(() => mock.provider)
  })

  afterAll(async () => {
    VoiceCloneService.setProviderFactory(null)
    vi.restoreAllMocks()
    await tds.close()
    fs.rmSync(tmpDataDir, { recursive: true, force: true })
    fs.rmSync(tmpInputDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    await tds.truncateAll()
    mock.reset()
    // 准备一个 enabled provider config（cloneVoice 必需）
    await pcRepo.create({
      templateId: 'bailian',
      name: '阿里百炼',
      apiKey: 'enc:sk-test-key',
      isEnabled: true,
      isDefault: true,
      models: [],
    } as any)
  })

  // ===== cloneVoice =====

  describe('cloneVoice', () => {
    it('成功：DB 落 row、voice_id 写入、status 来自 provider', async () => {
      const sample = writeTempSample(tmpInputDir)
      const r = await VoiceCloneService.cloneVoice({
        name: '我自己',
        samplePath: sample,
        sampleDurationSec: 15,
        prefix: 'mine',
        language: 'zh',
      })
      expect(r.success).toBe(true)
      expect(r.data?.name).toBe('我自己')
      expect(r.data?.status).toBe('training')
      expect(r.data?.voiceId).toBe('cosyvoice-v3-plus-mine-x')
      expect(r.data?.providerId).toBe('dashscope-voice-clone')
      // sampleAudioPath 写入 + 文件持久化到 tmpDataDir/voice/clone/
      expect(r.data?.sampleAudioPath).toBeTruthy()

      // DB 验证
      const all = await clonedRepo.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].voiceId).toBe('cosyvoice-v3-plus-mine-x')

      // provider 被调一次
      expect(mock.calls.clone).toBe(1)
    })

    it('入参：name 缺失', async () => {
      const sample = writeTempSample(tmpInputDir)
      const r = await VoiceCloneService.cloneVoice({
        name: '   ',
        samplePath: sample,
        sampleDurationSec: 15,
        prefix: 'mine',
      })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/名称必填/)
    })

    it('入参：音频时长 < 10s', async () => {
      const sample = writeTempSample(tmpInputDir)
      const r = await VoiceCloneService.cloneVoice({
        name: 'x',
        samplePath: sample,
        sampleDurationSec: 5,
        prefix: 'mine',
      })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/10-20/)
    })

    it('入参：prefix 非法', async () => {
      const sample = writeTempSample(tmpInputDir)
      const r = await VoiceCloneService.cloneVoice({
        name: 'x',
        samplePath: sample,
        sampleDurationSec: 15,
        prefix: 'BadPrefix',
      })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/prefix/)
    })

    it('入参：样本文件不存在', async () => {
      const r = await VoiceCloneService.cloneVoice({
        name: 'x',
        samplePath: '/path/does/not/exist.wav',
        sampleDurationSec: 15,
        prefix: 'mine',
      })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/不存在/)
    })

    it('无 enabled provider config 返回错误', async () => {
      // 覆盖默认 provider config —— 删掉
      await tds.truncateAll()
      const sample = writeTempSample(tmpInputDir)
      const r = await VoiceCloneService.cloneVoice({
        name: 'x',
        samplePath: sample,
        sampleDurationSec: 15,
        prefix: 'mine',
      })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/暂无可用的 AI 提供商/)
      // DB 不应该有任何 row
      const all = await clonedRepo.getAll()
      expect(all).toHaveLength(0)
    })

    it('provider 失败时回滚占位行 + 删本地样本', async () => {
      mock.setCloneBehavior(async () => {
        throw new DashScopeVoiceCloneError('audio too short', 'create_voice')
      })
      const sample = writeTempSample(tmpInputDir)
      const r = await VoiceCloneService.cloneVoice({
        name: 'x',
        samplePath: sample,
        sampleDurationSec: 15,
        prefix: 'mine',
      })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/audio too short/)

      // DB 不留 row
      const all = await clonedRepo.getAll()
      expect(all).toHaveLength(0)
    })
  })

  // ===== refreshClonedVoiceStatus =====

  describe('refreshClonedVoiceStatus', () => {
    async function seedTrainingRow(): Promise<string> {
      const row = await clonedRepo.create({
        name: 'x',
        status: 'training',
        voiceId: 'cosyvoice-v3-plus-mine-x',
      } as any)
      return row.id
    }

    it('训练中 → 调 provider 更新到 ready', async () => {
      mock.setQueryBehavior(async () => ({
        status: 'ready',
        previewAudioUrl: 'https://x.com/p.mp3',
      }))
      const id = await seedTrainingRow()
      const r = await VoiceCloneService.refreshClonedVoiceStatus(id)
      expect(r.success).toBe(true)
      expect(r.data?.status).toBe('ready')
      expect(mock.calls.query).toBe(1)
    })

    it('训练中 → provider 返回 failed → DB 写 errorMessage', async () => {
      mock.setQueryBehavior(async () => ({
        status: 'failed',
        errorMessage: '音频质量过低',
      }))
      const id = await seedTrainingRow()
      const r = await VoiceCloneService.refreshClonedVoiceStatus(id)
      expect(r.success).toBe(true)
      expect(r.data?.status).toBe('failed')
      expect(r.data?.errorMessage).toBe('音频质量过低')
    })

    it('已 ready 终态 → 不调 provider', async () => {
      const row = await clonedRepo.create({
        name: 'x',
        status: 'ready',
        voiceId: 'vid',
      } as any)
      const r = await VoiceCloneService.refreshClonedVoiceStatus(row.id)
      expect(r.success).toBe(true)
      expect(r.data?.status).toBe('ready')
      expect(mock.calls.query).toBe(0)
    })

    it('voiceId 缺失 → 标记 failed', async () => {
      const row = await clonedRepo.create({
        name: 'x',
        status: 'training',
        // 不设 voiceId
      } as any)
      const r = await VoiceCloneService.refreshClonedVoiceStatus(row.id)
      expect(r.success).toBe(true)
      expect(r.data?.status).toBe('failed')
      expect(r.data?.errorMessage).toMatch(/voice_id/)
      expect(mock.calls.query).toBe(0)
    })

    it('记录不存在 → 错误', async () => {
      const r = await VoiceCloneService.refreshClonedVoiceStatus('not-exist')
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/不存在/)
    })
  })

  // ===== previewClonedVoice =====

  describe('previewClonedVoice', () => {
    it('自定义 text 当前不支持 → 明确错误', async () => {
      const row = await clonedRepo.create({
        name: 'x',
        status: 'ready',
        voiceId: 'vid',
      } as any)
      const r = await VoiceCloneService.previewClonedVoice(row.id, 'hello')
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/CosyVoice 流式合成/)
    })

    it('training 状态拒绝试听', async () => {
      const row = await clonedRepo.create({
        name: 'x',
        status: 'training',
        voiceId: 'vid',
      } as any)
      const r = await VoiceCloneService.previewClonedVoice(row.id)
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/training/)
    })

    it('已缓存 preview_audio_path 直接返回（不调 provider）', async () => {
      const previewDir = path.join(tmpDataDir, 'voice', 'preview')
      fs.mkdirSync(previewDir, { recursive: true })
      const previewAbs = path.join(previewDir, 'cached.mp3')
      fs.writeFileSync(previewAbs, Buffer.from('fake-preview'))

      const row = await clonedRepo.create({
        name: 'x',
        status: 'ready',
        voiceId: 'vid',
        previewAudioPath: 'voice/preview/cached.mp3',
      } as any)

      const r = await VoiceCloneService.previewClonedVoice(row.id)
      expect(r.success).toBe(true)
      expect(r.data?.audioPath).toBe('file://voice/preview/cached.mp3')
      expect(mock.calls.query).toBe(0)
    })

    it('未缓存：query → 下载 → 写本地 → 写 DB', async () => {
      const row = await clonedRepo.create({
        name: 'x',
        status: 'ready',
        voiceId: 'vid',
      } as any)
      mock.setQueryBehavior(async () => ({
        status: 'ready',
        previewAudioUrl: 'https://x.example.com/preview.mp3',
      }))

      // mock global fetch，返回假音频内容
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(Buffer.from('downloaded-preview'), { status: 200 }) as any,
        )

      try {
        const r = await VoiceCloneService.previewClonedVoice(row.id)
        expect(r.success).toBe(true)
        expect(r.data?.audioPath).toMatch(/voice\/preview\//)

        // 文件落盘到 tmpDataDir/voice/preview/{id}.mp3
        const expected = path.join(tmpDataDir, 'voice', 'preview', `${row.id}.mp3`)
        expect(fs.existsSync(expected)).toBe(true)

        // DB 也写了 preview_audio_path
        const updated = await clonedRepo.getById(row.id)
        expect(updated?.previewAudioPath).toBeTruthy()
      } finally {
        fetchSpy.mockRestore()
      }
    })

    it('provider 没返回 demo_audio → 错误', async () => {
      const row = await clonedRepo.create({
        name: 'x',
        status: 'ready',
        voiceId: 'vid',
      } as any)
      mock.setQueryBehavior(async () => ({
        status: 'ready',
        previewAudioUrl: undefined,
      }))
      const r = await VoiceCloneService.previewClonedVoice(row.id)
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/demo_audio/)
    })
  })

  // ===== listClonedVoices =====

  describe('listClonedVoices', () => {
    beforeEach(async () => {
      await clonedRepo.create({ name: 'a', status: 'training' } as any)
      await clonedRepo.create({ name: 'b', status: 'ready' } as any)
      await clonedRepo.create({ name: 'c', status: 'failed' } as any)
    })

    it('全量', async () => {
      const r = await VoiceCloneService.listClonedVoices()
      expect(r.success).toBe(true)
      expect(r.data).toHaveLength(3)
    })

    it('按 status 筛', async () => {
      const r = await VoiceCloneService.listClonedVoices('ready')
      expect(r.success).toBe(true)
      expect(r.data).toHaveLength(1)
      expect(r.data![0].name).toBe('b')
    })
  })

  // ===== deleteClonedVoice =====

  describe('deleteClonedVoice', () => {
    it('完整路径：解绑角色 + 删 DB + 删本地文件', async () => {
      // 准备 cloned voice + 一个本地样本文件
      const sampleDir = path.join(tmpDataDir, 'voice', 'clone')
      fs.mkdirSync(sampleDir, { recursive: true })
      const sampleAbs = path.join(sampleDir, 'to-delete.wav')
      fs.writeFileSync(sampleAbs, Buffer.from('x'))

      const row = await clonedRepo.create({
        name: 'x',
        status: 'ready',
        voiceId: 'vid-to-delete',
        sampleAudioPath: 'voice/clone/to-delete.wav',
      } as any)

      // 准备一个 character_binding 引用这个 voiceId
      const charRepo = tds.ds.getRepository(CharacterBindingEntity)
      const inserted = await charRepo.save(
        charRepo.create({
          id: 'char-1',
          projectId: 'proj-1',
          voiceId: 'vid-to-delete',
          voiceConfig: {} as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Partial<CharacterBindingEntity>),
      )
      expect(inserted.voiceId).toBe('vid-to-delete')

      const r = await VoiceCloneService.deleteClonedVoice(row.id)
      expect(r.success).toBe(true)
      expect(r.data?.deleted).toBe(true)

      // provider 端调用一次
      expect(mock.calls.del).toBe(1)
      expect(mock.calls.delArgs).toContain('vid-to-delete')

      // DB row 被删
      expect(await clonedRepo.getById(row.id)).toBeNull()

      // character_binding 被解绑
      const after = await charRepo.findOne({ where: { id: 'char-1' } as any })
      expect(after?.voiceId).toBeNull()

      // 本地样本被删
      expect(fs.existsSync(sampleAbs)).toBe(false)
    })

    it('provider 端删除失败 → 仍删 DB row', async () => {
      mock.setDelBehavior(async () => {
        throw new Error('provider down')
      })
      const row = await clonedRepo.create({
        name: 'x',
        status: 'ready',
        voiceId: 'vid-x',
      } as any)
      const r = await VoiceCloneService.deleteClonedVoice(row.id)
      expect(r.success).toBe(true)
      expect(await clonedRepo.getById(row.id)).toBeNull()
    })

    it('记录不存在 → 错误', async () => {
      const r = await VoiceCloneService.deleteClonedVoice('not-exist')
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/不存在/)
    })
  })
})
