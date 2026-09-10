# 剧集制作 · 剧本 stage 支持「继续增加剧本」

日期：2026-08-29
分支：`feat/workflow-engine`

## 需求

> 剧集制作，剧本界面，已有剧本的情况下要支持继续增加剧本。
> 有时候剧本没有完全写完就开始制作了，因此后续需要陆续增加剧本。

## 问题定位

① 剧本 tab 的入口是 `EpisodeStudio.vue` → `components/episode-production/script/StageScriptView.vue`。

该页只有三个操作：`AI 续写` / `重新拆分` /（空态）`AI 生成剧本`。其中：

- **`AI 续写` 是假按钮**：`onAIWrite()` 只弹一句 `ElMessage.info('请在右侧「制作助手」输入你的续写需求')`，没有任何真实逻辑。
- **`重新拆分` 是覆盖式的**：`ep:generate-scenes` → `handleGenerateScenes` 先
  `db.sceneScripts.deleteByEpisodeScriptId(scriptId)` 把**所有已有场次删掉**再重建；
  `ep:generate-script` 同理。对于已经出了分镜 / 关键帧 / 视频的剧集，这是破坏性操作 ——
  正好和"边做边补剧本"的用法冲突。
- **`重新拆分` 原有二次确认都没有**，误点即清空全部场次。

结论：缺的是一条**增量追加**链路（AI 续写 + 手动粘贴正文），且必须保证已有场次一行不动。

## 方案

新增「追加剧本」两阶段链路，**只 append，不 delete**：

```
AppendScriptDialog（录入：AI 续写 / 粘贴正文）
  → ep:prepare-script-append  （AI 生成草稿，不落库，返回预览）
  → 用户预览确认（新增几场 / 正文 N 字 → M 字）
  → ep:append-script          （落库：正文拼接 + 场次 append）
  → 刷新场次并选中第一个新场次
```

### 后端

| 文件 | 说明 |
| --- | --- |
| `platform/episode-production/narrative/ai/script-generator.ts` | 提示词片段化重构 + 新增 `continueScript` / `splitScriptTextToScenes` |
| `platform/episode-production/narrative/services/script-append.service.ts` | **新增** `ScriptAppendService`（纯函数 + prepare/append 编排） |
| `shared/types/episode-production/narrative.types.ts` | 新增 `ScriptAppendMode` / `PrepareScriptAppendInput` / `ScriptAppendDraft` / `ScriptAppendPreview` / `AppendScriptResult` |
| `packs/episode-production/handlers/narrative/script.handler.ts` | 新增 `ep:prepare-script-append` / `ep:append-script` |

关键设计点：

1. **场次号接续**：`nextSceneNumber(existing) = max(sceneNumber) + 1`（取 max 而非 count，
   避免复用被删场次留下的号）；`offsetSceneNumbers(scenes, base)` 按数组顺序把 AI 给的编号
   重排成 `base+1..base+N` —— AI 不听话（从 1 重来 / 重复编号）也不会写坏数据。
2. **引用 id 重发**：`SceneBindingWriter` 用 AI 给的 id 直接当主键（`dlg.id || 生成`），
   而 AI 习惯从 `dlg_1` / `act_1` 开始编号；追加时旧的 `scene_dialogues` / `scene_actions`
   行还在库里，不重发必然主键冲突。`reassignRefIds` 在**写库边界**统一重发。
3. **正文只往后拼**：`mergeScriptContent(prev, addition)` 空行分隔；新增段为空时原样返回旧正文
   （绝不允许一次空追加把已有正文清掉）。
4. **梗概不被覆盖**：增量内容不该顶掉整集梗概，append 不写 `synopsis`。
5. **状态处理**：已定稿（`approved`）剧本追加了未校验的新内容 → 默认回到 `reviewing`；
   UI 提供「保持已定稿」选项，方便"边做边加"不打断后续 stage。未定稿剧本状态不动。
6. **提示词 DRY**：把 `SCRIPT_GENERATION_PROMPT` 里可复用的五大片段（binding 强约束 /
   场景拆分原则 / JSON 格式示例 / 字段质量要求 / 花名册清单）抽成常量，生成 / 续写 /
   正文拆分三类提示词复用同一批片段，避免 120 行规范复制三份各自漂移。
   **重构后以 `__test.buildPrompt` 输出哈希校验逐字节一致**
   （重构前 `LENGTH=3190`、`SHA256=6a7dba7c…`，重构后同值 + 原文比对 IDENTICAL）。
7. 新增 `fillPromptTemplate`（split/join 填充）替代 `String.replace`：后者会把替换值里的
   `$&` / `$'` / `$1` 当特殊模式，剧本正文含 `$` 时会被悄悄改写。

### 前端

