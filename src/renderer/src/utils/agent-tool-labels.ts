/**
 * Agent 工具展示名（前端共用件）
 * @module utils/agent-tool-labels
 * @description 聊天页 MessageItem 与 Agent 对话页的活动流共用同一映射，
 *              避免两处漂移（组件共用原则）。
 */

/** 工具名 → 展示名（系统工具给中文名，其余原样） */
export function agentToolLabel(name: string): string {
  const labels: Record<string, string> = {
    discover_capabilities: '查询能力目录',
    run_workflow: '运行工作流',
    get_workflow_run: '查询运行',
    invoke_skill: '执行技能',
    create_task_plan: '创建任务树',
    create_workflow_draft: '生成工作流草稿',
    web_search: '联网搜索',
    wf_web_extract: '网页提取',
    http_get: 'HTTP 获取',
    data_table_query: '数据表查询'
  }
  return labels[name] ?? name
}
