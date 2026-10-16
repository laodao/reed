# 资产域提示词装配 · 现状 Review（2026-05-09）

## 目的

为接下来"提升生成效果（指令遵循 / 前后一致性）"专项做基线梳理。本文只描绘**当前行为**和**已知问题**，不提改进方案。从资产生成（角色 / 地点 / 物品 主图 + 派生）开始。

---

## 1. 装配链路全景

```
┌─ 渲染端（renderer） ─────────────────────────────────────────────┐
│                                                                  │
│  CharacterGalleryEditor / LocationGalleryEditor / ItemEditor     │
│       │                                                          │
│       │  → generateMainFor(assetType, assetId)                  │
│       │     [src/renderer/src/api/main-image-generator.ts]      │
│       │                                                          │
│       └─→ buildPromptFromEffective(assetType, assetId)          │
│              ├─ effective IPC 取 binding 投影                   │
│              ├─ 拼 name / description / 角色身份块 / appearance │
│              ├─ 加 styleHint（中英双写）                       │
│              ├─ 加 故事背景（年代 / 地域 / 其他）              │
│              ├─ character → appendCharacterConstraints         │
│              │   + mergeCharacterNegative                       │
│              └─ 返回 { prompt, negativePrompt, refImagePath }  │
│                                                                  │
│  LocationGalleryEditor → AddMainImageDialog（spec 2026-05-09）  │
│       └─→ 自身 buildPrompt()                                   │
│              ├─ effective IPC 取 binding 投影                   │
│              ├─ 仅拼 name / description / "视角：<label>"       │
│              ├─ 不加 styleHint                                  │
│              ├─ 不加 故事背景                                   │
│              └─ 不加任何硬约束                                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │  IPC
                              ▼
┌─ 主端（core / electron / web server） ──────────────────────────┐
│                                                                  │
│  ep:asset:image:generate-main → MainImageGeneratorService        │
│       └─ generateMain(input)                                    │
│              ├─ location → appendLocationNoHumanConstraint      │
│              │             + mergeLocationNoHumanNegative        │
│              ├─ character / item → 不再加任何约束（renderer 已加） │
│              ├─ refPaths = [input.referenceImagePath?] 拼一张   │
│              └─ imageGen.generate({ refPaths, prompt, neg })    │
│                                                                  │
│  ep:asset:image:add-main → MainImageGeneratorService             │
│       └─ addAdditionalMain(input)                               │
│              ├─ location → appendLocationNoHumanConstraint       │
│              ├─ character / item → 不加约束                    │
│              └─ imageGen.generate({ refPaths, prompt, neg })    │
│                                                                  │
│  ep:asset:derive:single → GalleryDerivationService               │
│       └─ deriveSingle(input)                                    │
│              ├─ baseImageId 命中 / 默认主图回退 → base.imagePath │
│              ├─ prompt = additionalPrompt ?? `${cat} · ${label}`│
│              ├─ character → appendCharacterConstraints(framing) │
│              │             + mergeCharacterNegative              │
│              ├─ location + angle_variant → appendAngleLightingLock│
│              ├─ location → appendLocationNoHumanConstraint       │
│              ├─ item → 不加任何约束                            │
│              └─ imageGen.generate({ refPaths=[base], prompt, neg })│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                       ImageGenerator (provider)
                       — 真实 image API（DashScope wanx 等）
```

**核心源文件：**
- 渲染端拼装：`src/renderer/src/api/main-image-generator.ts`
- 主端 main 生成：`src/core/modules/episode-production/assets/services/main-image-generator.service.ts`
- 主端派生：`src/core/modules/episode-production/assets/services/gallery-derivation.service.ts`
- 角色硬约束模块：`src/core/modules/episode-production/assets/prompts/character-constraints.ts`
- 地点硬约束模块：`src/core/modules/episode-production/assets/prompts/location-constraints.ts`
- 风格预设：`src/core/modules/episode-production/assets/constants/style-presets.ts`
- AddMainImageDialog（差异装配点）：`src/renderer/src/components/episode-production/stage-asset/location/AddMainImageDialog.vue`

---

## 2. 各场景装配后的最终 Prompt 样例

下面每段先列输入数据假设，再展示 prompt 与 negativePrompt 字面量（以 → 表示后端追加的部分）。

### 2.1 角色主图（generateMainFor，character/location/item 通用入口）

