/**
 * 内置业务包清单（双端共用）
 * @module core/packs/builtin-packs
 * @description 现有业务收编为内置包的登记处：Electron（src/electron/index.ts）
 *              与 Web（src/web/server/index.ts）启动时把它交给 initPackSubsystem()，
 *              由包内核统一注册/激活（IPC handler 在包 activate 时登记，替代原先的
 *              initIpcHandlers()/registerAllWebChannels() 平铺调用）。
 *              物理搬迁（2026-08-29）：7 个包的 handler 及单包专属 service 已搬入各自
 *              包目录（handlers/、services/ 子目录），包边界实体化；被壳/他包/Web 端
 *              共用的 service 收在 @core/platform（services/workflow/episode-production/assets/providers）。
 *
 *              批次记录：
 *              - P4 第一批：skills / diary / portrait（最薄的三个，handler 零改动迁移）。
 *              - P4 第二批：chat（chat/dialog/message/role 四 handler）/ voice-design（voice）。
 *              - P4 第三批：longwriting（longwriting.handler 单文件 202 个 channel）。
 *              - P4 第四批：episode-production（episode-production/ 目录 25 个 handler
 *                文件 175 个 channel，统一入口 registerEpisodeProductionHandlers）。
 *              - 二期（2026-09-05）：workflow（27 个 wf: 前缀）/ app（12 个 app: +
 *                8 个 app-session: 前缀，dependencies: ['workflow']）/ knowledge-base
 *                （knowledge-base: / kb: / kb-qa: 三前缀共 30 个）/ asset-center
 *                （18 个 asset: 前缀）四包迁移；settings/api-key/provider-config/
 *                data-path/image/file/translation/export/search-engine/tool/email/
 *                news-source/favicon/oss/datasource/event-admin 等平台级 handler
 *                按裁决留壳（无独立业务界面或禁用即自残）。
 *
 *              功能开关（2026-10-15）：登记清单按 features.config.json 过滤——禁用的
 *              包不注册（handler/IPC 不进运行时）。从 dev 同步代码到裁剪分支（如
 *              the-chat-bot）无需改本文件，只维护 features.config.json。动态 import
 *              使禁用包的代码不进入启动加载路径。
 */

import type { PackDefinition } from './registry'
import { isModuleEnabled } from '@shared/constants/features'

/**
 * 按功能开关加载内置包清单。
 * 顺序 = 注册顺序（app 依赖 workflow，登记在其后只为可读性；registry 对未就绪
 * 依赖按 pending 处理，与顺序无关）。
 */
export async function loadBuiltinPacks(): Promise<PackDefinition[]> {
  const defs: PackDefinition[] = []
  const add = async (id: string, load: () => Promise<PackDefinition>): Promise<void> => {
    if (!isModuleEnabled(id)) return
    defs.push(await load())
  }

  await add('diary', () => import('./diary').then((m) => m.diaryPack))
  await add('chat', () => import('./chat').then((m) => m.chatPack))
  await add('workflow', () => import('./workflow').then((m) => m.workflowPack))
  await add('knowledge-base', () => import('./knowledge-base').then((m) => m.knowledgeBasePack))
  await add('skills', () => import('./skills').then((m) => m.skillsPack))
  await add('portrait', () => import('./portrait').then((m) => m.portraitPack))
  await add('voice-design', () => import('./voice-design').then((m) => m.voiceDesignPack))
  await add('longwriting', () => import('./longwriting').then((m) => m.longwritingPack))
  await add('episode-production', () => import('./episode-production').then((m) => m.episodeProductionPack))
  await add('app', () => import('./app').then((m) => m.appPack))
  await add('asset-center', () => import('./asset-center').then((m) => m.assetCenterPack))
  await add('domain-learning', () => import('./domain-learning').then((m) => m.domainLearningPack))
  await add('info-collection', () => import('./info-collection').then((m) => m.infoCollectionPack))
  // 播客视频（slide-render/podcast-compose 业务节点；无 IPC 前缀，无依赖）
  await add('podcast-video', () => import('./podcast-video').then((m) => m.podcastVideoPack))

  return defs
}
