# EP-3 · 资产生成全链路一次实测（M6.5-c）

> 前置：EP-1、EP-2 均验收。**成本红线：考虑好再测，不反复；视频仅 1 次。**

## 测试链与断言拆分（评审 P1-7 修正）

9 动作全集**无台词/视频动作**（generate_*_asset 只生成图像）——断言分两段：
- **agent 动作链**（一次跑通）：generate_script → split_scenes → generate_char_asset（1 张角色图）
  - 断言：状态机走完、产物落库（图像资产表）、轨迹完整（含 compaction/装配留痕）、事件序列正确
- **手工面板步骤**（分开验证，不计 agent 链）：语音（最短文本）与视频生成走面板现有入口各 1 次，确认渲染/播放产物

## 模型与预算（用户指定）

| 用途 | 提供商/模型 | 预算 |
| --- | --- | --- |
| 文本 | tokenplan 便宜文本模型 | 干跑+全链共 ≤6 轮 |
| 图像 | tokenplan `wan2.7-image` 低分辨率 | ≤2 张 |
| 语音 | tokenplan `qwen-audio-3.0-tts-plus` ≤50 字 | 1 次 |
| 视频 | 「阿里百炼平台」`wan3.0-video` 最短时长最低分辨率 | **1 次**（先确认该提供商已配此模型，未配先加；参数档以实际 API 为准，干跑前查模板定义避免试错） |

## 流程

1. 测试前置检查单：模型清单确认、EP_TEST_BUDGET 压低、断言清单与产物检查脚本**先写好**
2. 一次执行 agent 动作链 → 断言 → 手工语音/视频各 1 次 → 断言
3. 失败处理：只登记证据（轨迹/日志/截图），修复后**单点重跑失败段**，不整链重跑
4. 产物：测试记录回填 35 号 §6，留轨迹 id 与产物截图

## 验收

全链路状态机走完 + 产物落库 + console/EP 面板可观测；成本对账 ≤ 预算表。

---

## 实测记录（2026-09-08）

**EP-1 干跑 ✅ 全链通过**（真模型 deepseek-v4-flash，tokenplan）：
- 第一轮：generate_script 失败（测试项目章节原文缺失——真实数据前置）→ agent 未调用依赖动作 → 如实汇报根因与两条出路
- 第二轮（用户提供章节底稿）：generate_script 超时 → **模型自主重试成功** → split_scenes ✓ → 完成汇报 ✅
- 落库验证：剧本（梗概 99 字/正文 1519 字）+ 3 场场景全部落库；消息持久化正常
- 修复（实测发现 P0）：lw_design_messages.conversation_id FK 缺父行——工具化会话首条消息必败
  （旧协议同病，从未在真实库测过）→ LwDesignMessageRepository.add 前置 ensureConversationRow；
  EP 宿主映射 longWritingProjectId 作会话归属（lw_design_conversations.project_id FK→lw_projects）

**资产链 ⚠️ 被外部配置阻塞**：generate_char_asset（林骁）→ 图像服务返回
`Invalid API-key provided`（tokenplan 图像密钥无效——用户侧配置问题）。agent 行为完全正确：
判定为外部配置问题不盲目重试、如实上报、给出修复后继续与先行分镜两个替代方案。

**待用户处理**：
1. tokenplan 图像/语音 API 密钥修复后，重发"为林骁生成定妆图"即可（agent 已承诺继续）
2. 「阿里百炼平台」提供商需添加 wan3.0-video 模型配置（当前模型清单无此项）
3. 语音（qwen-audio-tts）与视频实测在密钥/配置就绪后各执行 1 次（红线不变）
