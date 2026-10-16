/**
 * 资产引用统计服务（T01 · 资产历史分组 + 写回影响范围提示）
 * @module platform/episode-production/assets/services/asset-reference
 *
 * 回答一个问题：替换某资产（角色/地点/物品）的主图，会波及多少分镜、多少集？
 * 用于高危覆盖操作（"设为主图" / 主图"重新生成"）前的确认弹窗，
 * 让用户在覆盖前知道爆炸半径（DramaClaw 9.9 写回设计的核心）。
 *
 * 统计口径（task-01 §2.1 · 2026-10-13 review 修正版，严格按真实 schema）：
 * - character：
 *   路径A `storyboard_characters` 表按 `character_id` 列计数
 *        （该列语义为 character binding id —— 与分镜 characters JSON 的
 *        characterId / 关键帧参考解析 resolver.resolveCharacter 的首选用法一致）；
 *   路径B `scene_characters` 表按 `character_binding_id` 列计数——该列可 null
 *        （实体注释："null 表示老剧本未迁移"），null 行不计入；
 *   路径C `storyboards.characters` JSON 列（2026-10-13 对抗性审查 P1-1 补挂）——
 *        AI 分镜生成主生产路径（storyboard-cogen replaceSceneStoryboards）只写该
 *        JSON 列、不写 storyboard_characters 表，是最常见数据形状；老数据
 *        characterId 也可能不是 binding id，精确等值匹配不中即不计入（不猜）；
 *   三路去重到 storyboard 粒度。
 * - location / item：分镜级 `storyboards.location_binding_ids` / `item_binding_ids`
 *   （simple-json 数组，可多值）——**不做 SQL JSON 包含查询**（SQLite json1 /
 *   PG jsonb 方言差异），改为"按 assetId 取候选分镜行后应用层过滤数组包含"，
 *   双方言安全（character 路径C 与此同型：LIKE 收窄候选 + 应用层精确判断）；
 *   场景级（终审 D-F1 补挂的第二路，真实生成的主推导路径）：
 *   - location：`scene_scripts.location_binding_id`（validator 强制非空，
 *     见 scene-script.entity.ts）→ 场景 → 名下全部分镜展开；
 *   - item：`scene_scripts.characters` JSON 的 `[*].props[*].itemBindingId`
 *     （items 默认消费路径 scene.characters[*].props，见 keyframe-generation
 *     .service.ts resolveSceneAssets 的回退分支；scene_characters 表无 props
 *     列，场景级道具只存在于该 JSON），LIKE 收窄候选 + 应用层精确等值判断
 *     → 场景 → 名下全部分镜展开。
 *   两路去重到 storyboard 粒度。
 *
 * 估算口径声明：本统计不含 `reference_overrides`（图片级引用），结果为估算值；
 * UI 文案一律用"约 N 个分镜（M 集）引用"，不使用绝对化表述
 * （notes 里给出口径说明供弹窗 detail 展示）。
 *
 * 租户可见性：与 asset-image.service 的"me OR builtin"模式一致——
 * 读 = 自己的行 OR user_id IS NULL 的共享行；他人行一律不可见。
 * （storyboard_characters / scene_characters / storyboards / scene_scripts 均带
 * user_id 列；本服务直接持有 DataSource 手工拼接可见性条件，不走 BaseRepository。）
 */

import type { DataSource, ObjectLiteral, SelectQueryBuilder } from 'typeorm'
import { getCurrentUserId } from '@core/context/user-context'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardCharacterEntity } from '@core/database/entities/episode-production/storyboard-character.entity'
import { SceneCharacterEntity } from '@core/database/entities/episode-production/scene-character.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'

export type WriteImpactAssetType = 'character' | 'location' | 'item'

/** 写回影响范围统计结果（估算口径，UI 文案用"约 N 个"） */
export interface AssetWriteImpactResult {
  /** 引用该资产的分镜数（去重到 storyboard 粒度） */
  storyboardCount: number
  /** 上述分镜跨越的剧集数（episode_scripts 去重） */
  episodeCount: number
  /**
   * 估算口径说明列表（弹窗 detail 展示）。固定含"估算值"声明。
   */
  notes: string[]
}

