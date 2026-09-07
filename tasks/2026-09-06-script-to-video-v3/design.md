# 「短视频脚本生成视频」工作流 V3：通用视觉策略（意象空镜 / 素材驱动）设计

日期：2026-09-06
分支：feat/workflow-engine
文档目录：tasks/2026-09-06-script-to-video-v3/
前置：V2 设计（tasks/2026-09-06-script-to-video-v2/design.md，已落地 builtin_def_script-to-video-v2）

---

## 0. 背景与问题（为什么 V3）

V2 的画面逻辑对所有视频类型走同一句话——「按口播逐镜生成可拍物理场景（文生图 → 素材板 → H3 图生视频）」。

它天然只适合"中间地带"，两侧都别扭：

1. **抽象叙事型**（财经深度/资讯口播/知识科普/文旅宣传）：大量概念（汇率、通胀、合规、IPO、信用）没有可拍的字面物；专业号的通行做法是口播=信息层、画面=**意象/氛围层**——说股市配行情屏与 K 线氛围、说企业配大楼/产线/发布会、说教育配校园/讲台。画面与文案"语义相关但不逐字对齐"。业界分别叫 **空镜 / B-roll（资料画面）**、**意象化 / 象征蒙太奇**、非字面化配画。
2. **实物型**（电商种草/品牌宣传/产品介绍）：恰恰相反——画面必须**忠于用户提供的真实产品素材**，模型凭空想象=失真/幻构/货不对板，是不能接受的。

V2 已经为两者各留了一半地基（素材前置、两级审核、底图直用 splitShots→loopBase、参考图引用），但没有"按视频类型选择画面来源"的决策层，也没有"意象化空镜"的生成路径。

V3 目标：**同一个模板，按视频类型预设 + 素材供给情况自动选择视觉策略**：
- `imagery`（意象化空镜）：AI 生成代表性意象场景（象征蒙太奇/B-roll 效果），内容层与画面层解耦；
- `asset`（素材驱动）：用户素材（产品图/品牌素材）直接成为画面主体/首帧，AI 只负责运镜、转场与氛围，不凭空创造主体。

流程节奏沿用用户要求：**先生成图文素材（大纲 → 拆镜 → 素材板）→ 人工/授权确认 → 再逐镜生成视频**。素材板整体审核节点就是天然的"两阶段闸门"：素材未确认，视频段永不启动。

## 1. 目标与验收（V3）

| # | 能力 | 验收口径 |
|---|------|---------|
| G1 | 画面策略由视频类型自动决定、可手动覆盖 | start 新增 `visualStrategy: auto/imagery/asset`；auto 依预设默认解析（财经/资讯/知识/文旅 → imagery；电商/品牌 → asset） |
| G2 | imagery 模式生成"意象化空镜"素材（语义相关、非字面、无文字） | 拆镜产物含 `concept`（语义主题）与 `imagery`（意象对象）；素材板卡片画面为意象空镜；与口播字幕解耦 |
| G3 | asset 模式强制使用用户素材、缺素材即拦 | 电商/品牌默认 asset 且 `assetDependency=required`：start 无任何图片素材 → 运行前校验报错并提示补素材；有素材 → 逐镜卡片引用具体素材图（带缩略图与来源标注），video 首帧=该素材图 |
| G4 | 意象规则可沉淀、可控 | 预设携带 `visualPolicy.imageryMap`（抽象主题 → 代表性意象提示词模板）；LLM 只做"主题→意象"的受控细化，出画仍需过素材板审核 |
| G5 | 流程仍是两阶段，先图后视频 | 素材板审核 approve 前视频段不可达（沿用 V2 两级审核语义）；M1 验收=跑到素材板确认即停；M2 再接逐镜 H3 视频 |
| G6 | 不覆盖既有版本 | v3 独立内置定义 `builtin_def_script-to-video-v3`（v1/v2 原样保留） |

## 2. 概念模型

### 2.1 视觉策略（一等决策）
```
visualStrategy: 'auto' | 'imagery' | 'asset'
resolve(visualStrategy, preset.visualPolicy, assetsProvided):
  auto → preset.visualPolicy.mode
  显式 → 用户选择优先；若 preset.assetDependency=required 且用户显式 imagery → 校验警告但放行（尊重用户）
```

### 2.2 预设扩展（video-preset 增加 visualPolicy）
```ts
interface VisualPolicy {
  mode: 'imagery' | 'asset'              // 该类型默认画面策略
  assetDependency: 'none' | 'optional' | 'required'
  imageryMap: ImageryRule[]              // 仅 imagery 相关；asset 类型可给空表但保留“若手动切 imagery 的兜底”基本表
  assetUse: {                            // 仅 asset 相关
    requireFirstFrame?: boolean          // 默认 true：视频首帧=素材图
    allowGeneratedScene?: boolean        // 允许少数氛围空镜补位（默认 false：全片素材）
    negative: string[]                   // 防加字/改主体/多手指等
  }
}
interface ImageryRule {                  // “语义主题 → 代表性意象”
  conceptClass: string                   // 如 股市行情 / 企业动态 / 监管合规 / 教育校招 / 货币汇率 / 建筑地产 / 出行旅游 / 生产制造 …
  match: string[]                        // 触发词/语义簇（中文词根）
  imagery: string                        // 可拍意象画面（一段可执行文生图描述，无文字）
}
```
第一版意象表（内置数据，后续可开放维护）为六类预设各配 8~14 条 rule，另给一套**通用兜底规则**（finance/office/people/abstract 四簇），保证自定义 videoStyle 手动切 imagery 也有意象可用。

