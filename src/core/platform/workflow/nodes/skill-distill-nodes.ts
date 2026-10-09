/**
 * 技能蒸馏节点（skill-distill：内容 → 生成技能包落盘技能库）
 * @module core/platform/workflow/nodes/skill-distill-nodes
 * @description SkillDistillService 的薄适配：execute() 同步跑两遍流水线（逐块笔记 →
 *              只凭笔记组装 → 确定性审计 → 修复环 → 落盘），快照进度映射到
 *              ctx.emitProgress，取消信号在 LLM 调用间隙生效。与 skill-call 的差异：
 *              skill-call 是"调用已有技能"，本节点是"生产新技能"——产物直接进技能库，
 *              供后续 skill-call / 模型调用（如博主蒸馏工作流的末端工序）。
 */

import { stringifyValue } from '../engine/variable-resolver'
import { getSkillDistillService } from '../skills/skill-distill-registry'
import { defaultSkillDistillDeps } from '../skills/skill-distill-defaults'
import { SkillDistillService } from '../skills/skill-distill.service'
import type { SkillDistillRequest } from '@shared/types/skill-distill.types'
import { SKILL_DISTILL_CONTENT_TYPES } from '@shared/types/skill-distill.types'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'

const CONTENT_TYPES = new Set<string>(['auto', ...SKILL_DISTILL_CONTENT_TYPES])

const skillDistillNode: WorkflowNodeHandler = {
  type: 'skill-distill',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'skillId', type: 'string', desc: '蒸馏产物技能 id（=技能库目录名）' },
    { key: 'skillName', type: 'string', desc: '技能展示名' },
    { key: 'description', type: 'string', desc: '技能描述（做什么+何时用）' },
    { key: 'detectedType', type: 'string', desc: '判型结果：methodology/style/persona' },
    { key: 'issues', type: 'json', desc: '审计问题清单（error 已修复，warn 放行展示）' },
    { key: 'stats', type: 'json', desc: '过程统计 { chunksTotal, chunksDone, llmCalls, sourceChars, notesChars, outputChars, repairPasses }' },
  ],
  validateConfig(config) {
    const cfg = config as { sourceText?: string; contentType?: string }
    const errors: string[] = []
    if (!cfg.sourceText || stringifyValue(cfg.sourceText).trim() === '') {
      errors.push('待蒸馏内容（sourceText）为空')
    }
    if (cfg.contentType && !CONTENT_TYPES.has(cfg.contentType)) {
      errors.push(`蒸馏目标必须是 auto/methodology/style/persona（当前：${cfg.contentType}）`)
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    try {
      return await this.doExecute(ctx)
    } catch (e) {
      // LLM 调用/解析失败多为临时性，标 retryable 供引擎重试
      return { status: 'failed', error: `技能蒸馏失败: ${e instanceof Error ? e.message : String(e)}`, retryable: true }
    }
  },

  async doExecute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      sourceText: string
      contentType?: 'auto' | 'methodology' | 'style' | 'persona'
      hints?: string
      nameHint?: string
      providerConfigId?: string
      modelId?: string
    }

    const request: SkillDistillRequest = {
      inputType: 'text',
      text: stringifyValue(cfg.sourceText),
      contentType: cfg.contentType || 'auto',
      hints: cfg.hints ? stringifyValue(cfg.hints) : undefined,
      nameHint: cfg.nameHint ? stringifyValue(cfg.nameHint) : undefined,
    }

    // 节点配了模型时按次装配（覆盖默认 Provider 回退链）；否则用注册器共享单例
    let runner = getSkillDistillService()
    if (cfg.providerConfigId || cfg.modelId) {
      runner = new SkillDistillService({
        ...defaultSkillDistillDeps,
        llm: async req => {
          const { generateCompletionText } = await import('@core/platform/services/simple-llm')
          return generateCompletionText('skill-distill-node', req, {
            providerConfigId: cfg.providerConfigId || undefined,
            modelId: cfg.modelId || undefined,
          })
        },
      })
    }

    // 快照进度映射（-1 保护：service 快照恒 0-100，直接透传）；取消在 LLM 调用间隙生效
    const snap = await runner.execute(request, {
      signal: ctx.signal,
      onProgress: s => ctx.emitProgress(s.progress, s.message),
    })

    if (snap.status === 'cancelled') {
      return { status: 'failed', error: '技能蒸馏已取消', retryable: false }
    }
    if (snap.status !== 'done' || !snap.resultSkillId) {
      return { status: 'failed', error: snap.error ?? '技能蒸馏未产出技能', retryable: true }
    }
    ctx.emitProgress(100, snap.message)
    return {
      status: 'succeeded',
      output: {
        skillId: snap.resultSkillId,
        skillName: snap.resultSkillName ?? snap.resultSkillId,
        description: snap.resultSkillDescription ?? '',
        detectedType: snap.detectedType ?? '',
        issues: snap.issues,
        stats: snap.stats,
      },
    }
  },
}

export const SKILL_DISTILL_NODE_HANDLERS: WorkflowNodeHandler[] = [skillDistillNode]