/** 估算口径固定声明（notes 首条；UI 弹窗 detail 展示） */
const ESTIMATE_NOTE =
  '统计为估算值：不含分镜级挑图（reference_overrides）引用，实际以生成时选图为准'

/** IN 查询分块大小（SQLite 变量上限 999，留余量） */
const IN_CHUNK = 400

export class AssetReferenceService {
  constructor(private readonly ds: DataSource) {}

  /** 按资产类型分派统计口径 */
  async getWriteImpact(
    assetType: WriteImpactAssetType,
    assetId: string,
  ): Promise<AssetWriteImpactResult> {
    if (!assetId || !assetId.trim()) {
      throw new Error('assetId 不能为空')
    }
    const id = assetId.trim()
    if (assetType === 'character') {
      return await this.characterImpact(id)
    }
    if (assetType === 'location' || assetType === 'item') {
      return await this.jsonArrayImpact(assetType, id)
    }
    throw new Error(`不支持的资产类型: ${assetType}`)
  }

  /**
   * character 口径：storyboard_characters（character_id）∪ scene_characters
   * （character_binding_id，null 行不计入）∪ storyboards.characters JSON
   * （entry.characterId 精确等值）→ 三路去重到 storyboard 粒度 → 折算剧集数。
   */
  private async characterImpact(assetId: string): Promise<AssetWriteImpactResult> {
    const notes: string[] = [ESTIMATE_NOTE]

    // 路径A：分镜级角色配置表（storyboard_characters.character_id = binding id）→ storyboard id 集
    const sbCharRepo = this.ds.getRepository(StoryboardCharacterEntity)
    const storyboardIds = new Set<string>(
      await this.selectDistinctValues(
        sbCharRepo.createQueryBuilder('sbc').select('sbc.storyboardId', 'value'),
        [{ sql: 'sbc.character_id = :assetId', params: { assetId } }],
      ),
    )

    // 路径B：场景级角色表（scene_characters.character_binding_id = binding id）→ 场景 id 集
    // 可 null 列（"null 表示老剧本未迁移"）：null 行不参与计数（无 binding 无法等值命中）
    const sceneCharRepo = this.ds.getRepository(SceneCharacterEntity)
    const sceneIds = await this.selectDistinctValues(
      sceneCharRepo.createQueryBuilder('scc').select('scc.sceneScriptId', 'value'),
      [
        { sql: 'scc.character_binding_id = :assetId', params: { assetId } },
        { sql: 'scc.character_binding_id IS NOT NULL', params: {} },
      ],
    )

    // 路径B 的场景 → 展开到其名下全部分镜
    if (sceneIds.length > 0) {
      const sbRepo = this.ds.getRepository(StoryboardEntity)
      for (const chunk of chunkList(sceneIds, IN_CHUNK)) {
        const ids = await this.selectDistinctValues(
          sbRepo.createQueryBuilder('sb').select('sb.id', 'value'),
          [{ sql: 'sb.scene_script_id IN (:...sceneIds)', params: { sceneIds: chunk } }],
        )
        for (const id of ids) storyboardIds.add(id)
      }
    }

    // 路径C（review P1-1）：storyboards.characters JSON——AI 分镜生成主生产路径
    // （storyboard-cogen）只写该列不写 storyboard_characters 表，是主引用路径。
    // 与 location/item 同型：LIKE 只做候选集收窄，命中与否由应用层对
    // entry.characterId 精确等值判断（子串误命中 / 非 binding id 的老数据在这里被过滤）。
    const sbRepo = this.ds.getRepository(StoryboardEntity)
    const jsonCandidates = await this.selectVisible(
      sbRepo
        .createQueryBuilder('sb')
        .select(['sb.id', 'sb.sceneScriptId', 'sb.characters'])
        .where('sb.characters LIKE :pat', { pat: `%${assetId}%` }),
    ).getMany()
    for (const sb of jsonCandidates) {
      const entries = Array.isArray(sb.characters) ? sb.characters : []
      const hit = entries.some(
        (e) => e !== null && typeof e === 'object' && (e as Record<string, unknown>).characterId === assetId,
      )
      if (hit) storyboardIds.add(sb.id)
    }

    const episodeIds = await this.episodesOfStoryboards([...storyboardIds])
    return {
      storyboardCount: storyboardIds.size,
      episodeCount: episodeIds.size,
      notes,
    }
  }

