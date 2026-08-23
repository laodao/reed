/**
 * 新闻来源 Entity（内置应用 C1 早报 / C2 周报的数据源管理）
 * @module core/database/entities/news-source.entity
 * @description 新闻来源库：每个来源属于一个主题（topic_id），含显示名与抓取 URL。
 *              内置来源（user_id=NULL + is_builtin=1）全局共享，用户可增删自己的来源。
 *              工作流 crawl-news 节点按 sourceIds 多选抓取。
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity({ name: 'news_sources' })
@Index('idx_news_sources_user', ['userId'])
@Index('idx_news_sources_topic', ['topicId'])
export class NewsSourceEntity {
  /** 多租户隔离（BaseRepository 自动注入；PC 单用户为 null） */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 主题 id（NEWS_TOPICS 的 id：ai/finance/energy/tech/world；用户自定义主题用 free 前缀） */
  @Column({ name: 'topic_id', type: 'varchar' })
  topicId!: string

  /** 媒体/专栏显示名 */
  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 首页或主题专栏地址 */
  @Column({ name: 'url', type: 'text' })
  url!: string

  /** 内置来源（1=user_id NULL 全局共享，禁删；0=用户自有） */
  @Column({ name: 'is_builtin', type: 'integer', default: 0, nullable: true })
  isBuiltin!: number | null

  /** 启停（停用来源不参与抓取） */
  @Column({ name: 'enabled', type: 'integer', default: 1, nullable: true })
  enabled!: number | null

  /** 排序权重（同主题内升序；预置源按权威度排序） */
  @Column({ name: 'sort_order', type: 'integer', default: 0, nullable: true })
  sortOrder!: number | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
