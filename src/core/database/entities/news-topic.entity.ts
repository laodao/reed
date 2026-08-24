/**
 * 新闻主题 Entity（内置应用 C1 早报 / C2 周报的数据源分组）
 * @module core/database/entities/news-topic.entity
 * @description 新闻来源按主题归组（如：人工智能/全球财经/新能源/科技产业/国际时政）。
 *              主题存数据库（非代码写死）——设置界面可新增/删除自定义主题；
 *              内置主题（user_id=NULL + is_builtin=1）全局共享、禁删（有来源时）。
 *              删除主题时级联删除其下全部来源（含用户自有）。
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity({ name: 'news_topics' })
@Index('idx_news_topics_user', ['userId'])
export class NewsTopicEntity {
  /** 多租户隔离（BaseRepository 自动注入；PC 单用户为 null） */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 主题名（设置界面显示，如「人工智能」） */
  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 内置主题（1=user_id NULL 全局共享；0=用户自有） */
  @Column({ name: 'is_builtin', type: 'integer', default: 0, nullable: true })
  isBuiltin!: number | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
