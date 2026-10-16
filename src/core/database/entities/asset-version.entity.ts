import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 资产版本 Entity（资产版本管理 · append-only）
 *
 * 版本链挂在文本型资产（文章/报告/文案）上：save-asset 节点带 versionOfAssetId 时
 * 追加版本并就地更新资产内容；回滚 = 取历史版内容另存为新版本（不删任何行）。
 * 列名/类型与迁移 create-asset-versions 严格一致（checkSchemaDrift 校验）。
 */
@Entity({ name: 'asset_versions' })
@Index('idx_asset_versions_asset', ['assetId'])
@Index('idx_asset_versions_asset_version', ['assetId', 'version'])
export class AssetVersionEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'asset_id', type: 'varchar' })
  assetId!: string

  /** 版本号，同一 asset_id 内从 1 自增 */
  @Column({ name: 'version', type: 'integer' })
  version!: number

  /** 该版本内容快照（text 资产全文） */
  @Column({ name: 'content', type: 'text' })
  content!: string

  /** 版本说明（修订意见/回滚标记/阶段说明） */
  @Column({ name: 'feedback', type: 'text', nullable: true })
  feedback!: string | null

  /** 产生者（workflow:<nodeId> / user:<id> / rollback） */
  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy!: string | null

  @Column({ name: 'created_at', type: 'bigint' })
  createdAt!: number
}
