/**
 * 声音复刻服务
 * @module services/voice-clone
 *
 * 负责"声音复刻"业务流程的全部 service 层逻辑：
 *   1. cloneVoice              — 上传样本 + 调 provider enrollment + 入库
 *   2. refreshClonedVoiceStatus — 调 provider query 刷新单条状态
 *   3. previewClonedVoice       — 试听（demo_audio 或自定义 TTS，第一阶段最小实现）
 *   4. listClonedVoices         — 列出全部 / 按状态筛
 *   5. deleteClonedVoice        — provider 端删除 + 解绑相关角色 + 删本地缓存
 *
 * 与现有 VoiceService（处理 TTS / STT 历史 + 系统发音人列表）解耦：
 *   - VoiceService 维持原职责不动；
 *   - cloned_voices 表的写入完全归 VoiceCloneService；
 *   - VoiceService.getVoices 在合并系统音色 + 复刻音色时仍直接读 cloned_voices 表
 *     （不必通过本 service），那是只读路径。
 *
 * Provider 选择策略（与 VoiceService 复用同一份 enabled provider config）：
 *   - request.providerId 给 → 取该条；
 *   - 否则取 isDefault=1 的 enabled config；
 *   - 否则取 enabled 列表第一条。
 *   apiKey 通过 secureStorage.decrypt 解密。
 *   不强制校验 baseUrl 必须含 dashscope —— 与 VoiceService 行为对齐（否则现有
 *   生产配置可能被误判）；只要 apiKey 能跑通 DashScope 接口即可。
 *
 * 设计文档：docs/superpowers/specs/2026-05-07-voice-cloning-design.md §5.4 / §7
 */

import * as fs from 'fs'
import * as path from 'path'
import type { Repository } from 'typeorm'
import type {
  ClonedVoice,
  ClonedVoiceStatus,
  VoiceCloneCreateRequest,
} from '@shared/types/voice.types'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import {
  resolveAssetPath,
  toAssetUrl,
  toRelativeAssetPath,
} from '@core/utils/asset-path'
import {
  DashScopeVoiceCloneError,
  DashScopeVoiceCloneProvider,
} from '@core/platform/providers/voice/dashscope-voice-clone-provider'

/** IPC 响应统一壳 — 与 VoiceService 风格保持一致 */
export interface ServiceResult<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Provider 工厂签名 — 单测可替换；生产用默认实现。
 */
export type VoiceCloneProviderFactory = (
  apiKey: string,
) => DashScopeVoiceCloneProvider

/** 默认工厂：直接 new 一个 provider（uploader 内部默认构造） */
const defaultProviderFactory: VoiceCloneProviderFactory = (apiKey) =>
  new DashScopeVoiceCloneProvider(apiKey)

/**
 * 声音复刻 service。所有方法静态 — 与 VoiceService 风格一致。
 */
export class VoiceCloneService {
  /**
   * 单测注入点：替换 provider 工厂。生产环境保持默认。
   * 测试 afterAll 调 setProviderFactory(null) 清理。
   */
  private static providerFactory: VoiceCloneProviderFactory =
    defaultProviderFactory

  static setProviderFactory(factory: VoiceCloneProviderFactory | null): void {
    VoiceCloneService.providerFactory = factory ?? defaultProviderFactory
  }

