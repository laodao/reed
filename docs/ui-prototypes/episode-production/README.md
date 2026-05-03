# 剧集制作 · UI 原型

基于 spec [`docs/superpowers/specs/2026-05-02-episode-production-pipeline-design.md`](../../superpowers/specs/2026-05-02-episode-production-pipeline-design.md) 做的高保真静态 HTML 原型。
**仅展示交互形态和 UI 结构**，所有按钮 / 链接均无后端逻辑，数据全是硬编码 mock。

## 怎么看

浏览器直接打开 `index.html`：

```
file:///home/ubuntu/workdir/the-bot/docs/ui-prototypes/episode-production/index.html
```

或者临时起个 http server：

```bash
cd docs/ui-prototypes/episode-production/
python3 -m http.server 8000
# 浏览器开 http://localhost:8000/
```

## 页面清单

| 文件 | 对应阶段 / 内容 | spec 章节 |
|---|---|---|
| `index.html` | 入口 + 导航 + 设计要点 | — |
| `00-project-list.html` | 剧集项目列表 | — |
| `02-stage-asset.html` | ② 资产盘点（4 类卡片视图） | §3.9 |
| `02-stage-asset-edit.html` | 角色资产卡编辑（设定卡 + 图谱） | §3.1-3.7 |
| `02-stage-location-edit.html` | **地点资产卡编辑（场景图制作）** | §3.2 / §3.3 / §4.5 |
| `03-stage-script.html` | ③ 剧本编辑 + 完整性检查 | §4.1 |
| `04-stage-storyboard.html` | ④ 分镜（场景树 + 分镜网格 + 关键帧数配置） | §4.2 |
| `05-stage-production.html` | ⑤ 画面+音频（**含九宫格关键帧**） | §4.5 / §4.7 |

工作台框架（顶部进度条 + 左侧资产侧栏 + 底部迷你时间线）所有页面共享，对应 spec §2.1 / §2.2 / §2.3。

## 没做的页面

- `01-stage-content.html` ① 内容（识别要素、确认清单）— 留 placeholder
- `06-stage-compose.html` ⑥ 合成（时间线 + 转场 + 字幕 + 导出）— 留 placeholder
- 各种 dialog（创建项目 / 绑定 portrait / 复刻语音等）

如果需要补，告诉我。

## 技术说明

- 静态 HTML + 单一 `shell.css` 自定义样式 + Tailwind CDN 兜底
- 没用任何 build 工具
- 所有 emoji 当 icon 用（够清晰，不依赖 SVG/icon font）
- 颜色 / 间距 / 字体 风格大致对齐 Element Plus 设计语言

## Mock 数据故事

虚构的"江湖故事"剧集项目用作样例：

```
项目: 江湖传 · 第一季（5 集）
  剧集: 第 1 集 · 茶馆相遇

  资产:
    角色: 张三 (linked_lw 主角) / 李四 (linked_lw 缺图) / 老板娘 (standalone)
    地点: 茶馆 (普通) / 客栈 (3D 升级)
    物品: 长剑 / 折扇 / 书信 / 玉佩(缺图)
    语音: 沉稳男声 / 温柔女声 / 苍老男声 (系统) + 我自己 / 助理 A (复刻)

  剧本:
    场景 1 · 茶馆 · 黄昏 · 阴天
      - 旁白 + 张三/李四 对话 + 张三收折扇动作
    场景 2 · 茶馆 · 夜晚
    场景 3 · 客栈 · 白天

  分镜: 12 个（场景 1: 4 / 场景 2: 4 / 场景 3: 4），累计 ~56s
```
