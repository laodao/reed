/**
 * create-builtin-apps 迁移逻辑测试（内置高频应用：不做运行时种子、迁移直接 INSERT）
 * @module tests/unit/migrations/create-builtin-apps
 * @description 验证：内置模板 JSON 目录完整性（8 个）、BUILTIN_APPS 清单与文件一一对应、
 *              迁移源含 is_builtin 幂等补列逻辑。真实 sqlite 执行依赖 better-sqlite3
 *              native ABI（Electron 编译），本 CI 环境不可用，由端到端验证覆盖。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = resolve(__dirname, '../../../src/core/database/migrations/create-builtin-apps.ts')
const TEMPLATE_DIR = resolve(__dirname, '../../../src/core/database/migrations/builtin-apps')

describe('create-builtin-apps 迁移', () => {
  it('内置模板目录含 8 个 JSON', () => {
    const files = readdirSync(TEMPLATE_DIR).filter(f => f.endsWith('.json'))
    expect(files.length).toBe(8)
  })

  it('BUILTIN_APPS 清单的每个 file 都在目录中存在', () => {
    const source = readFileSync(SRC, 'utf-8')
    const files = readdirSync(TEMPLATE_DIR).filter(f => f.endsWith('.json'))
    // 清单里出现的文件名（从 file: 'xxx.json' 提取）
    const listed = [...source.matchAll(/file: '([^']+\.json)'/g)].map(m => m[1])
    expect(listed.length).toBeGreaterThanOrEqual(8)
    for (const f of listed) {
      expect(files, `清单文件 ${f} 缺失`).toContain(f)
      expect(existsSync(resolve(TEMPLATE_DIR, f))).toBe(true)
    }
  })

  it('迁移源包含 is_builtin 幂等补列（三表）', () => {
    const source = readFileSync(SRC, 'utf-8')
    for (const table of ['workflow_definitions', 'apps', 'assets']) {
      expect(source, `${table} 缺补列`).toContain(`ensureColumn(ds, '${table}', 'is_builtin'`)
    }
  })

  it('迁移源包含默认模板资产（2 个）', () => {
    const source = readFileSync(SRC, 'utf-8')
    expect(source).toContain('builtin_tpl_morning_report')
    expect(source).toContain('builtin_tpl_generic_report')
  })

  it('迁移源内置应用 id 全部前缀 builtin_app_', () => {
    const source = readFileSync(SRC, 'utf-8')
    const appIds = [...source.matchAll(/appId: `\$\{BUILTIN_APP_PREFIX\}([a-z_]+)`/g)].map(m => m[1])
    expect(appIds.length).toBe(8)
  })

  it('内置工作流 JSON 均为合法 the-bot-workflow 格式', () => {
    for (const f of readdirSync(TEMPLATE_DIR).filter(f => f.endsWith('.json'))) {
      const raw = JSON.parse(readFileSync(resolve(TEMPLATE_DIR, f), 'utf-8'))
      expect(raw.kind).toBe('the-bot-workflow')
      expect(raw.graph?.nodes?.length).toBeGreaterThan(2)
    }
  })
})
