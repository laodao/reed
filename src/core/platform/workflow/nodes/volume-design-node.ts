/**
 * 卷设计章法节点（2026-09-16 结构化设定方案 M1-W2）
 * @module core/platform/workflow/nodes/volume-design-node
 *
 * 与 chapter-writing-node 同构：agent 不能保证指令遵循——卷设计的多 pass
 * 生成（骨架→人物层→网格分批→整合，每 pass 过 L0 校验+修复回路）由本节点
 * 确定性执行，引擎管调度/互斥（volume-design:{projectId}:{volumeId}）/审计。
 *
 * 产物去向：校验零错误的文档经 saveDesignDraft 落草稿并自动进设计包
 * （design_doc 条目），人审沿用设计包确认面板——与对话驱动路径同一落库与
 * 审批通道，保证两条触发路径行为一致。
 */

import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'

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

    // 懒 import（platform→pack/services 运行期解析，避免装配期循环依赖）
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

export const VOLUME_DESIGN_NODE_HANDLERS = [volumeDesignNode]
