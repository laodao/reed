/**
 * 应用内置业务包（后端接线）
 * @module core/packs/app
 * @description 物理收拢式：handler 已搬入包目录（./handlers/app.handler，
 *              app:* 12 个 + app-session:* 8 个 channel），本包在 activate 时
 *              调用其 registerAppHandlers()。
 *              应用 = 工作流的发布产物（apps 表 share_token → 回源 workflow 定义），
 *              故 manifest 显式声明 dependencies: ['workflow']——工作流包被禁用/
 *              未就绪时，本包整体 pending（纪律 2：依赖未就绪 = pending）。
 *              业务服务层（app-definition/app-session）已收拢进本包 services/ 下
 *              （由壳中 workflow-boot 经别名实例化，双端共用）。
 *              manifest 的 id/name/version 与前端骨架（renderer/packs/app）保持一致。
 *
 *              禁用语义本期到"IPC 守卫统一拦截 app: / app-session: 两前缀"为止——
 *              handler 注册保留、服务单例不卸载，故 activate 不返回 disposer。
 */

import { registerAppHandlers } from './handlers/app.handler'
import { registerAppDataHandlers } from './handlers/app-data.handler'
import type { PackDefinition } from '../registry'

export const appPack: PackDefinition = {
  manifest: {
    id: 'app',
    name: '应用',
    version: '1.0.0',
    description: '已发布的工作流应用——会话/分享/API 分发',
    dependencies: ['workflow'],
    contributions: {
      // app: / app-session: / app-data: 是三段独立前缀（'app-session:'、'app-data:' 不以 'app:' 开头）
      ipcChannelPrefixes: ['app:', 'app-session:', 'app-data:'],
    },
  },
  activate() {
    registerAppHandlers()
    registerAppDataHandlers()
  },
}
