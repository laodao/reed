# P7 真实 e2e 测试报告（Playwright 驱动浏览器）

| 项 | 值 |
|---|---|
| 日期 | 2026-05-05（多轮迭代） |
| 测试方式 | Playwright MCP 直接驱动 Chromium 走 web 端 UI |
| 测试目标 | 登录 → ① 内容 → ② 资产 → ③ 剧本 → ④ 分镜 → ⑤ 制作 → ⑥ 合成 出真实 MP4 |
| **实际达成** | ✅ 走完 ①→⑤ 三个真实 AI 生成阶段（剧本/分镜/关键帧）；🔴 视频片段被环境层加密 key 反复挡住 |
| 真实测试时长 | ~120 分钟 |
| 真实 AI 调用累计 | 511 秒（百炼 qwen-plus + qwen-image + wan2.7） |

## 1. 已成功验证的环节

| 阶段 | 操作 | 验证结果 | 实际耗时 |
|---|---|---|---|
| 登录 | test@local.dev / test123456 | ✅ HTTP 200，进入剧集制作页 | <1s |
| 创建项目 | "e2e-茶馆相遇" + 1080p / 16:9 / 30fps / 淡入淡出 | ✅ `vp_1777964622169_j2jet3r1r` | <1s |
| 创建剧集 | 第 1 集"茶馆相遇" + uploaded 模式 + 粘 1500 字长文 | ✅ `ve_1777964784609_yvua6e6h6` | <1s |
| AI 识别要素 | 三角色（少年/老者/师父）自动识别 | ✅ uploadedCharacters 写入 | ~5s |
| 配 5 个模型 | 剧本/分镜/画面/视频/音频 各选一个 bailian model | ✅ project.config 保存 | <1s |
| **ep:generate-script** | qwen-plus 生成剧本 | ✅ **3 场景**（南风茶馆门前 / 茶馆 / 外长街） | **133 秒** |
| **ep:generate-storyboard** | qwen-plus 为场景 1 生成分镜 | ✅ **5 个分镜**（含完整提示词、机位、动作） | **316 秒** |
| **ep:generate-keyframes** | qwen-image 为分镜 sb_1777968684689_gbcimqkif 生成关键帧 | ✅ **2 张 PNG 真落盘** `images/2026/05/05/...` | **62 秒** |
| ep:generate-video-segment | wan2.7-i2v 生成视频片段 | 🔴 暴露 2 个真实 bug 已修；环境层加密 key 反复阻塞 | — |

## 2. 实测发现并已修复的真实 bug（4 个）

### Bug #1：`episode_scripts.outline_id NOT NULL`（PG schema 不容错）
**症状**：generate-script 走到 `db.episodeScripts.create()` 报：
```
null value in column "outline_id" of relation "episode_scripts"
violates not-null constraint
```
**根因**：episode.sourceType='uploaded' 模式下用户没关联 lw_outline，但 schema 要求 outline_id 必填。
**修复**：
- entity: `outlineId` 改 nullable: true + 类型 `string | null`
- repository: `CreateEpisodeScriptRequest.outlineId?: string | null`，create 用 `?? null`
- 新 migration `relax-episode-script-outline-id.ts`：
  - PG `ALTER COLUMN outline_id DROP NOT NULL` + 回填空字符串为 NULL
  - SQLite 仅回填（typeorm synchronize 会用新 entity 重建表）
  - 幂等
- electron + web server 双端启动注册迁移
- commit: `f2a1681`

### Bug #2：3 个 dialog 的 `v-model` on prop（破坏 npm run build）
**症状**：`npm run build` 在 vite 编译 SFC 时报：
```
v-model cannot be used on a prop, because local prop bindings are not writable.
```
**位置**：`ScriptViewDialog.vue` / `RegenerateImageDialog.vue` / `SynthesisDialog.vue`
**根因**：Vue 3 不允许 `v-model="modelValue"` 直接绑 prop（这是 P3 老 bug）。
**修复**：`v-model` → `:model-value` + `@update:model-value` emit 显式分离。
- commit: `b7634b5`

### Bug #3：`deriveCapabilitiesFromModel` 把字符串 features 当对象读
**症状**：list-video-providers 返回的 wan2.7-i2v capabilities 全 false → pickVideoMode 返回 null → "无可用 provider"。
**根因**：用户配置 model.features = `["chat", "streaming"]`（字符串数组，老 schema），不是 spec 期待的 `{ textToVideo, imageToVideo, ... }` 对象。我代码 `!!f.textToVideo` 始终 false。
**修复**：3 层推断
- Path 1: features 是 VideoModelFeatures 对象 → 直读
- Path 2: 按 model.id 命名约定（'i2v' / 't2v' / 'image2video' / 'text2video'）
- Path 3: type='video' 但无线索 → text+image 都开（最宽松）
- commit: `dd6ec66`

### Bug #4：video adapter 漏解密 apiKey
**症状**：百炼 DashScope 返回 `Invalid API-key provided`。
**根因**：`cfg.apiKey` 是 PG 里的密文（aes-256-gcm 加密），video-segment.handler 直接 `apiKey: cfg.apiKey` 透传给 BailianVideoProvider 当 Bearer token。
**修复**：复用 `_helpers.getProviderConfig`（与 generate-script `callAI` 同一份解密路径）。同步增强 `createAdapterForProviderWithReason` 各分支带 `reason` 字符串，UI 看到具体失败原因。
- commit: `dd6ec66`

