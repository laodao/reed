/**
 * 工作流定义服务：CRUD / 发布 / 导入导出
 * @module core/modules/workflow/workflow-definition.service
 * @description 草稿-发布双图模型；发布前图校验（含 handler config 深度校验）；
 *              导出剥离 userId 与运行数据、不含密钥（节点只引用 providerConfigId）。
 */

import type { WorkflowGraph, WorkflowNode, WorkflowValidationResult } from '@shared/types/workflow.types'
import { validateGraph } from './engine/graph-validator'
import { WorkflowNodeRegistry } from './engine/node-registry'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import type {
  CreateWorkflowDefinitionInput,
  DueCronTriggerRow,
  UpdateWorkflowDefinitionInput,
  WorkflowDefinitionRecord,
} from '../../database/repositories/workflow-definition.repository'
import type { WorkflowDefinitionRepository } from '../../database/repositories/workflow-definition.repository'

/** 导出文件格式（导入导出 JSON 契约） */
export interface WorkflowExportFormat {
  kind: 'the-bot-workflow'
  formatVersion: 1
  name: string
  description: string | null
  category: string | null
  graph: WorkflowGraph
  triggers: unknown[]
  settings: unknown
}

export class WorkflowDefinitionService {
  constructor(
    private readonly repo: WorkflowDefinitionRepository,
    private readonly registry: WorkflowNodeRegistry
  ) {}

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

  list(params: { keyword?: string; page: number; pageSize: number }) {
    return this.repo.list(params)
  }

  /** 保存草稿（graph 变更只落 draft_graph） */
  async saveDraft(id: string, graph: WorkflowGraph): Promise<WorkflowDefinitionRecord | null> {
    return this.repo.update(id, { draftGraph: graph })
  }

  async update(id: string, patch: UpdateWorkflowDefinitionInput) {
    return this.repo.update(id, patch)
  }

  async delete(id: string): Promise<number> {
    return this.repo.delete(id)
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
    return { success: true, definition: updated ?? undefined }
  }

  /** 导出：剥离 id/userId/调度状态，只含定义性数据（不含任何密钥） */
  async exportDefinition(id: string): Promise<WorkflowExportFormat | null> {
    const def = await this.repo.getById(id)
    if (!def?.draftGraph) return null
    return {
      kind: 'the-bot-workflow',
      formatVersion: 1,
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
    content: string
  ): Promise<{ success: boolean; error?: string; definition?: WorkflowDefinitionRecord }> {
    let parsed: WorkflowExportFormat
    try {
      parsed = JSON.parse(content)
    } catch {
      return { success: false, error: 'JSON 解析失败' }
    }
    if (parsed.kind !== 'the-bot-workflow' || parsed.formatVersion !== 1) {
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
    const created = await this.create({
      name: `${parsed.name}（导入）`,
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
