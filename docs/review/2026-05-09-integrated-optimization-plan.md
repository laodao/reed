# 整体优化设计 · 三份 review 整合（2026-05-09）

## 上下文

把三份 review 的结论合并成一个可执行的优化路线，解决前后冲突，确定动手顺序。

**输入：**

1. [asset-prompt-assembly-review](./2026-05-09-asset-prompt-assembly-review.md) — 现有 prompt 装配链路梳理 + 问题清单（已部分实施修复）
2. [libtv-xiaoyunque-comparison](./2026-05-09-libtv-xiaoyunque-comparison.md) — 对标 LibTV / 小云雀 + 双母语设计原则
3. [asset-generation-review](./2026-05-09-asset-generation-review.md) — 资产生成现状客观批判 + 技术路线纠偏

**核心发现（用户问题驱动）：**

- 生成效果不好 → **根因是技术路线**（文本 anchor vs latent conditioning），不是字段或 prompt 拼装细节
- 过程不透明 → **后端数据已落库，UI 没暴露**
- 字段太多 → **字段不全是问题，但数据 metadata 与生成 prompt 没解耦**

---

## 1. 三份 review 之间的冲突点

### 冲突一：character 派生身份保持

| review | 主张 | 评价 |
|---|---|---|
| asset-prompt-assembly | 派生时加 30+ 词文本身份保持约束 | 2024 年方法论 |
| asset-generation | 撤回这些约束，靠 reference image | 2026 年方法论，**胜出** |

→ **结论**：撤回 commit `c0a76fea` 中的 character 身份保持文本约束。仅保留极简版（"保持脸部特征 same face"一两句）。

### 冲突二：prompt 装配的厚度

| review | 主张 | 评价 |
|---|---|---|
| asset-prompt-assembly | identity prompt 含 name/desc/style/故事背景 全部拼 | 部分错位 |
| asset-generation | metadata（姓名/别名/定位）不进 prompt，只送 visual-relevant 字段 | **胜出** |

→ **结论**：`asset-identity-prompt.ts` 改写，只送 visual 字段。

### 一致点（无冲突）

- LibTV 比较得到的 P0 项（9 帧故事板 / 双模板画面描述 / 角色多角度参考 / 摄像机参数化 / 运镜预设 / 打光预设）跟资产生成 review 的方向**不冲突 + 互补**：
  - 这些是"镜头语言"层（不是身份一致性层）
  - 镜头语言提升 instruction following
  - 一致性靠 latent conditioning（subject / IP-Adapter / LoRA）
  - 两者并行推进，不互斥

---

## 2. 优化设计 · 四个核心方向

### 方向 A：技术路线纠偏（一致性主力换挡）

| 项 | 当前 | 目标 |
|---|---|---|
| 角色一致性主力 | 文本 anchor（30+ 词） | reference image + provider 原生 subject |
| 文本 prompt 角色 | 视觉内容 + 身份约束 + metadata + 故事背景 + 硬约束 | **仅视觉内容**（其他降级或外置） |
| metadata 字段 | 进 prompt | 只用于叙事调度 / 数据库识别 |
| provider 能力 | 一刀切走通用 prompt + ref images | 探测 subject 能力，能用就用 |

### 方向 B：透明度全链路打开

| 项 | 当前 | 目标 |
|---|---|---|
| 用户看到的 prompt | 黑盒 | 完整 prompt + negativePrompt 详情面板 |
| 用了什么模型 | 黑盒 | 显式展示 provider + model |
| ref image 是否生效 | 黑盒 | 展示 ref image 是否传 + 哪一张 |
| 生成历史 | 列表，无 diff | 提供两次生成 diff 视图 |

### 方向 C：字段重新设计 · 双层 UI

| 字段层 | 用途 | UI 位置 |
|---|---|---|
| **生成核心** | 直接进 image gen prompt | 设定卡顶部，显眼 |
| 人物描述 / 风格 / 参考图 / 性别 / 年龄 / 人种 | | |
| **叙事 metadata** | 剧本上下文 / 选角调度 / 配音 / 数据库识别 | 设定卡下方，可折叠 |
| 姓名 / 别名 / 定位 / 声音 | | |

加 AI 反向提取字段（用户写自由描述 → AI 自动填出 metadata）。

### 方向 D：镜头语言层升级（与 A/B/C 并行）

来自 libtv 比较的 P0：