  /**
   * location / item 口径（两路去重到 storyboard 粒度）：
   * - 分镜级：storyboards 的 locationBindingIds / itemBindingIds（simple-json
   *   数组）按 assetId 取候选行后应用层过滤数组包含，双方言安全；
   * - 场景级（终审 D-F1，真实生成的主推导路径）：location 走
   *   scene_scripts.location_binding_id（validator 强制非空）；item 走
   *   scene_scripts.characters JSON 的 props[*].itemBindingId（keyframe
   *   生成 resolveSceneAssets 的 items 默认回退分支）。命中的场景展开到
   *   名下全部分镜（与 character 路径B 同语义）。
   */
  private async jsonArrayImpact(
    assetType: 'location' | 'item',
    assetId: string,
  ): Promise<AssetWriteImpactResult> {
    const notes: string[] = [ESTIMATE_NOTE]
    const column =
      assetType === 'location' ? 'locationBindingIds' : 'itemBindingIds'

    // 分镜级：LIKE 只做候选集收窄（JSON 文本包含该 id），命中与否由应用层精确判断数组元素
    // ——子串误命中（如 cb_xxx1 vs cb_xxx12）在这里被精确等值过滤掉
    const sbRepo = this.ds.getRepository(StoryboardEntity)
    const candidates = await this.selectVisible(
      sbRepo
        .createQueryBuilder('sb')
        .select(['sb.id', 'sb.sceneScriptId', 'sb.locationBindingIds', 'sb.itemBindingIds'])
        .where(`sb.${column} LIKE :pat`, { pat: `%${assetId}%` }),
    ).getMany()

    const storyboardIds = new Set<string>()
    for (const sb of candidates) {
      const arr = assetType === 'location' ? sb.locationBindingIds : sb.itemBindingIds
      if (Array.isArray(arr) && arr.map(String).includes(assetId)) {
        storyboardIds.add(sb.id)
      }
    }

    // 场景级：命中 assetId 的场景 → 展开到名下全部分镜（去重并入分镜集）
    const sceneIds = await this.sceneIdsReferencing(assetType, assetId)
    if (sceneIds.length > 0) {
      for (const chunk of chunkList(sceneIds, IN_CHUNK)) {
        const ids = await this.selectDistinctValues(
          sbRepo.createQueryBuilder('sb').select('sb.id', 'value'),
          [{ sql: 'sb.scene_script_id IN (:...sceneIds)', params: { sceneIds: chunk } }],
        )
        for (const id of ids) storyboardIds.add(id)
      }
    }

    const episodeIds = await this.episodesOfStoryboards([...storyboardIds])
    return {
      storyboardCount: storyboardIds.size,
      episodeCount: episodeIds.size,
      notes,
    }
  }

  /**
   * 场景级引用该资产的 scene_scripts.id 集（终审 D-F1）：
   * - location：`location_binding_id` 精确等值（binding id 列，无 JSON）；
   * - item：`characters` JSON 的 `[*].props[*].itemBindingId`——LIKE 只做候选集
   *   收窄，命中与否由应用层对 props 元素精确等值判断（纯字符串 props 是老数据
   *   形状，无 binding 不可等值命中，安全跳过）。
   */
  private async sceneIdsReferencing(
    assetType: 'location' | 'item',
    assetId: string,
  ): Promise<string[]> {
    const sceneRepo = this.ds.getRepository(SceneScriptEntity)
    if (assetType === 'location') {
      return await this.selectDistinctValues(
        sceneRepo.createQueryBuilder('ss').select('ss.id', 'value'),
        [
          { sql: 'ss.location_binding_id = :assetId', params: { assetId } },
          { sql: 'ss.location_binding_id IS NOT NULL', params: {} },
        ],
      )
    }

    // item：LIKE 收窄 characters JSON 候选行，应用层精确判断 props[*].itemBindingId
    const candidates = await this.selectVisible(
      sceneRepo
        .createQueryBuilder('ss')
        .select(['ss.id', 'ss.characters'])
        .where('ss.characters LIKE :pat', { pat: `%${assetId}%` }),
    ).getMany()
    const sceneIds: string[] = []
    for (const ss of candidates) {
      const chars = Array.isArray(ss.characters) ? ss.characters : []
      const hit = chars.some((c) => {
        if (c === null || typeof c !== 'object') return false
        const props = (c as Record<string, unknown>).props
        if (!Array.isArray(props)) return false
        return props.some(
          (p) =>
            p !== null &&
            typeof p === 'object' &&
            (p as Record<string, unknown>).itemBindingId === assetId,
        )
      })
      if (hit) sceneIds.push(ss.id)
    }
    return sceneIds
  }

