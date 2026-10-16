import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 知识大脑·卡片 Entity（kb_notes，详细设计 §1.4）
 *
 * L3 卡片层统一实体：思想卡（methodology/insight/synthesis）+ 模式卡
 * （plot-pattern/setting-pattern：骨架+参数槽+变体登记）+ 视角卡（lens：
 * 注意力框架，驱动视角遍重萃取）。AI 产物一律 proposed 起步、人批准才
 * published（Tana proposal 模型）；同题演进靠 version 递增（evergreen）。
 */

export type KbNoteType =
  | 'methodology'
  | 'insight'
  | 'synthesis'
  | 'plot-pattern'
  | 'setting-pattern'
  | 'character-pattern'
  | 'lens'
  | 'skill-seed'
  // 书级汇总遍产物（book passes；画像驱动，proposed 入审批箱）
  | 'book-outline'
  | 'setting-index'
  | 'character-roster'
  | 'foreshadow-ledger'
  | 'knowledge-map'
  // 冶炼层产物（v2 P1：默认 published——带实例/频率验证门槛，A3 决策）
  | 'principle'
  | 'craft-case'
  | 'genre-insight'
  // v3 M2 阶段表（结构知识：有序阶段+功能标注，渲染为文档/存储为结构）
  | 'structure-map'
  | 'character-arc'
  // 滚动阅读产线（P1：全书工作记忆，按文档一份，随批次演进）
  | 'reading-memory'
  // P3：终审复核报告 / 全书综述文章（按文档一份）
  | 'reading-review'
  | 'book-summary'
  | 'anti-pattern'
  // v4 整书结构化漏斗：名册（人审卡）/ 人物档案 / 设定档案 / 文风画像
  | 'roster'
  | 'character-dossier'
  | 'setting-dossier'
  | 'style-profile'

export type KbNoteStatus = 'proposed' | 'draft' | 'published' | 'archived'

export type KbNoteOrigin = 'ai-distill' | 'human' | 'import'

@Entity({ name: 'kb_notes' })
@Index('idx_kb_notes_kb_type_status', ['knowledgeBaseId', 'type', 'status'])
@Index('idx_kb_notes_kb_status', ['knowledgeBaseId', 'status'])
export class KbNoteEntity {
  /** 所属用户 ID（多租户隔离；scoped 自动注入） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  /** 论断式标题（"标题即 API"）；视角卡标题=视角名 */
  @Column({ name: 'title', type: 'text' })
  title!: string

  /** 「何时用我」——agent 路由接口（第三人称 ≤200 字，含触发场景与边界） */
  @Column({ name: 'description', type: 'text' })
  description!: string

  /** markdown 正文（人读层） */
  @Column({ name: 'body', type: 'text', default: '' })
  body!: string

  @Column({ name: 'type', type: 'varchar' })
  type!: KbNoteType

  @Column({ name: 'status', type: 'varchar', default: 'proposed' })
  status!: KbNoteStatus

  /** 证据锚点 JSON：[{atomId?,noteId?,quote?,documentId?}]（防幻觉根） */
  @Column({ name: 'evidence', type: 'text', default: '[]' })
  evidence!: string

  @Column({ name: 'origin', type: 'varchar', default: 'ai-distill' })
  origin!: KbNoteOrigin

  /** 同题演进版本（卡片被改写而非堆积） */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number

  /** 模式卡：骨架（阶段/规则序列）+ 参数槽定义（JSON） */
  @Column({ name: 'pattern_skeleton', type: 'text', nullable: true })
  patternSkeleton!: string | null

  /** 模式卡：实例登记 [{documentId,参数取值,变形说明,evidenceAtomIds[]}]（JSON） */
  @Column({ name: 'pattern_instances', type: 'text', nullable: true })
  patternInstances!: string | null

  /** 视角卡：注意力框架 {attendTo:[],questions:[]}（JSON；视角遍 prompt 素材） */
  @Column({ name: 'lens_attention', type: 'text', nullable: true })
  lensAttention!: string | null

  /** 阶段表载荷（v3 M2：structure-map/character-arc，[{name,position,function,...}]；迁移 add-kb-brain-v3-structures） */
  @Column({ name: 'structure_stages', type: 'text', nullable: true })
  structureStages!: string | null

  /** 经典性（浮现式判定=实例数×引用×收藏，P4 周期重算） */
  @Column({ name: 'classic_score', type: 'float', default: 0 })
  classicScore!: number

  /** 同题改版血缘：archived 的旧版指向新版本 */
  @Column({ name: 'superseded_note_id', type: 'varchar', nullable: true })
  supersededNoteId!: string | null

  /** 标签 JSON 数组 */
  @Column({ name: 'tags', type: 'text', default: '[]' })
  tags!: string

  /* ---- 学习模式（库开启 learning 才激活；FSRS 当前态缓存，评分历史在 kb_note_reviews）---- */

  @Column({ name: 'fsrs_stability', type: 'float', nullable: true })
  fsrsStability!: number | null

  @Column({ name: 'fsrs_difficulty', type: 'float', nullable: true })
  fsrsDifficulty!: number | null

  @Column({ name: 'last_review_at', type: Date, nullable: true })
  lastReviewAt!: Date | null

  @Column({ name: 'review_count', type: 'integer', default: 0 })
  reviewCount!: number

  @Column({ name: 'lapse_count', type: 'integer', default: 0 })
  lapseCount!: number

  /* ---- 使用信号（创作引用计数——代谢晋升/衰减与消化率仪表的数据源）---- */

  @Column({ name: 'cited_count', type: 'integer', default: 0 })
  citedCount!: number

  @Column({ name: 'last_cited_at', type: Date, nullable: true })
  lastCitedAt!: Date | null

  /** FSRS 到期时间（复习排期；null=未排期/未启用学习模式） */
  @Column({ name: 'due_at', type: Date, nullable: true })
  dueAt!: Date | null

  /** FSRS 状态机（New=0 Learning=1 Review=2 Relearning=3；学习步骤卡的时间间隔依赖此态） */
  @Column({ name: 'fsrs_state', type: 'integer', nullable: true })
  fsrsState!: number | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
