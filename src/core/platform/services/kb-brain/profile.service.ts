/**
 * 知识大脑·内容画像服务（类型自动识别，§类型化提取）
 * @module platform/services/kb-brain/profile.service
 *
 * 职责：首次消化时对文档采样（章节摘要优先，缺摘要用正文开头），一次 LLM 调用
 * 判定内容类型（novel/knowledge/history/other + 体裁细标），写入 brainConfig.profile。
 * 画像驱动两件事：① 类型化提取提示词（buildAtomizeSystem）② 书级汇总遍的关卡清单。
 * 纪律：fail-soft——检测失败/解析失败一律回落「未识别」，绝不阻塞消化主链路；
 * 已有非空画像（含用户手改）永不覆盖。
 */
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import { PROFILE_SYSTEM, buildProfileUser } from './prompts'
import { defaultBrainLlm, type BrainLlmFn, BRAIN_LLM_MAX_TOKENS, type BrainModelRef } from './llm'
import {
  mergeBrainConfig,
  normalizeProfile,
  parseBrainConfig,
  stringifyBrainConfig,
  type KbBrainConfig,
  type KbBrainProfile
} from './brain-config'

const logger = createLogger('KbBrainProfile')

/** 采样章数上限（均匀铺开取中间，兼顾开头定调与中后段展开） */
const PROFILE_SAMPLE_MAX = 12
/** 单样本字符上限（摘要 1200 / 正文开头 600） */
const SAMPLE_SUMMARY_CHARS = 1200
const SAMPLE_CONTENT_CHARS = 600

/** 仓储访问集（测试注入假仓库；生产 db manager） */
export interface KbProfileRepos {
  chapters: {
    findByDocument(
      documentId: string,
      opts?: { includeContent?: boolean },
    ): Promise<Array<{ title: string; content: string | null; summary: string | null }>>
  }
  kbs: {
    findById(kbId: string): Promise<{ brainConfig?: string | null } | null>
    update(kbId: string, patch: { brainConfig: string }): Promise<unknown>
  }
}

/** 进程内检测失败记忆（按 documentId）：同一次应用运行内不重复探测（消化幂等——
 *  重跑同 hash 文档零新增 LLM 调用）；应用重启后记忆清空 → 自动重试（模型恢复/章节
 *  变多后可自愈）。成功画像走 brainConfig 持久化短路，与此记忆无关。 */
const detectFailedMemo = new Set<string>()

/** 仅测试用：清空进程内失败记忆（模拟应用重启的语义） */
export function resetProfileDetectMemoForTests(): void {
  detectFailedMemo.clear()
}

export class KbBrainProfileService {
  private readonly llm: BrainLlmFn
  private readonly reposFn: () => KbProfileRepos | null

