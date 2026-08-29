# 工作流技能（Skill）功能

日期：2026-08-29
分支：feat/workflow-engine

## 需求

用户提出：工作流能否增加一个「调用 skill 的组件」，让某个环节能调用技能，实现复杂功能（写短视频脚本、写公众号文章等）。随后追问：是否需要 skill 管理功能（安装、卸载、查看现有 skill 等）。

## 需求确认（ask_user_question）

1. **Skill 形态**：AI 提示词技能包（参数 schema + 系统提示词模板 + 任务提示词模板 + 输出规范，执行 = 一次 AI 生成）✅ 用户选定
2. **技能来源**：内置预置 + 用户自定义 ✅ 用户选定
3. **管理界面**：独立技能库页面 ✅ 用户选定
4. **安装来源**：用户质疑"json 能描述 skill 吗？skill 可以包含很多东西，是一些文件的组合" → 采纳为**技能包目录**（SKILL.md 清单 + 多文件）
5. **内置策略**：内置只读 + 复制为自定义 ✅ 用户选定

## 参考 DSH（deepseek-harness）技能体系

解包 `DSH Desktop/resources/app.asar` 研究 `@deepseek-ai/dsh-skill` / `dsh-skill-filesystem`：

- **技能格式**：目录 bundle `<name>/SKILL.md`（YAML frontmatter：name/description/whenToUse/调用控制 + markdown 正文）或平铺 `<name>.md`；有意不支持嵌套
- **多来源 + rank 优先级**：项目根 `.dsh/skills`(100) / `.agents/skills`(200) / 自定义(300) / 用户根 `~/.dsh/skills`(400) / `~/.agents/skills`(500)，provider 合并目录、按名 resolve 赢家
- **调用控制**：`disable-model-invocation` / `user-invocable`（校验失败默认拒绝原则）
- **安装/卸载 = 文件系统操作**：放入技能根 = 安装，删除 = 卸载（chokidar 监听自动刷新）
- **渲染**：`<skill_content name>` + `<skill_resources>`（资源基址提示）+ `<skill_instructions>`（正文）

## 设计定稿（融合 DSH + 工作流场景）

技能 = **技能包目录**（DSH 同款 + the-bot 扩展 inputs 参数 schema）：

```
<dataPath>/skills/<id>/           # 用户技能根（内置技能 = 代码内联只读）
├── SKILL.md                      # YAML frontmatter + markdown 任务正文（含 {{param.xxx}} 占位）
├── prompts/*.md                  # 可选：大提示词文件
├── references/*.md               # 可选：参考文档/示例 —— 执行时自动拼入上下文
└── assets/*                      # 可选：附件
```

- frontmatter：name（kebab-case 必填）/ description（必填）/ title（中文展示名）/ when_to_use / category / inputs（参数 schema，the-bot 扩展）/ system_prompt / output_desc / disable_model_invocation
- 内置技能：代码内联 SKILL.md（source=builtin），只读展示 + 「复制为自定义」
- 用户技能：文件系统技能包目录，支持新建/编辑/删除/导入（目录或 .md）/导出
- **skill-call 节点**：选技能 → 按 inputs schema 渲染参数区（值支持 {{工作流变量}}）→ 节点渲染 {{param.xxx}} + 拼 references → AI 生成 → 输出 content/skillId/usage
- 职责边界：技能是纯参数化任务模板（只认 {{param.xxx}}），工作流变量经节点 inputs 显式注入——技能与具体工作流解耦

## 实现清单

### 核心
- `src/shared/types/workflow-skill.types.ts`：WorkflowSkill / WorkflowSkillInput / SKILL_SOURCES / SKILL_NAME_PATTERN
- `src/core/modules/workflow/skills/skill-parser.ts`：SKILL.md 解析（frontmatter 拆分 + js-yaml + inputs 规范化 + 序列化往返）
- `src/core/modules/workflow/skills/builtin-skills.ts`：内置 6 技能（短视频脚本/公众号文章/小红书文案/微博短文案/文章润色/深度分析）
- `src/core/modules/workflow/skills/skill.service.ts`：内置+用户合并、CRUD、导入/导出、内置复制、resolveSkill（含 references）
- `src/core/modules/workflow/skills/skill-registry.ts` + boot 装配
- `src/core/modules/workflow/nodes/skill-nodes.ts`：skill-call 节点（参数渲染/缺参告警/references 拼接/AI 调用/失败显式 failed+retryable）
- nodes/index.ts 注册、workflow.types.ts（WorkflowNodeType + ConfigMap）、workflow-node-catalog.ts（目录）、workflow-node-forms.ts（表单 + source 类型）

