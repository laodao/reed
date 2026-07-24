# 图像生成 Provider API 参数研究报告

> 日期：2026-07-24
> 目的：对齐阿里百炼（万相/可灵）、火山方舟（Seedream）官方 API 参数与当前 adapter / UI 实参，找出差距
> 关联：新版人像设计 spec（`docs/superpowers/specs/2026-07-24-portrait-redesign-spec.md`）

## 一、官方 API 参数（文档研究结果）

### 1. 阿里百炼 · 万相 wan2.6-image（DashScope）

端点：`POST /api/v1/services/aigc/multimodal-generation/generation`（messages 多模态格式）

| 参数 | 位置 | 类型/取值 | 说明 |
|------|------|-----------|------|
| text | input.messages[].content | string | 正向提示词 |
| image | input.messages[].content | string（可多个） | 参考图（图生图/编辑） |
| negative_prompt | parameters | string ≤500字 | 反向提示词 |
| seed | parameters | int [0, 2147483647] | 相同 seed 输出相近（仍有细微差异） |
| prompt_extend | parameters | bool，默认 true | LLM 智能改写提示词（编辑模式有效，+3~4s） |
| size | parameters | `"1K"`/`"2K"` 或 `宽*高` | 像素范围 [768×768, 2048×2048]，比例 [1:4, 4:1] |
| n | parameters | int 1-4，默认 4 | 编辑模式张数（混排模式固定 1） |
| enable_interleave | parameters | bool | 图文混排模式开关 |
| max_images | parameters | int 1-5 | 混排模式张数 |
| watermark | parameters | bool | 水印 |

**无 strength / 无参考图相似度参数。**

旧版 wan2.5-image-edit（image-synthesis 异步端点）：`input.prompt/negative_prompt/ref_images(1-4)/image_url`，`parameters.size/n/seed/style/quality`。

### 2. 火山方舟 · Seedream 4.5（doubao-seedream-4-5-251128）

端点：`POST https://ark.cn-beijing.volces.com/api/v3/images/generations`

| 参数 | 类型/取值 | 说明 |
|------|-----------|------|
| model | string | doubao-seedream-4-5-251128 |
| prompt | string | 正向提示词 |
| **image** | string \| string[]，**最多 14 张** | 参考图（URL/Base64）。★ 字段名是 `image`，**不是** `reference_images` |
| size | `"2K"`/`"4K"` 或 `宽x高` | 总像素 [2560x1440, 4096x4096]，比例 [1/16, 16] |
| sequential_image_generation | `auto`/`disabled` | 组图开关 |
| sequential_image_generation_options.max_images | int [1,15] | 组图张数（参考图+生成图 ≤15） |
| stream | bool | SSE 流式 |
| response_format | `url`/`b64_json` | url 24h 有效 |
| watermark | bool，默认 true | "AI生成"水印 |
| optimize_prompt_options.mode | `standard` | 提示词优化 |
| ~~seed~~ / ~~guidance_scale~~ | **4.5 不支持** | 仅 seedream-3.0-t2i 支持 |

### 3. 阿里百炼托管 · 可灵 kling-v3-image-generation（仅华北2北京）

端点：`POST /api/v1/services/aigc/image-generation/generation`（异步，需 `X-DashScope-Async: enable`）

| 参数 | 类型/取值 | 说明 |
|------|-----------|------|
| text | input.messages | string ≤2500字，仅一个 |
| image | input.messages | 参考图 URL（300-8000px，≤10MB）；v3 单图 / omni 多图 |
| n | int 1-9，默认 1 | 张数 |
| **aspect_ratio** | `16:9`(默认)/`9:16`/`1:1` | ★ **没有 size 参数**，尺寸 = 宽高比 × 分辨率 |
| **resolution** | `1k`(默认)/`2k`（omni 另有 `4k`） | |
| watermark | bool，默认 false | |
| result_type | `single`(默认)/`series` | omni 组图开关 |
| series_amount | int 2-9，默认 4 | omni 组图张数 |

**不支持 negative_prompt / seed / cfg_scale / style / quality / strength。**
排除内容只能写进正向 prompt。

## 二、当前 adapter 实际传参（源码核对）

### dashscope-image.provider.ts

| 官方参数 | 是否传 | 说明 |
|----------|--------|------|
| prompt / text | ✅ | |
| negative_prompt | ✅ | |
| 参考图 | ✅ | ref_images 截前 4 张 + image_url 兼容（native）；multimodal 全量 content.image |
| size | ✅ | `宽*高` |
| n | ✅ | |
| seed | ✅ | |
| style / quality | ✅ | （wanx 系） |
| watermark | ⚠️ | 仅 multimodal 路径写死 false，未暴露 |
| prompt_extend | ❌ | 未传（默认 true 生效，编辑模式提示词会被 LLM 改写） |
| enable_interleave / max_images | ❌ | 未对接 |

⚠️ **路由疑点**：`wan2.6-image` 按 `getApiUrl` 规则落到 NATIVE_PATH（image-synthesis），但官方文档 wan2.6-image 是 multimodal 端点；wan2.5-image-edit 才是 image-synthesis+ref_images。**wan2.6 模型在 image-synthesis 端点是否可用需实测**（若报错，需把 wan2.6-image 加入 multimodal 路由）。

### volcengine-image.provider.ts

