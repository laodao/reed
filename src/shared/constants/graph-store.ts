/**
 * 统一图存储·库名与节点 kind 约定（docs/design/2026-10-10-unified-graph-store-design.md §3）
 * @module shared/constants/graph-store
 *
 * 库名是 graph_edges.graph_name 的字符串命名空间，格式 {module}:{scopeKey}。
 * 各业务经这里的一等 builder 取名，禁止裸字符串拼名散落业务代码。
 * 不需要 registry 表：listGraphs 用 DISTINCT 派生，removeGraph 按名级联删边。
 */

/** 库名 builder（迁移回填使用同一套模板，改动必须两侧同步） */
export const GraphNames = {
  /** 长文·项目主图谱 */
  lwProject: (projectId: string): string => `lw:project:${projectId}`,
  /** 长文·角色 IP 库（用户级，无项目作用域） */
  lwIp: (): string => 'lw:ip',
  /** 长文·世界观库 */
  lwWorld: (worldId: string): string => `lw:world:${worldId}`,
  /** 知识大脑 */
  kb: (knowledgeBaseId: string): string => `kb:${knowledgeBaseId}`,
  /** 领域共学空间 */
  dlProject: (projectId: string): string => `dl:project:${projectId}`,
} as const

/** 节点 kind 约定（各业务自治，此处登记长文/KB/DL 现行值，防漂移） */
export const GraphNodeKinds = {
  /** 长文主图谱实体类型（同 lw_graph_edges.source_type 现值） */
  lw: ['character', 'location', 'item', 'faction', 'skill', 'event'] as const,
  /** 知识大脑边端点（同 kb_knowledge_edges.kind 现值） */
  kb: ['atom', 'note', 'entity'] as const,
  /** 领域学习（dl_relation 恒指 dl_concept） */
  dl: 'concept',
  /** IP 库人物 */
  ip: 'ip_character',
  /** 世界观条目 */
  world: 'world_entry',
} as const
