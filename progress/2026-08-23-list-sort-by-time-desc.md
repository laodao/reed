# 全局列表排序统一为「时间降序」

日期：2026-08-23
状态：完成（实测通过，已提交）

## 需求

所有列表排序都应该按时间降序排序（最新在前）。

## 改动

### Repository 排序统一（时间降序主序）

| 文件 | 改动 |
|---|---|
| app.repository.listApp | is_builtin 置顶 → `created_at DESC` 主序 + id 稳定次级 |
| asset.repository.listAsset | is_builtin 主序 → `created_at DESC` 主序 + is_builtin/id 稳定次级 |
| workflow-definition.repository.list | 内置靠前 → `updated_at DESC` 主序 + id 稳定次级 |
| news-source.repository.list | 组内 `created_at ASC` → `DESC`（保留主题/内置/sort_order 业务分组） |
| role.repository.getAll | 内置优先保留，组内 `created_at ASC` → `DESC` |
| kb-qa-pair.repository | `created_at ASC` → `DESC` |
| provider-config / search-engine-config | 默认项优先保留，次级 `created_at ASC` → `DESC` |

保留业务/结构化排序（不改）：消息流（对话升序语义）、diary-folder 手动 sort_order、
lw 系列章节/情节/记忆/大纲、配置项 sort_order/is_default 分组、portrait angle、向量 KNN。

### 内置应用发布时间戳（create-builtin-apps.ts）

内置应用同批插入导致 created_at 相同、时间降序无意义。改为按**发布顺序错开**：
- 固定发布基准 `2026-08-01T00:00:00Z` + index×1s（幂等，不随启动刷新）
- 最新发布的内置（视频文案提取）时间最大 → 时间降序下排内置组最前
- 用户应用（真实创建时间晚于基准）在前，内置按发布顺序在后

**过程发现并修复**：初版用「当前时间-偏移」导致每次启动刷新内置时间戳、内置永远顶到最前；
改为固定基准后，时间降序 = 用户应用在前 + 内置按发布序在后，视频文案提取仍首页可见（第 9/16 位）。

## 测试

- app.repository.spec 重写（4 项：用户按创建降序 / 内置按发布序降序 / 混合整体降序 / 视频文案首页可见 + 全局非递增校验）
- workflow-definition.repository.spec 新增（2 项：用户按更新降序 / 内置不靠前按时间降序）
- assets-sub-category.spec 增补（listAsset 按创建时间降序）
- 相关回归 128/128 通过；受迁移影响的 migrations/app/services 区域 154/155（唯一失败为既有 app-definition sourceId 断言）

## 实测（CDP）

应用列表 16 个，整体时间降序校验 true：
1-8 用户应用（语音复刻→客服工单提交，创建时间降序）
9-16 内置应用（视频文案提取→每日热点早报，按发布顺序，最新发布的在前）
视频文案提取 = 第 9/16 位，首页 12 容量内可见。UI 第 1 页确认一致。
