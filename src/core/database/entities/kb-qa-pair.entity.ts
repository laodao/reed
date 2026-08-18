import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * QA 问答对 Entity（D1 QA 知识库）
 *
 * 一行 = 一条问答对。question 与 similarQuestions 全部向量化入
 * IVectorStore（chunkId 命名空间 `qa:<pairId>:<variantIndex>`），
 * 命中即直出 answer（不过 LLM——与 RAG 文档路径并存的 Bisheng 双路径）。
 *
 * 多租户：userId 列由 BaseRepository 自动注入（Web 端 ALS / PC 端 null）。
 */
@Entity({ name: 'kb_qa_pairs' })
@Index('idx_kb_qa_pairs_kb', ['knowledgeBaseId'])
export class KbQaPairEntity {
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  /** 问题（标准问法；检索主向量） */
  @Column({ name: 'question', type: 'text' })
  question!: string

  /** 答案（命中直出） */
  @Column({ name: 'answer', type: 'text' })
  answer!: string

  /** 相似问题 JSON 数组（each 亦向量化，提升召回） */
  @Column({ name: 'similar_questions', type: 'text', nullable: true })
  similarQuestions!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
