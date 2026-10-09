/**
 * 技能蒸馏：生产缺省依赖装配（全部惰性 import，避免把平台单例拖进测试/渲染端）
 * @module core/packs/skills/services/skill-distill-defaults
 *
 * 引用面（均为平台既有设施，本模块只做形状适配，零业务逻辑）：
 * - llm       → generateCompletionText（simple-llm；purpose 区分判型/笔记/组装/修复）
 * - fetchUrl  → executeHttpFetch（SSRF 闸门/重定向过闸/超时/限长复用）+ htmlToMarkdown
 * - writePackage → SkillService.create（name 冲突自动加 -2/-3 后缀）+ references/ 落盘
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPathProvider } from '@core/interfaces/path.interface'
import type { SkillPackageDraft } from '@shared/types/skill-distill.types'
import type { SkillDistillDeps } from './skill-distill.service'

/** 技能包目录（与 SkillService.root() 同一约定：dataPath/skills/<id>/） */
function skillRoot(): string {
  return join(getPathProvider().getDataPath(), 'skills')
}

/** 落盘：SkillService.create 写 SKILL.md，references/ 卡片补写到技能包目录 */
export async function defaultWritePackage(draft: SkillPackageDraft): Promise<string> {
  const { getSkillService } = await import('@core/platform/workflow/skills/skill-registry')
  const svc = getSkillService()
  // 重名处理：模型起名撞库时自动加 -2/-3 后缀（不覆盖用户已有技能）
  let name = draft.name
  for (let i = 2; svc.get(name) && i < 100; i++) name = `${draft.name}-${i}`
  const created = svc.create({
    name,
    title: draft.title,
    description: draft.description,
    whenToUse: draft.whenToUse || undefined,
    category: draft.category || undefined,
    body: draft.body,
  })
  if (draft.references.length > 0) {
    const refDir = join(skillRoot(), created.id, 'references')
    mkdirSync(refDir, { recursive: true })
    for (const ref of draft.references) {
      writeFileSync(join(refDir, ref.filename), ref.content, 'utf-8')
    }
  }
  return created.id
}

export const defaultSkillDistillDeps: SkillDistillDeps = {
  llm: async req => {
    const { generateCompletionText } = await import('@core/platform/services/simple-llm')
    return generateCompletionText('skill-distill', req)
  },
  fetchUrl: async url => {
    const [{ executeHttpFetch }, { htmlToMarkdown }] = await Promise.all([
      import('@core/platform/workflow/nodes/http-fetch'),
      import('@core/utils/html-to-markdown'),
    ])
    const r = await executeHttpFetch(
      { method: 'GET', url, responseType: 'text', timeoutMs: 45_000 },
      AbortSignal.timeout(45_000),
    )
    if (!r.ok) throw new Error(r.error)
    const { status, body, headers } = r.output
    if (status < 200 || status >= 400) throw new Error(`HTTP ${status}`)
    const contentType = (headers['content-type'] ?? '').toLowerCase()
    // HTML 才转 markdown；已是 markdown/纯文本的响应原样保留
    return contentType.includes('html') ? htmlToMarkdown(body, url) : body
  },
  writePackage: defaultWritePackage,
}
