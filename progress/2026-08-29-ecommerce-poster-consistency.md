# 电商商品海报·商品主体一致性修复（2026-08-29）

## 问题
用户反馈：跑电商商品套图工作流时，**物品外观会发生变化**（同一个商品在不同海报里形/色/材质/logo 对不上）。

## 根因（实测定位，非猜测）
从 SQLite 读取最近 3 次电商套图运行（如 `wfrun_1787587567171_5vr5bo9dj`）的 `workflow_node_runs`，image-gen 节点实际入参显示：

1. **图像模型是生成式**：用户实际选 `qwen-image-2.0`（百炼 `pc_mmxkxgpl_khcf6xrfp`），走 DashScope `multimodal-generation` 端点（`generateImageMultimodal`）。参考图只是被塞进 `content` 数组当**视觉上下文**，模型理解"这是个保温杯"后**重新绘制**，不是"锁定参考图主体、只换背景"的编辑模型。
2. **plan1 是文生图完整描述**（非场景漂移主源）：plan1 systemPrompt 要求"以【商品外观描述段】开头**完整描述商品**"（给出英文 40-70 词外观描述 → 逐字复用 → 交模型重画）。把商品特征**文字化**再生成，信息损失 + 模型自由发挥 → 主体必然漂移。
3. **缺真正主体锁定机制**：无 mask/抠图/合成/编辑模式。`promptExtend:false`（已正确）只阻断扩写，**没有**解决模型重画主体；`seed` 只保证同 prompt 重复，不解决跨图主体一致。
4. **scene 节点本来已是编辑指令式**（`Keep the product in the reference image completely unchanged...`），唯独 plan1 不一致——这正是主图/白底/促销等非场景图漂移的源头。

> 结论：流程默认用"参考图+文字重述→生成式重画"近似一致性，而 `qwen-image-2.0` 无强主体编辑能力，越重画越不像。

## 修复（方案 A：编辑指令式 + 选编辑模型）
采纳用户选定方向，最小改动、对症。

1. **`src/core/database/migrations/builtin-apps/ecommerce-poster.json`**
   - `plan1`（套图规划·非场景）systemPrompt：
     - 删除"写【商品外观描述段】并逐字完整描述商品"的文生图式要求（漂移源）。
     - 改为**图像编辑指令**式：`'Keep the product in the reference image completely unchanged (same shape, color, material, texture, pattern, logo). Only change the background/scene/composition/lighting to: ...'`。
     - 明确"**不要重述商品外观细节**（编辑模型从参考图直接复制主体，重述反而引入偏差）"；只允许改背景/场景/构图/光线/氛围；主体形状/颜色/材质/图案/logo 绝对禁止改变。
     - prompt 输出字段统一为"完整英文图像编辑指令"。
   - `start` 节点图像模型输入加 `description`：提示选支持图像编辑/主体保留的模型（火山 Seedream 4.5/5.0、百炼 Qwen-Image-Edit）。
   - `image-gen` 节点（img1/img2/img3）保持 `promptExtend:false` + `referenceImages` 参考图不变（已正确）。

## 测试（TDD，先红后绿）
新增 `tests/unit/migrations/builtin-app-ecommerce-consistency.spec.ts`（6 例）：
- 图结构通过 `validateGraph`（提示词改动不破坏工作流合法性）。
- 三个视觉规划节点（套图规划/场景设计/场景结构化）都含「Keep the product / completely unchanged / Only change」编辑指令引导语。
- plan1 不再包含「商品外观描述段 / 完整描述商品」文生图式重述，且含「不要重述商品外观」。
- 编辑指令明确只允许改背景/场景/构图/光线，主体形状/颜色/材质/图案/logo 禁止改变。
- 所有 image-gen 节点 `promptExtend===false`。
- 每个 image-gen 节点都传入商品参考图。

`npx vitest run tests/unit/migrations/builtin-app-ecommerce-consistency.spec.ts` → 6 passed。

## 模型建议（实际取景一致性最强）
本轮只改 prompt 不锁模型（模型是运行输入）。要"绝对一致"应实测：
- **首选**：火山 `Doubao-Seedream-4.5` / `Doubao-Seedream-5.0-lite`（本机已配置，`ep-...`），参考图主体保留强、电商场景成熟。
- 其次：百炼 `Qwen-Image-Edit`（需开通，语义编辑/角色一致性最强）。
- 降级：仍用 `qwen-image-2.0` 时，编辑指令式 prompt 也会改善，但做不到绝对一致。

## 生效方式
`builtin_def_ecommerce-poster` 当前 `template_version=1`（未用户接管）→ 应用启动时 `createBuiltinApps` 会用新模板覆盖 `draft/published_graph`。重启 dev server 后重新运行电商套图工作流，在运行界面图像模型选择 Seedream 4.5/5.0 或 Qwen-Image-Edit 即可。

## 待验证
- [ ] 重启 dev server 后，用 Seedream-4.5 实测同一商品多张海报，核对形/色/材质/logo 一致性。

## 实测结果（2026-08-29 二次，Seedream-4.5 已跑通）
用 `dev:debug`（CDP 9222）注入 startRun，参考图 `workflow-uploads/set-tumbler.png`（扁平插画保温杯），输入 main+scene+promo、场景数 3、minimal，跑至"套图逐张确认"(check1) 挂起，共生成 5 张：
- 主图、促销海报、3 张场景图。
- **商品本体一致性大幅改善**：形/雾蓝配色/深蓝盖/白色反光条/浅蓝底座在 5 张图里全部保持（此前 qwen-image 连形/色都会变）——编辑指令式 + Seedream 生效。

### 观测到的次生问题（本轮已修）
1. **场景间风格不统一**：参考图为插画风，但 scene_0(办公桌)/scene_1(地铁) 被"写实化"，scene_2(阳台) 保留插画风 → 主体一致但画风漂移。
   修复：plan1/scenePlan/sceneParse 的 systemPrompt 新增【风格与质感一致】约束——保持参考图整体绘画风格与质感（插画则插画、实拍则照片），不得切换画风。
2. **促销海报英文文案乱码**（"Drendi For tce smanred..."）。
   修复：plan1 新增【画面无文字】约束——图中禁止出现任何文字/字母/品牌字样/乱码，文字交由后期排版。
3. **生成图 JPEG 字节存成 .png 扩展名**（Seedream 返回 jpeg，保存组写死 .png）。
   修复：新增 `src/core/utils/image-format.ts`（detectImageFormat 按魔术字节识别 ext/mime），`image.service.ts` 两处保存按格式定扩展名与 mimeType，不再写死 .png。

### 测试
- `tests/unit/utils/image-format.spec.ts`（7 例）：detectImageFormat 识别 png/jpg/webp/gif/bmp + 兜底。
- `tests/unit/migrations/builtin-app-ecommerce-consistency.spec.ts`（8 例）：新增"风格与质感一致""禁止出现任何文字"断言。

### 下次验证
用户将提供**外形更复杂的物品**重新实测；届时重启 dev:debug 同步新模板（含风格一致/禁文字）后跑一遍即可。
