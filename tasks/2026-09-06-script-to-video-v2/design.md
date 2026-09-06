# 「短视频脚本生成视频」工作流 V2（素材前置 · 两级审核 · KB/资产引用）设计

日期：2026-09-06
分支：feat/workflow-engine
文档目录：tasks/2026-09-06-script-to-video-v2/
相关进度：progress/2026-09-06-sv-comfyui-run.md（旧版试跑记录与实测数据）

---

## 0. 背景与问题（旧版 V1 的教训）

V1 形态：`拆解脚本(parse1) → [逐镜: 文生图 → 人工审核 → 图生视频] → TTS → 合成 → 存档`。

实测暴露两类问题：
1. **流程缺前置质量关卡**：拆解完分镜就直接逐镜出图/出视频，大纲、文案口径、画面方向都没有先整体定稿与审阅——用户提出：应先生成**图文素材/大纲**（依视频类型与脚本内容），定大纲、定每片段提示词与素材，再逐个片段生成。
2. **逐镜异步视频吞吐慢且上限不够**：局域网 ComfyUI 网关 H3 全质量（704×1248/steps20）实测单镜 15~25 分钟；引擎默认单次运行 30 分钟、单镜视频等待 12 分钟、轮询 10 分钟，均需调大（见 §6）。
3. 附带修复（已完成，评审 #102）：引擎在"循环体内审核 + 后续异步节点"续驱时未等待在飞任务收敛即驱动下一迭代，导致多次连续 approve 时 `UNIQUE constraint` 崩溃、results 丢视频产物。回归测试 `tests/unit/core/platform/workflow/loop-review.spec.ts` 已加。

## 1. 目标（V2 验收口径）

| # | 能力 | 验收 |
|---|------|------|
| G1 | 脚本来源二选一：直接引用成品脚本文案（资产/粘贴），或"主题+要点"由工作流先从知识库生成脚本与大纲 | start 支持脚本留空 + 主题/要点输入 |
| G2 | 多知识库作为生成脚本/大纲的参考（口径与事实） | start 多选知识库 → 检索结果注入生成提示词并随产物带来源标注 |
| G3 | 视频类型驱动素材：预设类型 + 自由风格叠加 | start：videoType 预设（下拉）+ videoStyle（自由文字，可空=仅预设） |
| G4 | 两级前置审核：①大纲审核 ②图文素材板整体审核（可逐条批改/驳回），通过后才进入逐片段视频生成 | 大纲审核节点 + 素材板审核节点，边语义 approve→继续 / reject→重做 |
| G5 | 保留逐片段视频生成前的人工审核（可被用户授权由 Agent 代为批准） | 逐片段 human-review（同 V1） |
| G6 | 引用资产已有内容：文案/脚本资产作输入；图片资产作参考图或直接作片段底图 | start 资产选择器（多选）+ read-asset/参考图链路 |
| G7 | 质量/过程产物存档：大纲、素材板（图文）、逐镜素材图、最终成片 | 资产库分类新增「视频大纲」「视频素材板」等 |

## 2. 总体流水线（V2 图）

```
start(脚本资产/粘贴文本 或 主题+要点；KBIds 多选；videoType+videoStyle；参考图资产多选；底图资产多选；
      音色/分辨率/BGM/时长档；maxDurationMs 由 def settings 提供)
 │
 ├─[可选] readAssets: 循环 read-asset 读取所选「文案/脚本资产」文本 → scriptInputs 合并
 ├─[可选] kbQueryMulti: 对所选多库执行合并检索（主题+要点相关）→ kbRefs{chunks[], sources[]}
 │
 ▼ stage A 策划（大纲）
 llm_outline(视频类型预设 + 脚本或主题/要点 + kbRefs)
   → outline(标题/定位/时长档/叙事结构[段落: 作用, 口径, 要点, 旁白句] / 风格基调 / 事实口径清单)
 outlineReview(human-review：整体批准或逐条修改/驳回重做)
 │
 ▼ stage B 片段化与素材生产
 llm_shots(大纲 + kbRefs → 片段序列 shots[]：段落归属/画面要点/口播句/字幕/时长/运镜/需要底图？)
 loopMaterial(shots):
   llm_shotPack(该片段 + 大纲风格 + 可选参考图资产描述 → visualPrompt/caption/duration/motion/refChoice)
   imgShot: 若有"直接底图资产"映射 → 用 read-asset 取该图（跳过 image-gen）；否则 image-gen(visualPrompt, 参考图)
   → materialItem{shotIndex, visual, caption, duration, image(png/本地), prompt, refFrom}
 boardAssemble(code)：整批素材板 boards[]（逐片段卡片）
 materialReview(human-review 图文板：整批可逐条改批/驳回)
 │
 ▼ stage C 逐片段视频生成
 loopVideo(shots，复用审核通过的 shots/素材):
   perShotReview(human-review：该镜画面+素材图，批准/驳回)   ← 保留逐镜审核
   videoGen(ComfyUI H3 图生视频，prompt=该片段提示词/运镜/风格)
 tts(narration 全片口播，可来自大纲旁白拼接或脚本原文)
 compose(按片段顺序拼接 + 烧字幕 + 配音/BGM)
 save: 成片视频 + 大纲(markdown) + 素材板(图文/长图) + 可选逐镜素材图
 end
```

