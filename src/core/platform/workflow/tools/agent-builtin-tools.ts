/**
 * Agent 内置工具（首批白名单，14 号 §M1 / 02 号 M1.4）
 * @module core/platform/workflow/tools/agent-builtin-tools
 *
 * 首批只接入 llm 无关的安全工具子集（读操作为主），执行器直调现有能力
 * （"路线 A"）：http_get→executeHttpFetch（SSRF 闸门单一入口不破）、
 * web_search→搜索引擎服务、code_run→代码节点沙箱（桌面端限定）、
 * data_table_query→内置数据表查询。
 *
 * 依赖方向（22 号 §3）：本文件在 workflow 模块内装配并注册进
 * agent-runtime 的 AgentToolRegistry——harness 不认识任何具体工具。
 * 写操作类工具（HTTP POST/data-table 写）与 AgentToolBinding 富配置
 * （静态 config/批准策略/maxCalls）随 M2 接线批放开。
 */

import { z } from 'zod'
import { executeHttpFetch } from '../nodes/http-fetch'
import { runCodeInSandbox, isElectronRuntime } from '../nodes/code-nodes'
import { getVariableDataService } from '../variables/variable-data.service'
import { getSearchEngineService } from '@core/platform/services/search-engine.service'
import { WORKFLOW_LIMITS } from '@shared/types/workflow.types'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'

const HttpGetInput = z.object({
  url: z.string().describe('完整 http(s) 地址'),
  headers: z.record(z.string(), z.string()).optional().describe('附加请求头'),
  timeoutMs: z.number().int().positive().max(60_000).optional().describe('超时毫秒（缺省 30s）'),
})

const WebSearchInput = z.object({
  query: z.string().describe('搜索关键词'),
  maxResults: z.number().int().min(1).max(20).optional().describe('返回条数（缺省 5）'),
})

const CodeRunInput = z.object({
  code: z.string().describe('JS 代码，可通过 inputs 接收参数，return 返回结果'),
  inputs: z.record(z.string(), z.unknown()).optional().describe('入参对象'),
})

const DataTableQueryInput = z.object({
  tableId: z.string().optional().describe('表 id'),
  tableName: z.string().optional().describe('表名'),
})

/** GET 网页/API（读操作；SSRF 闸门经 executeHttpFetch 强制生效） */
const httpGetTool: AgentToolDef<z.infer<typeof HttpGetInput>> = {
  name: 'http_get',
  description: '发起 HTTP GET 请求，获取网页或 API 内容（文本/JSON 直接返回，二进制落盘返回路径）',
  inputSchema: HttpGetInput,
  dangerLevel: 'read',
  autoApprovableInWorkflow: true,
  execute: async (input, ctx) => {
    const r = await executeHttpFetch(
      {
        method: 'GET',
        url: input.url,
        headers: input.headers,
        timeoutMs: input.timeoutMs,
        responseType: 'auto',
      },
      ctx.signal ?? new AbortController().signal,
    )
    if (!r.ok) throw new Error(r.error)
    return r.output
  },
}

/** 联网搜索（读操作；引擎解析与 web-search 节点同链：用户默认配置） */
const webSearchTool: AgentToolDef<z.infer<typeof WebSearchInput>> = {
  name: 'web_search',
  description: '联网搜索：返回标题/链接/摘要列表（用 http_get 获取命中页面全文）',
  inputSchema: WebSearchInput,
  dangerLevel: 'read',
  autoApprovableInWorkflow: true,
  execute: async (input) => {
    const service = getSearchEngineService()
    const def = await service.getDefaultConfig()
    if (!def?.templateId) {
      throw new Error('未配置默认搜索引擎——请在 设置 → 搜索引擎 中配置后重试')
    }
    const resp = await service.search(input.query, def.templateId as never, def.id, input.maxResults)
    if (!resp.success) throw new Error(`搜索失败: ${resp.error ?? '未知错误'}`)
    return {
      results: (resp.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.snippet })),
    }
  },
}

/** 沙箱执行 JS（桌面端限定；exec 级危险默认需人工批准——14 号 §8 取严） */
const codeRunTool: AgentToolDef<z.infer<typeof CodeRunInput>> = {
  name: 'code_run',
  description: '在沙箱中执行 JavaScript 片段做数据处理/计算（仅桌面端可用；return 的值作为结果）',
  inputSchema: CodeRunInput,
  dangerLevel: 'exec',
  requiresApproval: true,
  execute: async (input) => {
    if (!isElectronRuntime()) {
      throw new Error('code_run 仅桌面端可用（Web 端不支持在服务端执行任意 JS）')
    }
    return { result: runCodeInSandbox(input.code, input.inputs ?? {}, WORKFLOW_LIMITS.codeTimeoutMs) }
  },
}

/** 内置数据表查询（只读；写操作随 M2 批准链放开） */
const dataTableQueryTool: AgentToolDef<z.infer<typeof DataTableQueryInput>> = {
  name: 'data_table_query',
  description: '查询本应用内置数据表的全部行（tableId 或 tableName 二选一）',
  inputSchema: DataTableQueryInput,
  dangerLevel: 'read',
  autoApprovableInWorkflow: true,
  execute: async (input) => {
    if (!input.tableId && !input.tableName) {
      throw new Error('tableId 与 tableName 至少提供一个')
    }
    const rows = await getVariableDataService().queryRows({
      tableId: input.tableId,
      tableName: input.tableName,
    })
    return { rows }
  },
}

/** 注册首批内置工具（workflow-boot 装配调用；重复注册由 registry 冲突检测拦截） */
export function registerBuiltinAgentTools(registry: AgentToolRegistry): void {
  registry.register(httpGetTool)
  registry.register(webSearchTool)
  registry.register(codeRunTool)
  registry.register(dataTableQueryTool)
}

/** 首批工具名清单（测试/文档参考；编辑器数据源走 IPC→registry.listSpecs 动态取） */
export const BUILTIN_AGENT_TOOL_NAMES = [
  httpGetTool.name,
  webSearchTool.name,
  codeRunTool.name,
  dataTableQueryTool.name,
] as const
