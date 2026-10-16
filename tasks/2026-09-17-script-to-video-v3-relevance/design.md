# 「短视频脚本生成视频 V3」配图相关性升级（真实素材优先）设计

日期：2026-09-17
文档目录：`tasks/2026-09-17-script-to-video-v3-relevance/`
前置：V3 通用视觉策略（`tasks/2026-09-06-script-to-video-v3/design.md`）、写作层技能化（`tasks/2026-09-07-script-to-video-writer-skills/design.md`）
目标定级：成片达到可直接投放短视频平台的质量；**配图必须与脚本内容相关**

---

## 0. 问题（用户反馈 → 根因）

用户反馈：V3 成片能出，但**配图质量非常差、与脚本内容不相关**。期望是"说到产业指数就该是工业厂房生产，说到进出口外贸就该是港口码头繁忙场景"。

按现网链路逐环定位根因（`builtin_def_script-to-video-v3`，imagery 模式）：

| # | 根因 | 证据 |
|---|------|------|
| R1 | **画面来源只有一条路：本地 krea2 文生图**。低算力小模型，写实度与中文语义理解都弱 | `imgShot`(image-gen, krea2)；`progress/2026-09-07-script-to-video-v3-xingyu-60s-run.md` 的 low 档成片 |
| R2 | **画面规划只到"意象"层，不落到"真实可拍场景"**。意象表 12 条（financial-deep）里没有"产业指数/进出口/外贸/港口/物流/基建"等财经高频主题 → 未命中即由 LLM 自由发挥 → 跑题或画成抽象图形 | `src/shared/types/video-presets.ts` imageryMap 仅 12 条 |
| R3 | **没有任何"生成后校验"**。画成海报/加文字/跑题，全部直接进素材板，靠人眼兜 | 图中 `imgShot → matItem → boardReview`，无质检节点 |
| R4 | **没有真实素材通道**。真实版权可商用的 B-roll（Pexels/Pixabay）既无 provider 也无节点 | 全仓无 stock/media 检索实现（仅一条 Unsplash 预设工具，未被工作流使用） |
| R5 | **成片分辨率低**（704×1248 出片），平台侧会被判低清 | start.width/height 默认 704×1248 |

## 1. 目标与验收

| # | 能力 | 验收口径 |
|---|------|---------|
| G1 | 真实素材优先：每镜先按脚本语义检索真实版权素材（图片/视频），命中即用真实画面 | "进出口/外贸"类脚本镜头产出**港口集装箱码头**真实画面；素材记录 provider/id/作者/授权链接 |
| G2 | 相关性可判定：用视觉模型对候选与镜头语义打相关性分，择优 | 每镜卡片带 `relevance` 分与 `searchQuery`；低于阈值不采用 |
| G3 | 生成兜底 + 质检重试：素材未命中才文生图，且生成后过视觉质检，不合格重生成 | 生成路径带 `qaScore/attempts`；连续不合格给出明确降级记录而非静默放行 |
| G4 | 画面规划升级为"真实场景导演"：抽象主题 → 具体场所+主体+检索词 | shotsGen 每镜新增 subject/setting/searchQuery/shotSize/cameraMove；场景词典覆盖产业指数/外贸物流/基建/能源/科技等 |
| G5 | 成片规格可投放 | 合成默认 1080×1920；图片镜头带缓慢运镜（Ken Burns），不再是静止帧 |
| G6 | 不破坏既有语义 | imagery/asset 分流、两级审核闸、写作层技能、V1/V2 定义均不变；asset 模式行为不变 |
| G7 | 不新增"假数据" | 素材全部来自真实 API 或真实生成；未取到即如实降级并记录 |

## 2. 概念模型

### 2.1 三层画面供给（按优先级回退）

```
镜头语义（concept/subject/setting/searchQuery）
   │
   ├─①真实视频素材  Pexels/Pixabay 视频（竖屏优先、时长≥镜头时长） → 直接作为该镜片段
   ├─②真实图片素材  Pexels/Pixabay 图片 → 首帧图 + 缓慢运镜（Ken Burns）成片段
   ─③AI 生成图     高质量云模型文生图 → 视觉质检（相关性/无文字/非海报）→ 重试 → 运镜成片段
```

