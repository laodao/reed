# 2026-09-17 「短视频脚本生成视频V3」配图相关性升级（真实素材优先）

任务：`tasks/2026-09-17-script-to-video-v3-relevance/design.md`
目标：让 V3 成片达到可直接投放短视频平台的质量，**核心是配图与脚本内容相关**（说到产业指数→工业厂房生产；说到进出口外贸→港口码头繁忙场景）。

---

## 1. 问题定位（用户反馈 → 根因）

按现网 V3 链路逐环定位「配图质量差 / 与脚本不相关」的 5 条根因：

| # | 根因 | 证据 |
|---|------|------|
| R1 | 画面来源**只有**本地 krea2 文生图（低算力小模型，写实度与中文语义都弱） | `imgShot`(image-gen, krea2) |
| R2 | 画面规划只到「意象」层，不落到**真实可拍场景**：意象表 12 条里没有产业指数/进出口/外贸/港口/物流/基建 | `src/shared/types/video-presets.ts` imageryMap 仅 12 条 |
| R3 | **没有生成后校验**：画成海报/跑题/带文字也直接进素材板 | 图中无质检环节 |
| R4 | **没有真实素材通道**：真实版权可商用 B-roll 既无 provider 也无节点 | 全仓无 stock/media 检索实现 |
| R5 | 出片分辨率低（704×1248），平台侧判低清 | start.width/height 默认 |

## 2. 本轮落地（代码）

### 2.1 新增：真实素材库 provider + 服务
- `src/shared/types/stock-media.types.ts`：素材检索/下载/授权留痕的统一类型。
- `src/core/platform/providers/stock/`：`base-stock-provider.ts`（统一入参裁剪 + **统一硬过滤语义** + fetch 注入点）、`pexels-stock.provider.ts`、`pixabay-stock.provider.ts`（按官方文档实现，**未实测**：当前只有 Pexels Key）、`index.ts`（工厂 + 清单）。
  - Pexels 图片下载走 `original 基址 + w=1600`：**实测 large2x 直链带 `h=650&w=940` 参数只有 940px 宽**，直接用它成片会发虚（已修正）。
  - 视频清晰度挑选：画幅一致优先 → 满足最小宽度且不超 2160 的里取**最大**（画质优先）。
- `src/core/platform/services/stock-media.service.ts`：检索（主词 + 备选词链）→ 下载落盘（`stock-media/<provider>/<kind>/`，provider+id 幂等命名）→ 单条失败不阻断。

### 2.2 新增：镜头真实场景词典（配图相关性的数据底座）
`src/shared/types/video-scene-lexicon.ts`：**42 个主题簇**，每条给出「触发词 → 中文可拍场景 → 素材库英文检索词 + 备选词」。
覆盖用户点名的场景，例如：
- 产业指数·工业制造 → 现代化厂房产线/机械臂焊接 → `factory production line`
- 进出口·外贸·港口 → 集装箱码头龙门吊装卸/货轮靠泊 → `container port terminal`
- 航运/物流/铁路/航空/基建/能源/新能源/半导体/算力/汽车/消费/电商/农业/金融股市/债券/汇率/银行/物价/就业/监管/会议/医疗/教育/环保/文旅/餐饮/城市/老龄化/大宗/化工/钢铁/航天/通信/宏观数据/舆情/民生/危机/竞争/研发…

词典文本由 `video-preset` 节点输出为 `sceneText`，注入拆镜提示词（任何视频类型都生效）。

### 2.3 新增：`shot-visual` 节点（三层画面供给 + 相关性闸）
`src/core/platform/workflow/nodes/visual-nodes.ts` + 纯函数层 `src/core/platform/workflow/visual/visual-plan.ts`：
```
① 真实视频素材（Pexels/Pixabay） → 直接作为该镜片段（真实 B-roll）
② 真实图片素材                   → 首帧图（合成阶段缓慢运镜）
③ AI 生成图（高质量模型）        → 视觉质检不过则按失败原因强化重试
```
- 每层都过**相关性闸**：VLM 按脚本语义打分（相关性 + 是否被画成文字/海报），低于阈值继续回退。
- 降级链写入 `note`（如实留痕）：缺凭据/无检索词/检索未命中/未过闸/质检不可用/生成重试次数。
- 检索词缺失时用场景词典兜底解析；素材层异常不阻断流程。

### 2.4 改动：合成与片段规划
- `video-nodes.ts`（video-compose）：
  - 图片段 **Ken Burns 运镜**（zoom-in/zoom-out/pan-left/pan-right，`zoompan` 实现，已用真实 ffmpeg 验证 5 种档位产物 1080×1920/3.00s/确有帧间变化）；
  - 视频段 `-stream_loop -1`（真实素材短于镜头时长时循环补足）；
  - 输出规格改为**显式配置优先**（成片统一到 1080×1920，不再跟随首个素材段分辨率）。
