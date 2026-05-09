# 资产生成 · 客观 review（2026-05-09）

## 上下文

用户反馈三个核心痛点：

1. 资产生成效果不好
2. 过程不透明，找不出原因
3. 设定卡字段是不是太多

要求：客观判断（不附和），目标 ① 高质量输出 ② 使用便捷 ③ 逻辑清晰。

本次 review 在已有的 [asset-prompt-assembly-review](./2026-05-09-asset-prompt-assembly-review.md) 之后写成，部分结论会**纠正自己**之前的修复方向。

---

## 1. 字段问题 — 现状盘点

`CharacterCardFormV2.vue` 当前 11 个字段，按生成质量贡献排序：

| 字段 | 用户填写难度 | 真实生成质量贡献 | 评价 |
|---|---|---|---|
| **人物描述**（自由文本）| 高 | **极高** | **唯一真正决定外观的核心字段** |
| 参考图（上传）| 中 | 高 | reference image is king |
| 风格（多选）| 低 | 高 | 真有用 |
| 人种 | 低 | 高 | 关键 visual anchor |
| 性别 | 低 | 中 | 真有用 |
| 年龄 | 低 | 中 | AI 翻译成视觉特征 |
| 形象库 portrait_id | 中 | 中 | 取决于系统是否真接通 |
| 姓名 | 低 | 0（不影响画面）| 数据库识别用，进 prompt 是 noise |
| 别名 | 低 | 0 | 数据库识别用，进 prompt 是 noise |
| **定位（主角/配角/...）**| 极低 | **0** | 叙事概念非视觉概念，AI 不知道"主角"长什么样，纯 noise |
| 声音 | 低 | 0（音频域）| 跟图像生成无关，混在同一卡迷惑用户 |

**真实情况**：11 个字段里**真正影响生成质量的只有 4 个**（人物描述 / 风格 / 人种 / 参考图）。其他字段要么是 noise（姓名/别名/定位），要么次要（性别/年龄），要么不在图像域（声音）。

**但字段多本身不是核心矛盾**：长篇剧集需要 character bible 沉淀这些信息（叙事 / 调度 / 配音都用得上）。问题在于**这些字段被无差别拼到生成 prompt** —— 这才是稀释 AI 注意力的根源。

---

## 2. 真正的根因：技术路线落后

我看了 2026 年在跑的工具（即梦 / 剧火 / 纳米漫剧 / Catimind / 有戏 / BigBanana / LocalMiniDrama），他们一致性都不靠 prompt 文字 anchor，而是 **latent-level conditioning** 技术：

| 行业主流方案（2026） | 我们当前 |
|---|---|
| **IP-Adapter FaceID Plus v2** — 人脸 embedding 直接注入 cross-attention | 把"严格保持人物身份特征，同一脸型..."等 30+ 词文字塞进 prompt |
| **LoRA fine-tuning** — 5-20 张同角色图训角色专属 LoRA | 完全没有 |
| **Midjourney V7 Omni Reference** — provider 原生 subject 概念 | 没用上（Omni 是 v7 标配）|
| **ControlNet / Reference-only** — ref 图过 ControlNet 编码作为 latent guidance | reference image 只作为 ref images 数组传，没明确 ControlNet |
| **Subject Library**（KlingO1/O3）— provider 原生 subject 持久化 | 我们传 ref image 数组，没用 subject 概念 |

**关键认知**：靠 prompt 文本加身份保持词的做法，本质是 **2024 年 SD 1.5 时代的方法**。2026 年 SOTA 模型（Seedance 2.0 / Kling O3 / Lib Image）原生支持多模态参考 + subject embedding，**文本 anchor 在新模型上是过度设计的辅助而不是主力**。

### 我自己的过度工程

[asset-prompt-assembly-review.md](./2026-05-09-asset-prompt-assembly-review.md) 修复时，给 character 派生加了"严格保持脸型/五官/肤色/发色/体型/身高/气质"等中英双写硬约束（commit `c0a76fea`）。

**客观说**：在新模型时代这种文本约束的边际效益接近 0。同一张参考图给 Seedance 2.0 + 简单 prompt 出的图，比带 30+ 词身份保持约束出的图更稳。我之前那个 commit 是把 2024 年的方法论强加到 2026 年模型上 —— **应当撤回**。

