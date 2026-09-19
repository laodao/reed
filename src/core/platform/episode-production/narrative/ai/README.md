# 叙事域 AI 生成器

叙事域 AI 生成器 — 剧本生成（script-generator）/ 分镜生成（storyboard-generator）。

- `shot-pacing.ts`：分镜节奏密度规则的 prompt 共享片段（密度分档 / 命名纪律 / 情绪外化，注入 storyboard-generator 与 storyboard-cogen 的 prompt）+ 生成结果纯函数校验器 `validateShotPacing`（密度与时长只警告不阻断，警告经 logger 输出并挂在 `StoryboardGenerationResult.pacingWarnings`）。
