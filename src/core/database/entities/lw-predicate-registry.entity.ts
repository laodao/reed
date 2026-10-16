import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 谓词注册表 Entity（2026-09-16 结构化设定方案 M0，设计文档 §4.2）
 *
 * 受控词表：关系（师徒/仇敌/…）与属性边（持有/位于/知晓）的规范 key + 同义词。
 * 设计 pass 与章节抽取器只能从词表选谓词；轨迹/关系史查询按规范 key 聚合，
 * 自由文本谓词会造成漏边（词表存在的根本原因）。
 *
 * 与 lw_bible_kinds 同类：产品级全局配置（行 user_id NULL），不按租户隔离。
 * source: 'builtin'（随迁移种子）/ 'discovered'（存量归一时自动入册）/ 'manual'（用户添加）
 */
@Entity({ name: 'lw_predicate_registry' })
@Index('uq_lw_predicate_registry_scope_key', ['scope', 'key'], { unique: true })
export class LwPredicateRegistryEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * 本表是全局配置：行固定 user_id NULL，读取走 raw repo 不过租户过滤。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 'relation'（人物/势力间关系）| 'attribute'（实体对物/地/事件的属性边） */
  @Column({ name: 'scope', type: 'varchar' })
  scope!: string

  /** 规范 key（中文规范词，如 '师徒'）——边落库/轨迹聚合的唯一形态 */
  @Column({ name: 'key', type: 'varchar' })
  key!: string

  @Column({ name: 'label', type: 'varchar' })
  label!: string

  /** JSON string[]：抽取/设计输出的常见变体，归一时映射到 key */
  @Column({ name: 'synonyms', type: 'text', nullable: true })
  synonyms!: string | null

  /** 'builtin' | 'discovered' | 'manual' */
  @Column({ name: 'source', type: 'varchar', default: 'builtin' })
  source!: string

  @Column({ name: 'enabled', type: 'integer', default: 1 })
  enabled!: number

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
