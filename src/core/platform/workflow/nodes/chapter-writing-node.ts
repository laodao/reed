/**
 * 章节写作章法节点（长文写作 × 工作流）
 * @module core/platform/workflow/nodes/chapter-writing-node
 *
 * 用户意见（2026-09-15）：agent 不能保证百分百指令遵循——多步章法不能依赖
 * LLM 逐步自觉调用工具。本节点把章法五步（设计卡→自检→出场实体→一致性门禁→
 * 写正文）作为确定性代码由工作流引擎强制调度：触发即执行、失败即停在具体步骤、
 * 步骤状态进 run 记录可审计。
 *
 * 执行逻辑复用 chapter-writing-executor（与研讨室主编工具 lw_write_chapter_full
 * 同一实现——两条触发路径，同一章法，行为一致）。
 */

import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'

const chapterWritingNode: WorkflowNodeHandler = {
  type: 'chapter-writing',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'chapterId', type: 'string', desc: '正文版本 id' },
    { key: 'wordCount', type: 'number', desc: '正文字数' },
    { key: 'review', type: 'json', desc: '设计卡自检结果 { ok, issues }' },
    { key: 'postCheck', type: 'json', desc: '写后一致性检查 { passed, report }' },
    { key: 'error', type: 'string', desc: '失败原因（含自检未通过的问题清单）' },
  ],
  validateConfig(config) {
    const cfg = config as { projectId?: string; outlineId?: string }
    const errors: string[] = []
    if (!stringifyValue(cfg.projectId ?? '').trim()) errors.push('projectId 不能为空')
    if (!stringifyValue(cfg.outlineId ?? '').trim()) errors.push('outlineId 不能为空')
    return errors
  },
  async execute(ctx) {
    const cfg = ctx.config as {
      projectId?: string
      outlineId?: string
      overwrite?: boolean
      targetWords?: number
    }
    const projectId = stringifyValue(cfg.projectId ?? '')
    const outlineId = stringifyValue(cfg.outlineId ?? '')
    if (!projectId) return { status: 'failed', error: '缺少 projectId' }
    if (!outlineId) return { status: 'failed', error: '缺少 outlineId' }
    // 工作流模板传参是字符串（'true'/'false'）——不能直接真值判断
    const overwrite = cfg.overwrite === true || stringifyValue(cfg.overwrite ?? '') === 'true'

    // 懒 import 业务 pack（platform→pack 仅在运行期解析，避免装配期循环依赖）
    const { runChapterWritingMethod } = await import(
      '@core/packs/longwriting/services/chapter-writing-executor'
    )

    const outcome = await runChapterWritingMethod({
      projectId,
      outlineId,
      overwrite,
      targetWords: cfg.targetWords,
      signal: ctx.signal,
      onProgress: (p) => ctx.emitProgress(-1, `${p.step}：${p.message}`),
    })

    if (!outcome.ok) {
      const parts = [outcome.error || '章法执行失败']
      if (outcome.data?.designCard) parts.push(`——当前设计卡已留存，可据此修正方向后重试`)
      return { status: 'failed', error: parts.join(' '), retryable: false }
    }

    const postCheck = outcome.data?.postCheck
    const postNote = postCheck
      ? postCheck.passed
        ? '写后一致性检查通过'
        : `写后一致性检查发现新疑点：${postCheck.report || ''}`
      : ''

    return {
      status: 'succeeded',
      output: {
        chapterId: outcome.data?.chapterId ?? '',
        wordCount: outcome.data?.wordCount ?? 0,
        review: outcome.data?.review ?? null,
        postCheck: postCheck ?? null,
        note: postNote,
      },
    }
  },
}

export const CHAPTER_WRITING_NODE_HANDLERS = [chapterWritingNode]