  /**
   * 创建复刻任务（异步，立刻返回；状态 training）。
   *
   * 流程：
   *   1. 校验入参（音频文件存在 + 时长 10-20s）
   *   2. 找 enabled provider config + 解密 apiKey
   *   3. INSERT cloned_voices 占位（status='training'，voice_id=null）
   *   4. 调 provider.cloneVoice 真做样本上传 + enrollment
   *   5. UPDATE cloned_voices(voice_id, status)
   *   6. 失败 → DELETE 占位行（避免脏数据），返回错误
   */
  static async cloneVoice(
    req: VoiceCloneCreateRequest,
  ): Promise<ServiceResult<ClonedVoice>> {
    try {
      const validateErr = this.validateCreateRequest(req)
      if (validateErr) return { success: false, error: validateErr }

      const repo = this.getClonedVoiceRepo()
      if (!repo) return { success: false, error: '数据库未初始化' }

      const apiKeyRes = await this.getDecryptedApiKey(req.providerId)
      if (!apiKeyRes.ok) return { success: false, error: apiKeyRes.error }

      // 持久化样本到本地（user data dir/voice/clone）— 一并落 DB 相对路径
      const persistedSample = await this.persistSampleAudio(req.samplePath)

      // 占位：status='training'，voice_id 暂留 null
      const placeholder = await repo.create({
        name: req.name.trim(),
        status: 'training',
        sampleAudioPath: persistedSample,
        sampleDuration: Math.round(req.sampleDurationSec * 1000),
        providerId: DashScopeVoiceCloneProvider.PROVIDER_ID,
      })

      try {
        const provider = VoiceCloneService.providerFactory(apiKeyRes.apiKey)
        const result = await provider.cloneVoice({
          name: req.name,
          samplePath: resolveAssetPath(persistedSample),
          sampleDurationSec: req.sampleDurationSec,
          prefix: req.prefix,
          language: req.language,
        })

        await repo.update(placeholder.id, {
          status: result.status,
          voiceId: result.voiceId,
        })
        const updated = await repo.getById(placeholder.id)
        if (!updated) {
          // 理论不可能 — 防御性
          return { success: false, error: '复刻记录已写入但读不到' }
        }
        return { success: true, data: updated }
      } catch (e: any) {
        // provider 创建失败 → 回滚占位行 + 删本地样本
        await repo.delete(placeholder.id).catch(() => undefined)
        try {
          fs.unlinkSync(resolveAssetPath(persistedSample))
        } catch {
          /* ignore */
        }
        return {
          success: false,
          error: this.formatProviderError(e, '创建复刻音色失败'),
        }
      }
    } catch (e: any) {
      console.error('[VoiceCloneService.cloneVoice] 异常:', e)
      return {
        success: false,
        error: e?.message ?? '创建复刻音色异常',
      }
    }
  }

  /**
   * 刷新某条复刻的状态（同步调一次 provider 并写回 DB）。
   *
   * 用于：
   *   - 用户手动点 "刷新"
   *   - VoiceCloneJobScheduler 轮询时调
   *   - 渲染端订阅 voice:clone-completed 事件后回拉最新数据
   *
   * 行为：
   *   - 已是终态（ready / failed）→ 直接返回 DB 数据（不调 provider）
   *   - status=training 但 voice_id 为空 → 视为 stuck，直接标记 failed
   *   - status=training 且 voice_id 存在 → 调 query_voice 更新
   */
  static async refreshClonedVoiceStatus(
    id: string,
  ): Promise<ServiceResult<ClonedVoice>> {
    try {
      const repo = this.getClonedVoiceRepo()
      if (!repo) return { success: false, error: '数据库未初始化' }
      const row = await repo.getById(id)
      if (!row) return { success: false, error: '复刻记录不存在' }

      // 终态短路
      if (row.status !== 'training') {
        return { success: true, data: row }
      }

      // training 但 voice_id 缺失 — 之前 cloneVoice 一定异常退出未清理
      if (!row.voiceId) {
        await repo.update(id, {
          status: 'failed',
          errorMessage: '训练任务丢失 voice_id（请重新发起复刻）',
        })
        const updated = await repo.getById(id)
        return { success: true, data: updated! }
      }

      const apiKeyRes = await this.getDecryptedApiKey()
      if (!apiKeyRes.ok) return { success: false, error: apiKeyRes.error }

      try {
        const provider = VoiceCloneService.providerFactory(apiKeyRes.apiKey)
        const status = await provider.queryCloneStatus(row.voiceId)
        await repo.update(id, {
          status: status.status,
          errorMessage: status.errorMessage,
        })
        // demo_audio 仅 1h 有效，本服务不预下载 — 在 previewClonedVoice 时再处理。
        const updated = await repo.getById(id)
        return { success: true, data: updated! }
      } catch (e: any) {
        return {
          success: false,
          error: this.formatProviderError(e, '刷新状态失败'),
        }
      }
    } catch (e: any) {
      console.error('[VoiceCloneService.refreshClonedVoiceStatus] 异常:', e)
      return { success: false, error: e?.message ?? '刷新状态异常' }
    }
  }