---

## 3. 透明度问题 — 用户痛点合理

现状：用户点"生成主图"→ 等几秒 → 出图。如果不好，看不到：

- ❌ 实际发出去的 prompt 全文（硬约束 / 故事背景 / styleHint 拼了什么）
- ❌ 实际用了什么模型 / 模型版本
- ❌ referenceImagePath 真传了没（参考图链路是否生效）
- ❌ provider 耗时 / 返回错误码 / 中间状态
- ❌ 不能 diff 两次生成（这次 vs 上次的差异）
- ❌ negativePrompt 完全黑盒

**关键观察**：后端**已经把 prompt / negativePrompt 落库到 asset_image 表**（仓库写入路径见 `MainImageGeneratorService.generateMain`、`addAdditionalMain`、`GalleryDerivationService.deriveSingle`）。**数据有了，UI 没用上**。这是低成本高回报修复，而不是工程量问题。

### LocalMiniDrama 的做法（开源参考）

- 每步最多重试 3 次
- 执行过程展示当前步骤与**完整错误日志**
- AI 配置 "一键测试连接"
- 9 个内置提示词模板用户可看可改
- 集成 `jsonrepair` 自动修复 AI 畸形输出

我们目前**零透明度**，用户和后端是黑盒接口。

---

## 4. 行业对照（不是抄，是验证）

### 4.1 即梦 + Seedance 2.0

- 用户上传 1 张参考图 → 95% 跨集一致性
- 没有"人物描述要写多详细"这种负担
- 提供正/侧/背三视图 + 场景四视图作为 character bible
- 修改一次资产 → 全剧数千镜头自动同步

### 4.2 Catimind / BigBanana

- "角色立绘锁定" — 第一张图定下来后整部剧用这一张作为 reference 锚点
- 风格参考图 + 角色立绘组合 → 项目级风格统一
- 用户**不需要填 metadata**

### 4.3 LocalMiniDrama（开源）

- AI 自动从剧本提取角色 — 用户不用一个个手填字段
- 简单字段：name + description + image。不区分姓名 / 别名 / 定位 / 人种 / 性别 / 年龄
- prompt 完全透明可改

### 4.4 工业级（齐运三角等头部）

- IP-Adapter FaceID Plus v2 强制脸部特征注入
- LoRA fine-tuning 训角色专属模型（适合长内容 / IP 矩阵）

---

## 5. 我们犯的真实错误

1. **数据 metadata 和生成 prompt 没解耦**
   - 姓名 / 别名 / 定位是叙事 metadata，应该只用于剧本上下文 / 选角 / 调度
   - 不该进图像生成 prompt
   - 当前实现把 11 个字段无差别拼成一段长文本喂给 image gen，AI 注意力被稀释

2. **依赖文本 anchor 做一致性 — 路线错误**
   - 在 2024 年 SD 1.5 时代是合理的；2026 年 SOTA 模型时代是过度工程
   - 主流模型已经原生支持多模态参考、subject embedding、IP-Adapter

3. **没有透明窗口让用户 debug**
   - 数据已经落库，UI 没暴露
   - 用户不能 self-debug，也不能 diff 两次生成

4. **字段输入门槛高 + 帮助有限**
   - 用户填完 11 个字段后效果可能还不如他什么都不填只上传一张参考图
   - 大众用户负担大，专业用户得到的也不是 character bible（因为 metadata 进了 prompt）

---

## 6. 修正建议

### P0 — 立即可做、影响极大

1. **数据 metadata 与生成 prompt 解耦**
   - 姓名 / 别名 / 定位**不进**图像生成 prompt
   - 只把 visual-relevant 字段（性别 / 年龄 / 人种 / 人物描述 / 风格 / 故事背景）送给 image gen
   - 实施位置：`core/.../prompts/asset-identity-prompt.ts`（已建的共享模块）改写
   - **预期**：prompt 字符数减半，AI 注意力聚焦视觉相关，质量直接提升

