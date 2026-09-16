# 领域学习「确认并生成 N 个知识点」报 An object could not be cloned —— 根因与修复

日期：2026-09-14
用户原话：「领域学习模块，一个新的学习主题，点击生成首批知识后，在最后一步确认知识点体系界面，点击确认并生成 x 个知识点按钮，报错：An object could not be cloned.」

## 一、现象与定位

- 报错文案 `An object could not be cloned.` 是 Electron `ipcRenderer.invoke` **结构化克隆失败**的原话
  （Chromium 原始信息是 `DataCloneError: [object Array] could not be cloned.`）。
- 触发点：`PlanConfirmDialog.confirmSyllabus()` → `store.confirmPlan({ step:'syllabus', payload })`。
  第 ① 步「确认理解」不带 payload，所以能过；第 ② 步带 payload，必炸——与用户"走到最后一步才报错"一致。

## 二、根因（两层）

1. **载荷里混进了 Vue 响应式代理**：`toSyllabusPayload` 逐字段重建普通对象，唯独
   `prerequisites: c.prerequisites ?? []` 把草稿里的数组**原样透传**。弹窗的 `draftBranches` 是 `ref`，
   读出来是 reactive 代理，代理数组是 Proxy——V8 结构化克隆拒绝 Proxy，**不论数组是否为空**
   （实测：`structuredClone(reactive([]))` 同样抛 `[object Array] could not be cloned.`）。
   而 `normalizePlanSyllabus` 落库时总会写 `prerequisites`（可能为空数组），所以这条路径**必然失败**，
   与"这次方案里有没有前置"无关。
2. **store 的 IPC 出站口没有纯化**：同类问题在 `createConceptOf`（新建知识点表单 `conceptDraft` 是
   `reactive`，`prerequisites` 绑定 `el-select multiple`）同样存在——手动建点当时也是 100% 报错。

实测证据（host node + vue）：

```
structuredClone(reactive([]))                  -> FAIL [object Array] could not be cloned.
structuredClone(reactive({a:1}))               -> FAIL #<Object> could not be cloned.
结构化克隆 toSyllabusPayload(reactive 草稿)     -> FAIL [object Array] could not be cloned.
JSON 往返（toPlainData）后再克隆                -> OK
```

## 三、改动

| 位置 | 改动 |
| --- | --- |
| `src/shared/utils/domain-learning-plan-draft.ts` | `toSyllabusPayload` 的 `prerequisites` 复制成新数组（`[...(c.prerequisites ?? [])]`）；模块注释写明"只输出纯数据"的硬约束 |
| `src/renderer/src/stores/domain-learning.ts` | IPC 出站口统一纯化：`confirmPlan(toPlainData(p))`、`saveConcept(toPlainData(p))`（复用既有 `utils/plain-data`，与该工具当初为"IPC 传 reactive 崩"而写的缘由同源） |
| `tests/unit/shared/domain-learning-plan-draft.spec.ts` | +1 例：reactive 草稿 → 载荷可结构化克隆，且 prerequisites 内容保持 |
| `tests/unit/renderer/domain-learning/plan-confirm-dialog.spec.ts` | 假 IPC 改为 `structuredClone` 出站参数（与 Electron 同款）；+1 例钉死"确认并生成"载荷可克隆、含前置数组、确认后确实驱动落库轮 |
| `tests/unit/renderer/domain-learning/store-ipc-payload.spec.ts` | 新增：store 两个出站口（confirmPlan / createConceptOf）在 reactive 载荷下可克隆，且请求真的送达 |
| `progress/_dl_plan_root_probe.cjs` | 新增只读排查脚本（列 dl_plan 方案 + 空间，检查 rootConcepts/notes 是否被丢） |

## 四、验证

| 项 | 结果 |
| --- | --- |
| 修复前跑新用例（临时回退两处修复） | ✅ 红：`DataCloneError: [object Array] could not be cloned.`（弹窗 2 例 + store 1 例 + shared 1 例） |
| 修复后 | ✅ 绿：3 个文件 16 例全过 |
| 领域学习全量回归（`tests/unit/core/packs/domain-learning` + `tests/unit/shared/domain-learning-plan-draft` + `tests/unit/renderer/domain-learning`） | ✅ 28 文件 / 287 例全过 |
| `npx vue-tsc --noEmit` 过滤改动文件 | ✅ 无报错（仓库其余既有报错与本次无关） |
| 真库核对（只读 `progress/_dl_plan_root_probe.cjs`） | 见下：唯一一份方案 rootConcepts=0、notes=无 |

## 五、遗留 / 待你验

1. **真人点一遍**：新主题 → 生成首批知识 → 确认理解 → 确认并生成 N 个知识点 → 应不再报错，
   并进入落库轮；手动「新建知识点」顺带也修好了（此前必报同一错）。renderer 侧改动走 HMR，
   若界面没热更就重启 `npm run dev`。
2. **相邻缺陷（本次未改，等你定）**：确认弹窗只渲染 `branches`，`toSyllabusPayload` 也只回传
   `branches`——模型若在方案里给了 `rootConcepts`（不归属分支的根层知识点）或 `notes`，
   用户确认后会被**静默丢掉**（后端 `normalizePlanSyllabus` 拿不到就置空），落库轮便不会建这几个根层点。
   真库现状：唯一一份方案 `rootConcepts=0 / notes=无`，所以今天没有实际损失。
   要修的话建议：草稿带上 `rootConcepts`，弹窗加一个「根层知识点」组（勾选 + ↑↓ 与分支同构），
   载荷原样回传（`notes` 一并带回）。

## 六、附加改动（同一会话）：确认后不再显示方案提示条

用户原话：「知识体系已确认（55 个知识点）——研究时可据此落库，这一行不要。」

- `src/renderer/src/views/domain-learning/DomainLearningSpace.vue`：`planHint` 计算属性里
  `syllabusConfirmed` 分支由「返回常驻文案」改为 `return null` → 已确认后整条提示条不再渲染
  （模板本就是 `v-if="planHint"`）。待确认的三种状态文案不变，仍高亮驱动固定流程。
- 副作用（用户可知）：提示条里的「查看方案」按钮是确认后**唯一**手动回看方案的入口，
  去掉该条后，已确认状态下的方案只能在弹窗待确认时看到。若需要保留回看入口，应在别处
  （如空间页头部）另加一个「查看方案」。
- `planHint` 现在只产出待确认态，所有分支都是 `pending: true`，`.plan-bar.pending` 高亮样式
  与原待确认态完全一致（未改模板与样式，视觉零变化）。
- 该视图（`DomainLearningSpace.vue`）此前无单测覆盖，本次为一处展示分支删除，未新增测试；
  `npx vue-tsc --noEmit` 过滤该文件无报错。
