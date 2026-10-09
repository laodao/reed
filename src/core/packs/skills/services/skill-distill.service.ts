/**
 * 技能蒸馏服务（内容 → Skill 两遍流水线编排）
 * @module core/packs/skills/services/skill-distill.service
 *
 * 流水线：准备（清洗/分块）→ 判型（auto 时）→ 逐块笔记（第一遍：唯一看原文的环节，
 * provenance 在此时附着）→ 组装（第二遍：只看笔记）→ 确定性审计 → 修复（≤2 轮）→ 落盘。
 *
 * 纪律：
 * - 依赖全注入（llm/fetchUrl/writePackage/newId），测试零成本（照搬 ic-deps 纪律）；
 * - 任务注册表在内存（进程级）：技能库页轮询展示；产物本身落盘持久，任务历史不持久化；
 * - 诚实失败：审计 error 修复 2 轮不过就 failed 并带回问题清单，绝不静默降质放行；
 * - 取消在 LLM 调用间隙生效（调用中不打断，避免半截 JSON）。
 */

import { randomUUID } from 'node:crypto'
import { parseJsonObject } from '@shared/utils/info-collection-json'
import {
  auditHasErrors,
  auditSkillPackage,
  chunkSourceText,
  clampSourceText,
  normalizeSkillPackageDraft,
  sanitizeSourceText,
} from '@shared/utils/skill-distill'
import type { SourceChunk } from '@shared/utils/skill-distill'
import {
  SKILL_DISTILL_NOTES_BUDGET_CHARS,
  SKILL_DISTILL_SOURCE_MAX_CHARS,
} from '@shared/types/skill-distill.types'
import type {
  SkillDistillIssue,
  SkillDistillRequest,
  SkillDistillTaskSnapshot,
  SkillPackageDraft,
} from '@shared/types/skill-distill.types'
import { SKILL_DISTILL_CONTENT_TYPES } from '@shared/types/skill-distill.types'
import type { SkillDistillContentType } from '@shared/types/skill-distill.types'
import {
  buildAssembleSystem,
  buildAssembleUser,
  buildDetectSystem,
  buildDetectUser,
  buildNotesSystem,
  buildNotesUser,
  buildRepairSystem,
  buildRepairUser,
} from './skill-distill.prompts'

/** 单轮文本 LLM（与 IcLlmFn 同形） */
export type DistillLlmFn = (req: { system: string; user: string; maxTokens?: number }) => Promise<string>

export interface SkillDistillDeps {
  llm: DistillLlmFn
  /** URL → 正文文本（HTML 自动转 markdown）；未注入 = URL 输入不可用 */
  fetchUrl?: (url: string) => Promise<string>
  /** 落盘技能包 → 技能 id（缺省接 SkillService：create + references/ 落盘） */
  writePackage?: (draft: SkillPackageDraft) => Promise<string>
  /** id 生成（缺省 crypto.randomUUID）；测试注入确定性序列 */
  newId?: (prefix: string) => string
}

interface InternalTask {
  snapshot: SkillDistillTaskSnapshot
  cancelRequested: boolean
}

const MAX_REPAIR_PASSES = 2
const NOTES_MAX_TOKENS = 4_000
const ASSEMBLE_MAX_TOKENS = 16_000
const DETECT_MAX_TOKENS = 500

export class SkillDistillService {
  private tasks = new Map<string, InternalTask>()

  constructor(private deps: SkillDistillDeps) {}

  // ==================== 对外 API（IPC 用） ====================

