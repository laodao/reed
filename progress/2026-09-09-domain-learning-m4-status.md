# 领域共学空间 M4 状态总览(2026-09-09 连续轮次执行)

分支 feat/domain-learning。M4 范围 = 架构合规整改(M4-A) + 知识库关联三重源(M4-B) + 用户 UX 8 条(M4-UX) + 收口(M4-C)。

## 已完成并提交(近期)
- M4-A P1-2 平台 registry 工具名别名 + dl 回归 packId(`480ec6a8`,agent-runtime 244+system-agent20+dl77 全绿)
- M4-A P1-5 平台通知(`07692e74` dl:card-ready/research-failed/review-due)
- M4-A P1-6 首步 导出工具抽离(`c9c70159` atlas-export.ts)
- M4-A P2 契约补齐 stats(`34b32866`)、常量单源(`0f25f02f`)、P2-3 store 封装(`da019f01`)、P2-8 日志(`d79b50d7` 等)
- M4-B 后端+UI(`d10552b3`/`c5613de0`;宿主快照 KB id 注入、wf_kb_retrieve knowledgeBaseId 指引、evidence kbDocId)
- M4-UX1(数据/后端/UI)、UX2(verification 数据+verify 会话)、UX3(LessonSlides)、UX4(首批文案)

## 早期 M4-A 已闭环
P1-1(属主校验服务化)、P1-3(聚合收敛 aggregation.rules)、P1-4(通道护栏 spec)、P2-1/2/3/4/6/8 多数。

## 仍待办(如实)
1. M4-A P1-6 完整拆分:把 DomainAtlas「空间设置」弹层内容(画像/自动推进/间隔复习/关联知识库 4 组 + 到期列表操作)独立成 `views/domain-learning/SpaceSettingsPanel.vue`(props:spaceId;内部 store/负载/节流),DomainAtlas 仅留占位引用;DomainLearningSpace 后续亦可拆(记录)。
2. 少量 P2:导出改走系统 utils/file-saver(现状用 anchor 下载可工作,差异记录)、讲义 KB 出处展示小项、N+1 批量取卡(记录边界)、部分魔法串收尾。
3. M4-C 收口:重启 dev:debug(新 preload/主进程)后真机走查——选区浮层提问/笔记、答疑收藏、气泡不溢出/面板宽度、幻灯片、空间设置(画像/自动推进/复习/KB)、铃铛通知(dl:card-ready/review-due)、自动核验日志、离线 KB(本地 KB addDocument→绑定→研究 KB 命中证据回链,若本地 KB 可用);随后汇总记录并 push(待用户指令)。
4. 已知环境限制:M2-F 记录联网出卡 legs 仍需可出网环境复验。

## 回归基线
dl 全套 + 护栏 ~57+、agent-runtime 244、system-agent 20、graph/view/rules 等全绿;tsc/vue-tsc 相关零新增。
