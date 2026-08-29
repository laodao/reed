import { describe, expect, it } from 'vitest'
import {
  buildUrlShortcut,
  ensureExtension,
  sanitizeFileName,
} from '../../../../../src/core/modules/assets/asset-download'

describe('asset-download 纯函数', () => {
  it('sanitizeFileName：剥离 Windows 非法字符、去首尾空白、空名兜底', () => {
    expect(sanitizeFileName('报告 2026.md')).toBe('报告 2026.md')
    expect(sanitizeFileName('a<b>c:d"e/f\\g|h?i*j')).toBe('a_b_c_d_e_f_g_h_i_j')
    expect(sanitizeFileName('  标题  ')).toBe('标题')
    expect(sanitizeFileName('   ')).toBe('asset')
    expect(sanitizeFileName('')).toBe('asset')
  })

  it('ensureExtension：无扩展名补后缀，已有同后缀不重复', () => {
    expect(ensureExtension('报告', 'md')).toBe('报告.md')
    expect(ensureExtension('报告.md', 'md')).toBe('报告.md')
    expect(ensureExtension('报告.MD', 'md')).toBe('报告.MD') // 不区分大小写
    expect(ensureExtension('数据', 'json')).toBe('数据.json')
    expect(ensureExtension('  ', 'md')).toBe('asset.md') // 空名兜底
  })

  it('buildUrlShortcut：Windows InternetShortcut 格式', () => {
    expect(buildUrlShortcut('https://example.com/a?b=1')).toBe(
      '[InternetShortcut]\nURL=https://example.com/a?b=1\n',
    )
  })
})
