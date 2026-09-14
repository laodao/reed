/**
 * 系统参数键名规范护栏（settings 表）
 * @module tests/unit/settings-keys.spec
 *
 * 用户 2026-09-13 要求「参数名要统一命名规范」。规范写在
 * `shared/constants/settings-keys.ts` 头部，本用例做两件事让它能落地：
 * 1. 注册表自身合规（`<模块>:<对象>`、无重复、旧键不撞现行键）；
 * 2. **扫源码**：业务代码里不允许再出现未注册的 settings 键字面量
 *    （`settings.get('x')` / `settings.set('x')` / 本地 `XXX_KEY = 'x'`），
 *    逼新配置走注册表——否则规范只是文档里的一句话。
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  ALL_SETTINGS_KEYS,
  LEGACY_TO_CURRENT_KEY,
  SETTINGS_KEY_LEGACY,
  SETTINGS_KEY_PATTERN,
  SETTINGS_KEYS,
  getSettingWithLegacyFallback,
  isRegisteredSettingsKey,
  legacyKeysOf,
} from '@shared/constants/settings-keys'

const ROOT = process.cwd()

/** 递归收集 src 下的 ts/vue 源码（跳过 archive/历史目录） */
function collectSources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'archive') continue
      collectSources(p, out)
    } else if (/\.(ts|vue)$/.test(e.name)) {
      out.push(p)
    }
  }
  return out
}

describe('系统参数键名规范（settings keys）', () => {
  it('注册表键名全部符合 `<模块>:<对象>` 规范', () => {
    for (const key of ALL_SETTINGS_KEYS) {
      expect(SETTINGS_KEY_PATTERN.test(key), `${key} 不符合命名规范`).toBe(true)
    }
  })

  it('注册表无重复键；旧键不撞现行键、不重复映射', () => {
    expect(new Set(ALL_SETTINGS_KEYS).size).toBe(ALL_SETTINGS_KEYS.length)
    const legacies = Object.values(SETTINGS_KEY_LEGACY).flat()
    for (const l of legacies) {
      expect(ALL_SETTINGS_KEYS.includes(l), `旧键 ${l} 与现行键重名`).toBe(false)
    }
    expect(new Set(legacies).size).toBe(legacies.length)
    // 旧键的反查表与登记表一致
    for (const [current, olds] of Object.entries(SETTINGS_KEY_LEGACY)) {
      expect(legacyKeysOf(current)).toEqual(olds)
      for (const o of olds) expect(LEGACY_TO_CURRENT_KEY[o]).toBe(current)
    }
  })

  it('isRegisteredSettingsKey：现行键与旧键都算合法，其它一律非法', () => {
    expect(isRegisteredSettingsKey(SETTINGS_KEYS.agentBudget)).toBe(true)
    expect(isRegisteredSettingsKey(SETTINGS_KEYS.uiTheme)).toBe(true)
    expect(isRegisteredSettingsKey('theme')).toBe(true) // 旧键（兼容期合法输入）
    expect(isRegisteredSettingsKey('myRandomKey')).toBe(false)
    expect(isRegisteredSettingsKey('agent:budget2')).toBe(false)
  })

  it('源码里不再有未注册的 settings 键字面量（新配置必须走注册表）', () => {
    const files = collectSources(path.join(ROOT, 'src')).filter(
      (f) => !f.includes(path.join('src', 'shared', 'constants', 'settings-keys.ts')),
    )
    const offenders: string[] = []
    /** 直接写在 settings 调用里的键字面量（如 settings.get('theme')） */
    const callRe = /\bsettings\.(?:get|set)\(\s*'([^']+)'/g
    /** 局部键常量（如 const XXX_KEY = 'theme'）——只在**真的会调用 settings 的文件**里校验，
     *  避免把 localStorage 的键（tabs:state:v1 / guide-completed / ep-* 等，另一种存储）误判为 settings 参数 */
    const constRe = /(?:SETTINGS?_?KEY|_KEY)\s*(?::[^=]+)?=\s*'([^']+)'/g
    const usesSettings = (text: string): boolean =>
      text.includes('settings.get(') ||
      text.includes('settings.set(') ||
      text.includes('getSettingWithLegacyFallback(')
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8')
      for (const m of text.matchAll(callRe)) {
        if (!isRegisteredSettingsKey(m[1])) offenders.push(`${path.relative(ROOT, file)}: ${m[1]}`)
      }
      if (!usesSettings(text)) continue
      for (const m of text.matchAll(constRe)) {
        const key = m[1]
        if (!isRegisteredSettingsKey(key)) offenders.push(`${path.relative(ROOT, file)}: ${key}`)
      }
    }
    expect(offenders, `以下 settings 键未在注册表登记：\n${offenders.join('\n')}`).toEqual([])
  })

  it('getSettingWithLegacyFallback：现行键优先，缺省回落旧键，都没有才 null', async () => {
    const store: Record<string, unknown> = { theme: 'dark-theme' }
    const port = { get: async (k: string) => (k in store ? store[k] : null) }
    // 只有旧键 → 兜底读到
    expect(await getSettingWithLegacyFallback(port, SETTINGS_KEYS.uiTheme)).toBe('dark-theme')
    // 现行键有值 → 优先
    store[SETTINGS_KEYS.uiTheme] = 'light-theme'
    expect(await getSettingWithLegacyFallback(port, SETTINGS_KEYS.uiTheme)).toBe('light-theme')
    // 都没有 → null；无端口 → null
    expect(await getSettingWithLegacyFallback(port, SETTINGS_KEYS.uiSkin)).toBeNull()
    expect(await getSettingWithLegacyFallback(null, SETTINGS_KEYS.uiTheme)).toBeNull()
  })
})