三层都要过**相关性闸**：视觉模型对候选/结果打分，低于阈值逐级回退。

### 2.2 场景词典（可维护数据资产）

`SHOT_SCENE_LEXICON`：`{ conceptClass, match[], scene（中文可拍场景）, searchQuery（素材库英文检索词）, subject, setting }`。
覆盖财经/资讯/知识/文旅高频主题：产业指数·工业制造、进出口·外贸·港口、物流供应链、基建地产、能源电力、科技算力、汽车新能源、半导体、农业粮食、消费零售、金融股市、政策监管、就业人才、医疗、教育、环保双碳、文旅出行等。
词典文本随 preset 输出（`sceneText`）注入拆镜提示词；未命中条目时 LLM 自行落到"真实可拍场景"并给英文检索词。

### 2.3 镜头结构化输出（拆镜升级）

```
shot = {
  concept,                     // 语义主题（意象路由）
  subject, setting,            // 画面主体实体 / 场所（必须真实可拍）
  searchQuery,                 // 素材库检索词（英文短语，2~4 词）
  shotSize, cameraMove,        // 景别 / 运镜
  visual,                      // 可执行画面描述（含光线/色调/构图）
  caption, duration,           // 字幕 / 时长
  imagery,                     // imagery 模式：意象（保留，用于生成兜底提示词）
  assetIdx                     // asset 模式：素材池索引
}
```

纪律：`visual/subject/setting` 必须指向**真实世界的具体场所与实体**；禁止把抽象名词（指数/趋势/信心/生态/赋能）单独成画；禁止文字/UI/图表/海报；一镜一场景。

### 2.4 片段来源与合成

- 镜头卡片新增 `clipPath`（真实视频素材本地路径，可空）与 `imagePath`（首帧图本地路径）。
- `segments` 组装：有 `clipPath` → `{kind:'video'}`；否则 `{kind:'image', motion}` → 合成节点对图片段做缓慢运镜。
- H3 图生视频保留为**可选**路径（`clipSource=h3`）：默认 `auto` 走真实素材/图片运镜，不再让每镜等 50s~15min 的 H3。

## 3. 改动面

| # | 改动 | 位置 |
|---|------|------|
| 1 | 素材 provider（Pexels/Pixabay，图片+视频检索，含授权元数据） | `src/core/platform/providers/stock/` |
| 2 | 素材服务：检索 → 相关性选优（VLM）→ 下载落盘缓存 → 授权信息落库 | `src/core/platform/services/stock-media.service.ts` |
| 3 | 场景词典数据 | `src/shared/types/video-scene-lexicon.ts` |
| 4 | preset 节点输出 `sceneText` | `src/core/platform/workflow/nodes/video-nodes.ts` |
| 5 | 新节点 `shot-visual`（三层供给 + 相关性闸 + 质检重试） | `src/core/platform/workflow/nodes/visual-nodes.ts` |
| 6 | 图片段运镜（Ken Burns）+ 1080×1920 | `video-nodes.ts` video-compose |
| 7 | V3 内置图改造（拆镜升级 / 素材供给 / 分段 / H3 可选） | `src/core/database/migrations/builtin-apps/script-to-video-v3.json` |
| 8 | 凭据：素材库 API Key 加密存储与节点选用 | `tool_credentials` + select-dynamic `credentials` |
| 9 | 测试 | `tests/unit/core/platform/workflow/` 下新增 spec |

## 4. 纪律

- 素材来源必须留痕（provider / 素材 id / 作者 / 授权页 URL），禁止把网络素材伪装成自有素材；
- 不新增写死配置：模型/分辨率/阈值/检索条数全部走节点 config 与运行参数；
- 素材检索失败（网络/额度/未配 Key）**不得阻断**流程，如实降级到下一层并记录 `fallbackChain`。