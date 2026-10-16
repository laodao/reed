/**
 * 信息来源分组 Entity（类别内的一级分组，原「新闻主题」）
 * @module core/database/entities/info-source-topic.entity
 * @description 分组归属类别（category_id）。每个类别有且仅有一个默认分组（is_default=1，
 *              显示名「未分组」）：用户在界面新建来源时不选分组即落入该分组，
 *              因此「不要分组」的类别无需用户先建组（创建来源时按需自动建默认组）。
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity({ name: 'info_source_topics' })
@Index('idx_info_source_topics_user', ['userId'])
@Index('idx_info_source_topics_category', ['categoryId'])
export class InfoSourceTopicEntity {
  /** 多租户隔离（BaseRepository 自动注入；PC 单用户为 null） */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 所属类别 id（info_source_categories.id） */
  @Column({ name: 'category_id', type: 'varchar' })
  categoryId!: string

  /** 分组显示名 */
  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 内置分组（预置新闻主题：user_id NULL + is_builtin=1） */
  @Column({ name: 'is_builtin', type: 'integer', default: 0, nullable: true })
  isBuiltin!: number | null

  /** 默认分组（未分组）：系统按需创建，界面不提供改名/删除 */
  @Column({ name: 'is_default', type: 'integer', default: 0, nullable: true })
  isDefault!: number | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
