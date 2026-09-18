/**
 * 知识库内置业务包（后端接线）
 * @module core/packs/knowledge-base
 * @description 物理收拢式：handler 已搬入包目录（./handlers/knowledge-base.handler，
 *              knowledge-base:* 19 个 + kb:* 4 个 + kb-qa:* 7 个 channel），
 *              本包在 activate 时调用其 registerKnowledgeBaseHandlers()。
 *              知识库服务层（@core/platform/services/knowledge-base.service 与 vector/lancedb）
 *              被工作流 kb-retrieve 节点等平台能力共用，留在原地不搬。
 *              manifest 的 id/name/version 与前端骨架（renderer/packs/knowledge-base）
 *              保持一致。
 *
 *              已知跨业务软耦合（只记录，不做硬依赖——主功能不依赖 KB，禁用时
 *              对应入口降级报错即可）：
 *              1. chat 包的 ChatInput/ChatMain/MessageItem 运行时调
 *                 knowledge-base:list / addDocument（对话挂知识库、消息存 KB）；
 *              2. diary 包的 KbPickerDialog 运行时调 knowledge-base:list / addDocument
 *                 （日记关联知识库）。
 *
 *              禁用语义本期到"IPC 守卫统一拦截 knowledge-base: / kb: / kb-qa: 三前缀"为止——
 *              handler 注册保留、服务单例不卸载，故 activate 不返回 disposer。
 */

import { registerKnowledgeBaseHandlers } from './handlers/knowledge-base.handler'
import { registerKbBrainHandlers } from './handlers/kb-brain.handler'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'
import type { PackDefinition } from '../registry'

export const knowledgeBasePack: PackDefinition = {
  manifest: {
    id: 'knowledge-base',
    name: '知识库',
    version: '1.0.0',
    description: '个人知识管理与检索——文档解析/向量化/QA 库',
    contributions: {
      // 三段独立前缀：'kb-qa:' 不以 'kb:' 开头
      ipcChannelPrefixes: ['knowledge-base:', 'kb:', 'kb-qa:'],
    },
  },
  activate() {
    registerKnowledgeBaseHandlers()
    registerKbBrainHandlers()
    // 知识大脑 P1 消化流水线装配（review P0 修复：此前零调用方，流水线整体不可达）
    import('@core/platform/services/kb-brain/digest-orchestrator.service').then(({ installKbBrainDigest }) => {
      installKbBrainDigest({ kbService: new KnowledgeBaseService() })
    })
  },
}