**输入数据（举例）：**
- effective: `{ name: '李白', description: '盛唐诗人，飘逸豪放', alias: '青莲居士', role: '主角', gender: '男', age: 25, race: 'east_asian', appearance: '剑眉星目，蓄须，束发', outfit: '青衣长袍，腰间佩剑', styleAnchors: '["国风工笔","写实"]' }`
- 当前 episode: `{ storyEra: '唐代', storyRegion: '中原', storyBackgroundExtra: '安史之乱前夕' }`
- referenceImagePath: null（用户未上传）

**前端拼装（main-image-generator.ts）：**

```
李白，盛唐诗人，飘逸豪放，别名：青莲居士，定位：主角，性别：男，年龄：25，
人种：东亚（East Asian, Han Chinese / Japanese / Korean facial features），
外貌：剑眉星目，蓄须，束发，服装：青衣长袍，腰间佩剑，
风格：国风工笔（Chinese gongbi painting, fine brush strokes），写实（photorealistic, realistic photo style），
故事年代：唐代，故事地域：中原，故事背景：安史之乱前夕，
直立全身（standing full body, head to toe in frame），
纯色背景（plain solid color background, no scenery, no ground），
无帽子（no hat, no headwear, no hood），
无首饰（no jewelry, no accessories, no earrings, no necklace），
光照与参考图保持一致（match lighting from reference, preserve original lighting intensity），
正面均匀光照、无任何阴影（front flat even lighting, shadowless, no shadow on body, no shadow on background, no ground shadow）
```

**negativePrompt：**

```
hat, cap, hood, helmet, headwear, crown, jewelry, necklace, earrings, accessories,
busy background, complex background, scenery background,
shadow, shadows, cast shadow, ground shadow, floor shadow, wall shadow, body shadow,
harsh shadow, dramatic shadow, dark shadow, silhouette,
strong directional light, hard light, backlight, rim light, side light, spot light,
chiaroscuro, overexposed, underexposed,
cropped, half body, close-up, portrait crop, cut off legs
```

**后端（MainImageGeneratorService.generateMain）追加：** character 不再追加任何文本（character 约束已在前端注入）。

**referenceImagePaths 传给 provider：** `[]`（空，即"无上游参考图"）。

---

### 2.2 地点主图（generateMainFor）

**输入数据：**
- effective: `{ name: '太白楼', description: '临江三层木构酒楼，雕梁画栋', styleAnchors: '["国风工笔"]', referenceImagePath: 'asset-references/lc_x/img.jpg' }`
- 当前 episode: `{ storyEra: '唐代', storyRegion: '江南' }`

**前端拼装：**

```
太白楼，临江三层木构酒楼，雕梁画栋，
风格：国风工笔（Chinese gongbi painting, fine brush strokes），
故事年代：唐代，故事地域：江南
```

**前端 negativePrompt：** 不返回（character 才返回）。

**后端追加（地点全域无人）：**

```
…，场景中不能有任何人物，仅环境本身（no people, empty scene, environment only, uninhabited landscape, no characters present）
```

**negativePrompt 由后端补：**
```
person, people, human, character, figure, portrait, crowd, silhouette, body, man, woman, child, pedestrian
```

**referenceImagePaths：** `['asset-references/lc_x/img.jpg']`（用户上传的参考图）

---

### 2.3 物品主图

**输入数据：** `{ name: '青冥剑', description: '寒铁锻造，剑身泛蓝光', styleAnchors: '["国风工笔"]' }` + 同 episode 故事背景

**前端拼装：**

```
青冥剑，寒铁锻造，剑身泛蓝光，
风格：国风工笔（Chinese gongbi painting, fine brush strokes），
故事年代：唐代，故事地域：中原
```

**negativePrompt：** 无（前端不返回 negative，后端也不加约束）。

**后端追加：** 无任何文本。

**referenceImagePaths：** `[]`。

---

### 2.4 角色派生（deriveSingle，category='view'，label='3q_left'）

**输入数据：** 同 2.1 的角色；`additionalPrompt` 未传

**deriveSingle 内部拼装：**

```
view · 3q_left，
直立全身（standing full body, head to toe in frame），
纯色背景（plain solid color background, no scenery, no ground），
无帽子（no hat, no headwear, no hood），
无首饰（no jewelry, no accessories, no earrings, no necklace），
光照与参考图保持一致（match lighting from reference, preserve original lighting intensity），
正面均匀光照、无任何阴影（front flat even lighting, shadowless, …）
```

**negativePrompt（character 全套）：** 同 2.1。

**referenceImagePaths：** `[base.imagePath]`（默认主图或用户选定的 baseImageId 对应的图）。