| 官方参数 | 是否传 | 说明 |
|----------|--------|------|
| prompt | ✅ | |
| image（参考图） | ✅ | 字段名正确（`image`，单值/数组） |
| size | ✅ | `宽x高` |
| n | ✅ | |
| negative_prompt | ⚠️ | 传了，但官方参数表未列（OpenAI 兼容端点可能忽略） |
| style | ⚠️ | 传了，官方未列 |
| response_format | ⚠️ | 写死 `url`，未暴露 b64_json |
| watermark | ❌ | 未传（官方默认 true，即默认带水印！） |
| sequential_image_generation | ❌ | 组图未对接（人像场景不需要） |
| seed | — | 4.5 不支持，不传是对的 |

### bailian-image.provider.ts（可灵 kling-v3）

| 官方参数 | 是否传 | 说明 |
|----------|--------|------|
| prompt | ✅ | |
| image / element_list | ✅ | 参考图（>1 张时 element_list ≤10） |
| n | ✅ | |
| **aspect_ratio / resolution** | ❌ | **未传（用默认值 16:9 / 1k）** |
| watermark | ❌ | 未传 |
| **negative_prompt** | ⚠️ **传了但官方不支持** | 上游忽略或报错 |
| **seed** | ⚠️ **传了但官方不支持** | |
| **style / quality** | ⚠️ **传了但官方不支持** | |
| **size（宽x高）** | ⚠️ **官方没有此参数** | 可灵用 aspect_ratio+resolution 控制尺寸 |

🔴 **严重不匹配**：bailian adapter 沿用万相参数集给可灵发请求，官方可灵图像 API 支持的 5 个控制参数（n/aspect_ratio/resolution/watermark/result_type/series_amount）里我们只用对了 n；而不支持的 4 个参数（negative_prompt/seed/style/quality）都在传。尺寸控制完全失效（永远 16:9/1k）。

## 三、UI（新版人像工作台）提供的参数 vs 三家支持度

| UI 参数 | 万相 | Seedream 4.5 | 可灵 v3 | 现状 |
|----------|------|--------------|---------|------|
| 提示词 | ✅ | ✅ | ✅ | 全通 |
| 反向提示词 | ✅ | ⚠️ 未列 | ❌ 不支持 | 可灵/火山场景为死参数 |
| 尺寸（宽×高） | ✅ | ✅ | ❌ 需转换 | 可灵需 map 到 aspect_ratio+resolution |
| 参考图（多张） | ✅ ≤4 | ✅ ≤14 | ✅ 单图/omni | 已对接 |
| 种子 | ✅ | ❌ 4.5 不支持 | ❌ 不支持 | 仅万相真实生效 |
| 质量 hd/standard | ✅(wanx) | ❌ | ❌ | 仅部分生效 |
| 重绘强度 strength | ❌ 无此参 | ❌ 无此参 | ❌ 无此参 | **三家都没有 → UI 不应提供** |
| focusRegion | ❌ | ❌ | ❌ | 仅作 prompt 引导（当前实现正确） |

## 四、结论与建议

### D1：strength 从 UI 撤下或改语义
三家官方 API 均无 strength。当前 UI 的"重绘强度"滑块是死参数。两个选项：
- **A（推荐）**：从 GenerateFullBodyDialog/EditPanel 移除强度控件，把"保持面部一致"完全交给 参考图+prompt（现在实际生效的就是这套）
- **B**：保留但改为"参考图相似度提示强度"，映射为 prompt 措辞强弱（弱：keep face almost unchanged / 强：reference the face loosely）——伪参数，不推荐

### D2：可灵 adapter 参数修正（独立 bug 级任务）
- 停止向可灵传 negative_prompt/seed/style/quality
- size 宽×高 → aspect_ratio（算最近比值 16:9/9:16/1:1）+ resolution（按像素量选 1k/2k）
- 人像竖版 3:4 / 9:16 → aspect_ratio=9:16

### D3：wan2.6-image 端点路由实测
确认 wan2.6-image 在 image-synthesis 端点可用性；若失败，将其加入 multimodal 路由（messages 格式）。

### D4：火山 watermark 默认带水印问题
Seedream 4.5 官方 watermark 默认 true——当前 adapter 未传，即**生成图默认带"AI生成"水印**。应显式传 `watermark: false`（或暴露开关）。

### D5：提示词优化参数（可选增强）
万相 prompt_extend（默认 true 会改提示词！）、火山 optimize_prompt_options——人像场景 prompt 精确性重要，建议显式关闭 prompt_extend（万相编辑模式），避免我们拼的一致性约束被 LLM 改写。

### D6：负面提示词的跨端兼容
可灵不支持 negative_prompt——人像 service 拼 prompt 时，对可灵 provider 应把负面词并入正向 prompt 或丢弃并警告（否则用户以为生效了）。

## 参考来源

- [万相-图像生成与编辑2.6 API参考（阿里云）](https://help.aliyun.com/zh/model-studio/wan-image-generation-api-reference)
- [Wan2.6 image generation and editing API Reference（Alibaba Cloud EN）](https://www.alibabacloud.com/help/en/model-studio/wan-image-generation-api-reference)
- [Seedream 5.0 lite API 参考（火山引擎）](https://www.volcengine.com/docs/82379/1541523)
- [图片生成（Seedream 系列模型）参数表（火山引擎）](https://www.volcengine.com/docs/6492/2172373)
- [可灵-图像生成API参考（阿里云）](https://help.aliyun.com/zh/model-studio/kling-image-generation-api-reference)
- [Seedream 4.5 - Novita AI（参考图 14 张佐证）](https://novita.ai/docs/api-reference/model-apis-seedream-4.5)
