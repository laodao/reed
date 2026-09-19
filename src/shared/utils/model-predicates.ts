/**
 * 模型能力判定谓词（跨层共用）
 * @module shared/utils/model-predicates
 *
 * 「对话模型」的判定规则此前散落三处（ai-call / provider-adapter / kb 模型设置），
 * 收敛为一个谓词：type 为 text（或缺省）且 features 声明 chat。
 */

/** 判定入参取 ModelDefinition 的结构子集（调用方常持宽松形状，不强绑全量类型） */
export type ChatModelLike = { id?: string; type?: string; features?: string[] }

/** 是否对话模型（与 LLM provider 侧选型规则一致） */
export function isChatModel(m: ChatModelLike | null | undefined): boolean {
  return (
    !!m?.id && (m.type === 'text' || !m.type) && Array.isArray(m.features) && m.features.includes('chat')
  )
}

/**
 * 是否可作为对话模型列出（清单语义，供模型设置下拉）。
 * = ai-call 选型链 tier-1 ∪ tier-2 的集合版：任意 text（或缺省）模型都可用作宿主对话，
 * 另含 multimodal+chat（视觉理解主力款同样是对话模型，如百炼 qwen3.8-max 模板形态）。
 */
export function isListableChatModel(m: ChatModelLike | null | undefined): boolean {
  if (!m?.id) return false
  if (m.type === 'text' || !m.type) return true
  return m.type === 'multimodal' && Array.isArray(m.features) && m.features.includes('chat')
}
