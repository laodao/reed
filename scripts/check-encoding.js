const { app } = require('electron')
const Database = require('better-sqlite3')

async function main() {
  await app.whenReady()

  const dbPath = 'C:/Users/daoge/the-bot/the_bot.db'
  const db = new Database(dbPath)

  // 查找明史知识库
  const kb = db.prepare("SELECT id, name FROM knowledge_bases WHERE name = '明史'").get()

  if (!kb) {
    console.log('未找到明史知识库')
    db.close()
    app.exit(1)
    return
  }

  console.log('知识库:', kb.name)

  // 获取该知识库的一个切片样本
  const chunk = db.prepare(`
    SELECT c.id, c.chunk_index, c.content
    FROM kb_chunks c
    JOIN kb_documents d ON c.document_id = d.id
    WHERE d.knowledge_base_id = ?
    LIMIT 1
  `).get(kb.id)

  if (chunk) {
    console.log('切片索引:', chunk.chunk_index)
    console.log('内容长度:', chunk.content?.length || 0)

    const content = chunk.content || ''

    // 分析前 50 个字符
    console.log('\n前50个字符分析:')
    for (let i = 0; i < Math.min(50, content.length); i++) {
      const code = content.charCodeAt(i)
      const hexCode = code.toString(16).toUpperCase().padStart(4, '0')
      const char = content[i]
      console.log(`  [${i}] U+${hexCode} (${code}) = '${char}'`)
    }

    // 尝试理解原始字节
    console.log('\n尝试 Latin1 -> GBK 解码:')
    try {
      const latin1Buffer = Buffer.from(content.substring(0, 100), 'latin1')
      console.log('  Latin1 字节 (hex):', latin1Buffer.toString('hex').substring(0, 100))

      // 尝试 GBK 解码
      const iconv = require('iconv-lite')
      const gbkDecoded = iconv.decode(latin1Buffer, 'gbk')
      console.log('  GBK 解码结果:', gbkDecoded.substring(0, 50))
    } catch (e) {
      console.log('  错误:', e.message)
    }

    // 尝试反向：把当前 UTF-8 转为 GBK 字节再解释
    console.log('\n尝试反向转换 (UTF-8 -> GBK bytes -> GBK decode):')
    try {
      const iconv = require('iconv-lite')
      // 将字符串编码为 UTF-8 字节
      const utf8Buffer = Buffer.from(content.substring(0, 100), 'utf-8')
      console.log('  UTF-8 字节 (hex):', utf8Buffer.toString('hex').substring(0, 100))
    } catch (e) {
      console.log('  错误:', e.message)
    }
  }

  db.close()
  app.exit(0)
}

main().catch(err => {
  console.error(err)
  app.exit(1)
})