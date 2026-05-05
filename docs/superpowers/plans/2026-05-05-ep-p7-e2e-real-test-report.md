# P7 真实 e2e 测试报告（Playwright 驱动浏览器）

| 项 | 值 |
|---|---|
| 日期 | 2026-05-05 |
| 测试方式 | Playwright MCP 直接驱动 Chromium 走 web 端 UI |
| 测试目标 | 登录 → ① 内容 → ② 资产 → ③ 剧本 → ④ 分镜 → ⑤ 制作 → ⑥ 合成 出真实 MP4 |
| **实际达成** | ✅ 走到生成剧本 IPC 之前所有环节；❌ 被环境层加密 key 不匹配挡住，未出 MP4 |
| 真实测试时长 | ~45 分钟 |

## 1. 已成功验证的环节

| 阶段 | 操作 | 验证结果 |
|---|---|---|
| 登录 | test@local.dev / test123456 | ✅ HTTP 200，进入剧集制作页 |
| 创建项目 | "e2e-茶馆相遇" + 1080p / 16:9 / 30fps / 淡入淡出 | ✅ `vp_1777964622169_j2jet3r1r` 创建成功 |
| 创建剧集 | 第 1 集"茶馆相遇" + uploaded 模式 + 粘 1500 字长文 | ✅ ID `ve_1777964784609_yvua6e6h6` 创建成功 |
| AI 识别要素 | 三角色（少年/老者/师父）自动识别 | ✅ uploadedCharacters 写入 |
| 配 5 个模型 | 剧本/分镜/画面/视频/音频 各选一个 bailian model | ✅ project.config 保存 |
| 调 ep:generate-script | 通过 UI 触发 + 直接 IPC fetch | ❌ 暴露 2 个真实 bug，已修 |

## 2. 实测发现并已修复的真实 bug

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
**位置**：
- `ScriptViewDialog.vue`
- `RegenerateImageDialog.vue`
- `SynthesisDialog.vue`
**根因**：Vue 3 不允许 `v-model="modelValue"` 直接绑 prop（这是 P3 老 bug）。
**修复**：`v-model` → `:model-value` + `@update:model-value` emit 显式分离。
- commit: `b7634b5`

## 3. 实测中未能修复的环境层障碍

### Block #1：SecureStorage apiKey 解密失败
**症状**：`ep:generate-script` 走到 `_helpers.callAI` 解 provider config 的 apiKey 时报：
```
Unsupported state or unable to authenticate data
```
（Node crypto AES-256-GCM 解密失败的标准消息）
**根因（推断）**：用户配置 API key 时所用的 SecureStorage master key（在 `data/secure-key`）已被某次 server 重启换掉，数据库里存的 apiKey 密文用旧 key 加密，新 server 的 master key 解不出来。

**修复方法（需用户操作）**：到「设置 → AI 模型配置 → 编辑提供商」把 API key 重新填一次，写入数据库时会用当前 server 的 master key 重新加密。

**为什么我自己解决不了**：我没有真实的百炼 API key 来重填。

## 4. 整改建议（P5 follow-up）

### A. 让 SecureStorage 失败时给 UI 友好提示
当前 `secureStorage.decrypt` 抛 `Unsupported state...` 这种底层 crypto 错误，对用户没意义。在 `_helpers.callAI`（或上层）catch 解密异常 → 转为：
> "API key 解密失败（master key 已变更）。请到「设置」重新填写 API key。"

让用户知道该做什么，而不是一脸懵看 crypto 报错。

### B. 启动时 health check 警告"有 N 个 provider 的 apiKey 解不出"
server 启动时遍历 enabled providers，试解一次 apiKey；解不出来的发 warning log + 在 UI 顶部红条提示。

### C. master key 变更时迁移工具
提供 `secure-storage:re-encrypt` IPC：用旧 key（用户提供）批量解 + 用新 key 重加密所有 apiKey 字段。

## 5. 本会话其它产出

- ✅ P7-T1 测试长文 `docs/superpowers/test-fixtures/2026-05-05-tea-house-encounter.md`（1500 字 mock）
- ✅ Playwright e2e spec `tests/e2e/web/16-episode-production-mp4-e2e.spec.ts`（默认 .skip，需真 API key + 几分钟外部调用，CI 不跑）
- ✅ 全 212 个单测保持通过 0 失败

## 6. 回答用户的核心质问

> **"你测试过生成视频吗？"**

**没有，本会话也没走到那一步**——被 SecureStorage 加密 key 挡在了"调 AI 生成剧本"这一步前。但**我做到了**：

1. ✅ **真启动 server 用 Playwright 走真 UI**——不是只跑 mock 单测
2. ✅ **走通了登录 / 创建项目 / 创建剧集 / 上传长文 / AI 识别要素 / 配 5 个模型** 6 个真环节
3. ✅ **暴露并修复了 2 个真实生产 bug**（outline_id NOT NULL + 3 个 v-model on prop）
4. ✅ **诚实记录了未能解决的环境层障碍**（API key 加密 key 不匹配）
5. ✅ **保留了可复用的 e2e Playwright spec**

> **"是不是用了假数据？"**

之前发现的 3 处硬编码已在 `b7634b5` commit 全修。本次实测**没引入新假数据**：所有 fix 都是去掉硬编码 / 改用真实数据查找路径。

## 7. 下次接力

用户重新填 API key 后，可以从这一步继续：
1. 直接调 `ep:generate-script` 验证剧本生成
2. 调 `ep:generate-keyframes` 验证关键帧链生成
3. 调 `ep:generate-video-segment` 验证视频片段
4. 调 `ep:export-mp4` 验证 MP4 导出
5. 浏览器播放确认

每一环都有现成 IPC + 已知 fixture 数据可用，无需重头来过。
