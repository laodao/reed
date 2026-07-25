# 新版人像设计 · 开发进度（M1-M4 全部完成）

> 日期：2026-07-24
> 分支：feat/portrait-design-redesign
> Spec：`docs/superpowers/specs/2026-07-24-portrait-redesign-spec.md`
> Plan：`docs/superpowers/plans/2026-07-24-portrait-redesign.md`

## 交付总览

按计划 14 个任务全部完成，全程 TDD，40 例单元测试全绿，lint 0 error。

### 前置：预存 WIP 整理

- 会话开始前工作区存在"人像分辨率选择"完整未提交功能，先行单独提交（10 文件，含既有 10 例测试），净化后续历史。

### M1 数据层

- **Task 1**：`PortraitFraming(half/full)` 类型、variant type 加 `face`、`portrait_variants.framing` 列（迁移幂等 + 存量回填 full，双端注册）、Repository DTO 透出。
- **Task 2**：`portrait_prompt_templates` 表（Entity/Repository/建表迁移/dbManager 双端注册）。
- **Task 3**：内置模板 seeder（5 条，抽取 docs/prompt.txt，幂等；修正了注册顺序——必须在 repo 初始化之后）。已验证首启注入、二次启动幂等。

### M2 核心服务（全部新增，存量行为零改动）

- **Task 4**：`buildPortraitPrompt` 新方法（framing 后缀 + overrides 可覆盖）；`generatePortrait` 仅加可选 `framing` 参数（不传=现状 full 行为锁定）。
- **Task 4b**：换衣/换背景加可选 `prompt`（追加）+ `referenceImages`（与单值合并）。
- **Task 5**：模板服务 list/apply/save/delete（占位符解析、builtin 保护）。
- **Task 6**：`generateFullBody`（源半身置首参考、strength 默认 0.55、产出 framing=full/parentId=源）；`ImageGenerationRequest` 加 `strength/focusRegion`。
- **Task 7**：`editFace`（模板+指令叠加、focusRegion 区域约束、产出独立 type=face、原图不变）。

### M3 IPC + preload

- **Task 8**：6 个新通道（generate-full-body / edit-face / prompt-template:list/apply/save/delete）+ preload 暴露。

### M4 前端工作台（token 驱动，零硬编码样式）

- **Task 9**：特性紫 token、MAINSTREAM_PORTRAIT_SIZES 常量、SizeSelect/ReferenceImagePicker/TemplatePicker 基础组件。
- **Task 10**：GeneratePanel（默认半身）+ useImageModels composable（抽取复用替代 CharacterEditor 重复逻辑）；service additive 透传 quality/referenceImages（修了两个预存死参数）。
- **Task 11**：EditPanel（framing 联动：半身→editFace / 全身→复用 editImage，仅暴露真实支持参数）+ MoreActionsPanel + 4 对话框（Regenerate/Clothes/Background/Angles）。
- **Task 12**：VariantGallery（半身组/全身组/衍生组，全身空状态生成入口）+ GenerateFullBodyDialog。
- **Task 13**：PortraitWorkbench 容器 + Portrait.vue 接入（旧 CharacterEditor 保留不删）。

## 验证结果

| 项 | 结果 |
|----|------|
| 单元测试（人像 6 个 spec） | 40/40 全绿 |
| ESLint | 0 error（warning 为 any/属性顺序，与仓库现状一致） |
| 新增组件零硬编码样式（色值/圆角/阴影） | ✅ grep 校验通过 |
| Electron 启动 + 迁移 + seeder | ✅ 首启/二启（幂等）均正常 |
| main/preload/renderer 编译 | ✅ |
| 预存环境问题 | knowledge-base/voice-clone 两个 spec 的 ERR_DLOPEN_FAILED 为 better-sqlite3 原生绑定环境问题，与本次改动无关（stash 后同样失败） |

## 待用户手动验收（spec §9）

1. 新建角色 → 默认生成半身像；工作台半身/全身 tab 切换联动
2. 全身组空状态 → 生成全身像对话框 → 生成后面部与半身一致
3. 修改面部：模板预览联动；产出独立 face variant，原图/服装/背景不变
4. 换衣/换背景：补充提示词 + 多参考图生效
5. 模板库：内置 5 条可用，可建自定义
6. 存量功能回归：旧生成/换衣/换背景/多角度不传新参数行为一致

## 后续

- 模板库管理 UI（TemplateLibrary 视图）：本次完成 list/apply/save/delete 全链路，管理界面可后续补
- 皮肤方案 P1（data-skin 切换机制）：docs/design/theme-skin-system-design.md，本 feature 已满足其 D5（新代码 token 驱动）
- 旧 CharacterEditor.vue 及其子组件在新版稳定后清理

