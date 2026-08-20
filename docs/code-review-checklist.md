# 代码 Review 检查项（项目级标准）

> 来源：2026-08-19 用户要求，融合本项目架构铁律 + 行业主流质量标准
> （微软官方代码评审清单 / SonarSource 质量门禁 / OWASP Top10 / Clean Code）
> 用法：每次 review（每片交付前 / 关键重构后）逐项过一遍，记录发现，全员共识后修复达成门禁。

---

## 第一部分：使用说明

- **范围**：每次提交前自查 + 每片完成后对抗 review。分五级严重度：`BLOCKER`（必须修、阻止合入）/ `MAJOR`（应修、合入前处理）/ `MINOR`（可后补，记入 TODO）/ `NIT`（风格）/ `INFO`（记录非问题）。
- **方法**：对每条检查项，按「怎么查」执行；命中「判定」即记为发现，给 file:line + 失败场景 + 严重度。
- **纪律**：宁可多报（后续 verify 筛），不可漏报；每条发现必须能落到具体代码行与可复现场景。

---

## 第二部分：项目铁律（最高优先，违反 = BLOCKER）

| # | 检查项 | 怎么查 | 判定 |
|---|--------|--------|------|
| R1 | **多租户隔离** | 读数据访问层：是否走 `BaseRepository.scoped`（自动注入 userId）；`IsNull()` 处理 userId 为空；跨租户例外（裸 `this.repo`）是否有「调用方 runWithUserAsync」注释 | 新 Repository 未走 scoped / 裸查无纪律注释 = BLOCKER |
| R2 | **双端 Service/Repo 统一** | 业务逻辑是否只在 core 层一份；Electron/Web 是否各只做平台实现（不复制业务）；Web Controller 不写 SQL | Web 端另起一套服务/写 SQL = BLOCKER |
| R3 | **字段零映射** | `toDto`/前端类型与数据库列名是否同名直传；有没有 `entityToRecord` 类转换函数 | 出现映射/重命名 = BLOCKER |
| R4 | **常量唯一源** | grep 状态/类型是否用 shared 常量（WORKFLOW_* / APPLICATION_* 等）；有无裸字符串比较/赋值 | 同一种状态多处字面量 = MAJOR~BLOCKER |
| R5 | **禁复制粘贴/重复实现** | 相同能力是否 ≥2 处实现（如 fetch 封装、markdown 渲染、url→base64）；新代码是否应调用既有工具层 | 同类第二套 = MAJOR |
| R6 | **双端迁移/接线完整** | 新表迁移是否 Electron `runMultiTenantMigrations` + Web `initDatabase` 都注册；database-manager 双端实例化 | 缺一端 = BLOCKER |
| R7 | **口语即界面（可测性）** | 新增能力是否带单测（TDD 先红后绿）；测试是否测真实语义而非同义反复 | 关键路径无测试/测试自证 = MAJOR |

---

## 第三部分：正确性与可靠性（行业通用，微软/Sonar 核心）

| # | 检查项 | 怎么查 | 判定 |
|---|--------|--------|------|
| C1 | **空指针/未定义解引用** | 检查 `?.`/`??`/`!` 用法；对象可能 undefined 的链式访问；early-return 后再用 | 可触发 TypeError = MAJOR |
| C2 | **异步错误** | `await` 是否齐全；Promise 拒绝是否有 catch；`void xxx()` 后台调用是否吞错 | 未处理拒绝/静默吞 = MAJOR |
| C3 | **边界条件** | 空数组/空串/0/false 是否与 undefined 混淆；循环 off-by-one；`slice`/`substring` 边界；NaN/Infinity | 边界输入出错 = MAJOR |
| C4 | **并发/竞态** | 共享可变状态；先查后插无唯一约束；事件顺序假设（终态 vs 后续事件）；取消/超时后回写 | 竞态窗口可复现 = BLOCKER |
| C5 | **错误处理路径** | 每层错误是否向上抛或转语义错误；重试/降级路径是否被测试；错误 message 对用户是否可读 | catch 空吞 / 错误无处可查 = MAJOR |
| C6 | **资源泄漏** | timer/订阅/窗口/连接/文件句柄是否释放；`unref`；finally 清理；跨进程 tap 是否 unsubscribe | 长活资源未释放 = MAJOR |
| C7 | **数据一致性** | 多表写入是否有事务/回滚；级联删除是否完整；孤儿数据路径 | 部分写入无回滚 = MAJOR |
| C8 | **日期/时区** | new Date 一致性；本地时区 vs UTC 存储；字符串化往返 | 时间语义漂移 = MAJOR |

---

## 第四部分：异常与日志（本项目的实战教训——曾漏检）

