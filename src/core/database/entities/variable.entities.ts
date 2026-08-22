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

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
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

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
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

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
