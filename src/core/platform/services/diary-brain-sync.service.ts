/**
 * 日记消化同步服务（spec 2026-09-24 日记增强 §6.1 P2）
 * @module platform/services/diary-brain-sync.service
 * @description 日记 → 知识大脑的输入面：
 *   opt-in 目录的条目自动注册为「日记」知识库文档（addDocument 幂等 upsert），
 *   触发既有 processDocument → kb:document-completed → 消化管线 → human 论断进提议箱。
 *
 * 红线落地：
 *   - 隐私 opt-in：目录级 brain_opt_in 默认关；frontmatter `brain: false` 条目级排除
 *   - 提议制：日记库 autoApproveThreshold 置为不可达（1.01），全部论断进提议箱人批
 *   - 成本适配：正文 <300 字跳过；防抖 5 分钟（连续自动保存只同步最后一次）；
 *     内容未变的条目跳过（会话内记忆，重启后首次保存会幂等重跑一次管线）
 *
 * 已知边界（有意为之，v1）：「日记」库 embedding 留空（BM25 + 论断层先跑），
 * 用户可随时在知识库设置里补配 embedding 获得语义召回；请勿重命名「日记」库。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'
import { DiaryService } from '@core/platform/services/diary.service'
import {
  defaultBrainConfig,
  normalizeBrainConfig,
  stringifyBrainConfig,
} from '@core/platform/services/kb-brain/brain-config'
import type { KnowledgeBase } from '@shared/types/knowledge-base.types'
import type { DiaryEntry, DiaryIpcResponse } from '@shared/types/diary.types'

/** 「日记」知识库名（请勿重命名；描述里另埋 marker 双保险） */
export const DIARY_KB_NAME = '日记'
export const DIARY_KB_MARKER = 'diary-brain-sync'
/** 正文下限：低于此字数的条目不值得一次消化遍次 */
export const MIN_SYNC_CONTENT_CHARS = 300
/** 自动保存防抖：距最后一次编辑 5 分钟才同步 */
export const SYNC_DEBOUNCE_MS = 5 * 60 * 1000
/**
 * 提议制闸门：ajv 限 ≤1，取上界 1 = 相似度不可能达到 → 全部论断进提议箱人批
 */
const PROPOSE_ONLY_THRESHOLD = 1

export class DiaryBrainSyncService {
  private kbService = new KnowledgeBaseService()
  private memoizedKbId: string | null = null
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private lastSyncedContent = new Map<string, string>()
  /** 目录开关互斥（防快速关→开时 purge 与 backfill 交错） */
  private toggleInFlight = false

  /**
   * 只读查找「日记」知识库（按名称或描述 marker）。不创建——防两个副作用：
   * ①灵感条/清理路径在用户无感知时建库；②建库缺 embedding 配置必被
   * createKnowledgeBase 拦截（文档管线第 5 步向量化必炸，BM25 都跑不到）。
   */
  async findDiaryKnowledgeBase(): Promise<KnowledgeBase | null> {
    try {
      const db = getCoreDatabaseManager()
      if (!db.knowledgeBases) return null

      if (this.memoizedKbId) {
        const cached = await db.knowledgeBases.findById(this.memoizedKbId)
        if (cached) {
          this.ensureDiaryBrainConfig(cached)
          return cached
        }
        this.memoizedKbId = null
      }

      const all = await db.knowledgeBases.findAll()
      const found = all.find(
        kb => kb.name === DIARY_KB_NAME || (kb.description ?? '').includes(DIARY_KB_MARKER)
      )
      if (!found) return null
      this.memoizedKbId = found.id
      // 命中即校验/补写红线 brainConfig（防用户自建同名库绕过提议制，见评审 H4）
      await this.ensureDiaryBrainConfig(found)
      return found
    } catch (error) {
      console.warn('[DiaryBrainSync] findDiaryKnowledgeBase 失败:', error)
      return null
    }
  }

  /** 「日记」库是否存在且已配 embedding（前端 opt-in 引导判断用） */
  async getDiaryKbStatus(): Promise<{
    exists: boolean
    hasEmbedding: boolean
    kbId?: string
  }> {
    const kb = await this.findDiaryKnowledgeBase()
    if (!kb) return { exists: false, hasEmbedding: false }
    const cfg = kb.embeddingConfig ? safeParseEmbedding(kb.embeddingConfig) : null
    return { exists: true, hasEmbedding: !!cfg?.modelId && (cfg.provider === 'local' || !!cfg.providerConfigId), kbId: kb.id }
  }

