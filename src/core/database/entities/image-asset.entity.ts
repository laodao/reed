import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 图像资产 Entity（视频项目专用，独立于 images 表）。
 * Quirk: created_at 是 INTEGER 类型（epoch ms 数字），不是 DATETIME。
 */
@Entity({ name: 'image_assets' })
@Index('idx_image_assets_project_id', ['projectId'])
@Index('idx_image_assets_type', ['type'])
export class ImageAssetEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'type', type: 'varchar' })
  type!: string

  @Column({ name: 'provider', type: 'text', nullable: true })
  provider!: string | null

  @Column({ name: 'model', type: 'text', nullable: true })
  model!: string | null

  @Column({ name: 'prompt', type: 'text' })
  prompt!: string

  @Column({ name: 'negative_prompt', type: 'text', nullable: true })
  negativePrompt!: string | null

  @Column({ name: 'image_path', type: 'text' })
  imagePath!: string

  @Column({ name: 'thumbnail_path', type: 'text', nullable: true })
  thumbnailPath!: string | null

  @Column({ name: 'width', type: 'integer' })
  width!: number

  @Column({ name: 'height', type: 'integer' })
  height!: number

  @Column({ name: 'metadata', type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null

  /**
   * created_at 是 epoch ms（13 位整数）。
   * sqlite INTEGER affinity 能存任意整数；
   * postgres 必须用 bigint（int4 范围不够）。
   * TypeORM bigint 默认返回 string，Repository toDto 时 Number(...) 转回 number。
   */
  @Column({
    name: 'created_at',
    type: 'bigint',
    transformer: {
      to: (v: number | string) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  createdAt!: number
}
