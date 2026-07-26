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

### 工作室排障记录（2026-07-25 晚）

- **检测失败根因链**（CDP 远程调试逐层定位）：
  ① 表象 404 → 模型放错 public（应在 src/renderer/public，命中 SPA fallback 返回 text/html）
  ② 归位后仍失败 → 逐级探测真根因：CSP `script-src 'self'` 拒绝 WASM 编译
  （'unsafe-eval' is not allowed）。修复：index.html meta + 主进程 header 注入
  同步加 `wasm-unsafe-eval`（CSP3 定向放行）。CDP 实测检测成功、指标正确。
  教训：先看日志（用户指正），404 不一定是文件缺失，content-type 探针破 SPA fallback 迷局。
- **下颌宽/眼距无效**（用户反馈，属实）：此前只实现纵向变形。补 applyHorizontalWarp
  （下颌带水平缩放+背景填充、眼区位移+邻域肤色填充），几何纯函数配 3 例单测。
- 预览切换改 el-switch 小开关（用户反馈太大）。
- 失败处理改进：失败不再被 Map 永久缓存的现象说明（模块级缓存会缓存 DetectFailure，
  需刷新页面清除）——已知，后续可将缓存限定为仅成功结果。

---

## 第五阶段：3D mesh 形变重构（2026-07-25，消除横向变形裂缝）

用户反馈：调整下颌宽/眼距导致图片裂缝。根因：旧 applyHorizontalWarp 用"硬切矩形 + 位移 +
单色填"，边界断层 + fillRect/drawImage 错位补丁。经讨论选定路 A（3D 关键点 mesh 形变），
弃用路 B（3DMM 真重建，需 Python+GPU，成本不符）。

架构：478 个 3D 关键点（保留 z）+ 内置 mesh 拓扑 -> 顶点位移场（连续）-> 逐三角仿射纹理
渲染。顶点位移连续 -> 三角形共享顶点一致 -> 无内部裂缝。P4 双通道 AI 生成链路零改动
（3D 渲染图替换 bandWarp 输出，paramPrompt/复测/对比对话框全复用）。

- **T1 faceMeshTopology.ts**：临时装 @mediapipe/face_mesh 提取 FACEMESH_TESSELATION
  （2556 边对 = 852 三角，每 3 边对 [a,b],[b,c],[c,a] 重建一三角，bad=0 全闭合，468 顶点
  全覆盖）+ 语义分组（FACE_OVAL/LEFT_EYE/RIGHT_EYE/LEFT_EYEBROW/RIGHT_EYEBROW/LIPS）。
  提取后卸载包。6 例测试。
- **T2 Point 升级保留 z**：faceMetrics Point 加可选 z（computeFaceMetrics 零改动），
  useFaceLandmarks 保留 p.z（此前被丢弃）。7 例测试（含 z 回归保护）。
- **T3 vertexWarp.ts**：computeVertexDisplacements 顶点位移场。纵向分段线性（位置连续，
  修掉旧纵向/横向叠加 y 对齐 bug）；jaw 下颌带内 weight=1 向上 smoothstep 衰减、围绕 cx
  沿 x 缩放；eyeSpacing 径向高斯（左眼 +dx / 右眼 -dx）。14 例测试。
- **T4 meshRenderer.ts**：renderWarpedMesh 逐三角仿射纹理映射（computeAffineTransform
  纯函数算 6 参数矩阵 + ctx.setTransform + clip + drawImage）+ 背景色填充让出区 + 降采样。
  6 例测试（仿射矩阵；渲染靠 CDP 实测）。
- **T5 bandWarp.ts 重写**为 3D mesh 入口（warpFaceBands = 位移场 + 渲染），删除旧 2D 实现
  （computeBandLayout/jawBandDst/eyeShiftDx/computeEyeRegions/applyHorizontalWarp/transformPointY）。
  FaceGeometryStudio 预览降采样 scale=0.25、保存全量 scale=1。6 例测试。
- **T6 验证**：geometry 6 个 spec 47 例全绿；lint 0 error（4 warning 为预存 attributes-order/
  catch any）；electron-vite build 通过（renderer 含 Portrait 模块）。

关键设计决策：
- jaw 让出区（jaw<0 两侧露出）用 bgFillBands 填背景色（复刻旧 bandWarp 行为，避免露出原图
  宽脸）；眼距用高斯衰减到 0，无让出区、无接缝。
- 降采样预览（1/4 分辨率，852 三角约 5-10ms）+ 全量保存，兼顾实时性与清晰度。
- 零新运行时依赖（复用 tasks-vision 的 478 点 + 内置拓扑常量 + canvas 2D）。

待用户手动验收：CDP 实测下颌宽/眼距无裂缝、纵向+横向叠加无错位、实时预览 <16ms、
editFace AI 生成链路回归。

### 修复（T7，2026-07-25 晚）：下颌让出区误覆盖脖子衣领

用户实测：下颌调整后下颌左右两侧 + 脖子衣领全变背景色。根因：computeJawFillBand 返回
全宽矩形（jawTopY~chinY 整宽），renderWarpedMesh 用 fillRect 全宽填背景色，但 mesh 只
覆盖脸区（468 点内），下颌带里的脸外区域（脖子、衣领、脸侧）被背景色覆盖且未恢复。

