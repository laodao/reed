# 电商详情长图（商品介绍图）2026-08-29

## 需求
电商商品介绍图：结合**卖点 + 规格**，先**规划需要多少张图**，再**逐个生成**，每张图与对应**卖点/规格**匹配并**搭配文字**，最终排版成**竖版详情长图**（电商详情页风格）。

## 实现（新建内置工作流）
`src/core/database/migrations/builtin-apps/ecommerce-detail-long-image.json`（id `builtin_def_ecommerce-detail-long-image`）。

链路：start → detailPlan(llm-chat，卖点×规格→规划 N 张图文清单，N=maxSlides) → loop1 逐张 img1(image-gen 锁参考图商品、体现该卖点/规格) → saveImg1 → buildMd(code 拼图文 markdown) → detailImg(report-image 渲染竖版长图) → save1 → end。

设计要点：
- **先规划后生成**：detailPlan systemPrompt 要求 slides 长度= maxSlides，每张 { title, desc(40-80字说明), prompt(图像编辑指令), negativePrompt }，卖点/规格各成一点、图文对应。
- **商品外观锁定**：prompt 为编辑指令（`Keep the product in the reference image completely unchanged... Only change the background/scene to: ...`），锁参考图商品，仅换体现卖点的背景/场景/道具。
- **卖点视觉化**：高速→气流/飞扬发丝；负离子→柔顺亮泽；温控→温暖氛围；磁吸→圆环/风嘴特写；便携→旅行收纳。
- **禁文字** + **风格与质感一致**（参考图质感）+ **图片规格**（specPreset 竖版比例）。
- 复用 `report-image` 长图渲染（吃 markdown + templateId=generic + width=1080），`local-image://` 配图成功合成进长图。

## 注册
- `create-builtin-apps.ts` BUILTIN_APPS 增加 ecommerce-detail-long-image 项（appId `builtin_app_ecommerce_detail_long_image`，分类 电商）。
- `create-builtin-apps.spec.ts` 内置数量 18/19 → 20。

## 测试
- `tests/unit/migrations/builtin-app-ecommerce-detail.spec.ts`（6 例）：结构校验、start 含 maxSlides/specPreset、详情规划含卖点×规格+编辑指令+禁文字+风格一致、loop 按规划清单、image-gen 锁商品关扩写、code+report-image 存在。
- 与套图一致性 12 例、图片格式 7 例全绿。

## 实测（Seedream-4.5，戴森吹风机，maxSlides=4）
`wfrun_1788016217136_vv6mce3l5` 跑通：detailPlan 规划 4 卖点 → 逐张生成 4 张配图 → buildMd 拼 markdown（`# 商品名` + 每卖点 `## 标题 + ![图](local-image://...) + 说明`）→ detailImg(report-image) 渲染竖版长图 `workflow-reports/wfrun_..._detailImg.png`（1474×7030）→ save1 入库。

**关键验证**：`report-image` 成功把 `local-image://` 配图合成进长图（4 张卖点配图+文字全部呈现），图文对应、商品一致、风格统一。

## 备注
- 配图尺寸当前固定 1080×1080；后续可让 img 宽高跟随 specPreset（竖版平台用竖版比例）。
- 商品外观一致性经编辑指令+Seedream 保障（见 2026-08-29-ecommerce-poster-consistency.md）。