> ⚠ 注意：派生 prompt 完全没带 name / description / styleAnchors / 故事背景。

---

### 2.5 地点变体派生（deriveSingle，category='variant'，label='雨夜外观'）

**输入数据：**
- additionalPrompt: '雨水打在屋檐 / 暖光 lantern' （DeriveVariantDialog 用户填的描述）
- baseImageId: 用户选了"正面外景"主图

**内部拼装：**

```
雨水打在屋檐 / 暖光 lantern，
场景中不能有任何人物，仅环境本身（no people, empty scene, environment only, uninhabited landscape, no characters present）
```

**negativePrompt：**

```
person, people, human, character, figure, portrait, crowd, silhouette, body, man, woman, child, pedestrian
```

**referenceImagePaths：** `[base.imagePath]`（用户选定的"正面外景"主图）。

> ⚠ 不加 angle 锁（原 angle_variant 走的锁现在 category='variant' 不再触发；详见 §3）。
> ⚠ 不带 name / description / styleAnchors / 故事背景。

---

### 2.6 地点旧 angle_variant 派生（仅老调用方 / 老数据触发）

```
angle_variant · entrance，
光照与参考图保持一致（match lighting from reference image, identical lighting intensity, same light source direction, same color temperature），
时间不变（same time of day as reference），
天气不变（same weather condition as reference），
仅改变机位视角（only change camera angle, keep all other elements identical），
场景中不能有任何人物，仅环境本身（no people, empty scene, environment only, uninhabited landscape, no characters present）
```

negative：
```
different lighting, lighting change, lighting shift, different time of day, sunrise, sunset, dawn, dusk,
night scene, weather change, rain, snow, fog, storm,
person, people, human, character, figure, portrait, crowd, silhouette, body, man, woman, child, pedestrian
```

> 这条路径在 spec 2026-05-09 之后**只对未迁移的老数据**触发；新派生走 §2.5 的 'variant' category，**不再有 angle 锁**。

---

### 2.7 物品派生

**deriveSingle 内部拼装（category='view'，label='handle_close'，无 additionalPrompt）：**

```
view · handle_close
```

negativePrompt：无。

referenceImagePaths：`[base.imagePath]`。

> 物品 deriveSingle 没有任何硬约束，prompt 极简单（仅 `${category} · ${label}`）。

---

### 2.8 AddMainImageDialog 的 location 主图（spec 2026-05-09 多主图新入口）

**输入：** label='正面外景'，userPrompt='白天平视角度'，metadata: `{ angle: 'entrance' }`

**前端 buildPrompt（dialog 自身）：**

```
太白楼，临江三层木构酒楼，雕梁画栋，视角：正面外景
```

**前端 appendUserPrompt：**

```
太白楼，临江三层木构酒楼，雕梁画栋，视角：正面外景，白天平视角度
```

**后端 addAdditionalMain：** 追加 location 无人约束。

**referenceImagePath：** 取 `eff.referenceImagePath`（用户上传的参考图）。

> ⚠ 此入口**不带** styleAnchors / 故事背景 — 与 generateMainFor 严重分叉（详见 §3）。

---

## 3. 装配点对比 + 已知问题

### 3.1 同一资产同一动作，prompt 内容因入口而异

| 入口 | name+desc | 角色身份块 | styleAnchors | 故事背景 | 角色硬约束 | 地点无人 | refImage | userPrompt |
|---|---|---|---|---|---|---|---|---|
| **角色主图** generateMainFor | ✓ | ✓ 全 | ✓ | ✓ | ✓ | — | binding.refImage | ✗ |
| **地点主图** generateMainFor | ✓ | — | ✓ | ✓ | — | ✓ 后端 | binding.refImage | ✗ |
| **物品主图** generateMainFor | ✓ | — | ✓ | ✓ | — | — | binding.refImage | ✗ |
| **AddMainImageDialog**（仅地点） | ✓（轻量） | — | ✗ | ✗ | — | ✓ 后端 | binding.refImage | ✓ |
| **角色派生** deriveSingle | ✗ | ✗ | ✗ | ✗ | ✓ | — | base 主图 | additionalPrompt |
| **地点变体派生** | ✗ | — | ✗ | ✗ | — | ✓ | base 主图 | additionalPrompt |
| **地点 angle_variant** 派生（旧） | ✗ | — | ✗ | ✗ | — | ✓ + angle锁 | base 主图 | additionalPrompt |
| **物品派生** | ✗ | — | ✗ | ✗ | — | — | base 主图 | additionalPrompt |