  constructor(
    deps: {
      llm?: BrainLlmFn
      modelOverride?: () => BrainModelRef
      repos?: () => KbProfileRepos | null
    } = {}
  ) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps.modelOverride)
    this.reposFn =
      deps.repos ??
      ((): KbProfileRepos | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbChapters || !db.knowledgeBases) return null
        return { chapters: db.kbChapters, kbs: db.knowledgeBases }
      })
  }

  /**
   * 确保画像可用：已有非空画像直接返回；否则检测并持久化。
   * 永不 throw、永不返回 null——调用方拿到的画像只可能是「已识别」或「未识别('')」。
   * 幂等语义（review P2 修正）：成功才持久化（contentType 落库=永久短路）；
   * 失败不落标记——下一次消化会自动重试（模型恢复/章节变多后可自愈），
   * 代价仅是失败库每次消化多一次探测调用。
   */
  async ensureProfile(
    kbId: string,
    documentId: string,
    cfg: KbBrainConfig
  ): Promise<KbBrainProfile> {
    if (cfg.profile?.contentType) return cfg.profile
    if (detectFailedMemo.has(documentId)) return cfg.profile ?? { contentType: '' }
    try {
      const detected = await this.detect(documentId)
      if (!detected) {
        detectFailedMemo.add(documentId)
        return cfg.profile ?? { contentType: '' }
      }
      const next: KbBrainProfile = {
        ...detected,
        detectedAt: new Date().toISOString(),
        sourceDocumentId: documentId
      }
      const repos = this.reposFn()
      if (repos) {
        // 写回前重读库内最新配置再 merge（review M8）：入参 cfg 是消化开始时的快照，
        // detect() 的 LLM 调用窗口（分钟级）内用户在面板保存的其他段改动会被旧基线
        // 整体覆盖丢失。读不到最新行时退回快照 cfg（fail-soft）。
        const latestRow = await repos.kbs.findById(kbId).catch(() => null)
        const base = latestRow?.brainConfig ? (parseBrainConfig(latestRow.brainConfig) ?? cfg) : cfg
        const merged = mergeBrainConfig(base, { profile: next })
        await repos.kbs.update(kbId, { brainConfig: stringifyBrainConfig(merged) })
      }
      return next
    } catch (e) {
      // 此前完全静默：画像反复失败无从诊断（外层 warn 因本方法永不 throw 永不触发）
      logger.warn(
        '[kb-brain] 画像检测失败（不阻塞消化）:',
        e instanceof Error ? e.message : String(e)
      )
      return cfg.profile ?? { contentType: '' }
    }
  }

  /** 检测一次（不落库）；失败/无样本/未识别返回 null */
  async detect(documentId: string): Promise<KbBrainProfile | null> {
    const repos = this.reposFn()
    if (!repos) return null
    // 画像采样在无摘要时用正文开头补信号 → 需要 content（显式 opt-in）
    const chapters = await repos.chapters.findByDocument(documentId, { includeContent: true })
    const samples = this.sampleChapters(chapters)
    if (samples.length === 0) return null
    // BRAIN_LLM_MAX_TOKENS（review M5）：推理型模型的思考计入输出预算，400 会直接
    // 耗尽成空文本 → 画像永不识别、每次消化白烧一次探测
    const raw = await this.llm({
      system: PROFILE_SYSTEM,
      user: buildProfileUser(samples),
      maxTokens: BRAIN_LLM_MAX_TOKENS
    })
    const parsed = extractJsonFromResponse(raw) as { contentType?: string; genre?: string }
    const profile = normalizeProfile({
      contentType: parsed.contentType as KbBrainProfile['contentType'],
      genre: typeof parsed.genre === 'string' ? parsed.genre : undefined
    })
    return profile.contentType ? profile : null
  }

  /** 均匀采样：摘要优先，无摘要用正文开头；不足 3 章摘要时混入正文样本增强信号 */
  private sampleChapters(
    chapters: Array<{ title: string; content: string | null; summary: string | null }>
  ): string[] {
    const usable = chapters.filter(c => (c.summary ?? '').trim() || (c.content ?? '').trim())
    if (usable.length === 0) return []
    const step = Math.max(1, Math.ceil(usable.length / PROFILE_SAMPLE_MAX))
    const picked: Array<{ title: string; content: string | null; summary: string | null }> = []
    for (let i = 0; i < usable.length && picked.length < PROFILE_SAMPLE_MAX; i += step)
      picked.push(usable[i])
    const summaryCount = picked.filter(c => (c.summary ?? '').trim()).length
    return picked.map(c => {
      const summary = (c.summary ?? '').trim()
      const content = (c.content ?? '').trim()
      // 摘要覆盖率低且本章无摘要 → 用正文开头补信号
      if (summary && (summaryCount >= 3 || !content))
        return `《${c.title}》：${summary.slice(0, SAMPLE_SUMMARY_CHARS)}`
      return `《${c.title}》：${content.slice(0, SAMPLE_CONTENT_CHARS)}`
    })
  }
}
