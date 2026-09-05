/**
 * 业务状态快照接口
 * @module core/agent/context/state-snapshot
 *
 * AgentDefinition.buildStateSnapshot 的约定与工具函数：
 * - 输出为纯文本（进入 system 层），业务方自行决定粒度
 * - 参考格式（旧 stateToSummary 已验证可用，agent-context.ts）：
 *     故事概要：《洗冤录》（武侠·复仇）核心冲突：…
 *     人物：3 位（林晓、顾长风、谢无咎）
 *     故事线：1 条（洗冤主线）；大纲：24 节点，未写 24；章节：0 章
 * - 缓存：同一轮内多次工具调用后只重建一次（由 runtime/session-factory 编排）
 */

export interface StateSnapshotBuilder {
  (scopeId: string): Promise<string>
}
