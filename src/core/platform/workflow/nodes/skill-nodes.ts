/**
 * 技能节点（skill-call：调用技能包）
 * @module core/platform/workflow/nodes/skill-nodes
 * @description 选择技能（select-dynamic source=skills）→ 按技能 inputs 参数 schema 填参
 *              （value 支持 {{工作流变量}}，由引擎深解析）→ 渲染技能提示词（{{param.xxx}}
 *              占位替换）→ 拼接 references 参考资料 → AI 生成。输出 content / skillId / usage。
 *              技能定义不在节点 config 内，引擎不解析其模板；参数经 inputs 显式注入，
 *              职责清晰：技能是纯参数化任务模板，与具体工作流解耦。
 */

import { callAIStream } from '../../services/ai-call'
import { getSkillService } from '../skills/skill-registry'
import { stringifyValue } from '../engine/variable-resolver'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'

const skillCallNode: WorkflowNodeHandler = {
  type: 'skill-call',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'content', type: 'string', desc: '技能执行结果（模型回复全文）' },
    { key: 'skillId', type: 'string', desc: '实际执行的技能 id' },
    { key: 'usage', type: 'json', desc: 'token 用量 { promptTokens, completionTokens }' },
  ],
  validateConfig(config) {
    const cfg = config as { skillId?: string }
    const errors: string[] = []
    if (!cfg.skillId || stringifyValue(cfg.skillId).trim() === '') {
      errors.push('必须选择技能')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    try {
      return await this.doExecute(ctx)
    } catch (e) {
      // 显式 failed（LLM 调用失败多为临时性，标 retryable 供引擎重试）
      return { status: 'failed', error: `技能执行失败: ${e instanceof Error ? e.message : String(e)}`, retryable: true }
    }
  },

  async doExecute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      skillId: string
      inputs?: Array<{ key: string; value: string }>
      providerConfigId?: string
      modelId?: string
      temperature?: number
      maxTokens?: number
    }
    const skillId = stringifyValue(cfg.skillId)
    const skill = getSkillService().resolveSkill(skillId)
    if (!skill) return { status: 'failed', error: `技能 ${skillId} 不存在`, retryable: false }
    if (!skill.modelInvocable) {
      return { status: 'failed', error: `技能 ${skillId} 已禁用模型调用`, retryable: false }
    }

    // 1. 参数：inputs 数组（value 已由引擎深解析工作流变量）
    const params: Record<string, string> = {}
    for (const p of cfg.inputs ?? []) {
      if (p.key) params[p.key] = stringifyValue(p.value)
    }
    // 2. 渲染技能模板 {{param.xxx}}（缺参按空串处理并告警）
    const render = (tpl: string): string =>
      tpl.replace(/\{\{param\.([a-zA-Z0-9_]+)\}\}/g, (_, k: string) => {
        if (!(k in params)) ctx.logger.warn(`技能 ${skillId} 缺少参数 ${k}（已按空处理）`)
        return params[k] ?? ''
      })
    const body = render(skill.body)
    const systemPrompt = render(skill.systemPrompt)

    // 3. references 参考资料拼入正文（执行时自动附带技能包参考文档）
    const refsText = (skill.references ?? []).map(r => `[${r.name}]\n${r.content}`).join('\n\n')
    const finalPrompt = refsText ? `${body}\n\n===== 参考资料 =====\n${refsText}` : body

    // 4. AI 生成（公共调用层：modelId fallback 链 + AbortSignal 真取消 + 增量进度 + 多轮历史）
    const history = ctx.getLLMHistory?.() ?? []
    const r = await callAIStream({
      prompt: finalPrompt,
      systemPrompt,
      providerConfigId: cfg.providerConfigId,
      modelId: cfg.modelId,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      messages: history.length > 0 ? history : undefined,
      signal: ctx.signal,
      onDelta: d => ctx.emitProgress(-1, d.slice(-50)),
    })
    ctx.emitProgress(100)

    const output: Record<string, unknown> = { content: String(r?.content ?? ''), skillId }
    if (r?.usage) output.usage = r.usage
    // 多轮对话：登记本轮（multiTurn 开启时生效）
    ctx.recordLLMTurn?.('user', finalPrompt)
    ctx.recordLLMTurn?.('assistant', String(r?.content ?? ''))
    return { status: 'succeeded', output }
  },
}

export const SKILL_NODE_HANDLERS: WorkflowNodeHandler[] = [skillCallNode]
