/**
 * 领域学习「单篇讲义导出」服务（2026-09-15 用户需求：知识点正文导出 md/PDF/长图）
 * @module packs/domain-learning/services/dl-lesson-export
 *
 * 职责边界：
 *  - 本服务只做「取数 + 组装 + 调平台文档工具 + 打包返回值」；
 *  - markdown 正文拼装是纯规则（rules/learning-lesson-export.rules）；
 *  - PDF/长图渲染是平台能力（core/platform/services/document-tools，Electron 隐藏窗口 /
 *    Web 降级 HTML）——严禁在业务包里自建渲染。
 *
 * 双端一致：md 双端同源；pdf/image 在无平台渲染器时降级为排版 HTML（Web 端前端打印）。
 */

import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { getDocumentTools } from '@core/platform/services/document-tools/document-tools'
import { DOCUMENT_TEMPLATES } from '@core/platform/services/document-tools/templates'
import { createLogger } from '@core/utils/logger'
import { buildLessonMarkdown, lessonExportFilename } from '../rules/learning-lesson-export.rules'
import { declaredPrereqsOf } from '../rules/learning-prerequisites.rules'
import { PREREQUISITE_TYPE } from '@core/database/repositories/dl-relation.repository'
import type { DlCardRow } from '@core/database/repositories/dl-card.repository'
import type { DlLessonExportFormat, DlLessonExportResult } from '@shared/types/domain-learning.types'

const logger = createLogger('DlLessonExport')

const MIME: Record<'md' | 'pdf' | 'image' | 'html', string> = {
  md: 'text/markdown;charset=utf-8',
  pdf: 'application/pdf',
  image: 'image/png',
  html: 'text/html;charset=utf-8',
}

/** 本地时间戳文案（导出元信息用；纯展示，不参与业务判断） */
export function formatExportStamp(at: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}:${p(at.getMinutes())}`
}

export interface DlLessonExportInput {
  spaceId: string
  conceptId: string
  format: DlLessonExportFormat
  /** 指定讲义版本（缺省 = 当前版）；版本历史里"导出这一版"用 */
  cardId?: string | null
  /** 导出时间（缺省 now；注入便于测试与稳定文案） */
  now?: Date
}

export class DlLessonExportService {
  constructor(private readonly db: ICoreDatabaseManager) {}

  async export(input: DlLessonExportInput): Promise<DlLessonExportResult> {
    const { spaceId, conceptId, format } = input
    const project = await this.db.dlProjects?.getById(spaceId)
    if (!project) throw new Error('学习空间不存在')
    const concept = await this.db.dlConcepts?.getById(conceptId)
    if (!concept || concept.projectId !== spaceId) throw new Error('知识点不存在于该空间')
    if (concept.nodeType === 'group') throw new Error('目录节点没有讲义正文，无法导出——请选择知识点')

    const card = await this.resolveCard(spaceId, conceptId, input.cardId ?? null)
    if (!card) throw new Error('该知识点还没有讲义——先研究生成讲义再导出')

    const rels = (await this.db.dlRelations?.listByProject(spaceId)) ?? []
    const prereqs = rels
      .filter((r) => r.relationType === PREREQUISITE_TYPE && r.targetId === conceptId)
      .map((r) => r.sourceId)
    // 前置名解析（关系边只存 id；用空间内概念补齐名字，缺失则回落 id）
    const allConcepts = (await this.db.dlConcepts?.listByProject(spaceId)) ?? []
    const nameOf = new Map(allConcepts.map((c) => [c.id, c.name]))
    const prereqNames = prereqs.map((id) => nameOf.get(id) ?? id)

    const markdown = buildLessonMarkdown({
      concept: {
        name: concept.name,
        nodeType: concept.nodeType,
        en: concept.en,
        desc: concept.definitionShort,
        mastery: concept.mastery,
        prereqs: prereqNames,
        declaredPrereqs: declaredPrereqsOf({
          id: concept.id,
          name: concept.name,
          nodeType: concept.nodeType,
          attrs: concept.attrs,
        }),
      },
      card: {
        essenceType: card.essenceType,
        sections: card.sections,
        works: card.works,
        evidenceSources: card.evidenceSources,
        version: card.version,
        status: card.status,
      },
      context: {
        spaceName: project.name,
        goal: project.goal,
        exportedAtLabel: formatExportStamp(input.now ?? new Date()),
      },
    })

    const base = {
      conceptId,
      conceptName: concept.name,
      spaceName: project.name,
      version: card.version,
    }

    if (format === 'md') {
      logger.info(`[export] md space=${spaceId} concept=${conceptId} v${card.version} len=${markdown.length}`)
      return {
        ...base,
        format: 'md',
        filename: lessonExportFilename({
          spaceName: project.name,
          conceptName: concept.name,
          version: card.version,
          ext: 'md',
        }),
        mime: MIME.md,
        markdown,
      }
    }

    const tools = getDocumentTools()
    const renderInput = {
      markdown,
      title: concept.name,
      template: DOCUMENT_TEMPLATES.learningLesson,
      // 讲义含 KaTeX 公式与 mermaid 图：导出必须渲染，否则正文成了 `$…$` 原文
      enhance: { math: true, mermaid: true },
    }
    const rendered =
      format === 'pdf' ? await tools.renderPdf(renderInput) : await tools.renderImage(renderInput)
    // 平台渲染器本服务只用到 renderPdf/renderImage，产出必为 pdf/image，
    // 无渲染器（Web）时降级 html——docx 不在单篇讲义导出能力内。
    // 这里显式收窄，避免 DocumentOutputFormat 的 'docx' 混进导出结果契约。
    const produced: 'pdf' | 'image' | 'html' =
      rendered.format === 'pdf' ? 'pdf' : rendered.format === 'image' ? 'image' : 'html'
    const ext = produced === 'pdf' ? 'pdf' : produced === 'image' ? 'png' : 'html'
    const filename = lessonExportFilename({
      spaceName: project.name,
      conceptName: concept.name,
      version: card.version,
      ext,
    })
    logger.info(
      `[export] ${format}→${produced} space=${spaceId} concept=${conceptId} v${card.version} bytes=${rendered.buffer.length}`,
    )
    if (produced === 'html') {
      // Web 端无平台渲染器：给排版 HTML，由前端打印/另存（与工作流长图节点同一降级口径）
      return {
        ...base,
        format: 'html',
        filename,
        mime: MIME.html,
        html: rendered.buffer.toString('utf-8'),
        markdown,
      }
    }
    return {
      ...base,
      format: produced,
      filename,
      mime: MIME[produced],
      contentBase64: rendered.buffer.toString('base64'),
    }
  }

  /** 解析导出所用讲义：指定 cardId（须属于本概念）优先，否则当前版 */
  private async resolveCard(
    spaceId: string,
    conceptId: string,
    cardId: string | null,
  ): Promise<DlCardRow | null> {
    if (cardId) {
      const row = await this.db.dlCards?.getById(cardId)
      if (!row || row.projectId !== spaceId || row.conceptId !== conceptId) {
        throw new Error('指定的讲义版本不存在或不属于该知识点')
      }
      return row
    }
    const concept = await this.db.dlConcepts?.getById(conceptId)
    if (concept?.cardId) {
      const row = await this.db.dlCards?.getById(concept.cardId)
      if (row && row.projectId === spaceId) return row
    }
    return (await this.db.dlCards?.getCurrentByConcept(spaceId, conceptId)) ?? null
  }
}