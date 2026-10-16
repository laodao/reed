const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

// 数据库路径
const dbPath = 'C:/Users/daoge/the-bot/the_bot.db'

console.log('========== 数据库文件大小 ==========')

// 检查文件大小
const stat = fs.statSync(dbPath)
console.log('主数据库文件:', (stat.size / 1024 / 1024).toFixed(2), 'MB')

// 检查 WAL 文件
const walPath = dbPath + '-wal'
const shmPath = dbPath + '-shm'

if (fs.existsSync(walPath)) {
  const walStat = fs.statSync(walPath)
  console.log('WAL 文件:', (walStat.size / 1024 / 1024).toFixed(2), 'MB')
}

if (fs.existsSync(shmPath)) {
  const shmStat = fs.statSync(shmPath)
  console.log('SHM 文件:', (shmStat.size / 1024 / 1024).toFixed(2), 'MB')
}

// LanceDB 目录
const lanceDbPath = 'C:/Users/daoge/the-bot/lancedb'
if (fs.existsSync(lanceDbPath)) {
  let lanceSize = 0
  const files = fs.readdirSync(lanceDbPath, { withFileTypes: true })
  for (const file of files) {
    if (file.isDirectory()) {
      const subFiles = fs.readdirSync(path.join(lanceDbPath, file.name))
      for (const subFile of subFiles) {
        const subStat = fs.statSync(path.join(lanceDbPath, file.name, subFile))
        lanceSize += subStat.size
      }
    } else {
      const fStat = fs.statSync(path.join(lanceDbPath, file.name))
      lanceSize += fStat.size
    }
  }
  console.log('LanceDB 目录:', (lanceSize / 1024 / 1024).toFixed(2), 'MB')
}

// 打开数据库
const db = new Database(dbPath)

console.log('\n========== 数据库页面信息 ==========')
const pageCount = db.pragma('page_count')
const pageSize = db.pragma('page_size')
console.log('页面数量:', pageCount[0].page_count)
console.log('页面大小:', pageSize[0].page_size, 'bytes')
console.log('理论大小:', (pageCount[0].page_count * pageSize[0].page_size / 1024 / 1024).toFixed(2), 'MB')

console.log('\n========== 各表数据量 ==========')

const tables = [
  'messages',
  'dialogs',
  'roles',
  'provider_configs',
  'images',
  'translations',
  'voice_records',
  'kb_documents',
  'kb_chunks',
  'kb_vectors',
  'knowledge_bases',
  'portrait_projects',
  'portrait_characters',
  'portrait_variants',
  'kb_inverted_index'
]

for (const table of tables) {
  try {
    const result = db.prepare('SELECT COUNT(*) as count FROM ' + table).get()
    console.log(table + ':', result.count, '条记录')
  } catch (e) {
    console.log(table + ': 表不存在')
  }
}

console.log('\n========== 知识库详情 ==========')
try {
  const kbs = db.prepare(`
    SELECT
      kb.id,
      kb.name,
      (SELECT COUNT(*) FROM kb_documents WHERE knowledge_base_id = kb.id) as doc_count,
      (SELECT COUNT(*) FROM kb_chunks c JOIN kb_documents d ON c.document_id = d.id WHERE d.knowledge_base_id = kb.id) as chunk_count,
      (SELECT SUM(file_size) FROM kb_documents WHERE knowledge_base_id = kb.id) as total_size
    FROM knowledge_bases kb
  `).all()

  for (const kb of kbs) {
    console.log('\n知识库:', kb.name)
    console.log('  文档数:', kb.doc_count)
    console.log('  切片数:', kb.chunk_count)
    console.log('  总大小:', kb.total_size ? (kb.total_size / 1024 / 1024).toFixed(2) + ' MB' : '0')
  }
} catch (e) {
  console.log('查询知识库失败:', e.message)
}

console.log('\n========== 消息统计 ==========')
try {
  const msgStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(LENGTH(content)) as total_content_size
    FROM messages
  `).get()

  console.log('消息总数:', msgStats.total)
  console.log('内容总大小:', (msgStats.total_content_size / 1024 / 1024).toFixed(2), 'MB')
} catch (e) {
  console.log('查询消息失败:', e.message)
}

console.log('\n========== kb_chunks 内容大小 ==========')
try {
  const chunkStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(LENGTH(content)) as total_content_size
    FROM kb_chunks
  `).get()

  console.log('切片总数:', chunkStats.total)
  console.log('内容总大小:', (chunkStats.total_content_size / 1024 / 1024).toFixed(2), 'MB')
} catch (e) {
  console.log('查询切片失败:', e.message)
}

console.log('\n========== kb_vectors 大小（已废弃，使用 LanceDB）==========')
try {
  const vectorStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(LENGTH(vector)) as total_vector_size
    FROM kb_vectors
  `).get()

  console.log('向量总数:', vectorStats.total)
  console.log('向量数据总大小:', (vectorStats.total_vector_size / 1024 / 1024).toFixed(2), 'MB')
} catch (e) {
  console.log('kb_vectors 表不存在或无数据')
}

console.log('\n========== kb_inverted_index 大小 ==========')
try {
  const indexStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(LENGTH(token)) as total_token_size
    FROM kb_inverted_index
  `).get()

  console.log('索引条目总数:', indexStats.total)
  console.log('Token 总大小:', (indexStats.total_token_size / 1024 / 1024).toFixed(2), 'MB')
} catch (e) {
  console.log('查询倒排索引失败:', e.message)
}

console.log('\n========== 图片存储大小 ==========')
try {
  const imgStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(LENGTH(image_data)) as total_data_size
    FROM images
  `).get()

  console.log('图片总数:', imgStats.total)
  console.log('图片数据总大小:', (imgStats.total_data_size / 1024 / 1024).toFixed(2), 'MB')
} catch (e) {
  console.log('查询图片失败:', e.message)
}

// 建议
console.log('\n========== 优化建议 ==========')
const freelist = db.pragma('freelist_count')
console.log('空闲页面数:', freelist[0].freelist_count)
console.log('可回收空间:', (freelist[0].freelist_count * pageSize[0].page_size / 1024 / 1024).toFixed(2), 'MB')

if (freelist[0].freelist_count > 100) {
  console.log('\n建议执行 VACUUM 回收空间')
}

// 检查 WAL 模式
const journalMode = db.pragma('journal_mode')
console.log('\nJournal 模式:', journalMode[0].journal_mode)

db.close()