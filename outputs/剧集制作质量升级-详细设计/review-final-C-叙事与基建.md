# 最终对抗性审查 · 报告 C（叙事产品线 + 平台基建：T09/T10×3/T11）

> 审查员 C ｜ 只读 ｜ 2026-10-14
> 总评：五任务素养较高（T00 契约逐字段落地+编译期守卫；boot 顺序无双实例 split-brain；串行落库链化解写穿竞态；`?tab=` 白名单、ZIP entry 受控命名、cancel/retry 有越权防护）。**但 EP 四类埋点与重试分派存在系统性断裂（P1-1）**；取消为假取消、video 漏 fail、tts 查错表、gist 未贯通且与提示词自相矛盾、删除/移动缺串行门。测试面高于均值但重试分派全用自造 payload/fake 提交器，恰好掩盖 P1——对抗重点 7 的实证。

## P1-1（必修）`ep.keyframe` 重试全链路必败：payload 字段名三方不匹配

- 消费方 `gen-task-dispatchers.ts:129` 要 snake_case `session_id`+`storyboard_id`；主入口 `keyframe.handler.ts:498-504` 写 snake_case 但**没有 session_id**；精修 `refine-session.service.ts:393-400` 写 **camelCase**。抽屉对任意失败关键帧任务点重试 → 必抛错 → 新记录立即 failed；主入口任务即使字段对上也无精修会话——**主入口重试在当前设计下没有正确实现**。
- **修法**：payload 带 `entry` 判别（main→重跑主生成 core；refine→键名统一 snake_case）；解析做 camel/snake 兼容；补"真实 handler payload → 真实 submitter"契约测试（现有测试全用自造 payload 掩盖了缺陷）。

## P2（7 项）

- **P2-1** `ep.video` 埋点外层 catch 漏 fail（audio/keyframe/compose 都有 converge，唯独 video 没有）→ 异常时任务悬挂 running 到重启对账。
- **P2-2** keyframe/tts/compose 的"取消"是**假取消**（注册 `()=>true` 但全库无协作退出检查，配额照耗产物照写）；且精修路径 cancel 后 `registry.succeed` 未包 try 会抛错 → 候选已落盘却报失败。
- **P2-3** `ep.tts` 父级定位查错表（用 scene_scripts 的 id 查 episode_scripts，恒 null）→ 抽屉"跳转"永不出现。
- **P2-4** T09 gist 未贯通剧本生成输入（`narrationLinesToSourceText` 丢弃 gist），而 NARRATION_MODE_SPEC 明确指引模型参考"竖线后方画面要点"——提示词在指引寻找不存在的结构（task-09 §2.2 未实现）。
- **P2-5** 删除/移动无串行门（insert 有门，delete/move 读-算-写三段无事务无锁）→ 并发交错产生脏编号（AC3 并发场景破）。
- **P2-6** ZIP 素材收集对 `frameImage.filePath/url` 回退**无路径钳制**（resolveAssetPath 不防 `..`）→ Web 多租户下可自导 `url='../../../../etc/passwd'` → ZIP 打包下载取文件（安全：文件外送通道）。
- **P2-7** `ep.keyframe` 主入口无进度更新（create 后直到终态零 update，进度条恒 0）。

## P3（7 项）

1. project.getById 失败被吞 → 解说剧可被瞬时读失败静默降级为精品剧
2. 未注册 RetrySubmitter 时两实现行为漂移（InMemory 停 running / Persistent 立即 fail）
3. 缓存/DB 双读窗口（>2000 行 hydrate 外的任务 cancel/retry 静默失败）
4. 启动对账（无 ALS）的成功通知标读失败被吞 → 反打未读徽标
5. create 后首刷前崩溃丢登记（写穿固有代价）
6. 7 天清理仅启动执行；demo-start 生产可刷；内存回退分支丢 taskType 过滤
7. compose/keyframe/tts 终态把可读文案塞 resultRef 位；failed 记录可并发重复 retry

## 设计符合性

- task-09：AC1 基本（gist 未贯通=P2-4 部分）；AC2/AC3/AC5 达成；AC4 达成（coverage 双保险未绕过，S7 条款合规）；AC6 依声明。另 person 参数为死参数（仅打日志）。
- task-10a：AC1–3 达成。task-10b：AC1–5 达成（安全缺口 P2-6）。task-10c：AC1/AC2/AC4 达成；AC3 顺序达成、并发有洞（P2-5）。
- task-11：AC1 部分（P2-7）；AC2 部分（P1-1、P2-3）；AC3 部分（P2-2）；AC4 达成（例外 P3-4）；AC5/AC6/AC7 达成；AC8 依声明。**T00 固化语义逐条对齐全部核实 ✓**。

## 结论

**合并前必修：P1-1、P2-1、P2-3**（均小改动）；P2-2/P2-5 需设计层认账"取消语义"与"并发纪律"偏差后修；P2-6 为安全项必修。
