import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 伏笔 Entity（P1-2026-09-09，网文差异化能力：第 N 章埋、第 M 章收）
 * status: 'open'（未收）| 'paid'（已回收）| 'dropped'（弃置）
 * 写入双通道：研讨室卡片采纳（origin.type='discussion'）/ 章节提取管线（'extract'）。
 */
@Entity({ name: 'lw_foreshadows' })
@Index('idx_lw_foreshadows_project', ['projectId'])
@Index('idx_lw_foreshadows_status', ['projectId', 'status'])
export class LwForeshadowEntity {
  /** 所属用户 ID（多租户隔离）。Electron 端单用户为 null。 */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /** 伏笔内容（"第3章出现的断剑其实是父亲遗物"） */
  @Column({ name: 'content', type: 'text' })
  content!: string

  /** 埋设章节（研讨期可为空——大纲未定） */
  @Column({ name: 'planted_chapter', type: 'integer', nullable: true })
  plantedChapter!: number | null

  /** 回收章节（null=尚未回收） */
  @Column({ name: 'payoff_chapter', type: 'integer', nullable: true })
  payoffChapter!: number | null

  /** 'open' | 'paid' | 'dropped' */
  @Column({ name: 'status', type: 'varchar', default: 'open' })
  status!: string

  /** JSON: {type:'discussion'|'extract'|'manual', cardId?, turns?} */
  @Column({ name: 'origin', type: 'text', nullable: true })
  origin!: string | null

  /** JSON [{type,id}]：暗线牵涉实体（2026-09-16 结构化设定 M1；卷设计 threads 分解落库） */
  @Column({ name: 'involves', type: 'text', nullable: true })
  involves!: string | null

  /** JSON number[]：中途发展章（plant 与 payoff 之间） */
  @Column({ name: 'develop_chapters', type: 'text', nullable: true })
  developChapters!: string | null

  /** 卷末清账"滚动"归宿章号（滚动到某卷的起点章；null=未滚动） */
  @Column({ name: 'rolled_to', type: 'integer', nullable: true })
  rolledTo!: number | null

  @Column({
    name: 'created_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  createdAt!: number

  @Column({
    name: 'updated_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  updatedAt!: number
}
