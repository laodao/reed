# 领域共学空间 M3-A 进度记录:遗留质量修复

日期:2026-09-09 · 分支 feat/domain-learning · 依据 m3-implementation-plan.md §1 M3-A

## 完成内容

1. **invoke_skill 对内置学习技能空骨架——根因修复**(基于子代理链路侦察,只读确认无第二套目录遮蔽):
   - **A. discover_capabilities 检索不对称**:keyword 原来只匹配中文 name/description,不匹配英文 kebab id,且 `skillsTotal` 报未过滤全量(学习技能 id 全英文 → agent 收窄词 0 命中却见「总数 14」)。
     修复(system-agent-tools.ts):命中面扩到 `id/name/description/whenToUse`;先算 `matchedSkills`,`skillsTotal = matched.length`(带 keyword 时数组与总数一致)。
   - **B. invoke_skill 无参数契约**:原来把 params 直喂 renderSkillTemplate 且不传 onMissingParam → 缺参静默空串 → 空槽位指令+JSON 骨架=「空骨架/先验硬凑」。
     修复:按 discover 暴露的 skill.inputs 校验必填(缺失或空串)→ 结构化报错列出缺失与可用 key(模型可自纠重试);渲染补 onMissingParam 告警(与 skill-call 节点对齐)。
   - 顺带:DL 宿主 discover_capabilities 频控 1→2(dl-agent.types),允许目录纠错重查。
2. **概念归属优化(dl-agent-deps)**:快照补「目录分组（dl_save_concept 的 parentId 可填其中 id）」行;研究提示词加第 9 条归属纪律(契合目录填 parentId,不确定挂根,人审兜底)。
3. **平台缺口书面交接**:`tasks/2026-09-09-agent-tool-namespace-colon-handoff.md`——pack 工具命名空间冒号被 LLM API 拒绝的根因链/影响宿主/现有绕行/修复方向(不改平台,交 agent-harness 维护)。

## 测试与回归

- system-agent-tools.spec 20 passed(新增:keyword 按英文 id/whenToUse 命中且 skillsTotal=匹配数;无关词返回空且总数 0;invoke 缺必填/错误键名 → 结构化失败列出 topic);
- dl-agent-deps.spec 3 passed(提示词含「目录分组」「parentId」);dl 全套 41 passed;tsc 定向零错误。
- 真机影响:研究宿主下一轮 run 将以「目录含学习技能 + invoke 缺参显式报错」正确路径调用(联网/模型验证随 M3 后续宿主回合)。

## 变更文件

- 修改:`src/core/platform/workflow/tools/system-agent-tools.ts`、`tests/unit/core/platform/workflow/system-agent-tools.spec.ts`、`src/core/packs/domain-learning/services/dl-agent-deps.ts`(+spec)、`dl-agent.types.ts`
- 新增:`tasks/2026-09-09-agent-tool-namespace-colon-handoff.md`、`tasks/.../m3-implementation-plan.md`

## 下一步

- M3-B:间隔复习(候选/到期规则已备 learning-review.rules 3 passed 于工作区)——复习调度 + mastery review 流转 + IPC/前端,完成后与 M3-A 同里程碑节奏提交汇报。
