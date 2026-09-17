import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 知识大脑·论断 Entity（kb_atoms，详细设计 §1.1）
 *
 * L1 论断层：入库文档消化出的自包含论断短句（事实/观点/方法/悬置点），
 * 带四态+stale 状态机、溯源（chapter_hash + offsets，chunkId 为可重链缓存）、
 * 视角挂点（lens_note_id=null=公共层）与遍次溯源（extraction_pass）。
 * 裁决分域键 = (lens_note_id ?? 公共层) × 实体挂点——跨视角永不互裁。
 * 多租户：继承 BaseRepository，user_id 自动注入。
 */

/** 论断类型：这段话里"有什么可提炼的知识" */
export type KbAtomType =
  | 'fact'
  | 'claim'
  | 'concept'
  | 'method'
  | 'insight'
  | 'open-question'

/** 命题状态：五态（supported/suspected/contradicted/superseded + stale=失去出处） */
export type KbAtomStatus =
  | 'supported'
  | 'suspected'
  | 'contradicted'
  | 'superseded'
  | 'stale'

/** 产出方：ai=流水线萃取；human=用户划线/批注/对话捕捉（原话保留，永不改写） */
export type KbAtomOrigin = 'ai' | 'human'

@Entity({ name: 'kb_atoms' })
@Index('idx_kb_atoms_kb_status', ['knowledgeBaseId', 'status'])
@Index('idx_kb_atoms_doc', ['sourceDocumentId'])
@Index('idx_kb_atoms_subj', ['subjectEntityId'])
@Index('idx_kb_atoms_obj', ['objectEntityId'])
@Index('idx_kb_atoms_lens', ['lensNoteId'])
@Index('idx_kb_atoms_pass', ['sourceDocumentId', 'extractionPass'])
export class KbAtomEntity {
  /** 所属用户 ID（多租户隔离；scoped 自动注入） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  /** 自包含论断短句（三要件：atomic/self-contained/concise，无回指） */
  @Column({ name: 'statement', type: 'text' })
  statement!: string

  @Column({ name: 'type', type: 'varchar', default: 'fact' })
  type!: KbAtomType

  @Column({ name: 'status', type: 'varchar', default: 'supported' })
  status!: KbAtomStatus

  /** 0-1：来源权威性 × 抽取确定性（human=1.0） */
  @Column({ name: 'certainty', type: 'float', default: 0.8 })
  certainty!: number

  /** 双时间线之"世界时间"：事实在所述世界内的有效区间（ISO 或自由刻度） */
  @Column({ name: 'valid_from', type: 'varchar', nullable: true })
  validFrom!: string | null

  @Column({ name: 'valid_until', type: 'varchar', nullable: true })
  validUntil!: string | null

  @Column({ name: 'source_document_id', type: 'varchar' })
  sourceDocumentId!: string

  /** 主溯源锚：章节（content_hash 稳定，reprocess 不变） */
  @Column({ name: 'source_chapter_id', type: 'varchar', nullable: true })
  sourceChapterId!: string | null

  @Column({ name: 'source_chapter_hash', type: 'varchar', nullable: true })
  sourceChapterHash!: string | null

  /** 可重链缓存：reprocess 后按 offsets 重新指向新 chunk */
  @Column({ name: 'source_chunk_id', type: 'varchar', nullable: true })
  sourceChunkId!: string | null

  /** 原文引句 ≤200 字；origin=human 时为用户原话，永不改写 */
  @Column({ name: 'source_quote', type: 'text' })
  sourceQuote!: string

  /** 相对章节正文的起止偏移（定位器推导；未命中 quote 时为 null） */
  @Column({ name: 'start_offset', type: 'integer', nullable: true })
  startOffset!: number | null

  @Column({ name: 'end_offset', type: 'integer', nullable: true })
  endOffset!: number | null

  /** 实体挂点（PPR 图的边来源；null=未挂实体） */
  @Column({ name: 'subject_entity_id', type: 'varchar', nullable: true })
  subjectEntityId!: string | null

  @Column({ name: 'object_entity_id', type: 'varchar', nullable: true })
  objectEntityId!: string | null

  /** 视角挂点：null=公共层（视角不变论断）；有值=该视角下的观感论断 */
  @Column({ name: 'lens_note_id', type: 'varchar', nullable: true })
  lensNoteId!: string | null

  /** 萃取溯源：'base#1' | 'lens:<卡id>#2' | 'human:ui'（幂等键=章节hash×遍次） */
  @Column({ name: 'extraction_pass', type: 'varchar', default: 'base#1' })
  extractionPass!: string

  @Column({ name: 'origin', type: 'varchar', default: 'ai' })
  origin!: KbAtomOrigin

  @Column({ name: 'use_count', type: 'integer', default: 0 })
  useCount!: number

  @Column({ name: 'last_used_at', type: 'datetime', nullable: true })
  lastUsedAt!: Date | null

  /** superseded 时指向新论断（关旧开新，不物理删） */
  @Column({ name: 'superseded_by_atom_id', type: 'varchar', nullable: true })
  supersededByAtomId!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