## 3. start 输入（V2）

| key | 类型 | 说明 |
|---|---|---|
| scriptSource | select | `asset`（引用脚本资产）/ `text`（粘贴）/ `topic`（主题+要点，脚本留空由 KB 生成） |
| scriptAssetIds | asset-multi | scriptSource=asset 时多选「短视频脚本/文案」类资产 |
| scriptText | textarea | scriptSource=text 时粘贴（可含原 V1 的完整脚本 md） |
| topic | text | scriptSource=topic：一句话选题 |
| keyPoints | textarea | scriptSource=topic：期望覆盖要点/口径（可空） |
| knowledgeBaseIds | kb-multi | 多选知识库（脚本与大纲参考；空=不查 KB） |
| videoType | select(preset) | 财经深度 / 资讯口播 / 知识科普 / 电商种草 / 品牌宣传 / 旅行记录 / 自定义 |
| videoStyle | textarea | 自由风格叠加（空=仅 preset） |
| referenceAssetIds | asset-multi(image) | 风格/主体参考图（进 image-gen referenceImages） |
| baseImageAssetIds | asset-multi(image) | 可直接当某片段底图的候选素材（LLM 按资产名/描述匹配置信度，素材板逐条可改） |
| width/height | number | 默认 704×1248 |
| voiceProviderConfigId/voiceId | … | 配音 |
| videoProviderConfigId/videoModelId | … | 默认 ComfyUI/h3 |
| imageProviderConfigId/imageModelId | … | 默认 ComfyUI/krea2（有参考图时模型提示切 flux-kontext） |
| model | model | 拆解/生成 LLM |
| bgmPath | string | 可选 |
| materialReviewMode | select | 素材板「整体批准即可」/「整体+逐条批准」（默认前者，G4） |

## 4. 两级审核的节点语义

- **outlineReview（human-review）**
  - payload：outline 全文（标题/定位/段落结构/口径清单）
  - editableFields：outline（整份 markdown 文本）
  - 出边：approve→拆解；reject→回到大纲生成（loop 一次重做，加修正意见 comment 作为 llm 二次输入）
- **materialReview（human-review，素材板）**
  - payload：`{stage, videoType, style, cards:[{i, shot, visual, caption, duration, image(local), refFrom}], comment}`（前端按卡片渲染缩略图+可编辑文案）
  - editableFields：cards（JSON）→ 前端以「卡片列表编辑器」呈现，可逐条改 visual/caption/duration、标记"此镜不要"/"重画此镜"
  - reject 语义：带上 comment + 标记的卡片索引 → 仅重做被拒片段（设计目标；V1 先整体回炉一次再进入素材循环，可避免引擎侧增量重做的复杂度）——**实现取舍见 §7**
- **perShotReview（保留）**：逐片段 video-gen 前的确认；Agent 获授权时代为批准。

## 5. 新平台能力清单（改动面）

| 改动 | 位置 | 内容 |
|---|---|---|
| 1. KB 多库合并检索节点 `kb-query-multi`（新节点） | `src/core/platform/workflow/nodes/`（ai-nodes 区） | 输入 knowledgeBaseIds(数组/模板)、query(s)、topK/threshold/每库条数 → 逐库检索（复用 KB 检索服务）合并去重 → 输出 {chunks[], sources[]}；注册 catalog+forms+validator+types+测试 |
| 2. 资产多选读取：`read-asset` 支持多/循环 | 现有 read-asset + 资产服务 | start 资产多选在运行期解析为 ids 数组；用现有 loop + read-asset 即可（不新增节点）；read-asset 输出补 description/tags |
| 3. 审核面板图文卡片渲染 | 渲染层 human-review 面板 | 支持 payload.cards[]：缩略图（本地图 URL）、字段内联编辑、逐条标记；大纲以整份 markdown 文本编辑 |
| 4. 资产选择器（start） | RunInputForm / 动态源 | source=`assets`（按 category/subCategory 浏览、多选、返回 assetId+名称+类型）；source=`knowledgeBases` 支持 multi |
| 5. 视频类型预设定义 | 内置常量（V2 JSON 内或 types） | preset → {定位句、结构模板、画面基调、运镜风格、音乐氛围、字幕规范、禁止文字规则}，注入大纲/提示词 systemPrompt |
| 6. 时间/上限调整（V2 必备） | video-generation.service（轮询 120→~900）、video-nodes 等待 12→45min、script-to-video JSON settings.maxDurationMs（建议 12h，≤ LIMITS 24h） | 见 progress 试跑实测：单镜 H3 15~25min |
| 7. 内置工作流 JSON 重写 | `src/core/database/migrations/builtin-apps/script-to-video.json` | 同 id 升级（templateVersion=1，启动同步 DB）；老 run 保留 graphSnapshot 不受影响 |
| 8. 存档分类 | create-asset-categories BUILTIN_CATEGORIES | 新增业务分类：「视频大纲」（text）、「视频素材板」（image，走 report/长图模板或原生图）、「分镜素材图」（image）可选 |

