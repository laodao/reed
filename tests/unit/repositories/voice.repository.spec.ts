import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { VoiceRepository } from '@core/database/repositories/voice.repository'
import { ClonedVoiceRepository } from '@core/database/repositories/cloned-voice.repository'

describe.each(getTestDialects())('VoiceRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: VoiceRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new VoiceRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('TTS create + 默认 speed/pitch/volume', async () => {
    const r = await repo.create({
      type: 'tts' as any,
      status: 'completed' as any,
      inputText: 'hi',
      voiceId: 'v1',
      favorite: false,
    } as any)
    expect(r.speed).toBe(1.0)
    expect(r.pitch).toBe(0)
    expect(r.volume).toBe(1.0)
    expect(r.favorite).toBe(false)
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('STT 类型可写并读出', async () => {
    const r = await repo.create({
      type: 'stt' as any,
      status: 'processing' as any,
      inputAudioPath: '/tmp/in.wav',
      favorite: false,
    } as any)
    const got = await repo.getById(r.id)
    expect(got!.type).toBe('stt')
    expect(got!.inputAudioPath).toBe('/tmp/in.wav')
  })

  it('update + toggleFavorite', async () => {
    const r = await repo.create({
      type: 'tts',
      status: 'processing',
      favorite: false,
    } as any)
    await repo.update(r.id, { status: 'completed', outputAudioPath: '/tmp/out.wav' } as any)
    const got = await repo.getById(r.id)
    expect(got!.status).toBe('completed')
    expect(got!.outputAudioPath).toBe('/tmp/out.wav')

    expect(await repo.toggleFavorite(r.id)).toBe(true)
    expect((await repo.getById(r.id))!.favorite).toBe(true)
  })

  it('getList 分页 + type 过滤', async () => {
    await repo.create({ type: 'tts', status: 'completed', favorite: false } as any)
    await repo.create({ type: 'stt', status: 'completed', favorite: false } as any)
    await repo.create({ type: 'tts', status: 'completed', favorite: true } as any)
    const ttsOnly = await repo.getList({ page: 1, pageSize: 10, type: 'tts' } as any)
    expect(ttsOnly.total).toBe(2)
  })

  it('delete', async () => {
    const r = await repo.create({ type: 'tts', status: 'completed', favorite: false } as any)
    await repo.delete(r.id)
    expect(await repo.getById(r.id)).toBeNull()
  })
})

describe.each(getTestDialects())('ClonedVoiceRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: ClonedVoiceRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new ClonedVoiceRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getById', async () => {
    const r = await repo.create({
      name: 'Voice A',
      status: 'training' as any,
      sampleAudioPath: '/tmp/sample.wav',
      sampleDuration: 5,
      providerId: 'p1',
    } as any)
    expect(r.id).toBeTruthy()
    expect(r.createdAt).toBeInstanceOf(Date)

    const got = await repo.getById(r.id)
    expect(got!.name).toBe('Voice A')
    expect(got!.sampleDuration).toBe(5)
  })

  it('getByStatus / getAll', async () => {
    await repo.create({ name: 'A', status: 'training' } as any)
    await repo.create({ name: 'B', status: 'ready' } as any)
    expect((await repo.getByStatus('ready' as any)).length).toBe(1)
    expect((await repo.getAll()).length).toBe(2)
  })

  it('getByVoiceId 命中', async () => {
    await repo.create({ name: 'A', status: 'ready', voiceId: 'vid-1' } as any)
    const got = await repo.getByVoiceId('vid-1')
    expect(got!.name).toBe('A')
  })

  it('update 自动更新 updatedAt', async () => {
    const r = await repo.create({ name: 'A', status: 'training' } as any)
    expect(r.updatedAt).toBeUndefined()
    await new Promise(r => setTimeout(r, 5))
    await repo.update(r.id, { status: 'ready' as any })
    const got = await repo.getById(r.id)
    expect(got!.status).toBe('ready')
    expect(got!.updatedAt).toBeInstanceOf(Date)
  })

  it('delete + count', async () => {
    const r = await repo.create({ name: 'A', status: 'training' } as any)
    await repo.create({ name: 'B', status: 'training' } as any)
    expect(await repo.count()).toBe(2)
    await repo.delete(r.id)
    expect(await repo.count()).toBe(1)
  })
})
