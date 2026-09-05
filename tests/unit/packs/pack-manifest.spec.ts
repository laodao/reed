/**
 * pack.types manifest 校验器测试
 * @module tests/packs/pack-manifest
 * @description validatePackManifest 的全分支覆盖：合法清单通过、
 *              各类非法输入 fail-fast 抛 PackManifestError（纪律 3）。
 */
import { describe, it, expect } from 'vitest'
import {
  validatePackManifest,
  PackManifestError,
  type PackManifest,
} from '@shared/types/pack.types'

function valid(): PackManifest {
  return { id: 'diary', name: '日记', version: '1.0.0' }
}

describe('validatePackManifest', () => {
  it('接受最小合法清单', () => {
    expect(() => validatePackManifest(valid())).not.toThrow()
  })

  it('接受带全部可选字段的清单', () => {
    expect(() =>
      validatePackManifest({
        ...valid(),
        description: '日记业务包',
        dependencies: ['knowledge-base'],
        defaultEnabled: false,
        contributions: { ipcChannelPrefixes: ['diary:'], routePaths: ['/diary'] },
      })
    ).not.toThrow()
  })

  it('拒绝非对象 / 缺 id / 空 name', () => {
    expect(() => validatePackManifest(null as never)).toThrow(PackManifestError)
    expect(() => validatePackManifest({ ...valid(), id: '' })).toThrow(PackManifestError)
    expect(() => validatePackManifest({ ...valid(), name: '' })).toThrow(PackManifestError)
  })

  it('拒绝非法 id 字符集', () => {
    for (const id of ['Diary', '1diary', 'diary_pro', '日记', '-diary']) {
      expect(() => validatePackManifest({ ...valid(), id })).toThrow(PackManifestError)
    }
    expect(() => validatePackManifest({ ...valid(), id: 'voice-design' })).not.toThrow()
  })

  it('拒绝非语义化版本', () => {
    for (const version of ['1.0', 'v1.0.0', 'latest', '1.0.0-beta']) {
      expect(() => validatePackManifest({ ...valid(), version })).toThrow(PackManifestError)
    }
  })

  it('拒绝非法依赖声明与自依赖', () => {
    expect(() => validatePackManifest({ ...valid(), dependencies: ['Bad Id'] })).toThrow(
      PackManifestError
    )
    expect(() => validatePackManifest({ ...valid(), dependencies: ['diary'] })).toThrow(
      PackManifestError
    )
  })

  it('拒绝不以 ":" 结尾的 channel 前缀与不以 "/" 开头的路由', () => {
    expect(() =>
      validatePackManifest({ ...valid(), contributions: { ipcChannelPrefixes: ['diary'] } })
    ).toThrow(PackManifestError)
    expect(() =>
      validatePackManifest({ ...valid(), contributions: { routePaths: ['diary'] } })
    ).toThrow(PackManifestError)
  })
})
