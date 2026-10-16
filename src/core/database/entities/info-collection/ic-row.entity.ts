import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 信息搜集「结构化行」Entity（ic_rows，2026-10-07 设计落地）
 *
 * 存储模型（docs/design/2026-10-07-info-collection-storage-design.md §2/§3）：
 * - row_json 是行的**全量唯一权威**（任意形状兜底，蓝图 schema + ajv 在写入口把关）；
 * - value/unit/period/metric/dims_json 是 **measure 约定列**（可空）——由归一化器
 *   从 row_json 派生的可计算投影（真 NUMERIC 列 → SUM/AVG/排序原生 SQL），
 *   行编辑后重跑归一化同步；约定列与 row_json 不一致以 row_json 为准；
 * - 治理字段（source/quote/status/hash）永远做真实列：行级溯源/逐行人审/
 *   版本链（superseded_by 关旧开新，可回溯）/去重（content_hash）全发生在"条"粒度。
 * - 蓝图无 measure 约定的项目不写本表（行层按需启用，纯文档路径即可）。
 */
@Entity({ name: 'ic_rows' })
@Index('idx_ic_rows_user', ['userId'])
@Index('idx_ic_rows_project_schema_status', ['projectId', 'schemaId', 'status'])
@Index('idx_ic_rows_source', ['sourceId'])
@Index('idx_ic_rows_task', ['taskId'])
@Index('idx_ic_rows_hash', ['contentHash'])
export class IcRowEntity {
  /** 所属用户 ID（多租户隔离） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'task_id', type: 'varchar' })
  taskId!: string

  /** 抽出来源的源记录（与 derived_from 至少有一个：无溯源不入库） */
  @Column({ name: 'source_id', type: 'varchar', nullable: true })
  sourceId!: string | null

  /** 蓝图 schema id（行数据按 schema 分组渲染数据集视图） */
  @Column({ name: 'schema_id', type: 'varchar' })
  schemaId!: string

  /** 满足哪条 IR（"R1"；可空：抽取不针对单条 IR 的场景） */
  @Column({ name: 'requirement_id', type: 'varchar', nullable: true })
  requirementId!: string | null

  /** 全量数据字段 JSON（唯一权威形态） */
  @Column({ name: 'row_json', type: 'text' })
  rowJson!: string

  // ==================== measure 约定列（可空；归一化器派生的可计算投影） ====================

  /** 数值本身（真数字类型：SUM/AVG/排序原生可用；文本形态留 row_json） */
  @Column({ name: 'value', type: 'float', nullable: true })
  value!: number | null

  /** 单位（数值身份的一部分，聚合前必须同单位过滤） */
  @Column({ name: 'unit', type: 'varchar', nullable: true })
  unit!: string | null

  /** 数据所属统计期（规范字符串："2019"/"2024Q3"；非采集时间） */
  @Column({ name: 'period', type: 'varchar', nullable: true })
  period!: string | null

  /** 指标名/科目（层级科目存路径 "营业总成本/营业成本"，天然支持汇总） */
  @Column({ name: 'metric', type: 'varchar', nullable: true })
  metric!: string | null

  /** 时间外维度 JSON（region/segment/company…按需 json_extract 筛选） */
  @Column({ name: 'dims_json', type: 'text', nullable: true })
  dimsJson!: string | null

  // ==================== 溯源与治理 ====================

  /** 引文锚（原文片段，字符级；回验不过拒收——防编造硬机制） */
  @Column({ name: 'quote', type: 'text', nullable: true })
  quote!: string | null

  /** high | low（复核不一致一律 low，进待审） */
  @Column({ name: 'confidence', type: 'varchar', default: 'high' })
  confidence!: string

  /** draft | confirmed | superseded | stale */
  @Column({ name: 'status', type: 'varchar', default: 'draft' })
  status!: string

  /** 版本链：被哪个新行取代（关旧开新，历史可回溯） */
  @Column({ name: 'superseded_by', type: 'varchar', nullable: true })
  supersededBy!: string | null

  /** 派生行溯源（由哪几行算的；与 source_id 至少一个；查询时现算是默认，物化是例外） */
  @Column({ name: 'derived_from_json', type: 'text', nullable: true })
  derivedFromJson!: string | null

  /** 内容哈希（payload+quote 规范化；去重与 merged 判定） */
  @Column({ name: 'content_hash', type: 'varchar', nullable: true })
  contentHash!: string | null

  /** 跨源冲突/低置信标记（布尔；不阻塞 confirmed，人审并列展示） */
  @Column({ name: 'needs_review', type: 'integer', default: 0 })
  needsReview!: number

  /** 孤证标记：must 级 IR 仅一个独立源支撑（裁决阶段计算；展示徽标用） */
  @Column({ name: 'single_source', type: 'integer', default: 0 })
  singleSource!: number

  /** 裁决备注（复核不一致原因 / 冲突归因结论；人审并列展示用） */
  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
