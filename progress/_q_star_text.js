// 抽取星宇关键文本资产样本（只读）
const Database = require('better-sqlite3')
const db = new Database('C:/Users/daoge/the-bot/the_bot.db', { readonly: true })
const ids = [
  'asset_1788523944352_tjb4e1jsi', // 短视频脚本-2026-09-04 2624 (60s 版，V2 60s 用过)
  'asset_1788530561207_1cacdwcwa', // 短视频脚本-2026-09-04 7591 (300s 版)
  'asset_1788530563090_xcovls55z', // 吃瓜报告-2026-09-04 4631 (最新)
]
try {
  for (const id of ids) {
    const r = db.prepare('SELECT name, length(text_content) len, substr(text_content,1,150) head FROM assets WHERE id=?').get(id)
    console.log(`\n===== ${id} | ${r.name} | len=${r.len} =====`)
    console.log(r.head)
  }
} finally {
  db.close()
}
