import { Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'

/**
 * 通用事件系统三表 Entity（平台级公共底座，非工作流私有）
 *
 * 设计规格：tasks/2026-08-28-agent-loop-harness/10-event-system.md §4。
 * 建表 DDL 见 src/core/database/migrations/create-platform-event-tables.ts（幂等，双语种）。
 *
 * 方言说明：seq 声明为 integer —— better-sqlite3 的自增主键强制 INTEGER
 * （"AUTOINCREMENT is only allowed on an INTEGER PRIMARY KEY"）；
 * PG 端 synchronize 实际落 SERIAL（§4.1 迁移 DDL 的 BIGSERIAL 仅在迁移先建表时生效，
 * 功能等价，千条/日量级 int4 足够，见该文档 M1 实施记录）。
 */

/**
 * 事件存储（§4.1）。一行 = 一条不可变事件；seq 全局单调递增为排序权威，
 * occurred_at 仅供展示（多实例时钟不可信，§7.9）。
 *
 * 多租户：userId 列由 BaseRepository 按 ALS 注入/过滤（§4.4）。
 */
@Entity({ name: 'platform_events' })
@Index('idx_pe_type', ['type', 'seq'])
@Index('idx_pe_aggregate', ['aggregateKind', 'aggregateId', 'seq'])
@Index('idx_pe_user_seq', ['userId', 'seq'])
@Index('idx_pe_occurred', ['occurredAt'])
export class PlatformEventEntity {
  /** 全局单调递增序号（存储分配，排序权威） */
  @PrimaryGeneratedColumn({ name: 'seq', type: 'integer' })
  seq!: number

  /** uuid；LAN ingest 去重键 */
  @Column({ name: 'id', type: 'varchar', unique: true })
  id!: string

  /** 租户作用域（发布时 ALS 快照） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  /** 事件类型：领域事件冒号式（kb:*）/ 引擎 run 生命周期点分层（workflow.run.*） */
  @Column({ name: 'type', type: 'varchar' })
  type!: string

  @Column({ name: 'aggregate_kind', type: 'varchar' })
  aggregateKind!: string

  @Column({ name: 'aggregate_id', type: 'varchar' })
  aggregateId!: string

  /** user / system / agent / workflow */
  @Column({ name: 'actor_kind', type: 'varchar' })
  actorKind!: string

  @Column({ name: 'actor_id', type: 'varchar', nullable: true })
  actorId!: string | null

  /** ≤64KB，禁带密钥（§8）；统一 text+JSON 序列化，不用 PG jsonb（§4.1 设计决策） */
  @Column({ name: 'payload_json', type: 'text', nullable: true })
  payloadJson!: string | null

  /** 引发本事件的事件/命令 id */
  @Column({ name: 'causation_id', type: 'varchar', nullable: true })
  causationId!: string | null

  /** 贯穿一条业务链路的 id */
  @Column({ name: 'correlation_id', type: 'varchar', nullable: true })
  correlationId!: string | null

  @Column({ name: 'occurred_at', type: 'datetime' })
  occurredAt!: Date

  @Column({ name: 'schema_version', type: 'integer', default: 1 })
  schemaVersion!: number

  /** 落库时间（恢复/排查用） */
  @Column({ name: 'created_at', type: 'datetime' })
  createdAt!: Date
}

/**
 * 持久消费者游标（§4.2）。ack = last_seq 前移（单调不退）；
 * 失败进入 retrying（retrying_seq + retry_count + next_retry_at 退避），
 * 达上限写 DLQ 并跳过该 seq（§6.1）。
 *
 * 注意：本表无 user_id 列——租户语义由 user_scope 字段承担（'*'=系统级跨租户，
 * 规避 SQLite 复合唯一键对 NULL 的宽松语义），BaseRepository 的 scoped 对本表等同裸操作。
 */
@Entity({ name: 'platform_event_cursors' })
export class PlatformEventCursorEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 消费者名（如 'task-scheduler'） */
  @Column({ name: 'consumer_name', type: 'varchar' })
  consumerName!: string

  /** 消费者租户作用域；'*'=系统级跨租户（§8 登记评审） */
  @Column({ name: 'user_scope', type: 'varchar', default: '*' })
  userScope!: string

  /** 已成功处理的最大 seq（ack，单调不退） */
  @Column({ name: 'last_seq', type: 'integer', default: 0 })
  lastSeq!: number

  /** 正在重试的事件 seq */
  @Column({ name: 'retrying_seq', type: 'integer', nullable: true })
  retryingSeq!: number | null

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount!: number

  /** 退避后的下次重试时刻 */
  @Column({ name: 'next_retry_at', type: 'datetime', nullable: true })
  nextRetryAt!: Date | null

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null

  @Column({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date
}

/**
 * 死信队列（§4.3）。handler 重试 5 次仍失败（退避 1/2/4/8/16s）后落此表，
 * 游标跳过毒消息前移（§7.4）；人工 requeue/discard 收口（EventAdmin，M3）。
 */
@Entity({ name: 'platform_event_dead_letters' })
@Index('idx_pedl_consumer', ['consumerName', 'status'])
export class PlatformEventDeadLetterEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'consumer_name', type: 'varchar' })
  consumerName!: string

  @Column({ name: 'user_scope', type: 'varchar' })
  userScope!: string

  /** 指向 platform_events.seq */
  @Column({ name: 'event_seq', type: 'integer' })
  eventSeq!: number

  /** 事件快照（事件被归档清理后仍可排查） */
  @Column({ name: 'event_json', type: 'text' })
  eventJson!: string

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null

  @Column({ name: 'attempts', type: 'integer' })
  attempts!: number

  @Column({ name: 'first_failed_at', type: 'datetime' })
  firstFailedAt!: Date

  @Column({ name: 'last_failed_at', type: 'datetime' })
  lastFailedAt!: Date

  /** pending / requeued / discarded */
  @Column({ name: 'status', type: 'varchar', default: 'pending' })
  status!: string

  @Column({ name: 'created_at', type: 'datetime' })
  createdAt!: Date
}
