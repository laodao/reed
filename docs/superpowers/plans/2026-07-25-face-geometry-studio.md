# 面容几何工作室 Implementation Plan

> Spec：`docs/superpowers/specs/2026-07-25-face-geometry-studio-spec.md`（含可行性 review 修正）
> 原则：纯函数层 TDD（faceMetrics / bandWarp / paramPrompt 可单测）；渲染层以 lint + 手测验收

**Goal:** 检测→指标→变形预览→双通道 AI 生成的完整闭环，一期交付分段变形版本。

**Tech Stack:** @mediapipe/tasks-vision（WASM）/ Vue3 / Canvas / Vitest

---

## P1 检测与指标计算（1.5d）

### Task 1: 依赖与模型文件就位

**Files:**
- `package.json`（+ @mediapipe/tasks-vision）
- `public/models/facemesh/`（WASM 运行时 + face_landmarker.task）

- [ ] **Step 1:** `npm i @mediapipe/tasks-vision`
- [ ] **Step 2:** 从 node_modules/@mediapipe/tasks-vision 拷贝 `wasm/` 到 `public/models/facemesh/wasm/`；下载 `face_landmarker.task`（官方 storage.googleapis.com/mediapipe-models）到 `public/models/facemesh/`（**下载 URL 与文件大小记入 commit message**，生产打包时随 resources 分发）
- [ ] **Step 3:** 浏览器访问 `/models/facemesh/face_landmarker.task` 可达（dev server 验证）
- [ ] **Step 4:** Commit `chore(geometry): tasks-vision 依赖与本地模型文件`

### Task 2: faceMetrics 纯函数模块（TDD）

**Files:**
- Create `src/renderer/src/components/portrait/geometry/faceMetrics.ts`
- Create `src/renderer/src/components/portrait/geometry/landmarkIndices.ts`（FaceMesh 关键点索引常量：眉心 9、鼻底 2、颏底 152、额头轮廓顶点 10、左右内外眼角等）
- Test `tests/unit/geometry/faceMetrics.spec.ts`

- [ ] **Step 1: 写失败测试**（合成 478 点数组，断言三庭 px/比例、眼裂宽、眼距比、鼻翼宽比、面长宽比、下颌角宽比；上庭=landmark10→眉心×外推系数且标 estimated=true）

```ts
// 合成：面高 300px（眉心 y=100, 鼻底 y=200, 颏底 y=400, 额顶 y=20）
// 期望：中庭 100px/33.3%，下庭 200px/66.7%（面高按眉心→颏底+上庭估计 或全高口径，以实现注释为准）
```

- [ ] **Step 2:** 运行确认失败
- [ ] **Step 3: 实现** `computeFaceMetrics(landmarks: Point[], imageWidth, imageHeight): FaceMetrics`（纯函数，含三庭/五眼/脸型各指标与 estimated 标记）
- [ ] **Step 4:** 运行通过
- [ ] **Step 5:** Commit `feat(geometry): 面容指标计算 faceMetrics + 单测`

### Task 3: useFaceLandmarks 检测器封装

**Files:**
- Create `src/renderer/src/components/portrait/geometry/useFaceLandmarks.ts`

- [ ] **Step 1:** 单例懒加载 FaceLandmarker（`FilesetResolver.forVisionTasks('/models/facemesh/wasm')` + `modelAssetPath: '/models/facemesh/face_landmarker.task'`）
- [ ] **Step 2:** `detect(imageUrl): Promise<Landmark[] | null>`（img 元素加载 → detect → 像素坐标换算；variantId 级缓存 Map；失败返回 null 不抛异常）
- [ ] **Step 3:** 人脸占比校验（面框高 < 图像高 15% → null + 原因文案）
- [ ] **Step 4:** 手测：用 dataPath 里的真实半身像检测成功（进度文件记录结果）
- [ ] **Step 5:** Commit `feat(geometry): FaceLandmarker 检测器封装与缓存`

---

## P2 标注与指标面板（1d）

### Task 4: FaceAnnotator 标注层

**Files:** Create `src/renderer/src/components/portrait/geometry/FaceAnnotator.vue`

- [ ] props `{ imageSrc, landmarks, metrics, showPoints }`；canvas 叠加：关键点（可开关）、三庭分割线（眉心/鼻底/颏底 + 左侧数值）、面框中线；上庭线虚线 + "估计"
- [ ] Commit `feat(geometry): 面容标注层`