| 文件 | 说明 |
| --- | --- |
| `script/AppendScriptDialog.vue` | **新增** 追加剧本弹窗（模式切换 → 生成 → 预览 → 确认） |
| `script/ScriptTextDialog.vue` | **新增** 剧本全文只读弹窗（含复制），用于确认追加结果 |
| `script/StageScriptView.vue` | 删掉假 `AI 续写`；新增 `AI 续写` / `追加正文` / `剧本全文`；`重新拆分` 加破坏性二次确认；顶部状态 tag |

## 测试

`tests/unit/episode-production/narrative/script-append.service.spec.ts`（新增，39 例）
—— AI 生成器 / 花名册构建 / 场景写入器三处外部依赖全部注入 stub，不连库不打 AI：

- `nextSceneNumber`：空 / 连续 / 非连续 / 缺字段
- `offsetSceneNumbers`：base=0 / base=N / AI 乱序重复编号兜底 / 空数组 / 不改入参
- `buildExistingScenesSummary`：空 / 每行字段 / 超长截断
- `mergeScriptContent`：空旧 / 两侧都有 / 空新增 / 首尾空白规整
- `reassignRefIds`：id 重发 / 批内唯一 / 业务字段保留 / 不改入参
- `prepare`：AI 续写场次接续 / 提示词上下文 / 粘贴正文模式 / 空入参拦截 / 剧本不存在 / 无场次 / 无正文
- `append`：正文拼接 / **绝不调用删除接口** / 场次号接续 / 状态处理 / 梗概不覆盖 / 空草稿拦截 / 返回值

`tests/unit/episode-production/narrative/script-generator.spec.ts`（+8 例）
—— 生成提示词**防丢段**断言 + 续写/拆分提示词内容断言（起始场次号、只输出新增、
`$&` 原样保留等）。

运行：

```
npx vitest run tests/unit/episode-production/narrative/script-append.service.spec.ts \
                tests/unit/episode-production/narrative/script-generator.spec.ts
# → 60 passed
```

## 实机验证（PC dev 应用 + 真实 IPC/AI）

用 CDP 连上正在运行的 PC dev 应用（`--remote-debugging-port=9222`），在真实剧集
（项目「杜十娘2」第1集，已有 9 场 / 正文 2040 字 / 已定稿）上验证：

**① UI 入口**（`progress/append-script-toolbar.png`、
`append-script-dialog-ai.png`、`append-script-dialog-manual.png`、
`append-script-dialog-fulltext.png`）

- 工具条：`剧本 | 已拆 9 场 | 已定稿 | AI 续写 | 追加正文 | 剧本全文 | 重新拆分`
- 「追加正文」→ 弹窗提示"已有 9 个场次不会被改动，新增内容接在最后一幕之后（从第 10 场开始编号）" + 粘贴框
- 「AI 续写」→ 同一弹窗切到"续写要求"输入框（0/2000 + 示例 placeholder）
- 「剧本全文」→ 只读弹窗：9 场 / 2040 字 / 已定稿 / 梗概 / 正文 + 复制

**② IPC 链路**（`ep:prepare-script-append`，**只生成草稿不落库**，因此不碰用户数据）

| 模式 | 结果 |
| --- | --- |
| `manual-text` | 8.4s 返回；`startSceneNumber=10`；新增 1 场编号 **10**；地点 "杜十娘闺房" 解析出真实 binding `lb_5f1dfab3c4ec2f61`、角色 `cb_c074a5e76b122ed4`；正文 66 字原样带回 |
| `ai-continue` | 19.0s 返回；`startSceneNumber=10`；新增 1 场编号 **10**；地点 "青楼 大堂" + 3 个角色全部解析出真实 binding；本段正文 1162 字 + 本段梗概；对话 id `dlg_10_1..11`（写库时会被重发） |

两种模式下 `prepare` 前后复查 DB：场次号仍是 `1..9`、正文字数仍是 2040 → **确认 prepare 零副作用**。

**未做实机写入验证（append）**：会在用户真实剧集里插行，且 `sceneScripts.delete` 是否级联
清理 `scene_characters/scene_dialogues/scene_actions` 未确认，回滚可能留脏数据，故只做单测覆盖
（13 例）。写入走的是既有生成流程同一条 `SceneBindingWriter.createScenesWithBindings`。

## 顺手修掉的两个既有类型错误（改动文件内）

- `script-generator.ts`：`scriptPath: 'new' | 'old' | 'none'` 漏了 `as`，被 TS 当成位运算
  （TS2362 ×2）。
- `script.handler.ts` `handleUpdateScript`：`status?: string` 传给 `ScriptStatus`
  （TS2345）。改为直接用 `UpdateEpisodeScriptRequest`。

## 遗留 / 后续

- 追加出新的场次后，这些场次还没有分镜，④ 分镜 stage 的完成检查会把它们标成缺失 ——
  这是预期行为（新场次确实要补分镜），未做自动生成。
- `generateScenesFromSynopsis`（`重新拆分` 走的简化提示词）本次未纳入片段化重构：
  它的输出 marker 是 `===SCENES_JSON===`，与生成提示词的 `【场景数据开始】` 不同，
  强行统一会改变解析路径与输出行为，超出本次需求范围。