---

## 第二阶段：Provider 能力模型与参数治理（2026-07-24 晚）

基于研究（docs/design/image-provider-api-params-research.md）与设计
（docs/design/image-provider-capability-model-design.md）完成 5 个任务：

- **Task 1 能力模型**：ImageModelCapabilities 类型 + model-capabilities.ts 注册表
  （覆盖 dashscope/bailian/volcengine/openai 全部模型，前缀匹配，模型级差异）；
  未登记抛 UnregisteredModelCapabilityError（不隐瞒原则）。单测 11 例。
- **Task 2 可灵修正**：kling/* 路由到官方 image-generation 端点 + 异步头
  （修正在先错误：一切模型落 image-synthesis）；参数集只发
  n/aspect_ratio/resolution/watermark，负面词并入正向 prompt；size 映射三档宽高比；
  getModels 增加可灵 v3/v3 omni。单测 7 例。
- **Task 3 火山/万相修正**：火山显式 watermark:false（修官方默认带水印）+ 停发
  未列参数；万相 multimodal 透传 prompt_extend（缺省 true 保现状）。单测 4 例。
- **Task 4 service 感知**：generateImage 生成边界未登记显式报错；capabilities
  单点注入三处模型列表；人像一致性场景 promptExtend:false。单测 2 例 + 断言 2 例。
- **Task 5 UI 能力渲染**：GeneratePanel 参数按能力显隐、参考图上限驱动；
  SizeSelect 可灵三档模式；撤掉强度滑块（三家官方均无 strength，
  面容一致性=参考图+focusRegion prompt 保障）。

验证：image-providers 22 例 + services 42 例全绿；lint 0 error；dev 启动正常。
注：image.service/portrait.service 等文件 11 个 unused-vars lint error 为预存
问题（HEAD 同样存在），与本次改动无关；误纳入的 e2e WIP 文件已从提交中剔除。

---

## 第三阶段：增量计划执行（2026-07-25，plan 2026-07-24-portrait-next-phase v2）

- **A0-1 prompt_extend**：TDD 过程中发现缺陷分析不准确——wan2.6-image 实际走
  "未知模型 → multimodal 兜底"路径（Task 3 已传 prompt_extend，本就生效）。
  实际改动：native（wanx-v1）路径补传 prompt_extend + 3 例测试锁定真实路由行为。
  教训：先写测试暴露了我自己的错误分析。
- **B 模板库 UI**：/portrait-templates 路由 + 两个入口；TemplateLibrary（全量
  拉取客户端分组）/TemplateCard（内置只读锁）/TemplateEditDialog（校验+占位符
  说明）；剪贴板 fallback 链；对话框打开/切换形象时 TemplatePicker 重载。
- **C 皮肤机制**：index.scss 侧栏结构 token（classic=现状值）+ modern 深色 token；
  element-plus.scss modern 覆盖（EP 圆角+关经典动效）；MainLayout 侧栏全部
  token 化（classic 视觉零变化 by construction）；useSkin composable（持久化）；
  Settings 外观页"界面皮肤"选择；MainLayout 启动接入。
  **待用户验收**：classic 零回归目检 + modern 观感拍板（V13/V14）。
- **D 旧件清理**：引用清查后删除 6 个旧组件（CharacterEditor 系列 +
  PortraitGenerator + SizeSelector）；保留 ExportDialog/Create/EditCharacterDialog。
  lint 0 error、测试全绿、dev 重启正常。

测试基线：image-providers 25 例 + services 42 例全绿。
**遗留待用户执行**：Phase A1 真机实测 9 项（需真实 key，可灵需华北2）。

---

## 第四阶段：面容几何工作室（2026-07-25，spec/plan 2026-07-25）

完整交付 P1-P4：
- P1：@mediapipe/tasks-vision（本地 WASM+模型，不走 CDN）+ faceMetrics
  （三庭五眼/脸型，上庭外推标估计）+ 检测器封装（真实半身像实测 478 点检出）
- P2：标注层（关键点/三庭线可开关）+ 指标面板 + 工作室容器 + EditPanel 入口
- P3：bandWarp 分段变形（压缩+平移+背景色补齐，避免下脸拉伸失真）+
  参数滑块实时预览（<16ms，变形关键点/指标同步）
- P4：paramPrompt 双通道翻译（文字短语+变形图参考）+ saveDataUrlImage/
  saveFaceVariantFromDataUrl + FaceCompareDialog 复用 + AI 结果自动复测
验证：97 例测试全绿；lint 0 error；检测管线经浏览器 harness 实测。
待用户验收：spec §8 六项（标注/变形无拉伸/算法保存/双通道日志/复测/降级）。
