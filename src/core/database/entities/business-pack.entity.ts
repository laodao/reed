import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * 业务包快照 Entity（business_packs 表）
 *
 * 一行 = 一个已登记的内置业务包。启动时由 pack.service 把代码内 manifest
 * 幂等 UPSERT 进来（by pack_id，manifest_hash 变化才更新），启用状态持久化，
 * 为后续 per-user 与管理 UI 留位。
 *
 * 裁剪说明（第一期）：source 恒为 'builtin'（第三方包/卸载留待后续）；
 * 不做 business_pack_metrics（依赖任务体系）。
 *
 * 多租户：包元信息是平台级共享数据，**无 userId 列**，
 * PackRepository 构造里 useRawRepo() 关闭租户过滤。
 */
@Entity({ name: 'business_packs' })
export class BusinessPackEntity {
  /** manifest.id（小写字母/数字/中划线，字母开头） */
  @PrimaryColumn({ name: 'pack_id', type: 'varchar' })
  packId!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 语义化版本（x.y.z） */
  @Column({ name: 'version', type: 'varchar' })
  version!: string

  /** 清单快照 JSON（运行时只读此快照，不读代码） */
  @Column({ name: 'manifest_json', type: 'text' })
  manifestJson!: string

  /** sha256(manifest_json)：升级比对键，未变化不刷新本行 */
  @Column({ name: 'manifest_hash', type: 'varchar' })
  manifestHash!: string

  /** 本期恒为 'builtin'；第三方包留待后续 */
  @Column({ name: 'source', type: 'varchar', default: 'builtin' })
  source!: string

  /** 持久化的全局启用态（1=启用 0=禁用；binding 解析的兜底） */
  @Column({ name: 'enabled', type: 'integer', default: 1 })
  enabled!: number

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
