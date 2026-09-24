/**
 * KB 向量 chunkId 命名空间（详细设计 §5.1）
 * @module platform/services/kb-brain/vector-namespace
 *
 * kb_vectors.chunkId 是多命名空间键：裸 id=原文切片，'qa:'=问答对（存量先例），
 * 'atom:'=论断，'note:'=卡片。文档检索必须剔除 qa:（存量行为），brain 检索
 * 按 include 分流。注册表集中定义，防止前缀字符串散落。
 */

export const KB_VECTOR_NS = {
  chunk: '',
  qa: 'qa:',
  atom: 'atom:',
  note: 'note:',
  /** 实体演化摘要（T13a 入池） */
  ent: 'ent:',
} as const

export type KbVectorNamespace = keyof typeof KB_VECTOR_NS

/** 解析 chunkId 的命名空间；未知带前缀形态按 chunk 处理（防御） */
export function parseVectorNamespace(chunkId: string): { ns: KbVectorNamespace; id: string } {
  if (chunkId.startsWith(KB_VECTOR_NS.qa)) return { ns: 'qa', id: chunkId.slice(KB_VECTOR_NS.qa.length) }
  if (chunkId.startsWith(KB_VECTOR_NS.atom)) return { ns: 'atom', id: chunkId.slice(KB_VECTOR_NS.atom.length) }
  if (chunkId.startsWith(KB_VECTOR_NS.note)) return { ns: 'note', id: chunkId.slice(KB_VECTOR_NS.note.length) }
  return { ns: 'chunk', id: chunkId }
}

/** 文档检索须剔除的向量命名空间（qa 存量先例；brain 行由 include 决定，不走此表） */
export const DOC_SEARCH_EXCLUDED_NS: KbVectorNamespace[] = ['qa']