## 6. 实测参数与上限（作为 V2 默认）

- 文生图 krea2：空闲 ~10s，负载下可达 2.5min（undici body 超时 300s，负载极高时可能失败——后续可选给网关图片请求提高超时）
- H3 图生视频 high/704×1248/steps20：10s 片段 ≥14.5min（实测 872s 未完成），按 15~25min/镜规划
- 建议：def settings.maxDurationMs=12h；video 轮询上限 ~75min；video-gen 节点等待 ~45min
- 画质档位：默认 high；如需提速可加 start 输入 videoQuality∈{high, low}+steps∈{20,4}（进 H3 协议）——**二期可选**

## 7. 实现取舍与风险（待确认）

1. **素材板驳回重做粒度**：V1 实现采用"整板驳回→llm 按驳回意见修正大纲/素材再全量重出"（引擎零改动、简单可靠）；"仅重做被拒片段"需要跨迭代 checkpoint/增量，改动大，放二期。
2. **参考图模型选择**：有参考图资产时 image-gen 模型建议 flux-kontext（1 参考图语义）否则 krea2；多张参考图 V1 只取首张作风格参考，其余进 prompt 描述（二期再做逐镜精确引用）。
3. **素材板渲染**：本地图以 local-image:// 传前端缩略图；当前审核面板需小扩展（§5-3）。在此之前，素材板审核 payload 也会带完整 JSON，Agent/CDP 审核不受 UI 影响。
4. **脚本从 KB 生成的口径真实性**：产物标注来源（sources[]），口径标注样式沿用吃瓜流的「事实/当事人自述/网传」约定。

## 8. 实施顺序（TDD）

1. 常量/上限调整 + 回归测试（现有 loop-review/视频链路测试不回归）
2. `kb-query-multi` 节点（先测试：多库合并、去重、sources 透传）
3. read-asset 补 description/tags（测试）
4. 视频类型预设常量 + 注入测试
5. V2 内置 JSON 重写 + validateGraph 通过 + DB 同步 + builtin-app-templates 一致性（补全 NODE_CONFIG_FORMS 缺失项，修 node-registry-consistency）
6. 审核面板卡片渲染 + 资产选择器（渲染层）
7. 端到端：先小样（3 片段）跑通 V2（大纲审核→素材板审核→逐片段视频）→ 全片挂机
8. 存档/通知/资产分类收尾

## 9. 实现记录（2026-09-06 定稿）

- 保留 V1：V2 以独立内置定义落地，不覆盖 builtin_def_script-to-video。
  - 定义 id：builtin_def_script-to-video-v2（内置应用 builtin_app_script_to_video_v2）
  - 模板文件：src/core/database/migrations/builtin-apps/script-to-video-v2.json
  - 生成器：progress/_gen_v2_json.js（JS→JSON.stringify 保证合法）
- V2 图现状：34 节点 / 38 边，validateGraph 0 errors；图结构：read-assets×3 → refPick/kbQuery(kb-query-multi)/preset(video-preset) → 大纲(llm)→md→大纲审核(approve/reject→end)→底图清单→分镜拆解→split(生成/底图) → loopMat(提示词包+文生图)/loopBase(底图直用) → boardMerge(卡片) → 素材板审核 → loopVideo(逐镜审核→H3) → TTS→segments→合成→存档(成片+大纲+素材板)→通知→end
- 节点/表单补全：read-assets（批量资产读取）、kb-query-multi（多库检索合并）、video-preset（类型预设装配）全部接入 catalog/forms/types；video-gen/video-compose 表单补全 → node-registry-consistency 4/4 绿。
- 语义定稿（评审 #102/#103 语境）：
  - 两级 human-review 的 reject → end（当前不做整段自动回炉；可编辑字段支持批改后放行；全自动回炉留后续）
  - code 节点输出统一包裹在 {result}（引擎既定），循环 results 需解包——boardMerge 已处理
  - 视频/图像仍走 ComfyUI（h3/krea2）；H3 轮询 75min、节点等待 45min、本定义 maxDurationMs=12h
- 已知取舍/风险（后续迭代）：素材板 reject 整板重做粒度；多参考图只取首张；底图资产作为视频首帧的路径解析需实测；start 资产选择器与卡片审核渲染待阶段 6。
