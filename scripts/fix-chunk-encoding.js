/**
 * 修复知识库切片乱码脚本 v2
 *
 * 问题分析：
 * - 原始文件是 GBK 编码
 * - 读取时被错误地当作 UTF-8 解码
 * - 无效的 UTF-8 字节被替换为 U+FFFD ()
 * - 这些被替换的字节无法恢复
 *
 * 修复策略：
 * - 对于未被替换的字符，尝试 Latin1 -> GBK 转换
 * - 对于已替换的字符，标记为无法恢复
 */

const { app } = require('electron')
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const iconv = require('iconv-lite')

async function main() {
  await app.whenReady()

  const kbName = process.argv[2]

  if (!kbName) {
    console.log('用法: npm run fix-encoding <知识库名称>')
    app.exit(1)
    return
  }

  const dbPath = 'C:/Users/daoge/the-bot/the_bot.db'

  if (!fs.existsSync(dbPath)) {
    console.error('数据库文件不存在:', dbPath)
    app.exit(1)
    return
  }

  // 备份数据库
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = dbPath.replace('.db', `.backup-v2-${timestamp}.db`)
  console.log(`备份到: ${backupPath}`)
  fs.copyFileSync(dbPath, backupPath)

  const db = new Database(dbPath)

  // 查找知识库
  const kb = db.prepare('SELECT id, name FROM knowledge_bases WHERE name = ?').get(kbName)

  if (!kb) {
    console.error(`未找到知识库: ${kbName}`)
    const allKbs = db.prepare('SELECT id, name FROM knowledge_bases').all()
    console.log('\n可用的知识库:')
    allKbs.forEach(k => console.log(`  - ${k.name}`))
    db.close()
    app.exit(1)
    return
  }

  console.log(`知识库: ${kb.name}`)

  // 获取该知识库的所有文档
  const documents = db.prepare(`
    SELECT id, name FROM kb_documents WHERE knowledge_base_id = ?
  `).all(kb.id)

  console.log(`文档数量: ${documents.length}\n`)

  let totalChunks = 0
  let fixedChunks = 0
  let partialChunks = 0
  let failedChunks = 0

  const updateStmt = db.prepare('UPDATE kb_chunks SET content = ? WHERE id = ?')

  for (const doc of documents) {
    console.log(`处理文档: ${doc.name}`)

    const chunks = db.prepare(`
      SELECT id, chunk_index, content FROM kb_chunks
      WHERE document_id = ? ORDER BY chunk_index
    `).all(doc.id)

    console.log(`  切片数量: ${chunks.length}`)

    for (const chunk of chunks) {
      totalChunks++
      const content = chunk.content || ''

      // 统计替换字符比例
      const replacementCount = (content.match(/\uFFFD/g) || []).length
      const replacementRatio = replacementCount / content.length

      if (replacementRatio > 0.5) {
        // 超过 50% 是替换字符，无法修复
        failedChunks++
        if (chunk.chunk_index < 5) {
          console.log(`    切片 #${chunk.chunk_index + 1}: 严重损坏 (${(replacementRatio*100).toFixed(0)}% 替换字符)，无法修复`)
        }
        continue
      }

      // 尝试修复
      const result = fixContent(content)

      if (result.fixed) {
        updateStmt.run(result.content, chunk.id)
        if (result.quality === 'full') {
          fixedChunks++
        } else {
          partialChunks++
        }
        if (chunk.chunk_index < 5) {
          console.log(`    切片 #${chunk.chunk_index + 1}: ${result.quality === 'full' ? '已修复' : '部分修复'}`)
        }
      } else {
        failedChunks++
      }
    }
  }

  console.log('\n========== 处理完成 ==========')
  console.log(`总切片数: ${totalChunks}`)
  console.log(`完全修复: ${fixedChunks}`)
  console.log(`部分修复: ${partialChunks}`)
  console.log(`无法修复: ${failedChunks}`)
  console.log(`\n备份文件: ${backupPath}`)

  db.close()
  app.exit(0)
}

/**
 * 尝试修复内容
 */
function fixContent(content) {
  if (!content) return { fixed: false, quality: 'none' }

  // 检查替换字符比例
  const replacementCount = (content.match(/\uFFFD/g) || []).length
  const replacementRatio = replacementCount / content.length

  // 如果没有替换字符，可能是正常的 UTF-8 或 Latin1 编码的 GBK
  if (replacementCount === 0) {
    // 尝试 Latin1 -> GBK 解码
    try {
      const latin1Buffer = Buffer.from(content, 'latin1')
      const gbkDecoded = iconv.decode(latin1Buffer, 'gbk')

      // 检查解码结果是否包含正常中文
      const chineseRatio = countChinese(gbkDecoded) / gbkDecoded.length

      if (chineseRatio > 0.3) {
        return { fixed: true, content: gbkDecoded, quality: 'full' }
      }
    } catch (e) {
      // 忽略
    }

    // 检查当前内容是否已经是正常中文
    const currentChineseRatio = countChinese(content) / content.length
    if (currentChineseRatio > 0.3) {
      return { fixed: true, content: content, quality: 'full' }
    }

    return { fixed: false, quality: 'none' }
  }

  // 有替换字符的情况
  // 尝试修复非替换字符部分
  try {
    const latin1Buffer = Buffer.from(content, 'latin1')
    const gbkDecoded = iconv.decode(latin1Buffer, 'gbk')

    // 计算修复后仍然有多少替换字符
    const newReplacementCount = (gbkDecoded.match(/\uFFFD/g) || []).length
    const improvement = (replacementCount - newReplacementCount) / content.length

    if (improvement > 0.1) {
      return {
        fixed: true,
        content: gbkDecoded,
        quality: newReplacementCount === 0 ? 'full' : 'partial'
      }
    }
  } catch (e) {
    // 忽略
  }

  // 如果替换字符比例不高，保留原内容但标记为部分修复
  if (replacementRatio < 0.3) {
    return { fixed: true, content: content, quality: 'partial' }
  }

  return { fixed: false, quality: 'none' }
}

/**
 * 统计中文字符数量
 */
function countChinese(text) {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    // CJK 统一汉字范围
    if (code >= 0x4E00 && code <= 0x9FFF) {
      count++
    }
    // CJK 扩展 A
    else if (code >= 0x3400 && code <= 0x4DBF) {
      count++
    }
    // 中文标点
    else if (code >= 0x3000 && code <= 0x303F) {
      count++
    }
  }
  return count
}

main().catch(err => {
  console.error('执行错误:', err)
  app.exit(1)
})