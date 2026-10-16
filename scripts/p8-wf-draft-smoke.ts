/**
 * M7 冒烟（31 号，真模型 DashScope）：NL → 工作流 DSL 生成 → validate 通过 → 草稿落库（假仓储）。
 * 运行：P5_API_KEY=... npx tsx scripts/p8-wf-draft-smoke.ts
 */
import { WorkflowDraftService } from '@core/platform/workflow/draft/workflow-draft.service'
import { ProviderAdapter } from '@core/platform/agent-runtime/provider/provider-adapter'

const API_KEY = process.env.P5_API_KEY ?? ''
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const MODEL = process.env.P7_MODEL ?? 'qwen-flash'

function assert(cond: unknown, label: string): void {
  if (cond) console.log(`  ✅ ${label}`)
  else {
    console.error(`  ❌ ${label}`)
    process.exitCode = 1
  }
}

async function main() {
  if (!API_KEY) {
    console.error('缺少 P5_API_KEY')
    process.exit(1)
  }
  const adapter = new ProviderAdapter({
    getProviderConfig: async () => ({
      config: { id: 'p8', baseUrl: BASE_URL, defaultModel: MODEL, models: [{ id: MODEL, type: 'text', features: ['chat'] }] },
      template: { id: 'dashscope', apiConfig: { baseUrl: BASE_URL }, models: [{ id: MODEL, type: 'text', features: ['chat'] }] },
      apiKey: API_KEY,
    }) as never,
  })
  // 真 validate（与生产同链）：graph-validator + 节点级 validateConfig 深校验
  const { createFullNodeRegistry } = await import('@core/platform/workflow/nodes')
  const { validateGraph } = await import('@core/platform/workflow/engine/graph-validator')
  const registry = createFullNodeRegistry()
  const realValidate = (graph: Parameters<WorkflowDraftService['draftFromDescription'] extends never ? never : [import('@shared/types/workflow.types').WorkflowGraph]>[0]) =>
    validateGraph(graph, {
      validateNodeConfig: (node) => {
        const handler = registry.get(node.type)
        return handler ? handler.validateConfig(node.config as never) : [`未知节点类型：${node.type}`]
      },
    }).errors

  const created: Array<{ id: string; name: string }> = []
  const drafts: Array<{ id: string; nodeCount: number }> = []
  const svc = new WorkflowDraftService({
    resolveModel: (o) => adapter.resolveModel(o),
    validate: realValidate,
    create: async (input) => {
      const row = { id: `wf-${created.length + 1}`, name: input.name }
      created.push(row)
      return row as never
    },
    saveDraft: async (id: string, graph) => {
      drafts.push({ id, nodeCount: graph.nodes.length })
      return null as never
    },
  })

  console.log('=== NL → 工作流草稿（真模型） ===')
  const r = await svc.draftFromDescription({ description: '做一个工作流：先联网搜索"AI Agent 最新进展"，把搜索结果摘要翻译成英语，最后延时 5 秒后结束' })
  assert(r.definitionId.startsWith('wf-'), `草稿落库（definitionId=${r.definitionId}）`)
  assert(r.nodeCount >= 4, `节点数 ≥4（实际 ${r.nodeCount}）`)
  assert(drafts.length === 1 && drafts[0].nodeCount === r.nodeCount, 'saveDraft 收到完整图')
  console.log(`  节点构成: ${JSON.stringify(r)}`)

  if (process.exitCode === 1) process.exit(1)
  console.log('\n冒烟通过 ✅')
  process.exit(0)
}

void main()
