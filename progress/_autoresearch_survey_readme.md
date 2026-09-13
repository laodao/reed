# Auto-Survey Agent

[English](README.md) | [中文](README_zh.md)

**一个将你的编程 Agent 转化为自主学术研究员的实用工具箱。**

本仓库提供了一套完整的协议和工具，旨在让 AI Agents（如 GitHub Copilot, Cursor）能够自主进行**全自动、深度且系统化的文献综述调研**。

通过结合严谨的标准作业程序与可执行的工具脚本，它引导 Agent 完成完整的“漏斗式研究流程”：从广度范围界定，到智能筛选，再到深度分析与报告生成。

## 🚀 核心理念

1.  **Agent 优先设计 (Agent-First)**：这不仅仅是一个供人类使用的库，更是一套 Agent 的“驱动程序”。Agent 通过阅读 `research_rules.md`，“学习”如何像研究员一样思考和行动。
2.  **协议驱动自动化**：核心在于 `research_rules.md`，它定义了严格的研究阶段（深度研究漏斗）。Agent 只需按部就班地执行指令。
3.  **可扩展与自定义**：
    *   **工作流**：你可以修改 `research_rules.md` 来调整研究逻辑（例如，增加一个“同行评审”阶段）。
    *   **技能 (Skills)**：你可以在 `skills/` 目录下添加新工具（例如 Google Scholar 爬虫、向量数据库连接器），以增强 Agent 的能力。

## 📂 项目结构

```text
.
├── AGENT_SKILLS_GUIDE.md   # Agent 的“用户手册”，教它如何使用工具
├── research_rules.md       # “大脑”：定义研究工作流的 SOP 和逻辑
├── requirements.txt        # Python 依赖
├── skills/                 # “双手”：可执行的工具脚本
│   └── arxiv/              # 示例技能：ArXiv 搜索与检索
│       ├── SKILL.md        
│       └── scripts/        
└── surveys/                # “工作台”：所有研究产物（PDF, 笔记, 报告）存放于此
    └── 20260114_MyTopic/   # 特定课题的完整目录
```

## 🛠️ 安装

```bash
# 1. 克隆仓库
git clone https://github.com/Lianggs8/auto-survey-agent.git
cd auto-survey-agent

# 2. 安装依赖 (这对 Agent 能够运行脚本至关重要)
pip install -r requirements.txt
```

## 📖 如何使用 (配合 AI Agents)

**你不需要手动运行脚本。** 你的任务是搭建舞台，然后让 Agent 开始表演。

### 第一步：在 AI 编辑器中打开
在 VS Code (配合 GitHub Copilot) 或 Cursor 中打开本文件夹。

### 第二步：向 Agent 下达指令
打开 Chat 或 Composer 面板并发送以下提示词 (Prompt)：

> “我想对 **[你的研究课题]** 进行一次深度调研。请先阅读 `research_rules.md` 和 `AGENT_SKILLS_GUIDE.md` 以理解你的角色和可用工具。然后，请协助我开始‘第一阶段：预调研与方案制定’。”

### 第三步：跟随 Agent
Agent 将会自动执行以下操作：
1.  **提出方案**：创建 `research_plan.md` 供你审核。
2.  **执行搜索**：调用 `skills/arxiv/scripts/arxiv_cli.py` 工具。
3.  **下载与阅读**：使用 `markitdown` 处理 PDF。
4.  **撰写报告**：生成最终的综述报告。

*你只需要审核它的产出，并说“继续”或“修改”。*

## 🧩 自定义你的 Agent

### 修改工作流
直接编辑 `research_rules.md`。例如，如果你希望 Agent 始终用中文撰写最终报告，可以在“Phase 6”中添加一条规则：
> "Constraint: The final report `03_Survey_Report.md` must be written in Chinese."

### 增加新技能
1.  创建一个文件夹 `skills/new_tool/`。
2.  在 `skills/new_tool/scripts/` 中放入 Python 脚本。
3.  编写 `SKILL.md`，向 Agent 解释*何时*以及*如何*使用这个工具。
4.  将该工具的引用添加到 `AGENT_SKILLS_GUIDE.md`。

## 📄 许可证
[MIT](LICENSE)
