/**
 * asset-source-meta 单测（FU5-A5）
 *
 * 5 种 AssetSource 的 label / el-tag type 映射稳定性 + isAssetSource 守卫。
 */
import { describe, it, expect } from 'vitest'
import {
  ALL_ASSET_SOURCES,
  ASSET_SOURCE_LABEL,
  ASSET_SOURCE_EL_TAG_TYPE,
  isAssetSource,
} from '../../../../src/renderer/src/components/episode-production/shared/asset-source-meta'

describe('asset-source-meta', () => {
  it('5 种 source 全部覆盖到 label / el-tag type 映射', () => {
    expect(ALL_ASSET_SOURCES).toHaveLength(5)
    for (const s of ALL_ASSET_SOURCES) {
      expect(ASSET_SOURCE_LABEL[s]).toBeTruthy()
      expect(ASSET_SOURCE_EL_TAG_TYPE[s]).toBeTruthy()
    }
  })

  it('label 对齐 spec / 原型文案', () => {
    expect(ASSET_SOURCE_LABEL.linked_lw).toBe('linked_lw')
    expect(ASSET_SOURCE_LABEL.standalone).toBe('standalone')
    expect(ASSET_SOURCE_LABEL['3d']).toBe('3D')
    expect(ASSET_SOURCE_LABEL.system).toBe('系统')
    expect(ASSET_SOURCE_LABEL.cloned).toBe('复刻')
  })

  it('el-tag type 映射对齐原型 shell.css 视觉色板', () => {
    // shell.css: tag-linked-lw=primary / tag-standalone=warning / tag-3d=danger / tag-success=success
    expect(ASSET_SOURCE_EL_TAG_TYPE.linked_lw).toBe('primary')
    expect(ASSET_SOURCE_EL_TAG_TYPE.standalone).toBe('warning')
    expect(ASSET_SOURCE_EL_TAG_TYPE['3d']).toBe('danger')
    expect(ASSET_SOURCE_EL_TAG_TYPE.system).toBe('info')
    expect(ASSET_SOURCE_EL_TAG_TYPE.cloned).toBe('success')
  })

  it('isAssetSource 守卫：合法值返回 true', () => {
    for (const s of ALL_ASSET_SOURCES) {
      expect(isAssetSource(s)).toBe(true)
    }
  })

  it('isAssetSource 守卫：非法值 / 非字符串返回 false', () => {
    expect(isAssetSource('unknown')).toBe(false)
    expect(isAssetSource('')).toBe(false)
    expect(isAssetSource(null)).toBe(false)
    expect(isAssetSource(undefined)).toBe(false)
    expect(isAssetSource(123)).toBe(false)
    expect(isAssetSource({})).toBe(false)
  })
})
