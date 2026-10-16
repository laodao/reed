/**
 * ToolService 自定义工具 → AgentToolRegistry 桥（25 号 M2 批3 / 01 号 §9）
 * @module core/platform/workflow/tools/custom-tool-adapter
 *
 * custom_tools（HTTP/CLI/邮件）导出为 LLM tool（source='tool'）：
 * - paramsSchema 字段卡数组（key/type/required/options/default）→ zod object 派生，
 *   LLM 可见面与执行面同源；未知 type 按 unknown 兜底
 * - 执行器直调 getToolService().executeTool——凭据注入在执行层局部完成，
 *   LLM 永远看不到明文凭据（credentialId 是 binding 的可选注入位）
 * - CLI 工具 exec 级（ToolService.requireDesktopCli 在 Web 端抛错——双保险：
 *   本适配器在 Web 端直接不注册 cli 工具）；邮件工具 external-post 级
 * - 注册时机：workflow-boot 拉取列表一次性注册；工具 CRUD 后下次 run 的
 *   buildToolDefs 快照生效（不热更——23 号 §3 快照纪律）
 */

import { z } from 'zod'
import { createLogger } from '@core/utils/logger'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import type { CustomTool } from '@shared/types/tool.types'
import { TOOL_KINDS } from '@shared/types/tool.types'
import { getToolService } from './tool-registry'

const logger = createLogger('CustomToolAdapter')

/** 桌面端判定（与 ToolService 的 RCE 门禁同口径） */
const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron

/** 单字段卡 → zod（string/number/boolean/enum(options)；未知类型兜底 unknown——
 * 字段卡是宿主侧人填的类型标注，不应因标注拼写偏差拒绝 LLM 的合法入参） */
function fieldToZod(field: { type?: string; options?: unknown[] }): z.ZodTypeAny {
  switch ((field.type ?? 'string').toLowerCase()) {
    case 'number':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'select':
    case 'enum':
      if (Array.isArray(field.options) && field.options.length > 0 && field.options.every((o) => typeof o === 'string')) {
        return z.enum(field.options as [string, ...string[]])
      }
      return z.string()
    case 'string':
      return z.string()
    default:
      return z.unknown()
  }
}

/** paramsSchema 字段卡数组 → zod object（required 位必填；其余 optional） */
export function paramsSchemaToZod(
  schema: Array<{ key: string; label?: string; type?: string; required?: boolean; options?: unknown[]; default?: unknown }> | undefined | null,
): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of schema ?? []) {
    if (!field?.key) continue
    const base = fieldToZod(field)
    const withDesc = field.label ? base.describe(field.label) : base
    shape[field.key] = field.required ? withDesc : withDesc.optional()
  }
  return z.object(shape).describe('工具入参')
}

/** 工具名归一（TOOL_NAME_RE 全长 ≤49，前缀 custom_ 占 7——body 截 42；review B8：
 *  48 截断 + 前缀必然 55 超长注册失败且静默） */
function normalizeToolName(name: string): string {
  const body = name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 42)
  return `custom_${body || 'tool'}`
}

/** CustomTool → AgentToolDef（执行走 ToolService.executeTool；工具不存在/删除时运行期结构化报错） */
export function customToolToAgentDef(tool: CustomTool): AgentToolDef {
  const dangerLevel: AgentToolDef['dangerLevel'] =
    tool.kind === TOOL_KINDS.cli ? 'exec' : tool.kind === TOOL_KINDS.email ? 'external-post' : 'external-post'
  return {
    name: normalizeToolName(tool.name),
    description: tool.description?.trim() || `自定义工具：${tool.name}`,
    inputSchema: paramsSchemaToZod(tool.paramsSchema),
    dangerLevel,
    requiresApproval: true, // 自定义工具出网/出系统面，一律默认人工批准（binding 可显式放宽）
    execute: async (input, ctx) => {
      // 凭据引用：宿主 binding.credentialId 优先（registry 透传），回落工具自身
      // 绑定；LLM args 永不参与凭据决策（review B2：此前两者都丢，带凭据工具裸奔）
      const result = await getToolService().executeTool({
        type: 'custom',
        toolId: tool.id,
        credentialId: ctx.credentialId ?? tool.credentialId ?? null,
        params: input as Record<string, unknown>,
        signal: ctx.signal ?? new AbortController().signal,
      })
      if (!result.ok) throw new Error(result.text || `工具执行失败（HTTP ${result.status}）`)
      return {
        status: result.status,
        json: result.json,
        text: result.text.slice(0, 4000),
        filePath: result.filePath,
        durationMs: result.durationMs,
      }
    },
  }
}

/**
 * 拉取自定义工具并注册（workflow-boot 装配调用）。
 * CLI 工具 Web 端跳过（RCE 门禁的注册侧前置，不依赖执行期抛错）。
 * 返回注册数量（启动日志/测试断言用）。
 */
export async function registerCustomAgentTools(registry: AgentToolRegistry): Promise<number> {
  let customTools: CustomTool[] = []
  try {
    customTools = await getToolService().listCustomTools()
  } catch (e) {
    logger.warn(`[custom-tool-adapter] 自定义工具拉取失败（跳过注册）：${e instanceof Error ? e.message : String(e)}`)
    return 0
  }
  let n = 0
  for (const tool of customTools) {
    if (tool.kind === TOOL_KINDS.cli && !isElectron) continue
    // 归一后重名（CJK 名坍缩/同名截断）追加序号重试，而不是静默跳过（review B8）
    for (let attempt = 1; attempt <= customTools.length + 1; attempt++) {
      const def = customToolToAgentDef(tool)
      if (attempt > 1) def.name = `${def.name}_${attempt}`
      try {
        registry.register(def, { source: 'tool' })
        n++
        break
      } catch (e) {
        if (attempt > customTools.length) {
          logger.warn(`[custom-tool-adapter] 工具 ${tool.name} 注册失败（跳过）：${e instanceof Error ? e.message : String(e)}`)
          break
        }
      }
    }
  }
  return n
}
