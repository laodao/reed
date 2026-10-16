/**
 * 领域共学空间后端业务包
 * @module core/packs/domain-learning
 *
 * 物理收拢式：handlers 在 ./handlers/domain-learning.handler（dl: 前缀通道），
 * 本包 activate 时调用 registerDomainLearningHandlers()。业务服务（project/graph/
 * view + agent 宿主）放 ./services；领域数据在 dl_* 表（core/database，设计 §9）；
 * agent 能力基于 agent-harness 平台件复用（createHostKit + 共享工具 registry），
 * 不自研 agent。
 *
 * manifest 的 id/name/version 与前端骨架（renderer/packs/domain-learning）保持一致。
 * 依赖：workflow（宿主 harness/skill 装配在其 boot）、knowledge-base（资料全文）、
 * skills（SKILL.md 体系与 invoke_skill 工具）。
 */

import { registerDomainLearningHandlers } from './handlers/domain-learning.handler'
import type { PackDefinition } from '../registry'

export const domainLearningPack: PackDefinition = {
  manifest: {
    id: 'domain-learning',
    name: '领域学习',
    version: '0.1.0',
    description: '领域共学空间——围绕一个领域自主研究并教到用户会（基于 agent-harness）',
    dependencies: ['workflow', 'knowledge-base', 'skills'],
    contributions: {
      ipcChannelPrefixes: ['dl:'],
    },
  },
  activate() {
    registerDomainLearningHandlers()
  },
}
