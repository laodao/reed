# 图像生成 Provider 能力模型与参数治理设计方案

> 状态：待评审
> 日期：2026-07-24
> 前置研究：`docs/design/image-provider-api-params-research.md`
> 关联：新版人像设计 spec §5（死参数治理）

## 1. 问题定义

研究证实：万相 / Seedream / 可灵三家官方 API 的参数集**差异巨大且互不兼容**：

- 可灵：仅 `n / aspect_ratio / resolution / watermark`（无 size、无负面词、无 seed）
- Seedream 4.5：无 seed / 无 guidance_scale，watermark 默认 true（当前默认带水印！）
- 万相：无 strength，prompt_extend 默认 true（会改写我们的一致性 prompt）

而当前架构是**扁平请求 + 全参数盲透传**：`ImageGenerationRequest` 一套字段打天下，导致：

1. **死参数**：strength（UI 提供，三家都不支持）、seed（仅万相生效）、negative_prompt（可灵不支持）
2. **错参数**：可灵 adapter 发送官方不支持的 4 个参数，且 size 语义错误（官方用 aspect_ratio+resolution，尺寸控制实际失效）
3. **隐患参数**：火山默认带水印、万相 prompt_extend 改写一致性 prompt

## 2. 设计目标

1. **adapter 语义正确**：发给各家的请求只含官方支持的参数，且语义映射正确
2. **UI 真实**：参数区按当前选中模型的真实能力渲染，不存在"看似可调实则无效"的控件
3. **人像链路一致性可保障**：参考图 + prompt 一致性约束不被意外改写
4. **后端只新增**：现有调用方行为不受破坏（缺省 = 现状）

## 3. 总体架构

```
                        ┌─────────────────────────────────────┐
                        │  模型级能力声明（Capabilities）        │
                        │  shared/types + adapter 各模型查表     │
                        └──────────────┬──────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
  UI 参数区                     Core Service                   Provider Adapter
  按能力渲染/隐藏            调用前查能力，调整           只发官方支持的参数，
  （无死控件）               prompt 拼装与请求字段        语义映射在 adapter 内完成
```

**关键决策：能力是模型级，不是 provider 级**（Seedream-3.0-t2i 支持 seed，4.5 不支持；同为火山模型）。

## 4. 能力模型定义

### 4.1 类型（`src/shared/types/image-provider.types.ts` 新增）

```ts
/** 尺寸控制模式 */
export type ImageSizeMode =
  | 'pixels'                  // 直接 宽*高（万相、Seedream）
  | 'aspect_ratio_resolution' // 宽高比 + 分辨率档位（可灵）
  | 'tiered'                  // 仅档位 1K/2K/4K（wan2.6 部分模式）

/** 模型级图像生成能力声明 */
export interface ImageModelCapabilities {
  negativePrompt: boolean
  seed: boolean
  quality: boolean
  style: boolean
  guidanceScale: boolean
  strength: boolean               // 目前三家全 false
  sizeMode: ImageSizeMode
  maxReferenceImages: number      // 0 = 不支持参考图
  watermark: 'not_supported' | 'optional' | 'default_on'  // default_on = 官方默认带水印，需显式关
  promptRewrite: 'none' | 'optional_default_on' | 'optional'  // 提示词优化（万相 prompt_extend / 火山 optimize_prompt）
  sequentialGeneration: boolean   // 组图（人像不需要，预留）
}
```

### 4.2 能力注册表（`src/core/image-providers/model-capabilities.ts` 新增）

按模型 id 前缀查表（命中不了用 provider 默认值）：

```ts
const MODEL_CAPABILITIES: { match: RegExp; caps: ImageModelCapabilities }[] = [
  // 万相 wan2.x（DashScope）
  { match: /^wan2\.[56]-image|^wanx/, caps: {
    negativePrompt: true, seed: true, quality: true, style: true,
    guidanceScale: false, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 4,
    watermark: 'optional', promptRewrite: 'optional_default_on', sequentialGeneration: false,
  }},
  // qwen-image（multimodal）
  { match: /^qwen-image/, caps: { /* seed:true, negativePrompt:true, ref:多, sizeMode:pixels, promptRewrite:'optional' */ ... }},
  // Seedream 4.5 / 5.0 lite（火山）
  { match: /^doubao-seedream-[45]/, caps: {
    negativePrompt: false, seed: false, quality: false, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'pixels', maxReferenceImages: 14,
    watermark: 'default_on', promptRewrite: 'optional', sequentialGeneration: true,
  }},
  // Seedream 3.0 t2i（火山老模型，支持 seed/guidance）
  { match: /^doubao-seedream-3-0/, caps: { seed: true, guidanceScale: true, ... }},
  // 可灵 v3（百炼托管）
  { match: /^kling\/kling-v3-image/, caps: {
    negativePrompt: false, seed: false, quality: false, style: false,
    guidanceScale: false, strength: false,
    sizeMode: 'aspect_ratio_resolution', maxReferenceImages: 1,
    watermark: 'optional', promptRewrite: 'none', sequentialGeneration: false,
  }},
  // 可灵 v3 omni
  { match: /^kling\/kling-v3-omni-image/, caps: { ...maxReferenceImages: 10, sequentialGeneration: true }},
]

export function getModelCapabilities(providerType: string, modelId: string): ImageModelCapabilities
```

### 4.3 能力透出到前端

`image.getProviders` 的模型 `features` 里加 `capabilities`（`ImageModelFeatures` 扩展一个可选字段），adapter 的 `getModels()` 返回时查注册表注入。前端零新增 IPC。

