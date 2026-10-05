/**
 * 应用菜单单一数据源（注册表模式）
 * @module config/menu
 *
 * MainLayout 侧边栏和 Home 首页功能入口共用这份菜单定义，
 * 保证两处入口永远一致（历史上两处各自复制一份，频繁漂移）。
 *
 * 业务包架构（P3）改造：菜单从静态常量改为「壳条目 + 注册表」——
 * 壳条目（首页；设置在底部菜单 footerMenuItems）留在本文件；
 * 二期（2026-09-05）后知识库/工作流/应用/资产中心也已包化，
 * 全部业务包的菜单条目由 src/renderer/src/packs/<name>/index.ts 声明，
 * 装配时经 registerMenuItems() 合入。mainMenuItems 为响应式数组，
 * MainLayout/Home 的 computed 消费方无需改动即可自动刷新。
 *
 * 二级菜单（2026-09-25 结构性修订，复盘两次回归）：
 * 子菜单数据**不放进** MenuItem/主菜单注册表——mainMenuItems 里只有顶级项，
 * 子项走独立的 menuSubmenus 注册表（registerMenuSubmenus / getMenuSubmenu），
 * 仅侧边栏悬停浮层（MainLayout hover flyout）消费。
 * 此前两版把 children 挂在 MenuItem 上，先后被拍平渲染成顶级图标两次，
 * 属结构性缺陷；现在顶级数据里根本不存在子项，任何消费方都无法再拍平。
 *
 * 字段说明：
 * - hidden：整项不显示（功能开发中暂不暴露入口；路由仍可访问）
 * - description：首页功能卡片的一句描述（侧边栏不用）
 */

import { markRaw, reactive } from 'vue'
import {
  HomeFilled,
  Setting,
} from '@element-plus/icons-vue'

export interface MenuItem {
  path: string
  label: string
  icon: any
  /** 首页功能卡片描述 */
  description?: string
  /** 整项隐藏，路由仍可访问 */
  hidden?: boolean
}

/** registerMenuItems 的定位选项 */
export interface RegisterMenuItemsOptions {
  /**
   * 插入锚点：合入到该 path 的菜单项之前；找不到锚点时追加到末尾。
   * 用于保持业务包菜单的历史排列位置（避免包化后菜单顺序漂移）。
   */
  before?: string
}

/**
 * 壳主菜单（本文件私有）：只含壳功能的条目。
 * 业务包条目不经由这里——由 registerMenuItems 在装配期合入 mainMenuItems。
 */
const shellMainMenuItems: MenuItem[] = [
  {
    path: '/',
    label: '首页',
    icon: markRaw(HomeFilled)
  }
]

/**
 * 主菜单（侧边栏 + 首页共用，响应式注册表）：
 * 初始为壳条目；业务包条目在 installBuiltinPackages() 时装配合入。
 * 只有顶级项——子菜单在 menuSubmenus，不在这里。
 */
export const mainMenuItems: MenuItem[] = reactive([...shellMainMenuItems])

/**
 * 二级菜单注册表（key = 父项 path）。仅 MainLayout 悬停浮层消费；
 * 数据不进 mainMenuItems，杜绝子项被任何消费方渲染成顶级菜单。
 */
const menuSubmenus = reactive<Record<string, MenuItem[]>>({})

/** 注册某父项的二级菜单（业务包装配时调用；同 key 重复注册以最后一次为准） */
export function registerMenuSubmenus(parentPath: string, items: MenuItem[]): void {
  menuSubmenus[parentPath] = items
}

/** 读某父项的二级菜单（无则返回空数组） */
export function getMenuSubmenu(parentPath: string): MenuItem[] {
  return menuSubmenus[parentPath] ?? []
}

/**
 * 注册菜单项（业务包装配时调用）。
 * opts.before 指定锚点 path：插入到该菜单项之前，找不到则追加到末尾。
 */
export function registerMenuItems(items: MenuItem[], opts: RegisterMenuItemsOptions = {}): void {
  const anchorIndex = opts.before
    ? mainMenuItems.findIndex(item => item.path === opts.before)
    : -1
  if (anchorIndex >= 0) {
    mainMenuItems.splice(anchorIndex, 0, ...items)
  } else {
    mainMenuItems.push(...items)
  }
}

/** 底部菜单（仅侧边栏使用） */
export const footerMenuItems: MenuItem[] = [
  {
    path: '/settings',
    label: '设置',
    icon: markRaw(Setting)
  }
]

/**
 * 可见菜单列表（侧边栏纯图标模式 / 首页功能卡片共用）：
 * 只过滤 hidden。返回的必然是顶级项——子菜单不在数据源里，无需（也无法）拍平。
 */
export function visibleMenuItems(items: MenuItem[]): MenuItem[] {
  return items.filter(item => !item.hidden)
}

/** 测试专用：恢复为仅壳条目（清空各测试用例合入的包菜单与子菜单） */
export function __resetMainMenuForTests(): void {
  mainMenuItems.splice(0, mainMenuItems.length, ...shellMainMenuItems)
  for (const key of Object.keys(menuSubmenus)) {
    delete menuSubmenus[key]
  }
}
