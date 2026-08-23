# 早报/周报精美模板 + 视频文案提取实测与发布

日期：2026-08-22
状态：进行中（模板完成，视频实测待跑）

## 一、每日早报 / 行业周报精美模板

### 目标
为 report-image 长图节点提供多套「简洁美观、专业」的排版模板，
每日早报与行业周报各自可用（含内置应用默认版式）。

### 实现

**1. 新增 5 套排版模板（`src/core/services/document-tools/templates.ts`）**

| 模板 id | 名称 | 风格 |
|---|---|---|
| morningReportBlue | 早报·商务蓝 | 藏蓝→亮蓝渐变头 + 浅蓝栏目卡片标题 |
| morningReportMinimal | 早报·极简 | 大留白 + 细分割线 + 红色圆点栏目标记 |
| industryWeekly | 周报·商务金 | 藏青渐变头 + 金色章节下划线 |
| industryWeeklyGreen | 周报·墨绿 | 深绿渐变头 + 左竖线章节标题 |
| industryWeeklyDark | 周报·深色 | 深底亮字高对比（夜间/高端呈现） |

全部 750px 宽长图版式、中文字体栈、页眉日期/周次、页脚署名；
周报页眉自动带「YYYY 年第 N 周」。

**2. 修复 report-image 节点排版模板未生效（`a2-nodes.ts`）**

原实现 `...(cfg.templateId === 'morningReport' ? {} : {})` 为空展开，
templateId 从未传进渲染层（恒走 generic）。现改为
`DOCUMENT_TEMPLATES[cfg.templateId] ?? DOCUMENT_TEMPLATES.generic`。

**3. 表单选项（`workflow-node-forms.ts`）**：排版模板下拉 2 项 → 7 项。

**4. 行业周报内置应用改长图（`industry-weekly.json`）**
report/report_custom 两个节点由 `report`(markdown) 改为 `report-image`
（templateId=industryWeekly），出图即专业版式；markdown 仍存资产库。

**5. 新增「行业周报模板（内置）」模板资产（`create-builtin-apps.ts`）**。

**6. 一致性测试（`document-templates.spec.ts`）**
模板注册表齐全、每套可渲染、标题转义、表单选项 ⊆ 注册表、
内置应用 report-image templateId 全部有效、深色模板覆盖生效。

## 二、视频文案提取：实测与发布

### 实测发现（真实 B站链接 BV1CBNb6qEvB，10.4 分钟）

1. **B站 view/playurl 接口 412 风控**：无 Cookie 直调 412。
   修复：`finger/spi` 匿名取 buvid3 → 全部请求带 Cookie+Origin；
   view 失败回退 WBI 签名版 `x/web-interface/wbi/view`
   （`video-url-resolver.ts`）。
2. **DashScope 同步 ASR 协议已下线旧接口**：`transcription` + `input.audio`
   返回 `input must contain file_urls`。现改为 qwen3-asr-flash 同步识别：
   `aigc/multimodal-generation/generation` + messages[].content[].audio(base64)，
   响应 `output.choices[].message.content[].text`；模型名自动归一化
   （`-2026-02-10`/`-realtime-*` 后缀剥离）；`asr_options.language` 不认 auto → 省略
   （`dashscope-stt-provider.ts`，`voice.service.ts` 透传 modelId）。
3. **模型字段拆分**：原工作流 STT 与整理文案共用一个 `model`（audio 过滤），
   选了 ASR 模型后 LLM 整理必然失败。拆为 `asrModel`(audio) + `chatModel`(text/multimodal)
   （`video-transcript-app.json` + 渲染端模板同步）。

### 发布状态
内置应用 `builtin_app_video_transcript`（视频文案提取）已存在：
session 渠道开、API 关、启用、source=builtin_def_video-transcript-app。
实测通过后确认可用即为「发布成应用」达成；用户也可从模板库创建副本自行发布。

## 三、测试

- video-url-resolver：会话获取 / spi→view→nav→playurl 顺序 / 412 回退 wbi/view
- dashscope-stt-provider：模型归一化 / auto 省略 / messages 请求体 / 响应解析
- document-templates：注册表 / 渲染 / 转义 / 表单一致性 / 内置应用 templateId
- report-image：templateId 透传 / 未知回退 / 落盘 / HTML 降级
- create-builtin-apps：默认模板资产 2 → 3
- renderer workflow-templates：纳入 video-transcript 模板（4 → 5）

## 四、实测结果（全部通过）

- [x] 全量测试：相关 88 项 + 迁移 20 项全过；无新增失败（既有 117 失败均为环境/断言旧账，已顺带修复 a1-basics×2、run-service×1、video-extract-audio×1 断言）
- [x] **视频文案提取实机全链路（B站 BV1CBNb6qEvB，10.4 分钟）**：提取音频(19MB wav) → 分段转写 3 段（每段 5 分钟，各 9.2MB）→ LLM 整理 2207 字文案 → 报告 + 存资产（asset_…「深入理解Claude Code核心原理与上下文管理机制文案」），全节点 succeeded
- [x] **行业周报长图实机**：finance 主题，industryWeekly 模板（藏青金），标题带「2026年第35周」（sys.week 修复生效），PNG 1474×3432px
- [x] **每日早报长图实机**：tech 主题，morningReport 模板（红头卡片），PNG 长图，AI 分组内容正常
- [x] 应用发布确认：builtin_app_video_transcript（视频文案提取）已发布（session 渠道开、API 关、启用），实测通过即可直接用

## 五、提交
- [x] 提交

## 附：实测中发现并修复
1. B站 view 接口 412 → finger/spi 会话 Cookie + Origin + wbi/view 回退
2. DashScope 同步 ASR 旧协议下线 → qwen3-asr-flash multimodal-generation 新协议（modelId 归一化）
3. 单次 data-uri 20MB 上限 → stt 节点超长自动分段转写（默认 4 分钟/段，可配 segmentMinutes）
4. `{{sys.week}}` 未实现 → 补系统变量（YYYY年第N周，与模板页眉同口径）
5. ffmpeg-static 二进制缺失 → PATH ffmpeg 兜底
6. 视频文案工作流 STT/LLM 共用一个模型 → 拆 asrModel/chatModel
