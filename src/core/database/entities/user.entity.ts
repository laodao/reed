import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 用户 Entity
 * - Electron 单用户：固定 id='local-default-user'，email='local@local'
 * - Web 多用户：每次注册插入新行
 */
@Entity({ name: 'users' })
@Index('idx_users_email', ['email'], { unique: true })
export class UserEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'email', type: 'varchar' })
  email!: string

  @Column({ name: 'display_name', type: 'varchar', nullable: true })
  displayName!: string | null

  /**
   * bcrypt 哈希后的密码；Electron 默认用户为空
   */
  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash!: string | null

  /**
   * 'admin' | 'user'
   */
  @Column({ name: 'role', type: 'varchar', default: 'user' })
  role!: string

  @Column({ name: 'is_active', type: 'integer', default: 1 })
  isActive!: number

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
    name: 'last_login_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  lastLoginAt!: number | null
}
