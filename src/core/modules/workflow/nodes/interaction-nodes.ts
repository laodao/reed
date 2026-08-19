/**
 * 交互节点（E1，对标 Bisheng 输入/输出节点）
 * @module core/modules/workflow/nodes/interaction-nodes
 * @description
 * - form-collect 表单收集：流程中途挂起，向用户渲染声明式表单（文本/数字/布尔/下拉/文件上传，
 *   必填/默认值），用户提交后值进入节点输出 {{form.values.xxx}}，流程沿 approve 边继续；
 *   取消沿 reject 边。复用引擎 waiting_review 挂起/恢复机器（与 human-review 同一机制）。
 *   文件字段值：{ path, name, text }（上传时落盘并解析文本，下游可直接引用文本做检索/生成）。
 * - message 输出：向运行流输出消息内容（V1：运行详情时间线 + 事件流；C2 对话集成后进会话）。
 */

import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { WORKFLOW_RUN_EVENT_TYPES } from '@shared/types/workflow.types'

/** 表单字段声明（与 start 输入同构 + file 类型） */
export interface FormFieldDef {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'json' | 'select' | 'file'
  options?: Array<{ label: string; value: string | number }>
  multi?: boolean
  required?: boolean
  defaultValue?: unknown
}

const formCollectNode: WorkflowNodeHandler = {
  type: 'form-collect',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'values', type: 'json', desc: '用户提交的表单值 { 字段key: 值 }；文件字段为 { path, name, text }' },
    { key: 'cancelled', type: 'boolean', desc: '用户取消（走 reject 边）时 true' },
  ],
  validateConfig(config) {
    const cfg = config as { formTitle?: string; fields?: FormFieldDef[]; timeoutMs?: number }
    const errors: string[] = []
    if (stringifyValue(cfg.formTitle).trim() === '') errors.push('表单标题不能为空')
    const fields = cfg.fields ?? []
    if (!Array.isArray(fields) || fields.length === 0) errors.push('至少需要一个表单字段')
    else {
      const keys = new Set<string>()
      for (const f of fields) {
        if (!f.key?.trim()) errors.push('存在缺少 key 的字段')
        else if (keys.has(f.key)) errors.push(`字段 key 重复：${f.key}`)
        else keys.add(f.key)
        if (!f.label?.trim()) errors.push(`字段 ${f.key || '(无key)'} 缺少显示名`)
        if (f.type === 'select' && (!f.options || f.options.length === 0)) {
          errors.push(`下拉字段 ${f.key} 缺少选项`)
        }
      }
    }
    if (cfg.timeoutMs !== undefined && (!Number.isFinite(cfg.timeoutMs) || cfg.timeoutMs <= 0)) {
      errors.push('timeoutMs 必须是正数')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as { formTitle: string; fields: FormFieldDef[]; timeoutMs?: number }
    // 挂起：payload 携带表单 schema（引擎置 waiting_review；用户提交经 reviewDecide 恢复，
    // applyReviewDecision 的 form-collect 分支把 editedValues 组装为 { values } 输出）
    return {
      status: 'waiting_review',
      payload: {
        formTitle: cfg.formTitle,
        fields: cfg.fields ?? [],
        // 前端据此渲染动态表单（与 review-requested 事件同通道下发）
        form: true,
      },
      timeoutMs: cfg.timeoutMs ?? null,
    }
  },
}

const messageNode: WorkflowNodeHandler = {
  type: 'message',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'content', type: 'string', desc: '输出内容（模板已解析）' },
  ],
  validateConfig(config) {
    const cfg = config as { content?: string }
    return stringifyValue(cfg.content).trim() === '' ? ['输出内容不能为空'] : []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as { content: string; level?: string }
    const content = stringifyValue(cfg.content)
    // V1：经节点进度通道把内容带到运行流（运行详情时间线可见）；
    // C2 对话集成后同一路径进会话消息
    ctx.emitProgress(100, content.slice(0, 200))
    void WORKFLOW_RUN_EVENT_TYPES.nodeProgress
    return { status: 'succeeded', output: { content } }
  },
}

export const INTERACTION_NODE_HANDLERS: WorkflowNodeHandler[] = [formCollectNode, messageNode]