### 2.3 每镜结构化输出（拆镜升级）
```
shot = {
  narration,          // 口播句（信息层，字幕源）
  caption,            // 字幕短句
  duration,           // 秒
  concept,            // 该镜“语义主题”（意象路由依据；asset 模式可为‘展示主体X卖点Y’）
  mode,               // imagery | asset（resolve 后每镜一致，除非 optional 混合）
  imagery,            // imagery 模式：意象对象描述（由 imageryMap 命中 + LLM 按 concept 细化；可拍物理场景、无文字）
  assetIdx,           // asset 模式：引用素材池下标（-1 且 optional 时允许 1 个补位意象）
  motion,             // 运镜（沿用）
}
```
**关键纪律**：imagery 模式拆镜阶段的"视觉思考"输入是 concept（主题簇），不是 narration 原文——这是防止"逐字配画"的机制点；字幕/口播仍精确来自 narration。

### 2.4 素材板卡片
```
card = { shotIndex, mode, concept, imageryText|assetId, image(local|local-image://), source: 'generated'|'asset:<id>', visual, caption, duration }
```
审核面板沿用 V2 图文卡片渲染（已有 image 预览 + 逐条编辑）；卡片新增 mode/source 标注，便于确认"这是生成的意象还是你提供的素材"。

## 3. 流水线（V3 图，基于 V2 演化）

```
start(脚本 三源同V2；knowledgeBaseIds；videoType/videoStyle；visualStrategy(auto|imagery|asset)；
      referenceAssetIds（风格参考）；baseImageAssetIds（=素材驱动主素材池）；
      voice/video/image provider、width/height、bgm；画质档位沿用 videoQuality/h3Steps)
 │
 ├ readAssets：脚本/文案资产文本（同 V2）
 ├ kbQueryMulti：多库合并检索（同 V2，供大纲/拆镜事实与口径）
 │
 ▼ A 策划
 preset(video-preset)：输出 label/promptBlock/styleText/preset + **visualPolicy 装配文本（policyText：模式、意象表规则、素材规则）**
 strategy(code 节点)：resolve → { mode, policyText, gate }
    gate：assetDependency=required && 素材池空 → 抛错「该视频类型需要提供产品/素材图片（baseImageAssetIds），请补充后再运行」；
          optional && 素材池空 → 模式回落 imagery 并注明
 outlineGen → outlineReview（两级审核①）→ reject→end（同 V2）
 │
 ▼ B 素材（图片）生成  —— 本阶段=M1 全部内容
 shotsGen(llm)：依大纲 + policyText 拆镜；输出每镜 {narration, caption, duration, concept, mode, imagery|assetIdx}
 split(code)：按 mode 分两组 gen[]（imagery）/ assetRef[]（asset）；asset 模式校验 assetIdx 越界 → 错误重试语义
 ┌ loopImagery（imagery 模式；结构= V2 loopMat）:
 │    promptPack(llm)：concept+imagery 命中意象表 → 可执行画面提示词（无文字、含风格）
 │    image-gen(krea2/flux，参考图可选) → matItem{imageryText, image, prompt, source:'generated'}
 └ loopAsset（asset 模式）：
      read-asset(assetId → 本地图) → matItem{assetId, image, source:'asset:<id>'}
 boardMerge(code)：合并成 cards[]（标注 mode/source）
 materialReview（素材板整体审核，两级审核②）：approve→B 结束、进 C；reject→end（同 V2，可编辑批改）
 │
 ▼ C 逐镜视频生成（M2 阶段；图内先接好，测试不跑到）
 loopVideo：perShotReview（逐镜确认，Agent 获授权时代批）→ videoGen(H3 图生视频；asset 模式首帧=素材图；
           imagery 模式首帧=意象图；prompt 含运镜/风格/负向——asset 模式负向加入防改主体词)
 tts → segments → compose(拼接+烧字幕+配音) → save(成片+大纲+素材板) → notify → end
```

节点净变化 vs V2：`+strategy(code)`、`loopAsset`（可用 read-asset 复用现有节点+子图）、preset 输出加 policy 文本、shotsGen/split/boardMerge 输出字段升级。**不新增引擎节点类型**（全部由已有 control/code/llm-chat/image-gen/read-asset/human-review/loop 组装）——v3 JSON 生成器从 V2 派生改。

## 4. start 输入增量（v3）

| key | 类型 | 说明 |
|---|---|---|
| visualStrategy | select | `auto`(默认)/`imagery`/`asset`；auto=按 videoType 预设解析 |
| （沿用）videoType | select | 六类预设 + 自定义（同 V2） |
| （沿用）baseImageAssetIds | asset-multi(image) | asset 模式素材主池；imagery 模式视为可选底图（同 V2） |
| （沿用）referenceAssetIds | asset-multi(image) | 风格参考图（imagery 模式可选；asset 模式一般不需要） |

