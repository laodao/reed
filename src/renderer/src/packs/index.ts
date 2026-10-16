/**
 * 内置业务包装配入口（前端）
 * @module renderer/packs
 * @description mountApp() 在 app.use(router) 之前调用 installBuiltinPackages(router)：
 *              注册内置包 → 经 pack:list IPC 拉启用态 → applyPacks 一次性
 *              挂路由/合菜单。注册顺序即主菜单合入顺序（锚点相同的包按此序排列，
 *              与原静态菜单顺序保持一致）。
 *
 *              功能开关（2026-10-15）：装配清单按 features.config.json 过滤——禁用的
 *              包不注册（路由/菜单不挂，视图 chunk 永不加载）。动态 import 使禁用包
 *              的代码不进入启动加载路径。从 dev 同步代码到裁剪分支无需改本文件，
 *              只维护 features.config.json。
 */
import type { Router } from 'vue-router'
import type { PackInfo } from '@shared/types/pack.types'
import type { RendererPackDefinition } from './registry'
import { applyPacks, registerPack, setPackInfos } from './registry'
import { isModuleEnabled } from '@shared/constants/features'

/** pack IPC namespace 的最小契约（preload 暴露的 electronAPI.pack） */
interface PackApi {
  list(): Promise<{ success: boolean; data?: PackInfo[]; error?: string }>
}

/**
 * 包装配清单：顺序 = 注册顺序 = 菜单合入顺序（2026-09-08 起 domain-learning
 * 以 knowledge-base 为锚点插入其前；capability 与 chat 同锚、紧跟 chat 注册）。
 * 禁用的包跳过 load()，其定义与视图 chunk 完全不进运行时。
 */
const PACK_LOADERS: Array<{ id: string; load: () => Promise<RendererPackDefinition> }> = [
  { id: 'knowledge-base', load: () => import('./knowledge-base').then((m) => m.knowledgeBasePack) },
  { id: 'workflow', load: () => import('./workflow').then((m) => m.workflowPack) },
  { id: 'app', load: () => import('./app').then((m) => m.appPack) },
  { id: 'asset-center', load: () => import('./asset-center').then((m) => m.assetCenterPack) },
  { id: 'chat', load: () => import('./chat').then((m) => m.chatPack) },
  { id: 'capability', load: () => import('./capability').then((m) => m.capabilityPack) },
  { id: 'portrait', load: () => import('./portrait').then((m) => m.portraitPack) },
  { id: 'longwriting', load: () => import('./longwriting').then((m) => m.longwritingPack) },
  { id: 'episode-production', load: () => import('./episode-production').then((m) => m.episodeProductionPack) },
  { id: 'voice-design', load: () => import('./voice-design').then((m) => m.voiceDesignPack) },
  { id: 'diary', load: () => import('./diary').then((m) => m.diaryPack) },
  { id: 'skills', load: () => import('./skills').then((m) => m.skillsPack) },
  { id: 'domain-learning', load: () => import('./domain-learning').then((m) => m.domainLearningPack) },
  { id: 'info-collection', load: () => import('./info-collection').then((m) => m.infoCollectionPack) },
]

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
  for (const { id, load } of PACK_LOADERS) {
    if (!isModuleEnabled(id)) continue
    registerPack(await load())
  }

  setPackInfos(await fetchPackInfos())
  applyPacks(router)
}

export * from './registry'
