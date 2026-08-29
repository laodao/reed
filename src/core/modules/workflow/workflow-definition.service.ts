/**
 * 工作流定义服务：CRUD / 发布 / 导入导出
 * @module core/modules/workflow/workflow-definition.service
 * @description 草稿-发布双图模型；发布前图校验（含 handler config 深度校验）；
 *              导出剥离 userId 与运行数据、不含密钥（节点只引用 providerConfigId）。
 */

import crypto from 'node:crypto'
import type { WorkflowGraph, WorkflowNode, WorkflowValidationResult } from '@shared/types/workflow.types'
import { validateGraph } from './engine/graph-validator'
import { WorkflowNodeRegistry } from './engine/node-registry'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'

/** 导入副本的名称后缀（用户可识别非原创定义） */
const IMPORT_NAME_SUFFIX = '（导入）'

/** 桌面端判定（调用时读取，便于测试 stub）：内置模板编辑门禁用（评审 #70/#71） */
function isDesktopEnv(): boolean {
  return !!(process.versions as Record<string, string | undefined> | undefined)?.electron
}
import { previewCronExpression } from './trigger/workflow-trigger-scheduler.service'
import { WORKFLOW_TRIGGER_TYPES, WORKFLOW_EXPORT_KIND, WORKFLOW_EXPORT_FORMAT_VERSION } from '@shared/types/workflow.types'
import type {
  CreateWorkflowDefinitionInput,
  DueCronTriggerRow,
  UpdateWorkflowDefinitionInput,
  WorkflowDefinitionRecord,
  WorkflowDefinitionSortBy,
  WorkflowDefinitionVersionRecord,
  WorkflowSortOrder,
} from '../../database/repositories/workflow-definition.repository'
import type { WorkflowDefinitionRepository } from '../../database/repositories/workflow-definition.repository'
import { createLogger } from '@core/utils/logger'
import { getCurrentUserId } from '@core/context/user-context'

const logger = createLogger('WorkflowDefinitionService')

/** 导出文件格式（导入导出 JSON 契约） */
export interface WorkflowExportFormat {
  kind: WORKFLOW_EXPORT_KIND
  formatVersion: 1
  name: string
  description: string | null
  category: string | null
  graph: WorkflowGraph
  triggers: unknown[]
  settings: unknown
}

/** 调度器钩子（boot 装配后注入，避免服务层↔调度器循环依赖） */
export interface TriggerSchedulerHook {
  recomputeOne(definitionId: string): Promise<void>
}

export class WorkflowDefinitionService {
  /** 由 workflow-boot 注入：发布/触发器变更后刷新 next_fire_at 与事件索引。
   *  不注入时发布只落库（调度不生效）——boot 装配是完整启用的必要条件。 */
  private schedulerHook: TriggerSchedulerHook | null = null

  constructor(
    private readonly repo: WorkflowDefinitionRepository,
    private readonly registry: WorkflowNodeRegistry
  ) {}

  /** boot 装配后注入调度器钩子 */
  setTriggerScheduler(hook: TriggerSchedulerHook): void {
    this.schedulerHook = hook
  }

  /** 发布/触发器变更后的调度状态刷新（有钩子才生效） */
  private async refreshSchedule(definitionId: string): Promise<void> {
    if (!this.schedulerHook) return
    try {
      await this.schedulerHook.recomputeOne(definitionId)
    } catch (e) {
      logger.error('[WorkflowDefinitionService] 调度状态刷新失败（不影响发布结果）', e)
    }
  }

  /** 新建：含 start→end 骨架草稿图 */
  async create(input: CreateWorkflowDefinitionInput): Promise<WorkflowDefinitionRecord> {
    const skeleton: WorkflowGraph = {
      version: 1,
      nodes: [
        {
          id: 'start',
          type: 'start',
          name: '开始',
          position: { x: 80, y: 200 },
          config: { inputs: [] },
        },
        {
          id: 'end',
          type: 'end',
          name: '结束',
          position: { x: 480, y: 200 },
          config: {},
        },
      ],
      edges: [{ id: 'e_start_end', sourceNodeId: 'start', targetNodeId: 'end', kind: 'normal' }],
    }
    return this.repo.create({ ...input, draftGraph: input.draftGraph ?? skeleton })
  }

  getById(id: string): Promise<WorkflowDefinitionRecord | null> {
    return this.repo.getById(id)
  }

  list(params: {
    keyword?: string
    page: number
    pageSize: number
    sortBy?: WorkflowDefinitionSortBy
    sortOrder?: WorkflowSortOrder
  }) {
    return this.repo.list(params)
  }