- 双模板单镜画面描述（短剧 5 段 / 影视 shot-level）
- 摄像机参数化（焦距 / 光圈 / 相机风格 + tooltip）
- 运镜预设扩到 20+
- 打光命名预设
- 9 帧故事板草稿模式

这些跟 A/B/C 不冲突 — A/B/C 解决"角色 / 资产一致性"，D 解决"镜头视觉表达力"。

---

## 3. 优化路线图（按落地顺序）

### Phase 1 · 立即做（1-2 天）

**目标**：纠正过度工程 + 打开透明度。最高 ROI。

1. **撤回 character 派生过度文本约束**
   - 修改 `character-constraints.ts`：`IDENTITY_PRESERVATION_SUFFIX` / `IDENTITY_PRESERVATION_NEGATIVE` 大幅缩减
   - 保留极简版（"same face / preserve identity"一两句）
   - **位置**：`src/core/modules/episode-production/assets/prompts/character-constraints.ts`

2. **metadata 与 visual prompt 解耦**
   - 修改 `asset-identity-prompt.ts`：只送 visual-relevant 字段
   - 字段白名单：name（仅作为身份引用）/ description / appearance / outfit / 风格 / 性别 / 年龄 / 人种 / 故事背景
   - 字段黑名单（不进 prompt）：alias（别名）/ role（定位）/ voiceId / portraitId
   - **位置**：`src/core/modules/episode-production/assets/prompts/asset-identity-prompt.ts`

3. **生成详情透明面板（P0 之 P0）**
   - 资产图片缩略图右键 / hover 加"查看生成详情"
   - 展示：完整 prompt / negativePrompt / 模型 / ref image 路径 / 生成耗时
   - 数据来源：asset_image 表已有 prompt / negativePrompt 字段
   - 工程：renderer 端纯 UI 改动 + 一个新 dialog 组件
   - **位置**：新建 `GenerationDetailDialog.vue`，挂到三个 GalleryEditor

### Phase 2 · 短期（1 周）

**目标**：重构 character 设定卡 + 引入字段重要度分层。

4. **设定卡 UI 重新分组**
   - CharacterCardFormV2 / LocationCardFormV2 / ItemCardForm 三处
   - 顶部"生成核心"区：人物描述 / 风格 / 参考图 / 性别 / 年龄 / 人种
   - 折叠"叙事 metadata"区：姓名 / 别名 / 定位 / 声音 / portraitId
   - **位置**：3 个 \*CardForm\*.vue

5. **AI 正向字段提取**（与现有 enrichSettings 反向能力呼应）
   - 用户在"人物描述"自由文本里写好 → 点 ✨ 按钮 → LLM 抽出姓名 / 性别 / 年龄 / 人种 / 关键特征 → 自动填字段
   - 复用 enrichSettings 服务，加正向提取 mode
   - **位置**：`AssetSettingEnrichmentService` 加 `extractFieldsFromDescription` 方法 + IPC + UI 按钮

### Phase 3 · 中期（2-4 周）

**目标**：技术路线 latent-level conditioning + 镜头语言层升级。

6. **provider 能力探测 + 走原生 subject 路径**
   - capability matcher 加 `subjectSupport` 维度
   - 推断：KlingO1/O3、Midjourney V7（Omni Reference）、Seedance 2.0（多模态参考）
   - 调用方按能力选 API（subject API vs 通用 prompt + ref images）
   - **位置**：`video-segment.handler.ts` 的 `deriveCapabilitiesFromModel` + provider adapters

7. **双模板单镜画面描述**（来自 libtv comparison P0）
   - ④ 分镜画面描述上方加模板切换器
   - 短剧模板（默认）：角色 / 场景情境 / 戏剧冲突 / 节奏 / 镜头偏好
   - 影视模板：subject / action / camera / lighting / mood
   - **位置**：`StageStoryboardViewV2.vue` 编辑面板

8. **9 帧故事板草稿模式**（来自 libtv comparison P0）
   - 剧本→分镜过渡入口
   - 一次推理出 9 帧粗略板 → 用户挑骨架 → 走现有关键帧链式精出
   - **位置**：新建 stage 间过渡组件 + 新 IPC（一次出多帧）

### Phase 4 · 长期（4 周+）

**目标**：工业级一致性能力 + 跨项目复用。

