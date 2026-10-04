import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 世界观库主表（设定资产库 P0-2026-09-24）
 * 世界 = 跨项目复用的「世界常量」容器；无 project 维度（仿 lw_global_settings 的全局表先例），
 * 项目通过 lw_world_bindings 引用。设计文档：2026-09-24-worldview-ip-library-design.md §4.1。
 */
@Entity({ name: 'lw_worlds' })
export class LwWorldEntity {
  /** 所属用户 ID（多租户隔离）。Electron 端单用户为 null。 */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 题材（对齐 story_type：xiuzhen|xuanhuan|urban|scifi|western_fantasy|history|custom） */
  @Column({ name: 'genre', type: 'varchar', default: 'custom' })
  genre!: string

  @Column({ name: 'tagline', type: 'varchar', nullable: true })
  tagline!: string | null

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'cover_path', type: 'varchar', nullable: true })
  coverPath!: string | null

  /** 'active' | 'archived' */
  @Column({ name: 'status', type: 'varchar', default: 'active' })
  status!: string

  /** 条目变更即 bump，项目侧血缘同步用 */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number

  /** JSON: string[] */
  @Column({ name: 'tags', type: 'text', nullable: true })
  tags!: string | null

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
