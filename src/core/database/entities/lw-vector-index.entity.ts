import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * LW 向量索引记录 Entity（步骤0 新增）
 *
 * 用途：记录"长文写作模块的哪些实体/章节切片已经入了向量库"。
 * 向量本体存在 IVectorStore（LanceDB vectors 表 / PG kb_vectors 表），
 * 本表只存 chunkId → 实体的映射 + contentHash（增量更新判断）+ 切片起止（章节片段 preview）。
 *
 * 与 kb_vectors/vectors 的关系：本表的 chunkId 对应向量表的 chunkId（关联键）。
 * 删除实体时：先 IVectorStore.deleteByChunkIds，再 deleteByEntity 本表（双删）。
 *
 * 多租户：userId 列由 BaseRepository 自动注入（Web 端 ALS / PC 端 null）。
 */
@Entity({ name: 'lw_vector_indices' })
@Index('idx_lw_vector_project', ['projectId'])
@Index('idx_lw_vector_entity', ['projectId', 'entityType', 'entityId'])
@Unique('uq_lw_vector_chunk', ['chunkId'])
export class LwVectorIndexEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端 ALS 注入；Electron 单用户为 null。
   * BaseRepository 在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /** 实体类型：character/location/item/chapter/memory/...（对应 LwVectorEntityType） */
  @Column({ name: 'entity_type', type: 'text' })
  entityType!: string

  /** 实体 ID（对应 lw_* 表的 id；chapter 切片时为 outlineId） */
  @Column({ name: 'entity_id', type: 'varchar' })
  entityId!: string

  /** 章节号（chapter 切片用；设定/记忆类为 null） */
  @Column({ name: 'chapter_number', type: 'integer', nullable: true })
  chapterNumber!: number | null

  /** 关联向量表的 chunkId（删除向量时的关联键） */
  @Column({ name: 'chunk_id', type: 'varchar' })
  chunkId!: string

  /** 序列化文本的 sha256（增量更新判断：相同则跳过 embedding） */
  @Column({ name: 'content_hash', type: 'text', nullable: true })
  contentHash!: string | null

  /**
   * 切片原文预览（前 200 字）——避免检索时再回查原表取 preview。
   * 设定类：序列化文本前 200 字；章节类：该切片原文前 200 字。
   */
  @Column({ name: 'preview', type: 'text', nullable: true })
  preview!: string | null

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
