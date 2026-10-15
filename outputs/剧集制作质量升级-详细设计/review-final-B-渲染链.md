# 最终对抗性审查 · 报告 B（渲染链：T07 + V2 + T08 交叉集成）

> 审查员 B ｜ 只读 ｜ 2026-10-14
> 总评：三大项**各自内部**质量较高（T07 隔离红线有真实单测、V2 修复正确、T08 写回链路成败两路全覆盖）；**交叉集成是重灾区**。

## P1-1（必修）T08 合入后精修通道未同步构图槽——候选与正式链路 prompt 分叉

- `refine-session.service.ts:412-439` buildKeyframePrompt 无 compositionDescription/hasCompositionReference；`:983-1073` collectReferenceImages 不含 backgroundRefImageId；正式通道（keyframe-generation.service.ts:1285-1395）三者全有。
- 触发：已导出控制图/已存摆位的分镜开精修 → 候选 prompt 无控制图无构图描述 → 写回候选与导演台摆位矛盾；写回产物无 compositionSlot 元数据，污染 T08 §7 的 A/B 样本。
- 该文件头自声明"改动正式链路须同步本文件"——T08-3 违反；精修 spec 无"与正式 prompt 同构"回归，是缺陷溜过的机制。
- **修法**：把 loadCompositionSlot/loadCompositionContext（含 selector 排除 context）提取为共享 helper，refine generate 复用。

## P1-2（必修）构图描述与 billboard 控制图同几何不同判——主舞台区（y<0）180° 反相

- `director-composition-prompt.ts:108-116` facingOf 用全局机位 yaw；`director-view-hints.ts:43-54` relativeFacingDeg 用逐实体方位角 `atan2(-x,y)`。主舞台区（背景卡 z=−10 同侧）实体 (0,−3) rot=180：billboard 判 front（控制图面向镜头），facingOf 判"背对镜头"——**文字通道与控制图互相矛盾**（AC3 破）。horizontalOf 裸 x 符号不随 yaw 旋转：yaw=180 左右镜像、yaw=±90 完全失配。
- 两份 spec 各自把矛盾语义固化成绿灯（composition-prompt.spec:148-155 与 view-hints.spec:47-50 互斥且都绿）。
- **修法**：facingOf/horizontalOf 统一用 director-view-hints 的逐实体方位角口径（cameraAzimuthOf 下沉共享纯模块），加跨文件一致性测试。

## P2（4 项）

- **P2-1** 单参考预算模型（flux-kontext/wan 系等 maxRefs==1）下构图槽被截断器**静默丢弃**，但引导语仍声称"参考图中包含一张导演控制图"（模型被指示参考不存在的图）；compositionSlot 无 effective 标记，A/B 无法区分已喂/被丢。修：仿 K2 截断后回查存活再定引导语 + effective 标记。
- **P2-2** T07/T08 全通道对 storyboards **零租户校验**（refine open/write-back、getCameraMeta/saveCameraMeta、export-control-image 均裸 findOne）：A 用户可读 B 的创作内容并向 B 的项目写行。storyboards 有 user_id 列且仓内有同类判例。修：入口补 "me OR user_id IS NULL" 可见性检查。
- **P2-3** setCamera 双写击穿 AC6：分镜模式调机位写进地点 blocking.cameraDefaults → 保存摆位/导出持久化 → 同地点其他分镜继承本镜头取景。修：分镜模式只写 cameraMeta。
- **P2-4** saveCameraMeta 的 merge 被 sanitize 膨胀成全键覆写：只传 `{assistComposition:true}` 即永久钉死四个默认机位值。修：仅对 patch 实际出现的键覆写。

## P3（14 项，择机）

1. 景别 maxRatio 含 item/placeholder（0.5m 道具近处→整镜误判特写；应角色优先）
2. refine writeBack 非事务（失败残留孤儿 image_assets 正式行）
3. 单帧重生成后哨兵悬空（旧 imageId 被回收，仅审计不实）
4. 整批重生成覆盖哨兵（溯源标记被抹，至少 notes 披露）
5. save-blocking"共享行存在时新建自己行"与唯一索引矛盾；测试依赖 synchronize:true 掩盖（schema 不一致）
6. startup-recovery refine/compose 清扫共用 try 块（实际风险低）；与 T11 对账无冲突
7. `ep:refine:cleanup` 无租户隔离且 maxAgeMs 无下限（=1 可清空所有租户会话）
8. 拼板路径 boardNote 单图假设（[board, 控制图] 两张仍称"一张参考板"）
9. compositionSlot.source 硬编码（全景快照旧通道写入会错标 A/B 归因）
10. exportControlImage 部分失败无补偿清理
11. 机器校验比对集不含控制图（质感复刻风险不在 runKeyframeMachineChecks 内）
12. refine pickStyle 不接 styleName（无模板项目非缺省风格两通道分叉，当前 UI 未传属潜伏）
13. 写回确认未复用 AssetWriteImpactDialog（语义等价偏离，与 T07 报告一致）
14. refine upload / director export 的 base64 无大小上限

## 设计符合性

- T07：AC1–AC8 全 ✓（AC4 组件复用偏离=P3-13）；**附加红线"同一 prompt 组装通道"在 T08 后不再成立 → P1-1**
- T08：AC1/2/4/5 ✓；AC3 部分（P1-2 + P2-1）；AC6 **破**（P2-3/P2-4）；AC7 按许可降级；AC8 未复跑
- V2 修复：✓ 无残留

## 结论

渲染链**必须再修一轮**（2×P1 + 4×P2）才能兑现 A/B 度量与 AC3/AC6；P2-2 是多租户越权，安全级。