### 前端
- `FormFieldRenderer.vue`：skill-select（分组下拉 + 描述）/ skill-params（按 inputs schema 渲染 string/textarea/number/boolean/select 控件，值支持 {{模板}}）；start 输入编辑器动态源加「技能库」
- `NodeConfigPanel.vue` / `RunInputForm.vue`：select-dynamic 新增 skills 源加载
- `src/renderer/src/views/skills/SkillLibrary.vue`：技能库页面（列表分组/详情/新建/编辑/导入/导出/删除/复制内置）
- 菜单（config/menu.ts）+ 路由（router/index.ts）加 /skills

### 通道
- `src/electron/ipc/handlers/skill.handler.ts`：skill:list/get/resolve/create/update/remove/import/export/fork
- preload 暴露 `electronAPI.skills`；`src/web/client/channel-map.ts` 同步 skills 通道
- 依赖：js-yaml（frontmatter 解析，正式依赖）

## 测试（TDD）

- `skill-parser.spec.ts`（10 例）：frontmatter 拆分、完整解析、name/description 校验、YAML 错误、调用控制、inputs 规范化、序列化往返
- `skill.service.spec.ts`（11 例）：内置清单、get/resolve、create 目录落盘与校验、update、remove、forkBuiltin、目录导入（含 references 拼装）、.md 平铺导入、exportToPath、目录名不一致跳过
- `skill-call-node.spec.ts`（6 例）：validateConfig、参数渲染/模型透传、references 拼接、缺参告警、技能不存在/禁用失败、AI 调用失败 failed+retryable
- 一致性全过：node-registry-consistency、workflow-types、builtin-app-templates、document-templates 等 54+ 例全绿；workflow 目录仅剩 7 个已知前置失败（tool-call 3/tool.service 1/yt-dlp 3，与本次无关）
- 类型：`tsc --noEmit tsconfig.node.json` 干净（vue-tsc 受项目原有 TS6305 构建顺序问题阻塞，vue 编译由 dev server 实测验证）

## 实测

- **IPC 验证**（CDP）：`skills.list` 返回 6 个内置技能；`skills.create` 创建用户技能成功（目录落盘）；`skills.forkBuiltin` 复制内置为自定义成功
- **页面编译**：SkillLibrary.vue / FormFieldRenderer.vue vite 编译 200（修复一处模板嵌套插值 `{{'{{param.键}}'}}` → v-pre）
- **skill-call 端到端**（`wfrun_1787965015614_8s8xy4ocg`，83s，3 节点全 succeeded）：最小工作流 start → skill-call(short-video-script，material={{start.event}}，30 秒，口播资讯) → end；真实 AI 生成短视频脚本（脚本概览/口播稿按镜头分段/分镜表含镜头|画面|口播|字幕|音效|时长），`{{param.xxx}}` 参数替换与模型透传全部生效
- 验证产物已清理（临时定义/演示技能/内置副本），用户环境保持干净

## 迭代（用户反馈）

### 1. 短视频脚本产出改进（先完整文案，再据文案拆分镜）
用户反馈：脚本只是列出分镜列表，每个分镜只有一两句话，太少 → 要求**先写完整文案，再据文案拆分分镜，分镜口播列要完整**。
- 改吃瓜工作流 `script1` 提示词：要求"先写完整连贯口播文案（~250-400 字整段），再据文案拆分分镜，每个镜头口播列放文案切分出的完整句子"
- 改内置技能 `short-video-script` 正文/output_desc/system_prompt 同逻辑（新增 `## 完整口播文案` 段，分镜表口播列=完整句子）
- 实测（`wfrun_1787966674421_9dt633hzs`，145s）：输出含整段连贯口播文案 + 分镜表每镜口播列完整句、画面可执行、字幕/音效/时长

### 2. 技能库管理页参考 DSH 插件市场形态
用户提供 DSH `dsh-market v1.35.0` 插件市场截图（发现/主题/已安装标签页、搜索、分类 chips、卡片网格：图标+名称+描述+安装按钮+标签）→ 重做技能库页面：
- 市场头部（🧩 技能库 v1.0 + 导入/新建/刷新）
- 搜索框 + 分类 chips（从技能 category 聚合）
- 卡片网格（图标(分类 emoji)+名称+来源 tag+描述+操作按钮：内置=复制为自定义 / 我的=编辑+删除；点卡片弹详情）
- 详情对话框（描述/时机/参数表/系统提示词/任务正文/输出说明 + 导出/编辑/复制）
- 保留全部管理操作（新建/编辑/导入/导出/删除/复制内置）


