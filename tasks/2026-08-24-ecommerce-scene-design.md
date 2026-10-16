# 电商套图深化：场景设计环节（可配置场景数 + 用户确认）

> 状态：设计定稿（2026-08-24）
> 目标版本：`ecommerce-poster.json` v2 重构

## 需求

用户要求深化电商套图工作流：
1. 新增「场景设计」环节：根据商品提示词、商品类型、商品图片设计 **n 个场景**（文字描述）
2. **n 可配置**：默认值（经验值）= 4，允许用户在 start 表单修改（范围 1-8）
3. 场景设计后**向用户确认**（必须能看到场景清单）
4. 确认后按场景生成套图

**关键决策（用户已确认）**：场景仅用于「场景图」——主图/白底/促销等仍按原「海报类型×每类数量」生成；**场景图的数量/内容用确认后的 n 个场景**。

## 当前流程 vs 新流程

### 当前
```
start（posterTypes 多选 × countPerType）
 → plan1（一次性规划全部 shots，场景由 LLM 从联想表隐性选）
 → loop1（逐张生成 + 保存，统一归组）
 → report1 → review1 → condSave → end
```
问题：场景数量不可控、场景内容用户看不到也无法确认。

### 新流程
```
start（+ sceneCount 场景数量，默认 4）
 → plan1          llm-chat(jsonMode)：只规划【非 scene 类型】shots（posterTypes 过滤掉 scene）× countPerType
 → scenePlan      llm-chat(jsonMode)：设计 sceneCount 个场景 → { scenes: [{title,desc,scene,prompt,negativePrompt,width,height}] }
 → sceneText      template-transform：scenes → 场景清单 markdown 文本
 → sceneReview    human-review：展示场景清单，用户确认（批准 → 继续；驳回 → 结束）
 → sceneParse     llm-chat(jsonMode)：确认后的清单文本 → { scenes: [...] }（供 loop 遍历）
 → loop1          （遍历 plan1.shots 非场景）→ img1 → saveImg
 → loop2          （遍历 sceneParse.scenes 场景）→ img2 → saveImg2（同组）
 → report1 → review1 → condSave → end
```

## 设计要点

### 1. start 新增输入
```json
{ "key": "sceneCount", "label": "场景数量", "type": "number", "defaultValue": 4, "validation": { "min": 1, "max": 8 } }
```
- 默认 4（电商套图常见：主图场景/办公/居家/户外等）
- 仅影响场景图张数；其余类型仍按 countPerType

### 2. plan1 改造：只规划非场景类型
- systemPrompt 增加：「scene 场景图不在此规划（由场景设计环节负责），仅规划其余所选类型（main/white/promo/detail/social）× 每类数量」
- 若用户只选了 scene，plan1 输出空 shots（loop1 emptyPolicy=skip 跳过）

### 3. scenePlan：场景设计（llm-chat jsonMode）
- 输入：商品信息、产品类型、风格、场景数量 sceneCount
- 输出：`{ scenes: [{ title(中文), desc(中文场景说明), scene, prompt(英文完整图像提示词), negativePrompt, width, height }] }`
- prompt 复用商品外观锁定规则（与 plan1 同源）：外观描述段逐字一致、以参考图为准、只变场景
- 每场景 width/height：场景图用 1024×1024（竖版社媒类可 768×1024，由 LLM 按场景定）

### 4. sceneText：场景清单渲染（template-transform）
- 模板把 scenes 渲染成用户可读的 markdown 清单（中文标题 + 场景说明），供确认展示

### 5. sceneReview：用户确认（human-review）
- payload = sceneText.text（场景清单文本；字符串形态 handler 自动包 {content}）
- interaction 默认（approve 类型）：**批准 → 继续；驳回 → end**
- **前端必须展示送审内容**（本轮补 UX 缺口：review 卡片目前不渲染 payload）

### 6. sceneParse：确认后文本 → 结构化（llm-chat jsonMode）
- 输入：sceneReview.content（确认后清单文本）
- 输出：`{ scenes: [...] }`（与 scenePlan 同结构；LLM 从清单提取场景并补全 prompt）
- 理由：确认环节用户看到的/批准的是「清单文本」，loop 需要结构化数组；即使未来支持编辑文本也能闭环

### 7. 双 loop
- loop1：`listExpression = {{plan1.parsed.shots}}` → img1（参考图 + promptExtend:false）→ saveImg（非场景图，归组）
- loop2：`listExpression = {{sceneParse.parsed.scenes}}` → img2（参考图 + promptExtend:false）→ saveImg2（场景图，**同 groupName 归组**）
- 串联：loop1.loop-done → loop2（normal 边）

### 8. 汇总
- report1 模板：非场景 {{loop1.count}} 张 + 场景 {{loop2.count}} 张
- review1（清单确认）→ condSave（outputMode 分流）→ end

## 前端 UX 缺口（必须补）

**现状**：AppSession 的 review 卡片（approve 类型）只显示「节点 xxx 等待操作」+ 批准按钮，
**不展示送审内容** → 用户确认场景时看不到场景清单，确认无意义。

**修复**：
1. `SessionMessageCard.vue`：review 卡片（非 form/choose）在 `schema.content`（或 payload 文本）
   存在时渲染 markdown 内容（复用 report 的 marked 渲染）
2. 类型注释 `SessionCardMeta.review` 补 `content?: string`（schema 已透传 ev.payload，无需服务端改）

## 验证

- 单元测试：builtin-app-templates 断言更新（start 含 sceneCount、新增节点、双 loop 边）；
  新增「场景链」流程冒烟测试（plan1 非场景 / scenePlan→sceneText→sceneReview→sceneParse 数据结构）
- 真实库同步：dev 启动迁移自动 UPDATE（create-builtin-apps 幂等）
- CDP：审核卡片展示场景清单文本

## 待办
- [ ] 设计文档定稿（本文件）
- [ ] 前端 SessionMessageCard 展示 review payload
- [ ] ecommerce-poster.json v2 重构
- [ ] 测试 + 构建 + 真实库同步验证
