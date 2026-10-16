/**
 * 功能开关（模块级）运行时读取
 * @module shared/constants/features
 * @description 单一事实源是仓库根目录的 `features.config.json`（产品形态裁决：
 *              哪些业务包/能力入口参与装配）。此处只做读取与查询封装：
 *              - 渲染层：包注册（renderer/packs）跳过禁用包 → 路由/菜单/视图 chunk 不加载；
 *              - 主进程/Web：包注册（core/packs）跳过禁用包 → handler/IPC 不注册；
 *              - 设置页「参数设置」按模块 feature 隐藏 Tab；界面局部（如应用入口）按需引用。
 *
 *              纪律：
 *              - 判断一律用 isModuleEnabled(id)，不要直接读 FEATURE_MODULES（保留
 *                「未登记 = 启用」的缺省语义，新增模块忘记登记时行为与 dev 全量一致）；
 *              - 未知模块 id 视为启用（fail-open）：配置文件缺项不至于裁掉功能。
 */
import featuresConfig from '../../../features.config.json'

/** 模块开关表（features.config.json 的 modules 段） */
export const FEATURE_MODULES: Record<string, boolean> = featuresConfig.modules ?? {}

/** 判断模块是否启用（未登记 = 启用；显式 false = 禁用） */
export function isModuleEnabled(moduleId: string): boolean {
  return FEATURE_MODULES[moduleId] !== false
}

/** 已启用的模块 id 列表（诊断/管理界面用） */
export function enabledModuleIds(): string[] {
  return Object.entries(FEATURE_MODULES).filter(([, v]) => v !== false).map(([k]) => k)
}
