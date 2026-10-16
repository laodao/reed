import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 知识大脑·场面事件 Entity（kb_events，v2 设计 §7 原料层/P0）
 *
 * 故事轨原料：章级消化/补采产出的「场面级事件」——归纳套路卡（pattern-induct）的
 * 证据矿砂，不进用户视野、不进 brain 检索主池（仅 event: 命名空间向量供聚类）。
 * 与 kb_atoms（设定轨）双轨并存：atoms 收长效设定（剧情禁令保持），events 收
 * 情节场面（正是禁令扔掉的那部分——价值链上游修复）。
 * 幂等：由消化台账 passType='events' / passKey='events#1' 保证（同 atoms 的
 * chapter_hash 语义）；替换式重建（重跑前 deleteByChapter）。
 */

/** 场面类型（临时手定枚举，P1 schema induction 后修订并回填重标——v2 设计 §9 待定） */
export type KbSceneType =
  | 'conflict' // 冲突对峙
  | 'battle' // 打斗战斗
  | 'breakthrough' // 突破晋级
  | 'deal' // 交易交换
  | 'probe' // 试探博弈
  | 'emotion' // 情感关系
  | 'chase' // 追逃奔行
  | 'scheme' // 谋划布局
  | 'reveal' // 揭秘反转
  | 'daily' // 日常过渡
  | 'other'

export const KB_SCENE_TYPES: KbSceneType[] = [
  'conflict',
  'battle',
  'breakthrough',
  'deal',
  'probe',
  'emotion',
  'chase',
  'scheme',
  'reveal',
  'daily',
  'other',
]

@Entity({ name: 'kb_events' })
@Index('idx_kb_events_kb_type', ['knowledgeBaseId', 'sceneType'])
@Index('idx_kb_events_doc', ['sourceDocumentId'])
@Index('idx_kb_events_chapter', ['sourceChapterId'])
export class KbEventEntity {
  /** 所属用户 ID（多租户隔离；scoped 自动注入） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  @Column({ name: 'source_document_id', type: 'varchar' })
  sourceDocumentId!: string

  /** 主溯源锚：章节（与 kb_atoms 同款 content_hash 语义） */
  @Column({ name: 'source_chapter_id', type: 'varchar' })
  sourceChapterId!: string

  @Column({ name: 'source_chapter_hash', type: 'varchar', nullable: true })
  sourceChapterHash!: string | null

  /** 场面类型（非法值落库前归 other） */
  @Column({ name: 'scene_type', type: 'varchar', default: 'other' })
  sceneType!: KbSceneType

  /** 场面概括（一句话：谁在什么局面下做了什么） */
  @Column({ name: 'summary', type: 'text' })
  summary!: string

  /** 参与者 JSON：[{name, entityId?}]（entityId 由实体解析回填；原料先到名后到 id） */
  @Column({ name: 'participants', type: 'text', default: '[]' })
  participants!: string

  /** 前因（一句话；可空） */
  @Column({ name: 'cause', type: 'text', nullable: true })
  cause!: string | null

  /** 结果（一句话；可空） */
  @Column({ name: 'outcome', type: 'text', nullable: true })
  outcome!: string | null

  /** 原文引句 ≤200 字（证据索引——套路卡的实例锚点） */
  @Column({ name: 'source_quote', type: 'text' })
  sourceQuote!: string

  /** 相对章节正文的起止偏移（quote 定位器推导；未命中为 null） */
  @Column({ name: 'start_offset', type: 'integer', nullable: true })
  startOffset!: number | null

  @Column({ name: 'end_offset', type: 'integer', nullable: true })
  endOffset!: number | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null
}
