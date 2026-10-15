# Wave 0 · 单测基线失败清单（豁免基线）

> 采集时间：2026-10-13 ｜ 分支：`dev` @ `5665c068` ｜ 环境：node v24.12.0（nvm）
> 命令：`npm run test:unit`
> 结果：**89 文件失败 / 122 用例失败**（6591 通过 / 518 跳过，共 748 文件）

## 性质判定

失败集中在 `tests/unit/repositories/*.repository.spec.ts`（整目录约 40 个文件，但每个文件多数用例通过、仅挂 1–4 个），断言错误模式为 user_id 隔离相关（如 multi-tenant.spec 72 个中挂 2 个："A 创建的 dialog 在 B 的 find 里看不到"、"CharacterBinding 按 user_id 隔离"）。**判定：近期多租户改造（git 5c431275 一带）留下的陈旧断言债，非基础设施崩坏。** 修复本身建议另立任务，不阻塞本升级计划。

## 豁免规则（各任务 DoD 采用）

1. 任务分支上重跑 `npm run test:unit`，failed 文件数与用例数**均不得高于本基线**（89/122）；
2. 失败清单中**不得出现基线以外的新失败文件**；
3. 若某基线失败文件被本任务修改，该文件内失败数不得增加；
4. 本任务新增代码必须有**新增的绿色单测**覆盖（新增测试全绿是硬要求）；
5. 报告中附任务分支的 failed 数与基线对比。

## 失败文件清单（89 个）

tests/unit/core/database/{agent-task-memory,app,asset-category,workflow-definition}.repository.spec.ts、
tests/unit/core/packs/domain-learning/{dl-agent-bindings,dl-agent-deps}.spec.ts、
tests/unit/core/packs/longwriting/story-room/room-distiller.spec.ts、
tests/unit/core/platform/assets/{asset-service-category,asset-service-version}.spec.ts、
tests/unit/core/platform/episode-production/ep-agent-script-actions.spec.ts、
tests/unit/core/platform/services/kb-chapter-summary.service.spec.ts、
tests/unit/core/platform/workflow/{gossip-event-report,image-gen-transient-retry,long-form-writing,script-to-video-v3-flow,system-agent-tools,tool-call,tool.service,yt-dlp-manager}.spec.ts、
tests/unit/electron/ipc/info-source-handler.spec.ts、
tests/unit/episode-production/narrative/{storyboard-generate-single-cleanup,storyboard-update-visuals}.spec.ts、
tests/unit/episode-production/render/segment-video.service.spec.ts、
tests/unit/migrations/{create-info-sources,create-kb-brain-tables}.spec.ts、
tests/unit/packs/{app-pack,builtin-packs,dl-channel-consistency,pack.service,workflow-pack}.spec.ts、
tests/unit/renderer/{packs-registry,views/app-list,workflow-notify-popup}.spec.ts、
tests/unit/repositories/ 下 40 个 *.spec.ts（api-key/asset/datasource/dialog-agent-enabled/dialog/diary/email-account/graph-edge/image/info-source/kb-*/knowledge-base/lw-*/message/multi-tenant/oss-config/portrait-*/provider-config/role/search-engine-config/settings/translation/video/video-subsystem/voice/workflow-repositories）、
tests/unit/services/{aihub-integration,graph-store.service,kb-brain/brain-query,kb-resume-document,knowledge-base.service,voice-clone-job-scheduler,voice-clone.service}.spec.ts、
tests/unit/settings-keys.spec.ts、
tests/unit/shared/domain-learning-plan-draft.spec.ts、
tests/unit/web/webhook-trigger.spec.ts

（完整逐用例日志：/tmp/unit-baseline.log，仓库内不留存。）
