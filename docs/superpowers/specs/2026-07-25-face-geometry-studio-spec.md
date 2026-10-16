# 面容几何工作室（Face Geometry Studio）· 产品与技术 Spec

> 状态：待评审
> 日期：2026-07-25
> 关联：新版人像设计 spec（`docs/superpowers/specs/2026-07-24-portrait-redesign-spec.md`）、
> Provider 能力模型（`docs/design/image-provider-capability-model-design.md`）

## 1. 背景与问题

新版人像设计的「修改面部」链路已验证三个真问题：

1. **模型听不懂精细几何指令**：「中庭短一点」在 Seedream 5.0-lite 上首次生成零变化（prompt 修复后也只有眉眼微调）——中文精细几何指令超出图像编辑模型的理解能力
2. **效果无法客观度量**：两张图 99.65% 像素一致，肉眼判断"中庭是否变短"受期待偏差影响——需要像素级、可复核的测量
3. **调整-生成无桥接**：用户想要的比例变化（中庭 -6%）无法精确翻译成 AI 能执行的输入

## 2. 目标

给人像工作台增加「面容几何工作室」能力，形成完整闭环：

```
面容关键点检测 → 面容指标分析（照片标注 + 数值）
  → 用户拖参数（中庭/下庭/下颌/眼距…）
  → 算法即时变形预览（毫秒级、零成本）
  → 满意后二选一：
      A. 直接用算法结果存为变体（零成本）
      B. 双通道 AI 生成（文字参数短语 + 变形预览图作参考）
  → 复用现有对比确认流（FaceCompareDialog）
```

**非目标**：
- 不做全身像的面容分析（脸占比 <15% 时关键点精度不足，本期仅半身像）
- 不做网格变形以外的复杂形变（表情、年龄、五官替换）
- 不做 3D 人脸重建

## 3. 核心设计决策

| # | 决策 | 内容 |
|---|------|------|
| D1 | 检测方案 | **@mediapipe/tasks-vision 的 FaceLandmarker（WASM，渲染进程运行）**：478 关键点，无原生依赖。**WASM 运行时与 face_landmarker.task 模型文件打进 resources，经本地资源协议加载——不走 CDN（离线不可用）、不走 file:// fetch（生产受限）** |
| D2 | 适用域 | **仅半身像**（面部占比 ≥15%）；不满足时禁用入口并提示 |
| D3 | 指标标准 | 三庭五眼 + 脸型比例，全部**像素值 + 百分比**双显示；**上庭无发际线关键点（FaceMesh 不含），用「额头轮廓顶点(landmark 10) + 外推系数」估算并标"估计值"** |
| D4 | 变形算法 | **一期：纵向分段缩放**（中庭/下庭/脸长等比例参数覆盖）；二期：Delaunay 三角网格变形（精细几何） |
| D5 | 参数→AI 翻译 | **双通道**：① 文字——参数映射为解剖学视觉短语 + 幅度映射程度词（+可选数值目标）；② 图像——变形预览图作为第二参考图（`make the face look like the second reference image`） |
| D6 | 结果保留 | 算法结果可直接存为 `type='face'` 变体（零成本）；AI 生成走现有 editFace + FaceCompareDialog 确认流 |
| D7 | 技术约束 | 全部在渲染进程完成（检测/指标/变形），AI 生成走现有 service；模型文件 ≤20MB 打进 resources |

## 4. 功能设计

### F1 面容关键点检测

- **输入**：当前半身 variant 的图片（canvas 加载）
- **处理**：FaceLandmarker（@mediapipe/tasks-vision）检测 → 478 点（归一化坐标 → 像素坐标）
- **加载**：`FilesetResolver.forVisionTasks(本地 wasm 目录)` + `FaceLandmarker.createFromOptions({ baseOptions: { modelAssetPath: 本地模型路径 } })`；本地资源经应用的自定义协议/assets 目录提供（开发期走 vite public，生产期打进 resources 并经资源协议访问）
- **降级**：检测不到人脸 → 提示"未检测到清晰人脸，请使用正面半身像"；多点置信度低 → 提示重试
- **模型文件**：face_landmarker.task（~10MB）+ WASM 运行时（~3MB），打进 resources
- **缓存**：同一 variant 只检测一次，结果挂内存 Map（variantId → landmarks）

### F2 面容指标分析 + 照片标注

**指标定义**（像素 + 占比双显示）：

