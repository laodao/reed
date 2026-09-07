/**
 * 工作流业务包（前端骨架）
 * @module renderer/packs/workflow
 * @description 原地登记式：本期只搬路由/菜单声明，组件文件原地不动（@/views/workflow/）。
 *              /workflow-run/:token 是免登录 guest 运行页（分享链接直达）。
 *              /app-share/:token 虽复用本包的 WorkflowGuestRun 视图，但语义归 app 包
 *              （应用分享页），已随 app 包登记，见 renderer/packs/app。
 */
import { markRaw } from 'vue'
import { Connection } from '@element-plus/icons-vue'
import type { RendererPackDefinition } from '../registry'

export const workflowPack: RendererPackDefinition = {
  manifest: {
    id: 'workflow',
    name: '工作流',
    version: '1.0.0',
    description: '可视化流程编排与自动化执行——定义/版本/触发器/运行/分享',
    contributions: {
      routePaths: ['/workflow', '/workflow/editor/:id', '/workflow-run/:token', '/workflow/runs/:definitionId', '/workflow/run/:runId', '/agent-tasks', '/agent-memory', '/agent-todos', '/agent-console'],
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
      path: '/agent-memory',
      name: 'AgentMemory',
      component: () => import('@/views/workflow/AgentMemoryView.vue'),
      meta: { title: '知识飞轮' },
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
  ],
  menuItems: [
    {
      path: '/agent-todos',
      label: '待办中心',
      description: '审批/任务裁决/记忆审批集中处理',
      icon: markRaw(Connection),
    },
    {
      path: '/agent-console',
      label: 'Agent 工作台',
      description: 'Agent 会话过程时间线（工具调用/决策/结果）',
      icon: markRaw(Connection),
    },
    {
      path: '/agent-tasks',
      label: 'Agent 任务树',
      description: '长程任务分解与质量门',
      icon: markRaw(Connection),
    },
    {
      path: '/agent-memory',
      label: '知识飞轮',
      description: '任务经验的沉淀与审批',
      icon: markRaw(Connection),
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