  /**
   * 试听复刻音色 — 第一阶段最小实现：
   *   - 仅支持 demo_audio（即 query_voice 返回的 1h 临时 URL）
   *   - 命中本地缓存（preview_audio_path）则直接返回
   *   - 未缓存则 query_voice 拉一次，下载到本地，写 preview_audio_path
   *
   * **限制**：自定义 text 暂不支持（throw '功能 P3 接入'），CosyVoice 实时合成
   * 接口需要单独的 WebSocket 客户端，留 follow-up（设计 §11 风险 3）。
   */
  static async previewClonedVoice(
    id: string,
    text?: string,
  ): Promise<ServiceResult<{ audioPath: string }>> {
    try {
      if (text && text.trim().length > 0) {
        // 第一阶段未实现自定义 text 试听 — 显式告知，不静默降级
        return {
          success: false,
          error:
            '自定义文本试听需要 CosyVoice 流式合成（待 P3 渲染域接入），当前仅支持系统 demo 试听',
        }
      }

      const repo = this.getClonedVoiceRepo()
      if (!repo) return { success: false, error: '数据库未初始化' }
      const row = await repo.getById(id)
      if (!row) return { success: false, error: '复刻记录不存在' }
      if (row.status !== 'ready') {
        return {
          success: false,
          error: `复刻音色状态为 ${row.status}，无法试听`,
        }
      }

      // 命中缓存 — 文件还在则直接返回
      if (row.previewAudioPath) {
        const abs = resolveAssetPath(row.previewAudioPath)
        if (fs.existsSync(abs)) {
          return {
            success: true,
            data: { audioPath: toAssetUrl(row.previewAudioPath, 'file') },
          }
        }
      }

      if (!row.voiceId) {
        return { success: false, error: '复刻音色缺 voice_id，无法试听' }
      }

      const apiKeyRes = await this.getDecryptedApiKey()
      if (!apiKeyRes.ok) return { success: false, error: apiKeyRes.error }

      const provider = VoiceCloneService.providerFactory(apiKeyRes.apiKey)
      const status = await provider.queryCloneStatus(row.voiceId)
      if (!status.previewAudioUrl) {
        return {
          success: false,
          error: '当前 provider 未返回 demo_audio，请稍后再试',
        }
      }

      // 下载 demo 到本地缓存
      const localRel = await this.downloadPreviewToLocal(
        id,
        status.previewAudioUrl,
      )
      await repo.update(id, { previewAudioPath: localRel })

      return {
        success: true,
        data: { audioPath: toAssetUrl(localRel, 'file') },
      }
    } catch (e: any) {
      console.error('[VoiceCloneService.previewClonedVoice] 异常:', e)
      return {
        success: false,
        error: this.formatProviderError(e, '试听失败'),
      }
    }
  }

  /** 列出全部 / 按状态筛 */
  static async listClonedVoices(
    status?: ClonedVoiceStatus,
  ): Promise<ServiceResult<ClonedVoice[]>> {
    try {
      const repo = this.getClonedVoiceRepo()
      if (!repo) return { success: false, error: '数据库未初始化' }
      const rows = status ? await repo.getByStatus(status) : await repo.getAll()
      return { success: true, data: rows }
    } catch (e: any) {
      console.error('[VoiceCloneService.listClonedVoices] 异常:', e)
      return { success: false, error: e?.message ?? '查询失败' }
    }
  }

