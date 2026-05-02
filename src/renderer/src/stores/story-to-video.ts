/**
 * @deprecated 已拆分到 stores/episode-production/*；新代码请直接 import 子 store。
 *             本文件作为 Proxy facade 保留，以兼容现有调用方。
 *             后续 task 在改各 view/component 时逐个替换为具体的 useEp*Store。
 *
 * @module stores/story-to-video
 */

import {
  useEpWorkbenchStore,
  useEpProjectStore,
  useEpEpisodeStore,
  useEpAssetStore,
  useEpScriptStore,
  useEpStoryboardStore,
  useEpProductionStore,
  useEpComposeStore,
} from './episode-production'

// 重新导出所有子 store，方便新代码直接使用
export {
  useEpWorkbenchStore,
  useEpProjectStore,
  useEpEpisodeStore,
  useEpAssetStore,
  useEpScriptStore,
  useEpStoryboardStore,
  useEpProductionStore,
  useEpComposeStore,
} from './episode-production'

/**
 * @deprecated 改用 useEp*Store。本 facade 丢失部分类型信息（变成 any），
 *             仅为运行时兼容。
 */
export function useStoryToVideoStore(): any {
  const wb = useEpWorkbenchStore()
  const proj = useEpProjectStore()
  const ep = useEpEpisodeStore()
  const asset = useEpAssetStore()
  const script = useEpScriptStore()
  const sb = useEpStoryboardStore()
  const prod = useEpProductionStore()
  const cmp = useEpComposeStore()

  // 优先级查找：workbench → project → episode → asset → script → storyboard → production → compose
  const stores = [wb, proj, ep, asset, script, sb, prod, cmp]

  return new Proxy({}, {
    get(_t, prop: string | symbol) {
      for (const s of stores) {
        if (prop in s) return (s as any)[prop]
      }
      return undefined
    },
    set(_t, prop: string | symbol, value: any) {
      for (const s of stores) {
        if (prop in s) {
          ;(s as any)[prop] = value
          return true
        }
      }
      return false
    },
  })
}