  /** 提议制 brainConfig：消化开、阈值取上界（全部人批）、学习/蒸馏关 */
  private async applyDiaryBrainConfig(kbId: string): Promise<void> {
    const config = normalizeBrainConfig(defaultBrainConfig(true))
    config.digestion.enabled = true
    config.autoApproveThreshold = PROPOSE_ONLY_THRESHOLD
    config.learning.enabled = false
    config.distillation.enabled = false
    await this.kbService.updateKnowledgeBase(kbId, {
      brainConfig: stringifyBrainConfig(config),
    })
  }

  /** 命中已有库时校验红线配置：非提议制/学习误开则纠正（幂等，改错不告知） */
  private async ensureDiaryBrainConfig(kb: KnowledgeBase): Promise<void> {
    try {
      if (!kb.brainConfig) {
        await this.applyDiaryBrainConfig(kb.id)
        return
      }
      const cfg = safeParseBrain(kb.brainConfig)
      if (!cfg) {
        await this.applyDiaryBrainConfig(kb.id)
        return
      }
      if (
        cfg.autoApproveThreshold !== PROPOSE_ONLY_THRESHOLD ||
        cfg.learning.enabled ||
        cfg.distillation.enabled ||
        !cfg.digestion.enabled
      ) {
        await this.applyDiaryBrainConfig(kb.id)
      }
    } catch (error) {
      console.warn('[DiaryBrainSync] ensureDiaryBrainConfig 失败:', error)
    }
  }

  /**
   * 条目保存后调用：重置 5 分钟防抖定时器。到期时重新校验全部守卫，
   * 目录关闭 opt-in / 正文过短 / 被排除的条目自然跳过。
   */
  scheduleEntrySync(entryId: string): void {
    const existing = this.timers.get(entryId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.timers.delete(entryId)
      void this.syncEntryNow(entryId)
    }, SYNC_DEBOUNCE_MS)
    // 不阻塞进程退出
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    this.timers.set(entryId, timer)
  }

  /** 取消条目的待同步定时器（软删除/彻底删除时调用——隐私红线：删除即退出消化队列） */
  cancelScheduledSync(entryId: string): void {
    const t = this.timers.get(entryId)
    if (t) {
      clearTimeout(t)
      this.timers.delete(entryId)
    }
    this.lastSyncedContent.delete(entryId)
  }

  /**
   * 立即同步单条（守卫齐备才入库）。返回是否实际同步与未同步原因。
   */
  async syncEntryNow(entryId: string): Promise<{ synced: boolean; reason?: string }> {
    try {
      const db = getCoreDatabaseManager()
      const service = new DiaryService()
      const entryResp = await service.getEntry(entryId)
      if (!entryResp.success || !entryResp.data) {
        return { synced: false, reason: 'entry-missing' }
      }
      const entry = entryResp.data
      const content = entry.content || ''

      if (entry.deletedAt) return { synced: false, reason: 'deleted' }
      if (isEntryExcluded(entry)) return { synced: false, reason: 'excluded' }
      if (content.length < MIN_SYNC_CONTENT_CHARS) return { synced: false, reason: 'too-short' }

      const folder = await db.diaryFolders?.findById(entry.folderId)
      if (!folder?.brainOptIn) return { synced: false, reason: 'not-opted-in' }

      if (this.lastSyncedContent.get(entryId) === content) {
        return { synced: false, reason: 'unchanged' }
      }

      const kb = await this.findDiaryKnowledgeBase()
      if (!kb) return { synced: false, reason: 'no-diary-kb' }

      const resp = await this.kbService.addDocument(kb.id, {
        name: entry.title,
        type: 'text',
        content,
        source: { type: 'diary', id: entry.id },
      })
      if (!resp.success) {
        console.warn('[DiaryBrainSync] addDocument 失败:', resp.error)
        return { synced: false, reason: 'add-failed' }
      }

      this.lastSyncedContent.set(entryId, content)
      return { synced: true }
    } catch (error) {
      console.warn('[DiaryBrainSync] syncEntryNow 失败:', error)
      return { synced: false, reason: 'error' }
    }
  }

  /**
   * 目录开关（IPC 入口）。开启：要求「日记」库已存在且已配 embedding（否则返回
   * needSetup 引导前端建库），置位 + 回填存量；关闭：置位 + 出库清理（幂等，容错）。
   * 互斥：同一时刻只允许一个开关操作在途（防快速关→开的 purge/backfill 交错）。
   */
  async setFolderBrainOptIn(
    folderId: string,
    enabled: boolean
  ): Promise<DiaryIpcResponse<void> & { needSetup?: boolean }> {
    if (this.toggleInFlight) {
      return { success: false, error: '另一个目录开关操作正在进行中，请稍后' }
    }
    this.toggleInFlight = true
    try {
      if (enabled) {
        const status = await this.getDiaryKbStatus()
        if (!status.exists || !status.hasEmbedding) {
          // 不置位、不同步——前端据 needSetup 弹引导（创建「日记」库 + 配 embedding）
          return { success: false, needSetup: true, error: '「日记」知识库未就绪（需创建并配置 Embedding）' }
        }
      }

      const service = new DiaryService()

      // 先置位（保证开关即时生效，后续清理/回填失败不倒挂状态）
      const updated = await service.updateFolder(folderId, { brainOptIn: enabled })
      if (!updated.success) return updated

      if (enabled) {
        const result = await this.backfillFolder(folderId)
        console.log(`[DiaryBrainSync] 回填完成 folder=${folderId} 同步 ${result.synced} 跳过 ${result.skipped}`)
        return { success: true }
      }

      await this.purgeFolderEntries(folderId)
      return { success: true }
    } catch (error) {
      console.error('[DiaryBrainSync] setFolderBrainOptIn error:', error)
      return { success: false, error: String(error) }
    } finally {
      this.toggleInFlight = false
    }
  }

  /**
   * 回填目录内全部合格存量条目（逐条走 syncEntryNow 守卫；addDocument 内部
   * processDocument 为异步 fire-and-forget，这里不会长时间阻塞）。
   */
  async backfillFolder(folderId: string): Promise<{ synced: number; skipped: number }> {
    const db = getCoreDatabaseManager()
    const entries = await db.diaryEntries!.findByFolder(folderId)
    let synced = 0
    let skipped = 0
    for (const item of entries) {
      const result = await this.syncEntryNow(item.id)
      if (result.synced) synced++
      else skipped++
    }
    return { synced, skipped }
  }

  /**
   * 出库清理：删除目录内条目（含回收站里的）在「日记」库的文档。
   * 幂等 best-effort：单条失败不阻断。
   */
  async purgeFolderEntries(folderId: string): Promise<void> {
    await this.purgeEntryIds(await collectFolderEntryIds(folderId))
  }

  /** 按 source 删除「日记」库里的日记文档（彻底删除/目录删除后的卫生清理） */
  async purgeEntryIds(entryIds: string[]): Promise<void> {
    try {
      const db = getCoreDatabaseManager()
      const kb = await this.findDiaryKnowledgeBase()
      if (!kb) return
      for (const entryId of entryIds) {
        try {
          const doc = await db.kbDocuments?.findBySource(kb.id, { type: 'diary', id: entryId })
          if (doc) {
            await this.kbService.deleteDocument(doc.id)
            this.lastSyncedContent.delete(entryId)
          }
        } catch (error) {
          console.warn(`[DiaryBrainSync] 清理文档失败 entry=${entryId}:`, error)
        }
      }
    } catch (error) {
      console.warn('[DiaryBrainSync] purgeEntryIds 失败:', error)
    }
  }
}

