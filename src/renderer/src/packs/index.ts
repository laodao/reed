/**
 * 内置业务包装配入口（前端）
 * @module renderer/packs
 * @description mountApp() 在 app.use(router) 之前调用 installBuiltinPackages(router)：
 *              注册 11 个内置包 → 经 pack:list IPC 拉启用态 → applyPacks 一次性
 *              挂路由/合菜单。注册顺序即主菜单合入顺序（锚点相同的包按此序排列，
 *              与原静态菜单顺序保持一致）。
 */
import type { Router } from 'vue-router'
import type { PackInfo } from '@shared/types/pack.types'
import { applyPacks, registerPack, setPackInfos } from './registry'
import { knowledgeBasePack } from './knowledge-base'
import { workflowPack } from './workflow'
import { appPack } from './app'
import { assetCenterPack } from './asset-center'
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
  // 注册顺序即菜单合入顺序。二期（2026-09-05）知识库/工作流/应用/资产中心也成包后，
  // 锚点 '/knowledge-base' 与 '/assets' 由壳菜单条目变成了包菜单条目——
  // 必须先注册这 4 个包（无锚点追加，复刻原壳条目位置），再注册以它们为锚点的包：
  //   chat/portrait/longwriting/episode-production 依次插到 '/knowledge-base' 之前；
  //   diary 插到 '/assets' 之前；voice-design/skills 无锚点追加到末尾。
  // 最终菜单顺序与一期完全一致：
  //   首页 → AI对话 → 人像设计 → 长文写作 → 剧集制作 → 知识库 → 工作流 → 应用
  //   → 日记 → 资产管理 → 声音设计 → 技能库
  registerPack(knowledgeBasePack)
  registerPack(workflowPack)
  registerPack(appPack)
  registerPack(assetCenterPack)
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