| 指标 | 定义（关键点） | 展示 |
|------|----------------|------|
| 上庭（估计） | 发际线估值(landmark 10 额头轮廓顶点 × 外推系数) → 眉心 | px + 占面高 % + "估计"标 |
| 中庭 | 眉心 → 鼻底 | px + % |
| 下庭 | 鼻底 → 颏底 | px + % |
| 三庭比 | 上:中:下 | 如 31:33:36 |
| 眼裂宽 | 左右眼内外眼角距 | px |
| 眼距 | 两内眼角距 ÷ 眼裂宽 | 比值（五眼标准 ≈1） |
| 鼻翼宽 | 鼻翼两点距 ÷ 眼裂宽 | 比值 |
| 面长宽比 | 面高 ÷ 颧宽 | 比值 |
| 下颌角宽比 | 下颌角宽 ÷ 颧宽 | 比值 |

**标注层**（canvas overlay，可开关）：
- 468+ 关键点（小点，低透明度）
- 三庭分割线（眉心线/鼻底线/颏底线 + 左侧数值标注）
- 面框（颧宽线、面高中线）

**指标面板**：照片右侧/下方，表格形式；AI 生成后**自动复测**，显示前后对比（如 中庭 88px/33% → 82px/31%，变色标注变化量）——**这就是客观验收**。

### F3 算法变形预览（一期：纵向分段变形）

**算法（review 修正，避免下脸拉伸失真）**：

> 错误做法：压缩中带 + 下部分纵向拉伸补齐 → 嘴/下巴被拉长变形。
> 正确做法：**压缩中带 + 下部分整体上移 + 底部用背景色补齐**（人像为纯色背景，
> 取照片四角背景色均值填充；若画面非纯色背景则退化为"裁剪底部"并提示）。

**参数面板**（滑块组，仅列真实可调项）：

| 参数 | 范围 | 算法 |
|------|------|------|
| 中庭长度 | -15% ~ +15% | 眉心-鼻底带压缩/拉伸 + 下部分平移 + 底部背景色补齐 |
| 下庭长度 | -15% ~ +15% | 鼻底-颏底带缩放 + 底部补齐 |
| 脸长 | -10% ~ +10% | 眉心以下整体缩放 + 底部补齐 |
| 下颌宽 | -10% ~ +10% | 下颌区域横向缩放 |
| 眼距 | -8% ~ +8% | 双眼区域横向位移 |

**实现**：canvas 逐带 drawImage 合成，`input` 事件连续刷新（单次 <16ms，验收帧率 ≥30fps）。预览图与原图同尺寸。

**二期（网格变形）**：Delaunay 三角剖分 + 逐三角仿射，拖动鼻尖/下颌角等目标点。本期不做，预留接口 `warpFace(image, landmarks, deltas)`。

### F4 参数 → AI 输入翻译（双通道）

**通道① 文字 prompt**（复用 editFace 编辑指令框架）：

```
edit this portrait photo, apply the following facial changes
while keeping the exact same person and identity:
{degree} {anatomicalPhrase(参数1)},
{degree} {anatomicalPhrase(参数2)},
modify only the face, keep hair, clothing, body, pose and background exactly the same
```

**参数→短语映射表**（写在共享常量，不写死组件里）：

```ts
const PARAM_PROMPT_MAP = {
  midface:   { negative: 'shorter mid-face, more compact proportions between eyebrows and nose',
               positive: 'longer mid-face, more elongated proportions between eyebrows and nose' },
  lowerface: { negative: 'shorter lower face, slightly higher chin position',
               positive: 'longer lower face, slightly lower chin position' },
  jaw:       { negative: 'narrower, slimmer jawline', positive: 'wider, stronger jawline' },
  eyeSpacing:{ negative: 'closer-set eyes', positive: 'wider-set eyes' },
  faceLength:{ negative: 'shorter face, more compact overall proportions',
               positive: 'longer face, more elongated overall proportions' },
}

function degreeOf(pct: number): string {
  const a = Math.abs(pct)
  if (a < 3) return 'very subtly'
  if (a <= 8) return 'slightly'
  return 'significantly'
}
// 可选数值提示（强模型可理解）：`make the mid-face occupy about 31% of face height`
```

**通道② 变形预览图作参考**：

```ts
// editFace 调用时：
referenceImages: [原图, 变形预览图]  // 置首为原图（身份锚点），第二张为目标几何
prompt: `${文字prompt}, make the face look like the second reference image`
```

**约束**：分段缩放预览质量足够时可启用通道②；若预览有明显拉伸痕迹，仅走通道①并在 UI 说明。

### F5 工作台集成

**入口**：EditPanel（半身 tab · 修改面部面板）新增「📐 面容分析」按钮，打开**面容几何工作室面板**（独立大对话框或全屏覆盖层）。

**工作室布局**：

