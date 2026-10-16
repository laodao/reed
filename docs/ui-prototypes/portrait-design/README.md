# 人像设计（新版）· 高保真原型

全新版本人像设计的完整流程原型，**从主导航入口到套图导出的完整闭环**。
新版入口菜单、页面全部重做；数据结构沿用现有（PortraitProject → PortraitCharacter → PortraitVariant）。
**仅展示交互形态与 UI 结构**，所有按钮无后端逻辑，数据为硬编码 mock。

## 怎么看

```bash
cd docs/ui-prototypes/portrait-design/
python -m http.server 8765
# 浏览器开 http://localhost:8765/
```

## 完整流程闭环

```
主导航「人像设计」
  ① 项目列表 projects.html        ── 管理多个人像项目
  ② 角色列表 characters.html      ── 项目内人物角色
  ③ 生成形象 workbench-new.html   ── 角色首次生成（无形象时）
  ④ 工作台   workbench.html       ── 已有形象的核心枢纽
  ⑤ 修改面部 edit-face.html       ── 只改脸不动身体（新能力）
  ＋ 模板库  templates.html       ── 提示词模板管理
```

## 页面清单

| 文件 | 内容 | 核心点 |
|---|---|---|
| `index.html` | 原型总览 + 流程闭环 | — |
| `projects.html` | 项目列表（应用外壳 + 卡片网格） | 流程起点 |
| `characters.html` | 角色列表 + 创建角色弹窗 | 项目内人物 |
| `workbench-new.html` | 生成态工作台 | 丰富参数 / 多参考图 / 模板 |
| `workbench.html` | 编辑态工作台 + 套图画廊 + 导出弹窗 | 修改面部入口 / 重新生成增强 |
| `edit-face.html` | 修改面部专用页 | 核心新能力全流程 |
| `templates.html` | 提示词模板库 | 沉淀 docs/prompt.txt |
| `portrait.css` | 设计系统 | 配色 / 间距 / 组件 / 微交互 |

## 新版核心能力

- **丰富生成参数**：质量 / 风格 / 随机种子 / 相关性 / 采样步数 / 重绘强度
- **多参考图 + 语义标注**：每张参考图标明用途（人物 / 面部 / 服装 / 背景）
- **提示词模板系统**：把 `docs/prompt.txt` 专业描述（三庭五眼 / 头身比例 / 骨相皮肉）沉淀为可复用模板，全入口可套用 / 追加
- **重新生成增强**：默认带原图参考，重绘强度滑块控制 微调 ↔ 重画
- **修改面部（新）**：独立能力，仅替换面部，身体 / 服装 / 背景不变

## 设计语言

- 对齐 The Bot 真实应用：深色主导航 + 暖白主区
- 墨青蓝主色（#2c5ff6）+ 强调紫（#6d5efc，面部新功能专用）
- 8px 间距栅格，圆角 6/10/14，两档阴影
- 抽象 SVG 人形剪影替代廉价 emoji 占位
- 统一微交互（hover 抬升、active 缩放、过渡曲线）
