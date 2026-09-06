# 评审 #105 收尾：B 图像侧瞬时重试 + 画质档位真机验证（2026-09-06）

## 本轮改动（image-gen 瞬时重试补全 + 复用）
- 新增共享工具 `src/core/platform/workflow/nodes/retry-submit.ts`：
  - `sleepMs` / `isTransientSubmitError`（fetch/网络/连接/网关 5xx/超时特征）
  - `submitWithTransientRetry(submit, {label, logger, retryDelayMs?, maxAttempts?})`
    —— 仅对提交响应的瞬时失败内部重试一次（默认 3 秒间隔、最多 2 次尝试）；
    任务异步执行中的真实 failed 不在范围（调用方照常判错）。
- `ai-nodes.ts` image-gen：generateImage 提交包上 `submitWithTransientRetry`（label=图像，
  日志经 ctx.logger → node-log 镜像入执行日志）。
- `video-nodes.ts` video-gen：删除本地 sleepMs/isTransientVideoError，改用同一工具
  （label=视频），行为与 #105 视频侧原实现等价。

## 测试（TDD）
- 新增 `tests/unit/core/platform/workflow/image-gen-transient-retry.spec.ts` 6 例：
  首调成功不重试（回归）/ fetch failed 重试成功 / 网关 5xx 重试成功 /
  重试仍失败共两次调用 failed / 非瞬时失败（配置/模型类）不重试 /
  重试透传与首调一致的请求参数。fake timers 即时推进 3 秒等待，测试 14ms。
- 相关套件 23 例全绿；workflow+providers 全套仅 11 例失败——git stash 仅还原本
  轮两个文件后重跑结果逐项一致 → 系本分支既有失败（builtin-app-templates 模板计数、
  gossip、tool-call/tool.service、yt-dlp 网络类），与本轮改动无关。
- tsc 基线 518 持平（ai-nodes 两条既有错位于未改动区域：translate / 图片输出映射）。

## 重启 + DB 定义同步 + 真机 turbo 回归
- 重启 dev（pwsh-41，_dev_debug_v2j.log）；启动时 DB 已同步新 def：
  start 输入 22 项，含 videoQuality / h3Steps。
- 真机回归 wfrun_1788705601004_gyhf9wxxo：5s 单镜 + `videoQuality:'low', h3Steps:4`，
  全链路 succeeded（约 2 分钟）：
  - vidShot 节点 input 确认 quality:'low', steps:4 透传；耗时 50.7s（全质量档同 5s
    段实测约 5.5 分钟 → turbo/low 约 6× 提速）。
  - 网关原始片段 ffprobe：480x864 @ 24fps，5.2s → low 档确实生效。
  - 成片已存档 asset_1788705730398_e0avubjhp（脚本成片-2026-09-06），大纲/素材板同步存档。

## 后续待办
- 完整 300s 全片策略仍待用户定夺（当前建议 turbo/low + 分段，估算可大幅缩短）。
- 提交/推送（feat/workflow-engine 全套）等待用户明确指令。
