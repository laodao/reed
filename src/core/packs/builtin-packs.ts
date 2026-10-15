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
 *              the-chat-bot 分支裁剪（2026-10-15）：本分支为「对话机器人」产品形态，
 *              只保留 chat/知识库/工作流(含 Agent)/日记四业务包；图像生成/文档翻译/
 *              语音助手为平台级 handler（image:/translation:/voice: 前缀留壳），
 *              不经包注册。其余业务包已随分支裁剪移除，从 dev 同步时按模块白名单合入。
 */

import type { PackDefinition } from './registry'
import { diaryPack } from './diary'
import { chatPack } from './chat'
import { workflowPack } from './workflow'
import { knowledgeBasePack } from './knowledge-base'

export const builtinPacks: PackDefinition[] = [
  diaryPack,
  chatPack,
  workflowPack,
  knowledgeBasePack,
]