策略解析在运行期由 strategy(code) 完成，不依赖额外 UI 外配置；RunInputForm 用通用 select/select-dynamic 渲染（V2 已验证）。

## 5. 改动面清单（M1 素材阶段）

| # | 改动 | 位置 | 内容 / 测试 |
|---|------|------|------|
| 1 | 预设扩展 visualPolicy + 意象表数据 | `src/shared/types/video-presets.ts` | `VisualPolicy/ImageryRule/AssetUseRules` 类型；六类预设补 policy；新增通用兜底规则；`resolveVisualStrategy()` + `renderPolicyText()` 纯函数 |
| 2 | 单测 | `tests/unit/core/platform/workflow/video-preset.spec.ts`（扩）或新 spec | auto 解析、required 缺素材校验、imageryMap 命中、policyText 装配 |
| 3 | preset 节点输出装配文本 | `src/core/platform/workflow/nodes/video-nodes.ts`（video-preset 节点） | output 增加 `visualPolicy`、`policyText`（渲染含意象表与素材规则）；validateConfig 兼容未知预设 |
| 4 | V3 内置图 | `progress/_gen_v3_json.js` → `src/core/database/migrations/builtin-apps/script-to-video-v3.json` | 从 V2 派生：加 strategy code 节点、preset 输出接线、shotsGen/split 字段语义、loopImagery/loopAsset 分流、素材板 payload 带 mode/source；settings 沿用 12h/70min |
| 5 | 定义注册 | `create-builtin-apps.ts` | `builtin_def_script-to-video-v3` + `builtin_app_script_to_video_v3` |
| 6 | 注册一致性 | node-registry-consistency + builtin-app-templates 断言 | v3 def 通过 validateGraph、表单/目录/类型覆盖（无新节点类型 → 预期绿） |
| 7 | M1 真机两模式小样 | CDP 驱动 | ① imagery：财经 60s 脚本（资产引用）跑至素材板确认，卡片 mode=generated；② asset：电商/品牌+2 张产品素材跑至素材板，卡片 mode=asset:<id> 且来源图=素材缩略图；③ 缺素材的电商 → 启动即被 gate 拦下给出提示 |

## 6. 实测参数与默认（沿用 V2，不改）

- 文生图 krea2 空闲 ~10s（负载 2.5min+）；H3 low/turbo 单镜 ~50s、high/steps20 15~25min（画质档位 input 沿用）
- def settings.maxDurationMs=12h；视频轮询上限 75min、节点等待 70min
- 素材板审核为等待节点（timeoutMs=null，不自动放行）——"先确认素材再视频"由引擎审核语义天然保证

## 7. 实现取舍与风险

1. **asset 模式质量核心 = 素材图首帧**：H3 图生视频首帧即素材图 → 主体真实、运动自然；不做"用素材喂 Flux 改角度再造主体"的默认路径（多主体多角度每镜单图，Flux 仅为可选增强）。防模型在素材图上加字/改形态 → assetUse.negative 进负向提示 + 素材板逐条审核。
2. **imagery 空镜失控点 = 把抽象概念画成"文字海报/图形卡片"**：意象表命中是主闸，负向词含"no text/no letters/no charts with text"，素材板审核兜底；图片生成不允许注入 narration 原文。
3. **检索型真实 B-roll**（意象关键词 → 资产/KB 检索，命中用真实画面、未命中生成兜底）：放 M3（意象表数据稳定后），M1/M2 不接，控制范围。
4. **reject→end（不整板自动回炉）**与 V2 一致；素材板支持逐条编辑批改放行。
5. **两阶段节奏的工程表达**：素材板审核节点本身即闸门；测试与真机在 materialReview 处停（不自动 approve 视频段），M2 才接 H3 链路，避免 ComfyUI 免费额度空耗在验证素材阶段。

## 8. 实施顺序（TDD）

1. video-presets：类型扩展 + 六类 policy 数据 + 通用意象表 + resolve/render 纯函数（先写单测）
2. video-preset 节点输出 policyText（节点单测扩）
3. `_gen_v3_json.js` 生成器（派生 V2）→ v3 JSON → validateGraph 0 错误；create-builtin-apps 注册；node-registry-consistency / builtin-app-templates 绿
4. M1 真机：imagery 财经小样跑至素材板确认；asset 电商缺素材被拦提示；asset+素材 跑至素材板卡片来源核对
5. （确认可行后）M2：接 video 段 + 端到端小样（turbo/low 一镜或多镜短片）成片
6. （数据稳定后）M3：检索型 B-roll 可选子源

## 9. 记录（2026-09-06 初稿）

- V3 独立定义落地（同 v2 先例：保留 v1/v2）；defId=builtin_def_script-to-video-v3，appId=builtin_app_script_to_video_v3，icon 沿用 🎬
- 本设计文档定稿后按 §8 顺序开工；M1 阶段=§3 的 stage B 素材生产全链 + materialReview 闸门验证；M2 才接 stage C。
