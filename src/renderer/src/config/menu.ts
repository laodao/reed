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
 * 字段说明：
 * - hidden：整项（含子项）不显示（功能开发中暂不暴露入口；路由仍可访问）
 * - hideSelf：仅父项自身不显示，子项照常列出（纯分组父项）
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
  children?: MenuItem[]
  /** 整项隐藏（含子项），路由仍可访问 */
  hidden?: boolean
  /** 仅隐藏自身，子项照常显示（纯分组父项） */
  hideSelf?: boolean
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
 * 消费方（MainLayout/Home）经 computed + flattenMenuItems 使用，自动响应合入。
 */
export const mainMenuItems: MenuItem[] = reactive([...shellMainMenuItems])

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
 * 展开菜单为平铺列表（侧边栏纯图标模式 / 首页功能卡片共用）：
 * - hidden：整项（含子项）过滤
 * - hideSelf：父项自身过滤，子项保留
 */
export function flattenMenuItems(items: MenuItem[]): MenuItem[] {
  const flat: MenuItem[] = []
  for (const item of items) {
    if (item.hidden) continue
    if (!item.hideSelf) {
      flat.push(item)
    }
    if (item.children) {
      flat.push(...item.children.filter(c => !c.hidden))
    }
  }
  return flat
}

/** 测试专用：恢复为仅壳条目（清空各测试用例合入的包菜单） */
export function __resetMainMenuForTests(): void {
  mainMenuItems.splice(0, mainMenuItems.length, ...shellMainMenuItems)
}