  /**
   * 删除复刻音色：
   *   1. provider 端删除（voice_id 存在时）— 失败仅记录，不阻塞 DB 删除
   *   2. character_bindings 表中所有引用该 voice_id 的行 voice_id=NULL
   *   3. cloned_voices 行删除
   *   4. 本地样本 / 试听缓存删除
   *
   * 之所以 provider 端失败不阻塞：DashScope 端的"孤儿音色"对用户无感；
   * 反而 DB 行不删会让 UI 一直显示这条"幽灵"。失败的 provider 删除会被
   * console.warn 打印，下次启动时可以做 reconcile 重试（follow-up）。
   */
  static async deleteClonedVoice(
    id: string,
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    try {
      const repo = this.getClonedVoiceRepo()
      if (!repo) return { success: false, error: '数据库未初始化' }
      const row = await repo.getById(id)
      if (!row) return { success: false, error: '复刻记录不存在' }

      // 1. provider 端删除（best-effort）
      if (row.voiceId) {
        const apiKeyRes = await this.getDecryptedApiKey()
        if (apiKeyRes.ok) {
          try {
            const provider = VoiceCloneService.providerFactory(apiKeyRes.apiKey)
            await provider.deleteClonedVoice(row.voiceId)
          } catch (e: any) {
            console.warn(
              '[VoiceCloneService.deleteClonedVoice] provider 端删除失败（忽略）:',
              e?.message ?? e,
            )
          }
        }
      }

      // 2. 解绑相关角色
      const charBindingRepo = this.getCharacterBindingRepo()
      if (charBindingRepo && row.voiceId) {
        await charBindingRepo
          .createQueryBuilder()
          .update(CharacterBindingEntity)
          .set({ voiceId: null, updatedAt: new Date() })
          .where('voice_id = :v', { v: row.voiceId })
          .execute()
      }

      // 3. DB 删除
      await repo.delete(id)

      // 4. 本地文件清理（失败不阻塞）
      for (const p of [row.sampleAudioPath, row.previewAudioPath]) {
        if (!p) continue
        try {
          const abs = resolveAssetPath(p)
          if (fs.existsSync(abs)) fs.unlinkSync(abs)
        } catch {
          /* ignore */
        }
      }

      return { success: true, data: { deleted: true } }
    } catch (e: any) {
      console.error('[VoiceCloneService.deleteClonedVoice] 异常:', e)
      return { success: false, error: e?.message ?? '删除失败' }
    }
  }

  // ===== Helpers =====

  private static getClonedVoiceRepo() {
    const dbm = getCoreDatabaseManager()
    return dbm.clonedVoices ?? null
  }

  private static getCharacterBindingRepo(): Repository<CharacterBindingEntity> | null {
    const dbm = getCoreDatabaseManager()
    if (!dbm.dataSource) return null
    return dbm.dataSource.getRepository(CharacterBindingEntity)
  }

  /**
   * 解密 API Key — 选 enabled 的 provider config（与 VoiceService 同款逻辑）。
   */
  private static async getDecryptedApiKey(
    requestedProviderId?: string,
  ): Promise<
    { ok: true; apiKey: string; providerId: string } | { ok: false; error: string }
  > {
    const dbm = getCoreDatabaseManager()
    if (!dbm.providerConfigs) {
      return { ok: false, error: '数据库未初始化' }
    }

    let pc = null
    if (requestedProviderId) {
      pc = await dbm.providerConfigs.getById(requestedProviderId)
    }
    if (!pc) pc = await dbm.providerConfigs.getDefault()
    if (!pc) {
      const enabled = await dbm.providerConfigs.getEnabled()
      if (enabled.length > 0) pc = enabled[0]
    }

    if (!pc) {
      return {
        ok: false,
        error: '暂无可用的 AI 提供商，请先配置 DashScope（百炼）API Key',
      }
    }
    if (!pc.apiKey) {
      return {
        ok: false,
        error: `提供商 "${pc.name}" 未配置 API 密钥`,
      }
    }

    try {
      const ss = getSecureStorage()
      if (!ss.isInitialized()) await ss.initialize()
      const apiKey = ss.decrypt(pc.apiKey)
      return { ok: true, apiKey, providerId: pc.id }
    } catch {
      return {
        ok: false,
        error: 'API 密钥解密失败，请重新配置提供商',
      }
    }
  }

