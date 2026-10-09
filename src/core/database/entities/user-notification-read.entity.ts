import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * 通知已读状态表（通知中心用户侧独立持久化）
 * @description 用户要求已读状态后端落表（不要用 localStorage），故单独建表
 *              user_notification_reads，一行 = 当前用户对某条平台事件(seq)的已读标记。
 *
 *              - user_id：租户作用域（part of 复合主键），由 BaseRepository 按 ALS 注入/过滤；
 *              - seq：关联 platform_events.seq（事件不可变，seq 为排序权威标识）；
 *              - read_at：标记已读时间。
 *
 *              复合主键 (user_id, seq) 天然幂等（重复标记撞主键，用 orIgnore 吞掉并发）。
 *
 * 多租户：userId 列由 BaseRepository 自动注入/过滤（§4.4 行级隔离）。
 */
@Entity({ name: 'user_notification_reads' })
export class UserNotificationReadEntity {
  /** 租户作用域（part of 复合主键） */
  @PrimaryColumn({ name: 'user_id', type: 'varchar' })
  userId!: string

  /** 关联 platform_events.seq（part of 复合主键） */
  @PrimaryColumn({ name: 'seq', type: 'integer' })
  seq!: number

  /** 标记已读时间 */
  @Column({ name: 'read_at', type: Date })
  readAt!: Date
}
