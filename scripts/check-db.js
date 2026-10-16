const { app } = require('electron')
const Database = require('better-sqlite3')

async function main() {
  await app.whenReady()

  const dbPath = 'C:/Users/daoge/the-bot/the_bot.db'
  console.log('数据库路径:', dbPath)

  try {
    const db = new Database(dbPath)

    // 运行完整性检查
    console.log('\n运行 PRAGMA integrity_check...')
    const result = db.pragma('integrity_check')
    console.log('完整性检查结果:', result)

    // 检查人像相关表
    console.log('\n检查人像相关表...')

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'portrait%'").all()
    console.log('人像相关表:', tables.map(t => t.name))

    // 检查 portrait_projects 表
    try {
      const projects = db.prepare('SELECT id, name FROM portrait_projects').all()
      console.log('项目数量:', projects.length)
    } catch (e) {
      console.log('读取 portrait_projects 错误:', e.message)
    }

    // 检查 portrait_characters 表
    try {
      const characters = db.prepare('SELECT id, name FROM portrait_characters').all()
      console.log('角色数量:', characters.length)
    } catch (e) {
      console.log('读取 portrait_characters 错误:', e.message)
    }

    db.close()
    console.log('\n数据库可以打开')

  } catch (e) {
    console.error('数据库错误:', e.message)
  }

  app.exit(0)
}

main()