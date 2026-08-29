/**
 * 内置业务包装配入口（前端）
 * @module renderer/packs
 * @description mountApp() 在 app.use(router) 之前调用 installBuiltinPackages(router)：
 *              注册 7 个内置包 → 经 pack:list IPC 拉启用态 → applyPacks 一次性
 *              挂路由/合菜单。注册顺序即主菜单合入顺序（锚点相同的包按此序排列，
 *              与原静态菜单顺序保持一致）。
 */
import type { Router } from 'vue-router'
import type { PackInfo } from '@shared/types/pack.types'
import { applyPacks, registerPack, setPackInfos } from './registry'
import { chatPack } from './chat'
import { portraitPack } from './portrait'
import { longwritingPack } from './longwriting'
import { episodeProductionPack } from './episode-production'
import { voiceDesignPack } from './voice-design'
import { diaryPack } from './diary'
import { skillsPack } from './skills'

/** pack IPC namespace 的最小契约（preload 暴露的 electronAPI.pack） */
interface PackApi {
  list(): Promise<{ success: boolean; data?: PackInfo[]; error?: string }>
}

/**
 * 拉取后端启用态；IPC 失败/无响应 → 返回 null（降级全启用）。
 * 启动早期可用性优先：宁可多挂入口，也不因一时 IPC 不通而白屏。
 */
async function fetchPackInfos(): Promise<PackInfo[] | null> {
  try {
    const api = (window as unknown as { electronAPI?: { pack?: PackApi } }).electronAPI?.pack
    const resp = await api?.list()
    if (resp?.success && Array.isArray(resp.data)) {
      return resp.data
    }
  } catch {
    /* 落入降级：全启用 */
  }
  return null
}

/**
 * 装配全部内置业务包：登记 → 拉启用态 → 应用路由/菜单。
 * 幂等由 applyPacks 保证（重复调用只生效一次）。
 */
export async function installBuiltinPackages(router: Router): Promise<void> {
  // 注册顺序即菜单合入顺序：chat/portrait/longwriting/episode-production
  // 共用锚点 '/knowledge-base'，按此序插入后与原静态菜单顺序一致
  registerPack(chatPack)
  registerPack(portraitPack)
  registerPack(longwritingPack)
  registerPack(episodeProductionPack)
  registerPack(voiceDesignPack)
  registerPack(diaryPack)
  registerPack(skillsPack)

  setPackInfos(await fetchPackInfos())
  applyPacks(router)
}

export * from './registry'
