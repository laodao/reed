/**
 * 复现实验：better-sqlite3 单连接下，TypeORM 并发事务是否踩踏？
 * 用 TypeORM 真实路径（createQueryRunner + startTransaction/commitTransaction）
 */
const { DataSource } = require('typeorm')

async function main() {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    synchronize: false,
    logging: false,
  })
  await ds.initialize()
  await ds.query('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')

  const sleep = (ms) => new Promise(r => setTimeout(r, ms))

  async function txn(label) {
    const qr = ds.createQueryRunner()
    try {
      await qr.connect()
      await qr.startTransaction()
      console.log(`[${label}] BEGIN 成功`)
      await sleep(20)                    // 制造让出点——模拟真实 async 路径
      await qr.query('INSERT INTO t (v) VALUES (?)', [label])
      console.log(`[${label}] INSERT 成功`)
      await sleep(20)
      await qr.commitTransaction()
      console.log(`[${label}] COMMIT 成功`)
    } catch (e) {
      console.log(`[${label}] 失败:`, e?.message?.split('\n')[0] ?? e)
      // 对齐 TypeORM transaction() 的 catch：尝试 rollback
      try { await qr.rollbackTransaction() } catch { /* ignore */ }
    } finally {
      await qr.release()
    }
  }

  console.log('===== 场景1：并发 2 个事务（模拟事件桥并发写卡） =====')
  await Promise.all([txn('A'), txn('B')])
  console.log('表内容:', await ds.query('SELECT * FROM t'))

  // 串行对照组
  console.log('\n===== 场景2：串行 2 个事务（cardQueue 修复后） =====')
  await txn('C')
  await txn('D')
  console.log('表内容:', await ds.query('SELECT * FROM t'))

  // 场景3：事务与普通 UPDATE 交错
  console.log('\n===== 场景3：事务进行中插一条普通 UPDATE（引擎收尾 vs 写卡） =====')
  const qr = ds.createQueryRunner()
  await qr.connect()
  await qr.startTransaction()
  await qr.query('INSERT INTO t (v) VALUES (?)', ['E'])
  // 事务未提交时，另一条 async 路径发普通 UPDATE（走 DataSource 默认 queryRunner）
  await ds.query('INSERT INTO t (v) VALUES (?)', ['F'])   // ← 插进事务窗口
  await qr.commitTransaction()
  await qr.release()
  console.log('表内容:', await ds.query('SELECT * FROM t'))

  await ds.destroy()
}

main().catch(e => { console.error('脚本失败:', e); process.exit(1) })