- V3 内置图（`src/core/database/migrations/builtin-apps/script-to-video-v3.json`，生成器 `progress/_gen_v3_visual.js`）：
  - start：+`stockProvider` / `stockCredentialId`(select-dynamic credentials) / `stockKind` / `clipSource` / `visionModel`；出片规格默认 1080×1920；`videoProviderConfigId` 改为**非必填**（auto 模式不跑 H3）；
  - shotsGen：注入 `{{preset.sceneText}}`，逐镜新增 `subject/setting/searchQuery/altQueries/shotSize/cameraMove`；
  - 素材环：删 `shotPack`/`imgShot` → `visualShot(shot-visual)` → `matItem`（省掉每镜一次 LLM 调用）；
  - 片段规划：`boardReview → segPlan → loopVideo(仅 H3 镜头) → segments`；H3 变成可选慢路径（auto 默认不跑）。

### 2.5 顺带修复的三个真实缺陷（真机跑出来的）
1. **火山（Ark）provider 不支持多模态块**：`volcengine-sdk-provider.buildMessages` 把内部块 `{type:'image'}` 原样透传 → Ark 400（`invalid value: image`）→ **火山 provider 上视觉质检完全不可用**。已新增 `mapVolcengineContentBlocks()` 归一为 `image_url` 并加单测。
2. **`callVLM` 静默丢图**：模型未声明 `multimodal` 时底层会丢图片块、模型照常作答，问题极难定位。已在 `callVLM` 前置校验并给出可操作报错（"请在设置里把该模型类型改为多模态或改选视觉模型"）。
3. **质检错误被 `return` 吞掉**：真实素材采用分支直接 return，循环外的 `质检调用失败` 留痕永远不写 → 表现成"未质检"却看不出原因。已在采用前留痕，并把 provider/model 带进错误信息。

## 3. 验证

### 3.1 单元测试（新增/更新，全部通过）
| spec | 覆盖 |
|---|---|
| `tests/unit/shared/video-scene-lexicon.spec.ts`（11） | 词典字段/纪律（检索词必须英文、场景不得要求文字）、**用户点名主题必命中**（产业指数→工厂、外贸→港口） |
| `tests/unit/core/platform/providers/stock/stock-providers.spec.ts`（11） | Pexels/Pixabay 映射、清晰度挑选、硬过滤回落、鉴权与错误 |
| `tests/unit/core/platform/services/stock-media.service.spec.ts`（8） | 检索词链、下载落盘/幂等命名、扩展名判定、单条失败不抛出 |
| `tests/unit/core/platform/workflow/visual-plan.spec.ts`（17） | 检索词解析兜底、生成提示词纪律、质检解析容错、采用判定与重试纠偏 |
| `tests/unit/core/platform/workflow/shot-visual-node.spec.ts`（13） | 三层供给分支、相关性闸、生成重试、降级留痕、配置校验 |
| `tests/unit/core/platform/workflow/script-to-video-v3-graph.spec.ts`（8） | 图结构/接线/审核语义 |
| `tests/unit/core/platform/workflow/script-to-video-v3-logic.spec.ts`（16） | **直接执行 JSON 里的 code 节点源码**（vm 沙箱）：卡片组装/摘要留痕/片段规划/H3 回填/缺段报错 |
| `tests/unit/core/platform/providers/llm/volcengine-multimodal.spec.ts`（4） | Ark 多模态块映射回归 |

### 3.2 真机（隔离实例）
多会话并行纪律：本轮**独立启动**了一套 PC 端实例，互不干扰——
`npx electron-vite dev -- --remote-debugging-port=9333 --user-data-dir=...\.local\sv-v3\userData`
（渲染 dev server 落在 5174，数据目录/产物/日志全部隔离；`.local/` 已加入 .gitignore）。

真机链路证据见 `outputs/_sv-v3-*.json` 与 `wf-run-logs/`；测试稿为真实新闻：
新华财经《国家统计局：2026年8月份规模以上工业增加值增长5.2%》（含出口交货值、新能源汽车、钢材水泥等）。

## 4. 结论与后续

- **配图相关性目标达成路径**：拆镜落真实场景 + 场景词典英文检索词 + 真实素材优先 + 相关性闸 + 生成质检兜底；
- 后续可做：Pixabay 实测、素材片段时长/构图二次裁剪、素材来源白名单与重复使用检测、H3 路径端到端实测、把「素材检索」做成可复用节点给其它工作流用。