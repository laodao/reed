/**
 * 信息来源 Entity（通用信息源：名称 + URL）
 * @module core/database/entities/info-source.entity
 * @description 来源归属分组（topic_id），分组归属类别。内置来源（user_id=NULL +
 *              is_builtin=1）全局共享、禁删禁改；用户可增删自有来源。
 *              工作流 crawl-news 节点按 sourceIds 多选抓取，或按 topicId 整组抓取。
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity({ name: 'info_sources' })
@Index('idx_info_sources_user', ['userId'])
@Index('idx_info_sources_topic', ['topicId'])
export class InfoSourceEntity {
  /** 多租户隔离（BaseRepository 自动注入；PC 单用户为 null） */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 所属分组 id（info_source_topics.id） */
  @Column({ name: 'topic_id', type: 'varchar' })
  topicId!: string

  /** 媒体/专栏/站点显示名 */
  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 首页或栏目页地址 */
  @Column({ name: 'url', type: 'text' })
  url!: string

  /** 内置来源（1=user_id NULL 全局共享，禁删；0=用户自有） */
  @Column({ name: 'is_builtin', type: 'integer', default: 0, nullable: true })
  isBuiltin!: number | null

  /** 启停（停用来源不参与抓取） */
  @Column({ name: 'enabled', type: 'integer', default: 1, nullable: true })
  enabled!: number | null

  /** 排序权重（同分组内升序；预置源按权威度排序） */
  @Column({ name: 'sort_order', type: 'integer', default: 0, nullable: true })
  sortOrder!: number | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