  createTask(req: SkillDistillRequest): SkillDistillTaskSnapshot {
    this.validateRequest(req)
    const id = (this.deps.newId ?? (p => `${p}_${randomUUID()}`))('distill')
    const now = new Date().toISOString()
    const task: InternalTask = {
      cancelRequested: false,
      snapshot: {
        id,
        status: 'running',
        stage: 'queued',
        progress: 0,
        message: '排队中',
        contentType: req.contentType,
        stats: { chunksTotal: 0, chunksDone: 0, llmCalls: 0, sourceChars: 0, notesChars: 0, outputChars: 0, repairPasses: 0 },
        issues: [],
        createdAt: now,
      },
    }
    this.tasks.set(id, task)
    // 异步执行，进度经轮询可见（结构化克隆限制：不把 Promise 交给 IPC）
    void this.run(task, req).catch(() => {/* run 内部已兜底置 failed */})
    return { ...task.snapshot }
  }

  getTask(id: string): SkillDistillTaskSnapshot | null {
    const t = this.tasks.get(id)
    return t ? { ...t.snapshot } : null
  }

  listTasks(): SkillDistillTaskSnapshot[] {
    return [...this.tasks.values()]
      .map(t => ({ ...t.snapshot }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
  }

  cancelTask(id: string): void {
    const t = this.tasks.get(id)
    if (!t) throw new Error(`蒸馏任务 ${id} 不存在`)
    if (t.snapshot.status === 'running') {
      t.cancelRequested = true
      t.snapshot.message = '取消中（等待当前 LLM 调用返回）…'
    }
  }

  // ==================== 流水线 ====================

  private validateRequest(req: SkillDistillRequest): void {
    if (req.inputType === 'text') {
      if (!req.text?.trim()) throw new Error('源内容为空：请粘贴文本、选择本地文件或填入网页链接')
    } else if (req.inputType === 'url') {
      if (!req.url?.trim()) throw new Error('网页链接为空')
      if (!/^https?:\/\//i.test(req.url.trim())) throw new Error('仅支持 http(s) 网页链接')
      if (!this.deps.fetchUrl) throw new Error('URL 抓取通道未启用')
    } else {
      throw new Error(`不支持的输入形态：${req.inputType}`)
    }
    if (req.contentType !== 'auto' && !SKILL_DISTILL_CONTENT_TYPES.includes(req.contentType)) {
      throw new Error(`不支持的蒸馏类型：${req.contentType}`)
    }
  }

  private update(task: InternalTask, patch: Partial<SkillDistillTaskSnapshot>): void {
    Object.assign(task.snapshot, patch)
  }

  private throwIfCancelled(task: InternalTask): void {
    if (task.cancelRequested) throw new CancelledError()
  }

  private async run(task: InternalTask, req: SkillDistillRequest): Promise<void> {
    try {
      // ── 准备：取源文本 + 清洗 + 分块 ──
      this.update(task, { stage: 'preparing', progress: 4, message: req.inputType === 'url' ? '抓取网页…' : '清洗源内容…' })
      const raw = req.inputType === 'url' ? await this.fetchSourceUrl(req.url!.trim()) : req.text!
      const { text: source, truncated } = clampSourceText(sanitizeSourceText(raw))
      if (!source.trim()) throw new Error('源内容为空（网页抓取结果无正文）')
      const chunks = chunkSourceText(source)
      this.update(task, {
        progress: 10,
        message: truncated
          ? `源内容超 ${SKILL_DISTILL_SOURCE_MAX_CHARS} 字已截断；共 ${chunks.length} 块`
          : `源内容 ${source.length} 字，共 ${chunks.length} 块`,
        stats: { ...task.snapshot.stats, sourceChars: source.length, chunksTotal: chunks.length },
      })

      // ── 判型（auto）──
      let contentType: SkillDistillContentType
      if (req.contentType === 'auto') {
        this.throwIfCancelled(task)
        this.update(task, { stage: 'detecting', progress: 12, message: '正在判断内容类型…' })
        contentType = await this.detectType(source)
        this.update(task, {
          detectedType: contentType,
          progress: 16,
          message: `判型：${contentType === 'methodology' ? '方法论/知识' : contentType === 'style' ? '写作风格' : '人物人设'}`,
          stats: { ...task.snapshot.stats, llmCalls: task.snapshot.stats.llmCalls + 1 },
        })
      } else {
        contentType = req.contentType
      }

      // ── 第一遍：逐块笔记 ──
      this.update(task, { stage: 'noting', progress: 18, message: '开始阅读笔记（第一遍）…' })
      const notes: Array<Record<string, unknown>> = []
      for (const chunk of chunks) {
        this.throwIfCancelled(task)
        this.update(task, { message: `正在阅读第 ${chunk.index + 1}/${chunks.length} 块${chunk.title ? `（${chunk.title}）` : ''}…` })
        const note = await this.noteChunk(contentType, chunk)
        // chunk 序号由服务盖章（不信任模型自报），组装端可按块溯源
        notes.push({ ...note, chunk: chunk.index })
        this.update(task, {
          progress: 18 + Math.round(((chunk.index + 1) / chunks.length) * 50),
          stats: {
            ...task.snapshot.stats,
            chunksDone: chunk.index + 1,
            llmCalls: task.snapshot.stats.llmCalls + 1,
            notesChars: task.snapshot.stats.notesChars + JSON.stringify(note).length,
          },
        })
      }

      // ── 第二遍：组装 ──
      this.throwIfCancelled(task)
      this.update(task, { stage: 'assembling', progress: 72, message: '正在组装技能包（第二遍，只看笔记）…' })
      let draft = await this.assemble(contentType, notes, req, source.length, chunks.length)
      this.update(task, {
        progress: 84,
        stats: { ...task.snapshot.stats, llmCalls: task.snapshot.stats.llmCalls + 1, outputChars: draft.body.length + draft.references.reduce((n, r) => n + r.content.length, 0) },
      })

      // ── 审计 + 修复环 ──
      const audit = (): SkillDistillIssue[] => auditSkillPackage(draft, { sourceText: source, fallbackName: draft.name })
      let issues = audit()
      this.update(task, { stage: 'auditing', progress: 86, message: `审计完成：${issues.filter(i => i.level === 'error').length} 个 error / ${issues.filter(i => i.level === 'warn').length} 个 warn`, issues })
      while (auditHasErrors(issues) && task.snapshot.stats.repairPasses < MAX_REPAIR_PASSES) {
        this.throwIfCancelled(task)
        const pass = task.snapshot.stats.repairPasses + 1
        this.update(task, { stage: 'repairing', progress: 88 + pass * 3, message: `第 ${pass} 轮修复（${issues.filter(i => i.level === 'error').length} 个 error）…` })
        draft = await this.repair(contentType, draft, issues)
        issues = audit()
        this.update(task, {
          stats: { ...task.snapshot.stats, repairPasses: pass, llmCalls: task.snapshot.stats.llmCalls + 1 },
          issues,
        })
      }
      if (auditHasErrors(issues)) {
        // 诚实失败：把问题清单交还用户，而不是带伤上库
        throw new Error(`蒸馏产物审计未通过（${issues.filter(i => i.level === 'error').length} 个 error）：${issues.filter(i => i.level === 'error').map(i => i.message).join('；')}`)
      }

      // ── 落盘 ──
      this.throwIfCancelled(task)
      this.update(task, { stage: 'writing', progress: 96, message: '写入技能库…' })
      const skillId = await (this.deps.writePackage ?? (() => { throw new Error('落盘通道未注入') }))(draft)
      this.update(task, {
        stage: 'done',
        status: 'done',
        progress: 100,
        message: `已生成技能「${draft.title}」（${skillId}）`,
        resultSkillId: skillId,
        resultSkillName: draft.title,
        finishedAt: new Date().toISOString(),
      })
    } catch (e) {
      if (e instanceof CancelledError) {
        this.update(task, { status: 'cancelled', stage: 'cancelled', message: '已取消', finishedAt: new Date().toISOString() })
        return
      }
      const message = e instanceof Error ? e.message : String(e)
      this.update(task, { status: 'failed', stage: 'failed', error: message, message, finishedAt: new Date().toISOString() })
    }
  }

  private async fetchSourceUrl(url: string): Promise<string> {
    try {
      return await this.deps.fetchUrl!(url)
    } catch (e) {
      throw new Error(`网页抓取失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 从 LLM 输出解析 JSON；失败抛中文错误（响亮失败，不静默造空产物） */
  private parseLlmJson(text: string, what: string): Record<string, unknown> {
    const parsed = parseJsonObject(text)
    if (!parsed) throw new Error(`${what}：模型输出无法解析为 JSON（len=${text?.length ?? 0}），请重试`)
    return parsed
  }

  private async detectType(source: string): Promise<SkillDistillContentType> {
    const sample = source.slice(0, 4_000)
    // 判型是廉价辅助步：两次解析失败降级为 methodology 并继续（不让判型失败拖死整条流水线）
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await this.deps.llm({ system: buildDetectSystem(), user: buildDetectUser(sample), maxTokens: DETECT_MAX_TOKENS })
        const parsed = this.parseLlmJson(text, '内容判型')
        const t = String(parsed.contentType ?? '')
        if (SKILL_DISTILL_CONTENT_TYPES.includes(t as SkillDistillContentType)) return t as SkillDistillContentType
      } catch {
        /* 重试或降级 */
      }
    }
    return 'methodology'
  }

  /** 单块笔记；解析失败重试一次（模型偶发围栏/前后缀抖动），再失败响亮报错 */
  private async noteChunk(contentType: SkillDistillContentType, chunk: SourceChunk): Promise<Record<string, unknown>> {
    const system = buildNotesSystem(contentType)
    const user = buildNotesUser({
      chunkIndex: chunk.index,
      chunkTitle: chunk.title,
      text: chunk.text,
      budgetChars: SKILL_DISTILL_NOTES_BUDGET_CHARS,
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await this.deps.llm({ system, user, maxTokens: NOTES_MAX_TOKENS })
      const parsed = parseJsonObject(text)
      if (parsed) return parsed
    }
    throw new Error(`块#${chunk.index} 阅读笔记解析失败：模型连续两次未输出合法 JSON`)
  }

  private async assemble(
    contentType: SkillDistillContentType,
    notes: Array<Record<string, unknown>>,
    req: SkillDistillRequest,
    sourceChars: number,
    chunkCount: number,
  ): Promise<SkillPackageDraft> {
    const text = await this.deps.llm({
      system: buildAssembleSystem(contentType),
      user: buildAssembleUser({
        contentType,
        notesJson: JSON.stringify(notes, null, 1),
        hints: req.hints,
        sourceChars,
        chunkCount,
      }),
      maxTokens: ASSEMBLE_MAX_TOKENS,
    })
    const parsed = this.parseLlmJson(text, '技能组装')
    const draft = normalizeSkillPackageDraft(parsed, { fallbackName: fallbackNameFor(), contentType })
    if (!draft.body.trim()) throw new Error('技能组装失败：模型未产出正文')
    return draft
  }

  private async repair(contentType: SkillDistillContentType, draft: SkillPackageDraft, issues: SkillDistillIssue[]): Promise<SkillPackageDraft> {
    const text = await this.deps.llm({
      system: buildRepairSystem(contentType),
      user: buildRepairUser({
        draftJson: JSON.stringify(draft, null, 1),
        issuesJson: JSON.stringify(issues, null, 1),
      }),
      maxTokens: ASSEMBLE_MAX_TOKENS,
    })
    const parsed = this.parseLlmJson(text, '技能修复')
    const repaired = normalizeSkillPackageDraft(parsed, { fallbackName: draft.name, contentType })
    // 修复不许把产物修没：正文/卡片全空视为修复失败，保留原稿继续下一轮或诚实失败
    if (!repaired.body.trim()) throw new Error('技能修复失败：模型未产出正文')
    return repaired
  }
}

class CancelledError extends Error {
  constructor() {
    super('cancelled')
  }
}

function fallbackNameFor(): string {
  const stamp = Date.now().toString(36)
  return `distilled-${stamp}`
}
