/**
 * 结构化知识提供方契约（KE-4，34 号 v2 §4.2）
 * @module platform/agent-runtime/memory/structured-provider
 *
 * 知识飞轮统一对外检索接口的结构化通道：业务模块（首个=长文图谱）把确定性事实
 * 以 KnowledgeSegment 形式供给装配层。存储不收编（图谱表留在各域），检索面统一。
 */

export interface KnowledgeSegment {
  layer: 'L3'
  kind: 'structured-fact'
  /** 已序列化的紧凑事实文本（装配预算内直接使用） */
  text: string
  source: { provider: string; ref: string }
}

export interface StructuredKnowledgeScope {
  bizModule?: string
  projectId?: string
}

export interface StructuredKnowledgeQuery {
  scope: StructuredKnowledgeScope
  /** 装配目标提取的实体/主题词（provider 自行做名称→实体解析与容错） */
  topics: string[]
  budget: { maxSegments: number; maxChars: number }
  signal?: AbortSignal
}

export interface StructuredKnowledgeProvider {
  readonly id: string
  supports(scope: StructuredKnowledgeScope): boolean
  query(req: StructuredKnowledgeQuery): Promise<KnowledgeSegment[]>
}

/** 单实现注册表（KE-4 守约：抽象按真实消费者数划定——当前仅长文图谱，不做插件中心） */
const providers: StructuredKnowledgeProvider[] = []

export function registerStructuredProvider(p: StructuredKnowledgeProvider): void {
  const i = providers.findIndex((x) => x.id === p.id)
  if (i >= 0) providers[i] = p
  else providers.push(p)
}

export function listStructuredProviders(): StructuredKnowledgeProvider[] {
  return [...providers]
}