9. **LoRA fine-tuning 入口**
   - 用户给某角色 5-20 张图 → 一键训练角色 LoRA
   - 后续生成自动加载该 LoRA
   - 适合长内容 / IP 矩阵 / 高质量场景

10. **跨项目角色库**（user-level）
    - binding 从 projectId 隔离 → 加 user-level 全局表
    - 项目内引用 + override 模型

11. **生成历史 diff**
    - 同一资产多次生成的 prompt / 模型 / ref 图差异 diff 视图

12. **镜头语言层补全**（libtv comparison P0 5-6）
    - 摄像机参数化（焦距 / 光圈 / 相机风格 + tooltip）
    - 运镜 20+ 命名预设
    - 打光 6-12 命名预设

### Phase 5 · 长期 / 视情况

来自 libtv comparison P2：

- 局部可视化连线（分镜级只读子画布）
- 数字人池（少量精选 10-30 个，与自定义共存）
- Agent / Skill 接入
- 视频解析（反向工程参考视频）

来自 libtv comparison P3：

- 视频提取主体（character 上传短视频自动提取代表帧）

---

## 4. 元原则（贯穿所有 phase）

### 4.1 双母语 UI

每条功能两边问：
- 对**专业用户**（导演 / 编剧 / 影视专业）的母语价值
- 对**大众用户**（自媒体短剧 / 个人爱好者 / 零基础）的认知负担与价值

两边都通过的才做。只通过一边的，做"分层 UI"（同一功能两种叫法 / tooltip）。

### 4.2 文本 prompt 与 latent conditioning 分工

- **文本 prompt 聚焦"这个镜头要画什么"**（视觉内容描述）
- **一致性靠 latent conditioning**（reference image / subject / LoRA / IP-Adapter）
- **metadata 只用于叙事调度**，不进生成 prompt
- 不再往 prompt 里塞身份保持文本

### 4.3 透明度优先于"智能化"

- 后端落库的数据全部暴露给用户（prompt / negativePrompt / 模型 / ref image）
- 失败时显示具体错误（provider 错误码 / 耗时 / 网络状态）
- 用户能 self-debug → 客服 / 教程负担骤降

### 4.4 字段是工具不是终点

- 字段的真正用途按"图像生成"、"叙事调度"、"数据库识别"、"配音"四个维度分类
- 同一字段不要跨维度复用（避免 metadata 污染 prompt 这种问题）

---

## 5. 当前状态 → 目标状态 · 一图速览

```
┌────────────── 当前状态（问题诊断）──────────────┐
│                                                  │
│ • character 设定 11 字段全进 prompt（5 字段 noise）│
│ • 派生加 30+ 词身份保持约束（过度工程）          │
│ • 文本 anchor 做一致性（2024 年方法论）          │
│ • prompt 黑盒，用户无法 debug                    │
│ • 11 字段 UI 平铺，新手压力大                    │
│ • 镜头语言层薄弱（6 类运镜，无打光 / 摄像机参数）│
│                                                  │
└──────────────────────────────────────────────────┘
                       ↓
┌────────────── 目标状态（Phase 1-4 完成后）─────┐
│                                                  │
│ • metadata 与 prompt 解耦（仅 visual 字段进）    │
│ • 一致性主力 = reference image + 原生 subject    │
│ • 文本 prompt 仅做视觉内容（约束极简）           │
│ • 生成详情面板暴露所有数据                       │
│ • 字段分层：核心区 / 折叠 metadata 区             │
│ • AI 正反向字段提取                              │
│ • 双模板画面描述（短剧 5 段 + 影视 shot-level）  │
│ • 9 帧故事板草稿模式                             │
│ • 摄像机 / 运镜 / 打光命名预设 + tooltip          │
│ • LoRA / 跨项目库（长期）                        │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 6. 立即行动建议

按 ROI / 工程量 / 用户感知度排序，建议**这周做完**：

1. **撤回过度文本约束**（Phase 1.1）— 30 分钟
2. **metadata 解耦**（Phase 1.2）— 1 小时
3. **生成详情透明面板**（Phase 1.3）— 半天

这三条做完后再回头评估生成效果。如果质量明显改善 → 推进 Phase 2；如果改善不明显 → 直接跳到 Phase 3.6（provider subject 路径），技术路线先升级再说 UI。

不要在 Phase 1 没出结果前就并行铺 Phase 2 / 3 / 4 — 方向是否对、需求是否抓准还要在 Phase 1 后验证。
