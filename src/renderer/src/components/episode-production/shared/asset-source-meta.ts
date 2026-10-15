/**
 * asset-source-meta · 资产来源 5 状态元数据（FU5-A5）
 *
 * 抽出 AssetSourceTag.vue 内的映射表，让其他组件 / store / 后端校验也能复用。
 */

export type AssetSource =
  | 'linked_lw'
  | 'standalone'
  | '3d'
  | 'system'
  | 'cloned'

export const ALL_ASSET_SOURCES: readonly AssetSource[] = [
  'linked_lw',
  'standalone',
  '3d',
  'system',
  'cloned',
] as const

export const ASSET_SOURCE_LABEL: Record<AssetSource, string> = {
  linked_lw: 'linked_lw',
  standalone: 'standalone',
  '3d': '3D',
  system: '系统',
  cloned: '复刻',
}

export type ElTagType = 'primary' | 'warning' | 'danger' | 'info' | 'success'

export const ASSET_SOURCE_EL_TAG_TYPE: Record<AssetSource, ElTagType> = {
  linked_lw: 'primary',
  standalone: 'warning',
  '3d': 'danger',
  system: 'info',
  cloned: 'success',
}

export function isAssetSource(v: unknown): v is AssetSource {
  return typeof v === 'string' && (ALL_ASSET_SOURCES as readonly string[]).includes(v)
}
