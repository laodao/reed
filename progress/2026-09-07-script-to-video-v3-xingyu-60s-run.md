# 2026-09-07 V3「短视频脚本生成视频」星宇 60s 真实运行记录

## 用户指令
- 用「星宇股份吃瓜报告-2026-09-04」文案执行 V3 生成视频工作流，**60 秒**；
- 用户强调：**每个镜头的提示词要设计与脚本匹配的空镜 / B-roll / 资料画面、意象/象征蒙太奇**；
- 用户确认：文案 = 吃瓜报告长文（asset_1788530563090_xcovls55z，改写为 60s 口播）；画质 = 快速 low（480×864，turbo）。

## 输入与运行
- 新文案资产：`asset_1788748964546_ku0c58byl`「星宇股份短视频脚本-60s-2026-09-04-V3（吃瓜报告改写）」
  （口播正文 272 字 ≈60~62s；全文草稿 progress/_v3_60s_script_asset.md）
- 定义：`builtin_def_script-to-video-v3`；videoType=financial-deep；visualStrategy=auto → **imagery（意象化空镜）**
- 画幅 704×1248（出片 low=480×864）；videoQuality=low / h3Steps=4；文生图 krea2、图生视频 h3（ComfyUI 192.168.2.128:8190）、配音 cosyvoice、拆镜 LLM 火山 ep-20260225205702-vh6zc
- 运行：**wfrun_1788749173291_2pav3ub7n** → succeeded（10:47 启动，11:01 终态，全程约 14 分钟含首轮废弃）

## 关键处理
1. **首轮运行废弃**（wfrun_1788748964611_hlw0t58o1）：outlineGen 把「官方通报/当事人自述/媒体报道/年报数据」口径括注写进口播正文（会被 TTS 念出，如"常州官方通报『官方通报』"）→ 取消重跑。
2. 修正路径：engine 大纲环节支持 `approve_with_changes + editedValues.md`（ReviewDecisionInput 浅覆盖 payload 顶层字段）→ 注入净化版大纲
   （progress/_v3_60s_outline_clean.md：口播正文唯一、| 分句、口径只进字幕 caption），shotsGen 以 {{outlineReview.md}} 为唯一大纲源，TTS 口播最终 273 字、**0 括注**（已核）。
3. 素材板（第二道闸，10 镜全部 imagery/generated）逐镜意象审核通过：
   - 镜1 车灯工厂产线（440入职）｜镜2 空工位+机械臂+对坐剪影（二选一压力）｜镜3 政务会议桌文件光影（官方通报）
   - 镜4 新车下线车灯光束（奔驰/大众调查）｜镜5 发布会讲台话筒剪影（三度致歉）｜镜6 交易大厅曲线屏+计算器光影（36亿现金/股价腰斩）
   - 镜7 黄昏窗边年轻背影望校园（应届生身份）｜镜8 城市夜景手机光斑星河（信任透支）｜镜9 阴云车灯工厂航拍（调查继续）
   - 镜10 街头行人手机（评论区引导）；时长 6+7+6+6+6+7+6+6+6+4 = **60s**；全部画面无文字、深蓝鎏金、固定机位缓慢运镜
4. 逐镜审核由 Agent 代批（用户既有授权）；全部 human-review 决策留痕 run.nodeRuns。

## 产物
| 产物 | 资产 id | 说明 |
|---|---|---|
| 成片 | asset_1788750106940_d96g9q6rm | 脚本成片-2026-09-07 → C:\Users\daoge\the-bot\videos\脚本成片_mtqnmfnw.mp4 |
| 大纲 | asset_1788750106946_bgaxkr5z3 | 视频大纲-2026-09-07（净化版） |
| 素材板 | asset_1788750106951_pvuu4ign3 | 素材板-2026-09-07（10 镜意象卡片） |

## 成片校验（ffprobe）
- duration=60.000s；480×864@24fps；h264+aac；≈11.6MB（turbo/low，用户指定快速档）

## 备注
- 画质档位 low（480×864）为快速验证选择；如需高清 high（704×1248 全质量，steps20）可同文案重跑，预计 40~90 分钟。
- 复查材料：progress/_v3_60s_imagery_plan.md（逐镜意象设计清单）、_v3_60s_board.json（素材板快照）、_v3_60s_final.json（终态 nodeRuns）、_v3_60s_outline_clean.md。