**问题：**
1. **AddMainImageDialog 是分叉装配点**：不接 generateMainFor 的成熟 prompt 链，直接 effective → 拼最少几个字段。导致从这个入口生成的多张主图**没有 styleAnchors / 故事背景 / 角色硬约束**，指令遵循质量明显劣于 generateMainFor 主入口。
2. **派生图丢失资产身份信息**：deriveSingle 只用 `${category} · ${label}` 或用户额外 prompt，**不带 name / description / styleAnchors / 故事背景**。所有"前后一致性"完全依赖 referenceImagePaths 让 provider 自己看图复刻，没有文本侧的强 anchor。
3. **物品派生几乎无约束**：物品派生只有 `view · handle_close` 这种粒度，没有 name 也没有任何硬约束。命中率极低，consistency 完全靠 reference 图。

### 3.2 character vs location vs item 三类资产约束严重不对等

- **character**: 有完整身份块 + 硬约束（背景 / 帽饰 / 阴影 / 全身 framing）+ 跨变体共享同一约束
- **location**: 只有"无人"约束 + 老 angle_variant 的光照锁；新 'variant' 派生路径**没有任何角度 / 时间 / 天气一致性约束**（因为旧 angle 锁绑死在 `category === 'angle_variant'` 这个 if 上）
- **item**: 完全没有约束，连"白底"都没要求；每张派生图背景可能完全不同

### 3.3 referenceImage 注入路径混乱

- 主图 `generateMain` 用户上传的 `binding.referenceImagePath` 注入 → 主图视觉沿用用户参考
- `addAdditionalMain` 同样注入 binding 级 refImage —— 但所有多主图都沿用同一张 ref，导致"平面图"和"正面外景"用同一张参考图出图，**主图之间无法差异化**
- 派生 `deriveSingle` 注入 `[base.imagePath]` —— 强制以选定的某张主图作 ref，这是 OK 的

### 3.4 styleAnchors / 故事背景路径单一注入

- 仅 generateMainFor 入口注入；派生（含变体）和 AddMainImageDialog 都没有
- 一旦多主图模型的派生链拉长（主图 → 变体 → 关键帧），style 信息从派生这一环就丢了
- 故事背景信息（年代 / 地域）也只有在主图入口注入，派生图不带

### 3.5 negativePrompt 注入不对等

- character 整套（30+ 关键词）始终注入，主图和派生都有
- location 只有"无人" + 老 angle 锁 negative
- item 完全没 negative
- 用户层面 — 没有任何 UI 让用户填 negativePrompt

### 3.6 Prompt 文本格式特点

- 中文用 `，` 分隔，硬约束用 `（中文（English equivalent））` 双写
- 这种格式对支持中文优先的 provider（如 DashScope wanx）友好
- 对纯英文 provider（如 SD / DALL-E）效果未知 — 中文部分可能被忽略
- 没有 weight 语法（`(keyword:1.2)` 之类），所有关键词等权
- 长度：character 主图最终 prompt 在 600-1500 字符不等；派生 200-800 字符；item 派生 ~30 字符

### 3.7 referenceImagePaths 与文本的耦合断点

- 当 referenceImagePaths 非空时，文本侧的"光照与参考图保持一致"等指令依赖 provider 真的把 ref 看进去
- 没有"reference 强度"控制（如 ControlNet weight），完全交给 provider 内部决策
- character 派生场景：以主图为 ref 派生表情图时，文本侧没有"保持人物特征"的直接指令（只有"约束背景 / 阴影 / framing"，没有"face / hair / body identity preservation"类锚点）

---

## 4. 数据来源链路（effective 投影）

各资产的 `effective` IPC 返回什么字段，决定了 prompt 能拼什么：

**character `effective(bindingId)`**（CharacterAssetService.getEffectiveData）
```ts
{
  name, description, appearance, outfit, voiceId, portraitId,
  source: 'standalone' | 'linked_lw',
  alias, role, gender, age, race,
  styleAnchors: string[],
  outfitsExtra: string[],
  referenceImagePath
}
```

**location `effective(bindingId)`**（LocationAssetService.getEffectiveData）
```ts
{
  name, description,
  source: 'standalone' | 'linked_lw',
  referenceImagePath
}
```
> ⚠ 没有 styleAnchors 投影出来 — 但 main-image-generator.ts 仍试图从 eff.styleAnchors 取（命中 binding 表上的字段直读，因为 effective 没投但调用方 `as any` 取到了）

