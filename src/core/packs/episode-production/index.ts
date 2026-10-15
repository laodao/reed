/**
 * 剧集制作内置业务包（后端接线）
 * @module core/packs/episode-production
 * @description 物理收拢式：handler 目录已整体搬入包目录（./handlers/ 下
 *              project/episode/asset/narrative/render/compose/workflow/agent 共
 *              25 个 handler 文件），本包在 activate 时调用其统一入口
 *              registerEpisodeProductionHandlers()。业务服务层
 *              （@core/platform/episode-production/**）被 Web 端 upload-router 等
 *              壳代码直接引用且为双端共用，留在原地不搬。
 *              manifest 的 id/name/version/dependencies 与前端骨架
 *             （renderer/packs/episode-production）保持一致。
 *
 *              归属说明：episode-production handler 目录全部 175 个 channel 均为 ep:* 前缀
 *              （含 ep:asset:* / ep:agent:* / ep:storyboard:* / ep:reference-video:* /
 *              ep:user-asset:* 等二级前缀，均落在 ep: 之下；散落的
 *              ep:is-binding-from-longwriting 虽语义上查询长文写作绑定来源，但 channel
 *              本身由 EP handler 注册，仍归本包），单前缀即可完整覆盖。
 *
 *              已知跨业务耦合（本期只记录，不拆分）：
 *              1. Agent 工作流服务（core/platform/episode-production/agent/
 *                 ep-agent-workflow.service）复用长文写作的 lw_design_messages 表存储对话
 *                 历史（conversationId 约定 ep-agent:${episodeId}[:${scope}]，scope=界面域），
 *                 表结构归长文写作所有。
 *              2. 前端引用 voice-design 包的 VoiceCloneDialog 组件
 *                 （AssetStageView.vue:157 / AssetStageViewV2.vue:235），故 manifest
 *                 显式声明 dependencies: ['voice-design']——声音设计包被禁用/未就绪时，
 *                 本包整体 pending（纪律 2：依赖未就绪 = pending）。
 *
 *              禁用语义本期到"IPC 守卫统一拦截 ep:*"为止——handler 注册保留、
 *              服务单例不卸载（静态类无法卸载），故 activate 不返回 disposer。
 */

import { registerEpisodeProductionHandlers } from './handlers'
import type { PackDefinition } from '../registry'

export const episodeProductionPack: PackDefinition = {
  manifest: {
    id: 'episode-production',
    name: '剧集制作',
    version: '1.0.0',
    description: '剧本生成与视频制作',
    dependencies: ['voice-design'],
    contributions: {
      // episode-production handler 目录全部 175 个 channel 均为 ep:* 前缀
      ipcChannelPrefixes: ['ep:'],
    },
  },
  activate() {
    registerEpisodeProductionHandlers()
  },
}
