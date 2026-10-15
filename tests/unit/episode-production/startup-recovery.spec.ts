/**
 * 剧集制作启动恢复单测（2026-09-16 ep-hardening H5）
 *
 * in-memory sqlite + mock getCoreDatabaseManager / getPathProvider / fetch 验证：
 * - 无 provider_task_id 的 generating 行 → 复位 error（原逻辑保持）
 * - 有 taskId + comfyui 网关 + done(url) → 下载落盘转 completed
 *   （video_path / video_mode / provider 字段写回；storyboard 与 segment 两表都覆盖）
 * - 网关 error → error；404 → error
 * - 查询失败（fetch 抛错 = 网关没起）/ running → 保持 generating 不动
 * - provider 非 comfyui / 配置缺失 → error（无法回查，按失败收敛）
 *
 * 网络全程 mock fetch，不做真实调用；temp 目录指向 os.tmpdir 下的临时目录。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { DataSource } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { EpVideoSegmentRepository } from '@core/database/repositories/video-segment.repository'
import * as dbModule from '@core/database/database-manager.interface'
import * as pathModule from '@core/interfaces/path.interface'
import { runEpisodeProductionStartupRecovery } from '@core/platform/episode-production/startup-recovery'

const GW = 'http://gw.test:8190'

let tmpRoot: string
let ds: DataSource

async function buildDb(): Promise<DataSource> {
  const d = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [StoryboardEntity, EpVideoSegmentEntity],
    synchronize: true,
  })
  await d.initialize()
  return d
}

async function seedStoryboard(
  id: string,
  opts: { status?: string; providerTaskId?: string | null; videoProviderId?: string | null } = {},
): Promise<void> {
  await ds.getRepository(StoryboardEntity).save({
    id,
    sceneScriptId: 'sc1',
    shotNumber: 1,
    shotType: 'medium',
    cameraAngle: 'eye_level',
    cameraMovement: 'static',
    movementDuration: null,
    frameDescription: '测试镜头',
    subject: null,
    composition: null,
    characters: null,
    narrationId: null,
    dialogueIds: [],
    actionIds: [],
    frameImage: null,
    frameImageId: null,
    videoPath: null,
    duration: 4,
    transition: '{}',
    transitionType: null,
    transitionDurationMs: null,
    transitionDirection: null,
    transitionEasing: null,
    transitionColor: null,
    status: opts.status ?? 'generating',
    keyframeCount: 2,
    videoProviderId: opts.videoProviderId ?? null,
    videoModelId: 'h3',
    providerTaskId: opts.providerTaskId ?? null,
    videoMode: null,
    use3dStaging: 0,
    stagingLayoutId: null,
    backgroundRefImageId: null,
    segmentId: null,
    segmentSeq: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

async function seedSegment(
  id: string,
  opts: { providerTaskId?: string | null; providerId?: string | null } = {},
): Promise<void> {
  const repo = new EpVideoSegmentRepository(ds)
  const seg = await repo.create({
    episodeId: 'ep1',
    sceneId: 'sc1',
    seq: 1,
    shotCount: 1,
    estDuration: 4,
  })
  // create 生成自增 id，直接改用指定 id 便于断言
  await ds.query(`UPDATE ep_video_segments SET id = ? WHERE id = ?`, [id, seg.id])
  await repo.update(id, {
    status: 'generating',
    providerId: opts.providerId ?? null,
    providerTaskId: opts.providerTaskId ?? null,
  })
}

function mockRuntime(opts: {
  providerConfig?: { id: string; templateId: string; baseUrl?: string | null; videoBaseUrl?: string | null } | null
  fetchImpl: (url: string) => Promise<{ status: number; body?: unknown; bytes?: Buffer }>
}) {
  vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
    dataSource: ds,
    providerConfigs: {
      getById: vi.fn(async () => opts.providerConfig ?? null),
    },
  } as any)
  vi.spyOn(pathModule, 'getPathProvider').mockReturnValue({
    getTempPath: () => path.join(tmpRoot, 'temp'),
    getUserDataPath: () => path.join(tmpRoot, 'userdata'),
    getDataPath: () => path.join(tmpRoot, 'userdata'),
  } as any)
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const r = await opts.fetchImpl(String(url))
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: `HTTP ${r.status}`,
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {})),
      arrayBuffer: async () => {
        const b = r.bytes ?? Buffer.from('mp4-bytes')
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
      },
    } as unknown as Response
  }))
}

const sbRepo = () => ds.getRepository(StoryboardEntity)
const segRepo = () => new EpVideoSegmentRepository(ds)

describe('runEpisodeProductionStartupRecovery（H5 视频任务崩溃恢复）', () => {
  beforeEach(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-recovery-'))
    ds = await buildDb()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if (ds.isInitialized) await ds.destroy()
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('无 provider_task_id 的 generating 行 → 复位 error（原逻辑保持）', async () => {
    await seedStoryboard('sb_no_task')
    await seedSegment('evs_no_task')
    mockRuntime({
      providerConfig: null,
      fetchImpl: async () => { throw new Error('不应发起网络请求') },
    })

    await runEpisodeProductionStartupRecovery()

    expect((await sbRepo().findOne({ where: { id: 'sb_no_task' } }))?.status).toBe('error')
    expect((await segRepo().getById('evs_no_task'))?.status).toBe('error')
  })

  it('segment：网关 done+url → 下载落盘转 completed（video_path/video_mode/provider 写回）', async () => {
    await seedSegment('evs_done', { providerTaskId: 'task_1', providerId: 'cfg_comfy' })
    const fetchSpy = vi.fn(async (url: string) => {
      if (url === `${GW}/api/task/task_1`) {
        return { status: 200, body: { ok: true, status: 'done', url: '/api/file/out_1.mp4' } }
      }
      if (url === `${GW}/api/file/out_1.mp4`) {
        return { status: 200, bytes: Buffer.from('fake-mp4') }
      }
      throw new Error(`意外请求 ${url}`)
    })
    mockRuntime({
      providerConfig: { id: 'cfg_comfy', templateId: 'comfyui', baseUrl: GW },
      fetchImpl: fetchSpy,
    })

    await runEpisodeProductionStartupRecovery()

    const seg = await segRepo().getById('evs_done')
    expect(seg?.status).toBe('completed')
    expect(seg?.videoMode).toBe('image2video')
    expect(seg?.providerId).toBe('cfg_comfy')
    expect(seg?.error).toBeNull()
    expect(seg?.videoPath).toMatch(/episode-production\/video-segments\/seg_.*\.mp4$/)
    // 产物真的落盘了
    const abs = path.join(tmpRoot, 'userdata', seg!.videoPath!)
    expect(fs.readFileSync(abs).toString()).toBe('fake-mp4')
  })

  it('storyboard：网关 done+url → completed；相对 url 拼 baseUrl 下载', async () => {
    await seedStoryboard('sb_done', { providerTaskId: 'task_2', videoProviderId: 'cfg_comfy' })
    mockRuntime({
      providerConfig: { id: 'cfg_comfy', templateId: 'comfyui', baseUrl: GW },
      fetchImpl: async (url) => {
        if (url.includes('/api/task/')) {
          return { status: 200, body: { ok: true, status: 'done', url: '/api/file/out_2.mp4' } }
        }
        return { status: 200, bytes: Buffer.from('fake-mp4-2') }
      },
    })

    await runEpisodeProductionStartupRecovery()

    const sb = await sbRepo().findOne({ where: { id: 'sb_done' } })
    expect(sb?.status).toBe('completed')
    expect(sb?.videoMode).toBe('image2video')
    expect(sb?.videoProviderId).toBe('cfg_comfy')
    expect(sb?.videoPath).toMatch(/\.mp4$/)
  })

  it('网关 error → 复位 error', async () => {
    await seedSegment('evs_err', { providerTaskId: 'task_3', providerId: 'cfg_comfy' })
    mockRuntime({
      providerConfig: { id: 'cfg_comfy', templateId: 'comfyui', baseUrl: GW },
      fetchImpl: async () => ({ status: 200, body: { ok: true, status: 'error', error: 'oom' } }),
    })

    await runEpisodeProductionStartupRecovery()

    const seg = await segRepo().getById('evs_err')
    expect(seg?.status).toBe('error')
    expect(seg?.error).toContain('oom')
  })

  it('任务不存在（404）→ 复位 error', async () => {
    await seedSegment('evs_404', { providerTaskId: 'task_gone', providerId: 'cfg_comfy' })
    mockRuntime({
      providerConfig: { id: 'cfg_comfy', templateId: 'comfyui', baseUrl: GW },
      fetchImpl: async () => ({ status: 404, body: { ok: false, error: 'not found' } }),
    })

    await runEpisodeProductionStartupRecovery()

    expect((await segRepo().getById('evs_404'))?.status).toBe('error')
  })

  it('网关没起（fetch 抛错）→ 保持 generating 不动', async () => {
    await seedSegment('evs_down', { providerTaskId: 'task_4', providerId: 'cfg_comfy' })
    await seedStoryboard('sb_down', { providerTaskId: 'task_5', videoProviderId: 'cfg_comfy' })
    mockRuntime({
      providerConfig: { id: 'cfg_comfy', templateId: 'comfyui', baseUrl: GW },
      fetchImpl: async () => { throw new Error('connect ECONNREFUSED') },
    })

    await runEpisodeProductionStartupRecovery()

    expect((await segRepo().getById('evs_down'))?.status).toBe('generating')
    expect((await sbRepo().findOne({ where: { id: 'sb_down' } }))?.status).toBe('generating')
  })

  it('任务仍在跑（running）→ 保持 generating 不动', async () => {
    await seedSegment('evs_run', { providerTaskId: 'task_6', providerId: 'cfg_comfy' })
    mockRuntime({
      providerConfig: { id: 'cfg_comfy', templateId: 'comfyui', baseUrl: GW },
      fetchImpl: async () => ({ status: 200, body: { ok: true, status: 'running' } }),
    })

    await runEpisodeProductionStartupRecovery()

    expect((await segRepo().getById('evs_run'))?.status).toBe('generating')
  })

  it('provider 非 comfyui → 复位 error（协议未接入，按失败收敛）', async () => {
    await seedSegment('evs_bailian', { providerTaskId: 'task_7', providerId: 'cfg_bailian' })
    mockRuntime({
      providerConfig: { id: 'cfg_bailian', templateId: 'bailian', baseUrl: 'https://x' },
      fetchImpl: async () => { throw new Error('不应查询非 comfyui 任务') },
    })

    await runEpisodeProductionStartupRecovery()

    expect((await segRepo().getById('evs_bailian'))?.status).toBe('error')
  })
})
