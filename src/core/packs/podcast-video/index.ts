/**
 * 播客视频内置业务包（后端接线）
 * @module core/packs/podcast-video
 * @description 播客视频（幻灯片 + 口播讲解 → 成片）业务收拢：
 *              工作流本体是 builtin 工作流 JSON（migrations/builtin-apps/podcast-video.json，
 *              数据层，经内置应用通用机制登记）；本包只承载该业务的专用节点
 *              （slide-render / podcast-compose）与幻灯片版式/时间轴纯函数（./slides/）。
 *
 *              分层纪律（2026-10-06 用户纪律）：业务只经通用机制调用工作流引擎能力，
 *              业务 handler 不进平台注册表——activate 时经 registerPackNodeHandlers()
 *              注入（boot 序：pack 先于工作流子系统，赶在注册表装配与一致性自检之前）。
 *              ffmpeg 调用、LLM、TTS、sharp-worker 均复用平台既有基础能力，本包零引擎改动。
 */

import { registerPackNodeHandlers } from '@core/platform/workflow/nodes'
import { PODCAST_WORKFLOW_NODE_HANDLERS } from './workflow-nodes'
import type { PackDefinition } from '../registry'

export const podcastVideoPack: PackDefinition = {
  manifest: {
    id: 'podcast-video',
    name: '播客视频',
    version: '1.0.0',
    description: '文案 → 幻灯片核心要点 + 逐页口播配音 → 按配音时长对齐合成的播客视频',
  },
  activate() {
    // 业务专用工作流节点：经平台扩展点注册，先于工作流子系统装配
    registerPackNodeHandlers(PODCAST_WORKFLOW_NODE_HANDLERS)
  },
}
