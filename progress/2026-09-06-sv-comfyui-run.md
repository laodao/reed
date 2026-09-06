# 2026-09-06 script-to-video 真实运行（星宇股份 · ComfyUI）

## 用户指令
- 用「星宇股份短视频脚本-2026-09-04」资产的文案，跑一次「短视频脚本生成视频」内置工作流，视频/图像走局域网 ComfyUI 生成网关（免费）。
- 中间需要确认的环节（逐镜头 human-review）由 Agent 代为批准。

## 选用资产
- 同名资产共 5 份（历史重复），用户选择 **#0 = asset_1788530561207_1cacdwcwa**（最新 2026-09-04 14:02Z，约 300 秒完整版，分镜表 30 镜）。
- 全文存 `progress/_sv_asset_0.md`。

## 运行配置
- 运行 ID：`wfrun_1788691576563_nobamuqv9`（定义 builtin_def_script-to-video，templateVersion=1，含逐镜头 review1 → approve → vid1）
- 文生图：ComfyUI `pc_mtpifm8s_6673t2qzg` / krea2（无参考图）
- 图生视频：ComfyUI 同配置 / h3（MiniMax-H3，high、steps20、frames=秒×24+1，全质量 3~6 分钟/镜）
- 配音：百炼 cosyvoice（voiceId cosyvoice-v3.5-plus-vd-dsn-71398add049048a5b443da80d010b30d）
- 拆解 LLM：火山 ep-20260225205702-vh6zc
- 画幅 704x1248 竖版；风格「严肃财经纪实风（深蓝+鎏金、演播室/工厂/发布会实景、缓慢推近/横移、画面无文字）」
- 输入快照：`progress/_sv_start_inputs.json`

## 守护
- `progress/_sv_watch.js`（后台 job pwsh-20）：轮询 getRun + 对挂起 review1 自动 approve；日志 `progress/_sv_watch.log`；终态快照 `progress/_sv_run_final.json`。
- 说明：parse1 拆分镜头上限 20（工作流提示词定死），脚本分镜 30 镜会被 LLM 合并取舍。