| # | 检查项 | 怎么查 | 判定 |
|---|--------|--------|------|
| L1 | **空 catch** | grep `catch {` / `catch {}` 后无日志无注释 | 一律补 warn/error + err 上下文 = MAJOR |
| L2 | **吞异常** | catch 后 return 空/默认值而不记录；rethrow 前是否留痕 | 异常离开模块前必须 record = MAJOR |
| L3 | **级联失败不阻断主流程** | 删除/聚合等多步操作：子失败是否中断整体；是否逐段 try/catch + 留痕 | 子失败阻断主流程且无日志 = MAJOR |
| L4 | **降级/回退有日志** | 幂等回退、降级路径（索引兜底、单点聚合失败、rerank 失败降级）是否有 warn | 走了降级但无 warn = MINOR~MAJOR |
| L5 | **日志分级恰当** | info（业务里程碑）/ warn（降级、可恢复）/ error（异常、需介入）；日志含关键上下文（id/runId/error） | error 滥用/关键 id 缺失 = MINOR |
| L6 | **敏感信息不入日志** | 日志里不透出 apiKey/token/密钥/内部路径 | 泄密 = BLOCKER |

---

## 第五部分：安全（OWASP Top10 映射）

| # | 检查项 | 判定 |
|---|--------|------|
| S1 | 注入：SQL 拼接 vs 参数化；模板注入（{{}} 二次展开） | SQL/模板注入面 = BLOCKER |
| S2 | 越权/租户逃逸：跨租户查询是否验证归属；分享 token 是否可枚举（应 256bit）| 越权访问他人数据 = BLOCKER |
| S3 | 敏感数据：密钥加密存储；勿硬编码 credential | 明文凭据 = BLOCKER |
| S4 | **不限流**：匿名入口（分享 invoke/API）是否有速率限制/配额 | 可刷爆 = MAJOR |
| S5 | 输入校验：length/type/白名单；XSS（渲染用户内容时转义）| 反射 XSS/超限输入 = MAJOR |
| S6 | 错误信息泄露：内部异常原文回显给匿名访客 | 泄露栈/路径/内部结构 = MINOR~MAJOR |

---

## 第六部分：可维护性 / Clean Code（Sonar/SOLID）

| # | 检查项 | 判定 |
|---|--------|------|
| M1 | **复杂度**：圈复杂度 > 10（循环/分支嵌套深）；能否拆函数 | 深度嵌套/长函数 = MINOR~MAJOR |
| M2 | **单一职责**：类/函数是否多职责（如 service 又做映射又发消息）| 职责混杂 = MINOR |
| M3 | **依赖方向**：core 是否依赖平台（electron/web 具体类）；是否经注入/接口 | core 反向依赖平台 = BLOCKER |
| M4 | **命名**：意图命名；布尔前缀；动词+名词的 handler；魔法数字抽取 | 反意图命名/魔法数字 = MINOR |
| M5 | **代码可读性**：过早 return vs 深 if；早退模式；注释解释"为什么"而非"是什么" | 可读性明显差 = NIT~MINOR |
| M6 | **无效/死代码**：未引用 import/变量/函数；遗留 TODO；临时脚本入库 | 死代码 = MINOR |
| M7 | **性能**：循环内 await 串行可并行；重复计算/IO 可缓存；内存增长（闭包捕获大对象）；启动热路径阻塞 | 明显性能问题 = MAJOR |
| M8 | **可观测性**：关键事件（创建/删除/提交）是否留 info；用户可追踪 runId/orderId | 关键动作无痕 = MINOR |

---

## 第七部分：测试质量

| # | 检查项 | 判定 |
|---|--------|------|
| T1 | 是否测真语义（断言不依赖实现细节/固定 mock 形状反噬）| 同义反复测试 = MINOR |
| T2 | 边界与失败路径是否覆盖（空/异常/降级/竞态时序）| 关键边界未测 = MINOR |
| T3 | mock 是否与真实契约一致（签名/返回形状超集）| mock 走样掩盖 bug = MAJOR |
| T4 | 命名/断言是否可读（Given-When-Then、明确预期 vs 松散）| 断言过松（|| true）= NIT |
| T5 | 是否有集成/真实环境验证（迁移幂等、E2E、跨端一致）| 纯单元无端到端 = MINOR |

---

## 第八部分：Review 执行流程

1. **范围确定**：git diff 目标（upstream..HEAD 或工作区）；列出涉及文件与调用链上下游
2. **跑一遍**：tests + tsc/build +（若可能）真实环境冒烟 —— 先验证"能跑"，再看"对不对"
3. **逐项过清单**（R → C → L → S → M → T 顺序：铁律优先）
4. **每个发现**：file:line + 失败场景（什么输入/状态 → 什么错误/崩溃）+ 严重度
5. **verify**：对 MAJOR 以上逐条由第二人/独立视角复核，拒绝猜测
6. **处置**：BLOCKER/MAJOR 合入前修完；MINOR 记 TODO；输出报告（发现表 + 结论）

### 门禁（每片提交前）
```
npx vitest run tests/unit/...       # 全绿
npx tsc --noEmit -p tsconfig...     # 无新增错误
BLOCKER = 0  MAJOR = 0（或全部修复）
```