  /** 把用户上传的音频复制到 user data dir/voice/clone/，DB 存相对路径 */
  private static async persistSampleAudio(srcAbsPath: string): Promise<string> {
    if (!fs.existsSync(srcAbsPath)) {
      throw new Error(`样本文件不存在：${srcAbsPath}`)
    }
    const ext = path.extname(srcAbsPath) || '.wav'
    const stamp = Date.now()
    const fileName = `clone-${stamp}-${Math.random().toString(16).slice(2, 8)}${ext}`
    const cloneDir = path.join(getPathProvider().getDataPath(), 'voice', 'clone')
    if (!fs.existsSync(cloneDir)) fs.mkdirSync(cloneDir, { recursive: true })
    const targetAbs = path.join(cloneDir, fileName)
    fs.copyFileSync(srcAbsPath, targetAbs)
    return toRelativeAssetPath(targetAbs)
  }

  /** 把远端 demo 音频下载到本地 voice/preview/{id}.{ext}，返回相对路径 */
  private static async downloadPreviewToLocal(
    clonedVoiceId: string,
    remoteUrl: string,
  ): Promise<string> {
    const resp = await fetch(remoteUrl)
    if (!resp.ok) {
      throw new Error(`下载 demo 音频失败 HTTP ${resp.status}`)
    }
    const buffer = Buffer.from(await resp.arrayBuffer())
    const ext = guessExtFromUrl(remoteUrl) || '.mp3'
    const previewDir = path.join(
      getPathProvider().getDataPath(),
      'voice',
      'preview',
    )
    if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true })
    const target = path.join(previewDir, `${clonedVoiceId}${ext}`)
    fs.writeFileSync(target, buffer)
    return toRelativeAssetPath(target)
  }

  /** 客户端入参基础校验 */
  private static validateCreateRequest(
    req: VoiceCloneCreateRequest,
  ): string | null {
    if (!req || typeof req !== 'object') return '请求参数无效'
    if (!req.name?.trim()) return '音色名称必填'
    if (req.name.trim().length > 40) return '音色名称不超过 40 字'
    if (!req.samplePath || !fs.existsSync(req.samplePath)) {
      return '样本音频文件不存在'
    }
    if (
      !Number.isFinite(req.sampleDurationSec) ||
      req.sampleDurationSec < 10 ||
      req.sampleDurationSec > 20
    ) {
      return '样本音频时长需在 10-20 秒'
    }
    if (!req.prefix || !/^[a-z0-9]{1,10}$/.test(req.prefix)) {
      return 'prefix 必须为 1-10 个小写字母或数字'
    }
    return null
  }

  /** 把各种内部 error 转成用户可读 string */
  private static formatProviderError(e: unknown, fallback: string): string {
    if (e instanceof DashScopeVoiceCloneError) {
      return `${fallback}：[${e.action}] ${e.message}`
    }
    if (e instanceof Error) return `${fallback}：${e.message}`
    return `${fallback}：${String(e)}`
  }
}

/** 极简扩展名提取，覆盖 demo_audio 常见 mp3/wav/m4a */
function guessExtFromUrl(url: string): string | null {
  try {
    const noQuery = url.split('?')[0]
    const ext = path.extname(noQuery).toLowerCase()
    if (['.mp3', '.wav', '.m4a', '.ogg', '.aac'].includes(ext)) return ext
    return null
  } catch {
    return null
  }
}