function safeParseEmbedding(raw: string): { modelId?: string; provider?: string; providerConfigId?: string } | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function safeParseBrain(raw: string): ReturnType<typeof normalizeBrainConfig> | null {
  try {
    return normalizeBrainConfig(JSON.parse(raw) as never)
  } catch {
    return null
  }
}

/** 条目级排除：frontmatter 写 `brain: false`（或 `brain: "false"`）的条目永不入库 */
export function isEntryExcluded(entry: Pick<DiaryEntry, 'frontmatter'>): boolean {
  if (!entry.frontmatter) return false
  return /(^|\n)\s*brain\s*:\s*("?false"?|no)\s*($|\n)/i.test(entry.frontmatter)
}

let sharedSyncService: DiaryBrainSyncService | null = null

/** 共享单例：DiaryService 保存钩子（动态 import 取用，避免模块循环）与 IPC handler 共用 */
export function getDiaryBrainSyncService(): DiaryBrainSyncService {
  if (!sharedSyncService) sharedSyncService = new DiaryBrainSyncService()
  return sharedSyncService
}

/** 收集目录内全部条目 id（含回收站）——目录删除/出库清理用 */
async function collectFolderEntryIds(folderId: string): Promise<string[]> {
  const service = new DiaryService()
  const live = (await service.getEntries(folderId)).data ?? []
  const deleted = ((await service.getDeletedEntries()).data ?? []).filter(e => e.folderId === folderId)
  return [...live, ...deleted].map(e => e.id)
}
