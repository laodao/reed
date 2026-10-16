/**
 * 工作流内部定义标记（2026-09-18 分层收口）：
 * 业务包（longwriting 等）按名称幂等创建的「运行载体」定义（章节写作章法/卷设计章法）
 * 此前直接出现在用户工作流列表——单节点图对用户是噪音，还诱导用户手动编辑/运行。
 * 本迁移给 workflow_definitions 加 internal 列（0=普通定义，1=内部定义）：
 * - 列表默认过滤 internal=1（含关键词查找）；
 * - run 记录/运行历史不受影响（审计照旧可见）；
 * - 业务包自身查找/创建须显式 includeInternal（room-agent-tools）。
 * 存量行 DEFAULT 0 无需回填——两类内部定义由业务包下次触发时按名称找到
 * 后保持原样（仍 internal=0），属可接受的过渡态；新建即带标记。
 * @module core/database/migrations/add-workflow-definition-internal
 */

export async function addWorkflowDefinitionInternal(ds: any): Promise<void> {
  const isPg = (ds.options?.type ?? 'sqlite') === 'postgres'
  const hasColumn = async (): Promise<boolean> => {
    if (isPg) {
      const rows = await ds.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'workflow_definitions' AND column_name = 'internal' LIMIT 1`,
      )
      return rows.length > 0
    }
    const rows = (await ds.query(`PRAGMA table_info(workflow_definitions)`)) as Array<{ name: string }>
    return rows.some((r) => r.name === 'internal')
  }

  if (!(await hasColumn())) {
    await ds.query(`ALTER TABLE workflow_definitions ADD COLUMN internal INTEGER NOT NULL DEFAULT 0`)
    console.log('[add-workflow-definition-internal] 已加列 workflow_definitions.internal')
  }
}