修复：移除全宽 bgFillBand 逻辑，改为 evenodd 规则填"原脸三角并集 − 仅 jaw 变形脸三角
并集"差区背景色。letoutDisplacements 仅含 jaw 位移（隔离眼距/纵向），差区只在下颌内缩
区出现；脸外（脖子衣领）不在原脸三角并集内，保留原图。jaw<0 才填让出区，jaw>0 脸变宽
无让出区。删除 computeJawFillBand。测试 45/45 绿、lint 0 error。

待用户重新实测：下颌调整脖子衣领保留、让出区背景色正确。

后续优化（同晚）：让出区纯背景色与旁边脖子衣领断层成"空隙"。改为 evenodd clip 差区 +
以面中心 cx 为锚 x 缩小原图（scaleX=1+jaw<1）drawImage，脸外像素（脖子/衣领/背景）向内
移覆盖让出区，与周围连续，不再是纯色块。LetoutFill 配置（letoutDisplacements + scaleX
+ cx）由 warpFaceBands 计算，renderWarpedMesh 步骤2 消费。测试 45/45 绿、lint 0 error。

待用户重新实测：下颌缩窄让出区用旁边像素填充、无纯色空隙。

后续优化（同晚，统一修复两处让出区）：
- 问题1 jaw 空隙残留：evenodd 三角形并集做差区时共享边被抵消成 1px 缝隙。改用 mask canvas
  （destination-in 原脸三角并集 + destination-out 变形脸三角并集），source-over 画三角形共享边
  重叠无缝隙。
- 问题2 双下巴：纵向缩短（lowerface/faceLength<0）下巴上移，原下巴位置纹理保留成双下巴，此前
  只对 jaw<0 填让出区。扩展 letoutFill 支持 scaleY（1+faceLength+lowerface），以鼻底 y 为锚 y 缩放
  原图，下方脖子像素上移覆盖原下巴位置。jaw + 纵向统一进 2D 缩放（scaleX, scaleY）。
- letoutDisplacements 含 jaw + 纵向（隔离 eyeSpacing），差区只反映这两类变形。
测试 45/45 绿、lint 0 error。待用户重新实测：jaw 空隙消除、纵向缩短无双下巴。

---

## 第六阶段：MLS 变形 + 双 canvas 渲染（2026-07-25 晚，**未完成，方向需反思**）

用户反馈 3D mesh 形变"只是简单的把脸做了缩放，效果还不如做 3D 之前"。确实，
computeVertexDisplacements 用 `dy=y*scale`/`dx=(x-cx)*jaw*w` 做纯线性位移，
renderWarpedMesh 逐三角仿射只是把线性缩放切成三角形拼回去——没有真正的 3D 变形。

### 尝试的改进

1. **MLS (Moving Least Squares) 变形**：新建 `mlsWarp.ts`，用 14 个控制点
   （3 锚点 + 11 变形点）+ MLS Similarity 算法代替线性位移。20 例测试全绿。

2. **让出区填充变更**：尝试了多种方案——
   - 全局 scaleX 缩放（旧方案，全图压缩）
   - 左右分侧水平平移（有空白带）
   - 左右分侧从边缘缩放
   - 擦除原脸再画变脸（destination-out 后是透明，不是背景）
   - 双 canvas 叠加（底层原图 + 上层变脸透明底）

3. **最终状态**：双 canvas 叠加方案（`bandWarp.ts` 去掉所有 letout fill 和 bgColor；
   `meshRenderer.ts` 底层画原图、上层画变脸 mesh、叠加输出）。

全部 65 例测试通过。

### 未解决的问题

- 双 canvas 叠加需要刷新浏览器验证（Playwright 权限被拒绝）
- 用户反馈仍有双下巴、白色空隙——方案架构有问题，需要重新检讨
- 用户认为"完全没有思路"——MLS + 各种让出区填充的迭代方向可能不对

### 业界研究结论（待深入）

初步搜索发现：
- 业界主流：三角剖分 + 仿射 warping + **seamless cloning / Poisson blending**（Rhinoplasty AI、
  ComfyUI_FaceProcessor），而非手动填让出区
- ARAP 比 MLS 变形质量更好但需要流形 mesh 且可能折叠
- 关键缺失：缺少**融合/羽化**步骤——变脸与背景之间没有平滑过渡

### 建议的后续方向

1. **放弃自研让出区填充**，改用 OpenCV seamlessClone / poisson blending 将变脸融合回原图
2. **研究 ComfyUI_FaceProcessor** 的完整 pipeline（2025 年的开源实现，同样基于
   MediaPipe mesh 三角 warping，有 CPU/CUDA 双实现）
3. **简化变形算法**——MLS 过度设计了，14 个控制点的 Mapping 未经验证

### 文件变更清单（当前工作区）

| 文件 | 状态 |
|------|------|
| `src/renderer/src/components/portrait/geometry/mlsWarp.ts` | 新建（MLS 变形核心） |
| `src/renderer/src/components/portrait/geometry/bandWarp.ts` | 修改（接入 MLS，去 letout fill/bgColor） |
| `src/renderer/src/components/portrait/geometry/meshRenderer.ts` | 修改（双 canvas 叠加，去 LetoutFill/bgColor） |
| `tests/unit/geometry/mlsWarp.spec.ts` | 新建（20 例测试全绿） |

未改动：`vertexWarp.ts`（旧线性位移保留）、`faceMeshTopology.ts`、`landmarkIndices.ts`、
`FaceGeometryStudio.vue`
