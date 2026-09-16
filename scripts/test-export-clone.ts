/**
 * 导出功能 IPC 可克隆性测试
 * 直接调用 service，验证返回值能否被 structuredClone（Electron IPC 用的算法）
 */
import { DataSource } from 'typeorm'
import { createDomainLearningTables } from '../src/core/database/migrations/create-domain-learning-tables'
import { DlCardRepository } from '../src/core/database/repositories/dl-card.repository'
import { DlConceptRepository } from '../src/core/database/repositories/dl-concept.repository'
import { DlProjectRepository } from '../src/core/database/repositories/dl-project.repository'
import { DlRelationRepository } from '../src/core/database/repositories/dl-relation.repository'
import { DlLessonExportService } from '../src/core/packs/domain-learning/services/dl-lesson-export.service'
import { DocumentToolsService, registerDocumentTools } from '../src/core/platform/services/document-tools/document-tools'

async function main() {
  // 内存 SQLite + 迁移
  const entities = []
  for (const imp of [
    () => import('../src/core/database/entities/domain-learning/dl-project.entity'),
    () => import('../src/core/database/entities/domain-learning/dl-concept.entity'),
    () => import('../src/core/database/entities/domain-learning/dl-relation.entity'),
    () => import('../src/core/database/entities/domain-learning/dl-mastery-log.entity'),
    () => import('../src/core/database/entities/domain-learning/dl-card.entity'),
    () => import('../src/core/database/entities/domain-learning/dl-doc.entity'),
    () => import('../src/core/database/entities/domain-learning/dl-question.entity'),
    () => import('../src/core/database/entities/domain-learning/dl-concept-log.entity'),
  ]) {
    const mod = await imp()
    entities.push(Object.values(mod)[0] as new () => object)
  }
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities, synchronize: false })
  await ds.initialize()
  await createDomainLearningTables(ds)
  console.log('[test] 迁移完成')

  const projects = new DlProjectRepository(ds)
  const concepts = new DlConceptRepository(ds)
  const cards = new DlCardRepository(ds)
  const relations = new DlRelationRepository(ds)

  // 建测试数据
  await projects.create({ id: 'p1', name: '测试空间', goal: '入门' })
  await concepts.create({ id: 'c1', projectId: 'p1', nodeType: 'concept', name: '测试概念', definitionShort: '一句话定义', mastery: 'learning' })
  await cards.create({
    id: 'card1', projectId: 'p1', conceptId: 'c1', essenceType: 'K-concept',
    sections: [{ key: 'meta', title: '本质', md: '测试内容 $E=mc^2$' }],
    works: [{ kind: '专著', title: '书A' }],
    evidenceSources: [{ kind: 'kb', title: '来源A' }],
    version: 1, status: 'draft',
  })
  await concepts.patch('c1', { cardId: 'card1' })
  console.log('[test] 测试数据就绪')

  // 无渲染器（模拟降级场景）—— Web 端无平台渲染器
  registerDocumentTools(new DocumentToolsService(null))

  const db = {
    dlProjects: projects,
    dlConcepts: concepts,
    dlCards: cards,
    dlRelations: relations,
  } as any

  const svc = new DlLessonExportService(db)

  // 测试 md 格式
  console.log('\n=== 测试 md 格式 ===')
  const mdResult = await svc.export({ spaceId: 'p1', conceptId: 'c1', format: 'md' })
  console.log('md 结果 keys:', Object.keys(mdResult))
  console.log('md 结果类型:', typeof mdResult, '可克隆?', canClone(mdResult))
  // 逐字段检查
  for (const [k, v] of Object.entries(mdResult)) {
    console.log(`  ${k}: ${typeof v} ${v instanceof Date ? 'Date!' : ''} ${Array.isArray(v) ? 'Array' : ''}`)
  }

  // 测试 image 格式（会走降级 html，因为无渲染器）
  console.log('\n=== 测试 image 格式（无渲染器→降级 html）===')
  const imgResult = await svc.export({ spaceId: 'p1', conceptId: 'c1', format: 'image' })
  console.log('image 结果 keys:', Object.keys(imgResult))
  console.log('image 实际格式:', imgResult.format)
  console.log('image 可克隆?', canClone(imgResult))
  for (const [k, v] of Object.entries(imgResult)) {
    const t = typeof v
    const extra = v instanceof Date ? 'Date!' : Array.isArray(v) ? 'Array' : ''
    const len = t === 'string' ? `(${(v as string).length} chars)` : ''
    console.log(`  ${k}: ${t} ${extra} ${len}`)
  }

  // 测试 pdf 格式
  console.log('\n=== 测试 pdf 格式（无渲染器→降级 html）===')
  const pdfResult = await svc.export({ spaceId: 'p1', conceptId: 'c1', format: 'pdf' })
  console.log('pdf 实际格式:', pdfResult.format)
  console.log('pdf 可克隆?', canClone(pdfResult))

  // 包装成 IpcResponse 测试（模拟 wrap 的输出）
  console.log('\n=== 测试 IpcResponse 包装 ===')
  const wrapped = { success: true, data: mdResult }
  console.log('IpcResponse 可克隆?', canClone(wrapped))

  await ds.destroy()
}

function canClone(obj: unknown): boolean {
  try {
    structuredClone(obj)
    return true
  } catch (e: any) {
    console.log('  ❌ 克隆失败:', e.message)
    // 找出哪个字段不可克隆
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        try {
          structuredClone(v)
        } catch (e2: any) {
          console.log(`  ❌ 字段 "${k}" 不可克隆: ${e2.message} (类型: ${typeof v}, 值: ${JSON.stringify(v)?.slice(0, 100)})`)
        }
      }
    }
    return false
  }
}

main().catch(e => { console.error('测试失败:', e); process.exit(1) })