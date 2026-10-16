/**
 * 仓库卫生守卫（review M20 教训）
 *
 * 背景：BrainPanel.vue 曾把 `>>>>>>> feat/kb-brain` 冲突标记带进 HEAD 并渲染到
 * 界面。git 冲突标记不会让 TS/Vue 编译报错（作为普通文本落进模板），靠 CI 挡。
 * 本用例扫描 src/ 下全部源码文件，出现未解决的冲突标记即失败。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(process.cwd(), 'src')

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // 跳过内嵌包的 node_modules（src/web/admin-viven 等自带依赖树，非本仓源码）
      if (entry.name === 'node_modules') continue
      yield* walk(p)
    }
    // isFile() 而非按扩展名：src/ 内存在指向目录的符号链接（lstat 不是 dir），
    // 按扩展名匹配会把它当文件读（EISDIR）
    else if (entry.isFile() && /\.(vue|ts|tsx|js|jsx)$/.test(entry.name)) yield p
  }
}

describe('仓库卫生：源码不得残留 git 冲突标记', () => {
  it('src/ 全量扫描无 <<<<<<< / >>>>>>> 行', () => {
    const offenders: string[] = []
    // ======= 单独成行误报率高（注释/分隔线），只查两端标记；两端标记必然成对出现
    const RE = /^(<{7}|>{7})( .*)?$/
    for (const file of walk(ROOT)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (RE.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(offenders, `发现未解决的冲突标记:\n${offenders.join('\n')}`).toEqual([])
  })
})
