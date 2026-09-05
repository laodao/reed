# 工作流组件（节点）扩展指南

左侧组件面板完全由组件元数据驱动——**新增组件无需改编辑器任何代码**。三步：

## 1. 声明组件元数据

`src/shared/types/workflow-node-catalog.ts` 的 `NODE_TYPE_CATALOG` 加一项：
类型标识（kebab-case，同步加进 `WorkflowNodeType` 联合）、显示名、分类
（flow/ai/general）、图标、端口约束（出边类型与数量）、默认 config、输出 schema。

## 2. 实现执行逻辑

`src/core/modules/workflow/nodes/` 新建文件，实现 `WorkflowNodeHandler`
接口（`type / controlKind / cancellable / outputSchema / validateConfig / execute`），
在 `nodes/index.ts` 的 `createFullNodeRegistry()` 注册。

引擎与目录的一致性自检（`assertNodeRegistryConsistent`）会在启动时拦截漂移。

## 3. 附带配置表单（编辑器自动获得表单）

`src/shared/types/workflow-node-forms.ts` 的 `NODE_CONFIG_FORMS` 加一份
表单 Schema（text/textarea/number/select/switch/slider/kv-list/branches/
inputs-list/fields-list/select-dynamic）。编辑器按 Schema 自动渲染——
组件面板、画布节点、配置表单三处即刻生效。

## 验证

`npm test -- tests/unit/core/modules/workflow/node-registry-consistency.spec.ts`
保证目录/表单/输出 schema 三方一致。

## 示例

参考 `ai-nodes.ts` 的 web-search（最简单的服务适配节点）与
`task-nodes.ts` 的 llm-chat（含取消与进度推送）。
