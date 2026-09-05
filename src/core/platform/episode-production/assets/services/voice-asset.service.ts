/**
 * 语音资产 service（spec §3.9）：管理声音库 + 角色 voice 绑定
 * @module platform/episode-production/assets/services/voice-asset
 *
 * 包装 cloned_voices 表查询 + character_binding.voice_id 绑定的辅助方法。
 *
 * 设计要点：
 * - 本 service **不**做 TTS 语音合成（合成职责归 P5 渲染域 audio/dialogue-synthesis.service）；
 *   这里只负责"声音库"和"哪个角色用哪个 voice"的持久化读写。
 * - 纯 core service，不引入 IPC / preload / Electron 依赖，PC + Web 双端共用；
 *   后续 IPC layer 在 Task 9 包装暴露。
 *
 * 数据库 quirks：
 * - cloned_voices.created_at / updated_at 列类型是 text（ISO 字符串，**不是 Date**），
 *   但 typeorm Repository.find 的 order: { createdAt: 'DESC' } 仍可工作（按字符串排序，
 *   ISO 字符串字典序与时间序一致）。
 * - character_binding.updated_at 是 Date NOT NULL；本 service update voiceId 时
 *   必须带上 updatedAt: new Date()，patch 走 Record<string, unknown> 中间变量
 *   避免与 entity 强类型冲突（与 character / location service 一致）。
 */

import type { DataSource, Repository } from 'typeorm'
import { ClonedVoiceEntity } from '@core/database/entities/cloned-voice.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'

/**
 * 语音资产业务 service。
 *
 * public 方法签名稳定（IPC task 9 会包它），不要随意改。
 */
export class VoiceAssetService {
  constructor(private readonly ds: DataSource) {}

  private get voiceRepo(): Repository<ClonedVoiceEntity> {
    return this.ds.getRepository(ClonedVoiceEntity)
  }

  private get charRepo(): Repository<CharacterBindingEntity> {
    return this.ds.getRepository(CharacterBindingEntity)
  }

  /** 列出全部声音（不论 status；按 created_at 倒序，新建在前） */
  async listAvailableVoices(): Promise<ClonedVoiceEntity[]> {
    return await this.voiceRepo.find({ order: { createdAt: 'DESC' } })
  }

  /** 仅列出 status='ready'（训练完成、可用）的声音 */
  async listReadyVoices(): Promise<ClonedVoiceEntity[]> {
    return await this.voiceRepo.find({
      where: { status: 'ready' },
      order: { createdAt: 'DESC' },
    })
  }

  /** 按声音 ID 取声音详情 */
  async getVoiceById(voiceId: string): Promise<ClonedVoiceEntity | null> {
    return await this.voiceRepo.findOne({ where: { id: voiceId } })
  }

  /**
   * 把声音绑定到角色 binding（传 null 解除绑定）。
   *
   * 注意 character_binding.updated_at 是 Date NOT NULL，本次更新必须同步刷新；
   * 走 Record<string, unknown> patch 避免 typeorm DeepPartial 类型噪音。
   */
  async bindToCharacter(
    characterBindingId: string,
    voiceId: string | null,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      voiceId,
      updatedAt: new Date(),
    }
    await this.charRepo.update(characterBindingId, patch)
  }

  /** 反向查询：哪些角色 binding 绑了这个 voice */
  async listCharactersByVoice(
    voiceId: string,
  ): Promise<CharacterBindingEntity[]> {
    return await this.charRepo.find({ where: { voiceId } })
  }
}
