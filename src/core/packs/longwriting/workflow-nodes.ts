/**
 * 长文写作业务包贡献的工作流节点 handler
 * @module core/packs/longwriting/workflow-nodes
 *
 * 分层归属（2026-09-18）：业务专用节点不属于平台引擎——实现放本包，
 * 由 longwritingPack activate 时经 registerPackNodeHandlers() 注册
 * （boot 序保证先于工作流子系统装配与一致性自检）。目录元数据
 * （internal: true 条目）仍在 shared 的 NODE_TYPE_CATALOG，供运行图
 * 回放/变量提示/图校验使用；编辑器面板不展示，用户不可拖入。
 *
 * 章法执行逻辑复用 chapter-writing-executor（与研讨室主编工具
 * lw_write_chapter_full 同一实现——两条触发路径，同一章法，行为一致）。
 */

import type { WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'
import { stringifyValue } from '@core/platform/workflow/engine/variable-resolver'

/**
 * 章节写作章法节点（长文写作 × 工作流）
 *
 * 用户意见（2026-09-15）：agent 不能保证百分百指令遵循——多步章法不能依赖
 * LLM 逐步自觉调用工具。本节点把章法五步（设计卡→自检→出场实体→一致性门禁→
 * 写正文）作为确定性代码由工作流引擎强制调度：触发即执行、失败即停在具体步骤、
 * 步骤状态进 run 记录可审计。
 */
const chapterWritingNode: WorkflowNodeHandler = {
  type: 'chapter-writing',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'chapterId', type: 'string', desc: '正文版本 id' },
    { key: 'wordCount', type: 'number', desc: '正文字数' },
    { key: 'review', type: 'json', desc: '设计卡自检结果 { ok, issues }' },
    { key: 'postCheck', type: 'json', desc: '写后一致性检查 { passed, report }' },
    { key: 'note', type: 'string', desc: '写后检查备注（通过/新疑点摘要）' },
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
      eventId?: string
      targetWords?: number | string
      style?: string
      extraPrompt?: string
    }
    const projectId = stringifyValue(cfg.projectId ?? '')
    const outlineId = stringifyValue(cfg.outlineId ?? '')
    if (!projectId) return { status: 'failed', error: '缺少 projectId' }
    if (!outlineId) return { status: 'failed', error: '缺少 outlineId' }
    // 工作流模板传参是字符串（'true'/'false'）——不能直接真值判断
    const overwrite = cfg.overwrite === true || stringifyValue(cfg.overwrite ?? '') === 'true'
    // W1.2 真取消：UI eventId 穿透（空=执行器回退自造 id，不可远程中止）
    const eventId = stringifyValue(cfg.eventId ?? '').trim() || undefined
    // W1.1 参数贯通：目标字数经模板解析可能是 string/undefined——防御转数字；
    // 空 = 交由执行器回退大纲预估字数（显式参数 > estimatedWords > 默认）
    const numTarget = Number(cfg.targetWords)
    const targetWords = Number.isFinite(numTarget) && numTarget > 0 ? numTarget : undefined
    const style = stringifyValue(cfg.style ?? '').trim() || undefined
    const extraPrompt = stringifyValue(cfg.extraPrompt ?? '').trim() || undefined

    const { runChapterWritingMethod } = await import(
      '@core/packs/longwriting/services/chapter-writing-executor'
    )

    let outcome
    try {
      outcome = await runChapterWritingMethod({
        projectId,
        outlineId,
        overwrite,
        eventId,
        targetWords,
        style,
        extraPrompt,
        signal: ctx.signal,
        onProgress: (p) => ctx.emitProgress(-1, `${p.step}：${p.message}`),
      })
    } catch (e: any) {
      // §B（2026-09-20）：大纲/关联数据被删后残留 FK 以裸 SqliteError 冒出——翻译成人话
      if (String(e?.message || '').includes('FOREIGN KEY')) {
        return { status: 'failed', error: '该章节的大纲或关联数据已被删除，请刷新大纲后重试', retryable: false }
      }
      throw e
    }

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

    // 故事性检查（2026-09-20）：与一致性检查并列的结论项，随 run 输出透出
    const sc = outcome.data?.storyCheck
    const storyNote = sc?.ran
      ? sc.attractive
        ? `故事性检查：吸引人（${sc.verdict || '无结论'}）；钩子 ${sc.hooks.length} 处、爽点 ${sc.highlights.length} 处`
        : `故事性检查：偏弱（${sc.verdict || '无结论'}）${sc.suggestions.length ? '；建议：' + sc.suggestions.join('；') : ''}`
      : '故事性检查未运行'

    return {
      status: 'succeeded',
      output: {
        chapterId: outcome.data?.chapterId ?? '',
        wordCount: outcome.data?.wordCount ?? 0,
        review: outcome.data?.review ?? null,
        postCheck: postCheck ?? null,
        storyCheck: sc ?? null,
        note: [postNote, storyNote].filter(Boolean).join('；'),
      },
    }
  },
}

