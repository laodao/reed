# 阶段二/三：能力应用模板 + 菜单精简（工作流重构全部能力）

日期：2026-08-22
状态：✅ 完成并通过 E2E

## 背景

接 `2026-08-22-asset-foundation.md`（阶段一：资产地基）。本轮把五个能力（图像生成/文档翻译/文本转语音/语音转文本/语音复刻）做成官方工作流模板并发布为应用，然后精简菜单、旧路由重定向。

## 阶段二：五能力官方模板 + 发布为应用

### 1. 新增 voice-clone 节点（语音复刻）
- 输入：样本音频路径（start file 字段 .path）+ 音色名 + prefix（小写字母数字≤10）+ 语种 + 是否等待完成
- 实现：ffprobe 自动探测样本时长（10-20s 校验）→ `VoiceCloneService.cloneVoice` 提交训练 →
  `waitForCompletion=true`（默认）轮询 `refreshClonedVoiceStatus` 到 ready/failed（同 kb-ingest 模式）
- 输出：{ clonedVoiceId, voiceId, status, name }——voiceId 直接接 tts 节点合成
- 已入节点目录（catalog/forms/types/注册表），启动一致性自检通过
- 配置校验对模板值（含 {{}}）跳过格式约束（运行时由服务层校验）

### 2. 修复 defaultModelId 链路缺陷（真实使能缺陷）
- **问题**：`TranslationService` 引用 `providerConfig.defaultModelId`，但类型/实体/仓库/handler 全链路从未接线
  （default_model 列被忽略）→ 无显式 modelId 时翻译永远报「没有可用的文本模型」
- **修复**：UserProviderConfig 加 defaultModelId、ProviderConfigEntity 加 default_model 列、
  repository toDto/create/update 接线、IPC create/update 接受 defaultModelId、preload 类型同步
- 验证：设置 DeepSeek 为默认 provider + 默认模型 deepseek-v4-flash 后，翻译应用端到端成功

### 3. 五个官方模板（`src/renderer/src/assets/workflow-templates/*-app.json`）
| 模板 | 流程 | 资产沉淀 |
|---|---|---|
| image-gen-app | start(prompt/modelId/尺寸) → image-gen → save-asset | 图片 |
| translate-app | start(text/targetLang) → translate → save-asset | 文本 |
| tts-app | start(text/voiceId) → tts → save-asset | 音频 |
| stt-app | start(audio file) → stt → save-asset | 文本 |
| voice-clone-app | start(样本/名称/文本) → voice-clone → tts → save-asset | 音频 |

注册到 WorkflowList「从模板创建」内置列表；模板导入→发布→`createFromWorkflow` 创建应用（幂等跳过同名）。

## 阶段三：菜单精简 + 路由重定向

- **菜单**：移除 图像生成/文档翻译/语音助手（tts/stt/clone）三项；人像设计按用户决定保留。
  最终侧边栏：首页 / AI对话 / 人像设计 / 应用 / 工作流 / 日记 / 知识库 / 资产管理 + 底部设置
- **路由重定向**：/image→图像生成、/translate→文档翻译、/voice/tts→文本转语音、
  /voice/stt→语音转文本、/voice/clone→语音复刻（beforeEnter 按应用名反查，找不到兜底 /apps）；
  /voice→/apps
- 旧视图文件保留（死代码，后续清理）

## 验证

1. `scripts/e2e-capability-apps.cjs` 全通过：
   - 5 模板导入→发布→建应用（幂等），应用存在且渠道正确（会话+API 开）
   - **真实运行「文档翻译」应用**：'Hello world...' → 译文「你好，世界，这是一次AI工作流测试。」
     结果卡 + 资产落库（text 分类「翻译结果」）全部正确
   - 结构验证：图像生成模板含 modelId 输入；语音复刻模板 voice-clone 节点 + tts 引用 {{clone1.voiceId}}
   - 清理：删除测试资产；官方应用保留（阶段三重定向目标）
2. `scripts/e2e-menu-redirect.cjs` 全通过：5 条旧路由重定向到对应应用详情页，/voice 兜底应用列表；
   首页卡片不再出现已移除能力
3. tsc 零错误；vue-tsc 仅预存 TS6305
4. 残留清理：E2E 资产零残留；5 个官方应用各 1 个无重复

## 说明

- 语音复刻节点真实训练需要 DashScope API Key，未做端到端执行（结构/注册/校验已覆盖）；
  翻译应用做了真实端到端运行（验证了 defaultModelId 链路 + 保存资产闭环）。
- 用户环境此前所有 provider 都未设默认模型（default_model 全为 null）——本轮 E2E 顺带把
  DeepSeek 设为默认 provider + 默认模型，属正常环境配置。