  /**
   * 分镜 id 集合 → 剧集 id 集合
   * （storyboards.scene_script_id → scene_scripts.episode_script_id，各自按租户可见性过滤）。
   */
  private async episodesOfStoryboards(storyboardIds: string[]): Promise<Set<string>> {
    const episodeIds = new Set<string>()
    if (storyboardIds.length === 0) return episodeIds

    const sbRepo = this.ds.getRepository(StoryboardEntity)
    const sceneIds = new Set<string>()
    for (const chunk of chunkList(storyboardIds, IN_CHUNK)) {
      const rows = await this.selectVisible(
        sbRepo
          .createQueryBuilder('sb')
          .select('sb.sceneScriptId', 'value')
          .where('sb.id IN (:...ids)', { ids: chunk }),
      ).getRawMany<{ value: string | null }>()
      for (const r of rows) {
        if (r?.value) sceneIds.add(String(r.value))
      }
    }
    if (sceneIds.size === 0) return episodeIds

    const sceneRepo = this.ds.getRepository(SceneScriptEntity)
    for (const chunk of chunkList([...sceneIds], IN_CHUNK)) {
      const rows = await this.selectVisible(
        sceneRepo
          .createQueryBuilder('ss')
          .select('ss.episodeScriptId', 'value')
          .where('ss.id IN (:...ids)', { ids: chunk }),
      ).getRawMany<{ value: string | null }>()
      for (const r of rows) {
        if (r?.value) episodeIds.add(String(r.value))
      }
    }
    return episodeIds
  }

  /**
   * 租户可见性（对齐 asset-image.service 的 "me OR builtin" 手工作用域模式）：
   * 读 = 自己的行 OR user_id IS NULL（共享行）；他人行不可见。
   * 返回 [sql, params]，供 andWhere 展开使用。
   */
  private visWhere(alias: string): [string, Record<string, string>] {
    const uid = getCurrentUserId()
    if (!uid) return [`${alias}.user_id IS NULL`, {}]
    return [`(${alias}.user_id = :__uid OR ${alias}.user_id IS NULL)`, { __uid: uid }]
  }

  /** 给 qb 追加可见性条件（内部链式复用） */
  private selectVisible<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
  ): SelectQueryBuilder<T> {
    const [sql, params] = this.visWhere(qb.alias)
    return qb.andWhere(sql, params)
  }

  /** 带可见性 + 附加条件的去重取值（raw 单列，别名固定 value） */
  private async selectDistinctValues(
    qb: SelectQueryBuilder<
      StoryboardCharacterEntity | SceneCharacterEntity | SceneScriptEntity | StoryboardEntity
    >,
    conds: Array<{ sql: string; params: Record<string, unknown> }>,
  ): Promise<string[]> {
    const out = new Set<string>()
    for (const c of conds) qb = qb.andWhere(c.sql, c.params)
    const [visSql, visParams] = this.visWhere(qb.alias)
    qb = qb.andWhere(visSql, visParams)
    const rows = await qb.getRawMany<{ value: string | null }>()
    for (const r of rows) {
      if (r?.value) out.add(String(r.value))
    }
    return [...out]
  }
}

/** 列表分块（SQLite 变量上限防御） */
function chunkList<T>(list: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size))
  }
  return chunks
}