### Task 5: MetricsPanel + 工作室容器 + 入口

**Files:**
- Create `src/renderer/src/components/portrait/geometry/MetricsPanel.vue`
- Create `src/renderer/src/components/portrait/geometry/FaceGeometryStudio.vue`
- Modify `src/renderer/src/components/portrait/workbench/EditPanel.vue`（修改面部面板加「📐 面容分析」按钮）

- [ ] MetricsPanel：指标表格（名称/像素/占比；上庭标"估计"）
- [ ] FaceGeometryStudio：大对话框（照片+标注 | 指标+参数区），打开自动 detect + compute
- [ ] EditPanel 按钮 → 打开工作室（仅 framing=half 时可用，全身禁用并提示）
- [ ] lint 0 error；Commit `feat(geometry): 指标面板与工作室入口`

---

## P3 分段变形预览（1.5d）

### Task 6: bandWarp 纯函数（TDD）

**Files:**
- Create `src/renderer/src/components/portrait/geometry/bandWarp.ts`
- Test `tests/unit/geometry/bandWarp.spec.ts`

- [ ] **Step 1: 失败测试**：`computeBands(landmarks, params) → 三条带 {srcY, srcH, dstY, dstH}` 的几何正确性（中庭 -10% 时中带压缩 10%、下部分上移、底部留补色区）；`estimateBackgroundColor` 取四角均值
- [ ] **Step 2: 实现** `warpFaceBands(sourceCanvas, landmarks, params, bgColor): HTMLCanvasElement`（压缩+平移+底部 bgColor 填充；横向参数：下颌/眼距局部位移缩放）
- [ ] **Step 3:** 通过 + Commit `feat(geometry): 分段变形算法 bandWarp + 单测`

### Task 7: 参数滑块与实时预览

**Files:**
- Create `src/renderer/src/components/portrait/geometry/ParamSliders.vue`
- Modify `FaceGeometryStudio.vue`（参数区 + 预览切换 原图/变形）

- [ ] 滑块组（中庭/下庭/脸长/下颌/眼距，范围按 spec F3 表）；`input` 事件 → warpFaceBands 重绘（单次 <16ms）
- [ ] 变形后关键点按同参数变换 → 标注线与指标同步刷新
- [ ] 参数超 ±10% 标黄提示
- [ ] Commit `feat(geometry): 参数滑块实时变形预览`

---

## P4 翻译与集成（1d）

### Task 8: paramPrompt 翻译（TDD）

**Files:**
- Create `src/renderer/src/components/portrait/geometry/paramPrompt.ts`（PARAM_PROMPT_MAP 放 shared/types/portrait.types.ts）
- Test `tests/unit/geometry/paramPrompt.spec.ts`

- [ ] degreeOf 分档（<3 very subtly / 3-8 slightly / >8 significantly）；多参数组装进 editFace 指令框架；数值目标提示 `make the mid-face occupy about 31% of face height`
- [ ] 通过 + Commit

### Task 9: 双通道生成 + 算法保存 + 复测闭环

**Files:**
- Modify `src/core/services/portrait.service.ts`（新增 `saveFaceVariantFromDataUrl(characterId, sourceVariantId, dataUrl, faceParams)`：存图+建 face 变体）
- IPC/preload 新增 `portrait:save-face-variant`
- Modify `FaceGeometryStudio.vue`（三个操作按钮）
- Modify `paramPrompt` 组装时把变形预览 dataUrl 作为第二参考图

- [ ] **Step 1:** service 保存方法 + IPC（additive）
- [ ] **Step 2:** 「用算法结果保存」→ 存 face 变体 + ElMessage + emit success
- [ ] **Step 3:** 「AI 生成」→ editFace({ facePrompt: 文字prompt, referenceImages: [变形预览dataUrl] })（service 已将原图置首）；生成后 FaceCompareDialog 确认
- [ ] **Step 4:** 确认保留后自动 detect 新图 → MetricsPanel 显示前后对比（变化量变色）
- [ ] **Step 5:** 全流程手测 + lint 0 error + 测试全绿
- [ ] Commit `feat(geometry): 双通道 AI 生成与复测闭环`

---

## 验收（对齐 spec §8）

- [ ] 指标正确叠加（上庭标估计）/ 变形无下脸拉伸 / ≥30fps / 算法保存可下载 / AI 请求双通道日志可证 / 复测前后对比显示 / 降级路径不崩
