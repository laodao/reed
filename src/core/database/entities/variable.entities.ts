import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/** 键值变量（作用域+key 唯一） */
@Entity({ name: 'wf_variables' })
export class WorkflowVariableEntity {
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'scope', type: 'varchar' })
  scope!: string

  @Column({ name: 'key', type: 'varchar' })
  key!: string

  @Column({ name: 'value_json', type: 'varchar' })
  valueJson!: string

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}

/** 数据表结构 */
@Entity({ name: 'wf_data_table_defs' })
export class DataTableDefEntity {
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'columns_json', type: 'varchar' })
  columnsJson!: string

  /** 作用域：workflow（全局命名空间，历史语义）| app（按 owner 隔离）；历史行缺省 workflow */
  @Column({ name: 'scope', type: 'varchar', nullable: true })
  scope!: string | null

  /** scope='app' 时的属主（= workflow_definition_id） */
  @Column({ name: 'owner_id', type: 'varchar', nullable: true })
  ownerId!: string | null

  /** upsert 去重键数组（JSON 字符串；建表时锁定） */
  @Column({ name: 'dedup_keys_json', type: 'varchar', nullable: true })
  dedupKeysJson!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}

/** 数据表行 */
@Entity({ name: 'wf_data_table_rows' })
export class DataTableRowEntity {
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'table_id', type: 'varchar' })
  tableId!: string

  @Column({ name: 'row_json', type: 'varchar' })
  rowJson!: string

  /** 按表 dedup_keys 列值计算的 sha256；无去重键的表为 null（唯一索引 NULL 互不冲突） */
  @Column({ name: 'dedup_hash', type: 'varchar', nullable: true })
  dedupHash!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
