import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * LW 设计文档 Entity（2026-09-16 结构化设定方案 M1，设计文档 §4.1）
 *
 * spine / 卷设计 JSON 契约的草稿与版本存档。设计 pass 中 agent 经
 * lw_save_design_doc 写入（过 L0 校验）；用户在设计包确认面板确认后，
 * 分解器把 doc_json 落到各业务表（运行时真相），并把 designId→dbId
 * 映射回填 id_map。本表不是运行时真相源，是设计层的存档与交换格式。
 */
@Entity({ name: 'lw_design_documents' })
@Index('idx_lw_design_documents_project', ['projectId'])
@Index('idx_lw_design_documents_project_kind', ['projectId', 'kind'])
export class LwDesignDocumentEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /** 'spine' | 'volume' */
  @Column({ name: 'kind', type: 'varchar' })
  kind!: string

  /** kind=volume 时的卷标识（契约里的 v1/v2…）；spine 为 null */
  @Column({ name: 'volume_id', type: 'varchar', nullable: true })
  volumeId!: string | null

  @Column({ name: 'title', type: 'varchar' })
  title!: string

  /** 契约 JSON 全文（spine/卷设计 schema 见 @shared/contracts/longwriting-design） */
  @Column({ name: 'doc_json', type: 'text' })
  docJson!: string

  /** JSON {designId: dbId}——确认分解后回填（cast/卷节点/伏笔/事件的映射） */
  @Column({ name: 'id_map', type: 'text', nullable: true })
  idMap!: string | null

  /** 'draft' | 'confirmed' | 'discarded' */
  @Column({ name: 'status', type: 'varchar', default: 'draft' })
  status!: string

  /** 同卷重复保存递增（草稿演进历史） */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number

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
    name: 'updated_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  updatedAt!: number
}