**item `effective(bindingId)`**（ItemAssetService.getEffectiveData）
```ts
{
  name, description, source,
  styleAnchors: string[],
  referenceImagePath
}
```

> 注意：location 的 effective 接口 type 没有 styleAnchors，但 binding 表上有该列，main-image-generator.ts 用 `eff.styleAnchors as any` 取也能拿到 — 这是一处类型契约漏洞。

---

## 5. 总结：影响生成效果的几个突出点

按"指令遵循"和"前后一致性"两个维度归类（仅观察，不提方案）：

### 指令遵循

1. **AddMainImageDialog 分叉装配** — 多主图入口生成的图在文本侧缺 style + 故事背景，跟主入口生成的视觉差异大
2. **派生图丢失身份信息** — 派生 prompt 几乎只有"label"，name/desc/style 全靠 reference image
3. **物品几乎无约束** — 派生图变化幅度大；主图 prompt 也很简单（无身份 / 硬约束）
4. **没有 weight 语法** — 关键词等权，重要锚点（如"东亚长相"）和次要约束（如"无阴影"）一视同仁
5. **referenceImage 强度无法调** — 多模态 provider 内部权重不可控

### 前后一致性

1. **主图之间不一致**：多主图共用同一张 binding refImage，每张主图差异只靠 user direction 文字，没有物理参考差异
2. **变体不锁参考维度**：location 的新 'variant' category 没有继承老 angle_variant 的"光照锁 / 时间锁 / 天气锁"
3. **派生不带 styleAnchors**：派生时 style 信息从文本侧消失，只能希望 reference image 视觉本身已经体现风格
4. **跨剧集不一致**：故事背景（年代 / 地域）只在主图主入口注入，派生时丢掉 → 同一资产在不同剧集环境下派生图无差别
5. **角色身份硬约束没有跨变体串联**：deriveSingle 中 character framing 由 category 决定（expression→上半身，其他→全身），但"保持人脸 / 发色 / 体型"这类身份保持文本约束完全没有

---

## 6. 关键文件 / 函数索引（备改造时定位）

```
src/renderer/src/api/main-image-generator.ts
  - generateMainFor(assetType, assetId)
  - buildPromptFromEffective(...)
  - describeCharacterRace(...)
  - parseStyleAnchors(...)
  - readStoryBackgroundFromCurrentEpisode(...)

src/core/modules/episode-production/assets/services/main-image-generator.service.ts
  - MainImageGeneratorService.generateMain(input)
  - MainImageGeneratorService.addAdditionalMain(input)

src/core/modules/episode-production/assets/services/gallery-derivation.service.ts
  - GalleryDerivationService.deriveSingle(input)
  - GalleryDerivationService.deriveBatch(input)

src/core/modules/episode-production/assets/prompts/character-constraints.ts
  - appendCharacterConstraints / mergeCharacterNegative / framingForCategory
  - characterConstraintSuffix / characterConstraintNegative

src/core/modules/episode-production/assets/prompts/location-constraints.ts
  - appendAngleLightingLock / mergeAngleLightingNegative
  - appendLocationNoHumanConstraint / mergeLocationNoHumanNegative

src/core/modules/episode-production/assets/constants/style-presets.ts
  - STYLE_PRESETS / STYLE_EN_HINT / buildStylePromptHint

src/renderer/src/components/episode-production/stage-asset/location/AddMainImageDialog.vue
  - buildPrompt() — 分叉装配点

src/core/modules/episode-production/assets/services/character-asset.service.ts
  - getEffectiveData(bindingId)
src/core/modules/episode-production/assets/services/location-asset.service.ts
  - getEffectiveData(bindingId)  — type 不含 styleAnchors
src/core/modules/episode-production/assets/services/item-asset.service.ts
  - getEffectiveData(bindingId)
```

---

## 7. 后续讨论起点

要从这份基线推进"指令遵循 + 前后一致性"专项，下一步建议先讨论：

- AddMainImageDialog 收口到 `generateMainFor` 标准链路，消除分叉
- 派生 prompt 是否要把 `name + description + styleAnchors` 自动带上（哪怕用户填了 additionalPrompt，也作为底色）
- 多主图共用 binding refImage 是否合理；是否应该在 dialog 让用户单独上传/不传 refImage
- character 派生加"身份保持"硬约束（face identity / hair / build preservation）
- location 'variant' 派生是否需要恢复"光照 / 时间 / 天气"维度锁（按 metadata 决定要不要锁）
- item 是否需要类似 character 的硬约束 + 身份保持文本

这些是后续 review 的入口。
