# 领域共学空间 M6-A:骨架概念逐个出讲义 + 自动核验(2026-09-09)

分支 feat/domain-learning。目标:验证「空主题起步 → 骨架概念 → 逐个研究出讲义 → 自动核验」完整闭环
(对应 M2-F/M5 记录中「有 KB/可出网环境复验」的本地 KB legs)。

## 执行路径(真机,CDP)
- 目标空间:7e5fa676(「走查起步主题」,M5 起步研究产物:5 个骨架概念 + 领域根);此前 archived,恢复 active。
- 绑定本地知识库「人工智能资讯与报告」(21 篇本地文档,离线可检索)。
- 对 5 个概念逐个发 dl:agent-send mode=research(概念级,提示词含 KB 优先/证据纪律),
  每个约 3.5–4.5 分钟;save_card 后由 harness 自动异步触发内部核验(verify,只读交叉核对)。

## 结果(全部真机数据)
| 概念 | research | 讲义 | 核验 | issues |
|---|---|---|---|---|
| 认知走查 | extracted | draft | verified | 17 |
| 走查 | extracted | draft | verified | 20 |
| 检查(正式评审) | extracted | draft | verified | 21 |
| 走查流程与角色 | extracted | draft | verified | 20 |
| 走查产出:问题清单与修订跟踪 | extracted | draft | verified | 9 |

- 动作摘要均含 dl_save_card:ok(个别含 dl_save_concept 幂等更新);核验日志 5 行
  「核验完成 card=… status=verified issues=N」(N=逐条核对项数,全部 supported)。
- UI 复核:概念讲义渲染正常(定义/定位等区级内容,正文 2K+ 字符),「研究此概念」入口随
  卡存在而消失;截图 progress/_m6a_cards_lesson2.png。

## 如实说明(环境限制)
- 本机无外网(wf_web_extract/http_get 全部 Connect Timeout);讲义证据以「权威文献引用
  (URL/题名,如 nngroup cognitive walkthroughs)」落库——Agent 基于先验写出、未能在线核对正文,
  属于模型先验 + 引用权威出处的降级形态;本地 KB 检索有命中但主题与这些概念不匹配
  (命中多为 AI 资讯噪声,Agent 自述负分噪声后换词仍无可用资料)。
- 意义:离线验证了「绑定 KB → 研究 → 出卡(带证据结构) → 自动核验写回」管线全通;
  「KB 高质量命中出卡 + 逐条 supported 核验」的完整高质量形态仍需主题匹配的 KB/可出网环境复验。

## 变更
- 无代码改动(纯运行验证);本记录入库。

## 结论
M6-A 达成:5 个骨架概念全部产出讲义草稿并经自动核验(verified);验证记录已提交。剩余可选:
空间级笔记总览(M6-B 方向)或继续第 3 项(答疑智能任务化,目标已挂起待恢复)。
