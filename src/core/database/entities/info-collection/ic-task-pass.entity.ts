import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 信息搜集「执行台账」Entity（ic_task_passes，2026-10-07 设计落地）
 *
 * 照搬 kb_digest_passes 幂等模式（storage §2 / 飞轮 §3.3 机制 1）：
 * 幂等键 = (task_id, pass_key, attempt)——同一遍次重跑不重复入库，attempt
 * 递增记重试；MAX_ATTEMPTS 后人工复活。中途崩溃只可能"新已落旧未关"，
 * 下轮按 content_hash 合并，不会丢数据（先落新再关旧纪律）。
 */
@Entity({ name: 'ic_task_passes' })
@Index('idx_ic_passes_user', ['userId'])
@Index('idx_ic_passes_task', ['taskId', 'passKey', 'attempt'])
export class IcTaskPassEntity {
  /** 所属用户 ID（多租户隔离） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'task_id', type: 'varchar' })
  taskId!: string

  /** 遍次键（如 "plan" / "collect:1" / "extract"），同键重跑 attempt+1 */
  @Column({ name: 'pass_key', type: 'varchar' })
  passKey!: string

  /** 第几次尝试（1 起） */
  @Column({ name: 'attempt', type: 'integer', default: 1 })
  attempt!: number

  /** running | done | failed */
  @Column({ name: 'status', type: 'varchar', default: 'running' })
  status!: string

  /** 遍次统计 JSON（候选数/新源数/新行数/负结果数…） */
  @Column({ name: 'stats_json', type: 'text', nullable: true })
  statsJson!: string | null

  /** 成本 JSON（工具调用数/token/耗时） */
  @Column({ name: 'cost_json', type: 'text', nullable: true })
  costJson!: string | null

  @Column({ name: 'started_at', type: Date, nullable: true })
  startedAt!: Date | null

  @Column({ name: 'finished_at', type: Date, nullable: true })
  finishedAt!: Date | null
}
