/**
 * 上下文管理器：四层装配（实现 Session 的 onBeforeSend 钩子）
 * @module core/agent/context/context-manager
 *
 * 每次模型调用前把消息序列装配为四层（各有 token 预算，可配置）：
 *
 *   L1 system        人设+规则+当轮相关快照（durable，来自 buildStateSnapshot——
 *                    原则：快照由工具落库后的数据重建，不由 AI 复述，防漂移）
 *   L2 session 摘要   早期对话的滚动压缩（依赖 Session 自动压缩的 [Previous conversation summary]
 *                    前缀消息，spike 已验证其事件链 compaction.start→summary→done）
 *   L3 近 N 轮       全量原文（默认保留最近 20 条）
 *   L4 当轮输入      用户原话
 *
 * 超预算策略：L3 从最旧开始折叠进 L2；工具结果文本截断（qm 的 head/tail 切片法）。
 * 崩溃恢复：历史中的中断工具调用注入哨兵标记
 *   "[interrupted — 结果未记录，先核实实际状态再重做]"（设计借 qm context-compaction.ts，MIT）。
 */

export function createContextManager() {
  throw new Error('M0: 待实现')
}