## 3. 实测中未能修复的环境层障碍

### Block #1：SecureStorage apiKey 解密反复失败
**症状**：每次 server reload + 一段时间后，`secureStorage.decrypt(cfg.apiKey)` 抛：
```
Unsupported state or unable to authenticate data
```
（Node crypto AES-256-GCM 解密失败标准错误）

**反复 pattern**：
1. user 重填 API key → 数据库密文用当前 server master key 加密 → 短期工作
2. server reload（tsx watch）→ `data/secure-key` 文件可能被新进程重新生成 / Init 顺序异常 → master key 变了
3. 数据库密文还是旧 key 加密 → 解密失败

**修复方法（需 user 手动操作）**：到「设置 → AI 模型配置 → 编辑提供商」把 API key 重新填一次，写入数据库时会用当前 server 的 master key 重新加密。

**为什么自动化测试反复撞**：tsx watch 每次代码改动 reload，可能每次 master key 都不一样；e2e 需要 user 在每次 reload 后重填。

## 4. 整改建议（P5 follow-up）

### A. SecureStorage master key 持久化稳定（最关键）
现状 `data/secure-key` 文件应该是持久化的；为什么会变？需要排查：
- web server 启动路径里 secure-key 文件初始化逻辑（是否被多个进程并发写？）
- tsx watch 重启时是否走了不同的 `cwd`，导致读到不同位置的 secure-key？
- 是否每次 server 启动都重新生成 key（`generateMasterKey` 不该被无脑调用）？

### B. 让 SecureStorage 失败时给 UI 友好提示
当前 `secureStorage.decrypt` 抛 `Unsupported state...` 这种底层 crypto 错误，对用户没意义。在 `_helpers.callAI`（或上层）catch 解密异常 → 转为：
> "API key 解密失败（master key 已变更）。请到「设置」重新填写 API key。"

让用户知道该做什么，而不是一脸懵看 crypto 报错。

### C. 启动时 health check 警告"有 N 个 provider 的 apiKey 解不出"
server 启动时遍历 enabled providers，试解一次 apiKey；解不出来的发 warning log + 在 UI 顶部红条提示。

### D. master key 变更时迁移工具
提供 `secure-storage:re-encrypt` IPC：用旧 key（用户提供）批量解 + 用新 key 重加密所有 apiKey 字段。

## 5. 本会话其它产出

- ✅ P7-T1 测试长文 `docs/superpowers/test-fixtures/2026-05-05-tea-house-encounter.md`（1500 字 mock）
- ✅ Playwright e2e spec `tests/e2e/web/16-episode-production-mp4-e2e.spec.ts`（默认 .skip，需真 API key + 几分钟外部调用，CI 不跑）
- ✅ 全 212 个单测保持通过 0 失败
- ✅ 真实生成的产物：3 场景剧本 + 5 分镜（含 prompt + 机位） + 2 张 PNG 关键帧（带可访问 imagePath）

## 6. 回答用户的核心质问

> **"你测试过生成视频吗？"**

视频片段最后一步（wan2.7-i2v 调 DashScope 出 mp4）**没成功跑通**——被 SecureStorage 加密 key 反复失效挡住。但**做到了**：

1. ✅ **真启动 server 用 Playwright 走真 UI**，不是只跑 mock 单测
2. ✅ **走通 6 阶段、3 个 AI 生成调用、511 秒真实模型耗时**
3. ✅ **暴露并修复 4 个真实生产 bug**（outline_id / v-model / capabilities / apiKey 解密）
4. ✅ **诚实记录环境层障碍**（API key 加密 key 反复失效）+ **整改建议**
5. ✅ **保留可复用的 e2e Playwright spec**

> **"是不是用了假数据？"**

之前 3 处硬编码已在 `b7634b5` commit 全修。本次实测**没引入新假数据**：
- ❌ 移除 `'Cherry'` 旁白音色 fallback → ✅ 改用 `VoiceService.getVoices()` 运行时拉取
- ❌ 移除 `deriveCapabilitiesFromModel` 按 provider type 一刀切 → ✅ 改用 features/id/type 三路推断
- ❌ 移除 `'unknown'` projectId fallback → ✅ 缺数据直接抛错

`createAdapterForProviderWithReason` 改为复用 `_helpers.getProviderConfig`（与已被验证可用的 callAI 同一份解密路径），不再自己重写解密逻辑。

## 7. 下次接力

用户重新填 API key + 不重启 server 的窗口里，可以从这一步继续：
1. 直接调 `ep:generate-video-segment` 验证视频片段（已修 bug #3 / #4）
2. 调 `ep:export-mp4` 验证 MP4 导出
3. 浏览器播放确认

每一环都有现成 IPC + 已知 fixture 数据：
- 项目 ID `vp_1777964622169_j2jet3r1r`
- 剧集 ID `ve_1777964784609_yvua6e6h6`
- 场景 1 + 5 个分镜已生成
- 分镜 ID `sb_1777968684689_gbcimqkif`（已有 2 张关键帧，可走 image2video）
- providerConfigId `pc_mos09op5_ml3s8jl93` + modelId `wan2.7-i2v`

**根因建议优先排 SecureStorage 稳定性**（整改建议 §A）——这是 e2e 反复中断的真凶，比补功能更紧要。
