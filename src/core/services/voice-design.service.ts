/**
 * 声音设计服务
 * @module services/voice-design
 *
 * 负责"声音设计"业务流程的全部 service 层逻辑：
 *   1. designVoice              — 创建声音设计 + 入库
 *   2. refreshDesignedVoiceStatus — 调 provider query 刷新单条状态
 *   3. previewDesignedVoice      — 试听（demo_audio）
 *   4. listDesignedVoices        — 列出全部 / 按状态筛
 *   5. deleteDesignedVoice       — provider 端删除 + 解绑相关角色 + 删本地缓存
 *
 * 与 VoiceCloneService 结构类似，但不需要音频文件上传。
 */

import * as fs from 'fs'
import * as path from 'path'
import type {
  DesignedVoice,
  DesignedVoiceStatus,
  VoiceDesignCreateRequest,
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
  DashScopeVoiceDesignError,
  DashScopeVoiceDesignProvider,
} from '@core/voice-providers/dashscope-voice-design-provider'

/** IPC 响应统一壳 */
export interface ServiceResult<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Provider 工厂签名
 */
export type VoiceDesignProviderFactory = (
  apiKey: string,
) => DashScopeVoiceDesignProvider

/** 默认工厂 */
const defaultProviderFactory: VoiceDesignProviderFactory = (apiKey) =>
  new DashScopeVoiceDesignProvider(apiKey)

/**
 * 声音设计 service。所有方法静态。
 */
export class VoiceDesignService {
  private static providerFactory: VoiceDesignProviderFactory =
    defaultProviderFactory

  static setProviderFactory(factory: VoiceDesignProviderFactory | null): void {
    VoiceDesignService.providerFactory = factory ?? defaultProviderFactory
  }

  /**
   * 创建声音设计（异步，立刻返回；状态 training）。
   *
   * 流程：
   *   1. 校验入参（voice_prompt 非空 + ≤500 字符）
   *   2. 找 enabled provider config + 解密 apiKey
   *   3. INSERT designed_voices 占位（status='training'，voice_id=null）
   *   4. 调 provider.designVoice
   *   5. UPDATE designed_voices(voice_id, status)
   *   6. 失败 → DELETE 占位行
   */
  static async designVoice(
    req: VoiceDesignCreateRequest,
  ): Promise<ServiceResult<DesignedVoice>> {
    try {
      const validateErr = this.validateCreateRequest(req)
      if (validateErr) return { success: false, error: validateErr }

      const repo = this.getDesignedVoiceRepo()
      if (!repo) return { success: false, error: '数据库未初始化' }

      const apiKeyRes = await this.getDecryptedApiKey(req.providerId)
      if (!apiKeyRes.ok) return { success: false, error: apiKeyRes.error }

      // 占位：status='training'，voice_id 暂留 null
      const placeholder = await repo.create({
        name: req.name.trim(),
        voicePrompt: req.voicePrompt.trim(),
        status: 'training',
        prefix: req.prefix.trim(),
        targetModel: req.targetModel ?? DashScopeVoiceDesignProvider.DEFAULT_TARGET_MODEL,
        providerId: DashScopeVoiceDesignProvider.PROVIDER_ID,
      })

      try {
        const provider = VoiceDesignService.providerFactory(apiKeyRes.apiKey)
        const result = await provider.designVoice({
          name: req.name,
          voicePrompt: req.voicePrompt,
          prefix: req.prefix,
          targetModel: req.targetModel,
          previewText: req.previewText,
        })

        await repo.update(placeholder.id, {
          status: result.status,
          voiceId: result.voiceId,
          targetModel: result.targetModel,
        })
        const updated = await repo.getById(placeholder.id)
        if (!updated) {
          return { success: false, error: '设计记录已写入但读不到' }
        }
        return { success: true, data: updated }
      } catch (e: any) {
        // provider 创建失败 → 回滚占位行
        await repo.delete(placeholder.id).catch(() => undefined)
        return {
          success: false,
          error: this.formatProviderError(e, '创建设计音色失败'),
        }
      }
    } catch (e: any) {
      console.error('[VoiceDesignService.designVoice] 异常:', e)
      return {
        success: false,
        error: e?.message ?? '创建设计音色异常',
      }
    }
  }

  /**
   * 刷新某条设计的状态。
   */
  static async refreshDesignedVoiceStatus(
    id: string,
  ): Promise<ServiceResult<DesignedVoice>> {
    try {
      const repo = this.getDesignedVoiceRepo()
      if (!repo) return { success: false, error: '数据库未初始化' }
      const row = await repo.getById(id)
      if (!row) return { success: false, error: '设计记录不存在' }

      // 终态短路
      if (row.status !== 'training') {
        return { success: true, data: row }
      }

      // training 但 voice_id 缺失
      if (!row.voiceId) {
        await repo.update(id, {
          status: 'failed',
          errorMessage: '训练任务丢失 voice_id（请重新发起设计）',
        })
        const updated = await repo.getById(id)
        return { success: true, data: updated! }
      }

      const apiKeyRes = await this.getDecryptedApiKey()
      if (!apiKeyRes.ok) return { success: false, error: apiKeyRes.error }

      try {
        const provider = VoiceDesignService.providerFactory(apiKeyRes.apiKey)
        const status = await provider.queryDesignStatus(row.voiceId)
        await repo.update(id, {
          status: status.status,
          errorMessage: status.errorMessage,
        })
        const updated = await repo.getById(id)
        return { success: true, data: updated! }
      } catch (e: any) {
        return {
          success: false,
          error: this.formatProviderError(e, '刷新状态失败'),
        }
      }
    } catch (e: any) {
      console.error('[VoiceDesignService.refreshDesignedVoiceStatus] 异常:', e)
      return { success: false, error: e?.message ?? '刷新状态异常' }
    }
  }