2. **"生成详情"透明面板**
   - 每张生成图右键 / hover "查看生成详情"
   - 展示：完整 prompt / negativePrompt / 用了什么模型 / 用了哪张 ref image / 生成耗时
   - asset_image 表已有 `prompt / negativePrompt` 字段（已落库），UI 展示就够
   - **预期**：用户能 self-debug；客服支持成本下降

3. **字段重新分组**
   - 把"人物描述 / 风格 / 参考图"提到上方核心区
   - "姓名 / 别名 / 定位 / 声音"下沉到折叠区或单独 metadata 卡
   - 视觉上让用户知道"这几个字段决定生成效果"

4. **撤回 character 派生的"30+ 词文本身份保持约束"**
   - 我上一轮加的过度工程
   - 改成只保留少量核心约束（"保持人脸特征 same face"等一两句话）
   - 让 reference image 主导一致性
   - **代码位置**：`character-constraints.ts` 的 `IDENTITY_PRESERVATION_SUFFIX` / `IDENTITY_PRESERVATION_NEGATIVE` 大幅缩减

### P1 — 重要但需要工程

5. **provider 能力探测 + 走原生 subject 路径**
   - capability matcher 加"是否支持 subject"维度
   - KlingO1/O3 / Midjourney Omni Reference 等支持时走 subject API
   - 不支持时降级到通用 prompt + ref image
   - **预期**：在主流模型上一致性大幅提升（即梦 95% 数据就是这条路径）

6. **AI 自动从描述提取字段**（LocalMiniDrama 同款）
   - 用户在"人物描述"自由文本里写完 → 点"AI 自动提取" → LLM 抽出姓名 / 性别 / 年龄 / 人种 / 关键视觉特征 → 自动填字段
   - 用户改自己想改的，其他默认接受
   - **预期**：填字段从"用户工作"变成"AI 工作 + 用户审核"
   - 我们已有 `enrichSettings` 服务（spec 2026-05-07），现在是反向（从已生成图反推）；要加正向（从描述正向提取）

### P2 — 长期

7. **LoRA fine-tuning 入口**
   - 用户给某角色 5-20 张图 → 一键训练角色 LoRA
   - 后续生成自动加载该 LoRA
   - 多数用户不需要，但长 IP 矩阵 / 高质量短剧需要

8. **生成历史 diff**
   - 同一资产连续生成多次，UI 提供"diff 上一次"按钮
   - 显示 prompt 字面差异 / 模型差异 / ref 图差异
   - 让用户能对比着调

---

## 7. 元反思

我之前两份 review 的方向**不全对**：

- [asset-prompt-assembly-review](./2026-05-09-asset-prompt-assembly-review.md) 的修复（"派生加身份保持文本约束"等）是 **2024 年方法论** —— 在新模型时代部分是负优化
- [libtv-xiaoyunque-comparison](./2026-05-09-libtv-xiaoyunque-comparison.md) 的"摄像机参数化 / 运镜命名预设 / 打光命名预设"等仍然有效（这些不是身份一致性，是镜头语言）

**根本错误**：我把"加更多 prompt 约束"当成了一致性提升的方法，没意识到当前 SOTA 模型（2026 年）原生支持 subject embedding，**文本约束的边际收益在迅速下降，老办法在新模型时代是负优化**。

正确的 2026 年方法论应该是：
- **文本 prompt 聚焦"这个镜头要画什么"**（视觉内容描述）
- **一致性靠 latent conditioning**（reference image / subject / LoRA）
- **metadata 只用于叙事调度**，不进生成 prompt
- **透明度暴露给用户**，让他们 self-debug

---

## 来源

- [LocalMiniDrama - 开源 AI 短剧工具](https://github.com/xuanyustudio/LocalMiniDrama)
- [2026 AI 漫剧 5 大平台实测报告](https://www.cnblogs.com/zhixingyun/p/19900092)
- [AI 漫剧工具链工业化实践（腾讯云）](https://cloud.tencent.com/developer/article/2647810)
- [当 Seedance 2.0 遇上剧火 AI（腾讯新闻）](https://news.qq.com/rain/a/20260408A07CIB00)
- [2026 AI 漫剧趋势报告（36 氪）](https://36kr.com/p/3744995470786816)
- [LibTV 使用指南（用户提供 docx 导出）](#)
