import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 邮箱账号 Entity（SMTP 发 / IMAP 收；授权码/密码加密后存 pass_enc）
 */
@Entity({ name: 'email_accounts' })
export class EmailAccountEntity {
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 兼容展示字段（实际连接用 imap_host/smtp_host） */
  @Column({ name: 'host', type: 'varchar', nullable: true })
  host!: string | null

  @Column({ name: 'imap_host', type: 'varchar' })
  imapHost!: string

  @Column({ name: 'imap_port', type: 'int' })
  imapPort!: number

  @Column({ name: 'imap_secure', type: 'boolean', default: true })
  imapSecure!: boolean

  @Column({ name: 'smtp_host', type: 'varchar' })
  smtpHost!: string

  @Column({ name: 'smtp_port', type: 'int' })
  smtpPort!: number

  @Column({ name: 'smtp_secure', type: 'boolean', default: true })
  smtpSecure!: boolean

  @Column({ name: 'user', type: 'varchar' })
  user!: string

  /** 授权码/密码密文（SecureStorage 加密；绝不明文落库） */
  @Column({ name: 'pass_enc', type: 'varchar' })
  passEnc!: string

  @Column({ name: 'from_name', type: 'varchar', nullable: true })
  fromName!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
