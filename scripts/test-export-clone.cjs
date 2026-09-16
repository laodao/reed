/**
 * 导出功能 IPC 可克隆性测试（在 Electron Node 环境下运行）
 */
const { DataSource } = require('typeorm')

async function main() {
  const { createDomainLearningTables } = require('./src/core/database/migrations/create-domain-learning-tables')
  const { DlCardRepository } = require('./src/core/database/repositories/dl-card.repository')
  const { DlConceptRepository } = require('./src/core/database/repositories/dl-concept.repository')
  const { DlProjectRepository } = require('./src/core/database/repositories/dl-project.repository')
  const { DlRelationRepository } = require('./src/core/database/repositories/dl-relation.repository')
  const { DlLessonExportService } = require('./src/core/packs/domain-learning/services/dl-lesson-export.service')
  const { DlLessonVersionService } = require('./src/core/packs/domain-learning/services/dl-lesson-version.service')
  const { DocumentToolsService, registerDocumentTools } = require('./src/core/platform/services/document-tools/document-tools')

  // 内存 SQLite + 迁移
  const entities = []
  for (const p of [
    './src/core/database/entities/domain-learning/dl-project.entity',
    './src/core/database/entities/domain-learning/dl-concept.entity',
    './src/core/database/entities/domain-learning/dl-relation.entity',
    './src/core/database/entities/domain-learning/dl-mastery-log.entity',
    './src/core/database/entities/domain-learning/dl-card.entity',
    './src/core/database/entities/domain-learning/dl-doc.entity',
    './src/core/database/entities/domain-learning/dl-question.entity',
    './src/core/database/entities/domain-learning/dl-concept-log.entity',
  ]) {
    const mod = require(p)
    entities.push(Object.values(mod)[0])
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

  // 无渲染器（模拟 Web 降级）
  registerDocumentTools(new DocumentToolsService(null))

  const db = { dlProjects: projects, dlConcepts: concepts, dlCards: cards, dlRelations: relations }
  const svc = new DlLessonExportService(db)

  // === 测试 md ===
  console.log('\n=== 测试 md ===')
  const md = await svc.export({ spaceId: 'p1', conceptId: 'c1', format: 'md' })
  console.log('keys:', Object.keys(md))
  for (const [k, v] of Object.entries(md)) {
    console.log(`  ${k}: ${typeof v}${v instanceof Date ? ' [Date!]' : ''}${Array.isArray(v) ? ' [Array]' : ''}`)
  }
  console.log('可克隆?', canClone(md))

  // === 测试 image（降级 html）===
  console.log('\n=== 测试 image → html ===')
  const img = await svc.export({ spaceId: 'p1', conceptId: 'c1', format: 'image' })
  console.log('format:', img.format)
  for (const [k, v] of Object.entries(img)) {
    console.log(`  ${k}: ${typeof v}${v instanceof Date ? ' [Date!]' : ''}${typeof v === 'string' ? ` (${v.length} chars)` : ''}`)
  }
  console.log('可克隆?', canClone(img))

  // === 测试 pdf ===
  console.log('\n=== 测试 pdf → html ===')
  const pdf = await svc.export({ spaceId: 'p1', conceptId: 'c1', format: 'pdf' })
  console.log('format:', pdf.format)
  console.log('可克隆?', canClone(pdf))

  // === 测试版本服务 ===
  console.log('\n=== 版本服务 listVersions ===')
  const vsvc = new DlLessonVersionService(db)
  const list = await vsvc.listVersions('p1', 'c1')
  console.log('list 类型:', typeof list, Array.isArray(list) ? 'Array' : '')
  for (const item of list) {
    for (const [k, v] of Object.entries(item)) {
      console.log(`  ${k}: ${typeof v}${v instanceof Date ? ' [Date!]' : ''}`)
    }
  }
  console.log('list 可克隆?', canClone(list))

  console.log('\n=== 版本服务 getVersion ===')
  const card = await vsvc.getVersion('p1', 'card1')
  if (card) {
    for (const [k, v] of Object.entries(card)) {
      console.log(`  ${k}: ${typeof v}${v instanceof Date ? ' [Date!]' : ''}${Array.isArray(v) ? ' [Array]' : ''}`)
    }
    console.log('card 可克隆?', canClone(card))
  }

  await ds.destroy()
}

function canClone(obj) {
  try {
    structuredClone(obj)
    return true
  } catch (e) {
    console.log('  ❌ 克隆失败:', e.message)
    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          try { structuredClone(obj[i]) } catch (e2) { console.log(`  ❌ [${i}] 不可克隆:`, e2.message) }
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          try { structuredClone(v) } catch (e2) { console.log(`  ❌ 字段 "${k}" 不可克隆:`, e2.message, `(类型: ${typeof v})`) }
        }
      }
    }
    return false
  }
}

main().catch(e => { console.error('测试失败:', e); process.exit(1) })