# 2026-09-07 视频写作层技能化（Writer-Skills）P0-P2 进度

## 用户诉求
1. 60s 脚本“只是复述报告”，要像**新闻调查**：有态度、有观点、对负面事件适当质疑；
2. 不同体裁（新闻调查/产品介绍/科普…）分技能写脚本 → 工作流更通用；
3. 是否还需要角色提示词。

## P0（完成）
- 最小工作流 `start → pickSkill(code) → skill-call(skillId={{pickSkill.result.skillId}}) → end` 真机两跑：
  financial-deep→short-video-script ✅ / knowledge→deep-analysis ✅（引擎对节点 config resolveConfigDeep，**动态选技能无需改引擎**）。
- 临时定义与运行已清理。

## P1（完成）
- 设计文档：`tasks/2026-09-07-script-to-video-writer-skills/design.md`
  （体裁写作技能=角色 persona 内嵌 + 文体法则 + 质疑纪律 + few-shot + 输出契约；videoType→技能映射；
   写作层替换方案 writerPick→writerCall→writerMd→outlineReview；态度档/角度输入；阶段拆分 M1/M2/M3）。

## P2 落地（代码完成）
1. `builtin-skills.ts` +2 内置技能：
   - `video-writer-standard`（通用标准，行为≈旧大纲；兜底）
   - `video-writer-investigative`（新闻调查·财经：角色=调查记者；三组质疑方向；态度档 冷静调查/犀利质疑/共情叙事；
     口径零括注纪律；输出契约含“质疑与观点依据”审核清单；分镜纪律=一镜一事件一场景、60s≈8~10 镜）
2. `script-to-video-v3.json` 写作层改造：
   - 删 outlineGen/outlineMd；插 writerPick(code 映射)/writerCall(skill-call 动态 skillId)/writerMd(code 规整)；
   - start + writerSkill（auto/显式技能）/writerAttitude（态度档）/writerAngle（自由角度）；
   - outlineReview.payload.md = {{writerMd.result.md}}；下游 shotsGen/素材板/逐镜/合成不变（36 节点/40 边）；
   - shotsGen/shotPack 提示词追加“分镜原子纪律 / 单场景纪律”（一镜一事件一场景，禁“先…随后切…”拼接）。
3. 测试：`script-to-video-v3-graph.spec.ts` 适配（36/40、写作层接线、start 新输入、matBase 断言修正）；
   `skill.service.spec.ts` +写作技能断言；相关 35 用例全绿（builtin-app-templates 2 例为基线既有失败，与本次无关）。
4. 重启 dev 同步内置定义与技能（boot UPDATE 幂等），CDP 核对 8 技能/定义含 writer 节点/提示词纪律在册。

## 真机验收（星宇 60s · 犀利质疑档）进行中
- 运行：wfrun_1788754110723_vrzviisq3（前两轮因大纲段落过长/同镜多场景取消并迭代纪律）
- 大纲（调查体）：8 分句零括注；钩子反差反问 → 两组可归因质疑（36 亿现金 vs 应届生；致歉否认断崖 vs 股价腰斩）
  → 金句观点（道歉是止损的姿态，调查结论与订单走向才是答案）→ IPO 落点 → 两难互动；
  标题《刚拿最佳雇主就清退应届生？星宇股份的道歉值几分？》
- 素材板：8 镜全部 imagery 单场景可执行（奖杯/产线/政务文件/报表/交易大厅/车间灯束/窗边剪影/夜景人群），时长合计 60s
- 视频段：逐镜代批进行中，待终态与 ffprobe 校验后补结论。

## 真机结果（补，2026-09-07 12:23）
- 运行 wfrun_1788754110723_vrzviisq3 → **succeeded**（10 分钟级：8 镜 turbo/low）
- 成片：C:\Users\daoge\the-bot\videos\脚本成片_mtqqj1hm.mp4 → **60.000s / 480×864@24fps / ≈9.9MB**
  （资产 asset_1788754986836_fn92kxrvj 脚本成片-2026-09-07；大纲 asset_1788754986849_aaqcvtcno；素材板 asset_1788754986857_552b2lyz5）
- 校验：TTS 口播 275 字 / 8 分句 / **零括注**；素材板 8 镜全单场景意象、时长合计 60s。
- 对比（同素材 60s）：
  - 旧（复述体）：编年史平铺、中性标题、无观点句；
  - 新（video-writer-investigative · 犀利质疑）：标题即设问；钩子反差反问 → 事实链 → 两组可归因质疑（36 亿现金 vs 应届生；致歉否认断崖 vs 股价腰斩）→ 金句观点 → IPO 落点 → 两难互动；质疑均能指回素材，口径仅进分段/字幕。

## 备注
- 全程未提交/推送；progress/_* 为临时脚本不入库。
