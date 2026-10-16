# 20 · cordis 插件框架调研评估

> 2026-08-28 ｜ 状态：评估结论 ｜ 调研对象：论文《A Programming Paradigm for Spatiotemporal Composability》（北大 + DeepSeek-AI，存档于 docs/webdocs/cordis.pdf）+ 代码库 /home/ubuntu/workdir/cordis（github.com/cordiverse/cordis）
>
> 结论先行：**不引入依赖，自研轻量版；cordis 定位为"终局参考"而非"当下依赖"。当下仅吸收 3 条设计原则，其余机制标注触发条件、暂不采纳。**

## 1. 调研对象事实

- **身份**：cordis = Koishi 机器人框架插件内核的 4.x 重写版，论文是其形式化基础。TypeScript、ESM-only、**MIT License**。
- **维护状态**：非常活跃（调研当日有提交，GitHub ~7.8k stars），但 4.0 仍为 rc（rc.1→rc.8），官方明示 **API 不稳定，可能随时变更**。
- **包结构**：Yarn monorepo 9 包。`cordis` core（1850 行）零 Node 依赖、双端可跑；loader/hmr/include 依赖 Node internals，仅服务端可用。
- **核心机制**（论文形式化的两件事）：
  - **时间可组合性（revertible effects）**：组件的每个副作用携带逆操作，卸载 = 完整回滚，系统回到未安装态。
  - **空间可组合性（reactive coeffects）**：组件静态声明依赖（inject），依赖上/下线时运行时自动激活/停用组件（fiber 状态机 PENDING/LOADING/ACTIVE/FAILED/DISPOSED）。
- **二线机制**：事件五分发模式（emit/parallel/serial/bail/waterfall，纯内存无持久化）、isolate/intercept 隔离域与拦截器、配置树 loader（entry 树 + 按字段增量 reconciliation + 收敛性定理）、无 accept 边界的 HMR、Standard Schema 配置校验、async generator 插件形态。

## 2. 与 business-pack 的匹配度

**关键范式错位**：cordis 的插件 = 代码包（动态 import + inject/provide 服务组合）；本平台的 business-pack = 声明式数据清单（物化进 DB 表，内核不内置业务逻辑）。价值观相反。

| 本平台需求 | cordis 实况 | 匹配 |
|---|---|---|
| 事件溯源/持久化订阅/重放（10 号核心） | 纯内存 emit/on，无 seq/游标/死信 | ❌ 自研躲不掉；引入反致两套总线 |
| Pack Manifest 数据化装配 | 无此概念，配置仅是插件入参 | ❌ 范式不同 |
| UI 扩展点（路由/菜单登记） | 无 UI 概念（headless） | ❌ |
| 双端宿主 | core 零 Node 依赖 | ✅ |
| 错误隔离（插件崩不拖垮宿主） | fiber FAILED 隔离良好；同进程无资源隔离 | 🟡 |
| 多租户/per-user | Context.filter 有原料，无开箱方案 | 🟡 |
| API 稳定性 | rc 阶段官方明示不稳定 | ⚠️ |

## 3. 复用选项分析

| 选项 | 内容 | 利弊 |
|---|---|---|
| a) 整体依赖 | cordis 作为插件底座 | 白得成熟 DI/生命周期/HMR；但事件系统仍须自研且裂出第二套总线、Manifest 装配层仍须全写、rc API 深度绑定升级痛苦、Proxy Context 风格与存量服务层冲突。**否决** |
| b) 借鉴设计自研轻量版 | 取 DI/生命周期语义自研（估 300-500 行） | 与 10 号事件系统统一设计、长在既有分层上、无 API 漂移；需自测生命周期边界（cordis 自身 git log 显示此处修过一串 bug）。**采纳** |
| c) 局部引入 core 包 | 仅作包私有代码的装载器 | core 恰是迭代最猛的部分；需严格边界纪律防双总线。**暂缓**，触发条件见 §5 |

## 4. 吸收清单（经"我们的需求是否存在"标尺收缩后）

### 当下吸收（3 条，已同步进设计文档）

1. **effect 必须带逆操作的纪律**（→ 18 号包生命周期）：包物化/卸载的每个动作（建表行、注册工具、注入技能）必须登记对应的逆操作，卸载 = 逆操作栈反序执行，保证"完全回滚到未安装态"。数据物化同样适用，与代码无关。
2. **依赖声明 + 就绪才激活的运行时语义**（→ 18 号）：18 号 `minKernelVersion` 目前只有静态校验；补运行时语义——包声明依赖（内核契约版本、其他包、内核服务），依赖未就绪时包处于 pending 而非 failed，依赖上线自动激活、下线自动停用。
3. **配置 schema 即校验器、加载时 fail-fast**（→ 18 号 manifest、14 号节点 config）：schema 声明处即校验处，非法配置在安装/加载期拒绝而非运行期暴雷。可采用 Standard Schema 规范（业界通用，非 cordis 私有）。

### 终局参考（暂不采纳，附触发条件）

| cordis 机制 | 不采纳的原因 | 再评估触发条件 |
|---|---|---|
| fiber 生命周期树、增量 reconciliation、并发加载、HMR | 全部预设"包是活代码且高频装卸"；本平台包是数据清单，启停 = upsert + 激活标志 | 第三方包允许带代码（18 号开放问题），或飞轮演进到 agent 自动生成并部署工具 |
| isolate/intercept 隔离域与权限裁剪 | 同上，服务级隔离对数据包无意义（记忆隔离 category 前缀已够） | 同上；届时 cordis 是现成答案，可认真评估选项 c |
| 事件五分发模式（bail/waterfall 等） | 通用模式非 cordis 独有；本平台审批否决走图路由边而非事件监听链，需求未证实 | 10 号事件平台落地后如出现真实的管道/短路需求，届时加 API 即可 |
| Proxy Context、module augmentation 类型体操 | 与存量服务层风格冲突，改造成本大 | 永不主动采用 |

## 5. 结论与定位

cordis 论文论证的是**自我进化 harness 的终局形态**（§1.2.2、§7 直接点名：agent 在持续服务中生成并热替换自己的组件，引用了 OpenAI Harness Engineering 与 Anthropic harness 设计文章）。本平台的飞轮 L4 技能库与度量回流若演进到"agent 自动生成新工具并部署"，cordis 的全套机制将从"超前设计"变为"刚需"，届时重新评估引入。

在此之前，引入或照抄其机制都是给不存在的问题付复杂度税。本评估的"不采纳"判断与采纳判断同等重要——它们都是正式决策记录。

**执行动作**：选项 b（自研轻量 DI/生命周期，M4 包机制落地时实施）；上述 3 条原则同步进 18/14 号文档；本文档归档备查。