  /**
   * 试听设计音色。
   */
  static async previewDesignedVoice(
    id: string,
  ): Promise<ServiceResult<{ audioPath: string }>> {
    try {
      const repo = this.getDesignedVoiceRepo()
      if (!repo) return { success: false, error: '数据库未初始化' }
      const row = await repo.getById(id)
      if (!row) return { success: false, error: '设计记录不存在' }
      if (row.status !== 'ready') {
        return {
          success: false,
          error: `设计音色状态为 ${row.status}，无法试听`,
        }
      }

      // 命中缓存
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
        return { success: false, error: '设计音色缺 voice_id，无法试听' }
      }

      const apiKeyRes = await this.getDecryptedApiKey()
      if (!apiKeyRes.ok) return { success: false, error: apiKeyRes.error }

      const provider = VoiceDesignService.providerFactory(apiKeyRes.apiKey)
      const status = await provider.queryDesignStatus(row.voiceId)
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
      console.error('[VoiceDesignService.previewDesignedVoice] 异常:', e)
      return {
        success: false,
        error: this.formatProviderError(e, '试听失败'),
      }
    }
  }

  /** 列出全部 / 按状态筛 */
  static async listDesignedVoices(
    status?: DesignedVoiceStatus,
  ): Promise<ServiceResult<DesignedVoice[]>> {
    try {
      const repo = this.getDesignedVoiceRepo()
      if (!repo) return { success: false, error: '数据库未初始化' }
      const rows = status ? await repo.getByStatus(status) : await repo.getAll()
      return { success: true, data: rows }
    } catch (e: any) {
      console.error('[VoiceDesignService.listDesignedVoices] 异常:', e)
      return { success: false, error: e?.message ?? '查询失败' }
    }
  }

  /**
   * 删除设计音色：
   *   1. provider 端删除
   *   2. character_bindings 表中所有引用该 voice_id 的行 voice_id=NULL
   *   3. designed_voices 行删除
   *   4. 本地试听缓存删除
   */
  static async deleteDesignedVoice(
    id: string,
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    try {
      const repo = this.getDesignedVoiceRepo()
      if (!repo) return { success: false, error: '数据库未初始化' }
      const row = await repo.getById(id)
      if (!row) return { success: false, error: '设计记录不存在' }

      // 1. provider 端删除（best-effort）
      if (row.voiceId) {
        const apiKeyRes = await this.getDecryptedApiKey()
        if (apiKeyRes.ok) {
          try {
            const provider = VoiceDesignService.providerFactory(apiKeyRes.apiKey)
            await provider.deleteDesignedVoice(row.voiceId)
          } catch (e: any) {
            console.warn(
              '[VoiceDesignService.deleteDesignedVoice] provider 端删除失败（忽略）:',
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

      // 4. 本地文件清理
      if (row.previewAudioPath) {
        try {
          const abs = resolveAssetPath(row.previewAudioPath)
          if (fs.existsSync(abs)) fs.unlinkSync(abs)
        } catch {
          /* ignore */
        }
      }

      return { success: true, data: { deleted: true } }
    } catch (e: any) {
      console.error('[VoiceDesignService.deleteDesignedVoice] 异常:', e)
      return { success: false, error: e?.message ?? '删除失败' }
    }
  }

  // ===== Helpers =====

  private static getDesignedVoiceRepo() {
    const dbm = getCoreDatabaseManager()
    return dbm.designedVoices ?? null
  }

  private static getCharacterBindingRepo(): any {
    const dbm = getCoreDatabaseManager()
    if (!dbm.dataSource) return null
    return dbm.dataSource.getRepository(CharacterBindingEntity)
  }

  /**
   * 解密 API Key
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

  /** 把远端 demo 音频下载到本地 voice/preview/{id}.{ext}，返回相对路径 */
  private static async downloadPreviewToLocal(
    designedVoiceId: string,
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
    const target = path.join(previewDir, `${designedVoiceId}${ext}`)
    fs.writeFileSync(target, buffer)
    return toRelativeAssetPath(target)
  }

  /** 客户端入参基础校验 */
  private static validateCreateRequest(
    req: VoiceDesignCreateRequest,
  ): string | null {
    if (!req || typeof req !== 'object') return '请求参数无效'
    if (!req.name?.trim()) return '音色名称必填'
    if (req.name.trim().length > 40) return '音色名称不超过 40 字'
    if (!req.voicePrompt?.trim()) return '声音描述必填'
    if (req.voicePrompt.trim().length > 500) return '声音描述不超过 500 字'
    if (!req.prefix || !/^[a-z0-9]{1,10}$/.test(req.prefix)) {
      return 'prefix 必须为 1-10 个小写字母或数字'
    }
    return null
  }

  /** 把各种内部 error 转成用户可读 string */
  private static formatProviderError(e: unknown, fallback: string): string {
    if (e instanceof DashScopeVoiceDesignError) {
      return `${fallback}：[${e.action}] ${e.message}`
    }
    if (e instanceof Error) return `${fallback}：${e.message}`
    return `${fallback}：${String(e)}`
  }
}

/** 极简扩展名提取 */
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