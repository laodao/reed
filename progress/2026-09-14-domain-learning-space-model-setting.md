# 领域学习：空间级「知识生成模型」设置 + 设置对话框加宽

日期：2026-09-14
用户需求（方案 A）：「在空间设置中增加模型设置，同时把空间设置对话框宽度加宽。」+ 之前的口径——
知识生成默认模型优先指到 vLLM 的 qwen3.8-27b，其余模块不受影响（不改全局默认）。

## 背景：领域学习之前用哪个模型

- 领域学习 agent（研究此概念 / 生成首批知识 / AI 补全地图 / 自动推进）此前**没有专属模型设置**：
  前端 `store.sendAgent` 不传 provider/model，后端 `dl-agent-harness.doSend` 落到**全局默认提供商**的第一个 text 模型 —— 当前全局默认是 DeepSeek。
- `dl_project.default_model` 列原本只有**自动推进调度器**在读（`domain-learning.handler.ts` 的 scheduler.runJob），
  前端没有任何入口去设置它。

## 改动

| 层 | 改动 |
| --- | --- |
| 服务 `learning-project.service.ts` | 新增 `getModelSettings` / `setModelSettings`（读写 `dl_project.default_model`，存 `{providerConfigId, modelId}`，双 null=跟随全局默认；去空白） |
| 服务类型 | 新增 `DlSpaceModelSettings`（type 别名，可赋给 `Record<string,unknown>` 落库） |
| IPC handler | 新增 `dl:get-space-model` / `dl:set-space-model`；`dl:agent-send` 在 research/task 且调用方未显式给模型时，**读空间默认模型**覆盖（tutor 追问仍走全局默认） |
| preload / web channel-map / store | 三端补 `getSpaceModel` / `setSpaceModel` 通道；store 暴露 `spaceModelOf` / `saveSpaceModelOf`（`dl-channel-consistency` 护栏通过） |
| 前端 `SpaceSettingsPanel.vue` | 新增「知识生成模型」设置块：下拉按提供商分组列出**已启用的 text 模型**，含「跟随全局默认」；保存走 store |
| 前端 `DomainLearningSpace.vue` | 空间设置对话框 `width 520px → 760px` |

## 模型实测（vLLM qwen3.8-27b，直连脚本 `progress/_vllm_eval.cjs`）

通过 Electron 主进程 safeStorage 解密 vLLM 密钥后直连 `http://192.168.2.129:8001/v1`：

| 项 | 结果 |
| --- | --- |
| 鉴权（/models） | ✅ 200 |
| 生成知识内容（讲义） | ✅ 质量高：meta 首区/类比/定义公式/逐步演算含回算/自测题只提问 |
| **工具调用**（dl_save_concept） | ✅ 正确输出 `tool_calls`，JSON 参数合规（name/definitionShort/prerequisites） |
| 思考占用输出 | ⚠️ 默认(思考)模式下 `max_tokens` 不足会被**思考截断、正文为空**；`enable_thinking:false` 或给足 `max_tokens` 才出正文 |

## 关键遗留/风险（需要用户侧确认）

1. **max_tokens 截断风险**：qwen3.8-27b 落库是 `supportsThinking:false`，而它实际会输出 reasoning。
   现有 `resolveMaxTokens` 的「思维链下限 16384」只对 `supportsThinking:true` 生效 → 该模型实际 `max_tokens` 会用
   模型定义的 4096，思考一大就容易截断正文（和本次 1500 那个现象同型）。且 qwen context 只有 8192，不能直接套 16384 下限。
   **建议**：在 vLLM 端把该模型配置为**默认不思考**（vLLM 启动参数 / chat 模板 `enable_thinking=false`）最干净；
   这样 app 侧不改 provider，`max_tokens=4096` 也够用。若一定走思考模式，需要把 vLLM 端模型定义与 dl 侧输出上限都调大。
2. **真实一轮验证**：功能接线已通、工具调用已测通，但完整的「研究此概念」agent 循环（含 `dl_save_*` 落库 + 逐工具调用）
   只能在你点开 app 时验证 —— 在空间设置选好 vLLM qwen 后点一次「生成首批知识 / 研究此概念」，看能否正常落概念与讲义。

## 追加（同日期，用户回测反馈）

- **保存失败排查**：代码链路（store → preload → handler → service → repo）核对无误，且 `dl-channel-consistency` 护栏通过。
  「保存失败」的根因是 **新 IPC 通道（`dl:get-space-model`/`dl:set-space-model`）在 preload + 主进程 handler，
  renderer 的 HMR 不会重载 preload** —— 应用没整体重启前，`window.electronAPI.domainLearning.setSpaceModel` 不存在，
  store 捕获异常返回 null → 面板显示"保存失败"。需**完整重启应用（重建 main/preload）**后即生效。
  另：若用打包产物（`out/`），需 `npm run build` 再开。
- **UI 调整（均已改，renderer 侧 HMR 生效）**：
  - 空间设置对话框 `760px → 900px`（`DomainLearningSpace.vue`）；
  - 「前置能力」输入框 `300px → 420px`；
  - 去掉前置能力输入框下的说明文字（`.set-hint` 块）；
  - 去掉各分区标题的括号后缀（`领域画像` / `自动推进` / `关联知识库` / `间隔复习` / `主题学习前置要求` / `知识生成模型`）。

## 方案乙（同日期，用户反馈"空间设置里保存按钮太多"）

把原来 6 个分区各自的保存按钮（应用画像 / 保存前置要求 / 保存自动推进 / 保存绑定 / 保存模型 / 保存复习设置）
**收敛成一个顶部「保存设置」按钮统一落库**（`SpaceSettingsPanel.vue`）：

- 增加 `saveAll()`：`Promise.all` 顺序提交 6 个分区（画像/前置/自动推进/知识库/模型/复习），
  全部成功 → 绿「已保存全部设置」，任一失败 → 红「有 N 项保存失败」；`saving` 做按钮 loading。
- 各 `applyXxx` / `saveKb` 改为返回 `boolean` 供 `saveAll` 汇总；`applyProfile` 不再 `emit('applied')`
  （统一保存不自动关闭对话框，用户手动关）。
- 区块内的状态提示改为非按钮的静态行（调度状态、知识库绑定状态、模型保存状态）。
- 移除已无用的 `.set-actions` 样式，`.pace-state` 提为全局；清理未用的 `prereqNote`。

## 验证

- 新增 `learning-project-model.spec.ts`（3 例：未设置=跟随全局 / 写入可读回 / null 与去空白）✅
- `dl-agent-deps.spec.ts`（25 例，含上一项「整体知识点体系清单」）✅
- `dl-channel-consistency.spec.ts`（三端通道集合一致）✅
- 领域学习全量：29 文件 / 288 例 ✅
- 改动文件 `vue-tsc` 无报错（preload/channel-map 的 longwriting/episode 段报错为仓库既有，与本次无关）