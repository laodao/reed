const { app } = require('electron')
const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

async function main() {
  await app.whenReady()

  const dbPath = 'C:/Users/daoge/the-bot/the_bot.db'
  const backupPath = dbPath.replace('.db', '.before-repair.db')

  // 备份
  console.log('备份数据库到:', backupPath)
  fs.copyFileSync(dbPath, backupPath)

  const db = new Database(dbPath)

  try {
    // 1. 尝试 REINDEX
    console.log('\n1. 执行 REINDEX...')
    db.exec('REINDEX')
    console.log('   REINDEX 完成')

    // 2. 尝试 VACUUM
    console.log('\n2. 执行 VACUUM...')
    db.exec('VACUUM')
    console.log('   VACUUM 完成')

    // 3. 再次检查完整性
    console.log('\n3. 再次检查完整性...')
    const result = db.pragma('integrity_check')
    console.log('   结果:', JSON.stringify(result, null, 2))

    // 4. 检查人像项目
    console.log('\n4. 检查人像项目...')
    const projects = db.prepare('SELECT * FROM portrait_projects').all()
    console.log('   项目数量:', projects.length)
    projects.forEach(p => console.log('   -', p.id, p.name))

    // 5. 检查人像角色
    const characters = db.prepare('SELECT * FROM portrait_characters').all()
    console.log('   角色数量:', characters.length)

    // 6. 检查变体
    const variants = db.prepare('SELECT * FROM portrait_variants').all()
    console.log('   变体数量:', variants.length)

    console.log('\n修复完成!')

  } catch (e) {
    console.error('修复失败:', e.message)
  }

  db.close()
  app.exit(0)
}

main()