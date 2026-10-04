/**
 * 前端业务包注册表（包内核前端侧）
 * @module renderer/packs/registry
 * @description 「原地登记式」业务包的前端内核：
 *              1. registerPack() 登记包定义（manifest fail-fast 校验，与后端同一份校验器）；
 *              2. 启用态经 pack:list IPC 拉取（setPackInfos），响应式驱动 enabledPacks；
 *              3. 全部登记完成后一次性 applyPacks(router)：启用包 router.addRoute + 菜单合入。
 *
 *              可用性规则（与后端内核状态机对齐，见 shared/types/pack.types.ts）：
 *              - 启用态未拉到（infos 为 null，IPC 失败）→ 降级全启用：
 *                PC/Web 启动早期可用性优先，宁可多挂入口也不白屏；
 *              - 后端已感知该包 → 以 PackInfo.enabled + state 裁决（pending/disabled/failed 不挂）；
 *              - 后端尚未感知该包（P4 才做后端包迁移，当前 pack:list 返回空）→
 *                前端自治：按 manifest.defaultEnabled（缺省 true）；
 *              - 依赖未就绪（依赖包不可用）→ 本包视同 pending，不注册路由/菜单。
 */

import { computed, reactive, ref, type ComputedRef } from 'vue'
import type { Router, RouteRecordRaw } from 'vue-router'
import {
  PackManifestError,
  validatePackManifest,
  type PackInfo,
  type PackManifest,
} from '@shared/types/pack.types'
import { registerMenuItems, registerMenuSubmenus, type MenuItem } from '@/config/menu'

/**
 * 前端包定义：声明式清单 + 代码形态贡献（路由/菜单）。
 * 组件文件原地不动，routes 里仍 `() => import('@/views/...')` 懒加载。
 */
export interface RendererPackDefinition {
  manifest: PackManifest
  routes: RouteRecordRaw[]
  menuItems?: MenuItem[]
  /** 主菜单插入锚点：合入到该 path 菜单项之前（缺省追加到末尾），保持历史菜单顺序 */
  menuInsertBefore?: string
  /**
   * 二级菜单（key = 父项 path）：注册进独立的 menuSubmenus 注册表，
   * 仅侧边栏悬停浮层消费——数据不进 mainMenuItems，子项不可能被渲染成顶级菜单。
   */
  menuSubmenus?: Record<string, MenuItem[]>
}

/**
 * 启用态表：packId → PackInfo。
 * null 表示启用态未拉取（IPC 失败/超时），此时降级为全启用。
 */
export type PackInfoMap = Record<string, PackInfo> | null

/** 后端已感知的包：enabled 且非 pending/disabled/failed 才可用 */
function isInfoUsable(info: PackInfo): boolean {
  if (!info.enabled) return false
  return info.state !== 'pending' && info.state !== 'disabled' && info.state !== 'failed'
}

/**
 * 判断单个包是否可用（启用态 + 依赖就绪）。纯函数，供 applyPacks 与单测使用。
 * @param infos null = 启用态未拉到（降级全启用）；否则按 PackInfo 裁决，
 *              未出现在表中的包视为"后端未感知"，按 manifest.defaultEnabled 处理。
 */
export function isPackUsable(manifest: PackManifest, infos: PackInfoMap): boolean {
  const self = infos?.[manifest.id]
  if (self) {
    if (!isInfoUsable(self)) return false
  } else if (infos && manifest.defaultEnabled === false) {
    return false
  }
  // 依赖就绪判定（纪律 2：依赖未就绪 = pending，不注册其贡献）；
  // 依赖未被后端感知时视为就绪（后端包迁移完成前的前端自治期）
  for (const depId of manifest.dependencies ?? []) {
    const dep = infos?.[depId]
    if (dep && !isInfoUsable(dep)) return false
  }
  return true
}

/** 已登记的包（响应式；enabledPacks 据此计算） */
const packs = reactive<RendererPackDefinition[]>([])

/** 后端启用态（null = 未拉到，降级全启用） */
const packInfos = ref<PackInfoMap>(null)

/** applyPacks 幂等标记（路由/菜单只允许合入一次） */
let applied = false

/** 当前可用的包（启用态 + 依赖就绪过滤后），响应式 */
export const enabledPacks: ComputedRef<RendererPackDefinition[]> = computed(() =>
  packs.filter(pack => isPackUsable(pack.manifest, packInfos.value))
)

/**
 * 登记前端包（manifest 非法 / 重复注册 → 抛 PackManifestError，fail-fast）。
 * 只做登记，不碰路由/菜单——统一由 applyPacks 一次性应用。
 */
export function registerPack(def: RendererPackDefinition): void {
  validatePackManifest(def.manifest)
  const id = def.manifest.id
  if (packs.some(p => p.manifest.id === id)) {
    throw new PackManifestError(`包 "${id}" 重复注册`, id)
  }
  packs.push(def)
}

/**
 * 写入后端启用态（pack:list 的结果）。
 * 传 null 表示拉取失败 → 降级全启用（见模块头注释）。
 */
export function setPackInfos(infos: PackInfo[] | null): void {
  packInfos.value = infos
    ? Object.fromEntries(infos.map(info => [info.id, info]))
    : null
}

/** 列出全部已登记包（含不可用包；管理界面/调试用） */
export function listRegisteredPacks(): readonly RendererPackDefinition[] {
  return packs
}

/**
 * 一次性应用包贡献（幂等，重复调用直接返回）：
 * 对每个可用包 router.addRoute() 注册路由，并把菜单项合入菜单注册表。
 * 必须在 app.use(router) 之前调用，否则首屏导航解析不到包路由。
 */
export function applyPacks(router: Router): void {
  if (applied) return
  applied = true
  for (const pack of enabledPacks.value) {
    for (const route of pack.routes) {
      router.addRoute(route)
    }
    if (pack.menuItems?.length) {
      registerMenuItems(pack.menuItems, { before: pack.menuInsertBefore })
    }
    if (pack.menuSubmenus) {
      for (const [parentPath, items] of Object.entries(pack.menuSubmenus)) {
        registerMenuSubmenus(parentPath, items)
      }
    }
  }
}

/** 测试专用：清空注册表与启用态，恢复未装配状态 */
export function __resetPackRegistryForTests(): void {
  packs.splice(0, packs.length)
  packInfos.value = null
  applied = false
}