## 5. 各 adapter 修正

### 5.1 可灵（bailian-image.provider.ts）—— 重写 buildRequestBody 参数集

```ts
// 只发官方支持参数
body.parameters.n = request.count || 1
// size 宽x高 → aspect_ratio + resolution 映射
const { aspectRatio, resolution } = mapPixelsToKlingSize(request.width, request.height)
body.parameters.aspect_ratio = aspectRatio   // 竖版(3:4/9:16)→'9:16'；方→'1:1'；横→'16:9'
body.parameters.resolution = resolution      // 短边≥1500 → '2k'，否则 '1k'
body.parameters.watermark = false
// 负面词：官方不支持 → 并入正向 prompt（官方建议写法）
if (request.negativePrompt) {
  body.input.prompt = `${request.prompt}. Avoid: ${request.negativePrompt}`
}
// 不再发送 seed / style / quality / size
```

### 5.2 火山（volcengine-image.provider.ts）

```ts
body.watermark = false        // 修复"默认带水印"（产品默认关，后续可在设置中暴露开关）
// negative_prompt / style：官方参数表未列 → 停止发送（避免上游 400）
// seed/guidanceScale：仅 seedream-3.0-t2i 模型时发送（按 capabilities 判断）
```

### 5.3 万相（dashscope-image.provider.ts）

```ts
// 编辑/参考图场景显式关闭提示词改写，保护一致性 prompt：
body.parameters.prompt_extend = request.promptExtend ?? false   // 新增可选字段，人像场景传 false
// wan2.6-image 端点路由实测后确认（multimodal vs image-synthesis），失败则并入 multimodal 路由
```

`ImageGenerationRequest` 新增可选字段（只新增）：`promptExtend?: boolean`。

## 6. Service 层（人像链路）感知

`portrait.service.ts` 各生成入口在调用 `ImageService.generateImage` 前查能力：

```ts
const caps = getModelCapabilities(providerType, modelId)
// 可灵/火山不支持负面词 → 已在 adapter 层并入/丢弃，service 透传即可（单一职责：语义翻译归 adapter）
// 不支持 seed → 不传（adapter 同样兜底，双保险）
// 人像一致性场景（editFace / generateFullBody / 带参考图的 generate）
promptExtend: false
```

**职责边界**：能力查询与"传不传"在 service；"不支持时怎么翻译"（并入 prompt / 丢弃）在 adapter。UI 展示归 capabilities 透出。

## 7. UI 层修正

### 7.1 参数区按能力渲染（新版人像工作台）

| 控件 | 能力驱动行为 |
|------|--------------|
| 反向提示词 | `caps.negativePrompt=false` → 隐藏，并在提示词区标注"当前模型不支持负面提示词" |
| 随机种子 | `caps.seed=false` → 隐藏 |
| 质量 | `caps.quality=false` → 隐藏 |
| **重绘强度** | 三家 `strength=false` → **从 GenerateFullBodyDialog / EditPanel 移除**；面容一致说明文案改为"由参考图 + 一致性提示词保障" |
| 参考图 | `maxReferenceImages` 驱动上传上限；=0 时隐藏 |
| 尺寸 | `sizeMode='aspect_ratio_resolution'` → SizeSelect 该模型下只显示 16:9/9:16/1:1 可选项并标注"按宽高比生成" |
| focusRegion | 保留（prompt 引导语义，非 provider 参数，现在实现正确） |

### 7.2 模型能力提示

生成全身对话框加一行说明（D2 决策）："面容一致性由参考图驱动，建议使用支持参考图编辑的模型（万相 / Seedream）"。

## 8. 兼容与回退

- 能力注册表查询失败 → 返回"全支持"默认能力（= 现状行为），老模型不受影响
- `ImageGenerationRequest` 只新增 `promptExtend`，其余字段不动；adapter 对不支持字段的"静默丢弃"改为"丢弃 + 日志"（可观测，不报错）
- 现有测试全绿约束不变；新增能力注册表单测 + 可灵 adapter 参数集单测

## 9. 任务分解与工作量

| # | 任务 | 内容 | 工作量 |
|---|------|------|--------|
| 1 | 能力模型 | 类型 + 注册表 + `getModelCapabilities` + 单测 | 0.5 天 |
| 2 | 可灵 adapter 修正 | 参数集重写 + size 映射 + 负面词并入 + 单测 | 0.5 天 |
| 3 | 火山/万相 adapter 修正 | watermark:false / 停传未列参数 / promptExtend 字段 | 0.5 天 |
| 4 | service 感知 | 人像链路传 promptExtend:false + 双保险 | 0.5 天 |
| 5 | UI 能力渲染 | features.capabilities 透出 + 参数区按能力显隐 + 撤强度控件 + 可灵尺寸模式 | 1 天 |
| 6 | 回归 | 三家模型各跑一次真实生成（人工验收） | 0.5 天 |

**合计 ≈ 3 天。** 任务 1-4 为后端（TDD），任务 5 前端，任务 6 人工。

## 10. 验收标准

1. 可灵模型生成：请求体只含 n/aspect_ratio/resolution/watermark（日志可证），竖版人像出 9:16/2k
2. Seedream 4.5 生成：图无"AI生成"水印
3. 万相编辑模式：request_id 级别日志显示 prompt_extend=false，prompt 未被改写
4. UI：选可灵模型时负面词/种子/质量/强度控件不可见；选万相时可见且生效
5. 人像 40 例单测保持全绿 + 新增能力/可灵测试全绿
