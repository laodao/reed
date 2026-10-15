/**
 * 信息搜集后端业务包
 * @module core/packs/info-collection
 *
 * 设计：docs/design/2026-10-07-info-collection-design.md（主设计 v3）+
 *       2026-10-07-info-collection-storage-design.md（存储专项）。
 * 物理收拢式（与 domain-learning 同款）：handlers 在 ./handlers（ic: 前缀通道），
 * activate 时调用 registerInfoCollectionHandlers()；业务服务在 ./services
 * （blueprint 起草 / collection 编排 / defaults 生产缺省装配）。
 *
 * 内容唯一存储在知识库（项目 kb_id）；ic_* 五表只存过程治理元数据。
 * 通用性纪律：代码不认识任何领域（人口/政策/财报…），领域差异全部在
 * 运行时 AI 起草的采集蓝图 JSON 里。
 */

import { registerInfoCollectionHandlers } from './handlers/info-collection.handler'
import type { PackDefinition } from '../registry'

export const infoCollectionPack: PackDefinition = {
  manifest: {
    id: 'info-collection',
    name: '信息搜集',
    version: '0.1.0',
    description: '信息搜集中心——任意主题的条目级、带溯源、可增量刷新的研究资料库（落知识库复用）',
    dependencies: ['workflow', 'knowledge-base'],
    contributions: {
      ipcChannelPrefixes: ['ic:'],
    },
  },
  activate() {
    registerInfoCollectionHandlers()
  },
}
