// 一次性清理脚本：删除 knowledge-base.service.ts 中已迁移的僵尸私有方法（decodeTextFile/hasGarbledChars/splitText）与其专属常量
const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', 'src', 'core', 'platform', 'services', 'knowledge-base.service.ts')
const lines = fs.readFileSync(file, 'utf8').split('\n')

// 1 基行号；先删后面的块，避免行号漂移
const ranges = [
  [836, 993], // decodeTextFile + hasGarbledChars + splitText（含末尾空行）
  [51, 52], // CHUNK_SIZE / OVERLAP：仅被已删除的 splitText 使用
]

for (const [start, end] of ranges) {
  const head = lines[start - 1].trim()
  const tail = lines[end - 1].trim()
  console.log(`删除 ${start}-${end}: 首行「${head}」末行「${tail}」`)
}
for (const [start, end] of ranges) lines.splice(start - 1, end - start + 1)

fs.writeFileSync(file, lines.join('\n'))
console.log('完成，剩余行数:', lines.length)
