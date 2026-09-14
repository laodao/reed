// 统计口播文案正文字数（仅用于校准 60s 文案长度）
const fs = require('fs')
const text = fs.readFileSync('progress/_v3_60s_script_asset.md', 'utf8')
const body = text.split('## 完整口播文案')[1]
const chars = body.replace(/\s/g, '')
console.log('口播字数(含标点):', chars.length)
// 估算口播秒数（中文语速 ~4.2-4.6 字/秒）
console.log('估算秒数:', (chars.length / 4.4).toFixed(0), 's')