/**
 * 卷设计章法节点（2026-09-16 结构化设定方案 M1-W2）
 *
 * 与 chapter-writing 节点同构：agent 不能保证指令遵循——卷设计的多 pass
 * 生成（骨架→人物层→网格分批→整合，每 pass 过 L0 校验+修复回路）由本节点
 * 确定性执行，引擎管调度/互斥（volume-design:{projectId}:{volumeId}）/审计。
 *
 * 产物去向：校验零错误的文档经 saveDesignDraft 落草稿并自动进设计包
 * （design_doc 条目），人审沿用设计包确认面板——与对话驱动路径同一落库与
 * 审批通道，保证两条触发路径行为一致。
 */
const volumeDesignNode: WorkflowNodeHandler = {
  type: 'volume-design',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'docId', type: 'string', desc: '设计文档 id（lw_design_documents）' },
    { key: 'itemId', type: 'string', desc: '设计包条目 id' },
    { key: 'version', type: 'number', desc: '文档版本' },
    { key: 'passes', type: 'json', desc: '执行轨迹（pass 名列表，含修复轮）' },
    { key: 'repairs', type: 'number', desc: '修复轮数' },
    { key: 'threadCount', type: 'number', desc: '暗线数' },
    { key: 'gridCount', type: 'number', desc: '章节数' },
    { key: 'note', type: 'string', desc: '备注（待用户在设计包确认后落库）' },
    { key: 'error', type: 'string', desc: '失败原因（含校验错误清单）' },
  ],
  validateConfig(config) {
    const cfg = config as { projectId?: string; volumeId?: string }
    const errors: string[] = []
    if (!stringifyValue(cfg.projectId ?? '').trim()) errors.push('projectId 不能为空')
    if (!stringifyValue(cfg.volumeId ?? '').trim()) errors.push('volumeId 不能为空')
    return errors
  },
  async execute(ctx) {
    const cfg = ctx.config as {
      projectId?: string
      volumeId?: string
      title?: string
      focus?: string
      chapterFrom?: number | string
      chapterTo?: number | string
      gridBatchSize?: number | string
      maxTokens?: number | string
      providerConfigId?: string
      modelId?: string
    }
    const projectId = stringifyValue(cfg.projectId ?? '')
    const volumeId = stringifyValue(cfg.volumeId ?? '')
    if (!projectId) return { status: 'failed', error: '缺少 projectId' }
    if (!volumeId) return { status: 'failed', error: '缺少 volumeId' }
    const num = (v: number | string | undefined): number | undefined => {
      const n = Number(v)
      return Number.isFinite(n) && n > 0 ? n : undefined
    }

    // 懒 import（重服务运行期解析，降低装配期加载面）
    const { getCoreDatabaseManager } = await import('@core/database/database-manager.interface')
    const { LongWritingAIService } = await import('@core/platform/services/longwriting-ai.service')
    const { runVolumeDesignFlow } = await import(
      '@core/platform/services/longwriting/design/volume-design-flow'
    )
    const db = getCoreDatabaseManager()
    const ai = LongWritingAIService.getInstance()
    let callSeq = 0

    const outcome = await runVolumeDesignFlow(db, projectId, {
      volumeId,
      title: cfg.title ? stringifyValue(cfg.title) : undefined,
      focus: cfg.focus ? stringifyValue(cfg.focus) : undefined,
      chapterFrom: num(cfg.chapterFrom),
      chapterTo: num(cfg.chapterTo),
      gridBatchSize: num(cfg.gridBatchSize),
      maxTokens: num(cfg.maxTokens),
      onProgress: (p) => ctx.emitProgress(-1, `${p.pass}：${p.message}`),
      llm: (systemPrompt, userPrompt, maxTokens) => {
        callSeq += 1
        return ai.generateDesignPassText(
          `volume-design:${projectId}:${volumeId}:${callSeq}`,
          userPrompt,
          systemPrompt,
          maxTokens,
          cfg.providerConfigId || undefined,
          cfg.modelId || undefined,
        )
      },
    })

    if (!outcome.ok || !outcome.doc) {
      const errParts = [outcome.message || '卷设计流程失败']
      if (outcome.errors?.length) errParts.push(`校验错误 ${outcome.errors.length} 项（首 3 项：${outcome.errors.slice(0, 3).map((i) => `${i.path} ${i.message}`).join('；')}）`)
      return { status: 'failed', error: errParts.join('——'), retryable: true }
    }

    // 落草稿 + 进设计包（人审走设计包确认面板，与对话路径同一通道）
    try {
      const { saveDesignDraft } = await import(
        '@core/platform/services/longwriting/design/design-document.service'
      )
      const saved = await saveDesignDraft(db, projectId, {
        kind: 'volume',
        title: cfg.title ? stringifyValue(cfg.title) : `卷设计 ${volumeId}`,
        doc: outcome.doc,
        volumeId,
      })
      if (!saved.ok || !saved.docId) {
        return { status: 'failed', error: `生成完成但草稿保存被拒：${saved.message}`, retryable: true }
      }
      const { ensureDraftPackage, addDesignItem } = await import(
        '@core/packs/longwriting/story-room/room-design'
      )
      await ensureDraftPackage(db, projectId, { taskTitle: cfg.title ? `卷设计 · ${stringifyValue(cfg.title)}` : `卷设计 ${volumeId}` })
      const item = await addDesignItem(db, projectId, {
        kind: 'design_doc',
        label: `卷设计 · ${cfg.title ? stringifyValue(cfg.title) : volumeId}（工作流生成 v${saved.version}）`,
        payload: { docId: saved.docId, kind: 'volume', volumeId, summary: `暗线 ${outcome.doc.threads.length} · 章节 ${outcome.doc.grid.length} · ${outcome.passes.length} 次生成含 ${outcome.repairs} 轮修复` },
        note: '工作流 volume-design 节点产出；确认后分解落库',
        taskTitle: cfg.title ? `卷设计 · ${stringifyValue(cfg.title)}` : undefined,
      })
      return {
        status: 'succeeded',
        output: {
          docId: saved.docId,
          itemId: item.id,
          version: saved.version ?? 0,
          passes: outcome.passes,
          repairs: outcome.repairs,
          threadCount: outcome.doc.threads.length,
          gridCount: outcome.doc.grid.length,
          note: '草稿已入设计包，待用户确认后分解落库',
        },
      }
    } catch (e: any) {
      return { status: 'failed', error: `生成完成但入设计包失败：${e?.message || '未知异常'}`, retryable: true }
    }
  },
}

export const LONGWRITING_WORKFLOW_NODE_HANDLERS: WorkflowNodeHandler[] = [
  chapterWritingNode,
  volumeDesignNode,
]
