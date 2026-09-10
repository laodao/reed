# agent-harness 平台缺口交接:pack 工具命名空间冒号被 LLM API 拒绝

日期:2026-09-09 · 分支 feat/domain-learning(M3-A ③,不改平台,仅交接)

## 现象

宿主把工具清单交给 OpenAI 兼容 provider 时,若工具名含冒号(registry 为业务包工具强制命名空间
`pack:<packId>:<name>`),provider 返回 400:
`Invalid 'tools[0].function.name': string does not match pattern '^[a-zA-Z0-9_-]+$'`
(DeepSeek/OpenAI 系都按 `^[a-zA-Z0-9_-]{1,64}$` 校验 function name)。

## 根因链(代码位置)

- `src/core/platform/agent-runtime/tools/registry.ts`:
  - `register(def, { packId })` → `name = \`pack:${packId}:${def.name}\``(line ~265),spec.name 即带冒号全名;
  - `listSpecs/toLLMTools` 直接序列化 `spec.name`(line ~319-326)给 LLM;
  - `buildToolDefs(bindings)` 以 `spec.name`(namespaced)为 key,`loop` 收到的 function name 也是 namespaced;
- `src/core/platform/workflow/nodes/agent-loop-node.ts` 经 `registry.toLLMTools` 透传给 provider(命名不二次加工);
- 影响宿主:EP(ep-agent-tools 以 `{ packId: EP_AGENT_PACK_ID }` 注册)、LW(同构)、dl(最初也如此,M1 已绕行)。

## 现绕行(已落地,勿回退)

- `src/core/packs/domain-learning/services/dl-agent-tools.ts`:dl 工具**以裸名注册**(`registry.register(def, { source: 'tool' })`),
  `dl_` 前缀天然防跨包冲突;工具归属语义由 source 域 + 注释表达(文件头注释已记录缺口背景)。
- 对业务包注册语义的影响:注册表里的 source='tool' 与 source='pack' 在 unregister-by-pack / 审计面上的差异需一并评估。

## 建议修复方向(供 agent-harness 维护者评估,非本包范围)

1. 方案 A(推荐):registry 保持内部 namespaced(`spec.name=pack:x:y`)做审计/冲突,但在 **LLM 面**给别名:
   `toLLMTools` 对 namespaced 工具输出 `name=def.name`(裸名);binding/执行时由 registry 把裸名解析回注册项
   (buildToolDefs 也按裸名 key 出协议层名称,执行仍走注册表查 namespaced 项)。
2. 方案 B:pack 工具不再拼前缀,改由注册表维护 (packId,name) 元数据 + 全名唯一校验(裸名冲突则告警),
   类似 `source='tool'` 现状但保留 pack 归属。
3. 无论哪种:补一条回归——LLM 协议层名字全部匹配 `^[a-zA-Z0-9_-]+$`,且 pack 注销/审计仍按 packId 生效。

## 复验口径(修复后)

- EP/LW/dl 三宿主各跑一轮真实 tool 调用不再 400;
- `registry.unregisterByPack(packId)` 仍能整包注销;审计 log 保留 packId 归属;
- 现有 dl 裸名绕行可回退为正式注册语义(待平台修复合入后再动)。