```
┌────────────────────────────────────────────┐
│ [照片 + 标注层]        │ 指标面板           │
│  (关键点/三庭线/开关)  │  上庭 88px 33%    │
│                        │  中庭 82px 31% ↓   │
│                        │  下庭 96px 36%    │
│                        │ ──────────────    │
│                        │ 参数滑块组         │
│                        │  中庭 [-6%]       │
│                        │  下颌 [+2%]       │
└────────────────────────────────────────────┘
  [↺ 重置]  [用算法结果保存]  [✨ AI 生成（双通道）]
```

**流程**：
1. 打开工作室 → 自动检测 + 标注 + 指标
2. 拖参数 → 实时变形预览（照片区显示变形结果，标注线跟随更新）
3. 满意 → A「用算法结果保存」（零成本，存为 face 变体）或 B「AI 生成」（调 editFace 双通道）→ 复用 FaceCompareDialog 确认
4. AI 生成后自动对新图复测指标 → 指标面板显示前后对比

## 5. 数据与状态设计

- **不新增 DB 表**：landmarks 不持久化（内存缓存，variant 级别）；算法结果/AI 结果都走现有 portrait_variants（`type='face'`，variantInfo.faceDescription 记录参数 JSON）
- **参数记录**：AI 生成时 variantInfo 增加 `faceParams: { midface: -6, jaw: 2 }`（可复核、可复现）
- **算法结果保存**：canvas.toBlob → 保存图片文件（走现有 saveImagesWithoutHistory 路径）→ 建 face 变体

## 6. 技术栈与文件规划

| 层 | 内容 |
|----|------|
| 依赖 | `@mediapipe/face_mesh`（WASM），模型文件 `resources/facemesh/` |
| 渲染进程 | `components/portrait/geometry/`：`FaceGeometryStudio.vue`（工作室容器）、`useFaceLandmarks.ts`（检测+缓存）、`faceMetrics.ts`（指标计算）、`bandWarp.ts`（分段缩放）、`paramPrompt.ts`（翻译映射）、`FaceAnnotator.vue`（标注层）、`MetricsPanel.vue`、`ParamSliders.vue` |
| service | editFace 复用（referenceImages 已支持多张）；算法结果保存新增 service 方法 `saveAlgorithmicFaceVariant(characterId, sourceVariantId, imageBlob, params)` |
| 共享类型 | `FaceMetrics`、`FaceParams`、`PARAM_PROMPT_MAP`（shared/types） |

## 7. 风险与降级

| 风险 | 处置 |
|------|------|
| **上庭无发际线关键点**（FaceMesh 不含发际线） | 上庭 = 额头轮廓顶点(landmark 10)到眉心 × 外推系数（正面约 1.5-1.7，取标定中值）并标注"估计值"；刘海遮挡时提示可能偏差更大 |
| 检测失败/多点低置信 | 禁用工作室并明确提示，不影响现有 editFace 流程 |
| 变形拉伸痕迹明显（参数过大） | 参数超 ±10% 时预览区标黄提示"变形幅度较大，AI 生成效果更佳"；分段变形算法本身已避免下脸拉伸失真（压缩+平移+背景补齐） |
| WASM/模型离线加载失败 | 开发期 vite public 直出；生产期打 resources 并经资源协议提供；加载失败降级提示，其余功能不受影响 |
| 老 GPU 不支持 WASM SIMD | 降级提示，工作室不可用 |

## 8. 验收标准

1. 对半身正面像：关键点检出成功，三庭五眼数值与照片标注正确叠加（上庭标"估计值"）
2. 拖中庭 -6%：预览图眉-鼻底带可见压缩、**嘴/下巴无拉伸变形**、底部背景色补齐自然，指标面板同步显示 82px/31%；滑块拖动帧率 ≥30fps（单次合成 <16ms）
3. 「用算法结果保存」：生成 face 变体且可下载，原图不变
4. 「AI 生成」：editFace 请求含 文字参数短语 + 双参考图（日志可证）；生成后自动复测指标并显示前后对比
5. 客观闭环：AI 结果的中庭实测值与目标值（82px）偏差 ≤5% 记为成功（多次取最好）
6. 降级路径全部可用（检测失败/参数过大/WASM 失败均不白屏不报错崩）

## 9. 分期与工作量

| 期 | 内容 | 工时 |
|----|------|------|
| P1 | MediaPipe 集成 + 检测 + 指标计算（F1/F2 计算层） | 1.5 天 |
| P2 | 标注层 + 指标面板（F2 展示层） | 1 天 |
| P3 | 分段缩放变形预览 + 参数滑块（F3） | 1.5 天 |
| P4 | 参数翻译 + 双通道生成 + 工作台集成 + 复测闭环（F4/F5） | 1 天 |
| 合计 | | **≈5 天** |

P1+P2 先行交付即可解决"效果客观度量"问题；P3+P4 交付完整闭环。
