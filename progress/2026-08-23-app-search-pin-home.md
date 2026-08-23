# 应用增强（搜索/分类/标签/固定首页）+ 首页重构

日期：2026-08-23
状态：完成（实测通过，已提交）

## 需求

1. 应用增加搜索、标签（或分类），方便查找应用；可固定到首页
2. 重构首页：保留主功能菜单，增加用户固定到首页的应用入口；美观易用

## 设计

### 数据模型（apps 表新增列，create-apps-tables 幂等补列）

| 列 | 含义 |
|---|---|
| category | 应用分类（自由文本，如 新闻资讯/文案写作/视频处理；AppList 分类筛选 tabs 从数据聚合） |
| tags | 标签（JSON 数组；搜索/展示用） |
| pinned | 固定到首页（0/1；首页「我的应用」快捷入口） |

内置 8 个应用带分类/标签种子（迁移 create-builtin-apps，幂等）：
视频文案提取→视频处理[视频,文案]、每日热点早报→新闻资讯[早报,新闻]、多平台文案→文案写作 等。

### 服务/仓库

- AppRepository：新列 CRUD；listApp 支持 category 筛选 + pinned 筛选 + keyword 搜索扩展到
  名称/描述/分类/标签；countByCategory 分类计数聚合
- AppDefinitionService：setPinned / updateMeta（分类标签）/ listAppCategories；
  createFromWorkflow 分类缺省继承工作流分类（发布时可覆盖，再次发布同步更新）
- 修复真实 bug：内置应用（user_id=NULL 全局行）update 用裸 repo.update——
  scoped.update 附加 user_id 条件对内置行永远影响 0 行（既有的内置停用也存在此隐患）

### IPC / preload

- app:list 扩展 category/pinned 参数；新增 app:categories / app:set-pinned / app:update-meta

### 前端

- AppList：搜索框 + 分类筛选 tabs（带计数，新分类自动出现）+ 卡片分类/标签展示 +
  「📌 固定/已固定」按钮
- AppDetail：头部分类/标签展示 + 固定按钮 + 「编辑分类/标签」弹窗
- Home 重构：欢迎区 + 「📌 我的应用」区（固定应用快捷卡片，点击一键启动会话/
  进详情，空态自动隐藏）+ 「功能」主菜单网格；onActivated 每次进入刷新固定应用
  （keep-alive 下在应用列表固定后回首页即时生效——修复 onMounted 只执行一次的问题）

## 测试

- create-builtin-apps.spec：内置应用分类/标签种子 + pinned 缺省 0
- app.repository.spec：新列 CRUD、category 筛选、tags 关键字搜索、pinned 筛选、
  countByCategory、内置应用 pinned 可更新且其余字段禁改
- app-definition-meta.spec（新）：setPinned/updateMeta 透传、listAppCategories、
  createFromWorkflow 分类继承与覆盖
- 相关回归 173/174（唯一失败为既有 app-definition sourceId 基线）

## 实测（CDP + UI）

- 分类统计 5 类（图文设计/文案写作/新闻资讯/网页工具/视频处理）✓
- 视频文案提取 category=视频处理 tags=[视频,文案] ✓；搜索「视频」命中 ✓；
  分类筛选「新闻资讯」2 个 ✓
- setPinned 固定 → app.list({pinned:true}) 返回 1 ✓；updateMeta 用户应用分类/标签 ✓
- UI：应用列表搜索框/分类 tabs/固定按钮/卡片分类标签 ✓；
  首页「我的应用」区显示固定应用，取消固定后回首页即时消失 ✓（keep-alive onActivated）
