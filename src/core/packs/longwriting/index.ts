/**
 * 长文写作内置业务包（后端接线）
 * @module core/packs/longwriting
 * @description 物理收拢式：handler 已搬入包目录（./handlers/longwriting.handler），
 *              其专属的 LongWritingService / MaterialProcessorService / LwMigrationService
 *              一并搬入（./services/）；LongWritingAIService 与 AgentWorkflowService 被
 *              剧集制作包的 Agent 工作流复用，收在 @core/platform/services。
 *              本包在 activate 时调用 registerLongWritingHandlers()。
 *              manifest 的 id/name/version 与前端骨架（renderer/packs/longwriting）保持一致。
 *
 *              归属说明：longwriting.handler 一个文件承载长文写作全业务（项目/设定/角色/势力/
 *              地图/情节/大纲/章节/素材/字典/记忆/实体快照/向量索引/图谱/事件/向导/Agent 等），
 *              全部 202 个 channel 均为 longwriting:* 前缀（含 longwriting:vectorIndex:* /
 *              longwriting:graph:* / longwriting:event:* / longwriting:wizard:* /
 *              longwriting:agent:* 等二级前缀，均落在 longwriting: 之下），单前缀即可完整覆盖。
 *
 *              已知跨业务耦合（本期不动，EP 包迁移时处理）：
 *              episode-production 的 Agent 工作流服务（core/platform/episode-production/agent/
 *              ep-agent-workflow.service）复用本业务的 lw_design_messages 表存储对话历史
 *              （conversationId 约定 ep-agent:${episodeId}），表结构归长文写作所有。
 *
 *              禁用语义本期到"IPC 守卫统一拦截 longwriting:*"为止——handler 注册保留、
 *              服务单例不卸载（静态类无法卸载），故 activate 不返回 disposer。
 */

import { registerLongWritingHandlers } from './handlers/longwriting.handler'
import type { PackDefinition } from '../registry'

export const longwritingPack: PackDefinition = {
  manifest: {
    id: 'longwriting',
    name: '长文写作',
    version: '1.0.0',
    description: 'AI 辅助长篇小说创作',
    contributions: {
      // longwriting.handler.ts 全部 202 个 channel 均为 longwriting:* 前缀
      ipcChannelPrefixes: ['longwriting:'],
    },
  },
  activate() {
    registerLongWritingHandlers()
  },
}