  /** 保存草稿（graph 变更只落 draft_graph） */
  async saveDraft(id: string, graph: WorkflowGraph): Promise<WorkflowDefinitionRecord | null> {
    return this.repo.update(id, { draftGraph: graph })
  }

  async update(id: string, patch: UpdateWorkflowDefinitionInput) {
    // 评审 #70/#71：内置模板是多租户共享行（Web 端一处编辑即污染所有租户）——
    // Web 端禁止改内容；桌面单用户维持可编辑。updateTriggers 同门禁。
    const def = await this.repo.getById(id)
    if (def?.isBuiltin && !isDesktopEnv()) {
      throw new Error('内置工作流模板不可修改（多租户共享），请复制为自定义工作流后再编辑')
    }
    const updated = await this.repo.update(id, patch)
    // 触发器或发布图变更会影响调度——刷新
    if (patch.triggers !== undefined || patch.publishedGraph !== undefined) {
      await this.refreshSchedule(id)
    }
    return updated
  }

  async delete(id: string): Promise<number> {
    const affected = await this.repo.delete(id)
    // 删除后刷新调度状态与事件索引：否则已删定义的 cron 状态 / 事件触发器
    // 残留内存索引，每次事件触发一次"工作流不存在"错误日志（报告分组 7 🟡5）
    if (affected > 0) await this.refreshSchedule(id)
    return affected
  }

  // ==================== C3 分享（免登录独立页） ====================

  /** 启用分享：仅已发布定义可分享；生成 256bit 随机令牌，**只存 sha256 hash**（不明文落库）。
   *  明文 token 仅在本次响应返回（前端展示/复制链接）。已分享时轮换令牌（旧链接失效，
   *  分享即授权语义一致；轮换成本低）。 */
  async enableShare(id: string): Promise<WorkflowDefinitionRecord | null> {
    const def = await this.repo.getById(id)
    if (!def) throw new Error('工作流不存在')
    if (def.publishedVersion <= 0) throw new Error('只有已发布的工作流才能分享')
    const token = crypto.randomBytes(32).toString('hex')
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    // 新令牌存 hash；历史明文列置 null（存量数据保留在 share_token 列，查询按 hash 优先 + 明文兼容）
    const updated = await this.repo.update(id, { shareToken: null, shareTokenHash: hash })
    if (!updated) throw new Error('启用分享失败')
    // 明文 token 仅本次响应返回（不落库）
    return { ...updated, shareToken: token }
  }

  /** 停止分享：清除令牌 hash 与历史明文（历史分享链接立即失效） */
  async disableShare(id: string): Promise<WorkflowDefinitionRecord | null> {
    return this.repo.update(id, { shareToken: null, shareTokenHash: null })
  }

  /**
   * 按令牌取已分享定义（跨租户；REST 免登录入口用）。
   * 调用方拿到 userId 后必须 runWithUserAsync(该 userId) 再启动运行。
   */
  async getByShareToken(token: string): Promise<WorkflowDefinitionRecord | null> {
    if (!token || !/^[0-9a-f]{16,128}$/i.test(token)) return null // 令牌形态守卫
    return this.repo.findByShareToken(token)
  }

  /** 按 webhook 令牌取定义（P0 片5；跨租户，调用方须 runWithUserAsync 所有者） */
  async findByWebhookToken(token: string): Promise<WorkflowDefinitionRecord | null> {
    if (!token || !/^[0-9a-f]{32,128}$/i.test(token)) return null // 形态守卫
    return this.repo.findByWebhookToken(token)
  }

