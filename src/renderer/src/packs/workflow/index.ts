/**
 * 工作流业务包（前端骨架）
 * @module renderer/packs/workflow
 * @description 原地登记式：本期只搬路由/菜单声明，组件文件原地不动（@/views/workflow/）。
 *              /workflow-run/:token 是免登录 guest 运行页（分享链接直达）。
 *              /app-share/:token 虽复用本包的 WorkflowGuestRun 视图，但语义归 app 包
 *              （应用分享页），已随 app 包登记，见 renderer/packs/app。
 */
import { markRaw } from 'vue'
// 图标区分（33 号实测反馈）：待办=工单（注意 Tickets 与 Notebook 同形，须用单数 Ticket）、
// Agent 对话=派活；工作流保留 Connection
// （知识飞轮菜单入口已于 2026-09 随该功能停用移除，见 progress/2026-09-16-*）
import { Connection, Promotion, Ticket } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const workflowPack: RendererPackDefinition = {
  manifest: {
    id: 'workflow',
    name: '工作流',
    version: '1.0.0',
    description: '可视化流程编排与自动化执行——定义/版本/触发器/运行/分享',
    contributions: {
      routePaths: ['/workflow', '/workflow/editor/:id', '/workflow-run/:token', '/workflow/runs/:definitionId', '/workflow/run/:runId', '/workflow/review/:runId', '/agent-tasks', '/agent-todos', '/agent-console'],
    },
  },
  routes: [
    {
      path: '/workflow',
      name: 'WorkflowList',
      component: () => import('@/views/workflow/WorkflowList.vue'),
      meta: { title: '工作流' },
    },
    {
      path: '/workflow/editor/:id',
      name: 'WorkflowEditor',
      component: () => import('@/views/workflow/WorkflowEditor.vue'),
      meta: { title: '工作流编辑器' },
    },
    {
      path: '/workflow-run/:token',
      name: 'WorkflowGuestRun',
      component: () => import('@/views/workflow/WorkflowGuestRun.vue'),
      meta: { title: '工作流运行', guest: true },
    },
    {
      path: '/workflow/runs/:definitionId',
      name: 'WorkflowRunsHistory',
      component: () => import('@/views/workflow/WorkflowRunsHistory.vue'),
      meta: { title: '运行历史' },
    },
    {
      path: '/workflow/run/:runId',
      name: 'WorkflowRunDetail',
      component: () => import('@/views/workflow/WorkflowRunDetail.vue'),
      meta: { title: '运行详情' },
    },
    {
      path: '/agent-tasks',
      name: 'AgentTasks',
      component: () => import('@/views/workflow/AgentTasksView.vue'),
      meta: { title: 'Agent 任务树' },
    },
    {
      path: '/agent-todos',
      name: 'AgentTodos',
      component: () => import('@/views/workflow/AgentTodosView.vue'),
      meta: { title: '待办中心' },
    },
    {
      path: '/agent-console',
      name: 'AgentConsole',
      component: () => import('@/views/workflow/AgentConsoleView.vue'),
      meta: { title: 'Agent 工作台' },
    },
    {
      path: '/workflow/review/:runId',
      name: 'WorkflowReviewPage',
      component: () => import('@/views/workflow/WorkflowReviewPage.vue'),
      meta: { title: '审核确认' },
    },
  ],
  menuItems: [
    {
      path: '/agent-todos',
      label: '待办中心',
      description: '工作流审批与任务裁决集中处理',
      icon: markRaw(Ticket),
    },
    {
      path: '/agent-console',
      label: 'Agent 对话',
      description: '独立的 Agent 会话——直接派活，过程时间线全程可见',
      icon: markRaw(Promotion),
    },
    {
      path: '/workflow',
      label: '工作流',
      description: '可视化流程编排与自动化执行',
      icon: markRaw(Connection),
    },
  ],
  // 无 menuInsertBefore：注册顺序保证其位于知识库之后（见 renderer/packs/index.ts）
}
