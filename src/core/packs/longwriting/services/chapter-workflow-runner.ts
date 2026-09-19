/**
 * 章法工作流运行器（唯一正文写作入口的底层）
 * @module core/packs/longwriting/services/chapter-workflow-runner
 * @description 从研讨室工具（story-room/room-agent-tools）提取共享：启动「章节写作章法」
 *              工作流 run 并同步等待终态。工作流引擎确定性执行「生成章节设计卡 → 自检 →
 *              出场实体确认 → 一致性门禁 → 生成并保存正文 → 图谱提取 → 写后一致性检查」，
 *              每步状态进 run 记录可审计。任何正文写作入口（研讨室工具 / IPC / 渲染层 UI）
 *              一律经此，禁止绕过写后一致性检查的直写路径。
 */
import { CHAPTER_WRITING_WORKFLOW_DEF_NAME } from './chapter-workflow-def-name'

/** 章法同步等待上限：与工作流节点 executeTimeoutMs（600s）留余量对齐 */
const RUN_WAIT_DEADLINE_MS = 570_000
const RUN_POLL_INTERVAL_MS = 3_000
const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'skipped'])

/**
 * 启动章法工作流 run 并同步等待终态。
 * @returns ok=true 时 data 为 chapter-writing 节点输出（chapterId/wordCount/content/designCard/review/postCheck/qualityGate）
 */
export async function runChapterWorkflowSync(
  projectId: string,
  outlineId: string,
  overwrite: boolean,
  onProgress?: (p: { step: string; message: string }) => void,
): Promise<{ ok: boolean; error?: string; data?: Record<string, any> }> {
  const started = await ensureChapterWritingWorkflowRun(projectId, outlineId, overwrite)
  onProgress?.({ step: 'workflow', message: `章法工作流已启动（运行 ${started.runId}），工具内等待完成` })
  const { getWorkflowSubsystem } = await import('@core/platform/workflow/workflow-boot')
  const sub = getWorkflowSubsystem()
  const deadline = Date.now() + RUN_WAIT_DEADLINE_MS
  let lastNodeStatus = ''
  while (Date.now() < deadline) {
    const detail = await sub.runService.getRunDetail(started.runId)
    if (!detail) return { ok: false, error: `工作流运行不存在：${started.runId}` }
    const { run, nodeRuns } = detail
    const node = nodeRuns.find((n) => n.nodeType === 'chapter-writing') ?? nodeRuns[nodeRuns.length - 1]
    if (node && node.status && node.status !== lastNodeStatus) {
      lastNodeStatus = node.status
      onProgress?.({ step: 'workflow', message: `章法运行状态：${run.status}${node.status ? `（${node.nodeName || node.nodeType} ${node.status}）` : ''}` })
    }
    if (run.status === 'succeeded') {
      const out = (node?.output ?? {}) as Record<string, any>
      return { ok: true, data: out }
    }
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      const nodeErr = nodeRuns.find((n) => n.error)?.error
      return { ok: false, error: nodeErr || run.error || `工作流 ${run.status}` }
    }
    await new Promise((r) => setTimeout(r, RUN_POLL_INTERVAL_MS))
  }
  return { ok: false, error: `等待章法工作流超时（运行 ${started.runId} 仍在执行，可稍后用 get_workflow_run 查询结果）` }
}

/**
 * 章法工作流触发（用户意见 2026-09-15）：写正文不依赖调用方逐工具调用——启动工作流
 * run 由引擎确定性调度。定义按名称幂等创建并发布（启动工作流要求已发布图）。
 */
export async function ensureChapterWritingWorkflowRun(
  projectId: string,
  outlineId: string,
  overwrite: boolean,
): Promise<{ runId: string; definitionId: string; status: string }> {
  const { getWorkflowSubsystem } = await import('@core/platform/workflow/workflow-boot')
  const sub = getWorkflowSubsystem()

  // 幂等：按名称找已发布定义（内部定义默认被列表过滤——查找须 includeInternal；
  // 存量行 internal=0 时就地升级标记，用户列表下次即不再显示）
  let definitionId: string | null = null
  const listed = await sub.definitionService.list({ keyword: CHAPTER_WRITING_WORKFLOW_DEF_NAME, page: 1, pageSize: 20, includeInternal: true })
  for (const d of listed.items ?? []) {
    if (d.name === CHAPTER_WRITING_WORKFLOW_DEF_NAME) {
      definitionId = d.id
      if (!d.internal) await sub.definitionService.update(d.id, { internal: true })
      break
    }
  }
  if (!definitionId) {
    const graph = {
      version: 1 as const,
      nodes: [
        {
          id: 'start', type: 'start', name: '开始', position: { x: 80, y: 200 },
          config: {
            inputs: [
              { key: 'projectId', label: '长文项目 ID', type: 'string', required: true },
              { key: 'outlineId', label: '章节大纲节点 ID', type: 'string', required: true },
              { key: 'overwrite', label: '覆盖已有正文', type: 'boolean' },
            ],
          },
        },
        {
          id: 'write', type: 'chapter-writing', name: '章节写作章法', position: { x: 320, y: 200 },
          config: {
            projectId: '{{start.projectId}}',
            outlineId: '{{start.outlineId}}',
            overwrite: '{{start.overwrite}}',
            targetWords: 2500,
          },
        },
        { id: 'end', type: 'end', name: '结束', position: { x: 620, y: 200 }, config: {} },
      ],
      edges: [
        { id: 'e_start_write', sourceNodeId: 'start', targetNodeId: 'write', kind: 'normal' },
        { id: 'e_write_end', sourceNodeId: 'write', targetNodeId: 'end', kind: 'normal' },
      ],
    }
    const created = await sub.definitionService.create({
      name: CHAPTER_WRITING_WORKFLOW_DEF_NAME,
      description: '长文写作：按章法确定性写完一章（设计卡→自检→出场实体→一致性检查→写正文→写后检查）',
      category: 'longwriting',
      internal: true,
      draftGraph: graph as never,
    })
    definitionId = created.id
    await sub.definitionService.publish(definitionId)
  }

  const run = await sub.runService.startRun({
    definitionId,
    triggerType: 'manual',
    inputs: { projectId, outlineId, overwrite },
    usePublishedGraph: true,
    // 互斥按「项目+章节」作用域：不同项目（甚至同项目不同章）的章法 run 可并行，
    // 同一章绝不双跑。全局定义级互斥会让多项目共用章法定义时互相 skip（忘川渡实跑）。
    mutexScope: `chapter-writing:${projectId}:${outlineId}`,
  })
  return { runId: run.id, definitionId, status: run.status }
}