  /**
   * 触发器校验（发布时调用）：
   * - V1 限制：每个定义至多 1 个启用的 cron 触发器（定义级单列 next_fire_at
   *   无法独立调度多个表达式；per-trigger 状态表为 V2 项）
   * - cron 表达式合法性、事件触发器 eventName 必填
   */
  validateTriggers(triggers: unknown[]): string[] {
    const errors: string[] = []
    const list = triggers as Array<{ type?: string; expression?: string; timezone?: string; enabled?: boolean; eventName?: string }>
    const enabledCron = list.filter(t => t.type === WORKFLOW_TRIGGER_TYPES.cron && t.enabled)
    if (enabledCron.length > 1) {
      errors.push('V1 限制：每个工作流只能启用 1 个定时触发器')
    }
    for (const t of enabledCron) {
      const preview = previewCronExpression(t.expression ?? '', t.timezone)
      if (!preview.valid) errors.push(`cron 表达式无效：${t.expression}（${preview.error}）`)
      // 评审 #36：timezone 必须是可解析的 IANA 名称——写错了不如不配（静默回落本地时区）
      if (t.timezone) {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: t.timezone })
        } catch {
          errors.push(`时区无效：${t.timezone}（需 IANA 名称，如 Asia/Shanghai）`)
        }
      }
    }
    for (const t of list.filter(x => x.type === WORKFLOW_TRIGGER_TYPES.event && x.enabled)) {
      if (!t.eventName) errors.push('事件触发器缺少 eventName')
    }
    return errors
  }

  /** 图校验（编辑器实时调用；含 handler config 深度校验） */
  validate(graph: WorkflowGraph): WorkflowValidationResult {
    return validateGraph(graph, {
      validateNodeConfig: (node: WorkflowNode) => {
        const handler = this.registry.get(node.type)
        return handler ? handler.validateConfig(node.config as never) : [`未知节点类型：${node.type}`]
      },
    })
  }

  /**
   * 仅更新触发器（应用详情页「配置定时」入口）：
   * 不改图、不 +1 发布版本（与 publish 不同），校验后落库并刷新调度状态，
   * 使 cron 立即生效 / 停用立即失效。内置定义同样允许（定时是全局调度配置）。
   */
  async updateTriggers(id: string, triggers: WorkflowTrigger[]): Promise<{ success: boolean; error?: string }> {
    const def = await this.repo.getById(id)
    if (!def) return { success: false, error: '工作流不存在' }
    // 评审 #70：内置工作流 cron 调度配置同样属于模板内容，Web 端任意租户可改属越权
    if (def.isBuiltin && !isDesktopEnv()) {
      return { success: false, error: '内置工作流模板不可修改调度配置（多租户共享），请复制为自定义工作流' }
    }
    const errors = this.validateTriggers(triggers)
    if (errors.length > 0) return { success: false, error: errors.join('；') }
    await this.repo.updateTriggersOnly(id, {
      triggers,
      // 清调度状态：停用/变更后由调度器按新配置重建（与 publish 同纪律）
      nextFireAt: null,
      lastFireAt: null,
    })
    await this.refreshSchedule(id)
    return { success: true }
  }

  /**
   * 发布：校验通过才可发布；草稿复制进 published_graph，版本 +1（不可变语义）。
   * 触发器与设置随发布固化（对发布版生效）。
   */
  async publish(
    id: string,
    triggers?: UpdateWorkflowDefinitionInput['triggers'],
    settings?: UpdateWorkflowDefinitionInput['settings']
  ): Promise<{ success: boolean; error?: string; definition?: WorkflowDefinitionRecord }> {
    const def = await this.repo.getById(id)
    if (!def) return { success: false, error: '工作流不存在' }
    const graph = def.draftGraph
    if (!graph) return { success: false, error: '草稿图为空' }
    const result = this.validate(graph)
    if (!result.valid) {
      return { success: false, error: `图校验未通过：${result.errors.slice(0, 5).join('；')}` }
    }
    // 触发器合法性（发布时固化——含 V1 单 cron 限制）
    const effectiveTriggers = triggers ?? def.triggers
    const triggerErrors = this.validateTriggers(effectiveTriggers)
    if (triggerErrors.length > 0) {
      return { success: false, error: `触发器配置无效：${triggerErrors.join('；')}` }
    }
    const updated = await this.repo.update(id, {
      publishedGraph: graph,
      publishedVersion: def.publishedVersion + 1,
      publishedAt: new Date(),
      ...(triggers !== undefined ? { triggers } : {}),
      ...(settings !== undefined ? { settings } : {}),
      // cron 触发被禁用/无 cron 时清掉调度状态；启用时的 nextFireAt 由片6 调度器计算
      nextFireAt: null,
      lastFireAt: null,
    })
    // 固化不可变版本快照（发布历史；失败不阻断发布，仅告警）
    try {
      const effectiveSettings = settings !== undefined ? settings : def.settings
      await this.repo.createVersion({
        definitionId: id,
        version: updated?.publishedVersion ?? def.publishedVersion + 1,
        name: updated?.name ?? def.name,
        description: updated?.description ?? def.description,
        category: updated?.category ?? def.category,
        graph,
        triggers: effectiveTriggers ?? [],
        settings: effectiveSettings ?? null,
        createdBy: getCurrentUserId(),
      })
    } catch (e) {
      logger.warn('[WorkflowDefinitionService] 版本快照写入失败（不影响发布结果）', e)
    }
    // 发布后刷新调度状态与事件索引（否则 cron 永不触发、事件触发器不生效）
    await this.refreshSchedule(id)
    return { success: true, definition: updated ?? undefined }
  }

  /** 版本历史列表（按版本号降序；定义不可见返回空） */
  listVersions(definitionId: string): Promise<WorkflowDefinitionVersionRecord[]> {
    return this.repo.listVersions(definitionId)
  }

  /**
   * 恢复历史版本：版本快照应用为**当前草稿**（图/触发器/设置，不自动发布）。
   * 用户确认后保存/发布即产生新版本——历史版本保持不可变。
   */
  async restoreVersion(
    definitionId: string,
    versionId: string
  ): Promise<{ success: boolean; error?: string; definition?: WorkflowDefinitionRecord }> {
    const def = await this.repo.getById(definitionId)
    if (!def) return { success: false, error: '工作流不存在' }
    const version = await this.repo.getVersion(versionId)
    if (!version || version.definitionId !== definitionId) {
      return { success: false, error: '版本不存在' }
    }
    const updated = await this.repo.update(definitionId, {
      draftGraph: version.graph,
      triggers: version.triggers,
      settings: version.settings,
    })
    if (!updated) return { success: false, error: '恢复失败' }
    // 触发器变更会影响调度——刷新
    await this.refreshSchedule(definitionId)
    return { success: true, definition: updated }
  }

  /** 导出：剥离 id/userId/调度状态，只含定义性数据（不含任何密钥） */
  async exportDefinition(id: string): Promise<WorkflowExportFormat | null> {
    const def = await this.repo.getById(id)
    if (!def?.draftGraph) return null
    return {
      kind: WORKFLOW_EXPORT_KIND,
      formatVersion: WORKFLOW_EXPORT_FORMAT_VERSION,
      name: def.name,
      description: def.description,
      category: def.category,
      graph: def.draftGraph,
      triggers: def.triggers,
      settings: def.settings,
    }
  }

  /**
   * 导入：格式/节点类型校验；duplicatePolicy 'copy'（默认）新建副本，
   * 名称加"（导入）"后缀避免混淆。
   */
  async importDefinition(
    content: string,
    opts?: { duplicatePolicy?: 'copy' | 'overwrite' }
  ): Promise<{ success: boolean; error?: string; definition?: WorkflowDefinitionRecord }> {
    let parsed: WorkflowExportFormat
    try {
      parsed = JSON.parse(content)
    } catch {
      return { success: false, error: 'JSON 解析失败' }
    }
    if (parsed.kind !== WORKFLOW_EXPORT_KIND || parsed.formatVersion !== WORKFLOW_EXPORT_FORMAT_VERSION) {
      return { success: false, error: '不是有效的工作流导出文件' }
    }
    const graph = parsed.graph
    if (!Array.isArray(graph?.nodes) || graph.nodes.length === 0) {
      return { success: false, error: '导出文件中没有节点' }
    }
    // 节点类型存在性（未知类型给出警告级错误信息但拒绝导入——图跑不起来）
    const unknown = graph.nodes.filter(n => !NODE_TYPE_CATALOG_MAP[n.type as never])
    if (unknown.length > 0) {
      return {
        success: false,
        error: `包含未知的节点类型：${[...new Set(unknown.map(n => n.type))].join(', ')}`,
      }
    }
    // 结构校验（导入即给反馈——草稿也应是合法图）
    const structure = this.validate(graph)
    if (!structure.valid) {
      return { success: false, error: `图结构校验未通过：${structure.errors.slice(0, 5).join('；')}` }
    }
    // 覆盖策略：overwrite = 更新同名工作流的草稿（保留 id/版本/运行历史）
    if (opts?.duplicatePolicy === 'overwrite') {
      const existing = await this.repo.list({ keyword: parsed.name, page: 1, pageSize: 50 })
      const match = existing.items.find(d => d.name === parsed.name)
      if (match) {
        const updated = await this.repo.update(match.id, {
          name: parsed.name,
          description: parsed.description,
          category: parsed.category,
          draftGraph: graph,
          triggers: Array.isArray(parsed.triggers) ? (parsed.triggers as never) : undefined,
          settings: (parsed.settings as never) ?? undefined,
        })
        return { success: true, definition: updated ?? undefined }
      }
      // 无同名 → 落到新建
    }
    const created = await this.create({
      name: opts?.duplicatePolicy === 'overwrite' ? parsed.name : IMPORT_NAME_SUFFIX ? `${parsed.name}${IMPORT_NAME_SUFFIX}` : parsed.name,
      description: parsed.description,
      category: parsed.category,
      draftGraph: graph,
      triggers: Array.isArray(parsed.triggers) ? (parsed.triggers as never) : undefined,
      settings: (parsed.settings as never) ?? undefined,
    })
    return { success: true, definition: created }
  }

  /** 仅供调度器（片6）：到期扫描转发 */
  scanDueCronTriggers(now: Date): Promise<DueCronTriggerRow[]> {
    return this.repo.scanDueCronTriggers(now)
  }
}
