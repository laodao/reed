# episode-production

剧集制作模块。详见 `docs/superpowers/specs/2026-05-02-episode-production-pipeline-design.md`。

子域：
- assets/   资产域（角色/地点/物品/语音）
- narrative/ 叙事域（剧本/分镜）
- render/   渲染域（关键帧/视频/音频）
- compose/  合成域（时间线/转场/字幕/ffmpeg）
- workflow/ 流程域（阶段门控/状态机）
- auto-binding/ 内容识别 + 资产自动绑定
