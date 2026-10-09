import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * 应用用户偏好 Entity（per-user pinned/enabled 覆盖）
 *
 * 背景：内置应用是 user_id=NULL 的全局共享行，"固定到首页 / 启停"若直接写
 * apps 全局行，Web 多租户下任一用户的个人操作会改变所有用户的首页/可用性。
 * 本表按 (user_id, app_id) 存每个用户的个性化覆盖；读路径
 * COALESCE(偏好, 全局行) 归并。PC 单用户（userId=LOCAL_DEFAULT）同样受益。
 */
@Entity({ name: 'app_user_prefs' })
export class AppUserPrefsEntity {
  @PrimaryColumn({ name: 'user_id', type: 'varchar' })
  userId!: string

  @PrimaryColumn({ name: 'app_id', type: 'varchar' })
  appId!: string

  /** 用户个人"固定到首页"（1=固定；缺省回退全局行 pinned） */
  @Column({ name: 'pinned', type: 'integer', default: 0, nullable: true })
  pinned!: number | null

  /** 用户个人"启停"覆盖（1=启用；缺省回退全局行 enabled） */
  @Column({ name: 'enabled', type: 'integer', default: 1, nullable: true })
  enabled!: number | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
